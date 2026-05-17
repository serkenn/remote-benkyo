"""Project CRUD routes."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from typing import Any

from litestar import Controller, delete, get, post, put
from litestar.di import Provide
from litestar.exceptions import HTTPException

from benkyo import repository as repo
from benkyo.errors import ConflictError, InvalidArgError, NotFoundError
from benkyo_web.database import get_connection


def _err(e: Exception) -> HTTPException:
    if isinstance(e, NotFoundError):
        return HTTPException(status_code=404, detail=str(e))
    if isinstance(e, (InvalidArgError, ConflictError)):
        return HTTPException(status_code=400, detail=str(e))
    return HTTPException(status_code=500, detail=str(e))


@dataclass
class CreateProjectDTO:
    name: str
    description: str = ""
    color: str = "#6366f1"


@dataclass
class UpdateProjectDTO:
    name: str | None = None
    description: str | None = None
    color: str | None = None


class ProjectController(Controller):
    path = "/api/projects"
    dependencies = {"db": Provide(get_connection, sync_to_thread=True)}

    @get()
    def list_projects(self, db: sqlite3.Connection) -> list[dict[str, Any]]:
        rows = repo.list_projects(db)
        result = []
        for r in rows:
            meta = {}
            try:
                meta = json.loads(r.get("metadata") or "{}")
            except (json.JSONDecodeError, TypeError):
                pass
            exams = db.execute(
                "SELECT * FROM exam_dates WHERE project_id = ? ORDER BY date",
                (r["id"],),
            ).fetchall()
            result.append({
                **r,
                "display_name": meta.get("name", r["id"]),
                "description": meta.get("description", ""),
                "color": meta.get("color", "#6366f1"),
                "exams": [dict(e) for e in exams],
            })
        return result

    @post()
    def create_project(
        self, data: CreateProjectDTO, db: sqlite3.Connection
    ) -> dict[str, Any]:
        meta = json.dumps({
            "name": data.name,
            "description": data.description,
            "color": data.color,
        }, ensure_ascii=False)
        try:
            proj = repo.create_project(db, metadata=meta)
        except Exception as e:
            raise _err(e) from e
        return {**proj, "display_name": data.name, "description": data.description, "color": data.color, "exams": []}

    @get("/{project_id:str}")
    def get_project(
        self, project_id: str, db: sqlite3.Connection
    ) -> dict[str, Any]:
        try:
            proj = repo.get_project(db, project_id)
        except Exception as e:
            raise _err(e) from e
        meta = {}
        try:
            meta = json.loads(proj.get("metadata") or "{}")
        except (json.JSONDecodeError, TypeError):
            pass
        concepts = db.execute(
            """
            SELECT cn.id, cn.name, cn.content, pc.treatment, pc.set_by, pc.set_at
            FROM concept_nodes cn
            JOIN project_concepts pc ON cn.id = pc.concept_id
            WHERE pc.project_id = ?
            ORDER BY cn.id
            """,
            (project_id,),
        ).fetchall()
        exams = db.execute(
            "SELECT * FROM exam_dates WHERE project_id = ? ORDER BY date",
            (project_id,),
        ).fetchall()
        schedule = db.execute(
            "SELECT * FROM study_schedule WHERE project_id = ? ORDER BY start_date",
            (project_id,),
        ).fetchall()
        return {
            **proj,
            "display_name": meta.get("name", project_id),
            "description": meta.get("description", ""),
            "color": meta.get("color", "#6366f1"),
            "concepts": [dict(c) for c in concepts],
            "exams": [dict(e) for e in exams],
            "schedule": [dict(s) for s in schedule],
        }

    @put("/{project_id:str}")
    def update_project(
        self, project_id: str, data: UpdateProjectDTO, db: sqlite3.Connection
    ) -> dict[str, Any]:
        try:
            proj = repo.get_project(db, project_id)
        except Exception as e:
            raise _err(e) from e
        meta = {}
        try:
            meta = json.loads(proj.get("metadata") or "{}")
        except (json.JSONDecodeError, TypeError):
            pass
        if data.name is not None:
            meta["name"] = data.name
        if data.description is not None:
            meta["description"] = data.description
        if data.color is not None:
            meta["color"] = data.color
        try:
            repo.update_project(db, project_id, metadata=json.dumps(meta, ensure_ascii=False))
        except Exception as e:
            raise _err(e) from e
        exams = db.execute(
            "SELECT * FROM exam_dates WHERE project_id = ? ORDER BY date",
            (project_id,),
        ).fetchall()
        return {
            **proj,
            "display_name": meta.get("name", project_id),
            "description": meta.get("description", ""),
            "color": meta.get("color", "#6366f1"),
            "exams": [dict(e) for e in exams],
        }

    @delete("/{project_id:str}", status_code=200)
    def delete_project(
        self, project_id: str, db: sqlite3.Connection
    ) -> dict[str, Any]:
        try:
            return repo.delete_project(db, project_id)
        except Exception as e:
            raise _err(e) from e
