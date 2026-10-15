from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prompt import Prompt, PromptVersion


async def get_prompt(db: AsyncSession, key: str) -> Prompt | None:
    result = await db.execute(select(Prompt).where(Prompt.key == key))
    return result.scalar_one_or_none()


async def list_prompts(db: AsyncSession) -> list[Prompt]:
    result = await db.execute(select(Prompt).order_by(Prompt.key))
    return list(result.scalars().all())


async def save_prompt(
    db: AsyncSession,
    *,
    prompt: Prompt,
    content: str,
    user_id: int | None,
    change_note: str = "",
    source: str = "admin_save",
) -> Prompt:
    prompt.content = content
    prompt.version_number += 1
    version = PromptVersion(
        prompt_id=prompt.id,
        version_number=prompt.version_number,
        content=content,
        change_note=change_note,
        source=source,
        created_by=user_id,
    )
    db.add(version)
    await db.commit()
    await db.refresh(prompt)
    return prompt


async def restore_prompt(
    db: AsyncSession, prompt: Prompt, version: PromptVersion, user_id: int | None
) -> Prompt:
    return await save_prompt(
        db,
        prompt=prompt,
        content=version.content,
        user_id=user_id,
        change_note=f"Restore from v{version.version_number}",
        source="restore",
    )


async def sandbox_run(prompt_content: str, sample_text: str) -> dict:
    """Lightweight sandbox: returns prompt preview + heuristic notes."""
    preview = prompt_content.replace("{{document}}", sample_text[:2000])
    return {
        "rendered_prompt": preview,
        "char_count": len(preview),
        "note": "Песочница: промпт собран локально. Подключите LLM-ключ для живого прогона.",
    }
