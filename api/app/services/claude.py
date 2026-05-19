import base64
import json
import logging
from typing import Optional

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..models import AppConfig

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-6"


class ClaudeService:
    async def get_token(self, db: AsyncSession) -> Optional[str]:
        result = await db.execute(
            select(AppConfig).where(AppConfig.key == "anthropic_api_key")
        )
        config = result.scalar_one_or_none()
        if config:
            return config.value
        return None

    def client(self, token: str) -> anthropic.Anthropic:
        return anthropic.Anthropic(api_key=token)

    async def get_client(self, db: AsyncSession) -> anthropic.Anthropic:
        token = await self.get_token(db)
        if not token:
            raise RuntimeError("Anthropic API token not configured")
        return self.client(token)

    async def validate_token(self, token: str) -> bool:
        try:
            c = self.client(token)
            c.messages.create(
                model=MODEL,
                max_tokens=10,
                messages=[{"role": "user", "content": "ping"}],
            )
            return True
        except anthropic.AuthenticationError:
            return False
        except Exception as e:
            logger.warning("Token validation error: %s", e)
            return False

    async def extract_curriculum(
        self,
        client: anthropic.Anthropic,
        files_content: list[dict],
    ) -> dict:
        """
        files_content: list of {"filename": str, "content": str | bytes, "is_image": bool}
        Returns: {concepts: [{name, content}], problems: [{name, statement, answer}], edges: [{from, to}]}
        """
        file_texts = []
        for f in files_content:
            if f.get("is_image"):
                # Skip images in the text prompt (handled separately if needed)
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

        response = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = response.content[0].text.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1]) if lines[-1].startswith("```") else "\n".join(lines[1:])

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error("Failed to parse Claude curriculum response: %s\nRaw: %s", e, raw[:500])
            data = {"concepts": [], "problems": [], "edges": []}

        return {
            "concepts": data.get("concepts", []),
            "problems": data.get("problems", []),
            "edges": data.get("edges", []),
        }

    async def evaluate_answer(
        self,
        client: anthropic.Anthropic,
        problem: dict,
        canvas_png_bytes: bytes,
    ) -> dict:
        """
        Evaluate a handwritten answer from a canvas PNG.
        Returns: {feedback: str, score: str, extracted_text: str}
        """
        image_b64 = base64.standard_b64encode(canvas_png_bytes).decode()

        problem_name = problem.get("name", "")
        problem_statement = problem.get("statement", "")
        expected_answer = problem.get("answer", "")

        prompt_parts = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": image_b64,
                },
            },
            {
                "type": "text",
                "text": f"""You are a helpful tutor evaluating a student's handwritten answer.

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

Return ONLY the JSON, no markdown fences or extra text.""",
            },
        ]

        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt_parts}],
        )

        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1]) if lines[-1].startswith("```") else "\n".join(lines[1:])

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error("Failed to parse Claude evaluate response: %s\nRaw: %s", e, raw[:500])
            data = {
                "extracted_text": "",
                "score": "incorrect",
                "feedback": "Could not evaluate answer. Please try again.",
            }

        # Normalize score
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
        client: anthropic.Anthropic,
        subject_context: str,
        history: list[dict],
        message: str,
        canvas_png_bytes: Optional[bytes] = None,
    ) -> str:
        """
        General tutoring chat with optional canvas image.
        history: list of {"role": "user"|"assistant", "content": str}
        Returns: assistant response string
        """
        system_prompt = f"""You are an expert tutor helping a student learn.
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

        messages = list(history)

        # Build current user message
        if canvas_png_bytes:
            image_b64 = base64.standard_b64encode(canvas_png_bytes).decode()
            user_content = [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": image_b64,
                    },
                },
                {"type": "text", "text": message},
            ]
        else:
            user_content = message

        messages.append({"role": "user", "content": user_content})

        response = client.messages.create(
            model=MODEL,
            max_tokens=2048,
            system=system_prompt,
            messages=messages,
        )

        return response.content[0].text


claude_service = ClaudeService()
