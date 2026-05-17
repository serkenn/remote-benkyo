"""Concept list routes."""

from __future__ import annotations

import sqlite3
from typing import Any

from litestar import Controller, get
from litestar.di import Provide

from benkyo import repository as repo
from benkyo_web.database import get_connection


class ConceptController(Controller):
    path = "/api/concepts"
    dependencies = {"db": Provide(get_connection, sync_to_thread=True)}

    @get()
    def list_concepts(
        self, db: sqlite3.Connection, q: str | None = None
    ) -> list[dict[str, Any]]:
        return repo.list_concepts(db, query=q)

    @get("/edges")
    def list_edges(
        self,
        db: sqlite3.Connection,
        from_id: str | None = None,
        to_id: str | None = None,
        edge_type: str | None = None,
    ) -> list[dict[str, Any]]:
        return repo.list_edges(db, from_id=from_id, to_id=to_id, edge_type=edge_type)
