"""
Episodic memory REST API.

GET    /api/projects/{project_id}/memories          → paginated list
GET    /api/projects/{project_id}/memories/{id}     → single memory
DELETE /api/projects/{project_id}/memories/{id}     → hard delete
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from api.middleware.auth import get_current_user
from db.models import AgentMemory, Project
from db.session import get_db
from core.logger import get_logger

router = APIRouter(tags=["memories"])
log = get_logger(__name__)


# ── Schemas ──────────────────────────────────────────────────────────────────

class MemoryResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    task_description: str
    generalizable_lesson: str
    context_signature: dict[str, Any]
    what_worked: str | None
    what_failed_first: str | None
    retrieval_count: int
    created_at: str
    last_retrieved_at: str | None

    @classmethod
    def from_orm(cls, m: AgentMemory) -> "MemoryResponse":
        return cls(
            id=m.id,
            project_id=m.project_id,
            user_id=m.user_id,
            task_description=m.task_description,
            generalizable_lesson=m.generalizable_lesson,
            context_signature=m.context_signature or {},
            what_worked=m.what_worked,
            what_failed_first=m.what_failed_first,
            retrieval_count=m.retrieval_count,
            created_at=m.created_at.isoformat(),
            last_retrieved_at=m.last_retrieved_at.isoformat() if m.last_retrieved_at else None,
        )


class MemoryListResponse(BaseModel):
    items: list[MemoryResponse]
    total: int
    page: int
    page_size: int


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _get_project_or_403(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return project


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/api/projects/{project_id}/memories", response_model=MemoryListResponse)
async def list_memories(
    project_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """List episodic memories for a project, newest first. Paginated."""
    await _get_project_or_403(project_id, user.id, db)

    offset = (page - 1) * page_size

    # Total count
    count_result = await db.execute(
        select(func.count()).where(AgentMemory.project_id == project_id)
    )
    total = count_result.scalar_one()

    # Paginated rows
    rows_result = await db.execute(
        select(AgentMemory)
        .where(AgentMemory.project_id == project_id)
        .order_by(AgentMemory.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    memories = rows_result.scalars().all()

    return MemoryListResponse(
        items=[MemoryResponse.from_orm(m) for m in memories],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/api/projects/{project_id}/memories/{memory_id}", response_model=MemoryResponse)
async def get_memory(
    project_id: uuid.UUID,
    memory_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Get a single episodic memory by ID."""
    await _get_project_or_403(project_id, user.id, db)

    result = await db.execute(
        select(AgentMemory).where(
            AgentMemory.id == memory_id,
            AgentMemory.project_id == project_id,
        )
    )
    memory = result.scalar_one_or_none()
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")

    return MemoryResponse.from_orm(memory)


@router.delete("/api/projects/{project_id}/memories/{memory_id}", status_code=204)
async def delete_memory(
    project_id: uuid.UUID,
    memory_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Hard-delete a single episodic memory."""
    await _get_project_or_403(project_id, user.id, db)

    result = await db.execute(
        delete(AgentMemory).where(
            AgentMemory.id == memory_id,
            AgentMemory.project_id == project_id,
        ).returning(AgentMemory.id)
    )
    deleted = result.fetchone()
    if not deleted:
        raise HTTPException(status_code=404, detail="Memory not found")

    await db.commit()
    log.info("Memory deleted", memory_id=str(memory_id), project=str(project_id))
