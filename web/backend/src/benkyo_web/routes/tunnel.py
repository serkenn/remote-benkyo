"""Cloudflare Tunnel management routes."""

from __future__ import annotations

import base64
import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from litestar import Controller, delete, get, post
from litestar.exceptions import HTTPException

SETTINGS_PATH = Path(os.environ.get("BENKYO_SETTINGS", "/data/settings.json"))
COMPOSE_FILE = Path(os.environ.get("COMPOSE_FILE", "/app/docker-compose.yml"))


def _load_settings() -> dict[str, Any]:
    if SETTINGS_PATH.exists():
        try:
            return json.loads(SETTINGS_PATH.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _save_settings(data: dict[str, Any]) -> None:
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def _get_tunnel_status() -> dict[str, Any]:
    settings = _load_settings()
    token_set = bool(settings.get("tunnel_token_b64"))

    running = False
    container_status = "not_started"
    if token_set:
        try:
            result = subprocess.run(
                ["docker", "compose", "-f", str(COMPOSE_FILE),
                 "--profile", "tunnel", "ps", "--format", "json", "cloudflared"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0 and result.stdout.strip():
                info = json.loads(result.stdout.strip().splitlines()[0])
                container_status = info.get("State", "unknown").lower()
                running = container_status == "running"
        except Exception:
            container_status = "unknown"

    return {
        "token_set": token_set,
        "running": running,
        "container_status": container_status,
    }


def _write_env_file(token: str | None) -> None:
    env_path = COMPOSE_FILE.parent / ".env"
    lines: list[str] = []
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if not line.startswith("CLOUDFLARE_TUNNEL_TOKEN="):
                lines.append(line)
    if token:
        lines.append(f"CLOUDFLARE_TUNNEL_TOKEN={token}")
    env_path.write_text("\n".join(lines) + "\n")


def _start_tunnel(token: str) -> None:
    _write_env_file(token)
    subprocess.Popen(
        ["docker", "compose", "-f", str(COMPOSE_FILE),
         "--profile", "tunnel", "up", "-d", "cloudflared"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def _stop_tunnel() -> None:
    _write_env_file(None)
    subprocess.Popen(
        ["docker", "compose", "-f", str(COMPOSE_FILE),
         "--profile", "tunnel", "stop", "cloudflared"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


@dataclass
class SetTokenDTO:
    token: str


class TunnelController(Controller):
    path = "/api/tunnel"

    @get("/status")
    def get_status(self) -> dict[str, Any]:
        return _get_tunnel_status()

    @post("/token", status_code=200)
    def set_token(self, data: SetTokenDTO) -> dict[str, Any]:
        token = data.token.strip()
        if not token:
            raise HTTPException(status_code=400, detail="token must not be empty")
        settings = _load_settings()
        settings["tunnel_token_b64"] = base64.b64encode(token.encode()).decode()
        _save_settings(settings)
        try:
            _start_tunnel(token)
        except Exception as e:
            return {"ok": True, "warning": f"Token saved but could not start tunnel: {e}"}
        return {"ok": True}

    @delete("/token", status_code=200)
    def delete_token(self) -> dict[str, Any]:
        settings = _load_settings()
        settings.pop("tunnel_token_b64", None)
        _save_settings(settings)
        try:
            _stop_tunnel()
        except Exception as e:
            return {"ok": True, "warning": f"Token removed but could not stop tunnel: {e}"}
        return {"ok": True}
