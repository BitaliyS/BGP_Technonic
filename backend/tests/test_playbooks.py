from app.services.anonymize import anonymize_text
from app.services.playbooks import classify_contract, run_playbook
from app.models.check import ContractType


def test_classify_vehicle():
    text = "Договор аренды транспортного средства автомобиль VIN пробег ОСАГО"
    assert classify_contract(text) == ContractType.vehicle_lease


def test_classify_real_estate():
    text = "Договор аренды помещения кадастровый номер ЕГРН недвижимость"
    assert classify_contract(text) == ContractType.real_estate


def test_playbook_finds_issues():
    text = open("docs/sample_vehicle_lease.txt", encoding="utf-8").read()
    findings = run_playbook(text, ContractType.vehicle_lease)
    assert len(findings) >= 1


def test_anonymize():
    raw = "Иванов Иван Иванович, +7 916 123-45-67, 150 000 руб., ИНН 7701234567"
    out = anonymize_text(raw)
    assert "[ФИО]" in out or "[ТЕЛЕФОН]" in out
    assert "[СУММА]" in out
    assert "[ИНН]" in out
