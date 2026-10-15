"""Компиляция правил админки → скилл-промпт для Hermes/DeepSeek."""

from __future__ import annotations

import json
from typing import Any


def parse_rules(raw: str | list[Any] | None) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    try:
        data = json.loads(raw or "[]")
    except json.JSONDecodeError:
        # построчный ввод
        return [ln.strip("-• \t") for ln in str(raw).splitlines() if ln.strip()]
    if isinstance(data, list):
        out: list[str] = []
        for item in data:
            if isinstance(item, str) and item.strip():
                out.append(item.strip())
            elif isinstance(item, dict):
                title = str(item.get("title") or item.get("text") or "").strip()
                if title:
                    out.append(title)
        return out
    return []


def rules_to_json(rules: list[str]) -> str:
    return json.dumps([{"title": r} for r in rules], ensure_ascii=False)


def compile_check_skill(
    *,
    title: str,
    description: str = "",
    rules: list[str] | None = None,
    extra_prompt: str | None = None,
) -> str:
    """Собирает промпт-скилл: роль + чеклист + формат ответа + {{document}}."""
    rules = rules or []
    lines = [
        f"Ты юридический скилл Технониколь-ИИ для проверки договора «{title}».",
        "Работай строго по чеклисту ниже. На каждый пункт дай замечание только если есть риск.",
        "Каждое замечание обязательно привяжи к цитате из договора (clause_quote).",
    ]
    if description.strip():
        lines.append(f"Контекст типа: {description.strip()}")
    lines.append("")
    if rules:
        lines.append("Чеклист скилла:")
        for i, rule in enumerate(rules, 1):
            lines.append(f"{i}. {rule}")
    else:
        lines.append(
            "Чеклист: существенные условия, асимметрия прав, неустойки, "
            "расторжение, идентификация объекта/предмета, оплата, ответственность."
        )
    lines.append("")
    if extra_prompt and extra_prompt.strip():
        lines.append("Дополнительные указания администратора:")
        lines.append(extra_prompt.strip())
        lines.append("")
    lines.extend(
        [
            "Документ:",
            "{{document}}",
            "",
            "Верни список замечаний с привязкой к пунктам "
            "(title, description, clause_quote, severity, error_code).",
        ]
    )
    return "\n".join(lines)
