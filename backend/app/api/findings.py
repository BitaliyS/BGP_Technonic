from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.check import Finding
from app.models.user import User

router = APIRouter(prefix="/findings", tags=["findings"])


class FindingStatusIn(BaseModel):
    status: str  # open | fixed


@router.patch("/{finding_id}")
async def update_finding_status(
    finding_id: int,
    body: FindingStatusIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if body.status not in {"open", "fixed"}:
        raise HTTPException(400, "status must be open|fixed")
    finding = await db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(404, "Не найден")
    finding.status = body.status
    await db.commit()
    await db.refresh(finding)
    return {
        "id": finding.id,
        "status": finding.status,
        "title": finding.title,
        "description": finding.description,
        "clause_anchor": finding.clause_anchor,
        "severity": finding.severity,
    }
