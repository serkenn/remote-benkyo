from pydantic import BaseModel
from typing import Optional
import uuid


class Subject(BaseModel):
    id: str
    name: str
    created_at: str
    benkyo_project_id: Optional[str]
    initialized: bool
    problem_count: int
    concept_count: int

    class Config:
        from_attributes = True


class SubjectCreate(BaseModel):
    name: str


class Problem(BaseModel):
    id: str
    name: str
    statement: str


class FileInfo(BaseModel):
    id: str
    filename: str
    uploaded_at: str
    size_bytes: int

    class Config:
        from_attributes = True


class AuthStatusResponse(BaseModel):
    authenticated: bool


class AuthTokenRequest(BaseModel):
    token: str


class AuthTokenResponse(BaseModel):
    ok: bool


class InitRequest(BaseModel):
    instructions: Optional[str] = None


class InitResponse(BaseModel):
    ok: bool
    concepts: int
    problems: int


class InitStartResponse(BaseModel):
    status: str  # "started" | "already_running"


class InitStatusResponse(BaseModel):
    status: str  # "not_started" | "running" | "done" | "error"
    concepts: Optional[int] = None
    problems: Optional[int] = None
    error: Optional[str] = None
    logs: list[str] = []


class GraphResponse(BaseModel):
    mermaid: str


class AnswerResponse(BaseModel):
    feedback: str
    score: str  # "correct" | "partial" | "incorrect"
    next_problem: Optional[Problem] = None


class ChatRequest(BaseModel):
    message: str
    problem_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str


class OkResponse(BaseModel):
    ok: bool
