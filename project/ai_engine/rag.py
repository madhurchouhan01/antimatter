import ast
import os
import hashlib
import chromadb
from chromadb.utils import embedding_functions
from typing import List, Dict, Tuple
import tiktoken

# ─── CHUNKER ──────────────────────────────────────────────────────────────────

def chunk_python_file(filepath: str, content: str) -> List[Dict]:
    """
    Smart chunker for Python files.
    Splits by class and function definitions using AST.
    Falls back to line-based chunking for non-Python files.
    """
    chunks = []
    try:
        tree = ast.parse(content)
        lines = content.splitlines()

        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                # Only top-level and class-level definitions
                start = node.lineno - 1
                end = node.end_lineno
                chunk_text = "\n".join(lines[start:end])
                chunk_id = hashlib.md5(f"{filepath}:{start}:{end}".encode()).hexdigest()

                chunks.append({
                    "id": chunk_id,
                    "text": chunk_text,
                    "metadata": {
                        "filepath": filepath,
                        "filename": os.path.basename(filepath),
                        "type": type(node).__name__,
                        "name": node.name,
                        "start_line": start + 1,
                        "end_line": end,
                    }
                })

        # If no functions/classes found, chunk whole file
        if not chunks:
            chunks = chunk_generic_file(filepath, content)

    except SyntaxError:
        chunks = chunk_generic_file(filepath, content)

    return chunks


def chunk_generic_file(filepath: str, content: str, chunk_size: int = 60) -> List[Dict]:
    """
    Line-based chunking for non-Python files.
    Splits into overlapping windows of `chunk_size` lines.
    """
    lines = content.splitlines()
    chunks = []
    overlap = 10

    for i in range(0, len(lines), chunk_size - overlap):
        window = lines[i: i + chunk_size]
        chunk_text = "\n".join(window)
        if not chunk_text.strip():
            continue
        chunk_id = hashlib.md5(f"{filepath}:{i}".encode()).hexdigest()
        chunks.append({
            "id": chunk_id,
            "text": chunk_text,
            "metadata": {
                "filepath": filepath,
                "filename": os.path.basename(filepath),
                "type": "block",
                "name": f"lines {i+1}-{i+len(window)}",
                "start_line": i + 1,
                "end_line": i + len(window),
            }
        })

    return chunks


def chunk_file(filepath: str, content: str) -> List[Dict]:
    """Route to the right chunker based on file extension."""
    ext = filepath.rsplit(".", 1)[-1].lower() if "." in filepath else ""
    if ext == "py":
        return chunk_python_file(filepath, content)
    else:
        return chunk_generic_file(filepath, content)


# ─── CHROMA DB ────────────────────────────────────────────────────────────────

class CodebaseIndex:
    def __init__(self, persist_dir: str = "./memory/chromadb"):
        os.makedirs(persist_dir, exist_ok=True)
        self.client = chromadb.PersistentClient(path=persist_dir)

        # Use Chroma's built-in sentence transformer (no API key needed)
        self.ef = embedding_functions.DefaultEmbeddingFunction()

    def _get_collection(self, username: str):
        # Clean username to meet ChromaDB collection name rules
        safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in username).strip("_")
        name = f"codebase_{safe_name}"[:63]
        return self.client.get_or_create_collection(
            name=name,
            embedding_function=self.ef,
            metadata={"hnsw:space": "cosine"}
        )

    def index_files(self, files: Dict[str, str], username: str) -> Dict:
        """
        Index a dict of {filename: content} into ChromaDB for a specific user.
        Returns a summary of what was indexed.
        """
        collection = self._get_collection(username)
        all_chunks = []
        stats = {"files": 0, "chunks": 0, "skipped": []}

        for filepath, content in files.items():
            if not content.strip():
                stats["skipped"].append(filepath)
                continue

            chunks = chunk_file(filepath, content)
            all_chunks.extend(chunks)
            stats["files"] += 1

        if not all_chunks:
            return stats

        # Batch upsert into ChromaDB
        batch_size = 50
        for i in range(0, len(all_chunks), batch_size):
            batch = all_chunks[i: i + batch_size]
            collection.upsert(
                ids=[c["id"] for c in batch],
                documents=[c["text"] for c in batch],
                metadatas=[c["metadata"] for c in batch],
            )

        stats["chunks"] = len(all_chunks)
        return stats

    def search(self, query: str, username: str, n_results: int = 5, filename_filter: str = None) -> List[Dict]:
        """
        Semantic search over the user's indexed codebase.
        Optionally filter by filename.
        Returns list of relevant chunks with metadata.
        """
        collection = self._get_collection(username)
        if collection.count() == 0:
            return []

        where = {"filename": filename_filter} if filename_filter else None

        try:
            results = collection.query(
                query_texts=[query],
                n_results=min(n_results, collection.count()),
                where=where,
            )
        except Exception:
            results = collection.query(
                query_texts=[query],
                n_results=min(n_results, collection.count()),
            )

        chunks = []
        if results and results["documents"]:
            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            ):
                chunks.append({
                    "text": doc,
                    "metadata": meta,
                    "relevance": round(1 - dist, 3),
                })

        return chunks

    def clear(self, username: str):
        """Wipe the user's index."""
        collection = self._get_collection(username)
        self.client.delete_collection(collection.name)

    def stats(self, username: str) -> Dict:
        collection = self._get_collection(username)
        return {
            "total_chunks": collection.count(),
            "collection": collection.name
        }


# ─── CONTEXT BUILDER ──────────────────────────────────────────────────────────

def count_tokens(text: str) -> int:
    """Approximate token count using tiktoken."""
    try:
        enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))
    except Exception:
        return len(text) // 4  # rough fallback


def build_context(
    query: str,
    open_file_content: str,
    open_filename: str,
    index: CodebaseIndex,
    username: str,
    max_tokens: int = 6000,
) -> Tuple[str, List[Dict]]:
    """
    Build the best possible context for the AI given:
    - The user's query
    - The currently open file
    - The indexed codebase (via RAG)

    Returns (context_string, retrieved_chunks)
    """
    context_parts = []
    used_tokens = 0
    retrieved = []

    # 1. Always include the open file first (truncated if huge)
    if open_file_content and open_filename:
        file_section = f"## Currently open file: {open_filename}\n```\n{open_file_content}\n```"
        file_tokens = count_tokens(file_section)

        if file_tokens <= max_tokens * 0.6:
            context_parts.append(file_section)
            used_tokens += file_tokens
        else:
            # Truncate to first 100 lines if huge
            truncated = "\n".join(open_file_content.splitlines()[:100])
            file_section = f"## Currently open file: {open_filename} (truncated)\n```\n{truncated}\n```"
            context_parts.append(file_section)
            used_tokens += count_tokens(file_section)

    # 2. RAG retrieval for relevant chunks from other files
    remaining_tokens = max_tokens - used_tokens
    if remaining_tokens > 500:
        chunks = index.search(query, username, n_results=6)
        retrieved = chunks

        rag_parts = []
        for chunk in chunks:
            meta = chunk["metadata"]
            # Skip if it's from the already-included open file
            if meta.get("filename") == open_filename:
                continue

            chunk_text = (
                f"## {meta.get('filename')} — {meta.get('type')} `{meta.get('name')}` "
                f"(lines {meta.get('start_line')}-{meta.get('end_line')}, "
                f"relevance: {chunk['relevance']})\n"
                f"```\n{chunk['text']}\n```"
            )
            chunk_tokens = count_tokens(chunk_text)

            if used_tokens + chunk_tokens <= max_tokens:
                rag_parts.append(chunk_text)
                used_tokens += chunk_tokens
            else:
                break

        if rag_parts:
            context_parts.append("## Relevant code from your project\n" + "\n\n".join(rag_parts))

    return "\n\n".join(context_parts), retrieved