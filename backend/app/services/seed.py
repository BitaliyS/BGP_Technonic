from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.check_type import CheckType
from app.models.prompt import Prompt, PromptVersion
from app.models.user import User, UserRole

DEFAULT_PROMPTS = [
    {
        "key": "check_vehicle_lease",
        "title": "Проверка: договор аренды ТС",
        "contract_type": "vehicle_lease",
        "content": (
            "Ты юрист Технониколь. Проверь договор аренды транспортного средства.\n"
            "Сфокусируйся на: VIN/госномер, страхование, неустойки, возврат ТС, "
            "ответственность при ДТП, акт приёма-передачи.\n"
            "Документ:\n{{document}}\n"
            "Верни список замечаний с привязкой к пунктам."
        ),
    },
    {
        "key": "check_real_estate",
        "title": "Проверка: аренда недвижимости",
        "contract_type": "real_estate",
        "content": (
            "Ты юрист Технониколь. Проверь договор аренды недвижимости.\n"
            "Сфокусируйся на: кадастровый номер, адрес, регистрация/ЕГРН, оплата, "
            "расторжение, обременения.\n"
            "Документ:\n{{document}}\n"
            "Верни список замечаний с привязкой к пунктам."
        ),
    },
    {
        "key": "classify_contract",
        "title": "Классификация типа договора",
        "contract_type": "general",
        "content": (
            "Определи тип договора: vehicle_lease (аренда ТС) или real_estate (недвижимость).\n"
            "{{document}}"
        ),
    },
]

DEFAULT_CHECK_TYPES = [
    {
        "key": "real_estate",
        "title": "Аренда недвижимости",
        "description": "Договоры аренды помещений, зданий, земельных участков",
        "prompt_key": "check_real_estate",
        "sort_order": 10,
    },
    {
        "key": "vehicle_lease",
        "title": "Договор аренды ТС",
        "description": "Аренда транспортных средств",
        "prompt_key": "check_vehicle_lease",
        "sort_order": 20,
    },
]

DEMO_USERS = [
    ("A_Shorin", "А. Шорин", "BGP_Nicol_legaltech", UserRole.admin.value),
]


async def ensure_primary_user(db: AsyncSession) -> None:
    """Идемпотентно создаёт/обновляет основной логин для входа."""
    login, name, password, role = DEMO_USERS[0]
    user = await db.scalar(select(User).where(User.email == login))
    if user:
        user.full_name = name
        user.hashed_password = hash_password(password)
        user.role = role
        user.is_active = True
    else:
        db.add(
            User(
                email=login,
                full_name=name,
                hashed_password=hash_password(password),
                role=role,
            )
        )
    await db.commit()


async def seed_if_empty(db: AsyncSession) -> None:
    existing = await db.execute(select(User).limit(1))
    if existing.scalar_one_or_none():
        await ensure_primary_user(db)
        return

    for email, name, password, role in DEMO_USERS:
        db.add(
            User(
                email=email,
                full_name=name,
                hashed_password=hash_password(password),
                role=role,
            )
        )
    await db.flush()

    for p in DEFAULT_PROMPTS:
        prompt = Prompt(
            key=p["key"],
            title=p["title"],
            contract_type=p["contract_type"],
            content=p["content"],
            version_number=1,
        )
        db.add(prompt)
        await db.flush()
        db.add(
            PromptVersion(
                prompt_id=prompt.id,
                version_number=1,
                content=p["content"],
                change_note="seed",
                source="seed",
            )
        )
    await db.commit()
    await seed_check_types(db)


async def seed_check_types(db: AsyncSession) -> None:
    """Идемпотентно создаёт типы проверки — подтягиваются в UI «Проверить»."""
    for p in DEFAULT_PROMPTS:
        existing_p = await db.scalar(select(Prompt).where(Prompt.key == p["key"]))
        if not existing_p:
            prompt = Prompt(
                key=p["key"],
                title=p["title"],
                contract_type=p["contract_type"],
                content=p["content"],
                version_number=1,
            )
            db.add(prompt)
            await db.flush()
            db.add(
                PromptVersion(
                    prompt_id=prompt.id,
                    version_number=1,
                    content=p["content"],
                    change_note="seed",
                    source="seed",
                )
            )

    for ct in DEFAULT_CHECK_TYPES:
        existing = await db.scalar(select(CheckType).where(CheckType.key == ct["key"]))
        if existing:
            continue
        db.add(
            CheckType(
                key=ct["key"],
                title=ct["title"],
                description=ct["description"],
                prompt_key=ct["prompt_key"],
                is_active=True,
                sort_order=ct["sort_order"],
            )
        )
    await db.commit()
