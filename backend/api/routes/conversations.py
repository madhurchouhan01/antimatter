from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from db.session import get_db
from db.models import User, Project, Conversation, Message
from api.middleware.auth import get_current_user
import uuid

router = APIRouter()

class MessageOut(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    created_at: str
    model_config = {"from_attributes": True}

class ConversationOut(BaseModel):
    id: uuid.UUID
    title: str | None
    created_at: str
    model_config = {"from_attributes": True}

@router.get("/{project_id}/conversations", response_model=list[ConversationOut])
async def list_conversations(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Conversation).where(Conversation.project_id == project_id)
    )
    return result.scalars().all()

@router.get("/{project_id}/conversations/{conv_id}/messages", response_model=list[MessageOut])
async def get_messages(
    project_id: uuid.UUID,
    conv_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv_id)
        .order_by(Message.created_at)
    )
    return result.scalars().all()