import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.schemas import (
    ChatCreate,
    ChatOut,
    MessageOut,
    ProjectCreate,
    ProjectOut,
    SoloChatOut,
)
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.project import Chat, ChatMessage, Project
from app.models.user import User

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(Project).order_by(Project.updated_at.desc())
    result = await db.execute(q)
    return list(result.scalars().all())


@router.post("", response_model=ProjectOut)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    kind = (body.kind or "project").strip().lower()
    if kind not in ("project", "solo"):
        kind = "project"
    project = Project(
        title=body.title,
        owner_id=user.id,
        kind=kind,
        memory_json="{}",
    )
    db.add(project)
    await db.flush()
    chat_title = body.title if kind == "solo" else "Основной чат"
    chat = Chat(project_id=project.id, title=chat_title)
    db.add(chat)
    await db.commit()
    await db.refresh(project)
    return project


@router.post("/solo-chats", response_model=SoloChatOut)
async def create_solo_chat(
    body: ChatCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Чат вне проектов: контейнер kind=solo, в UI как заголовок."""
    title = (body.title or "Новый чат").strip() or "Новый чат"
    project = Project(
        title=title,
        owner_id=user.id,
        kind="solo",
        memory_json="{}",
    )
    db.add(project)
    await db.flush()
    chat = Chat(
        project_id=project.id,
        title=title,
        model_id=body.model_id or "deepseek-chat",
    )
    db.add(chat)
    await db.commit()
    await db.refresh(project)
    await db.refresh(chat)
    return SoloChatOut(project=project, chat=chat)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Проект не найден")
    return project


@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await _ensure_project(db, project_id, user)
    await db.delete(project)
    await db.commit()
    return {"ok": True}


@router.get("/{project_id}/memory")
async def get_memory(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Проект не найден")
    try:
        memory = json.loads(project.memory_json or "{}")
    except json.JSONDecodeError:
        memory = {}
    return {"summary": project.memory_summary, "memory": memory}


@router.get("/{project_id}/chats", response_model=list[ChatOut])
async def list_chats(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _ensure_project(db, project_id, user)
    result = await db.execute(
        select(Chat).where(Chat.project_id == project_id).order_by(Chat.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/{project_id}/chats", response_model=ChatOut)
async def create_chat(
    project_id: int,
    body: ChatCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _ensure_project(db, project_id, user)
    chat = Chat(project_id=project_id, title=body.title or "Новый чат", model_id=body.model_id)
    db.add(chat)
    await db.commit()
    await db.refresh(chat)
    return chat


@router.patch("/{project_id}/chats/{chat_id}", response_model=ChatOut)
async def rename_chat(
    project_id: int,
    chat_id: int,
    body: ChatCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _ensure_project(db, project_id, user)
    chat = await db.get(Chat, chat_id)
    if not chat or chat.project_id != project_id:
        raise HTTPException(404, "Чат не найден")
    if body.title:
        chat.title = body.title.strip() or "Новый чат"
    if body.model_id:
        chat.model_id = body.model_id
    await db.commit()
    await db.refresh(chat)
    return chat


@router.delete("/{project_id}/chats/{chat_id}")
async def delete_chat(
    project_id: int,
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _ensure_project(db, project_id, user)
    chat = await db.get(Chat, chat_id)
    if not chat or chat.project_id != project_id:
        raise HTTPException(404, "Чат не найден")
    await db.delete(chat)
    await db.commit()
    return {"ok": True}


@router.get("/{project_id}/chats/{chat_id}/messages", response_model=list[MessageOut])
async def list_messages(
    project_id: int,
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _ensure_project(db, project_id, user)
    chat = await db.get(Chat, chat_id)
    if not chat or chat.project_id != project_id:
        raise HTTPException(404, "Чат не найден")
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.chat_id == chat_id)
        .order_by(ChatMessage.created_at.asc())
    )
    return list(result.scalars().all())


async def _ensure_project(db: AsyncSession, project_id: int, user: User) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Проект не найден")
    return project
