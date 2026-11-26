"""document evaluation committee members

Revision ID: d4e5f6a7b8c9
Revises: f6a7b8c9d0e1
Create Date: 2026-11-25 14:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "contract_doc_evaluation_members",
        sa.Column("contract_id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["contract_id"],
            ["contracts.id"],
            name=op.f("fk_contract_doc_evaluation_members_contract_id_contracts"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["member_id"],
            ["evaluation_team_members.id"],
            name=op.f(
                "fk_contract_doc_evaluation_members_member_id_evaluation_team_members"
            ),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "contract_id", "member_id", name=op.f("pk_contract_doc_evaluation_members")
        ),
    )


def downgrade() -> None:
    op.drop_table("contract_doc_evaluation_members")
