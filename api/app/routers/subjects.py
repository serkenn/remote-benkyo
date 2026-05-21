import asyncio
import logging
import uuid
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db, AsyncSessionLocal
from ..models import Subject as SubjectModel, UploadedFile
from ..schemas import (
    Subject,
    SubjectCreate,
    FileInfo,
    InitRequest,
    InitResponse,
    InitStartResponse,
    InitStatusResponse,
    GraphResponse,
    Problem,
    OkResponse,
)
from ..config import settings
from ..services.benkyo import benkyo_service
from ..services.claude import claude_service, ClaudeNotAuthenticatedError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/subjects", tags=["subjects"])

# In-memory job state: subject_id -> {status, concepts, problems, error, logs}
_init_jobs: dict[str, dict] = {}



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


def _make_log_callback(subject_id: str):
    """Returns a callback that appends text chunks to the job's rolling log (last 3 lines)."""
    buf = ""

    def on_chunk(delta: str):
        nonlocal buf
        buf += delta
        # Split into lines and keep non-empty ones; rolling window of 3
        lines = [ln.strip() for ln in buf.replace("\n", " ").split("  ") if ln.strip()]
        if not lines:
            return
        # Build display lines from accumulated text by splitting at sentence boundaries
        display = []
        for ln in lines:
            # Break long chunks into ~60-char display lines
            while len(ln) > 60:
                display.append(ln[:60])
                ln = ln[60:]
            if ln:
                display.append(ln)
        _init_jobs[subject_id]["logs"] = display[-3:]

    return on_chunk


def _set_log(subject_id: str, *lines: str) -> None:
    """Update the rolling log display (up to 3 lines) for a running job."""
    _init_jobs[subject_id]["logs"] = list(lines[-3:])


async def _run_init_job(subject_id: str, instructions: Optional[str]) -> None:
    """Background task that runs the long-running init and writes status to _init_jobs."""
    _init_jobs[subject_id] = {"status": "running", "logs": []}
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(SubjectModel).where(SubjectModel.id == uuid.UUID(subject_id))
            )
            subject = result.scalar_one_or_none()
            if not subject:
                _init_jobs[subject_id] = {"status": "error", "error": "Subject not found"}
                return

            file_result = await db.execute(
                select(UploadedFile)
                .where(UploadedFile.subject_id == uuid.UUID(subject_id))
                .order_by(UploadedFile.uploaded_at.asc())
            )
            files = file_result.scalars().all()
            if not files:
                _init_jobs[subject_id] = {"status": "error", "error": "No files uploaded for this subject"}
                return

            _set_log(subject_id, f"教材ファイルを確認中... ({len(files)} 件)")

            files_content = []
            ocr_needed = []
            for f in files:
                path = Path(f.storage_path)
                if not path.exists():
                    logger.warning("File not found: %s", path)
                    continue
                suffix = path.suffix.lower()
                is_image = suffix in (".png", ".jpg", ".jpeg", ".gif", ".webp")
                is_pdf = suffix == ".pdf"
                if is_image:
                    async with aiofiles.open(path, "rb") as fp:
                        content = await fp.read()
                    files_content.append({"filename": f.filename, "content": content, "is_image": True})
                elif is_pdf:
                    try:
                        import fitz  # pymupdf
                        doc = fitz.open(str(path))
                        text = "\n".join(page.get_text() for page in doc)
                        if not text.strip():
                            ocr_needed.append((f.filename, doc))
                        else:
                            files_content.append({"filename": f.filename, "content": text, "is_image": False})
                            doc.close()
                    except Exception as e:
                        logger.error("Failed to read PDF %s: %s", path, e)
                        files_content.append({"filename": f.filename, "content": f"[PDF: {f.filename}]", "is_image": False})
                else:
                    try:
                        async with aiofiles.open(path, "r", encoding="utf-8", errors="replace") as fp:
                            content = await fp.read()
                        files_content.append({"filename": f.filename, "content": content, "is_image": False})
                    except Exception as e:
                        logger.error("Failed to read file %s: %s", path, e)

            # OCR phase — only OCR up to 4 representative PDFs (first page each);
            # remaining scanned PDFs are listed by filename only to keep context small.
            if ocr_needed:
                import fitz as _fitz
                import pytesseract
                from PIL import Image
                import io as _io

                OCR_SAMPLE_LIMIT = 4

                def _ocr_first_page(filename: str, doc) -> str:
                    if len(doc) == 0:
                        doc.close()
                        return ""
                    mat = _fitz.Matrix(2.0, 2.0)
                    pix = doc[0].get_pixmap(matrix=mat)
                    img = Image.open(_io.BytesIO(pix.tobytes("png")))
                    text = pytesseract.image_to_string(img, lang="jpn+eng")
                    doc.close()
                    return text.strip()

                loop = asyncio.get_event_loop()
                sample = ocr_needed[:OCR_SAMPLE_LIMIT]
                skipped = ocr_needed[OCR_SAMPLE_LIMIT:]

                for i, (filename, doc) in enumerate(sample, 1):
                    _set_log(subject_id, f"OCR処理中 ({i}/{len(sample)}): {filename}")
                    text = await loop.run_in_executor(None, _ocr_first_page, filename, doc)
                    if text:
                        logger.info("OCR extracted %d chars from %s", len(text), filename)
                        files_content.append({"filename": filename, "content": text, "is_image": False})
                    else:
                        logger.warning("OCR found no text in %s", filename)
                        files_content.append({"filename": filename, "content": f"[スキャンPDF: {filename}]", "is_image": False})

                # Close skipped docs and add filename-only entries
                for filename, doc in skipped:
                    doc.close()
                    files_content.append({"filename": filename, "content": f"[スキャンPDF: {filename} — 上記サンプルと同形式]", "is_image": False})

            if not files_content:
                _init_jobs[subject_id] = {"status": "error", "error": "Could not read any uploaded files"}
                return


            if instructions:
                files_content.insert(0, {
                    "filename": "instructions.txt",
                    "content": f"Instructor notes:\n{instructions}",
                    "is_image": False,
                })

            total_chars = sum(len(f.get("content", "") if not f.get("is_image") else "") for f in files_content)
            _set_log(subject_id, f"Claudeに送信中... ({total_chars:,} 文字)")

            try:
                curriculum = await claude_service.extract_curriculum(
                    None, files_content, on_chunk=_make_log_callback(subject_id)
                )
            except ClaudeNotAuthenticatedError:
                await claude_service.clear_auth(db)
                _init_jobs[subject_id] = {"status": "error", "error": "Claude認証が期限切れです — /auth で再ログインしてください", "auth_expired": True}
                return

            concepts = curriculum.get("concepts", [])
            problems = curriculum.get("problems", [])
            _set_log(subject_id, f"概念・問題を登録中... ({len(concepts)} 概念 / {len(problems)} 問題)")

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

            problem_ids = []
            for problem in problems:
                name = problem.get("name", "")
                statement = problem.get("statement", "")
                answer = problem.get("answer", None)
                if not name or not statement:
                    continue
                try:
                    problem_id = await benkyo_service.add_problem(subject_id, name, statement, answer)
                    problem_ids.append(problem_id)
                except Exception as e:
                    logger.error("Failed to add problem '%s': %s", name, e)

            if subject.benkyo_project_id:
                project_id = subject.benkyo_project_id
            else:
                project_id = await benkyo_service.create_project(
                    subject_id, subject.name, goal_ids=problem_ids or None
                )

            subject.benkyo_project_id = project_id
            subject.initialized = True
            await db.commit()

        _init_jobs[subject_id] = {
            "status": "done",
            "concepts": len(concept_id_map),
            "problems": len(problem_ids),
        }
    except asyncio.TimeoutError:
        logger.error("Init job timed out for subject %s", subject_id)
        _init_jobs[subject_id] = {"status": "error", "error": "Claudeの応答がタイムアウトしました（10分）。ファイル数を減らして再試行してください。"}
    except Exception as e:
        msg = str(e) or type(e).__name__
        logger.error("Init job failed for subject %s: %s", subject_id, msg)
        _init_jobs[subject_id] = {"status": "error", "error": msg}


@router.post("/{subject_id}/init", response_model=InitStartResponse)
async def init_subject(
    subject_id: str,
    body: InitRequest,
    db: AsyncSession = Depends(get_db),
) -> InitStartResponse:
    await _get_subject_or_404(db, subject_id)

    if not await claude_service.get_token(db):
        raise HTTPException(status_code=401, detail="Not authenticated with Claude Code — please log in")

    if _init_jobs.get(subject_id, {}).get("status") == "running":
        return InitStartResponse(status="already_running")

    asyncio.create_task(_run_init_job(subject_id, body.instructions))
    return InitStartResponse(status="started")


@router.get("/{subject_id}/init/status", response_model=InitStatusResponse)
async def init_status(subject_id: str) -> InitStatusResponse:
    job = _init_jobs.get(subject_id)
    if not job:
        return InitStatusResponse(status="not_started")
    return InitStatusResponse(
        status=job["status"],
        concepts=job.get("concepts"),
        problems=job.get("problems"),
        error=job.get("error"),
        logs=job.get("logs", []),
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
