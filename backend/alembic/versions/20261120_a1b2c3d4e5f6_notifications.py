"""notifications

Revision ID: a1b2c3d4e5f6
Revises: 96950c9d9679
Create Date: 2026-11-20 08:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '96950c9d9679'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('contract_id', sa.Integer(), nullable=True),
        sa.Column('actor_id', sa.Integer(), nullable=True),
        sa.Column('kind', sa.String(length=40), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('is_read', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], name=op.f('fk_notifications_actor_id_users'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['contract_id'], ['contracts.id'], name=op.f('fk_notifications_contract_id_contracts'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_notifications_user_id_users'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_notifications')),
    )
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_notifications_contract_id'), ['contract_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_notifications_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_notifications_is_read'), ['is_read'], unique=False)
        batch_op.create_index(batch_op.f('ix_notifications_kind'), ['kind'], unique=False)
        batch_op.create_index(batch_op.f('ix_notifications_user_id'), ['user_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_notifications_user_id'))
        batch_op.drop_index(batch_op.f('ix_notifications_kind'))
        batch_op.drop_index(batch_op.f('ix_notifications_is_read'))
        batch_op.drop_index(batch_op.f('ix_notifications_created_at'))
        batch_op.drop_index(batch_op.f('ix_notifications_contract_id'))
    op.drop_table('notifications')
