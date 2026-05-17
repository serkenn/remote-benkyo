"""DB setup: wraps benkyo.db.connect and adds web-specific tables."""

from __future__ import annotations

import os
import sqlite3
from collections.abc import Generator
from pathlib import Path

from benkyo.db import connect as benkyo_connect

WEB_SCHEMA = """
CREATE TABLE IF NOT EXISTS exam_dates (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS study_schedule (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0.0,
    color TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exam_dates_project ON exam_dates(project_id);
CREATE INDEX IF NOT EXISTS idx_study_schedule_project ON study_schedule(project_id);
"""

_WEB_SCHEMA_APPLIED: set[str] = set()


def get_db_path() -> Path:
    return Path(os.environ.get("BENKYO_DB", "/data/db.sqlite"))


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    path = db_path or get_db_path()
    conn = benkyo_connect(path)
    if str(path) not in _WEB_SCHEMA_APPLIED:
        conn.executescript(WEB_SCHEMA)
        _WEB_SCHEMA_APPLIED.add(str(path))
    return conn


def get_connection() -> Generator[sqlite3.Connection, None, None]:
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()
