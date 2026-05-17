"""
ANTIMATTER Backend — v4.0
Endpoints: /chat (RAG), /agent (multi-agent pipeline), /index-project, /memory
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv
from typing import List, Optional
import os, sys, json
from pydantic import BaseModel
from typing import List, Optional, Dict
import re
import asyncio
import docker
import uuid
import jwt
import httpx
import urllib.parse
from fastapi import Request, Response, HTTPException
from fastapi.responses import RedirectResponse
from datetime import datetime, timedelta
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ai_engine.rag import CodebaseIndex, build_context
from ai_engine.agents import MemoryManager, run_agent_pipeline, oracle_agent, planner_agent

load_dotenv()

app = FastAPI(title="ANTIMATTER", version="4.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Anchor memory paths to project root (one level above backend/)
# so they resolve correctly regardless of where uvicorn is launched from.
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_MEMORY_DIR   = os.path.join(_PROJECT_ROOT, "memory")

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
index  = CodebaseIndex(persist_dir=os.path.join(_MEMORY_DIR, "chromadb"))

active_containers = {}  # { short_id: container }

import sqlite3
sandbox_db_path = os.path.join(_MEMORY_DIR, "sandbox.db")

def init_sandbox_db():
    with sqlite3.connect(sandbox_db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_sandboxes (
                username TEXT PRIMARY KEY,
                container_id TEXT
            )
        """)
init_sandbox_db()

def get_user_container(username: str):
    with sqlite3.connect(sandbox_db_path) as conn:
        cur = conn.execute("SELECT container_id FROM user_sandboxes WHERE username = ?", (username,))
        row = cur.fetchone()
        return row[0] if row else None

def set_user_container(username: str, container_id: str):
    with sqlite3.connect(sandbox_db_path) as conn:
        conn.execute("""
            INSERT INTO user_sandboxes (username, container_id) 
            VALUES (?, ?)
            ON CONFLICT(username) DO UPDATE SET container_id = excluded.container_id
        """, (username, container_id))
# ─── MODELS ───────────────────────────────────────────────────────────────────

class FSReadRequest(BaseModel):
    session_id: str
    path: str

class FSWriteRequest(BaseModel):
    session_id: str
    path: str
    content: str

class FSDeleteRequest(BaseModel):
    session_id: str
    path: str

class FSMkdirRequest(BaseModel):
    session_id: str
    path: str

class FSRenameRequest(BaseModel):
    session_id: str
    old_path: str
    new_path: str

class HistoryMessage(BaseModel):
    role: str
    content: str

class HistorySessionMeta(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int = 0

class SaveSessionRequest(BaseModel):
    session_id: str
    messages: List[HistoryMessage]
    title: Optional[str] = ""

class ChatRequest(BaseModel):
    message: str
    file_content: str = ""
    filename: str = ""
    model: str = "llama-3.1-8b-instant"
    history: Optional[List[HistoryMessage]] = []
    use_rag: bool = True

class AgentRequest(BaseModel):
    task: str
    file_content: str = ""
    filename: str = ""
    available_files: List[str] = []
    model: str = "llama-3.1-8b-instant"

class IndexRequest(BaseModel):
    files: dict
 
class PatchRequest(BaseModel):
    task: str
    open_filename: str = ""
    open_file_content: str = ""
    all_files: Dict[str, str] = {}   # { filename: content } for all open files
    model: str = "llama-3.1-8b-instant"

class OracleRequest(BaseModel):
    message: str
    file_content: str = ""
    filename: str = ""
    model: str = "llama-3.1-8b-instant"
    history: Optional[List[HistoryMessage]] = []
    use_rag: bool = True
    use_web_search: bool = False
    wants_diagram: bool = False   # ← add this


class CortexPlanRequest(BaseModel):
    goal: str
    file_content: str = ""
    filename: str = ""
    available_files: List[str] = []
    model: str = "llama-3.1-8b-instant"

class CortexExecuteRequest(BaseModel):
    goal: str
    step: str                         # description of this step
    step_index: int = 0
    total_steps: int = 1
    file_content: str = ""
    filename: str = ""
    all_files: Dict[str, str] = {}
    model: str = "llama-3.1-8b-instant"


# ─── AUTHENTICATION ───────────────────────────────────────────────────────────

JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-antimatter-key")
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")

memory_managers = {}
def get_memory(username: str):
    if not username:
        username = "anonymous"
    if username not in memory_managers:
        db_path = os.path.join(_MEMORY_DIR, "users", username, "antimatter.db")
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        memory_managers[username] = MemoryManager(db_path=db_path)
    return memory_managers[username]

# ─── HISTORY HELPERS ──────────────────────────────────────────────────────────

def get_user_history_dir(username: str) -> str:
    """Return (and create) the per-user history directory."""
    if not username:
        username = "anonymous"
    hist_dir = os.path.join(_MEMORY_DIR, "users", username, "history")
    os.makedirs(hist_dir, exist_ok=True)
    return hist_dir

def _sync_history_to_docker(username: str, session_id: str, data: dict):
    """Push a single history JSON file into the user's Docker volume (best-effort)."""
    try:
        existing_cid = get_user_container(username)
        if not existing_cid:
            return
        container = docker_client.containers.get(existing_cid)
        if container.status != "running":
            return
        import tarfile, io
        content = json.dumps(data, indent=2).encode("utf-8")
        tar_buffer = io.BytesIO()
        with tarfile.open(fileobj=tar_buffer, mode="w") as tar:
            info = tarfile.TarInfo(name=f".antimatter/history/{session_id}.json")
            info.size = len(content)
            tar.addfile(info, io.BytesIO(content))
        tar_buffer.seek(0)
        container.put_archive("/home/sandboxuser", tar_buffer)
    except Exception as e:
        print(f"[history] docker sync skipped: {e}")

def get_username_from_request(request: Request) -> str:
    token = request.cookies.get("antimatter_session")
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            return payload.get("sub", "anonymous")
        except:
            pass
    return "anonymous"


@app.get("/auth/github/login")
def github_login():
    """Redirect to GitHub for OAuth login."""
    if not GITHUB_CLIENT_ID:
        return {"error": "GITHUB_CLIENT_ID not configured in backend"}
    params = {
        "client_id": GITHUB_CLIENT_ID,
        "scope": "repo user",  # request access to private repos and user profile
        "redirect_uri": "http://localhost:1842/auth/github/callback"
    }
    url = f"https://github.com/login/oauth/authorize?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url)

@app.get("/auth/github/callback")
async def github_callback(code: str):
    """Handle GitHub callback and set HttpOnly JWT cookie."""
    async with httpx.AsyncClient() as client:
        # Exchange code for access token
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code
            }
        )
        token_data = token_res.json()
        access_token = token_data.get("access_token")

        if not access_token:
            raise HTTPException(status_code=400, detail="Failed to get access token from GitHub")

        # Get user profile
        user_res = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json"
            }
        )
        user_data = user_res.json()
        username = user_data.get("login")
        avatar_url = user_data.get("avatar_url")

        if not username:
            raise HTTPException(status_code=400, detail="Failed to fetch user data")

        # Create JWT
        payload = {
            "sub": username,
            "github_token": access_token,
            "avatar_url": avatar_url,
            "exp": datetime.utcnow() + timedelta(days=7)
        }
        token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")

        # Set HttpOnly cookie and redirect to frontend
        response = RedirectResponse(url="/")
        response.set_cookie(
            key="antimatter_session",
            value=token,
            httponly=True,
            secure=False,  # Set to True if using HTTPS
            samesite="lax",
            max_age=7 * 24 * 3600
        )
        return response

@app.get("/auth/me")
def get_current_user(request: Request):
    """Get the currently logged in user from JWT cookie."""
    token = request.cookies.get("antimatter_session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return {
            "username": payload.get("sub"),
            "avatar_url": payload.get("avatar_url"),
            "has_github_token": bool(payload.get("github_token"))
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.post("/auth/logout")
def logout():
    response = {"status": "logged_out"}
    res = Response(content=json.dumps(response), media_type="application/json")
    res.delete_cookie("antimatter_session")
    return res

# ─── /chat ────────────────────────────────────────────────────────────────────

def stream_chat(req: ChatRequest, username: str):
    if req.use_rag:
        context, retrieved = build_context(
            query=req.message,
            open_file_content=req.file_content,
            open_filename=req.filename,
            index=index,
            username=username,
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
def chat(req: ChatRequest, request: Request):
    username = get_username_from_request(request)
    return StreamingResponse(stream_chat(req, username), media_type="text/plain")

# ─── /agent ───────────────────────────────────────────────────────────────────

def stream_agent(req: AgentRequest, username: str):
    # Get RAG context for executor
    rag_context, _ = build_context(
        query=req.task,
        open_file_content=req.file_content,
        open_filename=req.filename,
        index=index,
        username=username,
    )

    yield from run_agent_pipeline(
        task=req.task,
        open_file=req.file_content,
        open_filename=req.filename,
        available_files=req.available_files,
        rag_context=rag_context,
        memory=get_memory(username),
        model=req.model,
    )

@app.post("/agent")
def agent(req: AgentRequest, request: Request):
    username = get_username_from_request(request)
    return StreamingResponse(stream_agent(req, username), media_type="text/plain")

# ─── /oracle ──────────────────────────────────────────────────────────────────

def stream_oracle(req: OracleRequest, username: str):
    rag_context = ""
    rag_sources = []
    if req.use_rag:
        context_str, retrieved = build_context(
            query=req.message,
            open_file_content=req.file_content,
            open_filename=req.filename,
            index=index,
            username=username,
        )
        rag_context = context_str
        rag_sources = list(set(
            c["metadata"]["filename"] for c in retrieved
        ))[:4]
    else:
        rag_context = f"## {req.filename}\n```\n{req.file_content[:8000]}\n```" if req.file_content else ""

    if rag_sources:
        import json as _json
        yield f"[RAG_SOURCES]{_json.dumps(rag_sources)}[/RAG_SOURCES]\n"

    # ── Main oracle stream ──────────────────────────────────────
    full_response = ""
    stream = oracle_agent(
        query=req.message,
        open_file=req.file_content,
        open_filename=req.filename,
        rag_context=rag_context,
        model=req.model,
        use_web_search=req.use_web_search,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            full_response += delta
            yield delta

    # ── Diagram generation ──────────────────────────────────────
    ARCH_KEYWORDS = {"architecture","data flow","pipeline","flow","structure",
                     "overview","describe project","how does","system","diagram"}
    auto_trigger = any(k in req.message.lower() for k in ARCH_KEYWORDS)

    if req.wants_diagram or auto_trigger:
        context_snippet = rag_context[:3000] if rag_context else full_response[:3000]
        diagram_prompt = f"""You are a software architect. Based on the codebase context below, generate a Mermaid diagram showing the data flow and architecture.

Rules:
- Use `flowchart LR` or `graph TD` syntax
- Show components, data flow arrows, and key relationships
- Keep it concise — max 20 nodes
- Output ONLY the raw Mermaid code. No explanation. No markdown fences. No preamble.
Valid Example:
graph TD
    A["User Input"] --> B["API Gateway"]
    B --> C["Authentication Service"]
    B --> D["Processing Engine"]
    D --> E["Database"]
    D --> F["Cache Layer"]
    E --> G["Analytics Module"]
    G --> H["Dashboard"]

Context:
{context_snippet}"""

        diagram_resp = client.chat.completions.create(
            model=req.model,
            messages=[{"role": "user", "content": diagram_prompt}],
            temperature=0.1,
            max_tokens=600,
        )
        raw = diagram_resp.choices[0].message.content.strip()
        # Strip fences if model disobeys
        raw = re.sub(r"^```(?:mermaid)?\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        yield f"\n\n[MERMAID]{raw.strip()}[/MERMAID]"
        
@app.post("/oracle")
def oracle_endpoint(req: OracleRequest, request: Request):
    username = get_username_from_request(request)
    return StreamingResponse(stream_oracle(req, username), media_type="text/plain")

# ─── /cortex/plan ─────────────────────────────────────────────────────────────

@app.post("/cortex/plan")
def cortex_plan(req: CortexPlanRequest, request: Request):
    """
    Generates an editable multi-step plan from a high-level goal.
    Returns JSON: { understanding, complexity, approach, steps, warnings }
    Steps have a 'type' field: understand | execute | verify | summarize
    """
    username = get_username_from_request(request)
    memory = get_memory(username)
    memory_summary = memory.get_memory_summary()
    plan = planner_agent(
        task=req.goal,
        open_file=req.file_content,
        open_filename=req.filename,
        available_files=req.available_files,
        memory_summary=memory_summary,
        model=req.model,
    )
    return plan

# ─── /cortex/execute ──────────────────────────────────────────────────────────

@app.post("/cortex/execute")
def cortex_execute(req: CortexExecuteRequest, request: Request):
    """
    Executes a single EXECUTE-type step from CORTEX.
    Runs the patch engine on the step description and returns patch results.
    """
    username = get_username_from_request(request)
    from ai_engine.patch_engine import identify_target_files, generate_surgical_patches

    # RAG search for relevant context
    rag_context, rag_chunks = build_context(
        query=req.step,
        open_file_content=req.file_content,
        open_filename=req.filename,
        index=index,
            username=username,
    )

    planner_files = [req.filename] if req.filename else []
    target_files = identify_target_files(
        task=req.step,
        rag_chunks=rag_chunks,
        available_files=list(req.all_files.keys()),
        planner_files=planner_files,
        model=req.model,
    )

    if not target_files:
        return {
            "success": False,
            "step": req.step,
            "step_index": req.step_index,
            "error": "Could not identify target files for this step.",
            "patches": [],
        }

    rag_str = "\n\n".join(
        f"## {c['metadata']['filename']} — `{c['metadata']['name']}`\n```\n{c['text'][:400]}\n```"
        for c in rag_chunks[:3]
        if c["metadata"].get("filename") not in target_files
    )

    patch_results = generate_surgical_patches(
        task=req.step,
        target_files=target_files,
        file_contents=req.all_files,
        rag_context=rag_str,
        model=req.model,
    )

    return {
        "success": True,
        "step": req.step,
        "step_index": req.step_index,
        "total_steps": req.total_steps,
        "target_files": target_files,
        "results": patch_results,
    }

# ─── /index ───────────────────────────────────────────────────────────────────

@app.post("/index-project")
def index_project(req: IndexRequest, request: Request):
    username = get_username_from_request(request)
    stats = index.index_files(req.files, username)
    return {
        "status": "indexed",
        "files_jindexed": stats["files"],
        "chunks_created": stats["chunks"],
        "skipped": stats["skipped"],
        "total_chunks": index.stats(username)["total_chunks"],
    }

@app.post("/index-clear")
def index_clear(request: Request):
    username = get_username_from_request(request)
    index.clear(username)
    return {"status": "cleared"}

@app.get("/index-stats")
def index_stats(request: Request):
    username = get_username_from_request(request)
    return index.stats(username)

# ─── /memory ──────────────────────────────────────────────────────────────────

@app.get("/memory/stats")
def memory_stats(request: Request):
    username = get_username_from_request(request)
    memory = get_memory(username)
    return memory.stats()

@app.get("/memory/runs")
def memory_runs(request: Request):
    username = get_username_from_request(request)
    memory = get_memory(username)
    return memory.get_recent_runs(10)

@app.get("/memory/file/{filename}")
def memory_file(filename: str, request: Request):
    username = get_username_from_request(request)
    memory = get_memory(username)
    return memory.get_file_decisions(filename)

# ─── /history ─────────────────────────────────────────────────────────────────

@app.get("/history/sessions")
def history_list(request: Request):
    """Return all session metadata for the current user (sorted newest first)."""
    username = get_username_from_request(request)
    hist_dir = get_user_history_dir(username)
    sessions = []
    for fname in os.listdir(hist_dir):
        if not fname.endswith(".json"):
            continue
        fpath = os.path.join(hist_dir, fname)
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
            sessions.append({
                "id": data.get("id", fname[:-5]),
                "title": data.get("title", "Untitled"),
                "created_at": data.get("created_at", ""),
                "updated_at": data.get("updated_at", ""),
                "message_count": len(data.get("messages", [])),
            })
        except Exception:
            pass
    sessions.sort(key=lambda s: s.get("updated_at", ""), reverse=True)
    return {"sessions": sessions}


@app.get("/history/sessions/{session_id}")
def history_get(session_id: str, request: Request):
    """Return the full message list for a session."""
    username = get_username_from_request(request)
    hist_dir = get_user_history_dir(username)
    fpath = os.path.join(hist_dir, f"{session_id}.json")
    if not os.path.exists(fpath):
        raise HTTPException(status_code=404, detail="Session not found")
    with open(fpath, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


@app.post("/history/sessions")
def history_create(request: Request):
    """Create a new empty session and return its ID."""
    username = get_username_from_request(request)
    hist_dir = get_user_history_dir(username)
    session_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat() + "Z"
    data = {
        "id": session_id,
        "title": "New conversation",
        "created_at": now,
        "updated_at": now,
        "messages": [],
    }
    fpath = os.path.join(hist_dir, f"{session_id}.json")
    with open(fpath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    return {"session_id": session_id, "created_at": now}


@app.put("/history/sessions/{session_id}")
def history_save(session_id: str, req: SaveSessionRequest, request: Request):
    """Overwrite a session's messages and update its title + timestamp."""
    username = get_username_from_request(request)
    hist_dir = get_user_history_dir(username)
    fpath = os.path.join(hist_dir, f"{session_id}.json")

    # Load existing or start fresh (handles race at creation)
    if os.path.exists(fpath):
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        now = datetime.utcnow().isoformat() + "Z"
        data = {"id": session_id, "title": "New conversation", "created_at": now, "messages": []}

    # Derive title from first user message if not provided
    title = req.title
    if not title:
        for msg in req.messages:
            if msg.role == "user":
                title = msg.content[:60] + ("…" if len(msg.content) > 60 else "")
                break
    data["title"] = title or data.get("title", "Untitled")
    data["messages"] = [{"role": m.role, "content": m.content} for m in req.messages]
    data["updated_at"] = datetime.utcnow().isoformat() + "Z"

    with open(fpath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    # Best-effort sync to Docker volume for authenticated users
    if username != "anonymous":
        _sync_history_to_docker(username, session_id, data)

    return {"status": "saved", "session_id": session_id, "title": data["title"]}


@app.delete("/history/sessions/{session_id}")
def history_delete(session_id: str, request: Request):
    """Delete a session from disk."""
    username = get_username_from_request(request)
    hist_dir = get_user_history_dir(username)
    fpath = os.path.join(hist_dir, f"{session_id}.json")
    if not os.path.exists(fpath):
        raise HTTPException(status_code=404, detail="Session not found")
    os.remove(fpath)
    return {"status": "deleted", "session_id": session_id}

@app.post("/patch")
def patch(req: PatchRequest, request: Request):
    """
    Full surgical patch pipeline:
    1. RAG search to find relevant chunks
    2. Identify target files from task + RAG evidence
    3. Generate structured JSON patches per file
    4. Resolve patches to exact line numbers
    5. Return resolved patch list to frontend
    """
    username = get_username_from_request(request)
    from ai_engine.patch_engine import identify_target_files, generate_surgical_patches
 
    # Step 1 — RAG search
    rag_context, rag_chunks = build_context(
        query=req.task,
        open_file_content=req.open_file_content,
        open_filename=req.open_filename,
        index=index,
            username=username,
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
 
import asyncio
import uuid
import json
import subprocess
import threading
import queue
import docker
from fastapi import WebSocket, WebSocketDisconnect

docker_client = docker.from_env()
sandbox_sessions = {}

@app.websocket("/terminal")
async def terminal_ws(websocket: WebSocket):
    await websocket.accept()
    
    # ── Authenticate User via Cookie ──────────────────────
    token = websocket.cookies.get("antimatter_session")
    username = None
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            username = payload.get("sub")
        except:
            pass

    container = None
    exec_sock = None
    short_id = None
    session_id = None

    try:
        # ── 1. Spin up or reconnect container ─────────────────────
        if username:
            session_id = username
            short_id = session_id[:8]
            existing_cid = get_user_container(username)
            if existing_cid:
                try:
                    container = docker_client.containers.get(existing_cid)
                    if container.status != "running":
                        container.start()
                except docker.errors.NotFound:
                    container = None
            
            if not container:
                # Persistent volume for user
                vol_name = f"antimatter_workspace_{username.lower()}"
                try:
                    docker_client.volumes.get(vol_name)
                except docker.errors.NotFound:
                    docker_client.volumes.create(name=vol_name)

                container = docker_client.containers.run(
                    image="antimatter-sandbox",
                    name=f"antimatter-{short_id}-{uuid.uuid4().hex[:4]}",
                    detach=True,
                    tty=True,
                    stdin_open=True,
                    mem_limit="256m",
                    cpu_period=100000,
                    cpu_quota=50000,
                    dns=["8.8.8.8", "1.1.1.1"],
                    remove=False,
                    volumes={vol_name: {"bind": "/home/sandboxuser/workspace", "mode": "rw"}}
                )
                set_user_container(username, container.id)
        else:
            session_id = str(uuid.uuid4())
            short_id = session_id[:8]
            container = docker_client.containers.run(
                image="antimatter-sandbox",
                name=f"antimatter-{short_id}",
                detach=True,
                tty=True,
                stdin_open=True,
                mem_limit="256m",
                cpu_period=100000,
                cpu_quota=50000,
                dns=["8.8.8.8", "1.1.1.1"],
                remove=False,
            )

        sandbox_sessions[session_id] = container
        container_id = container.id

        # ── 2. Receive init message with files ────────────────────
        init_msg  = await websocket.receive_text()
        init_data = json.loads(init_msg)
        if init_data.get("type") == "init" and init_data.get("files"):
            if not username:
                await inject_files(container, init_data["files"])
            else:
                # Only inject files if the persistent workspace is empty
                output = docker_exec_output(container, ["ls", "-A", "."])
                if not output.strip():
                    await inject_files(container, init_data["files"])

        await websocket.send_text(
            f"\r\n\x1b[32m⚡ Sandbox ready [{short_id}]\x1b[0m\r\n"
        )

        # ── 3. Open exec via Docker SDK raw socket ────────────────
        # This gives a direct TCP socket to bash — no subprocess,
        # no winpty, no Windows console routing issues.
        await asyncio.sleep(0.3)

        exec_id  = docker_client.api.exec_create(
            container_id, ["/bin/bash"],
            stdin=True, tty=True, stdout=True, stderr=True,
        )
        exec_sock = docker_client.api.exec_start(
            exec_id["Id"], detach=False, tty=True, socket=True,
        )

        # Unwrap to the raw socket (works across docker-py versions)
        import socket as _socket
        raw_sock = getattr(exec_sock, "_sock", exec_sock)
        raw_sock.settimeout(0.05)     # 50 ms read timeout — non-blocking feel

        print(f"[terminal] raw socket exec opened for {container_id[:8]}")

        # ── 4. Thread reads socket output → asyncio queue ─────────
        output_queue = queue.Queue()
        stop_event   = threading.Event()

        def read_output():
            while not stop_event.is_set():
                try:
                    data = raw_sock.recv(4096)
                    if data:
                        output_queue.put(data)
                except _socket.timeout:
                    continue          # no data yet — keep waiting
                except Exception:
                    break

        reader_thread = threading.Thread(target=read_output, daemon=True)
        reader_thread.start()

        # ── 5. Async loop: drain queue → ws, receive ws → socket ──
        loop = asyncio.get_event_loop()

        async def drain_output():
            while True:
                try:
                    data = await loop.run_in_executor(
                        None, lambda: output_queue.get(timeout=0.05)
                    )
                    await websocket.send_text(data.decode("utf-8", errors="replace"))
                except queue.Empty:
                    if stop_event.is_set():
                        break
                    await asyncio.sleep(0.01)
                except Exception:
                    break

        drainer = asyncio.create_task(drain_output())

        # Register session so /fs/* endpoints can reach this container
        active_containers[short_id] = container

        # Send short_id to frontend so it can reference this session
        await websocket.send_text(json.dumps({
            "type": "session_ready",
            "session_id": short_id
        }))

        while True:
            try:
                msg  = await asyncio.wait_for(websocket.receive_text(), timeout=0.1)
                data = json.loads(msg)

                if data["type"] == "input":
                    raw_sock.sendall(data["data"].encode("utf-8"))

                elif data["type"] == "resize":
                    try:
                        docker_client.api.exec_resize(
                            exec_id["Id"],
                            height=data["rows"],
                            width=data["cols"],
                        )
                    except Exception:
                        pass
                
            except asyncio.TimeoutError:
                # Check if bash exited
                try:
                    info = docker_client.api.exec_inspect(exec_id["Id"])
                    if not info.get("Running", True):
                        print(f"[terminal] exec finished for {container_id[:8]}")
                        break
                except Exception:
                    pass
                continue
            except WebSocketDisconnect:
                break

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[terminal] error: {e}")
        try:
            await websocket.send_text(f"\r\n\x1b[31m[error: {e}]\x1b[0m\r\n")
        except Exception:
            pass

    finally:
        # ── 6. Cleanup ────────────────────────────────────────────
        stop_event.set()
        drainer.cancel()
        try:
            if exec_sock:
                exec_sock.close()
        except Exception:
            pass
        if container:
            if username:
                sandbox_sessions.pop(session_id, None)
                active_containers.pop(short_id, None)
                print(f"[sandbox] user {username} disconnected, container {container_id[:8]} left running")
            else:
                try:
                    container.kill()
                    container.remove(force=True)
                    sandbox_sessions.pop(session_id, None)
                    active_containers.pop(short_id, None)   # ← remove FS session
                    print(f"[sandbox] cleaned up antimatter-{short_id}")
                except Exception as e:
                    print(f"[sandbox] cleanup error: {e}")


async def inject_files(container, files: dict):
    import tarfile, io
    tar_buffer = io.BytesIO()
    with tarfile.open(fileobj=tar_buffer, mode='w') as tar:
        for filename, content in files.items():
            encoded = content.encode("utf-8")
            info = tarfile.TarInfo(name=filename)
            info.size = len(encoded)
            tar.addfile(info, io.BytesIO(encoded))
    tar_buffer.seek(0)
    container.put_archive("/home/sandboxuser/workspace", tar_buffer)
    
# Store mapping of session → container_id
# (add container_id to sandbox_sessions when container starts)
# Change sandbox_sessions to store container object
# sandbox_sessions[session_id] = container  ← already doing this

# We need a separate map: a stable ID the frontend can reference
# Use a short session tag sent to frontend on connect

def docker_exec_output(container, cmd: list[str]) -> str:
    """Run a command in container and return stdout."""
    result = container.exec_run(
        cmd,
        user="sandboxuser",
        workdir="/home/sandboxuser/workspace"
    )
    return result.output.decode("utf-8", errors="replace")


@app.get("/fs/list")
async def fs_list(session_id: str, path: str = "."):
    container = active_containers.get(session_id)
    if not container:
        return {"error": "session not found"}

    # Single find call returns paths + type in one shot (much faster)
    # -printf "%y\t%p\n" prints type (f/d/l) and path, tab-separated
    output = docker_exec_output(container, [
        "find", path,
        "-not", "-path", "*/.git/*",
        "-not", "-name", ".git",
        "-printf", "%y\t%P\n"
    ])

    entries = []
    for line in output.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        parts = line.split("\t", 1)
        if len(parts) != 2:
            continue
        ftype_char, fpath = parts
        if not fpath:          # skip the root entry itself
            continue
        ftype = "dir" if ftype_char == "d" else "file"
        entries.append({
            "path": fpath,
            "name": fpath.split("/")[-1],
            "type": ftype,
            "depth": fpath.count("/"),
        })

    return {"session_id": session_id, "entries": entries}


@app.get("/fs/read")
async def fs_read(session_id: str, path: str):
    container = active_containers.get(session_id)
    if not container:
        return {"error": "session not found"}

    content = docker_exec_output(container, ["cat", path])
    return {"path": path, "content": content}


@app.post("/fs/write")
async def fs_write(req: FSWriteRequest):
    container = active_containers.get(req.session_id)
    if not container:
        return {"error": "session not found"}

    # Write file via tar inject (same as inject_files)
    import tarfile, io
    tar_buffer = io.BytesIO()
    with tarfile.open(fileobj=tar_buffer, mode='w') as tar:
        encoded = req.content.encode("utf-8")
        info = tarfile.TarInfo(name=req.path)
        info.size = len(encoded)
        tar.addfile(info, io.BytesIO(encoded))
    tar_buffer.seek(0)
    container.put_archive("/home/sandboxuser/workspace", tar_buffer)
    return {"status": "ok"}


@app.post("/fs/mkdir")
async def fs_mkdir(req: FSMkdirRequest):
    """Create a directory in the sandbox container."""
    container = active_containers.get(req.session_id)
    if not container:
        return {"error": "session not found"}
    # Use exec_run to mkdir -p
    result = container.exec_run(
        ["mkdir", "-p", req.path],
        user="sandboxuser",
        workdir="/home/sandboxuser/workspace"
    )
    if result.exit_code != 0:
        return {"error": result.output.decode("utf-8", errors="replace")}
    return {"status": "ok", "path": req.path}


@app.post("/fs/rename")
async def fs_rename(req: FSRenameRequest):
    """Rename or move a file/folder in the sandbox container."""
    container = active_containers.get(req.session_id)
    if not container:
        return {"error": "session not found"}
    result = container.exec_run(
        ["mv", req.old_path, req.new_path],
        user="sandboxuser",
        workdir="/home/sandboxuser/workspace"
    )
    if result.exit_code != 0:
        return {"error": result.output.decode("utf-8", errors="replace")}
    return {"status": "ok", "old_path": req.old_path, "new_path": req.new_path}


@app.delete("/fs/delete")
async def fs_delete(req: FSDeleteRequest):
    """Delete a file or folder in the sandbox container."""
    container = active_containers.get(req.session_id)
    if not container:
        return {"error": "session not found"}
    result = container.exec_run(
        ["rm", "-rf", req.path],
        user="sandboxuser",
        workdir="/home/sandboxuser/workspace"
    )
    if result.exit_code != 0:
        return {"error": result.output.decode("utf-8", errors="replace")}
    return {"status": "ok", "path": req.path}


@app.get("/fs/watch")
async def fs_watch(session_id: str):
    """SSE endpoint — pushes file tree updates to browser."""
    container = active_containers.get(session_id)
    if not container:
        # Must return SSE stream even for errors — plain JSON will cause
        # "MIME type not text/event-stream" error in the browser EventSource.
        async def error_stream():
            data = json.dumps({"type": "error", "message": "session not found"})
            yield f"data: {data}\n\n"
        return StreamingResponse(
            error_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache"},
        )

    async def event_stream():
        last_tree = ""
        while session_id in active_containers:
            # Run blocking docker call in a thread so we don't stall the event loop
            output = await asyncio.to_thread(
                docker_exec_output, container, [
                    "find", ".",
                    "-not", "-path", "*/.git/*",
                    "-not", "-name", ".git",
                    "-print",
                ]
            )
            if output != last_tree:
                last_tree = output
                data = json.dumps({"type": "tree_change", "raw": output})
                yield f"data: {data}\n\n"
            await asyncio.sleep(2)   # poll every 2 seconds

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"}
    )
# ─── /health ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "app": "ANTIMATTER",
        "version": "4.0.0",
        "index_chunks": index.stats(username)["total_chunks"],
        "memory": memory.stats(),
    }


from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# Add right after app = FastAPI()
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "../frontend")

@app.get("/")
async def serve_frontend():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

# Serve static assets (CSS, JS, images if any)
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")