"""Python anonymization of personal and commercial data."""

from __future__ import annotations

import re

# Personal data
RE_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
RE_PHONE = re.compile(
    r"(?:\+7|8)[\s\-]?(?:\(?\d{3}\)?[\s\-]?)?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}"
)
RE_PASSPORT = re.compile(r"\b\d{4}\s?\d{6}\b")
RE_SNILS = re.compile(r"\b\d{3}-\d{3}-\d{3}\s?\d{2}\b")
RE_INN = re.compile(r"\b\d{10}(\d{2})?\b")
RE_OGRN = re.compile(r"\b\d{13}(\d{2})?\b")
RE_ACCOUNT = re.compile(r"\b\d{20}\b")
RE_BIK = re.compile(r"\b\d{9}\b")
RE_CARD = re.compile(r"\b(?:\d{4}[\s\-]?){3}\d{4}\b")

# FIO-like sequences (simplified Cyrillic)
RE_FIO = re.compile(
    r"\b([А-ЯЁ][а-яё]+)\s+([А-ЯЁ][а-яё]+)(?:\s+([А-ЯЁ][а-яё]+))?\b"
)

# Commercial: amounts with currency, prices
RE_MONEY = re.compile(
    r"\b\d{1,3}(?:[ \u00a0]\d{3})*(?:[.,]\d+)?\s*(?:руб(?:\.|лей)?|₽|RUB|USD|\$|€)\b",
    re.IGNORECASE,
)
RE_PERCENT_DEAL = re.compile(r"\b\d{1,3}([.,]\d+)?\s*%\b")


REPLACEMENTS: list[tuple[re.Pattern[str], str]] = [
    (RE_EMAIL, "[EMAIL]"),
    (RE_PHONE, "[ТЕЛЕФОН]"),
    (RE_PASSPORT, "[ПАСПОРТ]"),
    (RE_SNILS, "[СНИЛС]"),
    (RE_CARD, "[КАРТА]"),
    (RE_ACCOUNT, "[СЧЁТ]"),
    (RE_OGRN, "[ОГРН]"),
    (RE_INN, "[ИНН]"),
    (RE_MONEY, "[СУММА]"),
]


def anonymize_text(text: str) -> str:
    out = text
    for pattern, repl in REPLACEMENTS:
        out = pattern.sub(repl, out)

    def _fio(m: re.Match[str]) -> str:
        # Keep common legal words
        skip = {
            "Договор",
            "Аренда",
            "Арендатор",
            "Арендодатель",
            "Общество",
            "Сторона",
            "Российская",
            "Федерация",
            "Город",
        }
        if m.group(1) in skip:
            return m.group(0)
        return "[ФИО]"

    out = RE_FIO.sub(_fio, out)
    return out


def anonymize_html(html_content: str) -> str:
    # Work on text nodes roughly via regex on content between tags is fragile;
    # strip tags-aware: anonymize full string then restore tags structure by
    # anonymizing only text between > and <.
    parts: list[str] = []
    last = 0
    for m in re.finditer(r"(>)([^<]*)(<)", html_content):
        parts.append(html_content[last : m.start()])
        parts.append(m.group(1))
        parts.append(anonymize_text(m.group(2)))
        parts.append(m.group(3))
        last = m.end()
    parts.append(html_content[last:])
    return "".join(parts)
