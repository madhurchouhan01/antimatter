"""
ANTIMATTER Backend — v4.0
Endpoints: /chat (RAG), /agent (multi-agent pipeline), /index-project, /memory
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv
from typing import List, Optional
import os, sys, json
from pydantic import BaseModel
from typing import List, Optional, Dict
 

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ai_engine.rag import CodebaseIndex, build_context
from ai_engine.agents import MemoryManager, run_agent_pipeline

load_dotenv()

app = FastAPI(title="ANTIMATTER", version="4.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

client     = Groq(api_key=os.getenv("GROQ_API_KEY"))
index      = CodebaseIndex(persist_dir="./memory/chromadb")
memory     = MemoryManager(db_path="./memory/antimatter.db")

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

class AgentRequest(BaseModel):
    task: str
    file_content: str = ""
    filename: str = ""
    available_files: List[str] = []
    model: str = "llama-3.3-70b-versatile"

class IndexRequest(BaseModel):
    files: dict
 
class PatchRequest(BaseModel):
    task: str
    open_filename: str = ""
    open_file_content: str = ""
    all_files: Dict[str, str] = {}   # { filename: content } for all open files
    model: str = "llama-3.3-70b-versatile"
 

# ─── /chat ────────────────────────────────────────────────────────────────────

def stream_chat(req: ChatRequest):
    if req.use_rag:
        context, retrieved = build_context(
            query=req.message,
            open_file_content=req.file_content,
            open_filename=req.filename,
            index=index,
        )
    else:
        context  = f"## {req.filename}\n```\n{req.file_content[:8000]}\n```" if req.file_content else ""
        retrieved = []

    system = (
        "You are ANTIMATTER, an elite AI coding assistant inside a code editor. "
        "Be precise, concise, and practical. Always use markdown code blocks. "
        "Prefer showing code over long explanations."
        "If the task is a small fix or targeted change (fixing a bug, adding validation, "
        "renaming a variable), output ONLY the modified function or class, not the entire file. "
        "If the task requires rewriting most of the file, then output the full file. "
        "Always start your code block with a comment indicating what was changed and where."
    )
    if context:
        system += f"\n\n{context}"
    if retrieved:
        sources = list(set(c["metadata"]["filename"] for c in retrieved))
        system += f"\n\n[Context from: {', '.join(sources)}]"

    msgs = [{"role": "system", "content": system}]
    for h in (req.history or []):
        if h.role in ("user", "assistant"):
            msgs.append({"role": h.role, "content": h.content})
    msgs.append({"role": "user", "content": req.message})

    if retrieved:
        sources_str = ", ".join(f"`{c['metadata']['filename']}`" for c in retrieved[:3])
        yield f"[Searched: {sources_str}]\n\n"

    stream = client.chat.completions.create(
        model=req.model, messages=msgs,
        stream=True, max_tokens=2048, temperature=0.3,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta

@app.post("/chat")
def chat(req: ChatRequest):
    return StreamingResponse(stream_chat(req), media_type="text/plain")

# ─── /agent ───────────────────────────────────────────────────────────────────

def stream_agent(req: AgentRequest):
    # Get RAG context for executor
    rag_context, _ = build_context(
        query=req.task,
        open_file_content=req.file_content,
        open_filename=req.filename,
        index=index,
    )

    yield from run_agent_pipeline(
        task=req.task,
        open_file=req.file_content,
        open_filename=req.filename,
        available_files=req.available_files,
        rag_context=rag_context,
        memory=memory,
        model=req.model,
    )

@app.post("/agent")
def agent(req: AgentRequest):
    return StreamingResponse(stream_agent(req), media_type="text/plain")

# ─── /index ───────────────────────────────────────────────────────────────────

@app.post("/index-project")
def index_project(req: IndexRequest):
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
    index.clear()
    return {"status": "cleared"}

@app.get("/index-stats")
def index_stats():
    return index.stats()

# ─── /memory ──────────────────────────────────────────────────────────────────

@app.get("/memory/stats")
def memory_stats():
    return memory.stats()

@app.get("/memory/runs")
def memory_runs():
    return memory.get_recent_runs(10)

@app.get("/memory/file/{filename}")
def memory_file(filename: str):
    return memory.get_file_decisions(filename)

@app.post("/patch")
def patch(req: PatchRequest):
    """
    Full surgical patch pipeline:
    1. RAG search to find relevant chunks
    2. Identify target files from task + RAG evidence
    3. Generate structured JSON patches per file
    4. Resolve patches to exact line numbers
    5. Return resolved patch list to frontend
    """
    from ai_engine.patch_engine import identify_target_files, generate_surgical_patches
 
    # Step 1 — RAG search
    rag_context, rag_chunks = build_context(
        query=req.task,
        open_file_content=req.open_file_content,
        open_filename=req.open_filename,
        index=index,
    )
 
    # Step 2 — File identification
    # Use a dummy plan with open file as starting point
    planner_files = [req.open_filename] if req.open_filename else []
    target_files = identify_target_files(
        task=req.task,
        rag_chunks=rag_chunks,
        available_files=list(req.all_files.keys()),
        planner_files=planner_files,
        model=req.model,
    )
 
    if not target_files:
        return {
            "success": False,
            "error": "Could not identify target files for this task.",
            "patches": [],
        }
 
    # Step 3+4 — Generate and resolve patches
    # Build rag_context string (top 3 non-target chunks for cross-file awareness)
    rag_str = "\n\n".join(
        f"## {c['metadata']['filename']} — `{c['metadata']['name']}`\n```\n{c['text'][:400]}\n```"
        for c in rag_chunks[:3]
        if c["metadata"].get("filename") not in target_files
    )
 
    patch_results = generate_surgical_patches(
        task=req.task,
        target_files=target_files,
        file_contents=req.all_files,
        rag_context=rag_str,
        model=req.model,
    )
 
    return {
        "success": True,
        "target_files": target_files,
        "results": patch_results,
    }
 
# ─── /health ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "app": "ANTIMATTER",
        "version": "4.0.0",
        "index_chunks": index.stats()["total_chunks"],
        "memory": memory.stats(),
    }