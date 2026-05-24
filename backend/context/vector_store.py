import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, text
from db.models import CodeChunk
from context.chunker import Chunk

class VectorStore:

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

    async def semantic_search(
        self,
        db: AsyncSession,
        project_id: uuid.UUID,
        query_embedding: list[float],
        top_k: int = 15,
    ) -> list[tuple[CodeChunk, float]]:
        """Cosine similarity search via pgvector."""
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

    async def bm25_search(
        self,
        db: AsyncSession,
        project_id: uuid.UUID,
        query: str,
        top_k: int = 15,
    ) -> list[tuple[CodeChunk, float]]:
        """Full-text BM25 search via Postgres tsvector."""
        result = await db.execute(
            text("""
                SELECT id, file_path, start_line, end_line,
                       language, chunk_type, content,
                       ts_rank(content_tsv, query) AS score
                FROM code_chunks,
                     plainto_tsquery('english', :query) query
                WHERE project_id = :project_id
                  AND content_tsv @@ query
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

vector_store = VectorStore()