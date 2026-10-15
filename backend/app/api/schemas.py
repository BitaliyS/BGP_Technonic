from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.user import UserRole


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str  # логин (не обязательно email)
    full_name: str
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}


class LoginIn(BaseModel):
    email: str = Field(min_length=1, max_length=255)  # логин
    password: str


class UserCreate(BaseModel):
    email: str = Field(min_length=1, max_length=255)
    full_name: str
    password: str
    role: UserRole = UserRole.lawyer


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None
    password: str | None = None


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    kind: str = "project"  # project | solo


class ProjectOut(BaseModel):
    id: int
    title: str
    owner_id: int
    kind: str = "project"
    memory_summary: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChatCreate(BaseModel):
    title: str = "Новый чат"
    model_id: str = "gemini-2.5-flash"


class ChatOut(BaseModel):
    id: int
    project_id: int
    title: str
    model_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SoloChatOut(BaseModel):
    project: ProjectOut
    chat: ChatOut


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    meta_json: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatMessageIn(BaseModel):
    message: str
    intent: str = "chat"  # chat | check | anonymize
    contract_type: str | None = None
    document_id: int | None = None
    model_id: str | None = None


class DocumentOut(BaseModel):
    id: int
    project_id: int
    filename: str
    html_content: str
    plain_text: str
    contract_type: str | None
    revision: int
    is_anonymized: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentSaveIn(BaseModel):
    html_content: str
    note: str = "manual_edit"


class DocumentVersionOut(BaseModel):
    id: int
    revision: int
    note: str
    html_content: str = ""
    created_at: datetime

    model_config = {"from_attributes": True}


class PromptOut(BaseModel):
    id: int
    key: str
    title: str
    contract_type: str
    content: str
    version_number: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class PromptUpdate(BaseModel):
    content: str
    change_note: str = ""


class PromptVersionOut(BaseModel):
    id: int
    version_number: int
    content: str
    change_note: str
    source: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SandboxIn(BaseModel):
    prompt_key: str | None = None
    prompt_content: str | None = None
    sample_text: str


class FindingOut(BaseModel):
    id: int
    title: str
    description: str
    severity: str
    error_code: str
    contract_type: str
    clause_anchor: str
    lawyer_id: int
    document_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class TeamStatsOut(BaseModel):
    lawyers_count: int
    checks_day: int
    checks_week: int
    checks_month: int
    errors_total: int
    by_contract_type: dict[str, Any]
    frequent_errors: list[dict[str, Any]]
    rare_errors: list[dict[str, Any]]
    lawyers: list[dict[str, Any]]
