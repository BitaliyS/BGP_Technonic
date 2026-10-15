from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.projects import _ensure_project
from app.api.schemas import DocumentOut, DocumentSaveIn, DocumentVersionOut
from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.document import Document, DocumentVersion
from app.models.user import User
from app.services.anonymize import anonymize_html, anonymize_text
from app.services.document_io import docx_to_html_and_text, html_to_docx_bytes, html_to_plain
from app.services.playbooks import classify_contract

router = APIRouter(tags=["documents"])


@router.get("/projects/{project_id}/documents", response_model=list[DocumentOut])
async def list_documents(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _ensure_project(db, project_id, user)
    result = await db.execute(
        select(Document).where(Document.project_id == project_id).order_by(Document.id.desc())
    )
    return list(result.scalars().all())


@router.post("/projects/{project_id}/documents", response_model=DocumentOut)
async def upload_document(
    project_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _ensure_project(db, project_id, user)
    suffix = Path(file.filename or "doc.docx").suffix.lower() or ".docx"
    dest = Path(settings.upload_dir) / f"{uuid4().hex}{suffix}"
    content = await file.read()
    dest.write_bytes(content)

    if suffix == ".docx":
        html_content, plain = docx_to_html_and_text(dest)
    else:
        plain = content.decode("utf-8", errors="ignore")
        html_content = "<div class='tn-doc'>" + "".join(
            f'<p data-anchor="p{i}">{line}</p>' for i, line in enumerate(plain.splitlines()) if line.strip()
        ) + "</div>"

    ct = classify_contract(plain)
    doc = Document(
        project_id=project_id,
        filename=file.filename or dest.name,
        storage_path=str(dest),
        html_content=html_content,
        plain_text=plain,
        contract_type=ct.value,
        revision=1,
    )
    db.add(doc)
    await db.flush()
    db.add(
        DocumentVersion(
            document_id=doc.id,
            revision=1,
            html_content=html_content,
            storage_path=str(dest),
            note="upload",
        )
    )
    await db.commit()
    await db.refresh(doc)
    return doc


@router.get("/documents/{document_id}", response_model=DocumentOut)
async def get_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(404, "Документ не найден")
    await _ensure_project(db, doc.project_id, user)
    return doc


@router.put("/documents/{document_id}", response_model=DocumentOut)
async def save_document(
    document_id: int,
    body: DocumentSaveIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(404, "Документ не найден")
    await _ensure_project(db, doc.project_id, user)
    doc.html_content = body.html_content
    doc.plain_text = html_to_plain(body.html_content)
    doc.revision += 1
    db.add(
        DocumentVersion(
            document_id=doc.id,
            revision=doc.revision,
            html_content=body.html_content,
            note=body.note or "save",
        )
    )
    await db.commit()
    await db.refresh(doc)
    return doc


@router.get("/documents/{document_id}/versions", response_model=list[DocumentVersionOut])
async def list_versions(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(404, "Документ не найден")
    await _ensure_project(db, doc.project_id, user)
    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.revision.desc())
    )
    return list(result.scalars().all())


@router.post("/documents/{document_id}/anonymize", response_model=DocumentOut)
async def anonymize_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(404, "Документ не найден")
    await _ensure_project(db, doc.project_id, user)
    doc.html_content = anonymize_html(doc.html_content)
    doc.plain_text = anonymize_text(doc.plain_text)
    doc.is_anonymized = True
    doc.revision += 1
    db.add(
        DocumentVersion(
            document_id=doc.id,
            revision=doc.revision,
            html_content=doc.html_content,
            note="anonymize",
        )
    )
    await db.commit()
    await db.refresh(doc)
    return doc


@router.get("/documents/{document_id}/download")
async def download_document(
    document_id: int,
    format: str = "docx",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(404, "Документ не найден")
    await _ensure_project(db, doc.project_id, user)
    base = Path(doc.filename or "document").stem
    fmt = (format or "docx").lower().strip()
    if fmt == "pdf":
        from app.services.document_io import html_to_pdf_bytes

        data = html_to_pdf_bytes(doc.html_content, title=doc.filename)
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{base}.pdf"'},
        )
    data = html_to_docx_bytes(doc.html_content)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{base}.docx"'},
    )
