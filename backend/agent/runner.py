import json
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from langchain_core.messages import HumanMessage, AIMessage
from db.models import Conversation, Message, Project
from agent.graph import build_graph

async def get_or_create_conversation(
    db: AsyncSession,
    project_id: uuid.UUID,
    conversation_id: uuid.UUID | None
) -> Conversation:
    if conversation_id:
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if conv:
            return conv

    conv = Conversation(project_id=project_id)
    db.add(conv)
    await db.flush()
    return conv

async def load_history(db: AsyncSession, conversation_id: uuid.UUID) -> list:
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )
    messages = result.scalars().all()
    lc_messages = []
    for m in messages:
        if m.role == "user":
            lc_messages.append(HumanMessage(content=m.content))
        elif m.role == "assistant":
            lc_messages.append(AIMessage(content=m.content))
    return lc_messages

async def run_agent_streaming(
    user_message: str,
    project: Project,
    conversation_id: uuid.UUID | None,
    db: AsyncSession,
    send_json,   # async callable — the WebSocket send function
):
    conv = await get_or_create_conversation(db, project.id, conversation_id)
    history = await load_history(db, conv.id)

    # Save user message
    db.add(Message(conversation_id=conv.id, role="user", content=user_message))
    await db.flush()

    graph = build_graph(project.workspace_path)
    state = {"messages": history + [HumanMessage(content=user_message)]}

    full_response = ""

    # Stream token by token
    async for event in graph.astream_events(state, version="v2"):
        kind = event["event"]

        if kind == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            token = chunk.content
            if token:
                full_response += token
                await send_json({"type": "token", "content": token})

        elif kind == "on_tool_start":
            await send_json({
                "type": "tool_start",
                "tool": event["name"],
                "input": event["data"].get("input", {}),
            })

        elif kind == "on_tool_end":
            await send_json({
                "type": "tool_end",
                "tool": event["name"],
                "output": str(event["data"].get("output", "")),
            })

    # Save assistant response
    db.add(Message(conversation_id=conv.id, role="assistant", content=full_response))
    await db.commit()

    await send_json({"type": "done", "conversation_id": str(conv.id)})