from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import FindingOut, TeamStatsOut
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.check import CheckRun, Finding
from app.models.user import User, UserRole

router = APIRouter(prefix="/team", tags=["team"])


@router.get("/stats", response_model=TeamStatsOut)
async def team_stats(
    contract_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    day_ago = now - timedelta(days=1)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    lawyers = (
        await db.execute(
            select(User).where(User.role == UserRole.lawyer.value, User.is_active == True)  # noqa: E712
        )
    ).scalars().all()

    checks_q = select(CheckRun)
    findings_q = select(Finding)
    if contract_type:
        checks_q = checks_q.where(CheckRun.contract_type == contract_type)
        findings_q = findings_q.where(Finding.contract_type == contract_type)

    checks = (await db.execute(checks_q)).scalars().all()
    findings = (await db.execute(findings_q)).scalars().all()

    def _aware(dt: datetime) -> datetime:
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt

    def _type_key(value: object) -> str:
        return value.value if hasattr(value, "value") else str(value)

    checks_day = sum(1 for c in checks if _aware(c.created_at) >= day_ago)
    checks_week = sum(1 for c in checks if _aware(c.created_at) >= week_ago)
    checks_month = sum(1 for c in checks if _aware(c.created_at) >= month_ago)

    by_type: dict[str, dict] = defaultdict(lambda: {"checks": 0, "errors": 0})
    for c in checks:
        by_type[_type_key(c.contract_type)]["checks"] += 1
        by_type[_type_key(c.contract_type)]["errors"] += c.error_count

    code_counter: Counter[str] = Counter()
    code_examples: dict[str, Finding] = {}
    for f in findings:
        code_counter[f.error_code] += 1
        code_examples.setdefault(f.error_code, f)

    frequent = []
    rare = []
    for code, cnt in code_counter.most_common():
        ex = code_examples[code]
        item = {
            "error_code": code,
            "count": cnt,
            "title": ex.title,
            "description": ex.description,
            "contract_type": _type_key(ex.contract_type),
        }
        if cnt >= 2:
            frequent.append(item)
        else:
            rare.append(item)

    lawyer_stats = []
    for law in lawyers:
        law_checks = [c for c in checks if c.lawyer_id == law.id]
        law_errors = sum(c.error_count for c in law_checks)
        lawyer_stats.append(
            {
                "id": law.id,
                "full_name": law.full_name,
                "email": law.email,
                "checks": len(law_checks),
                "errors": law_errors,
            }
        )

    return TeamStatsOut(
        lawyers_count=len(lawyers),
        checks_day=checks_day,
        checks_week=checks_week,
        checks_month=checks_month,
        errors_total=sum(f.error_count for f in checks) if checks else len(findings),
        by_contract_type=dict(by_type),
        frequent_errors=frequent[:10],
        rare_errors=rare[:10],
        lawyers=lawyer_stats,
    )


@router.get("/findings", response_model=list[FindingOut])
async def list_findings(
    lawyer_id: int | None = None,
    document_id: int | None = None,
    contract_type: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(Finding).order_by(Finding.created_at.desc()).limit(200)
    if lawyer_id:
        q = q.where(Finding.lawyer_id == lawyer_id)
    if document_id:
        q = q.where(Finding.document_id == document_id)
    if contract_type:
        q = q.where(Finding.contract_type == contract_type)
    result = await db.execute(q)
    return list(result.scalars().all())
