"""DeepSeek chat/completions for contract review."""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.core.config import settings


async def deepseek_chat(
    *,
    system: str,
    user: str,
    model: str = "deepseek-chat",
    temperature: float = 0.2,
) -> str:
    if not settings.deepseek_api_key:
        raise RuntimeError("DEEPSEEK_API_KEY не задан")

    payload = {
        "model": model if model.startswith("deepseek") else "deepseek-chat",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        res = await client.post(
            f"{settings.deepseek_base_url.rstrip('/')}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.deepseek_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        res.raise_for_status()
        data = res.json()
    return data["choices"][0]["message"]["content"]


async def deepseek_review_contract(
    *,
    document_text: str,
    contract_label: str,
    model: str = "deepseek-chat",
    skill_prompt: str | None = None,
) -> list[dict[str, Any]]:
    """Return structured findings from DeepSeek (скилл из админки + JSON-контракт)."""
    skill = (skill_prompt or "").replace("{{document}}", "").strip()
    system = (
        (skill + "\n\n" if skill else "")
        + "Ответь ТОЛЬКО валидным JSON-массивом объектов без markdown. "
        "Каждый объект: "
        '{"title":"...","description":"...","severity":"high|medium|low",'
        '"clause_quote":"короткая цитата из текста","error_code":"snake_case"}.'
        "Максимум 10 замечаний. Если проблем нет — []."
    )
    user = (
        f"Тип договора / скилл: {contract_label}\n\n"
        f"Текст договора:\n{document_text[:14000]}"
    )
    raw = await deepseek_chat(system=system, user=user, model=model)
    return _parse_findings_json(raw)


def _parse_findings_json(raw: str) -> list[dict[str, Any]]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
        if isinstance(data, dict) and "findings" in data:
            data = data["findings"]
        if not isinstance(data, list):
            return []
        out: list[dict[str, Any]] = []
        for i, item in enumerate(data[:8]):
            if not isinstance(item, dict):
                continue
            out.append(
                {
                    "title": str(item.get("title") or f"Замечание {i+1}")[:512],
                    "description": str(item.get("description") or "")[:4000],
                    "severity": str(item.get("severity") or "medium"),
                    "clause_quote": str(item.get("clause_quote") or "")[:500],
                    "error_code": str(item.get("error_code") or f"llm_{i}")[:64],
                    "clause_anchor": f"p{i}",
                }
            )
        return out
    except json.JSONDecodeError:
        return []
