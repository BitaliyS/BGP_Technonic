from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import PromptOut, PromptUpdate, PromptVersionOut, SandboxIn
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.prompt import Prompt, PromptVersion
from app.models.user import User
from app.services import prompt_service

router = APIRouter(prefix="/prompts", tags=["prompts"])


@router.get("", response_model=list[PromptOut])
async def list_prompts(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await prompt_service.list_prompts(db)


@router.get("/{prompt_id}", response_model=PromptOut)
async def get_prompt(
    prompt_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    prompt = await db.get(Prompt, prompt_id)
    if not prompt:
        raise HTTPException(404, "Не найден")
    return prompt


@router.patch("/{prompt_id}", response_model=PromptOut)
async def update_prompt(
    prompt_id: int,
    body: PromptUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    prompt = await db.get(Prompt, prompt_id)
    if not prompt:
        raise HTTPException(404, "Не найден")
    return await prompt_service.save_prompt(
        db,
        prompt=prompt,
        content=body.content,
        user_id=user.id,
        change_note=body.change_note,
    )


@router.get("/{prompt_id}/versions", response_model=list[PromptVersionOut])
async def versions(
    prompt_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PromptVersion)
        .where(PromptVersion.prompt_id == prompt_id)
        .order_by(PromptVersion.version_number.desc())
    )
    return list(result.scalars().all())


@router.post("/{prompt_id}/restore/{version_id}", response_model=PromptOut)
async def restore(
    prompt_id: int,
    version_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    prompt = await db.get(Prompt, prompt_id)
    version = await db.get(PromptVersion, version_id)
    if not prompt or not version or version.prompt_id != prompt_id:
        raise HTTPException(404, "Не найден")
    return await prompt_service.restore_prompt(db, prompt, version, user.id)


@router.delete("/{prompt_id}/versions/{version_id}")
async def delete_version(
    prompt_id: int,
    version_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    prompt = await db.get(Prompt, prompt_id)
    version = await db.get(PromptVersion, version_id)
    if not prompt or not version or version.prompt_id != prompt_id:
        raise HTTPException(404, "Версия не найдена")

    count = len(
        (
            await db.execute(
                select(PromptVersion).where(PromptVersion.prompt_id == prompt_id)
            )
        )
        .scalars()
        .all()
    )
    if count <= 1:
        raise HTTPException(400, "Нельзя удалить единственную версию промпта")

    was_current = version.version_number == prompt.version_number
    await db.delete(version)
    await db.flush()

    remaining = (
        await db.execute(
            select(PromptVersion)
            .where(PromptVersion.prompt_id == prompt_id)
            .order_by(PromptVersion.version_number.desc())
        )
    ).scalars().all()
    # Если удалили текущую — откатить live-промпт на последнюю оставшуюся
    if was_current and remaining:
        latest = remaining[0]
        prompt.version_number = latest.version_number
        prompt.content = latest.content
    await db.commit()
    return {"ok": True, "version_number": prompt.version_number}


@router.post("/sandbox")
async def sandbox(
    body: SandboxIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    content = body.prompt_content
    if body.prompt_key and not content:
        p = await prompt_service.get_prompt(db, body.prompt_key)
        if not p:
            raise HTTPException(404, "Промпт не найден")
        content = p.content
    if not content:
        raise HTTPException(400, "Нужен prompt_content или prompt_key")
    return await prompt_service.sandbox_run(content, body.sample_text)
