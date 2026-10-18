import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import auth, chat, check_types, documents, findings, projects, prompts, stats, users
from app.core.config import settings
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.services.seed import ensure_primary_user, seed_check_types, seed_if_empty

# Import models so metadata is registered
import app.models  # noqa: F401

logger = logging.getLogger("uvicorn.error")


def _ensure_sqlite_columns(sync_conn) -> None:
    """Добавляет новые колонки в уже существующую SQLite БД."""
    try:
        rows = sync_conn.exec_driver_sql("PRAGMA table_info(check_types)").fetchall()
        cols = {r[1] for r in rows}
        if "rules_json" not in cols:
            sync_conn.exec_driver_sql(
                "ALTER TABLE check_types ADD COLUMN rules_json TEXT DEFAULT '[]'"
            )
    except Exception:
        pass
    try:
        rows = sync_conn.exec_driver_sql("PRAGMA table_info(projects)").fetchall()
        cols = {r[1] for r in rows}
        if "kind" not in cols:
            sync_conn.exec_driver_sql(
                "ALTER TABLE projects ADD COLUMN kind VARCHAR(32) DEFAULT 'project'"
            )
        sync_conn.exec_driver_sql(
            "UPDATE projects SET kind = 'project' WHERE kind IS NULL OR kind = ''"
        )
    except Exception:
        pass


@asynccontextmanager
async def lifespan(_: FastAPI):
    db_url = settings.database_url
    safe = db_url.split("@")[-1] if "@" in db_url else db_url
    is_pg = db_url.startswith("postgresql")
    logger.info("DB init → %s | metadata tables=%s", safe, list(Base.metadata.tables))

    # Отдельные транзакции: ошибка DDL не должна травить seed
    async with engine.begin() as conn:
        if is_pg:
            await conn.execute(text("DROP TYPE IF EXISTS user_role CASCADE"))
        await conn.run_sync(Base.metadata.create_all)

    if not is_pg:
        async with engine.begin() as conn:
            await conn.run_sync(_ensure_sqlite_columns)

    if is_pg:
        async with engine.connect() as conn:
            rows = (
                await conn.execute(
                    text(
                        "SELECT tablename FROM pg_catalog.pg_tables "
                        "WHERE schemaname = 'public' ORDER BY 1"
                    )
                )
            ).fetchall()
            tables = [r[0] for r in rows]
            logger.info("Postgres public tables: %s", tables)
            if "users" not in tables:
                raise RuntimeError(
                    f"create_all did not create users; tables={tables}; "
                    f"metadata={list(Base.metadata.tables)}"
                )

    async with SessionLocal() as db:
        await seed_if_empty(db)
        await ensure_primary_user(db)
        await seed_check_types(db)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(prompts.router, prefix="/api")
app.include_router(check_types.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(findings.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": settings.app_name}
