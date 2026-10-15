"""Hermes-like orchestrator: routes intents to document skills with project context."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.skills import (
    get_project_context,
    skill_anonymize_document,
    skill_classify_contract,
    skill_create_draft_document,
    skill_run_playbook,
)
from app.core.config import settings
from app.services.deepseek import deepseek_chat


INTENT_CHECK = "check"
INTENT_ANONYMIZE = "anonymize"
INTENT_CHAT = "chat"


def normalize_contract_type(value: str | None) -> str | None:
    """Сохраняет произвольный ключ типа проверки из админки / UI."""
    if not value:
        return None
    raw = value.strip()
    aliases = {
        "аренда_тс": "vehicle_lease",
        "аренда тс": "vehicle_lease",
        "недвижимость": "real_estate",
        "аренда недвижимости": "real_estate",
    }
    return aliases.get(raw.lower(), raw)


async def hermes_handle(
    db: AsyncSession,
    *,
    project_id: int,
    chat_id: int,
    lawyer_id: int,
    message: str,
    intent: str,
    contract_type: str | None,
    document_id: int | None,
    model_id: str,
) -> AsyncIterator[dict[str, Any]]:
    context = await get_project_context(db, project_id)
    yield {"event": "tool", "data": {"name": "project_memory_read", "status": "ok"}}

    if intent == INTENT_ANONYMIZE:
        if not document_id:
            yield {
                "event": "error",
                "data": {"message": "Загрузите документ перед анонимизацией."},
            }
            return
        yield {"event": "tool", "data": {"name": "anonymize", "status": "running"}}
        result = await skill_anonymize_document(
            db, project_id=project_id, document_id=document_id
        )
        if result.get("error"):
            yield {"event": "error", "data": {"message": result["error"]}}
            return
        text = (
            "Документ анонимизирован. Нажмите на плашку ниже, чтобы открыть результат."
        )
        for chunk in _chunks(text):
            yield {"event": "token", "data": {"text": chunk}}
        yield {
            "event": "done",
            "data": {
                "content": text,
                "action": "anonymize",
                "document": {
                    "document_id": result.get("document_id"),
                    "filename": result.get("filename"),
                    **result,
                },
                "model_id": model_id,
            },
        }
        return

    if intent == INTENT_CHECK:
        if not document_id:
            yield {
                "event": "error",
                "data": {"message": "Загрузите документ перед проверкой."},
            }
            return
        yield {"event": "tool", "data": {"name": "run_playbook", "status": "running"}}
        ct = normalize_contract_type(contract_type)
        result = await skill_run_playbook(
            db,
            project_id=project_id,
            document_id=document_id,
            lawyer_id=lawyer_id,
            chat_id=chat_id,
            contract_type=ct,
            model_id=model_id or "deepseek-chat",
        )
        if result.get("error"):
            yield {"event": "error", "data": {"message": result["error"]}}
            return

        findings = result.get("findings") or []
        lines = [result.get("summary") or "Проверка завершена."]
        if findings:
            lines.append("")
            lines.append("Замечания:")
            for i, f in enumerate(findings, 1):
                title = f.get("title") or "Замечание"
                desc = (f.get("description") or "").strip()
                lines.append(f"{i}. **{title}**")
                if desc:
                    lines.append(f"   {desc}")
            lines.append("")
            lines.append(
                "Нажмите на плашку документа ниже, чтобы открыть договор и перейти к пунктам."
            )
        else:
            lines.append("")
            lines.append("Критичных замечаний не найдено.")
        text = "\n".join(lines)
        for chunk in _chunks(text):
            yield {"event": "token", "data": {"text": chunk}}
        yield {
            "event": "done",
            "data": {
                "content": text,
                "action": "check",
                "check": result,
                "model_id": model_id,
            },
        }
        return

    # Создание черновика договора по запросу в чате
    if _wants_document_draft(message):
        yield {
            "event": "tool",
            "data": {"name": "create_draft_document", "status": "running"},
        }
        result = await skill_create_draft_document(
            db,
            project_id=project_id,
            message=message,
            model_id=model_id or "deepseek-chat",
        )
        if result.get("error"):
            yield {"event": "error", "data": {"message": result["error"]}}
            return
        text = (
            f"Подготовил черновик «{result.get('filename')}». "
            "Нажмите на плашку ниже — документ откроется справа. "
            "Можно править текст и при необходимости нажать «Проверить»."
        )
        for chunk in _chunks(text):
            yield {"event": "token", "data": {"text": chunk}}
        yield {
            "event": "done",
            "data": {
                "content": text,
                "action": "create_document",
                "document": {
                    "document_id": result.get("document_id"),
                    "filename": result.get("filename"),
                    **result,
                },
                "model_id": model_id,
            },
        }
        return

    # Free chat
    yield {"event": "tool", "data": {"name": "chat", "status": "running"}}
    if settings.deepseek_api_key:
        try:
            reply = await deepseek_chat(
                system=(
                    "Ты юридический ассистент Технониколь-ИИ. "
                    "Отвечай по-русски, структурировано: короткие абзацы, "
                    "списки через дефис или нумерацию, заголовки через ## если нужны. "
                    "Не говори, что не умеешь создавать документы: в системе есть "
                    "кнопки «Загрузить», «Анонимизация», «Проверить» и создание "
                    "черновика по запросу «подготовь договор». Контекст проекта ниже."
                ),
                user=f"{context}\n\nЗапрос пользователя:\n{message}",
                model=model_id if model_id.startswith("deepseek") else "deepseek-chat",
            )
        except Exception as exc:  # noqa: BLE001
            reply = (
                f"Не удалось вызвать DeepSeek ({exc}). "
                "Используйте «Проверить» для плейбука или повторите позже."
            )
    else:
        reply = _demo_chat_reply(message, context, model_id)

    if document_id and any(k in message.lower() for k in ("тип", "классиф", "это договор")):
        from app.models.document import Document

        doc = await db.get(Document, document_id)
        if doc:
            cls = await skill_classify_contract(doc.plain_text)
            reply += f"\n\nТип документа: **{cls['label']}**."

    for chunk in _chunks(reply):
        yield {"event": "token", "data": {"text": chunk}}
    yield {
        "event": "done",
        "data": {"content": reply, "action": "chat", "model_id": model_id},
    }


def _wants_document_draft(message: str) -> bool:
    m = message.lower()
    verbs = ("подготов", "создай", "создать", "сгенерир", "напиши", "сделай", "набросай")
    docs = ("договор", "документ", "соглашен", "контракт")
    return any(v in m for v in verbs) and any(d in m for d in docs)


def _demo_chat_reply(message: str, context: str, model_id: str) -> str:
    return (
        "## Чем могу помочь\n\n"
        f"Запрос: {message}\n\n"
        "- Загрузите договор и нажмите **Проверить**\n"
        "- Или напишите: «подготовь договор аренды недвижимости» — создам черновик справа\n"
        "- Для обезличивания используйте **Анонимизация**\n"
    )


def _chunks(text: str, size: int = 64) -> list[str]:
    return [text[i : i + size] for i in range(0, len(text), size)] or [""]


def dumps_sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
