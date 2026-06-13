"""add agent_memories episodic memory table

Revision ID: a1b2c3d4e5f6
Revises: f4176c07dc24
Create Date: 2026-06-13 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
import pgvector

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f4176c07dc24"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_memories",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("task_description", sa.Text(), nullable=False),
        sa.Column("context_signature", sa.dialects.postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("what_worked", sa.Text(), nullable=True),
        sa.Column("what_failed_first", sa.Text(), nullable=True),
        sa.Column("generalizable_lesson", sa.Text(), nullable=False),
        sa.Column("embedding", pgvector.sqlalchemy.vector.VECTOR(dim=1024), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_retrieved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retrieval_count", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # HNSW index for fast approximate nearest-neighbour cosine search.
    # Preferred over IVFFlat for tables that start small and grow incrementally
    # (no need to pre-specify list count or re-train).
    op.execute("""
        CREATE INDEX idx_agent_memories_embedding
        ON agent_memories
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)

    # GIN index for JSONB path queries on context_signature
    op.execute("""
        CREATE INDEX idx_agent_memories_context_sig
        ON agent_memories
        USING GIN (context_signature jsonb_path_ops)
    """)

    # Btree index for fast per-project scoping
    op.execute("""
        CREATE INDEX idx_agent_memories_project_id
        ON agent_memories (project_id)
    """)


def downgrade() -> None:
    op.drop_table("agent_memories")
