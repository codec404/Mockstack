"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-01 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(512), nullable=False),
        sa.Column("role", sa.Enum("user", "admin", name="userrole"), nullable=False, server_default="user"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=False),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "user_profiles",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("years_experience", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tech_stacks", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("target_role", sa.String(200), nullable=False, server_default=""),
        sa.Column("target_company", sa.String(200), nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=False),
    )

    op.create_table(
        "interviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("domain", sa.Enum("dsa", "cs_fundamentals", "lld", "hld", name="interviewdomain"), nullable=False),
        sa.Column("difficulty", sa.Enum("easy", "medium", "hard", "expert", name="interviewdifficulty"), nullable=False),
        sa.Column("status", sa.Enum("draft", "scheduled", "in_progress", "completed", "cancelled", name="interviewstatus"), nullable=False, server_default="draft"),
        sa.Column("scheduled_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=False),
    )
    op.create_index("ix_interviews_user_id", "interviews", ["user_id"])

    op.create_table(
        "interview_messages",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("interview_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("interviews.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("score", sa.Integer, nullable=True),
        sa.Column("clarity", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False),
    )
    op.create_index("ix_interview_messages_interview_id", "interview_messages", ["interview_id"])

    op.create_table(
        "interview_evaluations",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("interview_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("interviews.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("average_score", sa.Integer, nullable=False, server_default="0"),
        sa.Column("clarity_score", sa.Integer, nullable=False, server_default="0"),
        sa.Column("strengths", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("weaknesses", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("weak_topics", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("improvement_points", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("summary", sa.Text, nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False),
    )
    op.create_index("ix_interview_evaluations_interview_id", "interview_evaluations", ["interview_id"])

    op.create_table(
        "reminders",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("interview_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("interviews.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("send_at", sa.DateTime(timezone=False), nullable=False),
        sa.Column("status", sa.Enum("pending", "sent", "failed", "cancelled", name="reminderstatus"), nullable=False, server_default="pending"),
        sa.Column("retries", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text, nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False),
    )
    op.create_index("ix_reminders_interview_id", "reminders", ["interview_id"])

    op.create_table(
        "user_analytics_snapshots",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("total_interviews", sa.Integer, nullable=False, server_default="0"),
        sa.Column("avg_score", sa.Integer, nullable=False, server_default="0"),
        sa.Column("avg_clarity", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_computed_at", sa.DateTime(timezone=False), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("user_analytics_snapshots")
    op.drop_table("reminders")
    op.drop_table("interview_evaluations")
    op.drop_table("interview_messages")
    op.drop_table("interviews")
    op.drop_table("user_profiles")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS reminderstatus")
    op.execute("DROP TYPE IF EXISTS interviewstatus")
    op.execute("DROP TYPE IF EXISTS interviewdifficulty")
    op.execute("DROP TYPE IF EXISTS interviewdomain")
    op.execute("DROP TYPE IF EXISTS userrole")
