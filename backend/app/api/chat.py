import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.hermes import dumps_sse, hermes_handle
from app.api.projects import _ensure_project
from app.api.schemas import ChatMessageIn
from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.project import Chat, ChatMessage
from app.models.user import User

router = APIRouter(tags=["chat"])


@router.get("/models")
async def list_models(user: User = Depends(get_current_user)):
    return {"models": settings.default_models}


@router.post("/projects/{project_id}/chats/{chat_id}/messages/stream")
async def stream_message(
    project_id: int,
    chat_id: int,
    body: ChatMessageIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _ensure_project(db, project_id, user)
    chat = await db.get(Chat, chat_id)
    if not chat or chat.project_id != project_id:
        raise HTTPException(404, "Чат не найден")

    model_id = body.model_id or chat.model_id
    if body.model_id:
        chat.model_id = body.model_id

    user_msg = ChatMessage(
        chat_id=chat_id,
        role="user",
        content=body.message,
        meta_json=json.dumps(
            {
                "intent": body.intent,
                "contract_type": body.contract_type,
                "document_id": body.document_id,
            },
            ensure_ascii=False,
        ),
    )
    db.add(user_msg)
    await db.commit()

    async def event_gen():
        full = ""
        done_payload: dict = {}
        async for ev in hermes_handle(
            db,
            project_id=project_id,
            chat_id=chat_id,
            lawyer_id=user.id,
            message=body.message,
            intent=body.intent,
            contract_type=body.contract_type,
            document_id=body.document_id,
            model_id=model_id,
        ):
            event = ev["event"]
            data = ev["data"]
            if event == "token":
                full += data.get("text", "")
            if event == "done":
                done_payload = data
                full = data.get("content", full)
            yield dumps_sse(event, data)

        assistant = ChatMessage(
            chat_id=chat_id,
            role="assistant",
            content=full,
            meta_json=json.dumps(done_payload, ensure_ascii=False),
        )
        db.add(assistant)
        if not chat.title or chat.title in ("Новый чат", "Основной чат"):
            chat.title = (body.message[:48] + "…") if len(body.message) > 48 else body.message
        await db.commit()

    return StreamingResponse(event_gen(), media_type="text/event-stream")
