from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class UserRole(str, enum.Enum):
    user = "user"
    admin = "admin"


class InterviewDomain(str, enum.Enum):
    dsa = "dsa"
    cs_fundamentals = "cs_fundamentals"
    lld = "lld"
    hld = "hld"


class InterviewDifficulty(str, enum.Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"
    expert = "expert"


class InterviewStatus(str, enum.Enum):
    draft = "draft"
    scheduled = "scheduled"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


class ReminderStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    failed = "failed"
    cancelled = "cancelled"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    # public handle — defaults to email-local-part on signup, user-editable, must be unique
    handle: Mapped[str | None] = mapped_column(String(50), unique=True, index=True, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="userrole"), default=UserRole.user, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_utcnow, onupdate=_utcnow, nullable=False)

    profile: Mapped[UserProfile] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    interviews: Mapped[list[Interview]] = relationship(back_populates="user")


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    years_experience: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tech_stacks: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    target_role: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    target_company: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_utcnow, onupdate=_utcnow, nullable=False)

    user: Mapped[User] = relationship(back_populates="profile")


class Interview(Base):
    __tablename__ = "interviews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    domain: Mapped[InterviewDomain] = mapped_column(Enum(InterviewDomain, name="interviewdomain"), nullable=False)
    difficulty: Mapped[InterviewDifficulty] = mapped_column(Enum(InterviewDifficulty, name="interviewdifficulty"), nullable=False)
    status: Mapped[InterviewStatus] = mapped_column(Enum(InterviewStatus, name="interviewstatus"), default=InterviewStatus.draft, nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_utcnow, onupdate=_utcnow, nullable=False)

    user: Mapped[User] = relationship(back_populates="interviews")
    messages: Mapped[list[InterviewMessage]] = relationship(back_populates="interview", order_by="InterviewMessage.created_at")
    evaluation: Mapped[InterviewEvaluation | None] = relationship(back_populates="interview", uselist=False)
    reminders: Mapped[list[Reminder]] = relationship(back_populates="interview")


class InterviewMessage(Base):
    __tablename__ = "interview_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    interview_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("interviews.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    clarity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_utcnow, nullable=False)

    interview: Mapped[Interview] = relationship(back_populates="messages")


class InterviewEvaluation(Base):
    __tablename__ = "interview_evaluations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    interview_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("interviews.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    average_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    clarity_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    strengths: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    weaknesses: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    weak_topics: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    improvement_points: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_utcnow, nullable=False)

    interview: Mapped[Interview] = relationship(back_populates="evaluation")


class Reminder(Base):
    __tablename__ = "reminders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    interview_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("interviews.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    send_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    status: Mapped[ReminderStatus] = mapped_column(Enum(ReminderStatus, name="reminderstatus"), default=ReminderStatus.pending, nullable=False)
    retries: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_utcnow, nullable=False)

    interview: Mapped[Interview] = relationship(back_populates="reminders")


class Friend(Base):
    """Directional friendship: user_id → friend_id means user_id has added friend_id."""
    __tablename__ = "friends"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    friend_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_utcnow, nullable=False)


class UserAnalyticsSnapshot(Base):
    __tablename__ = "user_analytics_snapshots"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    total_interviews: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_clarity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rank_tier: Mapped[str] = mapped_column(String(30), default="Newbie", nullable=False)
    last_computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_utcnow, nullable=False)
