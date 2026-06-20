import json
import uuid
import asyncio
import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from db.models import Conversation, Message, Project
from db.session import AsyncSessionLocal
from agent.graph import build_graph
from agent.context_builder import build_rag_context
from agent.memory import retrieve_memories, check_and_write_memory
from core.logger import get_logger
import re

log = get_logger(__name__)

def merge_diagram_into_message(content: str, diagram_markdown: str) -> str:
    if not diagram_markdown:
        return content
    if "```mermaid" in content:
        pattern = r'```mermaid\s*(.*?)\s*```'
        replacement = f"```mermaid\n{diagram_markdown}\n```"
        new_content, count = re.subn(pattern, replacement, content, flags=re.DOTALL)
        if count > 0:
            return new_content
    return f"{content.strip()}\n\n### Diagram Visualization\n```mermaid\n{diagram_markdown}\n```"


async def _write_memory_bg(
    project_id: str,
    user_id: str,
    task_description: str,
    final_messages: list,
    provider: str,
    model_name: str,
    api_key: str | None,
) -> None:
    """
    Background coroutine: opens its own DB session so it can safely outlive
    the request handler's session (which is already committed/closed by the
    time asyncio.create_task schedules this).
    """
    try:
        async with AsyncSessionLocal() as db:
            await check_and_write_memory(
                db=db,
                project_id=project_id,
                user_id=user_id,
                task_description=task_description,
                final_messages=final_messages,
                provider=provider,
                model_name=model_name,
                api_key=api_key,
            )
    except Exception:
        log.error("Memory background write failed", exc_info=True)

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
    model_name: str = "llama-3.3-70b-versatile",
    provider: str = "groq",
    api_key: str | None = None,
    ollama_base_url: str | None = None,
):
    final_text = None
    accumulated_token_usage = {}  # {input_tokens, output_tokens, total_tokens, model}
    conv = await get_or_create_conversation(db, project.id, conversation_id)
    history = await load_history(db, conv.id)

    # Save user message
    now_ = datetime.datetime.now(datetime.timezone.utc)
    db.add(Message(
        conversation_id=conv.id,
        role="user",
        content=user_message,
        created_at=now_
    ))
    # Auto-generate title if not set
    if not conv.title:
        title_text = user_message.strip().split("\n")[0]
        if len(title_text) > 40:
            title_text = title_text[:40] + "..."
        conv.title = title_text or "New Conversation"
    await db.flush()

    try:
        # Build RAG context for this turn
        rag_context = await build_rag_context(
            db           = db,
            project_id   = project.id,
            user_id      = project.owner_id,
            query        = user_message,
            open_files   = open_files,
        )
        log.debug("RAG context built", chunks=rag_context.count("\n") if rag_context else 0)
        # Prepend RAG context to user message
        enriched_message = user_message
        if rag_context:
            enriched_message = (
                f"<codebase_context>\n{rag_context}\n</codebase_context>\n\n"
                f"{user_message}"
            )

        graph = build_graph(
            str(project.id),
            str(project.owner_id),
            emit_fn=emit_fn,
            model_name=model_name,
            provider=provider,
            api_key=api_key,
            ollama_base_url=ollama_base_url,
        )

        # Retrieve relevant past memories and inject into initial state
        memory_context = await retrieve_memories(
            db=db,
            project_id=str(project.id),
            task_description=user_message,
        )
        if memory_context:
            log.debug("Memory context injected", project=str(project.id))

        state = {
            "messages": history + [HumanMessage(content=enriched_message)],
            "memory_context": memory_context,
            "diagram_markdown": "",
            "validation_errors": "",
            "validation_retries": 0,
            "needs_diagram": False,
        }

        initial_msg_count = len(state["messages"])

        # ── LangSmith trace config ─────────────────────────────────────────
        # Each agent run gets a descriptive name + metadata so the LangSmith
        # dashboard shows meaningful entries rather than anonymous traces.
        run_config = RunnableConfig(
            run_name=f"antimatter/{provider}/{model_name}",
            tags=[
                f"project:{str(project.id)}",
                f"provider:{provider}",
                f"model:{model_name}",
                f"conversation:{str(conv.id)}",
            ],
            metadata={
                "project_id":      str(project.id),
                "conversation_id": str(conv.id),
                "provider":        provider,
                "model":           model_name,
                "open_files":      open_files,
                "message_preview": user_message[:120],
            },
        )

        # Stream token by token
        async for event in graph.astream_events(state, config=run_config, version="v2"):
            kind = event["event"]

            if kind == "on_chat_model_stream":
                node = event.get("metadata", {}).get("langgraph_node")
                chunk = event["data"]["chunk"]
                # Only stream tokens if they belong to the main coding agent or general chat
                if node in ("agent", "general_chat"):
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
                log.info("Tool start", tool=event["name"], project=str(project.id))
                await send_json({
                    "type": "tool_start",
                    "tool": event["name"],
                    "input": event["data"].get("input", {}),
                })

            elif kind == "on_tool_end":
                log.info("Tool end", tool=event["name"], project=str(project.id))
                await send_json({
                    "type": "tool_end",
                    "tool": event["name"],
                    "output": str(event["data"].get("output", "")),
                })
                
            elif kind == "on_chat_model_end":
                # Capture token usage from any agent/classifier/generator LLM call
                resp = event["data"].get("output")
                usage = getattr(resp, "usage_metadata", None) or {}
                if usage:
                    accumulated_token_usage = {
                        "input_tokens":  accumulated_token_usage.get("input_tokens", 0) + usage.get("input_tokens", 0),
                        "output_tokens": accumulated_token_usage.get("output_tokens", 0) + usage.get("output_tokens", 0),
                        "total_tokens":  accumulated_token_usage.get("total_tokens", 0) + usage.get("total_tokens", 0),
                        "model": model_name,
                    }

            elif kind == "on_chain_end":
                log.info(f"Chain ended: name={event['name']}")
                node = event.get("metadata", {}).get("langgraph_node")
                if node == "classifier" and event["name"] == "classifier":
                    output = event["data"].get("output")
                    if isinstance(output, dict):
                        route = output.get("route")
                        if route:
                            await send_json({"type": "route", "route": route})

                if event["name"].startswith("antimatter/"):
                    log.debug("I am just before write memory bg:end")
                    # The top-level graph finished. We can grab the final state to save everything accurately!
                    final_output = event["data"].get("output", {})
                    final_messages = final_output.get("messages", [])
                    diagram_markdown = final_output.get("diagram_markdown", "")
                    validation_errors = final_output.get("validation_errors", "")
                    
                    new_messages = final_messages[initial_msg_count:]
                    
                    # Merge validated diagram into the last assistant message if valid
                    if diagram_markdown and not validation_errors:
                        for m in reversed(new_messages):
                            if isinstance(m, AIMessage):
                                m.content = merge_diagram_into_message(m.content, diagram_markdown)
                                break
                    
                    for m in reversed(new_messages):
                        if isinstance(m, AIMessage):
                            final_text = m.content
                            break
                    
                    base_time = datetime.datetime.now(datetime.timezone.utc)
                    # Find the index of the last AI message to attach token_usage to it
                    last_ai_idx = None
                    for rev_i, rev_m in enumerate(reversed(new_messages)):
                        if isinstance(rev_m, AIMessage) and not (getattr(rev_m, 'tool_calls', None)):
                            last_ai_idx = len(new_messages) - 1 - rev_i
                            break

                    for i, m in enumerate(new_messages):
                        role = "assistant" if isinstance(m, AIMessage) else "tool"
                        content = m.content if isinstance(m.content, str) else str(m.content)
                        tool_calls = None
                        log.debug(f"I am just before write memory bg:{m}")
                        if isinstance(m, AIMessage) and m.tool_calls:
                            tool_calls = m.tool_calls
                        elif isinstance(m, ToolMessage):
                            tool_calls = {"id": m.tool_call_id, "name": m.name}
                        
                        # Attach token usage and route to the last non-tool-calling AI message
                        msg_token_usage = None
                        if i == last_ai_idx:
                            msg_token_usage = {}
                            if accumulated_token_usage:
                                msg_token_usage.update(accumulated_token_usage)
                            msg_token_usage["route"] = final_output.get("route", "coding")

                        db.add(Message(
                            conversation_id=conv.id,
                            role=role,
                            content=content,
                            tool_calls=tool_calls,
                            token_usage=msg_token_usage,
                            created_at=base_time + datetime.timedelta(microseconds=i + 1)
                        ))
                    await db.commit()

                    # Fire-and-forget memory write — does NOT delay the 'done' event.
                    # Uses its own DB session to avoid use-after-close.
                    log.debug("I am just before write memory bg")
                    asyncio.create_task(
                        _write_memory_bg(
                            project_id=str(project.id),
                            user_id=str(project.owner_id),
                            task_description=user_message,
                            final_messages=final_messages,
                            provider=provider,
                            model_name=model_name,
                            api_key=api_key,
                        )
                    )
    except Exception as e:
        error_msg = str(e).lower()
        if "context_length" in error_msg or "context length" in error_msg or "token limit" in error_msg or "tokens limit" in error_msg or "maximum context" in error_msg or "too many tokens" in error_msg or "limit exceeded" in error_msg or "prompt tokens" in error_msg:
            log.warning("Context length limit exceeded", model=model_name, project=str(project.id))
            await send_json({
                "type": "error",
                "error_type": "token_limit",
                "message": "The model's token/context limit was exceeded because the codebase files or query context are too large. Try closing some open files in the editor or asking a shorter question."
            })
        elif "api key" in error_msg or "api_key" in error_msg or "unauthorized" in error_msg or "authentication" in error_msg or "invalid api" in error_msg or "apikey" in error_msg:
            log.warning("Authentication failure with LLM provider", model=model_name, project=str(project.id))
            await send_json({
                "type": "error",
                "error_type": "auth_error",
                "message": "The LLM provider failed to authorize the request. Please check your API Key configuration in the settings panel."
            })
        elif "429" in error_msg or "rate limit" in error_msg or "too many requests" in error_msg or e.__class__.__name__ == "RateLimitError":
            log.warning("Rate limit hit", model=model_name, project=str(project.id))
            await send_json({
                "type": "error",
                "error_type": "rate_limit",
                "message": "You have exhausted your rate limits. Please try again later or choose a different model."
            })
        elif "timeout" in error_msg or "connection" in error_msg or "connect" in error_msg or "network" in error_msg or "dns" in error_msg:
            log.warning("Network connection issue with provider", model=model_name, project=str(project.id))
            await send_json({
                "type": "error",
                "error_type": "network_error",
                "message": "Could not establish a connection to the LLM provider. Please verify your internet connection and check if the provider service is offline."
            })
        else:
            log.error("Agent execution failed", project=str(project.id), exc_info=True)
            await send_json({
                "type": "error",
                "error_type": "generic",
                "message": "An unexpected error occurred while processing your request. The execution was aborted."
            })

    await send_json({
        "type": "done",
        "conversation_id": str(conv.id),
        "final_text": final_text,
        "token_usage": accumulated_token_usage if accumulated_token_usage else None,
    })