import uuid
import asyncio
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from context.chunker import chunk_file
from context.embedder import embed_documents
from context.vector_store import vector_store
from db.session import AsyncSessionLocal

# File extensions worth indexing
INDEXABLE_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx",
    ".md", ".txt", ".json", ".yaml", ".yml",
    ".html", ".css", ".sh", ".env.example",
}

# Paths to skip
SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv",
    "venv", "dist", "build", ".next", ".cache",
}

MAX_FILE_SIZE_BYTES = 500_000   # skip files > 500KB

class CodeIndexer:

    async def index_project(
        self,
        project_id: uuid.UUID,
        workspace_path: str,
    ) -> dict:
        """Full index of entire project workspace."""
        root  = Path(workspace_path)
        files = self._collect_files(root)

        total_chunks = 0
        async with AsyncSessionLocal() as db:
            for file_path in files:
                count = await self._index_file(
                    db, project_id, str(file_path), root
                )
                total_chunks += count

        return {"files_indexed": len(files), "chunks": total_chunks}

    async def index_file(
        self,
        project_id: uuid.UUID,
        abs_file_path: str,
        workspace_root: str,
    ) -> int:
        """Incremental index of a single file."""
        async with AsyncSessionLocal() as db:
            return await self._index_file(
                db, project_id, abs_file_path, Path(workspace_root)
            )

    async def delete_file_index(
        self,
        project_id: uuid.UUID,
        abs_file_path: str,
    ) -> None:
        async with AsyncSessionLocal() as db:
            await vector_store.delete_file(db, project_id, abs_file_path)

    async def _index_file(
        self,
        db: AsyncSession,
        project_id: uuid.UUID,
        abs_file_path: str,
        workspace_root: Path,
    ) -> int:
        path = Path(abs_file_path)

        # Skip if too large
        if path.stat().st_size > MAX_FILE_SIZE_BYTES:
            return 0

        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return 0

        # Relative path stored in DB (cleaner for display + search)
        try:
            rel_path = str(path.relative_to(workspace_root))
        except ValueError:
            rel_path = abs_file_path

        chunks = chunk_file(rel_path, content)
        if not chunks:
            return 0

        # Embed all chunks in one batch call
        texts      = [c.content for c in chunks]
        embeddings = await embed_documents(texts)

        await vector_store.upsert_chunks(
            db, project_id, rel_path, chunks, embeddings
        )
        return len(chunks)

    def _collect_files(self, root: Path) -> list[Path]:
        files = []
        for path in root.rglob("*"):
            if path.is_file():
                if any(part in SKIP_DIRS for part in path.parts):
                    continue
                if path.suffix.lower() in INDEXABLE_EXTENSIONS:
                    files.append(path)
        return files

code_indexer = CodeIndexer()