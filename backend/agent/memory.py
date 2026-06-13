"""
agent/memory.py — Episodic memory for the AntiMatter agent.

Two public entry points:
  - retrieve_memories()     : called BEFORE graph run, returns formatted context string
  - check_and_write_memory(): called AFTER graph run as asyncio.create_task (fire-and-forget)
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from context.embedder import get_voyage_client
from core.retry_utils import retry_async
from core.logger import get_logger

log = get_logger(__name__)

# ---------------------------------------------------------------------------
# Embedding helpers (voyage-3 — prose-optimised)
# ---------------------------------------------------------------------------

_MEMORY_EMBED_MODEL = "voyage-3"


async def _embed_memory_query(text_: str) -> list[float]:
    """Embed a retrieval query using voyage-3."""
    client = get_voyage_client()

    async def _call():
        return await client.embed([text_], model=_MEMORY_EMBED_MODEL, input_type="query")

    result = await retry_async(_call, max_retries=3, delay=1.0, backoff=2.0)
    return result.embeddings[0]


async def _embed_memory_document(text_: str) -> list[float]:
    """Embed a memory lesson for storage using voyage-3."""
    client = get_voyage_client()

    async def _call():
        return await client.embed([text_], model=_MEMORY_EMBED_MODEL, input_type="document")

    result = await retry_async(_call, max_retries=3, delay=1.0, backoff=2.0)
    return result.embeddings[0]


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------

async def retrieve_memories(
    db: AsyncSession,
    project_id: str,
    task_description: str,
    threshold: float = 0.75,
    limit: int = 3,
) -> str:
    """
    Retrieve past memories relevant to `task_description` for `project_id`.

    Returns a formatted string ready to be appended to the system prompt, or ""
    if nothing is above the similarity threshold.
    """
    try:
        query_embedding = await _embed_memory_query(task_description)
    except Exception:
        log.warning("Memory retrieval: embedding failed, skipping", exc_info=True)
        return ""

    try:
        rows = await db.execute(
            text("""
                SELECT
                    id,
                    generalizable_lesson,
                    context_signature,
                    1 - (embedding <=> :embedding) AS similarity
                FROM agent_memories
                WHERE project_id = :project_id
                  AND embedding IS NOT NULL
                ORDER BY embedding <=> :embedding
                LIMIT :limit
            """),
            {
                "embedding": str(query_embedding),
                "project_id": project_id,
                "limit": limit * 3,  # over-fetch, filter by threshold below
            },
        )
        hits = rows.fetchall()
    except Exception:
        log.warning("Memory retrieval: DB query failed, skipping", exc_info=True)
        return ""

    relevant = [h for h in hits if h.similarity >= threshold][:limit]
    if not relevant:
        return ""

    # Update retrieval stats in the background (best-effort)
    hit_ids = [str(h.id) for h in relevant]
    try:
        await db.execute(
            text("""
                UPDATE agent_memories
                SET last_retrieved_at = now(),
                    retrieval_count   = retrieval_count + 1
                WHERE id = ANY(:ids::uuid[])
            """),
            {"ids": hit_ids},
        )
        await db.commit()
    except Exception:
        log.warning("Memory retrieval: failed to update retrieval stats", exc_info=True)

    # Format for system prompt injection
    lines: list[str] = []
    for h in relevant:
        sig = h.context_signature or {}
        files = ", ".join(sig.get("files", [])) or "—"
        errors = ", ".join(sig.get("error_types", [])) or "none"
        lines.append(
            f"- Lesson: {h.generalizable_lesson}\n"
            f"  Context: touched {files}, involved errors: {errors}"
        )

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Worthiness check + write
# ---------------------------------------------------------------------------

# Tool names whose "path" arg we extract programmatically for context_signature
_FILE_TOOLS = {
    "read_file",
    "write_file",
    "replace_file_content",
    "multi_replace_file_content",
    "list_files",
    "search_files",
    "run_tests",
}

_PACKAGE_TOOLS = {"install_packages"}

# Max chars per tool result shown in trace (keeps prompt small)
_TOOL_RESULT_LIMIT = 500


def _build_compact_trace(messages: list[BaseMessage]) -> str:
    """
    Produce a compact, readable trace of tool calls + results + final response
    from the raw message list. Used as context for the LLM worthiness judge.
    """
    parts: list[str] = []
    for m in messages:
        if isinstance(m, AIMessage):
            if m.tool_calls:
                for tc in m.tool_calls:
                    args_str = json.dumps(tc.get("args", {}), ensure_ascii=False)[:300]
                    parts.append(f"[TOOL CALL] {tc.get('name', '?')}({args_str})")
            elif m.content:
                # Final assistant response
                content = m.content if isinstance(m.content, str) else str(m.content)
                parts.append(f"[FINAL RESPONSE] {content[:800]}")
        elif isinstance(m, ToolMessage):
            result = m.content if isinstance(m.content, str) else str(m.content)
            result = result[:_TOOL_RESULT_LIMIT]
            parts.append(f"[TOOL RESULT: {m.name}] {result}")
    return "\n".join(parts)


def _extract_files_from_messages(messages: list[BaseMessage]) -> list[str]:
    """
    Programmatically extract file paths from tool call args — do not rely on LLM
    to enumerate these.
    """
    seen: set[str] = set()
    files: list[str] = []
    for m in messages:
        if not isinstance(m, AIMessage) or not m.tool_calls:
            continue
        for tc in m.tool_calls:
            if tc.get("name") in _FILE_TOOLS:
                path = tc.get("args", {}).get("path", "")
                if path and path not in seen:
                    seen.add(path)
                    files.append(path)
    return files


def _extract_modules_from_messages(messages: list[BaseMessage]) -> list[str]:
    """Extract package names from install_packages tool calls."""
    modules: list[str] = []
    for m in messages:
        if not isinstance(m, AIMessage) or not m.tool_calls:
            continue
        for tc in m.tool_calls:
            if tc.get("name") in _PACKAGE_TOOLS:
                pkgs = tc.get("args", {}).get("packages", [])
                modules.extend(pkgs)
    return list(dict.fromkeys(modules))  # deduplicate, preserve order


def _parse_json_from_response(content: str) -> dict:
    """
    Extract the first JSON object from an LLM response, even if surrounded
    by prose or markdown fences.
    """
    # Try direct parse first
    content = content.strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Strip markdown fences
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except json.JSONDecodeError:
            pass

    # Find first {...} block
    brace = re.search(r"\{.*\}", content, re.DOTALL)
    if brace:
        try:
            return json.loads(brace.group(0))
        except json.JSONDecodeError:
            pass

    raise ValueError(f"No valid JSON found in LLM response: {content[:200]}")


_WORTHINESS_PROMPT = """\
You are an episodic memory judge for an AI coding assistant.
Evaluate the following agent task trace and decide if it's worth remembering.

Worthiness criteria — set worthy=true ONLY if at least one applies:
(a) An error occurred and required more than one attempt to fix.
(b) A non-obvious architectural or design decision was made.
(c) A codebase-specific gotcha was discovered (config, naming, env quirks, import paths, etc).
(d) The user explicitly corrected the agent's initial approach.

Set worthy=false for routine tasks with no surprises (simple reads, writes, trivial commands).

Respond with ONLY a JSON object — no prose, no markdown:
{{"worthy": true|false, "reason": "one sentence", "generalizable_lesson": "actionable lesson string or null"}}

Task: {task_description}

Trace:
{trace}
"""

_EXTRACTION_PROMPT = """\
You are extracting structured metadata from an AI coding assistant's task trace.

Extract the following as a JSON object. Be concise.
- task_description: short description of what the agent did (1-2 sentences)
- context_signature.files: list of file paths involved (use empty list [] if none — do NOT invent paths)
- context_signature.modules: list of packages/modules involved (use empty list [] if none)
- context_signature.error_types: list of error pattern names or exception types encountered (e.g. "ImportError", "404", "permission denied")
- what_worked: what approach ultimately succeeded (or null)
- what_failed_first: what failed before the working approach (or null)
- generalizable_lesson: the key takeaway a future agent should know (required, be specific)

Respond with ONLY a JSON object — no prose, no markdown.

Task: {task_description}

Trace:
{trace}

Pre-extracted file paths (authoritative — merge these into context_signature.files):
{known_files}

Pre-extracted modules (authoritative — merge into context_signature.modules):
{known_modules}
"""


async def check_and_write_memory(
    db: AsyncSession,
    project_id: str,
    user_id: str,
    task_description: str,
    final_messages: list[BaseMessage],
    provider: str,
    model_name: str,
    api_key: str | None,
) -> None:
    """
    Post-task memory writer (designed to run as asyncio.create_task).

    1. Worthiness check — fast LLM call on the same provider/model.
    2. Extraction     — structured metadata from trace (if worthy).
    3. Embed          — voyage-3 document embedding.
    4. Store          — INSERT into agent_memories.
    """
    # Lazy import to avoid circular deps
    from agent.llm import get_llm
    from db.models import AgentMemory

    trace = _build_compact_trace(final_messages)
    if not trace.strip():
        log.debug("Memory: empty trace, skipping")
        return

    known_files = _extract_files_from_messages(final_messages)
    known_modules = _extract_modules_from_messages(final_messages)

    try:
        llm = get_llm(provider=provider, model_name=model_name, api_key=api_key)
    except Exception:
        log.warning("Memory: could not build LLM, skipping", exc_info=True)
        return

    # ── Step 1: Worthiness check ─────────────────────────────────────────────
    worthiness_prompt = _WORTHINESS_PROMPT.format(
        task_description=task_description[:300],
        trace=trace[:3000],
    )
    try:
        worth_response = await asyncio.wait_for(
            llm.ainvoke(worthiness_prompt),
            timeout=30,
        )
        worth_content = (
            worth_response.content
            if isinstance(worth_response.content, str)
            else str(worth_response.content)
        )
        worth_data = _parse_json_from_response(worth_content)
    except asyncio.TimeoutError:
        log.warning("Memory: worthiness check timed out, skipping")
        return
    except Exception:
        log.warning("Memory: worthiness check failed, skipping", exc_info=True)
        return

    if not worth_data.get("worthy", False):
        log.debug(
            "Memory: task not worthy",
            reason=worth_data.get("reason", ""),
            project=project_id,
        )
        return

    log.info(
        "Memory: task deemed worthy, extracting",
        reason=worth_data.get("reason"),
        project=project_id,
    )

    # ── Step 2: Extraction ───────────────────────────────────────────────────
    extraction_prompt = _EXTRACTION_PROMPT.format(
        task_description=task_description[:300],
        trace=trace[:3000],
        known_files=json.dumps(known_files),
        known_modules=json.dumps(known_modules),
    )
    try:
        extract_response = await asyncio.wait_for(
            llm.ainvoke(extraction_prompt),
            timeout=30,
        )
        extract_content = (
            extract_response.content
            if isinstance(extract_response.content, str)
            else str(extract_response.content)
        )
        extracted: dict[str, Any] = _parse_json_from_response(extract_content)
    except asyncio.TimeoutError:
        log.warning("Memory: extraction timed out, skipping")
        return
    except Exception:
        log.warning("Memory: extraction failed, skipping", exc_info=True)
        return

    # Merge programmatically extracted files/modules (they are authoritative)
    ctx_sig = extracted.get("context_signature", {})
    if not isinstance(ctx_sig, dict):
        ctx_sig = {}
    llm_files = ctx_sig.get("files", []) or []
    merged_files = list(dict.fromkeys(known_files + [f for f in llm_files if f not in known_files]))
    llm_modules = ctx_sig.get("modules", []) or []
    merged_modules = list(dict.fromkeys(known_modules + [m for m in llm_modules if m not in known_modules]))

    context_signature = {
        "files": merged_files,
        "modules": merged_modules,
        "error_types": ctx_sig.get("error_types", []) or [],
    }

    generalizable_lesson = (
        extracted.get("generalizable_lesson")
        or worth_data.get("generalizable_lesson")
        or ""
    ).strip()

    if not generalizable_lesson:
        log.warning("Memory: no generalizable_lesson extracted, skipping")
        return

    # ── Step 3: Embed ────────────────────────────────────────────────────────
    embed_text = (
        generalizable_lesson
        + " | files: " + ", ".join(merged_files)
        + " | errors: " + ", ".join(context_signature["error_types"])
    )
    try:
        embedding = await _embed_memory_document(embed_text)
    except Exception:
        log.warning("Memory: embedding failed, storing without vector", exc_info=True)
        embedding = None

    # ── Step 4: Store ────────────────────────────────────────────────────────
    try:
        memory = AgentMemory(
            project_id=uuid.UUID(project_id),
            user_id=uuid.UUID(user_id),
            task_description=(extracted.get("task_description") or task_description)[:1000],
            context_signature=context_signature,
            what_worked=extracted.get("what_worked"),
            what_failed_first=extracted.get("what_failed_first"),
            generalizable_lesson=generalizable_lesson,
            embedding=embedding,
        )
        db.add(memory)
        await db.commit()
        log.info(
            "Memory: stored",
            lesson=generalizable_lesson[:80],
            project=project_id,
            memory_id=str(memory.id),
        )
    except Exception:
        log.error("Memory: DB write failed", exc_info=True)
        await db.rollback()
