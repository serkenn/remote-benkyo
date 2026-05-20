import asyncio
import json
import logging
import os
import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import AppConfig
from ..schemas import AuthStatusResponse, OkResponse
from ..services.claude import claude_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

# Single-user OAuth flow state (in-memory)
_state: dict = {"status": "idle", "url": None, "proc": None}


# ---------------------------------------------------------------------------
# Credential discovery
# ---------------------------------------------------------------------------

def _claude_home() -> Path:
    # When running as claudeuser (via entrypoint.sh su), HOME is set correctly.
    # Fall back to /home/claudeuser if HOME is still /root for some reason.
    home = os.environ.get("HOME", "")
    if home and home != "/root":
        return Path(home) / ".claude"
    return Path("/home/claudeuser") / ".claude"


def _is_real_token(val: object) -> bool:
    """A real token is a single-word string with no whitespace, length > 20."""
    if not isinstance(val, str):
        return False
    val = val.strip()
    return len(val) > 20 and "\n" not in val and " " not in val and "\t" not in val


def _extract_tokens_from_dict(data: dict) -> list[str]:
    """Recursively extract all string values that look like real tokens."""
    token_fields = {
        "accessToken", "access_token", "apiKey", "api_key",
        "ANTHROPIC_API_KEY", "token", "oauthToken", "sessionToken",
        "bearerToken", "authToken",
    }
    found = []

    def _walk(obj: object, depth: int = 0) -> None:
        if depth > 5:
            return
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k in token_fields and _is_real_token(v):
                    found.append(v.strip())
                else:
                    _walk(v, depth + 1)
        elif isinstance(obj, list):
            for item in obj:
                _walk(item, depth + 1)

    _walk(data)
    return found


_SENTINEL = "claude-code-auth"


async def _find_stored_credentials() -> Optional[str]:
    """
    Check if Claude Code credential files exist and contain OAuth data.
    Returns a sentinel string (not the actual token) because the OAuth
    accessToken is for claude.ai, not the Anthropic API — actual API
    calls go through the Claude Code CLI subprocess.

    NOTE: We do NOT run CLI commands like 'claude auth token' or
    'claude config get api_key'. These are interpreted by Claude Code's
    AI and return chatbot responses instead of actual token values.
    """
    claude_home = _claude_home()

    # Candidate file list (order matters — try most specific first)
    candidates: list[Path] = [
        claude_home / ".credentials.json",
        claude_home / "credentials.json",
        claude_home / "config.json",
        claude_home / "settings.json",
        Path(os.environ.get("HOME", "/root")) / ".config" / "anthropic" / "credentials.json",
        Path("/root/.config/anthropic/credentials.json"),
    ]

    # Also glob all JSON files in ~/.claude/ (including hidden ones)
    try:
        candidates += list(claude_home.glob("*.json"))
        candidates += list(claude_home.glob(".*.json"))
    except Exception:
        pass

    seen: set[Path] = set()
    for path in candidates:
        if path in seen or not path.exists():
            continue
        seen.add(path)
        try:
            data = json.loads(path.read_text())
            logger.info("[claude-auth] Scanning %s → top-level keys: %s", path.name, list(data.keys())[:15])
            tokens = _extract_tokens_from_dict(data)
            if tokens:
                logger.info("[claude-auth] Found Claude credentials in %s — returning auth sentinel", path.name)
                return _SENTINEL  # Actual API calls use claude CLI subprocess
        except Exception as exc:
            logger.debug("[claude-auth] Could not read %s: %s", path, exc)

    # Last resort: environment variable (real Anthropic API key)
    env_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if _is_real_token(env_key):
        logger.info("[claude-auth] Using ANTHROPIC_API_KEY env var")
        return _SENTINEL

    logger.warning("[claude-auth] No credential found in any file. Contents of %s:", claude_home)
    try:
        for p in claude_home.iterdir():
            logger.warning("[claude-auth]   %s (%d bytes)", p.name, p.stat().st_size)
    except Exception:
        pass

    return None


async def _store_token(db: AsyncSession, token: str) -> None:
    result = await db.execute(select(AppConfig).where(AppConfig.key == "anthropic_api_key"))
    config = result.scalar_one_or_none()
    if config:
        config.value = token
    else:
        config = AppConfig(key="anthropic_api_key", value=token)
        db.add(config)
    await db.commit()
    logger.info("[claude-auth] Auth sentinel stored in DB")


# ---------------------------------------------------------------------------
# Background OAuth runner
# ---------------------------------------------------------------------------

async def _run_oauth_flow() -> None:
    global _state
    env = {**os.environ, "BROWSER": "none", "ANTHROPIC_NO_BROWSER": "1"}
    url_re = re.compile(r"https://\S+")

    for cmd in [["claude", "auth", "login"], ["claude", "login"]]:
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env=env,
            )
            _state["proc"] = proc

            async for raw in proc.stdout:
                line = raw.decode("utf-8", errors="replace").strip()
                logger.info("[claude-auth] %s", line)
                m = url_re.search(line)
                if m and not _state["url"]:
                    _state["url"] = m.group().rstrip(".,)")
                    _state["status"] = "pending"

            await proc.wait()
            _state["proc"] = None
            if proc.returncode == 0:
                _state["status"] = "complete"
                return
        except FileNotFoundError:
            logger.warning("[claude-auth] command not found: %s", cmd[0])
        except Exception as exc:
            logger.exception("[claude-auth] %s", exc)

    _state["status"] = "error"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/status", response_model=AuthStatusResponse)
async def get_status(db: AsyncSession = Depends(get_db)) -> AuthStatusResponse:
    token = await claude_service.get_token(db)
    return AuthStatusResponse(authenticated=token is not None)


@router.post("/start")
async def start_login() -> dict:
    global _state

    if _state["status"] == "pending" and _state["url"]:
        return {"status": "pending", "url": _state["url"]}
    if _state["status"] == "complete":
        return {"status": "complete", "url": None}

    _state = {"status": "starting", "url": None, "proc": None}
    asyncio.create_task(_run_oauth_flow())

    for _ in range(40):
        await asyncio.sleep(0.5)
        if _state["url"] or _state["status"] in ("complete", "error"):
            break

    return {"status": _state["status"], "url": _state["url"]}


class CodePayload(BaseModel):
    code: str


@router.post("/code")
async def submit_code(payload: CodePayload) -> dict:
    global _state
    proc = _state.get("proc")
    if proc is None or proc.stdin is None:
        return {"ok": False, "error": "No active login process"}
    try:
        proc.stdin.write((payload.code.strip() + "\n").encode())
        await proc.stdin.drain()
        return {"ok": True}
    except Exception as exc:
        logger.exception("[claude-auth] stdin write failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@router.get("/poll")
async def poll_login(db: AsyncSession = Depends(get_db)) -> dict:
    global _state

    creds = await _find_stored_credentials()
    if creds:
        valid = await claude_service.validate_token(creds)
        if valid:
            await _store_token(db, creds)
            _state["status"] = "complete"
            return {"authenticated": True}

    if _state["status"] == "complete":
        return {"authenticated": False, "error": "認証完了しましたが認証情報が見つかりません"}

    return {"authenticated": False, "status": _state["status"]}


@router.delete("/token", response_model=OkResponse)
async def delete_token(db: AsyncSession = Depends(get_db)) -> OkResponse:
    global _state
    result = await db.execute(select(AppConfig).where(AppConfig.key == "anthropic_api_key"))
    config = result.scalar_one_or_none()
    if config:
        await db.delete(config)
        await db.commit()
    _state = {"status": "idle", "url": None, "proc": None}
    return OkResponse(ok=True)
