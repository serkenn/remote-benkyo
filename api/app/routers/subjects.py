import logging
import uuid
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import Subject as SubjectModel, UploadedFile
from ..schemas import (
    Subject,
    SubjectCreate,
    FileInfo,
    InitRequest,
    InitResponse,
    GraphResponse,
    Problem,
    OkResponse,
)
from ..config import settings
from ..services.benkyo import benkyo_service
from ..services.claude import claude_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/subjects", tags=["subjects"])


def _subject_to_schema(subject: SubjectModel, problem_count: int = 0, concept_count: int = 0) -> Subject:
    return Subject(
        id=str(subject.id),
        name=subject.name,
        created_at=subject.created_at.isoformat(),
        benkyo_project_id=subject.benkyo_project_id,
        initialized=subject.initialized,
        problem_count=problem_count,
        concept_count=concept_count,
    )


@router.get("", response_model=list[Subject])
async def list_subjects(db: AsyncSession = Depends(get_db)) -> list[Subject]:
    result = await db.execute(select(SubjectModel).order_by(SubjectModel.created_at.desc()))
    subjects = result.scalars().all()

    out = []
    for s in subjects:
        subject_id = str(s.id)
        if s.initialized and s.benkyo_project_id:
            problem_count = await benkyo_service.count_problems(subject_id)
            concept_count = await benkyo_service.count_concepts(subject_id)
        else:
            problem_count = 0
            concept_count = 0
        out.append(_subject_to_schema(s, problem_count, concept_count))
    return out


@router.post("", response_model=Subject)
async def create_subject(
    body: SubjectCreate,
    db: AsyncSession = Depends(get_db),
) -> Subject:
    subject = SubjectModel(name=body.name)
    db.add(subject)
    await db.commit()
    await db.refresh(subject)
    return _subject_to_schema(subject)


@router.get("/{subject_id}", response_model=Subject)
async def get_subject(
    subject_id: str,
    db: AsyncSession = Depends(get_db),
) -> Subject:
    subject = await _get_subject_or_404(db, subject_id)
    problem_count = 0
    concept_count = 0
    if subject.initialized and subject.benkyo_project_id:
        problem_count = await benkyo_service.count_problems(subject_id)
        concept_count = await benkyo_service.count_concepts(subject_id)
    return _subject_to_schema(subject, problem_count, concept_count)


@router.delete("/{subject_id}", response_model=OkResponse)
async def delete_subject(
    subject_id: str,
    db: AsyncSession = Depends(get_db),
) -> OkResponse:
    subject = await _get_subject_or_404(db, subject_id)
    await db.delete(subject)
    await db.commit()
    return OkResponse(ok=True)


@router.post("/{subject_id}/files", response_model=FileInfo)
async def upload_file(
    subject_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> FileInfo:
    subject = await _get_subject_or_404(db, subject_id)

    upload_dir = settings.uploads_path / subject_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_id = str(uuid.uuid4())
    # Preserve original filename but make it unique with a prefix
    safe_filename = Path(file.filename).name if file.filename else "upload"
    storage_filename = f"{file_id}_{safe_filename}"
    storage_path = upload_dir / storage_filename

    content = await file.read()

    async with aiofiles.open(storage_path, "wb") as f:
        await f.write(content)

    db_file = UploadedFile(
        id=uuid.UUID(file_id),
        subject_id=subject.id,
        filename=safe_filename,
        storage_path=str(storage_path),
        size_bytes=len(content),
    )
    db.add(db_file)
    await db.commit()
    await db.refresh(db_file)

    return FileInfo(
        id=str(db_file.id),
        filename=db_file.filename,
        uploaded_at=db_file.uploaded_at.isoformat(),
        size_bytes=db_file.size_bytes,
    )


@router.delete("/{subject_id}/files/{file_id}", response_model=OkResponse)
async def delete_file(
    subject_id: str,
    file_id: str,
    db: AsyncSession = Depends(get_db),
) -> OkResponse:
    await _get_subject_or_404(db, subject_id)
    result = await db.execute(
        select(UploadedFile).where(
            UploadedFile.id == uuid.UUID(file_id),
            UploadedFile.subject_id == uuid.UUID(subject_id),
        )
    )
    db_file = result.scalar_one_or_none()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
    storage_path = Path(db_file.storage_path)
    await db.delete(db_file)
    await db.commit()
    if storage_path.exists():
        storage_path.unlink(missing_ok=True)
    return OkResponse(ok=True)


@router.get("/{subject_id}/files", response_model=list[FileInfo])
async def list_files(
    subject_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[FileInfo]:
    await _get_subject_or_404(db, subject_id)
    result = await db.execute(
        select(UploadedFile)
        .where(UploadedFile.subject_id == uuid.UUID(subject_id))
        .order_by(UploadedFile.uploaded_at.asc())
    )
    files = result.scalars().all()
    return [
        FileInfo(
            id=str(f.id),
            filename=f.filename,
            uploaded_at=f.uploaded_at.isoformat(),
            size_bytes=f.size_bytes,
        )
        for f in files
    ]


@router.post("/{subject_id}/init", response_model=InitResponse)
async def init_subject(
    subject_id: str,
    body: InitRequest,
    db: AsyncSession = Depends(get_db),
) -> InitResponse:
    subject = await _get_subject_or_404(db, subject_id)

    # Verify Claude Code auth
    if not await claude_service.get_token(db):
        raise HTTPException(status_code=401, detail="Not authenticated with Claude Code — please log in")

    # Load all uploaded files
    result = await db.execute(
        select(UploadedFile)
        .where(UploadedFile.subject_id == uuid.UUID(subject_id))
        .order_by(UploadedFile.uploaded_at.asc())
    )
    files = result.scalars().all()

    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded for this subject")

    # Read file contents
    files_content = []
    for f in files:
        path = Path(f.storage_path)
        if not path.exists():
            logger.warning("File not found: %s", path)
            continue

        # Detect file type
        suffix = path.suffix.lower()
        is_image = suffix in (".png", ".jpg", ".jpeg", ".gif", ".webp")
        is_pdf = suffix == ".pdf"

        if is_image:
            async with aiofiles.open(path, "rb") as fp:
                content = await fp.read()
            files_content.append({"filename": f.filename, "content": content, "is_image": True})
        elif is_pdf:
            try:
                import pypdf
                text_parts = []
                reader = pypdf.PdfReader(str(path))
                for page in reader.pages:
                    text_parts.append(page.extract_text() or "")
                content = "\n".join(text_parts)
                if not content.strip():
                    content = f"[PDF file: {f.filename} — text could not be extracted]"
                files_content.append({"filename": f.filename, "content": content, "is_image": False})
            except Exception as e:
                logger.error("Failed to read PDF %s: %s", path, e)
                files_content.append({
                    "filename": f.filename,
                    "content": f"[PDF file: {f.filename}]",
                    "is_image": False,
                })
        else:
            try:
                async with aiofiles.open(path, "r", encoding="utf-8", errors="replace") as fp:
                    content = await fp.read()
                files_content.append({"filename": f.filename, "content": content, "is_image": False})
            except Exception as e:
                logger.error("Failed to read file %s: %s", path, e)

    if not files_content:
        raise HTTPException(status_code=400, detail="Could not read any uploaded files")

    # Add instructions as a separate context if provided
    if body.instructions:
        files_content.insert(0, {
            "filename": "instructions.txt",
            "content": f"Instructor notes:\n{body.instructions}",
            "is_image": False,
        })

    # Extract curriculum via Claude Code subprocess
    curriculum = await claude_service.extract_curriculum(None, files_content)

    concepts = curriculum.get("concepts", [])
    problems = curriculum.get("problems", [])
    edges = curriculum.get("edges", [])

    # Add concepts to benkyo (global per DB)
    concept_id_map: dict[str, str] = {}
    for concept in concepts:
        name = concept.get("name", "")
        content = concept.get("content", "")
        if not name:
            continue
        try:
            concept_id = await benkyo_service.add_concept(subject_id, name, content)
            concept_id_map[name] = concept_id
        except Exception as e:
            logger.error("Failed to add concept '%s': %s", name, e)

    # Add problems to benkyo (global per DB) — must happen before project create
    problem_ids = []
    for problem in problems:
        name = problem.get("name", "")
        statement = problem.get("statement", "")
        answer = problem.get("answer", None)
        if not name or not statement:
            continue
        try:
            problem_id = await benkyo_service.add_problem(
                subject_id, name, statement, answer
            )
            problem_ids.append(problem_id)
        except Exception as e:
            logger.error("Failed to add problem '%s': %s", name, e)

    # Create benkyo project with problems as goals (or reuse existing)
    if subject.benkyo_project_id:
        project_id = subject.benkyo_project_id
    else:
        project_id = await benkyo_service.create_project(
            subject_id, subject.name, goal_ids=problem_ids or None
        )

    # Update subject in DB
    subject.benkyo_project_id = project_id
    subject.initialized = True
    await db.commit()

    return InitResponse(
        ok=True,
        concepts=len(concept_id_map),
        problems=len(problem_ids),
    )


@router.get("/{subject_id}/graph", response_model=GraphResponse)
async def get_graph(
    subject_id: str,
    db: AsyncSession = Depends(get_db),
) -> GraphResponse:
    subject = await _get_subject_or_404(db, subject_id)

    if not subject.initialized or not subject.benkyo_project_id:
        raise HTTPException(status_code=400, detail="Subject has not been initialized yet")

    mermaid = await benkyo_service.get_graph(subject_id, subject.benkyo_project_id)
    return GraphResponse(mermaid=mermaid)


@router.get("/{subject_id}/problem", response_model=Optional[Problem])
async def get_next_problem(
    subject_id: str,
    db: AsyncSession = Depends(get_db),
) -> Optional[Problem]:
    subject = await _get_subject_or_404(db, subject_id)

    if not subject.initialized or not subject.benkyo_project_id:
        return None

    problems = await benkyo_service.list_problems(subject_id)
    if not problems:
        return None

    # Pick first unanswered problem
    # benkyo may return problems with an 'answered' or similar field
    for p in problems:
        if isinstance(p, dict):
            # Check if problem is unanswered (no answered field, or answered=false)
            if not p.get("answered", False):
                return Problem(
                    id=str(p.get("id", p.get("problem_id", ""))),
                    name=p.get("name", ""),
                    statement=p.get("statement", ""),
                )

    # All answered — return first problem to allow retry
    p = problems[0]
    if isinstance(p, dict):
        return Problem(
            id=str(p.get("id", p.get("problem_id", ""))),
            name=p.get("name", ""),
            statement=p.get("statement", ""),
        )
    return None


async def _get_subject_or_404(db: AsyncSession, subject_id: str) -> SubjectModel:
    try:
        uid = uuid.UUID(subject_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid subject ID")

    result = await db.execute(select(SubjectModel).where(SubjectModel.id == uid))
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    return subject
