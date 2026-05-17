"""Study schedule (Gantt) and exam date routes."""

from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass
from typing import Any

from litestar import Controller, delete, get, post, put
from litestar.di import Provide
from litestar.exceptions import HTTPException

from benkyo_web.database import get_connection


def _404(msg: str) -> HTTPException:
    return HTTPException(status_code=404, detail=msg)


# ── Schedule items ────────────────────────────────────────────────────────────

@dataclass
class CreateScheduleDTO:
    title: str
    start_date: str
    end_date: str
    progress: float = 0.0
    color: str | None = None


@dataclass
class UpdateScheduleDTO:
    title: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    progress: float | None = None
    color: str | None = None


class ScheduleController(Controller):
    path = "/api/projects/{project_id:str}/schedule"
    dependencies = {"db": Provide(get_connection, sync_to_thread=True)}

    @get()
    def list_schedule(
        self, project_id: str, db: sqlite3.Connection
    ) -> list[dict[str, Any]]:
        rows = db.execute(
            "SELECT * FROM study_schedule WHERE project_id = ? ORDER BY start_date",
            (project_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    @post(status_code=201)
    def create_schedule(
        self, project_id: str, data: CreateScheduleDTO, db: sqlite3.Connection
    ) -> dict[str, Any]:
        if db.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone() is None:
            raise _404(f"project not found: {project_id}")
        item_id = str(uuid.uuid4())
        db.execute(
            "INSERT INTO study_schedule (id, project_id, title, start_date, end_date, progress, color) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (item_id, project_id, data.title, data.start_date, data.end_date, data.progress, data.color),
        )
        row = db.execute("SELECT * FROM study_schedule WHERE id = ?", (item_id,)).fetchone()
        return dict(row)

    @put("/{item_id:str}")
    def update_schedule(
        self,
        project_id: str,
        item_id: str,
        data: UpdateScheduleDTO,
        db: sqlite3.Connection,
    ) -> dict[str, Any]:
        row = db.execute(
            "SELECT * FROM study_schedule WHERE id = ? AND project_id = ?",
            (item_id, project_id),
        ).fetchone()
        if row is None:
            raise _404(f"schedule item not found: {item_id}")
        current = dict(row)
        db.execute(
            "UPDATE study_schedule SET title=?, start_date=?, end_date=?, progress=?, color=? WHERE id=?",
            (
                data.title if data.title is not None else current["title"],
                data.start_date if data.start_date is not None else current["start_date"],
                data.end_date if data.end_date is not None else current["end_date"],
                data.progress if data.progress is not None else current["progress"],
                data.color if data.color is not None else current["color"],
                item_id,
            ),
        )
        row = db.execute("SELECT * FROM study_schedule WHERE id = ?", (item_id,)).fetchone()
        return dict(row)

    @delete("/{item_id:str}", status_code=200)
    def delete_schedule(
        self, project_id: str, item_id: str, db: sqlite3.Connection
    ) -> dict[str, Any]:
        cur = db.execute(
            "DELETE FROM study_schedule WHERE id = ? AND project_id = ?",
            (item_id, project_id),
        )
        if cur.rowcount == 0:
            raise _404(f"schedule item not found: {item_id}")
        return {"deleted_id": item_id}


# ── Exam dates ────────────────────────────────────────────────────────────────

@dataclass
class CreateExamDTO:
    name: str
    date: str


class ExamController(Controller):
    path = "/api/projects/{project_id:str}/exams"
    dependencies = {"db": Provide(get_connection, sync_to_thread=True)}

    @get()
    def list_exams(
        self, project_id: str, db: sqlite3.Connection
    ) -> list[dict[str, Any]]:
        rows = db.execute(
            "SELECT * FROM exam_dates WHERE project_id = ? ORDER BY date",
            (project_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    @post(status_code=201)
    def create_exam(
        self, project_id: str, data: CreateExamDTO, db: sqlite3.Connection
    ) -> dict[str, Any]:
        if db.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone() is None:
            raise _404(f"project not found: {project_id}")
        exam_id = str(uuid.uuid4())
        db.execute(
            "INSERT INTO exam_dates (id, project_id, name, date) VALUES (?, ?, ?, ?)",
            (exam_id, project_id, data.name, data.date),
        )
        row = db.execute("SELECT * FROM exam_dates WHERE id = ?", (exam_id,)).fetchone()
        return dict(row)

    @delete("/{exam_id:str}", status_code=200)
    def delete_exam(
        self, project_id: str, exam_id: str, db: sqlite3.Connection
    ) -> dict[str, Any]:
        cur = db.execute(
            "DELETE FROM exam_dates WHERE id = ? AND project_id = ?",
            (exam_id, project_id),
        )
        if cur.rowcount == 0:
            raise _404(f"exam not found: {exam_id}")
        return {"deleted_id": exam_id}
