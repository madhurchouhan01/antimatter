import math
import uuid
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, text
from db.models import CodeChunk
from context.chunker import Chunk
from core.config import get_settings

log = logging.getLogger(__name__)


class VectorStore:

    # ── Upsert ────────────────────────────────────────────────────────────────

    async def upsert_chunks(
        self,
        db: AsyncSession,
        project_id: uuid.UUID,
        file_path: str,
        chunks: list[Chunk],
        embeddings: list[list[float]],
    ) -> None:
        """Replace all chunks for a file with fresh ones."""
        # Delete existing chunks for this file
        await db.execute(
            delete(CodeChunk).where(
                CodeChunk.project_id == project_id,
                CodeChunk.file_path  == file_path,
            )
        )

        # Insert new chunks
        for chunk, embedding in zip(chunks, embeddings):
            db.add(CodeChunk(
                project_id = project_id,
                file_path  = chunk.file_path,
                start_line = chunk.start_line,
                end_line   = chunk.end_line,
                language   = chunk.language,
                chunk_type = chunk.chunk_type,
                content    = chunk.content,
                embedding  = embedding,
            ))

        await db.commit()

    # ── Delete ────────────────────────────────────────────────────────────────

    async def delete_file(
        self,
        db: AsyncSession,
        project_id: uuid.UUID,
        file_path: str,
    ) -> None:
        await db.execute(
            delete(CodeChunk).where(
                CodeChunk.project_id == project_id,
                CodeChunk.file_path  == file_path,
            )
        )
        await db.commit()

    # ── Semantic search ───────────────────────────────────────────────────────

    async def semantic_search(
        self,
        db: AsyncSession,
        project_id: uuid.UUID,
        query_embedding: list[float],
        top_k: int = 15,
        nprobe: int | None = None,
    ) -> list[tuple[CodeChunk, float]]:
        """
        Cosine similarity search via pgvector.

        nprobe controls how many IVFFlat lists are scanned per query.
        Higher values → better recall, slightly slower queries.
        Defaults to settings.ivfflat_nprobe (env: IVFFLAT_NPROBE, default 10).
        """
        settings = get_settings()
        effective_nprobe = nprobe if nprobe is not None else settings.ivfflat_nprobe

        # Set the session-level IVFFlat probe count before the search query.
        # pgvector reads this GUC before executing the ORDER BY <=> scan.
        await db.execute(
            text("SET LOCAL ivfflat.probes = :n"),
            {"n": effective_nprobe},
        )

        result = await db.execute(
            text("""
                SELECT id, file_path, start_line, end_line,
                       language, chunk_type, content,
                       1 - (embedding <=> :embedding) AS score
                FROM code_chunks
                WHERE project_id = :project_id
                  AND embedding IS NOT NULL
                ORDER BY embedding <=> :embedding
                LIMIT :top_k
            """),
            {
                "embedding":  str(query_embedding),
                "project_id": str(project_id),
                "top_k":      top_k,
            }
        )
        return result.fetchall()

    # ── BM25 / full-text search ───────────────────────────────────────────────

    async def bm25_search(
        self,
        db: AsyncSession,
        project_id: uuid.UUID,
        query: str,
        top_k: int = 15,
    ) -> list[tuple[CodeChunk, float]]:
        """Full-text BM25 search via Postgres tsvector (inline, no stored column needed)."""
        result = await db.execute(
            text("""
                SELECT id, file_path, start_line, end_line,
                       language, chunk_type, content,
                       ts_rank(to_tsvector('english', content), query) AS score
                FROM code_chunks,
                     plainto_tsquery('english', :query) query
                WHERE project_id = :project_id
                  AND to_tsvector('english', content) @@ query
                ORDER BY score DESC
                LIMIT :top_k
            """),
            {
                "query":      query,
                "project_id": str(project_id),
                "top_k":      top_k,
            }
        )
        return result.fetchall()

    # ── Dynamic IVFFlat index maintenance ────────────────────────────────────

    async def reindex_if_needed(self, db: AsyncSession) -> dict:
        """
        Compute the optimal number of IVFFlat lists for the current
        code_chunks table size and rebuild the index if the current
        value deviates by more than 20 %.

        Optimal lists formula (pgvector docs recommendation):
            lists = max(ivfflat_lists_min, isqrt(total_rows))

        Example:
            1 000 rows  → lists = max(10, 31)  = 31
           10 000 rows  → max(10, 100) = 100
          100 000 rows  → max(10, 316) = 316
          500 000 rows  → max(10, 707) = 707

        The method is intentionally idempotent — safe to call after every
        full project index or via a scheduled maintenance job.
        """
        settings = get_settings()

        # ── 1. Count total rows ───────────────────────────────────────────────
        count_row = await db.execute(
            text("SELECT COUNT(*) FROM code_chunks WHERE embedding IS NOT NULL")
        )
        total_rows: int = count_row.scalar_one()

        if total_rows == 0:
            log.info("reindex_if_needed: table is empty, skipping.")
            return {"skipped": True, "reason": "empty table"}

        # ── 2. Compute desired lists ──────────────────────────────────────────
        desired_lists = max(settings.ivfflat_lists_min, math.isqrt(total_rows))

        # Guard: IVFFlat requires lists <= row count
        desired_lists = min(desired_lists, total_rows)

        # ── 3. Read current lists from pg_index / pg_opclass catalogue ────────
        current_lists_row = await db.execute(
            text("""
                SELECT (regexp_match(
                           reloptions::text,
                           'lists=([0-9]+)'
                       ))[1]::int AS lists
                FROM pg_class
                WHERE relname = 'idx_code_chunks_embedding'
            """)
        )
        row = current_lists_row.fetchone()
        current_lists: int | None = row.lists if row else None

        log.info(
            "reindex_if_needed: total_rows=%d, desired_lists=%d, current_lists=%s",
            total_rows, desired_lists, current_lists,
        )

        # ── 4. Decide whether to rebuild ──────────────────────────────────────
        if current_lists is not None:
            deviation = abs(desired_lists - current_lists) / max(current_lists, 1)
            if deviation < 0.20:
                log.info(
                    "reindex_if_needed: deviation %.1f%% < 20%%, no rebuild needed.",
                    deviation * 100,
                )
                return {
                    "rebuilt": False,
                    "current_lists": current_lists,
                    "desired_lists": desired_lists,
                    "total_rows": total_rows,
                    "deviation_pct": round(deviation * 100, 1),
                }

        # ── 5. Rebuild the IVFFlat index ──────────────────────────────────────
        log.info(
            "reindex_if_needed: rebuilding index with lists=%d (was %s).",
            desired_lists, current_lists,
        )

        # Use CONCURRENTLY so reads are not blocked during the build.
        # Note: CONCURRENTLY cannot run inside a transaction block —
        # we use raw DBAPI execute for this reason.
        raw_conn = await db.connection()
        await raw_conn.execute(
            text("DROP INDEX CONCURRENTLY IF EXISTS idx_code_chunks_embedding")
        )
        await raw_conn.execute(
            text(f"""
                CREATE INDEX CONCURRENTLY idx_code_chunks_embedding
                ON code_chunks
                USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = {desired_lists})
            """)
        )

        log.info("reindex_if_needed: index rebuilt successfully with lists=%d.", desired_lists)
        return {
            "rebuilt": True,
            "previous_lists": current_lists,
            "new_lists": desired_lists,
            "total_rows": total_rows,
        }


vector_store = VectorStore()