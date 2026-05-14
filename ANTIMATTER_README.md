# ANTIMATTER — AI-Powered Code Editor

> **README purpose:** This document is written to give any LLM complete context of the ANTIMATTER project — its architecture, file structure, component responsibilities, data flows, API contracts, and design decisions — so no additional explanation is needed to continue development.

---

## 1. Project Identity

**Name:** ANTIMATTER  
**Type:** AI-powered web-based code editor (browser frontend + Python backend)  
**Port:** `1842`  
**Stack:** Vanilla JS + Monaco Editor (frontend) · FastAPI + Groq SDK + Docker (backend) · ChromaDB + SQLite (memory/sandboxes)  
**Auth:** GitHub OAuth + JWT (HttpOnly Cookies)  
**LLM provider:** Groq API (not Anthropic) — models: `llama-3.1-8b-instant`, `deepseek-r1-distill-llama-70b`, `mixtral-8x7b-32768`  
**Developer:** Madhur — Data Scientist transitioning to GenAI/Agentic AI Engineering  
**Goal:** Portfolio-grade project demonstrating RAG pipelines, multi-agent orchestration, and agentic code editing  

---

## 2. Repository Structure

```
antimatter/
│
├── frontend/
│   └── index.html              # Entire frontend — single file, Vanilla JS + Monaco Editor CDN
│
├── backend/
│   └── main.py                 # FastAPI app — all HTTP endpoints
│
├── ai_engine/
│   ├── __init__.py             # Empty, required for Python imports
│   ├── rag.py                  # Codebase indexing + RAG retrieval + context builder
│   ├── agents.py               # Multi-agent pipeline: Planner, Executor, Critic, Memory Manager
│   └── patch_engine.py         # Surgical patch generation + line localization
│
├── memory/
│   ├── chromadb/               # ChromaDB persistent vector store (auto-created)
│   ├── antimatter.db           # SQLite database for agent memory (auto-created)
│   └── sandbox.db              # SQLite database mapping Users to Docker Containers (auto-created)
│
└── .env                        # GROQ_API_KEY, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, JWT_SECRET
```

---

## 3. Frontend Architecture (`frontend/index.html`)

Single HTML file. No build step. No framework. Monaco Editor loaded via CDN AMD loader.

### 3.1 Layout

```
┌─────────────────────────────────────────────────────────────┐
│  TOPBAR: logo · file badge · Index Project · Smart Fix · Clear │
├──────────────┬──────────────────────────┬───────┬───────────┤
│   SIDEBAR    │     MONACO EDITOR        │Resizer│ AI PANEL  │
│  (220px)     │     (flex: 1)            │ (4px) │  (380px)  │
│  file tree   │  tabs · editor · footer  │       │           │
│  upload zone │                          │       │           │
└──────────────┴──────────────────────────┴───────┴───────────┘
```

### 3.2 State Variables

```javascript
const BACKEND = 'http://localhost:1842';
let editor = null;              // Monaco editor instance
let files = {};                 // { filename: content } — all open files in memory
let activeFile = null;          // currently open filename string
let isStreaming = false;        // prevents concurrent requests
let conversationHistory = [];   // [{ role, content }] — last 10 turns for chat context
let currentMode = 'chat';       // 'chat' | 'agent'
let pendingDiffCode = '';       // code staged in diff modal waiting for apply/discard

// Patch system state
let patchState = {
  task: '',
  results: [],    // raw /patch endpoint response
  cards: [],      // [{ fileIdx, patchIdx, status, patch, file }]
};

// Code picker state
let pickerBlocks = [];          // extracted code blocks from executor output
let pickerSelected = -1;        // index of selected block in picker
```

### 3.3 Mode System

Two modes toggled by `.mode-toggle` buttons:

**Chat mode** (`currentMode = 'chat'`):
- Shows `#messages` div
- Hides `#agent-panel`
- `sendMessage()` calls `POST /chat`
- AI response streams into message bubble
- Each AI message gets Apply + Diff buttons if response contains code blocks

**Agent mode** (`currentMode = 'agent'`):
- Hides `#messages` div  
- Shows `#agent-panel` with 4 expandable cards (Planner, Executor, Critic, Memory)
- `sendMessage()` calls `sendAgentTask()` → `POST /agent`
- Streams SSE-tagged events, parsed and routed to agent cards

### 3.4 Key Functions

| Function | Purpose |
|---|---|
| `loadFiles(event)` | FileReader API → populates `files{}` → calls `openFile()` |
| `openFile(name)` | Sets `activeFile`, creates Monaco model, updates tabs/context bar |
| `sendMessage()` | Router: chat mode → `/chat`, agent mode → `sendAgentTask()` |
| `sendAgentTask(text)` | Streams from `/agent`, parses `[TAG]...[/TAG]` events, updates agent cards |
| `indexProject()` | POSTs all `files{}` to `/index-project`, shows chunk count |
| `openSmartFix()` | Opens floating Smart Fix input bar |
| `runSmartFix()` | POSTs to `/patch`, opens patch review modal with animated loading steps |
| `showDiff(newCode)` | Opens diff modal comparing `files[activeFile]` vs `newCode` |
| `applyDiff()` | Applies `pendingDiffCode` to Monaco editor + `files{}` |
| `openCodePicker(text)` | Extracts all code blocks → shows picker if >1 block, skips to diff if 1 |
| `applyAcceptedPatches()` | Applies accepted patches bottom-up per file using `editor.executeEdits()` |
| `applySmartEdit(code)` | Smart apply: detects full-file vs partial, uses Monaco range edit for partial |
| `formatMessage(text)` | Converts markdown (code blocks, bold, inline code) to HTML |
| `extractAllCodeBlocks(text)` | Regex extracts all ` ``` ` blocks with lang + line count + type classification |
| `localize_patch` | (frontend side of patch) — applies resolved patches bottom-up |

### 3.5 Streaming Protocol (Agent Mode)

The `/agent` endpoint streams plain text with custom event tags. Frontend parses these from a rolling `buffer` string:

```
[PLANNER_START]
[PLANNER_RESULT]{...json...}[/PLANNER_RESULT]
[EXECUTOR_START]
[EXECUTOR_CHUNK]...text...[/EXECUTOR_CHUNK]
[EXECUTOR_CHUNK]...text...[/EXECUTOR_CHUNK]
[EXECUTOR_DONE]
[CRITIC_START]
[CRITIC_RESULT]{...json...}[/CRITIC_RESULT]
[MEMORY_SAVED]
[PIPELINE_DONE]
```

`EXECUTOR_CHUNK` tags are consumed and cleared from buffer on each iteration to prevent re-processing. All other tags are checked with `buffer.includes()`.

### 3.6 Modals

Three overlay modals, all `position: fixed; z-index: 1000+`:

| Modal | ID | Trigger | Purpose |
|---|---|---|---|
| Diff viewer | `#diff-modal` | Apply/Diff buttons on AI messages | Side-by-side old vs new |
| Code picker | `#picker-modal` | Executor done with >1 code block | Select which block to apply |
| Patch review | `#patch-modal` | Smart Fix submit | Per-patch GitHub-style accept/reject |
| Smart Fix bar | `#smart-fix-overlay` | ⟐ Smart Fix button | Floating task input |

All modals close on `Escape` key.

---

## 4. Backend Architecture (`backend/main.py`)

FastAPI app. CORS open (`allow_origins=["*"]`). All endpoints return JSON except `/chat` and `/agent` which return `StreamingResponse(media_type="text/plain")`.

### 4.1 Global Instances

```python
client  = Groq(api_key=os.getenv("GROQ_API_KEY"))   # Groq LLM client
index   = CodebaseIndex(persist_dir="./memory/chromadb")  # RAG index
memory  = MemoryManager(db_path="./memory/antimatter.db") # SQLite agent memory
```

### 4.2 Endpoints

| Method | Path | Purpose | Returns |
|---|---|---|---|
| `POST` | `/chat` | RAG-augmented chat with streaming | `StreamingResponse` text |
| `POST` | `/agent` | Full multi-agent pipeline with streaming | `StreamingResponse` tagged events |
| `POST` | `/patch` | Surgical patch generation + line resolution | JSON patch results |
| `POST` | `/index-project` | Index files dict into ChromaDB | `{ files_indexed, chunks_created }` |
| `POST` | `/index-clear` | Wipe ChromaDB collection | `{ status }` |
| `GET` | `/index-stats` | ChromaDB chunk count | `{ total_chunks }` |
| `GET` | `/memory/stats` | SQLite run/decision counts | `{ total_runs, total_decisions }` |
| `GET` | `/memory/runs` | Last 10 agent runs | Array of run objects |
| `GET` | `/memory/file/{filename}` | Decisions for a specific file | Array of decision objects |
| `GET` | `/auth/github/login` | Redirect to GitHub OAuth | Redirects |
| `GET` | `/auth/github/callback` | OAuth exchange, issues JWT | Sets HttpOnly cookie |
| `GET` | `/auth/me` | Validates JWT, returns user info | `{ username, avatar_url }` |
| `POST` | `/auth/logout` | Clears JWT cookie | `{ status }` |
| `WS` | `/terminal` | Docker sandbox connection (Persistent volume per user) | WebSocket stream |
| `GET` | `/health` | Status + index stats + memory stats | JSON |

### 4.3 Request Models

```python
class ChatRequest(BaseModel):
    message: str
    file_content: str = ""
    filename: str = ""
    model: str = "llama-3.1-8b-instant"
    history: Optional[List[HistoryMessage]] = []
    use_rag: bool = True
    cursor_line: int = None          # Monaco cursor line for surgical context

class AgentRequest(BaseModel):
    task: str
    file_content: str = ""
    filename: str = ""
    available_files: List[str] = []
    model: str = "llama-3.1-8b-instant"
    cursor_line: int = None

class PatchRequest(BaseModel):
    task: str
    open_filename: str = ""
    open_file_content: str = ""
    all_files: Dict[str, str] = {}   # all open files { filename: content }
    model: str = "llama-3.1-8b-instant"

class IndexRequest(BaseModel):
    files: dict                       # { filename: content }
```

---

## 5. RAG Engine (`ai_engine/rag.py`)

### 5.1 Chunking Strategy

**Python files** → AST-based chunking via `ast.parse()`. Walks the tree, extracts every `FunctionDef`, `AsyncFunctionDef`, and `ClassDef` node at any nesting level. Each node becomes one chunk. Falls back to line-based if `SyntaxError`.

**All other files** → Sliding window line-based chunks of 60 lines with 10-line overlap.

Each chunk has metadata: `{ filepath, filename, type, name, start_line, end_line }`.

Chunks are upserted into ChromaDB in batches of 50 using MD5 hash of `filepath:start:end` as ID (enables safe re-indexing without duplicates).

### 5.2 Embedding

Uses ChromaDB's `DefaultEmbeddingFunction` (sentence-transformers `all-MiniLM-L6-v2`). Downloads ~90MB on first run. No external API key needed.

### 5.3 Context Builder (`build_context`)

Called before every `/chat` and `/agent` request:

```
1. Include open file (full, up to 60% of token budget)
   → If file > budget: truncate to first 100 lines
2. ChromaDB semantic search (n=6 results)
   → Skip chunks from the already-included open file
   → Add chunks until token budget exhausted
3. Return (context_string, retrieved_chunks)
```

Token counting via `tiktoken` (`cl100k_base` encoding). Max context: 6000 tokens.

### 5.4 Surgical Context Builder (`build_context_surgical`)

Enhanced version that uses cursor line position:

```
1. Extract the specific function/class at cursor_line via AST
2. Inject ONLY that symbol as primary context
3. Include full file as collapsed background reference
4. RAG retrieval for cross-file chunks
```

Returns `(context_string, retrieved_chunks, symbol_metadata)` where `symbol_metadata` includes `{ name, start_line, end_line, type, full_file }`.

---

## 6. Multi-Agent System (`ai_engine/agents.py`)

### 6.1 Architecture

```
User task
    │
    ▼
[Planner Agent]
    │  produces: { understanding, complexity, files_needed,
    │              approach, steps[], warnings[] }
    ▼
[Executor Agent]  ← receives plan + open file + RAG context
    │  produces: streaming markdown with code blocks
    ▼
[Critic Agent]    ← receives task + executor output + original file
    │  produces: { verdict, score/10, issues[], improvements[], summary }
    ▼
[Memory Manager]  ← saves run to SQLite
    │  saves: agent_runs table + code_decisions table
    ▼
[PIPELINE_DONE]
```

### 6.2 Agent Prompts Summary

**Planner:** Outputs pure JSON only. No markdown. Analyzes task + open file (first 80 lines) + available filenames + memory summary from past sessions. Temperature: 0.2.

**Executor:** Receives Planner's steps + open file (up to 6000 chars) + RAG context (up to 3000 chars). Outputs streaming markdown with code. Temperature: 0.25. Instructed to output ONLY the modified symbol (not full file) for small targeted fixes.

**Critic:** Reviews executor output against original file. Outputs pure JSON. Temperature: 0.2. Score 0-10. Verdict: `approved | needs_revision | rejected`.

### 6.3 Memory Manager (SQLite)

Three tables:

```sql
agent_runs (id, task, plan, result, critique, files_involved, model, created_at)
code_decisions (id, filename, decision, context, created_at)
project_patterns (id, pattern_type, description, example, created_at)
```

`get_memory_summary()` returns last 3 runs formatted as string — injected into Planner's context for cross-session awareness.

### 6.4 Streaming Generator

`run_agent_pipeline()` is a Python generator that yields tagged strings. FastAPI wraps it in `StreamingResponse`. The generator runs all three agents sequentially — no async, no parallelism. Each stage yields start/result/done tags so the frontend can update in real time.

---

## 7. Patch Engine (`ai_engine/patch_engine.py`)

### 7.1 Step 1 — File Identification

`identify_target_files(task, rag_chunks, available_files, planner_files)`:

```
1. Extract filenames from RAG chunks (sorted by relevance)
2. If planner_files ∩ rag_files is non-empty → return intersection (high confidence)
3. Else → LLM call with all evidence → returns JSON array of filenames
4. Fallback → return planner_files
```

### 7.2 Step 2 — Patch Generation

`generate_patches(task, filename, file_content, rag_context)`:

Sends strict prompt instructing LLM to output JSON patch object. Critical rule: `original` field must be character-perfect copy from file. Temperature: 0.15 (lowest, for maximum consistency).

Output schema:
```json
{
  "file": "filename.py",
  "patches": [
    {
      "original": "exact text from file",
      "replacement": "new text",
      "explanation": "why"
    }
  ],
  "summary": "overall description"
}
```

If `full_rewrite: true` → single patch with full file content.

### 7.3 Step 3 — Line Localization

`localize_patch(original_text, file_content)` — 4-level fallback chain:

```
Level 1: Exact line match          → fastest, handles perfect copies
Level 2: Stripped exact match      → handles indentation differences
Level 3: Fuzzy sliding window      → threshold 0.65, handles minor rewording
Level 4: First-line anchor search  → finds start line, expands by patch length
```

Returns `(start_line, end_line)` 1-indexed or `None`.

### 7.4 Patch Application (Frontend)

Patches are applied **bottom-up** (sorted by `start_line` descending) to prevent line offset drift when multiple patches modify the same file. Uses Monaco's `editor.executeEdits()` for surgical range replacement — not `editor.setValue()`.

---

## 8. Data Flows

### 8.1 Chat Mode Flow

```
User types message
    → frontend: build { message, file_content, filename, history, use_rag, cursor_line }
    → POST /chat
    → backend: build_context() → ChromaDB search → inject into system prompt
    → Groq streaming API call
    → StreamingResponse → frontend ReadableStream reader
    → characters appended to bubble innerHTML
    → if response contains ``` → show Apply + Diff buttons
```

### 8.2 Agent Mode Flow

```
User types task
    → frontend: build { task, file_content, filename, available_files, model }
    → POST /agent
    → backend: build_context() for RAG
    → run_agent_pipeline() generator starts
    → yields [PLANNER_START] → frontend: card status = running
    → planner_agent() call → yields [PLANNER_RESULT]{json}[/PLANNER_RESULT]
    → frontend: renderPlan(json) → card status = done
    → executor_agent() streaming → yields [EXECUTOR_CHUNK]token[/EXECUTOR_CHUNK] per token
    → frontend: appends to exec-output div
    → [EXECUTOR_DONE] → frontend: show code block picker or Apply+Diff buttons
    → critic_agent() call → [CRITIC_RESULT]{json}[/CRITIC_RESULT]
    → frontend: renderCritique(json) → score bar + issues
    → memory.save_run() → [MEMORY_SAVED] → [PIPELINE_DONE]
```

### 8.3 Smart Fix Flow

```
User clicks ⟐ Smart Fix → types task → submits
    → openPatchModal(task) → animated loading steps
    → POST /patch with { task, open_filename, open_file_content, all_files }
    → backend:
        1. build_context() → rag_chunks
        2. identify_target_files() → target_files[]
        3. generate_surgical_patches() per file:
           a. generate_patches() → LLM JSON patch
           b. resolve_patches() → localize each patch → attach line numbers
        4. return { success, target_files, results[] }
    → frontend: renderPatchReview(data)
        → per patch: buildPatchDiff() → side-by-side HTML diff
        → Accept/Reject buttons per card
    → user accepts/rejects
    → applyAcceptedPatches():
        → group by file
        → sort patches bottom-up per file
        → splice lines array
        → editor.setValue() for active file
```

---

## 9. Known Issues & Design Decisions

### 9.1 Full File vs Surgical Output

**Problem:** LLM mirrors context — if given full file, outputs full file.  
**Current state:** Partially addressed via executor prompt instructing symbol-only output for small fixes.  
**Proper fix:** `build_context_surgical()` + cursor_line injection + `applySmartEdit()` for Monaco range edits. Infrastructure exists, needs wiring end-to-end.

### 9.2 Patch Localization Failures ("location unknown")

**Problem:** LLM paraphrases `original` text instead of copying verbatim.  
**Fixes applied:** 4-level fallback chain in `localize_patch()`. Stricter prompt language. Fuzzy threshold lowered to 0.65.  
**Remaining failure rate:** ~5% on complex multiline originals with deepseek-r1.  
**Workaround:** `manualSearch()` opens Monaco find widget with first line of failed patch.

### 9.3 Agent Panel Apply/Diff Buttons

**Problem:** Buttons were missing or inconsistent in agent mode vs chat mode.  
**Fix applied:** Code block picker modal (`#picker-modal`) with `extractAllCodeBlocks()`. Single block → skip to diff. Multiple blocks → picker with language/line/type metadata cards.

### 9.4 ChromaDB First Run

Downloads sentence-transformers model (~90MB) on first `index_files()` call. Subsequent runs use cached model. No API key needed.

### 9.5 Line Offset Drift

When applying multiple patches to one file, higher-line patches shift lower-line patches. Fixed by always applying patches sorted by `start_line` descending (bottom-up).

---

## 10. Quick Start

```bash
# 1. Clone and setup
cd antimatter
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Mac/Linux

# 2. Install dependencies
pip install fastapi "uvicorn[standard]" groq chromadb python-dotenv websockets tiktoken sentence-transformers

# 3. Add API key
echo "GROQ_API_KEY=your_key_here" > .env

# 4. Create required empty file
echo "" > ai_engine/__init__.py

# 5. Run backend
uvicorn backend.main:app --reload --port 1842

# 6. Open frontend
# Double-click frontend/index.html in file explorer (Chrome/Edge)
```

---

## 11. Environment & Dependencies

| Package | Purpose |
|---|---|
| `fastapi` | HTTP framework |
| `uvicorn[standard]` | ASGI server |
| `groq` | LLM API client |
| `chromadb` | Vector database for RAG |
| `sentence-transformers` | ChromaDB default embeddings |
| `python-dotenv` | `.env` file loading |
| `tiktoken` | Token counting for context management |
| `websockets` | WebSocket support for sandbox terminal |
| `docker` | Docker SDK for Python (Sandbox orchestration) |
| `PyJWT` | JWT token generation and validation |
| `httpx` | Async HTTP client (OAuth token exchange) |
| `difflib` | Built-in — fuzzy patch localization |
| `ast` | Built-in — Python AST chunking |
| `sqlite3` | Built-in — agent memory persistence and sandbox user mapping |

**Frontend CDN dependencies** (no npm, no build):
- Monaco Editor `0.44.0` via `cdnjs.cloudflare.com`
- RequireJS `2.3.6` via `cdnjs.cloudflare.com`
- Google Fonts: JetBrains Mono + DM Sans

---

## 12. Feature Roadmap (not yet built)

- **LSP integration** — Pyright/ESLint → exact error locations → feed to patch engine
- **Selection-based editing** — user selects lines in Monaco → AI edits only selection
- **Multi-selection patches** — Ctrl+click multiple ranges → independent patch per range
- **Inline comment intent markers** — `# ANTIMATTER: change this` → auto-detected and patched
- **Git integration** — show real git diff, commit accepted patches directly
- **Project-wide refactor** — rename symbol across all files using AST + patch engine
- **Test generation pipeline** — dedicated agent that writes + runs tests via Docker

---

## 13. Design Philosophy

ANTIMATTER is intentionally built as a **learning + portfolio project** that demonstrates:

1. **RAG over codebases** — not just documents. AST-aware chunking makes retrieval structurally meaningful.
2. **Multi-agent orchestration** — Planner/Executor/Critic pattern with visible reasoning, not a black box.
3. **Persistent agent memory** — cross-session SQLite storage means the editor learns your codebase over time.
4. **Surgical code editing** — moving away from full-file replacement toward line-precise patches.
5. **Streaming-first UX** — every long operation streams in real time. No loading spinners on blank screens.

The stack is deliberately simple (no React, no TypeScript, no Docker required for core features) so the AI architecture is the complexity, not the infrastructure.
