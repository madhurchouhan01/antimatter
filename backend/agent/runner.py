import json
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from db.models import Conversation, Message, Project
from agent.graph import build_graph
from agent.context_builder import build_rag_context

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
            kwargs = {"content": m.content}
            if m.tool_calls:
                kwargs["tool_calls"] = m.tool_calls
            lc_messages.append(AIMessage(**kwargs))
        elif m.role == "tool":
            tool_call_id = ""
            name = ""
            if m.tool_calls:
                tool_call_id = m.tool_calls.get("id", "")
                name = m.tool_calls.get("name", "")
            lc_messages.append(ToolMessage(content=m.content, tool_call_id=tool_call_id, name=name))
    return lc_messages

async def run_agent_streaming(
    user_message: str,
    project: Project,
    conversation_id: uuid.UUID | None,
    db: AsyncSession,
    send_json,   # async callable — the WebSocket send function
    open_files: list[str] = [],
    emit_fn=None,  # async callable for file.patch proposals
):
    conv = await get_or_create_conversation(db, project.id, conversation_id)
    history = await load_history(db, conv.id)

    # Save user message
    db.add(Message(conversation_id=conv.id, role="user", content=user_message))
    await db.flush()

    # Build RAG context for this turn
    rag_context = await build_rag_context(
        db           = db,
        project_id   = project.id,
        user_id      = project.owner_id,
        query        = user_message,
        open_files   = open_files,
    )
    print(f"RAG Context: {rag_context}")
    # Prepend RAG context to user message
    enriched_message = user_message
    if rag_context:
        enriched_message = (
            f"<codebase_context>\n{rag_context}\n</codebase_context>\n\n"
            f"{user_message}"
        )

    graph = build_graph(str(project.id), str(project.owner_id), emit_fn=emit_fn)
    state = {"messages": history + [HumanMessage(content=enriched_message)]}

    initial_msg_count = len(state["messages"])

    # Stream token by token
    async for event in graph.astream_events(state, version="v2"):
        kind = event["event"]

        if kind == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            token = chunk.content
            if token:
                await send_json({"type": "token", "content": token})
            
            # Stream tool call chunks if present
            if chunk.tool_call_chunks:
                for tcc in chunk.tool_call_chunks:
                    await send_json({
                        "type": "tool_call_chunk",
                        "tool": tcc.get("name"),
                        "args": tcc.get("args")
                    })

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
            
        elif kind == "on_chain_end" and event["name"] == "LangGraph":
            # The top-level graph finished. We can grab the final state to save everything accurately!
            final_messages = event["data"].get("output", {}).get("messages", [])
            new_messages = final_messages[initial_msg_count:]
            
            for m in new_messages:
                role = "assistant" if isinstance(m, AIMessage) else "tool"
                content = m.content if isinstance(m.content, str) else str(m.content)
                tool_calls = None
                
                if isinstance(m, AIMessage) and m.tool_calls:
                    tool_calls = m.tool_calls
                elif isinstance(m, ToolMessage):
                    tool_calls = {"id": m.tool_call_id, "name": m.name}
                    
                db.add(Message(
                    conversation_id=conv.id,
                    role=role,
                    content=content,
                    tool_calls=tool_calls
                ))
            await db.commit()

    await send_json({"type": "done", "conversation_id": str(conv.id)})