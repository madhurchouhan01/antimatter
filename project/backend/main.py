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
import winpty
import asyncio
import docker
import uuid
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
memory = MemoryManager(db_path=os.path.join(_MEMORY_DIR, "antimatter.db"))

active_containers = {}  # { short_id: container }
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

class OracleRequest(BaseModel):
    message: str
    file_content: str = ""
    filename: str = ""
    model: str = "llama-3.3-70b-versatile"
    history: Optional[List[HistoryMessage]] = []
    use_rag: bool = True
    use_web_search: bool = False

class CortexPlanRequest(BaseModel):
    goal: str
    file_content: str = ""
    filename: str = ""
    available_files: List[str] = []
    model: str = "llama-3.3-70b-versatile"

class CortexExecuteRequest(BaseModel):
    goal: str
    step: str                         # description of this step
    step_index: int = 0
    total_steps: int = 1
    file_content: str = ""
    filename: str = ""
    all_files: Dict[str, str] = {}
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

# ─── /oracle ──────────────────────────────────────────────────────────────────

def stream_oracle(req: OracleRequest):
    rag_context = ""
    rag_sources = []
    if req.use_rag:
        context_str, retrieved = build_context(
            query=req.message,
            open_file_content=req.file_content,
            open_filename=req.filename,
            index=index,
        )
        rag_context = context_str
        rag_sources = list(set(
            c["metadata"]["filename"] for c in retrieved
        ))[:4]
    else:
        rag_context = f"## {req.filename}\n```\n{req.file_content[:8000]}\n```" if req.file_content else ""

    # Emit sources prefix so frontend can display RAG chips
    if rag_sources:
        import json as _json
        yield f"[RAG_SOURCES]{_json.dumps(rag_sources)}[/RAG_SOURCES]\n"

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
            yield delta

@app.post("/oracle")
def oracle_endpoint(req: OracleRequest):
    return StreamingResponse(stream_oracle(req), media_type="text/plain")

# ─── /cortex/plan ─────────────────────────────────────────────────────────────

@app.post("/cortex/plan")
def cortex_plan(req: CortexPlanRequest):
    """
    Generates an editable multi-step plan from a high-level goal.
    Returns JSON: { understanding, complexity, approach, steps, warnings }
    Steps have a 'type' field: understand | execute | verify | summarize
    """
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
def cortex_execute(req: CortexExecuteRequest):
    """
    Executes a single EXECUTE-type step from CORTEX.
    Runs the patch engine on the step description and returns patch results.
    """
    from ai_engine.patch_engine import identify_target_files, generate_surgical_patches

    # RAG search for relevant context
    rag_context, rag_chunks = build_context(
        query=req.step,
        open_file_content=req.file_content,
        open_filename=req.filename,
        index=index,
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
    session_id = str(uuid.uuid4())
    container  = None
    exec_sock  = None

    try:
        # ── 1. Spin up fresh container ────────────────────────────
        container = docker_client.containers.run(
            image="antimatter-sandbox",
            name=f"antimatter-{session_id[:8]}",
            detach=True,
            tty=True,
            stdin_open=True,
            mem_limit="256m",
            cpu_period=100000,
            cpu_quota=50000,
            dns=["8.8.8.8", "1.1.1.1"],  # explicit DNS — fixes "Could not resolve host" on Windows
            remove=False,
        )
        sandbox_sessions[session_id] = container
        container_id = container.id

        # ── 2. Receive init message with files ────────────────────
        init_msg  = await websocket.receive_text()
        init_data = json.loads(init_msg)
        if init_data.get("type") == "init" and init_data.get("files"):
            await inject_files(container, init_data["files"])

        await websocket.send_text(
            f"\r\n\x1b[32m⚡ Sandbox ready [{session_id[:8]}]\x1b[0m\r\n"
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
        short_id = session_id[:8]
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
            try:
                container.kill()
                container.remove(force=True)
                sandbox_sessions.pop(session_id, None)
                active_containers.pop(short_id, None)   # ← remove FS session
                print(f"[sandbox] cleaned up antimatter-{session_id[:8]}")
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
        "index_chunks": index.stats()["total_chunks"],
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