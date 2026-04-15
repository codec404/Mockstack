"""add total_points and rank_tier to user_analytics_snapshots

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-14 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_analytics_snapshots",
        sa.Column("total_points", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "user_analytics_snapshots",
        sa.Column("rank_tier", sa.String(30), nullable=False, server_default="Newbie"),
    )


def downgrade() -> None:
    op.drop_column("user_analytics_snapshots", "rank_tier")
    op.drop_column("user_analytics_snapshots", "total_points")
