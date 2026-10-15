import json
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.check_type import CheckType
from app.models.prompt import Prompt, PromptVersion
from app.models.user import User, UserRole
from app.services.skill_compiler import compile_check_skill, parse_rules, rules_to_json

router = APIRouter(prefix="/check-types", tags=["check-types"])


class CheckTypeOut(BaseModel):
    id: int
    key: str
    title: str
    description: str
    prompt_key: str
    rules: list[str] = []
    is_active: bool
    sort_order: int

    model_config = {"from_attributes": True}


class CheckTypeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    key: str | None = None
    description: str = ""
    rules: list[str] = []
    prompt_content: str | None = None
    sort_order: int = 100
    is_active: bool = True


class CheckTypeUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    rules: list[str] | None = None
    prompt_content: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


def _slugify(value: str) -> str:
    s = value.lower().strip()
    s = re.sub(r"[^a-z0-9а-яё]+", "_", s, flags=re.IGNORECASE)
    s = re.sub(r"_+", "_", s).strip("_")
    trans = {
        "аренда": "lease",
        "недвижимость": "real_estate",
        "договор": "contract",
        "поставка": "supply",
        "подряд": "contract_work",
        "услуги": "services",
    }
    for ru, en in trans.items():
        s = s.replace(ru, en)
    s = re.sub(r"[^a-z0-9_]+", "", s)
    return s[:64] or "check_type"


def _to_out(item: CheckType) -> CheckTypeOut:
    return CheckTypeOut(
        id=item.id,
        key=item.key,
        title=item.title,
        description=item.description or "",
        prompt_key=item.prompt_key or "",
        rules=parse_rules(getattr(item, "rules_json", None) or "[]"),
        is_active=item.is_active,
        sort_order=item.sort_order,
    )


async def _upsert_prompt(
    db: AsyncSession,
    *,
    prompt_key: str,
    title: str,
    contract_type: str,
    content: str,
    user_id: int | None,
    note: str,
) -> Prompt:
    prompt = await db.scalar(select(Prompt).where(Prompt.key == prompt_key))
    if not prompt:
        prompt = Prompt(
            key=prompt_key,
            title=f"Скилл: {title}",
            contract_type=contract_type,
            content=content,
            version_number=1,
        )
        db.add(prompt)
        await db.flush()
        db.add(
            PromptVersion(
                prompt_id=prompt.id,
                version_number=1,
                content=content,
                change_note=note,
                source="skill_compile",
                created_by=user_id,
            )
        )
        return prompt

    prompt.title = f"Скилл: {title}"
    prompt.contract_type = contract_type
    if prompt.content != content:
        prompt.content = content
        prompt.version_number += 1
        db.add(
            PromptVersion(
                prompt_id=prompt.id,
                version_number=prompt.version_number,
                content=content,
                change_note=note,
                source="skill_compile",
                created_by=user_id,
            )
        )
    return prompt


@router.get("", response_model=list[CheckTypeOut])
async def list_check_types(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(CheckType).order_by(CheckType.sort_order.asc(), CheckType.id.asc())
    if active_only:
        q = q.where(CheckType.is_active == True)  # noqa: E712
    items = list((await db.execute(q)).scalars().all())
    return [_to_out(x) for x in items]


@router.post("", response_model=CheckTypeOut)
async def create_check_type(
    body: CheckTypeCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    key = (body.key or _slugify(body.title)).strip().lower()
    key = re.sub(r"[^a-z0-9_]+", "", key) or _slugify(body.title)
    if not key:
        raise HTTPException(400, "Некорректный ключ типа")

    existing = await db.execute(select(CheckType).where(CheckType.key == key))
    if existing.scalar_one_or_none():
        raise HTTPException(400, f"Тип с кодом «{key}» уже есть")

    rules = parse_rules(body.rules)
    content = (body.prompt_content or "").strip() or compile_check_skill(
        title=body.title.strip(),
        description=body.description or "",
        rules=rules,
    )
    prompt_key = f"check_{key}"
    await _upsert_prompt(
        db,
        prompt_key=prompt_key,
        title=body.title.strip(),
        contract_type=key,
        content=content,
        user_id=user.id,
        note="create_skill",
    )

    item = CheckType(
        key=key,
        title=body.title.strip(),
        description=(body.description or "").strip(),
        prompt_key=prompt_key,
        rules_json=rules_to_json(rules),
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _to_out(item)


@router.patch("/{type_id}", response_model=CheckTypeOut)
async def update_check_type(
    type_id: int,
    body: CheckTypeUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin)),
):
    item = await db.get(CheckType, type_id)
    if not item:
        raise HTTPException(404, "Тип не найден")

    if body.title is not None:
        item.title = body.title.strip() or item.title
    if body.description is not None:
        item.description = body.description.strip()
    if body.sort_order is not None:
        item.sort_order = body.sort_order
    if body.is_active is not None:
        item.is_active = body.is_active

    rules = parse_rules(item.rules_json)
    if body.rules is not None:
        rules = parse_rules(body.rules)
        item.rules_json = rules_to_json(rules)

    need_recompile = body.rules is not None or body.title is not None or body.description is not None
    content = body.prompt_content
    if content is None and need_recompile:
        content = compile_check_skill(
            title=item.title,
            description=item.description or "",
            rules=rules,
        )
    if content is not None and item.prompt_key:
        await _upsert_prompt(
            db,
            prompt_key=item.prompt_key,
            title=item.title,
            contract_type=item.key,
            content=content,
            user_id=user.id,
            note="update_skill",
        )

    await db.commit()
    await db.refresh(item)
    return _to_out(item)


@router.delete("/{type_id}")
async def delete_check_type(
    type_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
):
    item = await db.get(CheckType, type_id)
    if not item:
        raise HTTPException(404, "Тип не найден")
    item.is_active = False
    await db.commit()
    return {"ok": True}
