import asyncio
import json
import logging
import os
import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import AppConfig
from ..schemas import AuthStatusResponse, OkResponse
from ..services.claude import claude_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

# Single-user OAuth flow state (in-memory)
_state: dict = {"status": "idle", "url": None}


# ---------------------------------------------------------------------------
# Credential discovery
# ---------------------------------------------------------------------------

def _claude_home() -> Path:
    return Path(os.environ.get("HOME", "/root")) / ".claude"


async def _find_stored_credentials() -> Optional[str]:
    """Try multiple strategies to find the Claude API key after OAuth."""

    # Strategy 1: claude config get api_key
    for cmd in [
        ["claude", "config", "get", "api_key"],
        ["claude", "auth", "token"],
    ]:
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
            if proc.returncode == 0:
                key = out.decode().strip()
                if key.startswith("sk-ant-"):
                    return key
        except Exception:
            pass

    # Strategy 2: scan credential files
    candidates = [
        _claude_home() / "credentials.json",
        _claude_home() / ".credentials.json",
        _claude_home() / "config.json",
        Path("/root/.config/anthropic/credentials.json"),
        Path(os.environ.get("HOME", "/root")) / ".config" / "anthropic" / "credentials.json",
    ]
    for path in candidates:
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text())
            for field in ["api_key", "ANTHROPIC_API_KEY", "token", "access_token", "apiKey"]:
                val = data.get(field, "")
                if val and isinstance(val, str) and len(val) > 10:
                    return val
        except Exception:
            pass

    # Strategy 3: env var written by claude
    env_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if env_key.startswith("sk-ant-"):
        return env_key

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


# ---------------------------------------------------------------------------
# Background OAuth runner
# ---------------------------------------------------------------------------

async def _run_oauth_flow() -> None:
    global _state
    env = {**os.environ, "BROWSER": "none", "ANTHROPIC_NO_BROWSER": "1"}
    url_re = re.compile(r"https://\S+")

    # Try subcommands in order
    for cmd in [["claude", "auth", "login"], ["claude", "login"]]:
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env=env,
            )

            async for raw in proc.stdout:
                line = raw.decode("utf-8", errors="replace").strip()
                logger.info("[claude-auth] %s", line)
                m = url_re.search(line)
                if m and not _state["url"]:
                    _state["url"] = m.group().rstrip(".,)")
                    _state["status"] = "pending"

            await proc.wait()
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
    """Start Claude OAuth login flow. Returns the URL the user should visit."""
    global _state

    # Return existing pending URL if available
    if _state["status"] == "pending" and _state["url"]:
        return {"status": "pending", "url": _state["url"]}
    if _state["status"] == "complete":
        return {"status": "complete", "url": None}

    _state = {"status": "starting", "url": None}
    asyncio.create_task(_run_oauth_flow())

    # Wait up to 20 s for the URL to appear
    for _ in range(40):
        await asyncio.sleep(0.5)
        if _state["url"] or _state["status"] in ("complete", "error"):
            break

    return {"status": _state["status"], "url": _state["url"]}


@router.get("/poll")
async def poll_login(db: AsyncSession = Depends(get_db)) -> dict:
    """Poll whether OAuth completed and credentials are stored."""
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
    _state = {"status": "idle", "url": None}
    return OkResponse(ok=True)
