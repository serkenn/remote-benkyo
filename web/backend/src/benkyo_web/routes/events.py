"""Events routes."""

from __future__ import annotations

import sqlite3
from typing import Any

from litestar import Controller, get
from litestar.di import Provide

from benkyo import repository as repo
from benkyo_web.database import get_connection


class EventController(Controller):
    path = "/api/events"
    dependencies = {"db": Provide(get_connection, sync_to_thread=True)}

    @get()
    def list_events(
        self,
        db: sqlite3.Connection,
        project_id: str | None = None,
        kind: str | None = None,
        since: str | None = None,
        until: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        return repo.list_events(
            db,
            project_id=project_id,
            kind=kind,
            since=since,
            until=until,
            limit=limit,
        )
