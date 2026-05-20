import logging
import uuid
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db, AsyncSessionLocal
from ..models import Subject as SubjectModel, Answer
from ..schemas import AnswerResponse, ChatRequest, ChatResponse, Problem
from ..config import settings
from ..services.benkyo import benkyo_service
from ..services.claude import claude_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["sessions"])

# In-memory conversation history per WebSocket connection
# keyed by (subject_id, connection_id)
_ws_histories: dict[str, list[dict]] = {}


async def _get_subject(db: AsyncSession, subject_id: str) -> SubjectModel:
    try:
        uid = uuid.UUID(subject_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid subject ID")
    result = await db.execute(select(SubjectModel).where(SubjectModel.id == uid))
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    return subject


async def _get_problem_dict(subject_id: str, problem_id: str) -> Optional[dict]:
    problems = await benkyo_service.list_problems(subject_id)
    for p in problems:
        if isinstance(p, dict):
            pid = str(p.get("id", p.get("problem_id", "")))
            if pid == problem_id:
                return p
    return None


async def _get_next_problem(subject_id: str) -> Optional[Problem]:
    problems = await benkyo_service.list_problems(subject_id)
    if not problems:
        return None
    for p in problems:
        if isinstance(p, dict):
            if not p.get("answered", False):
                return Problem(
                    id=str(p.get("id", p.get("problem_id", ""))),
                    name=p.get("name", ""),
                    statement=p.get("statement", ""),
                )
    # All answered — return first
    p = problems[0]
    if isinstance(p, dict):
        return Problem(
            id=str(p.get("id", p.get("problem_id", ""))),
            name=p.get("name", ""),
            statement=p.get("statement", ""),
        )
    return None


@router.post("/api/subjects/{subject_id}/answer", response_model=AnswerResponse)
async def submit_answer(
    subject_id: str,
    problem_id: str = Form(...),
    canvas_png: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> AnswerResponse:
    subject = await _get_subject(db, subject_id)

    if not subject.initialized or not subject.benkyo_project_id:
        raise HTTPException(status_code=400, detail="Subject has not been initialized yet")

    # Verify auth
    if not await claude_service.get_token(db):
        raise HTTPException(status_code=401, detail="Not authenticated with Claude Code")

    # Read canvas PNG
    canvas_bytes = await canvas_png.read()

    # Save canvas to disk
    canvas_dir = settings.uploads_path / subject_id / "canvases"
    canvas_dir.mkdir(parents=True, exist_ok=True)
    canvas_filename = f"{uuid.uuid4()}.png"
    canvas_path = canvas_dir / canvas_filename

    async with aiofiles.open(canvas_path, "wb") as f:
        await f.write(canvas_bytes)

    # Get problem details from benkyo
    problem_dict = await _get_problem_dict(subject_id, problem_id)
    if not problem_dict:
        problem_dict = {"id": problem_id, "name": "Problem", "statement": ""}

    # Evaluate via Claude Code subprocess
    evaluation = await claude_service.evaluate_answer(None, problem_dict, canvas_bytes)

    # Save answer to DB
    answer = Answer(
        subject_id=subject.id,
        problem_id=problem_id,
        canvas_path=str(canvas_path),
        extracted_text=evaluation.get("extracted_text", ""),
        feedback=evaluation.get("feedback", ""),
        score=evaluation.get("score", "incorrect"),
    )
    db.add(answer)
    await db.commit()

    # Log event to benkyo
    try:
        await benkyo_service.log_event(
            subject_id,
            subject.benkyo_project_id,
            "probe_attempt",
            {
                "problem_id": problem_id,
                "score": evaluation.get("score", "incorrect"),
                "extracted_text": evaluation.get("extracted_text", ""),
            },
        )
    except Exception as e:
        logger.warning("Failed to log benkyo event: %s", e)

    # Get next problem
    next_problem = await _get_next_problem(subject_id)

    return AnswerResponse(
        feedback=evaluation.get("feedback", ""),
        score=evaluation.get("score", "incorrect"),
        next_problem=next_problem,
    )


@router.post("/api/subjects/{subject_id}/chat", response_model=ChatResponse)
async def chat(
    subject_id: str,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    subject = await _get_subject(db, subject_id)

    if not await claude_service.get_token(db):
        raise HTTPException(status_code=401, detail="Not authenticated with Claude Code")

    subject_context = f"Subject: {subject.name}"
    if body.problem_id:
        problem_dict = await _get_problem_dict(subject_id, body.problem_id)
        if problem_dict:
            subject_context += f"\nCurrent problem: {problem_dict.get('name', '')}\n{problem_dict.get('statement', '')}"

    response_text = await claude_service.chat(
        _client=None,
        subject_context=subject_context,
        history=[],
        message=body.message,
    )

    return ChatResponse(response=response_text)


@router.websocket("/ws/{subject_id}")
async def websocket_endpoint(websocket: WebSocket, subject_id: str) -> None:
    await websocket.accept()

    conn_id = str(uuid.uuid4())
    history_key = f"{subject_id}:{conn_id}"
    _ws_histories[history_key] = []

    logger.info("WebSocket connected: subject=%s conn=%s", subject_id, conn_id)

    try:
        # Load subject and get client using a fresh DB session
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(SubjectModel).where(SubjectModel.id == uuid.UUID(subject_id))
            )
            subject = result.scalar_one_or_none()
            if not subject:
                await websocket.send_json({"error": "Subject not found"})
                await websocket.close()
                return

            token = await claude_service.get_token(db)
            if not token:
                await websocket.send_json({"error": "Not authenticated with Claude Code"})
                await websocket.close()
                return

        subject_context = f"Subject: {subject.name}"

        # Send ready signal
        await websocket.send_json({"type": "ready", "subject": subject.name})

        while True:
            data = await websocket.receive_json()
            message_type = data.get("type", "message")

            if message_type == "message":
                user_message = data.get("message", "")
                problem_id = data.get("problem_id")

                if not user_message:
                    continue

                # Build context with current problem if provided
                ctx = subject_context
                if problem_id:
                    problem_dict = await _get_problem_dict(subject_id, problem_id)
                    if problem_dict:
                        ctx += f"\nCurrent problem: {problem_dict.get('name', '')}\n{problem_dict.get('statement', '')}"

                history = _ws_histories[history_key]

                # Get response from Claude
                response_text = await claude_service.chat(
                    _client=None,
                    subject_context=ctx,
                    history=history,
                    message=user_message,
                )

                # Update history
                history.append({"role": "user", "content": user_message})
                history.append({"role": "assistant", "content": response_text})

                # Keep history bounded to last 20 exchanges
                if len(history) > 40:
                    _ws_histories[history_key] = history[-40:]

                await websocket.send_json({
                    "type": "response",
                    "message": response_text,
                })

            elif message_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif message_type == "clear_history":
                _ws_histories[history_key] = []
                await websocket.send_json({"type": "history_cleared"})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: subject=%s conn=%s", subject_id, conn_id)
    except Exception as e:
        logger.error("WebSocket error: %s", e)
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        _ws_histories.pop(history_key, None)
