import asyncio
import base64
import json
import logging
import tempfile
import os
from pathlib import Path
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..models import AppConfig

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-6"
_AUTH_SENTINEL = "claude-code-auth"
_CLAUDE_HOME = "/home/claudeuser"


def _claude_env() -> dict:
    """Subprocess env with HOME forced to claudeuser's home directory.

    su without -l leaves HOME as root's; this ensures claude always finds
    its credentials in /home/claudeuser/.claude/ regardless of how the
    server process was started.
    """
    return {**os.environ, "HOME": _CLAUDE_HOME}


class ClaudeService:
    # ------------------------------------------------------------------
    # Auth helpers (DB stores sentinel, not actual token)
    # ------------------------------------------------------------------

    async def get_token(self, db: AsyncSession) -> Optional[str]:
        """Return sentinel string if authenticated, None otherwise."""
        result = await db.execute(
            select(AppConfig).where(AppConfig.key == "anthropic_api_key")
        )
        config = result.scalar_one_or_none()
        if config and config.value == _AUTH_SENTINEL:
            return _AUTH_SENTINEL
        return None

    def client(self, token: str):
        """Not used in subprocess mode — kept for API compatibility."""
        return token

    async def get_client(self, db: AsyncSession):
        token = await self.get_token(db)
        if not token:
            raise RuntimeError("Not authenticated with Claude Code")
        return token

    async def validate_token(self, creds: str) -> bool:
        """Validate by running a minimal claude command."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "claude",
                "--dangerously-skip-permissions",
                "--output-format", "text",
                "--model", MODEL,
                "-p", "Reply with the single word: ok",
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=_claude_env(),
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=45)
            ok = proc.returncode == 0
            if ok:
                logger.info("[claude-auth] validate_token OK: %r", stdout.decode().strip()[:50])
            else:
                logger.warning(
                    "[claude-auth] validate_token failed rc=%d stderr=%r stdout=%r",
                    proc.returncode,
                    stderr.decode().strip()[:300],
                    stdout.decode().strip()[:300],
                )
            return ok
        except Exception as e:
            logger.warning("validate_token failed: %s", e)
            return False

    # ------------------------------------------------------------------
    # Claude CLI subprocess runner
    # ------------------------------------------------------------------

    async def _run(
        self,
        prompt: str,
        system: Optional[str] = None,
        image_bytes: Optional[bytes] = None,
        timeout: int = 180,
    ) -> str:
        """Run claude CLI and return the text response."""

        if image_bytes:
            return await self._run_with_image(prompt, system, image_bytes, timeout)
        return await self._run_text(prompt, system, timeout)

    async def _run_text(self, prompt: str, system: Optional[str], timeout: int) -> str:
        # -p is the non-interactive print flag; --print is an alias.
        # --dangerously-skip-permissions prevents Claude Code from hanging in
        # headless Docker environments waiting for permission confirmations.
        cmd = [
            "claude",
            "--dangerously-skip-permissions",
            "--output-format", "text",
            "--model", MODEL,
        ]
        if system:
            cmd += ["--system", system]
        cmd += ["-p", prompt]

        logger.debug("Running claude text: model=%s prompt_len=%d", MODEL, len(prompt))
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=_claude_env(),
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        if proc.returncode != 0:
            err = stderr.decode().strip()
            out = stdout.decode().strip()
            detail = err or out or "(no output)"
            logger.error("claude CLI error (rc=%d) stderr=%r stdout=%r", proc.returncode, err[:300], out[:300])
            raise RuntimeError(f"claude CLI error: {detail[:500]}")
        return stdout.decode().strip()

    async def _run_with_image(
        self,
        prompt: str,
        system: Optional[str],
        image_bytes: bytes,
        timeout: int,
    ) -> str:
        """Run claude with an image via temp file + --image flag, or stream-json fallback."""

        # Write image to temp file
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            f.write(image_bytes)
            tmp_path = f.name

        try:
            # Try --image flag (available in some Claude Code versions)
            cmd = [
                "claude",
                "--dangerously-skip-permissions",
                "--output-format", "text",
                "--model", MODEL,
                "--image", tmp_path,
            ]
            if system:
                cmd += ["--system", system]
            cmd += ["-p", prompt]

            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=_claude_env(),
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)

            if proc.returncode == 0:
                return stdout.decode().strip()

            # Fallback: stream-json with base64 image
            logger.info("--image flag failed, trying stream-json fallback")
            return await self._run_stream_json_image(prompt, system, image_bytes, timeout)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    async def _run_stream_json_image(
        self,
        prompt: str,
        system: Optional[str],
        image_bytes: bytes,
        timeout: int,
    ) -> str:
        b64 = base64.b64encode(image_bytes).decode()
        msg = {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": b64,
                    },
                },
                {"type": "text", "text": prompt},
            ],
        }
        stdin_data = (json.dumps(msg) + "\n").encode()

        cmd = [
            "claude",
            "--dangerously-skip-permissions",
            "--output-format", "text",
            "--input-format", "stream-json",
            "--model", MODEL,
        ]
        if system:
            cmd += ["--system", system]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=_claude_env(),
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(input=stdin_data), timeout=timeout
        )
        if proc.returncode != 0:
            err = stderr.decode().strip()
            out = stdout.decode().strip()
            raise RuntimeError(f"claude stream-json error: {(err or out or '(no output)')[:500]}")
        return stdout.decode().strip()

    # ------------------------------------------------------------------
    # High-level API methods (no client parameter needed)
    # ------------------------------------------------------------------

    async def extract_curriculum(self, _client, files_content: list[dict]) -> dict:
        file_texts = []
        for f in files_content:
            if f.get("is_image"):
                file_texts.append(f"[Image file: {f['filename']}]")
            else:
                content = f.get("content", "")
                if isinstance(content, bytes):
                    content = content.decode("utf-8", errors="replace")
                file_texts.append(f"=== {f['filename']} ===\n{content}")

        combined = "\n\n".join(file_texts)

        prompt = f"""You are an expert curriculum analyst. Analyze the following study materials and extract a structured learning curriculum.

Study Materials:
{combined}

Return a JSON object with exactly this structure:
{{
  "concepts": [
    {{"name": "concept name", "content": "brief description of the concept"}}
  ],
  "problems": [
    {{"name": "problem name/number", "statement": "full problem statement", "answer": "answer if available, else empty string"}}
  ],
  "edges": [
    {{"from": "concept A name", "to": "concept B name"}}
  ]
}}

Rules:
- Extract all key concepts/topics from the materials
- Extract all exercises, problems, and practice questions
- edges represent prerequisite relationships (from=prerequisite, to=dependent concept)
- Return ONLY the JSON, no markdown fences or extra text
"""
        raw = await self._run(prompt, timeout=300)

        # Strip markdown fences if present
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1]) if lines[-1].startswith("```") else "\n".join(lines[1:])

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error("Failed to parse curriculum response: %s\nRaw: %s", e, raw[:500])
            data = {"concepts": [], "problems": [], "edges": []}

        return {
            "concepts": data.get("concepts", []),
            "problems": data.get("problems", []),
            "edges": data.get("edges", []),
        }

    async def evaluate_answer(
        self,
        _client,
        problem: dict,
        canvas_png_bytes: bytes,
    ) -> dict:
        problem_name = problem.get("name", "")
        problem_statement = problem.get("statement", "")
        expected_answer = problem.get("answer", "")

        prompt = f"""You are a helpful tutor evaluating a student's handwritten answer.

Problem: {problem_name}
Statement: {problem_statement}
{"Expected Answer: " + expected_answer if expected_answer else ""}

Look at the handwritten answer in the image above. Please:
1. Extract/transcribe what the student wrote
2. Evaluate whether the answer is correct, partially correct, or incorrect
3. Provide constructive feedback

Return a JSON object with exactly this structure:
{{
  "extracted_text": "transcription of what the student wrote",
  "score": "correct" | "partial" | "incorrect",
  "feedback": "detailed, encouraging feedback explaining what was right and what could be improved"
}}

Return ONLY the JSON, no markdown fences or extra text."""

        raw = await self._run(prompt, image_bytes=canvas_png_bytes, timeout=60)

        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1]) if lines[-1].startswith("```") else "\n".join(lines[1:])

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error("Failed to parse evaluate response: %s\nRaw: %s", e, raw[:500])
            data = {
                "extracted_text": raw[:200],
                "score": "incorrect",
                "feedback": "Could not evaluate answer automatically. Please review manually.",
            }

        score = data.get("score", "incorrect").lower()
        if score not in ("correct", "partial", "incorrect"):
            score = "incorrect"

        return {
            "extracted_text": data.get("extracted_text", ""),
            "score": score,
            "feedback": data.get("feedback", ""),
        }

    async def chat(
        self,
        _client,
        subject_context: str,
        history: list[dict],
        message: str,
        canvas_png_bytes: Optional[bytes] = None,
    ) -> str:
        system = f"""You are an expert tutor helping a student learn.
You are knowledgeable, encouraging, and adapt your explanations to the student's level.
Always respond in the same language the student uses.

Subject context:
{subject_context}

Guidelines:
- Give clear, step-by-step explanations
- Use examples when helpful
- Encourage the student when they're struggling
- Point out what they did correctly before addressing mistakes
"""
        # Build conversation history as context prefix
        history_text = ""
        for msg in history[-10:]:
            role = "User" if msg["role"] == "user" else "Assistant"
            history_text += f"{role}: {msg['content']}\n"

        full_prompt = f"{history_text}User: {message}\nAssistant:"

        return await self._run(
            full_prompt,
            system=system,
            image_bytes=canvas_png_bytes,
            timeout=60,
        )


claude_service = ClaudeService()
