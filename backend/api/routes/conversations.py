from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from db.session import get_db
from db.models import User, Project, Conversation, Message, UserSettings
from api.middleware.auth import get_current_user
import uuid
from datetime import datetime, timezone

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

@router.post("/{project_id}/conversations/{conv_id}/compress")
async def compress_conversation(
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

    # Load messages
    msg_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv_id)
        .order_by(Message.created_at)
    )
    messages = msg_result.scalars().all()

    if not messages:
        return {"status": "success", "summary": "No messages to compress."}

    # Format conversation history
    history_text = ""
    for m in messages:
        if m.role == "user":
            history_text += f"[User]: {m.content}\n"
        elif m.role == "assistant":
            if m.tool_calls:
                history_text += f"[Assistant (Tool Call)]: {m.content}\n"
            else:
                history_text += f"[Assistant]: {m.content}\n"
        elif m.role == "tool":
            history_text += f"[Tool Response]: {m.content[:200]}...\n"
        elif m.role == "system":
            history_text += f"[System Context]: {m.content}\n"

    # Get active LLM settings
    settings_result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )
    user_settings = settings_result.scalar_one_or_none()

    provider = "groq"
    model = "llama-3.3-70b-versatile"
    api_key = None
    ollama_base_url = None
    if user_settings:
        provider = user_settings.provider
        model = user_settings.model
        api_key = user_settings.api_key
        ollama_base_url = getattr(user_settings, "ollama_base_url", None)

    try:
        from agent.llm import get_llm
        from langchain_core.messages import SystemMessage as LCSystemMessage, HumanMessage as LCHumanMessage

        llm = get_llm(
            provider=provider,
            model_name=model,
            api_key=api_key,
            ollama_base_url=ollama_base_url
        )

        prompt = (
            "You are an expert developer assistant. Your task is to compress/summarize the conversation history "
            "provided below. The summary must preserve the context of key decisions, code changes suggested or approved, "
            "any identified bugs or issues, and filenames/methods discussed. "
            "Keep the summary extremely concise but highly structured and comprehensive. Avoid conversational filler."
        )

        messages_to_send = [
            LCSystemMessage(content=prompt),
            LCHumanMessage(content=f"Here is the conversation history to compress:\n\n{history_text}")
        ]

        response = await llm.ainvoke(messages_to_send)
        summary = response.content if hasattr(response, "content") else str(response)
    except Exception as e:
        # Fallback summary if LLM call fails
        summary = f"Summary could not be auto-generated due to an API error: {str(e)}. Previous conversation context was pruned."

    # Delete all intermediate messages in a database transaction and add summary system message
    await db.execute(delete(Message).where(Message.conversation_id == conv_id))

    compressed_message = Message(
        conversation_id=conv_id,
        role="system",
        content=f"Compressed summary of previous conversation context:\n\n{summary}",
        created_at=datetime.now(timezone.utc)
    )
    db.add(compressed_message)
    await db.commit()

    return {"status": "success", "summary": summary}