import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from context.retriever import hybrid_search, RetrievedChunk
from services.file_service import FileService

MAX_CONTEXT_TOKENS = 4000   # ~4k chars of injected context — enough signal, not bloated
OPEN_FILE_SNIPPET  = 1500   # chars per open file (first N chars)
RAG_TOP_K          = 5      # fewer chunks = less noise + fewer tokens

async def build_rag_context(
    db: AsyncSession,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    query: str,
    open_files: list[str] = [],
) -> str:
    """
    Assemble context string for the agent:
    1. Contents of currently open files (pinned)
    2. RAG retrieved chunks (hybrid search)
    """
    parts = []
    budget = MAX_CONTEXT_TOKENS

    # 1. Open files — always include (pinned context)
    if open_files:
        fs = FileService(project_id, user_id)
        for file_path in open_files[:3]:   # max 3 open files
            try:
                content = await fs.read(file_path)
                snippet = content[:OPEN_FILE_SNIPPET]
                parts.append(
                    f"=== OPEN FILE: {file_path} ===\n{snippet}"
                )
                budget -= len(snippet)
            except Exception:
                pass

    # 2. RAG retrieved chunks
    if budget > 0:
        chunks = await hybrid_search(db, project_id, query, top_k=RAG_TOP_K)
        for chunk in chunks:
            entry = (
                f"=== {chunk.file_path} "
                f"[lines {chunk.start_line}-{chunk.end_line}] "
                f"({chunk.chunk_type}) ===\n"
                f"{chunk.content}"
            )
            if len(entry) > budget:
                break
            parts.append(entry)
            budget -= len(entry)

    return "\n\n".join(parts)