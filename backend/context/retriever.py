import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from context.vector_store import vector_store
from context.embedder import embed_query
from dataclasses import dataclass
from core.logger import get_logger

log = get_logger(__name__)

@dataclass
class RetrievedChunk:
    file_path:  str
    content:    str
    start_line: int
    end_line:   int
    language:   str
    chunk_type: str
    score:      float

def _rrf_score(rank: int, k: int = 60) -> float:
    """Reciprocal Rank Fusion score."""
    return 1.0 / (k + rank)

async def hybrid_search(
    db: AsyncSession,
    project_id: uuid.UUID,
    query: str,
    top_k: int = 10,
) -> list[RetrievedChunk]:
    """
    Combine semantic + BM25 results using Reciprocal Rank Fusion.
    This finds both conceptually similar code AND exact identifier matches.
    """
    # Run searches with a fallback to BM25 if embedding fails
    query_embedding = None
    try:
        query_embedding = await embed_query(query)
    except Exception as e:
        log.warning(f"Query embedding failed: {e}. Falling back to BM25-only search.")

    semantic_results = []
    if query_embedding is not None:
        try:
            semantic_results = await vector_store.semantic_search(
                db, project_id, query_embedding, top_k=top_k * 2
            )
        except Exception as e:
            log.warning(f"Semantic search failed: {e}")

    bm25_results = []
    try:
        bm25_results = await vector_store.bm25_search(
            db, project_id, query, top_k=top_k * 2
        )
    except Exception as e:
        log.error(f"BM25 search failed: {e}")

    # Build RRF score map keyed by (file_path, start_line)
    scores: dict[tuple, float] = {}
    chunk_map: dict[tuple, any] = {}

    for rank, row in enumerate(semantic_results):
        key = (row.file_path, row.start_line)
        scores[key]    = scores.get(key, 0) + _rrf_score(rank)
        chunk_map[key] = row

    for rank, row in enumerate(bm25_results):
        key = (row.file_path, row.start_line)
        scores[key]    = scores.get(key, 0) + _rrf_score(rank)
        chunk_map[key] = row

    # Sort by combined RRF score
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)

    results = []
    for key, score in ranked[:top_k]:
        row = chunk_map[key]
        results.append(RetrievedChunk(
            file_path  = row.file_path,
            content    = row.content,
            start_line = row.start_line,
            end_line   = row.end_line,
            language   = row.language   if hasattr(row, "language")   else "",
            chunk_type = row.chunk_type if hasattr(row, "chunk_type") else "",
            score      = score,
        ))

    return results