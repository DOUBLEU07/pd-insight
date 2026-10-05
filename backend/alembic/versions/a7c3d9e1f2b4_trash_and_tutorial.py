"""trash (soft delete) and first-use tutorial flag

Revision ID: a7c3d9e1f2b4
Revises: 39626a238bda
Create Date: 2026-10-04 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c3d9e1f2b4'
down_revision: Union[str, Sequence[str], None] = '39626a238bda'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TRASHABLE = ('batches', 'cases', 'calibration_presets', 'trained_models')


def upgrade() -> None:
    for table in TRASHABLE:
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.add_column(sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
            batch_op.create_index(batch_op.f(f'ix_{table}_deleted_at'), ['deleted_at'], unique=False)

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('tutorial_seen_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('tutorial_seen_at')

    for table in TRASHABLE:
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.drop_index(batch_op.f(f'ix_{table}_deleted_at'))
            batch_op.drop_column('deleted_at')
