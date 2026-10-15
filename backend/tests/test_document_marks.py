from app.services.document_io import apply_finding_marks


def test_marks_by_quote_and_pn_anchor():
    html = (
        "<p>5.2. Депозит удерживается стороной.</p>"
        "<p>6.1. Возврат объекта аренды.</p>"
        "<p>Неустойка составляет 0,1% в день.</p>"
        "<p>Прочий текст.</p>"
    )
    findings = [
        {"id": 10, "title": "Депозит", "clause_quote": "Депозит удерживается", "clause_anchor": "p0"},
        {"id": 11, "title": "Возврат", "clause_quote": "нет такого xyz", "clause_anchor": "p1"},
        {"id": 12, "title": "Неустойка", "clause_quote": "0,1%", "clause_anchor": "p2"},
        {"id": 13, "title": "Прочее", "clause_quote": "", "clause_anchor": "p3"},
    ]
    out = apply_finding_marks(html, findings)
    for fid in (10, 11, 12, 13):
        assert out.count(f'data-finding-id="{fid}"') == 1
    assert out.index('data-finding-id="10"') < out.index('data-finding-id="11"')
    assert out.index('data-finding-id="11"') < out.index('data-finding-id="12"')
    assert out.index('data-finding-id="12"') < out.index('data-finding-id="13"')
    assert "tn-clause-pin" not in out
