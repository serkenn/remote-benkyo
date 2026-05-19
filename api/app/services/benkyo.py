import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from ..config import settings

logger = logging.getLogger(__name__)


class BenkyoService:
    def db_path(self, subject_id: str) -> Path:
        path = settings.workspaces_path / subject_id / "benkyo.sqlite"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    async def run(self, subject_id: str, *args: str) -> Any:
        db = str(self.db_path(subject_id))
        cmd = ["benkyo", "--db", db] + list(args)
        logger.debug("Running benkyo: %s", " ".join(cmd))

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            err = stderr.decode().strip()
            logger.error("benkyo error (code %d): %s", proc.returncode, err)
            raise RuntimeError(f"benkyo CLI failed (code {proc.returncode}): {err}")

        raw = stdout.decode().strip()
        if not raw:
            return {}

        try:
            parsed = json.loads(raw)
            # All benkyo commands (except render) use output_ok: {"ok": true, "result": ...}
            if isinstance(parsed, dict) and "ok" in parsed and "result" in parsed:
                return parsed["result"]
            return parsed
        except json.JSONDecodeError:
            # render command outputs plain mermaid/dot text
            return {"raw": raw}

    async def create_project(self, subject_id: str, name: str, goal_ids: list[str] | None = None) -> str:
        args = ["project", "create", "--metadata", json.dumps({"name": name})]
        if goal_ids:
            args += ["--goals", ",".join(goal_ids)]
        result = await self.run(subject_id, *args)
        if isinstance(result, dict):
            return str(result.get("id", ""))
        raise RuntimeError(f"Unexpected benkyo project create output: {result}")

    async def list_projects(self, subject_id: str) -> list:
        result = await self.run(subject_id, "project", "list")
        if isinstance(result, list):
            return result
        return []

    async def get_or_create_project(self, subject_id: str, name: str) -> str:
        projects = await self.list_projects(subject_id)
        if projects:
            first = projects[0]
            if isinstance(first, dict):
                return str(first.get("id", ""))
        return await self.create_project(subject_id, name)

    async def add_concept(self, subject_id: str, name: str, content: str = "") -> str:
        # content must be non-empty per benkyo's constraint
        effective_content = (content or name).strip()
        if not effective_content:
            effective_content = name
        result = await self.run(
            subject_id,
            "concept", "add",
            "--name", name,
            "--content", effective_content,
        )
        if isinstance(result, dict):
            return str(result.get("id", ""))
        raise RuntimeError(f"Unexpected benkyo concept add output: {result}")

    async def add_problem(
        self,
        subject_id: str,
        name: str,
        statement: str,
        answer: str | None = None,
    ) -> str:
        # answer must be non-empty per benkyo's constraint
        effective_answer = (answer or "").strip() or "(解答は教材を参照)"
        result = await self.run(
            subject_id,
            "problem", "add",
            "--name", name,
            "--statement", statement,
            "--answer", effective_answer,
        )
        if isinstance(result, dict):
            return str(result.get("id", ""))
        raise RuntimeError(f"Unexpected benkyo problem add output: {result}")

    async def list_problems(self, subject_id: str) -> list:
        # Problems are global per DB (not per project), so no --project flag
        result = await self.run(subject_id, "problem", "list")
        if isinstance(result, list):
            return result
        return []

    async def get_graph(self, subject_id: str, project_id: str) -> str:
        # Use --scope graph to render entire concept/problem graph (not just BFS from goals)
        result = await self.run(
            subject_id, "render",
            "--project", project_id,
            "--format", "mermaid",
            "--scope", "graph",
        )
        if isinstance(result, dict):
            # render outputs plain text → stored as {"raw": text}
            return result.get("raw", "")
        if isinstance(result, str):
            return result
        return ""

    async def log_event(
        self,
        subject_id: str,
        project_id: str,
        kind: str,
        payload: dict,
    ) -> None:
        try:
            await self.run(
                subject_id,
                "events", "add",
                "--kind", kind,
                "--project", project_id,
                "--payload", json.dumps(payload),
            )
        except Exception as e:
            logger.warning("Failed to log benkyo event %s: %s", kind, e)

    async def count_concepts(self, subject_id: str) -> int:
        try:
            result = await self.run(subject_id, "concept", "list")
            if isinstance(result, list):
                return len(result)
        except Exception:
            pass
        return 0

    async def count_problems(self, subject_id: str) -> int:
        try:
            problems = await self.list_problems(subject_id)
            return len(problems)
        except Exception:
            return 0

    async def end_session(self, subject_id: str, project_id: str, summary: dict) -> None:
        try:
            await self.run(
                subject_id,
                "session", "end",
                "--project", project_id,
                "--summary", json.dumps(summary),
            )
        except Exception as e:
            logger.warning("Failed to end benkyo session: %s", e)

    async def set_treatment(
        self,
        subject_id: str,
        project_id: str,
        concept_id: str,
        whitebox: bool,
    ) -> None:
        treatment = "set-whitebox" if whitebox else "set-blackbox"
        await self.run(
            subject_id,
            "treatment", treatment,
            "--project", project_id,
            concept_id,
        )


benkyo_service = BenkyoService()
