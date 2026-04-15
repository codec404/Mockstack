"""add handle to users and friends table

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-14
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add handle column to users (nullable, unique)
    op.add_column("users", sa.Column("handle", sa.String(50), nullable=True))
    op.create_index("ix_users_handle", "users", ["handle"], unique=True)

    # Back-fill existing users: handle = email local-part (truncated to 50 chars)
    op.execute("""
        UPDATE users
        SET handle = LEFT(SPLIT_PART(email, '@', 1), 50)
        WHERE handle IS NULL
    """)

    # Create friends table
    op.create_table(
        "friends",
        sa.Column("user_id",   sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("friend_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("friends")
    op.drop_index("ix_users_handle", table_name="users")
    op.drop_column("users", "handle")
