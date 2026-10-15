"""Document skills for Hermes orchestrator."""

from __future__ import annotations

import html
import json
import re
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.check import CheckRun, ContractType, Finding
from app.models.check_type import CheckType
from app.models.document import Document, DocumentVersion
from app.models.project import Project
from app.models.prompt import Prompt
from app.services.anonymize import anonymize_html, anonymize_text
from app.services.deepseek import deepseek_chat, deepseek_review_contract
from app.services.document_io import apply_finding_marks
from app.services.playbooks import PLAYBOOK_KEYS, classify_contract, run_playbook

BUILTIN_LABELS = {
    ContractType.vehicle_lease.value: "Договор аренды ТС",
    ContractType.real_estate.value: "Аренда недвижимости",
    ContractType.unknown.value: "Не определён",
}


async def skill_classify_contract(text: str) -> dict[str, Any]:
    ct = classify_contract(text)
    return {"contract_type": ct.value, "label": BUILTIN_LABELS.get(ct.value, ct.value)}


async def _resolve_check_meta(db: AsyncSession, key: str | None) -> tuple[str, str, str]:
    """Returns (type_key, label, playbook_key)."""
    if not key:
        return (
            ContractType.real_estate.value,
            BUILTIN_LABELS[ContractType.real_estate.value],
            "check_real_estate",
        )

    row = await db.scalar(select(CheckType).where(CheckType.key == key))
    if row:
        return row.key, row.title, row.prompt_key or f"check_{row.key}"

    try:
        enum_ct = ContractType(key)
        pb = PLAYBOOK_KEYS.get(enum_ct, f"check_{key}")
        return key, BUILTIN_LABELS.get(key, key), pb
    except ValueError:
        return key, key, f"check_{key}"


def _to_enum_for_heuristics(key: str) -> ContractType:
    try:
        return ContractType(key)
    except ValueError:
        return ContractType.real_estate


async def skill_run_playbook(
    db: AsyncSession,
    *,
    project_id: int,
    document_id: int,
    lawyer_id: int,
    chat_id: int | None,
    contract_type: str | None,
    model_id: str = "deepseek-chat",
) -> dict[str, Any]:
    doc = await db.get(Document, document_id)
    if not doc or doc.project_id != project_id:
        return {"error": "document_not_found"}

    text = doc.plain_text or ""
    detected = classify_contract(text)
    requested = (contract_type or "").strip() or None
    if not requested or requested == "unknown":
        requested = (
            detected.value
            if detected != ContractType.unknown
            else ContractType.real_estate.value
        )

    type_key, label, playbook_key = await _resolve_check_meta(db, requested)
    heuristic_ct = _to_enum_for_heuristics(type_key)

    llm_used = False
    llm_error: str | None = None
    raw_items: list[dict[str, Any]] = []

    skill_prompt: str | None = None
    if playbook_key:
        prompt_row = await db.scalar(select(Prompt).where(Prompt.key == playbook_key))
        if prompt_row and prompt_row.content:
            skill_prompt = prompt_row.content

    if settings.deepseek_api_key:
        try:
            llm_findings = await deepseek_review_contract(
                document_text=text,
                contract_label=label,
                model=model_id or "deepseek-chat",
                skill_prompt=skill_prompt,
            )
            for i, item in enumerate(llm_findings):
                raw_items.append(
                    {
                        "clause_anchor": item.get("clause_anchor") or f"p{i}",
                        "clause_quote": item.get("clause_quote") or "",
                        "title": item["title"],
                        "description": item["description"],
                        "severity": item.get("severity") or "medium",
                        "error_code": item.get("error_code") or f"llm_{i}",
                        "confidence": 0.9,
                    }
                )
            llm_used = True
        except Exception as exc:  # noqa: BLE001
            llm_error = str(exc)

    if not raw_items:
        for r in run_playbook(text, heuristic_ct):
            raw_items.append(
                {
                    "clause_anchor": r.clause_anchor,
                    "clause_quote": r.clause_quote,
                    "title": r.title,
                    "description": r.description,
                    "severity": r.severity,
                    "error_code": r.error_code,
                    "confidence": r.confidence,
                }
            )

    source = "deepseek" if llm_used else "heuristic"
    summary = f"Проверка «{label}»: найдено ошибок — {len(raw_items)} ({source})."
    if llm_error:
        summary += f" LLM fallback: {llm_error[:120]}"

    run = CheckRun(
        project_id=project_id,
        document_id=document_id,
        lawyer_id=lawyer_id,
        chat_id=chat_id,
        contract_type=type_key,
        playbook_key=playbook_key or "check_generic",
        status="completed",
        error_count=len(raw_items),
        summary=summary,
    )
    db.add(run)
    await db.flush()

    finding_dicts: list[dict] = []
    for r in raw_items:
        f = Finding(
            check_run_id=run.id,
            lawyer_id=lawyer_id,
            document_id=document_id,
            contract_type=type_key,
            clause_anchor=r["clause_anchor"],
            clause_quote=r["clause_quote"],
            title=r["title"],
            description=r["description"],
            severity=r["severity"],
            error_code=r["error_code"],
            confidence=r.get("confidence", 0.85),
            status="open",
        )
        db.add(f)
        await db.flush()
        finding_dicts.append(
            {
                "id": f.id,
                "clause_anchor": f.clause_anchor,
                "clause_quote": f.clause_quote or r.get("clause_quote") or "",
                "title": f.title,
                "description": f.description,
                "severity": f.severity,
                "error_code": f.error_code,
                "status": f.status,
            }
        )

    marked = apply_finding_marks(doc.html_content, finding_dicts)
    doc.html_content = marked
    doc.contract_type = type_key
    doc.revision += 1

    await skill_project_memory_update(
        db,
        project_id,
        note=f"Проверен документ «{doc.filename}» ({label}), ошибок: {len(raw_items)}.",
        artifacts={"last_check_run_id": run.id, "document_id": doc.id, "findings": len(raw_items)},
    )
    await db.commit()

    return {
        "check_run_id": run.id,
        "contract_type": type_key,
        "contract_label": label,
        "error_count": len(raw_items),
        "summary": run.summary,
        "findings": finding_dicts,
        "html_content": marked,
        "document_id": doc.id,
        "document_filename": doc.filename,
        "revision": doc.revision,
        "llm_used": llm_used,
        "model_id": model_id,
    }


def _plain_to_html(text: str) -> str:
    parts: list[str] = []
    for i, line in enumerate(text.splitlines()):
        raw = line.strip()
        if not raw:
            continue
        safe = html.escape(raw)
        if raw.startswith("# "):
            parts.append(f'<h2 data-anchor="p{i}">{html.escape(raw[2:].strip())}</h2>')
        elif raw.startswith("## "):
            parts.append(f'<h2 data-anchor="p{i}">{html.escape(raw[3:].strip())}</h2>')
        else:
            parts.append(f'<p data-anchor="p{i}">{safe}</p>')
    if not parts:
        parts.append('<p data-anchor="p0"></p>')
    return '<div class="tn-doc">' + "".join(parts) + "</div>"


def _guess_draft_filename(message: str) -> str:
    low = message.lower()
    if "тс" in low or "транспорт" in low or "автомоб" in low:
        return "Договор_аренды_ТС.docx"
    if "недвижим" in low or "помещен" in low or "аренд" in low:
        return "Договор_аренды_недвижимости.docx"
    return "Черновик_договора.docx"


def _demo_lease_draft(message: str) -> str:
    title = "ДОГОВОР АРЕНДЫ НЕДВИЖИМОСТИ"
    if "тс" in message.lower() or "транспорт" in message.lower():
        title = "ДОГОВОР АРЕНДЫ ТРАНСПОРТНОГО СРЕДСТВА"
    return (
        f"# {title}\n\n"
        "г. Москва                                «___» __________ 20__ г.\n\n"
        "Арендодатель: [НАИМЕНОВАНИЕ], в лице [ФИО], действующего на основании [Устава], "
        "и Арендатор: [НАИМЕНОВАНИЕ], в лице [ФИО], действующего на основании [Устава], "
        "заключили настоящий договор о нижеследующем.\n\n"
        "## 1. Предмет договора\n"
        "1.1. Арендодатель передаёт, а Арендатор принимает во временное владение и пользование "
        "объект: [ОПИСАНИЕ ОБЪЕКТА].\n"
        "1.2. Объект передаётся по акту приёма-передачи.\n\n"
        "## 2. Срок аренды\n"
        "2.1. Срок аренды составляет [СРОК] с даты подписания акта приёма-передачи.\n\n"
        "## 3. Арендная плата\n"
        "3.1. Размер арендной платы: [СУММА] руб. в месяц, НДС [включён/не облагается].\n"
        "3.2. Оплата производится до [ДАТА] каждого месяца на счёт Арендодателя.\n\n"
        "## 4. Права и обязанности сторон\n"
        "4.1. Арендатор обязан использовать объект по назначению и содержать его в исправном состоянии.\n"
        "4.2. Арендодатель обязан передать объект свободным от прав третьих лиц.\n\n"
        "## 5. Ответственность\n"
        "5.1. За просрочку оплаты Арендатор уплачивает неустойку [РАЗМЕР]% от суммы задолженности за каждый день просрочки.\n\n"
        "## 6. Расторжение\n"
        "6.1. Договор может быть расторгнут по соглашению сторон или в порядке, предусмотренном ГК РФ.\n\n"
        "## 7. Реквизиты и подписи сторон\n"
        "Арендодатель: [РЕКВИЗИТЫ]\n"
        "Арендатор: [РЕКВИЗИТЫ]\n"
    )


async def skill_create_draft_document(
    db: AsyncSession,
    *,
    project_id: int,
    message: str,
    model_id: str = "deepseek-chat",
) -> dict[str, Any]:
    """Создаёт черновик договора в проекте по запросу из чата."""
    filename = _guess_draft_filename(message)
    body = ""
    llm_used = False

    if settings.deepseek_api_key:
        try:
            body = await deepseek_chat(
                system=(
                    "Ты юридический ассистент. Подготовь черновик договора на русском. "
                    "Верни только текст договора в Markdown: заголовки через # / ##, "
                    "пункты с нумерацией. Без пояснений до и после текста. "
                    "В местах неизвестных данных ставь плейсхолдеры в квадратных скобках."
                ),
                user=message,
                model=model_id if model_id.startswith("deepseek") else "deepseek-chat",
            )
            llm_used = True
        except Exception:  # noqa: BLE001
            body = ""

    if not body.strip():
        body = _demo_lease_draft(message)

    # Убрать возможные markdown-ограждения
    body = re.sub(r"^```(?:markdown|md)?\s*", "", body.strip())
    body = re.sub(r"\s*```$", "", body)

    html_content = _plain_to_html(body)
    plain = "\n".join(
        line.strip() for line in body.splitlines() if line.strip()
    )
    ct = classify_contract(plain)

    dest = Path(settings.upload_dir) / f"{uuid4().hex}.docx"
    dest.write_bytes(b"")  # placeholder; выгрузка соберёт DOCX из HTML

    doc = Document(
        project_id=project_id,
        filename=filename,
        storage_path=str(dest),
        html_content=html_content,
        plain_text=plain,
        contract_type=ct.value,
        revision=1,
        is_anonymized=False,
    )
    db.add(doc)
    await db.flush()
    db.add(
        DocumentVersion(
            document_id=doc.id,
            revision=1,
            html_content=html_content,
            storage_path=str(dest),
            note="chat_draft",
        )
    )
    await skill_project_memory_update(
        db,
        project_id,
        note=f"Создан черновик «{filename}» из чата.",
        artifacts={"draft_document_id": doc.id},
    )
    await db.commit()
    await db.refresh(doc)
    return {
        "document_id": doc.id,
        "filename": doc.filename,
        "html_content": html_content,
        "plain_text": plain,
        "revision": doc.revision,
        "contract_type": doc.contract_type,
        "llm_used": llm_used,
    }


async def skill_anonymize_document(
    db: AsyncSession, *, project_id: int, document_id: int
) -> dict[str, Any]:
    doc = await db.get(Document, document_id)
    if not doc or doc.project_id != project_id:
        return {"error": "document_not_found"}

    html = anonymize_html(doc.html_content)
    plain = anonymize_text(doc.plain_text)
    doc.html_content = html
    doc.plain_text = plain
    doc.is_anonymized = True
    doc.revision += 1

    await skill_project_memory_update(
        db,
        project_id,
        note=f"Анонимизирован документ «{doc.filename}».",
        artifacts={"anonymized_document_id": doc.id},
    )
    await db.commit()
    return {
        "document_id": doc.id,
        "filename": doc.filename,
        "html_content": html,
        "plain_text": plain,
        "revision": doc.revision,
        "is_anonymized": True,
    }


async def skill_project_memory_update(
    db: AsyncSession,
    project_id: int,
    note: str,
    artifacts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    project = await db.get(Project, project_id)
    if not project:
        return {"error": "project_not_found"}

    try:
        memory = json.loads(project.memory_json or "{}")
    except json.JSONDecodeError:
        memory = {}

    history: list = memory.get("history", [])
    history.append({"note": note, "artifacts": artifacts or {}})
    memory["history"] = history[-50:]
    if artifacts:
        memory["latest"] = artifacts

    project.memory_json = json.dumps(memory, ensure_ascii=False)
    summary_lines = [h["note"] for h in memory["history"][-8:]]
    project.memory_summary = "\n".join(summary_lines)
    await db.flush()
    return {"memory_summary": project.memory_summary, "memory": memory}


async def skill_annotate_document(
    db: AsyncSession, document_id: int, findings: list[dict]
) -> dict[str, Any]:
    doc = await db.get(Document, document_id)
    if not doc:
        return {"error": "document_not_found"}
    marked = apply_finding_marks(doc.html_content, findings)
    doc.html_content = marked
    await db.flush()
    return {"html_content": marked}


async def get_project_context(db: AsyncSession, project_id: int) -> str:
    project = await db.get(Project, project_id)
    if not project:
        return ""
    docs = (
        await db.execute(select(Document).where(Document.project_id == project_id))
    ).scalars().all()
    doc_lines = [f"- {d.filename} (rev {d.revision}, type={d.contract_type})" for d in docs]
    return (
        f"Проект: {project.title}\n"
        f"Память проекта:\n{project.memory_summary or '(пусто)'}\n"
        f"Документы:\n" + ("\n".join(doc_lines) if doc_lines else "(нет)")
    )
