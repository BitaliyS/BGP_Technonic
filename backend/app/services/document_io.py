"""DOCX ↔ HTML helpers (simplified from Ur_Agent document_editor pattern)."""

from __future__ import annotations

import html
import re
from io import BytesIO
from pathlib import Path

from bs4 import BeautifulSoup
from docx import Document as DocxDocument


def docx_to_html_and_text(path: str | Path) -> tuple[str, str]:
    doc = DocxDocument(str(path))
    parts: list[str] = []
    texts: list[str] = []
    for i, p in enumerate(doc.paragraphs):
        text = p.text.strip()
        if not text:
            continue
        anchor = f"p{i}"
        style = (p.style.name or "").lower() if p.style else ""
        tag = "h2" if "heading" in style else "p"
        parts.append(f'<{tag} data-anchor="{anchor}">{html.escape(text)}</{tag}>')
        texts.append(text)
    for ti, table in enumerate(doc.tables):
        rows_html: list[str] = []
        for row in table.rows:
            cells = "".join(f"<td>{html.escape(c.text.strip())}</td>" for c in row.cells)
            rows_html.append(f"<tr>{cells}</tr>")
        parts.append(
            f'<table data-anchor="t{ti}"><tbody>{"".join(rows_html)}</tbody></table>'
        )
    html_content = (
        '<div class="tn-doc">' + "".join(parts) + "</div>"
        if parts
        else "<div class='tn-doc'><p></p></div>"
    )
    return html_content, "\n".join(texts)


def html_to_plain(html_content: str) -> str:
    soup = BeautifulSoup(html_content, "html.parser")
    return soup.get_text("\n", strip=True)


def html_to_docx_bytes(html_content: str) -> bytes:
    soup = BeautifulSoup(html_content, "html.parser")
    doc = DocxDocument()
    for el in soup.find_all(["h1", "h2", "h3", "p", "li"]):
        text = el.get_text(" ", strip=True)
        if not text:
            continue
        if el.name.startswith("h"):
            doc.add_heading(text, level=int(el.name[1]))
        else:
            doc.add_paragraph(text)
    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _pdf_font_candidates() -> list[Path]:
    return [
        Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
        Path("/Library/Fonts/Arial Unicode.ttf"),
        Path("/System/Library/Fonts/Supplemental/Times New Roman.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"),
        Path(__file__).resolve().parent.parent.parent / "assets" / "DejaVuSans.ttf",
    ]


def html_to_pdf_bytes(html_content: str, title: str = "Договор") -> bytes:
    """Текстовый PDF (кириллица через системный Unicode-шрифт)."""
    try:
        from fpdf import FPDF
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("fpdf2 не установлен") from exc

    plain = html_to_plain(html_content)
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_page()
    font_path = next((p for p in _pdf_font_candidates() if p.exists()), None)
    if font_path:
        pdf.add_font("TN", "", fname=str(font_path))
        pdf.set_font("TN", size=11)
    else:
        pdf.set_font("Helvetica", size=11)
        plain = plain.encode("ascii", "replace").decode("ascii")
    pdf.multi_cell(0, 6, f"{title}\n\n{plain}")
    out = pdf.output()
    return bytes(out) if isinstance(out, (bytes, bytearray)) else out.encode("latin-1")


def _wrap_nth_block(html: str, index: int, fid: object, anchor: str) -> str | None:
    """Оборачивает N-й p/h в метку finding (якорь вида p0, p1…)."""
    pattern = re.compile(r"(<(?:p|h[1-4]|li)[^>]*>)(.*?)(</(?:p|h[1-4]|li)>)", re.I | re.S)
    matches = list(pattern.finditer(html))
    if index < 0 or index >= len(matches):
        return None
    m = matches[index]
    inner = m.group(2)
    if f'data-finding-id="{fid}"' in inner:
        return html
    wrapped = (
        f'{m.group(1)}<span class="tn-clause-target" data-finding-id="{fid}" '
        f'data-anchor="{anchor}" id="finding-{fid}">{inner}</span>{m.group(3)}'
    )
    return html[: m.start()] + wrapped + html[m.end() :]


def apply_finding_marks(html_content: str, findings: list[dict]) -> str:
    """Mark clauses with data attributes only — no yellow highlight."""
    result = html_content
    for f in findings:
        quote = (f.get("clause_quote") or "").strip()
        fid = f.get("id") or f.get("temp_id") or "x"
        raw_anchor = str(f.get("clause_anchor") or "").strip()
        anchor = html.escape(raw_anchor)
        marked = False

        if quote and len(quote) >= 3:
            escaped = html.escape(quote)
            if escaped in result:
                pin = (
                    f'<span class="tn-clause-target" data-finding-id="{fid}" '
                    f'data-anchor="{anchor}" id="finding-{fid}">{escaped}</span>'
                )
                result = result.replace(escaped, pin, 1)
                marked = True
            else:
                snippet = html.escape(quote[:48])
                pattern = re.compile(re.escape(snippet), re.IGNORECASE)
                if pattern.search(result):
                    result = pattern.sub(
                        lambda m: (
                            f'<span class="tn-clause-target" data-finding-id="{fid}" '
                            f'data-anchor="{anchor}" id="finding-{fid}">{m.group(0)}</span>'
                        ),
                        result,
                        count=1,
                    )
                    marked = True

        if marked:
            continue

        # Якорь LLM вида p0 / p1 → N-й абзац
        p_m = re.fullmatch(r"p(\d+)", raw_anchor, flags=re.I)
        if p_m:
            replaced = _wrap_nth_block(result, int(p_m.group(1)), fid, anchor)
            if replaced is not None:
                result = replaced
                marked = True

        if marked:
            continue

        # По номеру пункта оборачиваем начало абзаца
        num_m = re.search(r"\d+(?:[.,]\d+)+", raw_anchor)
        if not num_m:
            title = str(f.get("title") or "")
            num_m = re.search(r"\d+(?:[.,]\d+)+", title)
        if num_m:
            num = num_m.group(0).replace(",", ".")
            num_pat = re.escape(num).replace(r"\.", r"[.,]")
            block_re = re.compile(
                rf"(<(?:p|h[1-4]|li)[^>]*>)(\s*(?:<[^>]+>)*\s*)({num_pat})(?=[.\s)<])",
                re.IGNORECASE,
            )
            if block_re.search(result):
                result = block_re.sub(
                    lambda m: (
                        f"{m.group(1)}{m.group(2)}"
                        f'<span class="tn-clause-target" data-finding-id="{fid}" '
                        f'data-anchor="{anchor}" id="finding-{fid}">{m.group(3)}</span>'
                    ),
                    result,
                    count=1,
                )
                marked = True

        if marked:
            continue

        # Fallback: следующий свободный абзац без метки
        result = re.sub(
            r"(<(?:p|h2)[^>]*>)(?![^<]*data-finding-id)",
            rf'\1<span class="tn-clause-pin" data-finding-id="{fid}" data-anchor="{anchor}"></span>',
            result,
            count=1,
        )
    return result
