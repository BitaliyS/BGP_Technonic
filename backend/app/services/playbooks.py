"""Contract check playbooks: vehicle lease & real estate."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.models.check import ContractType


@dataclass
class RawFinding:
    clause_anchor: str
    clause_quote: str
    title: str
    description: str
    severity: str
    error_code: str
    confidence: float = 0.85


VEHICLE_RULES: list[tuple[str, str, str, str, str]] = [
    # error_code, pattern, title, description, severity
    (
        "missing_vin",
        r"(?i)транспортн|автомобил|тс\b",
        "Не указан VIN / идентификатор ТС",
        "В договоре аренды ТС должен быть явно указан VIN или государственный номер.",
        "high",
    ),
    (
        "missing_insurance",
        r"(?i)страхов",
        "Проверить покрытие страхования",
        "Убедитесь, что указаны ОСАГО/КАСКО, ответственность сторон при ДТП.",
        "medium",
    ),
    (
        "unlimited_penalty",
        r"(?i)неустойк|штраф|пен[яи]",
        "Риск несоразмерной неустойки",
        "Проверьте размер неустойки на соответствие ст. 333 ГК РФ и рыночной практике.",
        "high",
    ),
    (
        "missing_return_condition",
        r"(?i)возврат|состоян",
        "Условия возврата ТС",
        "Должны быть описаны состояние при возврате, акт приёма-передачи, пробег.",
        "medium",
    ),
]

REAL_ESTATE_RULES: list[tuple[str, str, str, str, str]] = [
    (
        "missing_cadastral",
        r"(?i)кадастр|адрес\s+объект",
        "Идентификация объекта недвижимости",
        "Проверьте кадастровый номер и точный адрес объекта.",
        "high",
    ),
    (
        "missing_registration",
        r"(?i)регистрац|егрн|росреестр",
        "Госрегистрация / переход права",
        "Убедитесь, что прописан порядок государственной регистрации.",
        "high",
    ),
    (
        "unclear_payment",
        r"(?i)арендн(ая|ой)\s+плат|стоимость|оплат",
        "Условия оплаты",
        "Проверьте сроки, индексацию, НДС и последствия просрочки.",
        "medium",
    ),
    (
        "termination_asymmetry",
        r"(?i)расторжен|односторонн",
        "Асимметрия расторжения",
        "Проверьте баланс прав сторон на одностороннее расторжение.",
        "medium",
    ),
]


def classify_contract(text: str) -> ContractType:
    t = text.lower()
    vehicle_score = sum(
        1
        for k in ("транспорт", "автомобил", "vin", "пробег", "осаго", "каско", "тс ")
        if k in t
    )
    re_score = sum(
        1
        for k in ("недвижим", "кадастр", "помещен", "земельн", "егрн", "арендатор помещ")
        if k in t
    )
    if vehicle_score > re_score and vehicle_score > 0:
        return ContractType.vehicle_lease
    if re_score > 0:
        return ContractType.real_estate
    if "аренда" in t and "авто" in t:
        return ContractType.vehicle_lease
    return ContractType.unknown


def _paragraphs(text: str) -> list[tuple[str, str]]:
    paras = [p.strip() for p in re.split(r"\n+", text) if p.strip()]
    return [(f"p{i}", p) for i, p in enumerate(paras)]


def run_playbook(text: str, contract_type: ContractType) -> list[RawFinding]:
    rules = VEHICLE_RULES if contract_type == ContractType.vehicle_lease else REAL_ESTATE_RULES
    if contract_type == ContractType.unknown:
        # try both lightly
        findings = run_playbook(text, ContractType.vehicle_lease)[:2]
        findings += run_playbook(text, ContractType.real_estate)[:2]
        return findings

    paras = _paragraphs(text)
    findings: list[RawFinding] = []
    seen: set[str] = set()

    for error_code, pattern, title, description, severity in rules:
        matched = False
        for anchor, para in paras:
            if re.search(pattern, para):
                # If rule is about "missing X", presence of keyword means check quality
                # For missing_* we flag if keyword topic exists but specific detail absent
                if error_code.startswith("missing_"):
                    detail_ok = False
                    if error_code == "missing_vin" and re.search(
                        r"(?i)vin|идентификацион|гос\.?\s*номер|[А-Я]\d{3}[А-Я]{2}\d{2,3}",
                        text,
                    ):
                        detail_ok = True
                    if error_code == "missing_cadastral" and re.search(
                        r"\d{2}:\d{2}:\d{6,7}:\d+", text
                    ):
                        detail_ok = True
                    if error_code == "missing_insurance" and re.search(
                        r"(?i)осаго|каско", text
                    ):
                        detail_ok = True
                    if error_code == "missing_registration" and re.search(
                        r"(?i)егрн|росреестр|государственн\w+\s+регистрац", text
                    ):
                        detail_ok = True
                    if error_code == "missing_return_condition" and re.search(
                        r"(?i)акт\s+при[её]ма|пробег", text
                    ):
                        detail_ok = True
                    if detail_ok:
                        matched = True
                        break
                quote = para[:240]
                key = f"{error_code}:{anchor}"
                if key in seen:
                    continue
                seen.add(key)
                findings.append(
                    RawFinding(
                        clause_anchor=anchor,
                        clause_quote=quote,
                        title=title,
                        description=description,
                        severity=severity,
                        error_code=error_code,
                    )
                )
                matched = True
                break
        if not matched and error_code.startswith("missing_"):
            # Topic never mentioned — still a finding on document level
            findings.append(
                RawFinding(
                    clause_anchor="doc",
                    clause_quote=paras[0][1][:180] if paras else "",
                    title=title,
                    description=description + " (тема не обнаружена в тексте).",
                    severity=severity,
                    error_code=error_code,
                    confidence=0.7,
                )
            )

    # Always check unilateral termination asymmetry keywords for both types
    if re.search(r"(?i)вправе\s+в\s+одностороннем\s+порядке", text):
        if "termination_asymmetry" not in seen:
            for anchor, para in paras:
                if re.search(r"(?i)односторонн", para):
                    findings.append(
                        RawFinding(
                            clause_anchor=anchor,
                            clause_quote=para[:240],
                            title="Одностороннее расторжение",
                            description="Проверьте симметрию права на односторонний отказ от договора.",
                            severity="medium",
                            error_code="termination_asymmetry",
                        )
                    )
                    break

    return findings[:12]


PLAYBOOK_KEYS = {
    ContractType.vehicle_lease: "check_vehicle_lease",
    ContractType.real_estate: "check_real_estate",
}
