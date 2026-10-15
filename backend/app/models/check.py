import enum
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ContractType(str, enum.Enum):
    """Встроенные эвристики; произвольные типы хранятся строкой в CheckType / CheckRun."""

    vehicle_lease = "vehicle_lease"
    real_estate = "real_estate"
    unknown = "unknown"


class CheckRun(Base):
    __tablename__ = "check_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"))
    lawyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    chat_id: Mapped[int | None] = mapped_column(ForeignKey("chats.id"), nullable=True)
    contract_type: Mapped[str] = mapped_column(String(64), default="real_estate")
    playbook_key: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="completed")
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    summary: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    findings = relationship("Finding", back_populates="check_run", cascade="all, delete-orphan")


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[int] = mapped_column(primary_key=True)
    check_run_id: Mapped[int] = mapped_column(ForeignKey("check_runs.id"))
    lawyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"))
    contract_type: Mapped[str] = mapped_column(String(64), default="real_estate")
    clause_anchor: Mapped[str] = mapped_column(String(255))
    clause_quote: Mapped[str] = mapped_column(Text, default="")
    title: Mapped[str] = mapped_column(String(512))
    description: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(32), default="medium")
    error_code: Mapped[str] = mapped_column(String(64), default="generic")
    status: Mapped[str] = mapped_column(String(32), default="open")
    confidence: Mapped[float] = mapped_column(Float, default=0.8)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    check_run = relationship("CheckRun", back_populates="findings")
