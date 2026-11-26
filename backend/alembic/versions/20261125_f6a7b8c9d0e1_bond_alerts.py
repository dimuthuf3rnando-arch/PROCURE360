"""bond alert ledger

Revision ID: f6a7b8c9d0e1
Revises: a1b2c3d4e5f6
Create Date: 2026-11-25 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bond_alerts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("contract_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("expiry_date", sa.Date(), nullable=False),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["contract_id"],
            ["contracts.id"],
            name=op.f("fk_bond_alerts_contract_id_contracts"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_bond_alerts_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bond_alerts")),
        sa.UniqueConstraint(
            "user_id",
            "contract_id",
            "kind",
            "expiry_date",
            name="uq_bond_alerts_scope",
        ),
    )
    # Preserve alerts already delivered before the ledger existed.
    op.execute(
        """
        INSERT OR IGNORE INTO bond_alerts (user_id, contract_id, kind, expiry_date, notified_at)
        SELECT notifications.user_id,
               notifications.contract_id,
               notifications.kind,
               contracts.p_bond_expiry_date,
               notifications.created_at
        FROM notifications
        JOIN contracts ON contracts.id = notifications.contract_id
        WHERE notifications.kind IN ('bond_expiring', 'bond_expired')
          AND notifications.contract_id IS NOT NULL
          AND contracts.p_bond_expiry_date IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_table("bond_alerts")
