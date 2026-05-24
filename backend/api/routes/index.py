from fastapi import APIRouter, Depends, BackgroundTasks
from context.indexer import code_indexer
from files import get_project
from auth import get_current_user
import uuid
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from db.session import get_db, AsyncSessionLocal
from db.models import User, Project
from core.security import decode_access_token
from agent.runner import run_agent_streaming
from jose import JWTError
from core.broadcaster import manager
from context.watcher import workspace_watcher
from context.indexer import code_indexer
import asyncio  

router = APIRouter()

@router.post("/{project_id}/index")
async def trigger_index(
    project_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await get_project(project_id, db, user)
    background_tasks.add_task(
        code_indexer.index_project,
        project_id,
        project.workspace_path,
    )
    return {"status": "indexing started"}

@router.get("/{project_id}/index/status")
async def index_status(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from sqlalchemy import func, select
    from db.models import CodeChunk
    result = await db.execute(
        select(func.count(CodeChunk.id)).where(
            CodeChunk.project_id == project_id
        )
    )
    count = result.scalar()
    return {"chunks_indexed": count}
