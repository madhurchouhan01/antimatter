from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv
from typing import List, Optional
import os
import sys

# Make ai_engine importable
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ai_engine.rag import CodebaseIndex, build_context

load_dotenv()

app = FastAPI(title="ANTIMATTER", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
index = CodebaseIndex(persist_dir="./memory/chromadb")

# ─── MODELS ───────────────────────────────────────────────────────────────────

class HistoryMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    file_content: str = ""
    filename: str = ""
    model: str = "llama-3.3-70b-versatile"
    history: Optional[List[HistoryMessage]] = []
    use_rag: bool = True

class IndexRequest(BaseModel):
    files: dict  # { filename: content }

# ─── CHAT ENDPOINT ────────────────────────────────────────────────────────────

def stream_response(req: ChatRequest):
    # Build RAG context
    if req.use_rag:
        context, retrieved = build_context(
            query=req.message,
            open_file_content=req.file_content,
            open_filename=req.filename,
            index=index,
        )
    else:
        context = f"## {req.filename}\n```\n{req.file_content[:8000]}\n```" if req.file_content else ""
        retrieved = []

    system_prompt = (
        "You are ANTIMATTER, an elite AI coding assistant embedded inside a developer's code editor. "
        "You have deep context of the user's entire codebase. "
        "When writing code, always use markdown code blocks with the correct language. "
        "Be precise, concise, and practical. Prefer showing code over explaining it. "
        "When referencing specific lines or functions from the provided context, mention them by name."
    )

    if context:
        system_prompt += f"\n\n{context}"

    if retrieved:
        sources = list(set(c["metadata"]["filename"] for c in retrieved))
        system_prompt += f"\n\n[Context sourced from: {', '.join(sources)}]"

    messages = [{"role": "system", "content": system_prompt}]

    for h in (req.history or []):
        if h.role in ("user", "assistant"):
            messages.append({"role": h.role, "content": h.content})

    messages.append({"role": "user", "content": req.message})

    stream = client.chat.completions.create(
        model=req.model,
        messages=messages,
        stream=True,
        max_tokens=2048,
        temperature=0.3,
    )

    # Stream sources header first
    if retrieved:
        sources_str = ", ".join(
            f"`{c['metadata']['filename']}`" for c in retrieved[:3]
        )
        yield f"[Searched: {sources_str}]\n\n"

    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


@app.post("/chat")
def chat(req: ChatRequest):
    return StreamingResponse(stream_response(req), media_type="text/plain")


# ─── INDEX ENDPOINT ───────────────────────────────────────────────────────────

@app.post("/index-project")
def index_project(req: IndexRequest):
    """Index a dict of files into ChromaDB for RAG."""
    stats = index.index_files(req.files)
    return {
        "status": "indexed",
        "files_indexed": stats["files"],
        "chunks_created": stats["chunks"],
        "skipped": stats["skipped"],
        "total_chunks": index.stats()["total_chunks"],
    }


@app.post("/index-clear")
def index_clear():
    """Wipe the entire index."""
    index.clear()
    return {"status": "cleared"}


@app.get("/index-stats")
def index_stats():
    return index.stats()


@app.get("/health")
def health():
    return {
        "status": "ok",
        "app": "ANTIMATTER",
        "version": "0.3.0",
        "index_chunks": index.stats()["total_chunks"],
        "models": [
            "llama-3.3-70b-versatile",
            "deepseek-r1-distill-llama-70b",
            "mixtral-8x7b-32768"
        ]
    }