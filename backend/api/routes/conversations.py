from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from db.session import get_db
from db.models import User, Project, Conversation, Message
from api.middleware.auth import get_current_user
import uuid
from datetime import datetime

router = APIRouter()

class MessageOut(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    tool_calls: list | dict | None = None
    token_usage: dict | None = None
    created_at: datetime
    model_config = {"from_attributes": True}

class ConversationOut(BaseModel):
    id: uuid.UUID
    title: str | None
    created_at: datetime
    model_config = {"from_attributes": True}

class ConversationUpdate(BaseModel):
    title: str

@router.get("/{project_id}/conversations", response_model=list[ConversationOut])
async def list_conversations(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project_result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == user.id)
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(Conversation)
        .where(Conversation.project_id == project_id)
        .order_by(Conversation.created_at.desc())
    )
    return result.scalars().all()

@router.get("/{project_id}/conversations/{conv_id}/messages", response_model=list[MessageOut])
async def get_messages(
    project_id: uuid.UUID,
    conv_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project_result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == user.id)
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv_id)
        .order_by(Message.created_at)
    )
    return result.scalars().all()

@router.put("/{project_id}/conversations/{conv_id}", response_model=ConversationOut)
async def update_conversation(
    project_id: uuid.UUID,
    conv_id: uuid.UUID,
    payload: ConversationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project_result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == user.id)
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conv_id,
            Conversation.project_id == project_id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conv.title = payload.title
    await db.commit()
    await db.refresh(conv)
    return conv

@router.delete("/{project_id}/conversations/{conv_id}")
async def delete_conversation(
    project_id: uuid.UUID,
    conv_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project_result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == user.id)
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conv_id,
            Conversation.project_id == project_id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    await db.delete(conv)
    await db.commit()
    return {"status": "success", "message": "Conversation deleted successfully"}