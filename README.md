<div align="center">

# ⚡ AntiMatter

### An AI-native code editor built around an agentic loop — not a chat box

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.2-FF6B35?style=flat-square)](https://github.com/langchain-ai/langgraph)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+pgvector-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-required-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docker.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

</div>

---

AntiMatter is a self-hosted, web-based code editor where the AI agent can **read, write, search, and execute code** in an isolated Docker sandbox — and every proposed file change requires your approval before it lands on disk.

The agent runs as a proper [LangGraph](https://github.com/langchain-ai/langgraph) ReAct loop with 14 real tools, backed by a hybrid RAG pipeline (semantic search + BM25 + Reciprocal Rank Fusion) over your entire codebase. It supports Groq, Anthropic, OpenAI, Gemini, and OpenRouter from a single provider abstraction layer.

---

## Table of Contents

- [Why AntiMatter](#why-antimatter)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Docker Setup](#docker-setup)
- [Environment Variables](#environment-variables)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [License](#license)

---

## Why AntiMatter

Most AI coding tools are glorified autocomplete — they suggest text in a single context window and stop there. AntiMatter takes a different approach:

- **The agent acts, it doesn't just suggest.** It calls tools in a loop: read files, run commands, search the codebase, install packages, run tests — until the task is done.
- **Nothing touches disk without your approval.** File writes are proposed as diffs via WebSocket. You accept or reject each one.
- **Context is codebase-aware, not file-aware.** A hybrid retriever combines semantic vector search with BM25 keyword search, fused via Reciprocal Rank Fusion, so the agent finds relevant code even when it doesn't know the exact filename.
- **Your sandbox is isolated.** Every user gets a dedicated Docker container for code execution. The host filesystem is never touched.

---

## Features

### 🤖 Agentic Loop
- **LangGraph StateGraph** with `agent → tools → agent` cycle, terminating when the model stops calling tools
- **14 built-in tools**: `read_file`, `write_file`, `list_files`, `replace_file_content`, `multi_replace_file_content`, `run_command`, `search_files`, `install_packages`, `run_tests`, `search_web`, `generate_image`, `run_background_command`, `command_status`, `send_command_input`
- **Human-in-the-loop diff approval**: `write_file` and edit tools emit a `file.patch` event and wait — the agent never writes without your confirmation

### 🔍 Hybrid RAG Pipeline
- **Tree-sitter chunking** for Python, JavaScript, TypeScript, and TSX — extracts functions and classes as semantic units rather than fixed line windows
- **VoyageAI embeddings** stored in PostgreSQL with the `pgvector` extension
- **BM25 keyword search** alongside semantic search for exact identifier matching
- **Reciprocal Rank Fusion (RRF)** to merge both result lists into a single ranked context
- **File watcher** auto-reindexes changed files in the background

### 🧠 Episodic Memory (Agent Memory)
- **Worthiness Filter**: Traces of runs containing non-obvious design decisions, multi-attempt bug fixes, or user corrections are automatically judged by an LLM to decide if they warrant a permanent lesson.
- **VoyageAI Embeddings**: Lessons are embedded using `voyage-3` (prose-optimized) and stored in PostgreSQL with `pgvector` for similarity search.
- **Dynamic Context Injection**: Subsequent runs retrieve relevant memories based on the task description and inject them into the system prompt as `## Relevant Past Experience` to prevent repeating mistakes.

### 📊 Agent Observability & Activity Tracing
- **Real-Time Execution Dropdown**: Tool calls are streamed over WebSockets and rendered in an interactive **Agent Activity** panel in the UI, showing inputs, outputs, status (running, done, error), and millisecond-level duration.
- **LangSmith Tracing**: Runs are configured with descriptive run names (`antimatter/provider/model`), tags, and rich metadata (project, conversation, open files, message preview) for advanced observability when `LANGCHAIN_TRACING_V2=true` is set.

### 🎨 Mermaid Diagram Generation & Validation
- **Visualizer Node**: Prompts requesting diagram generation, flowcharts, or system schemas automatically trigger a dedicated diagram generation node in the LangGraph loop.
- **In-Sandbox Validation**: Generated Mermaid code is validated in the user's isolated Docker sandbox using a bundled NodeJS parser (`validate_mermaid.js`).
- **Auto-Correction Loop**: If validation fails, syntax errors are fed back to the diagram generator node to automatically fix and re-validate (up to 3 retries) before final frontend rendering.

### 🏗 Multi-LLM Support
- Unified provider interface: **Groq**, **Anthropic (Claude)**, **OpenAI**, **Google Gemini**, **OpenRouter**
- Switchable at runtime per conversation — no restart required
- Streaming-first: tokens arrive via WebSocket as they are generated

### 🖥 Editor
- **Monaco Editor** (the engine behind VS Code) with syntax highlighting, IntelliSense, and multi-tab support
- **Inline Chat** (Cmd+K / Ctrl+K) — select code, ask a question, get an inline diff
- **Git panel** — stage, commit, view diffs, manage branches from the UI
- **Integrated terminal** — connected directly to your project's Docker sandbox, featuring a **Direct Log Redirection** action to automatically grab and animate logs directly into the AI chat input
- **LSP support** — real diagnostics from `pylsp` wired into Monaco.

### 🔐 Auth & Projects
- **GitHub OAuth** login with JWT (HttpOnly cookies, refresh token rotation)
- Per-project workspaces with isolated sandboxes and independent RAG indexes
- Conversation history persisted to PostgreSQL with full tool call round-trips

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (React + Monaco)                  │
│                                                                   │
│  FileTree · CodeEditor · ChatPanel · Terminal · GitPanel         │
│       │                    │ WebSocket                           │
│       │                    ▼                                     │
│       │             WS /api/agent/{project_id}                    │
│       │                    │                                     │
│       │                    │ Streams: token · tool_start/end ·   │
│       │                    │          file.patch                 │
└───────┼────────────────────┼─────────────────────────────────────┘
        │ REST                │
        ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        FastAPI Backend                           │
│                                                                   │
│  /api/auth   /api/projects   /api/files   /api/git   /api/lsp   │
│  /api/projects/{project_id}/memories                            │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Agent Runner                           │   │
│  │                                                           │   │
│  │  1. Retrieve relevant memories (retrieve_memories)       │   │
│  │  2. Build enriched context (RAG + memories)               │   │
│  │  3. Execute LangGraph StateGraph (streams events)        │   │
│  │  4. Post-task: worthiness check & write episodic memory  │   │
│  │     (check_and_write_memory, background task)             │   │
│  │                                                           │   │
│  │  ┌─────────────────────────────────────────────────────┐  │   │
│  │  │               LangGraph StateGraph                  │  │   │
│  │  │                                                     │  │   │
│  │  │                 ┌───────────────┐                   │  │   │
│  │  │                 │  agent_node   │                   │  │   │
│  │  │                 └───────┬───────┘                   │  │   │
│  │  │               ┌─────────┴─────────┐                 │  │   │
│  │  │         tools?│          diagram? │                 │  │   │
│  │  │               ▼                   ▼                 │  │   │
│  │  │         ┌───────────┐   ┌──────────────────┐        │  │   │
│  │  │         │ ToolNode  │   │diagram_generator │        │  │   │
│  │  │         └─────┬─────┘   └─────────┬────────┘        │  │   │
│  │  │               │                   ▼                 │  │   │
│  │  │               │         ┌──────────────────┐        │  │   │
│  │  │               │         │diagram_validator │        │  │   │
│  │  │               │         └─────────┬────────┘        │  │   │
│  │  │               │          errors?  │                 │  │   │
│  │  │               │          & rt < 3 │ (no errors)     │  │   │
│  │  │               │             ▼     ▼                 │  │   │
│  │  │               └─────────────┴─────► END             │  │   │
│  │  └─────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────┐   ┌──────────────────┐   ┌─────────────┐  │
│  │   RAG & Memory  │   │   Sandbox Mgr    │   │  LSP Server │  │
│  │                 │   │                  │   │             │  │
│  │ Tree-sitter AST │   │  Docker per-user │   │  pylsp      │  │
│  │ VoyageAI embed  │   │  exec_run()      │   │  WebSocket  │  │
│  │ pgvector store  │   │  run_background()│   │  bridge     │  │
│  │ BM25 + RRF      │   │  validate_mermaid│   │             │  │
│  └─────────────────┘   └──────────────────┘   └─────────────┘  │
└─────────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
  PostgreSQL+pgvector      Redis              Docker Engine
 (embeddings, memories)  (sessions)          (sandboxes)
```

### Key Design Decisions

| Decision | Rationale |
|---|---|
| LangGraph over raw function loops | Explicit state machine — easy to add nodes (diagram generator, critic) without rewriting control flow |
| Tree-sitter over regex/AST chunking | Language-agnostic, handles partial parses, correct for JS/TS/JSX |
| pgvector over a hosted vector DB | One less external service; PostgreSQL already handles auth data, chat history, and episodic memories |
| RRF fusion over weighted sums | Rank-based — avoids score normalization problems across two different similarity metrics |
| Diff proposal over direct writes | The agent optimizing for task completion ≠ the user wanting every file changed |
| Per-user Docker containers | Prevents cross-user command execution; natural resource limits via Docker |
| Episodic Memory over static context | Filters/stores lessons from worthy runs (gotchas, multi-attempt errors) and retrieves them via pgvector cosine distance, avoiding model repetition of the same mistakes |
| In-sandbox Mermaid Validation | Sandbox executes NPM-bundled `validate_mermaid.js` under standard NodeJS to check syntax. Real-time feedback feeds back to LLM for auto-correction before rendering |

---

## Quick Start

The fastest path to a running instance using Docker Compose:

```bash
# 1. Clone the repository
git clone https://github.com/madhurchouhan01/antimatter.git
cd antimatter

# 2. Copy and fill in environment variables
cp .env.example .env
# At minimum, set: GROQ_API_KEY and SECRET_KEY (see Environment Variables below)

# 3. Build the sandbox image (required for code execution)
docker build -f backend/sandbox/Dockerfile.sandbox -t antimatter-sandbox:latest .

# 4. Start all services
docker compose up --build

# 5. Run database migrations
docker compose exec api alembic upgrade head

# 6. Open the editor
# Frontend dev server: http://localhost:5173
# API:                 http://localhost:1842
# API docs:            http://localhost:1842/docs
```

> **First login**: Click "Sign in with GitHub" — you'll need a GitHub OAuth App configured (see [Environment Variables](#environment-variables)).

---

## Installation

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Python | 3.11+ | Backend runtime |
| Node.js | 18+ | Frontend dev server |
| Docker | 24+ | Sandbox execution + Compose |
| PostgreSQL | 16 with pgvector | Included in Compose |
| Redis | 7 | Included in Compose |

### Manual Setup (without Docker Compose)

**Backend:**

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp ../.env.example ../.env
# Edit .env with your values

# Apply database migrations
alembic upgrade head

# Start the API server
uvicorn main:app --host 0.0.0.0 --port 1842 --reload
```

**Frontend:**

```bash
cd frontend

# Install Node dependencies
npm install

# Start the Vite dev server
npm run dev
# Runs on http://localhost:5173
```

**Sandbox image** (required for the agent's `run_command` and terminal tools):

```bash
docker build -f backend/sandbox/Dockerfile.sandbox -t antimatter-sandbox:latest .
```

---

## Docker Setup

The `docker-compose.yml` spins up four services:

| Service | Port | Description |
|---|---|---|
| `api` | `1842` | FastAPI backend, hot-reloads from `./backend` |
| `postgres` | `5432` | PostgreSQL 16 with pgvector extension |
| `redis` | `6379` | Session cache |
| *(sandbox)* | dynamic | Per-user containers spawned by the API at runtime |

```bash
# Start all services
docker compose up

# Start detached
docker compose up -d

# View logs for the API
docker compose logs -f api

# Apply migrations after first start
docker compose exec api alembic upgrade head

# Stop and remove containers
docker compose down

# Full teardown including volumes (deletes all data)
docker compose down -v
```

> **Docker socket**: The API container mounts `/var/run/docker.sock` so it can spawn per-user sandbox containers. On Linux, you may need to add your user to the `docker` group. On Docker Desktop (Mac/Windows), this works out of the box.

---

## Environment Variables

Copy `.env.example` to `.env` and set the following:

### Required

| Variable | Example | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://aicoder:aicoder@postgres:5432/aicoder` | PostgreSQL connection string (asyncpg driver) |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string |
| `SECRET_KEY` | `openssl rand -hex 32` | JWT signing key — generate a random 32-byte hex string |
| `GROQ_API_KEY` | `gsk_...` | Groq API key — get one at [console.groq.com](https://console.groq.com) |
| `GITHUB_CLIENT_ID` | `Iv1.abc123` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | `abc123...` | GitHub OAuth App client secret |
| `WORKSPACE_ROOT` | `/workspaces` | Host path where project files are stored |

### Optional — Additional LLM Providers

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Enables Claude models (claude-sonnet-4-5, etc.) |
| `OPENAI_API_KEY` | Enables GPT-4o and other OpenAI models |
| `GEMINI_API_KEY` | Enables Gemini 1.5 Pro / Flash |
| `OPENROUTER_API_KEY` | Enables any model via OpenRouter |
| `VOYAGE_API_KEY` | VoyageAI embeddings (highly recommended; required for Voyage-based Episodic Memory, fallback to local sentence-transformers if unset) |

### Optional — Observability

| Variable | Default | Description |
|---|---|---|
| `LANGCHAIN_TRACING_V2` | `false` | Enable LangSmith tracing |
| `LANGCHAIN_API_KEY` | — | LangSmith API key |
| `LANGCHAIN_PROJECT` | `ai-code-editor` | LangSmith project name |
| `ENVIRONMENT` | `development` | `development` or `production` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1500` | JWT access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30` | JWT refresh token lifetime |

### Setting up GitHub OAuth

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
2. Set **Authorization callback URL** to `http://localhost:1842/api/auth/github/callback`
3. Copy the **Client ID** and generate a **Client Secret**
4. Add both to your `.env`

---

## Usage

### Starting a Session

1. Open `http://localhost:5173` and sign in with GitHub
2. Create a new project or open an existing one
3. Upload files via the file tree or clone a repo through the terminal
4. The project is automatically indexed for RAG on first open

### Chatting with the Agent

Type a task in the chat panel. The agent will:
1. Retrieve and inject relevant **Episodic Memories** (past lessons) if any match the task description.
2. Build code context from your codebase using **Hybrid RAG** (semantic search + BM25).
3. Enter the agentic loop — reasoning, calling tools, and observing results.
4. Stream tokens, live tool actions (rendered in the collapsible **Agent Activity** dropdown showing status and durations), and validated **Mermaid diagrams** back to you.
5. Propose any file changes as diffs — you approve or reject each one.

**Example tasks:**
```
"Add input validation to the create_user endpoint"
"Write pytest tests for the FileService class"
"Refactor the chunker to support Go files using tree-sitter"
"Find everywhere we use raw SQL strings and replace with SQLAlchemy"
"Install httpx and add a retry wrapper around the external API call"
```

### Inline Chat (Cmd+K)

Select lines in the editor → press `Ctrl+K` (or `Cmd+K` on macOS) → type your instruction. The agent receives the selected code as explicit context and proposes a targeted diff.

### Switching Models

Click the settings icon in the chat panel. Select a provider and model. The change applies to the next message — no reload needed.

Currently supported models include:
- **Groq**: `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `mixtral-8x7b-32768`
- **Anthropic**: `claude-sonnet-4-5`, `claude-3-haiku`
- **OpenAI**: `gpt-4o`, `gpt-4o-mini`
- **Gemini**: `gemini-1.5-pro`, `gemini-1.5-flash`
- **OpenRouter**: any model string the API accepts

### Terminal

The terminal tab connects directly to your project's Docker sandbox. Run commands, start dev servers, inspect output — all isolated from the host.

#### 📤 Direct Log Redirection
Next to the terminal fullscreen button is a redirect action button. Clicking it grabs the active terminal's entire scrollback buffer, wraps it in a code block, and triggers a premium floating animation that flies the logs directly into the AI chat input, completing with a satisfying pulse transition. This eliminates copy-paste friction when sharing command output, stack traces, or build logs with the agent.

```bash
# Inside the sandbox terminal
python manage.py runserver
npm run dev
pytest tests/ -v
```

---

## API Reference

The FastAPI server exposes interactive docs at `http://localhost:1842/docs`.

### Authentication

All endpoints except `/health` and `/api/auth/*` require a valid JWT cookie set by the GitHub OAuth flow.

### Core Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns `{"status": "ok"}` |
| `GET` | `/api/auth/github/login` | Redirects to GitHub OAuth |
| `GET` | `/api/auth/github/callback` | Handles OAuth callback, sets cookie |
| `GET` | `/api/auth/me` | Returns current user info |
| `POST` | `/api/auth/logout` | Clears the session cookie |
| `GET` | `/api/projects` | List all projects for current user |
| `POST` | `/api/projects` | Create a new project |
| `DELETE` | `/api/projects/{project_id}` | Delete a project |
| `GET` | `/api/files/{project_id}` | List files in a project |
| `GET` | `/api/files/{project_id}/content` | Read file content |
| `PUT` | `/api/files/{project_id}/content` | Write file content |
| `GET` | `/api/git/{project_id}/status` | Git status for project |
| `POST` | `/api/git/{project_id}/commit` | Stage and commit changes |
| `GET` | `/api/git/{project_id}/log` | Git log |
| `GET` | `/api/projects/{project_id}/memories` | List episodic memories for project (paginated) |
| `GET` | `/api/projects/{project_id}/memories/{memory_id}` | Get a single episodic memory by ID |
| `DELETE` | `/api/projects/{project_id}/memories/{memory_id}` | Hard-delete a single episodic memory |

### Agent WebSocket

```
WS /api/agent/{project_id}
```

Send a JSON message:
```json
{
  "message": "Add error handling to the payment endpoint",
  "conversation_id": "uuid-or-null",
  "open_files": ["backend/payments/views.py"],
  "model_name": "llama-3.3-70b-versatile",
  "provider": "groq"
}
```

Receive a stream of JSON events:

| Event type | Payload | Description |
|---|---|---|
| `token` | `{"content": "..."}` | LLM text token |
| `tool_start` | `{"tool": "read_file", "input": {...}}` | Agent called a tool |
| `tool_end` | `{"tool": "read_file", "output": "..."}` | Tool returned |
| `file.patch` | `{"path": "...", "original": "...", "modified": "..."}` | Proposed file change |
| `error` | `{"error_type": "rate_limit", "message": "..."}` | Error during execution |
| `done` | `{"conversation_id": "uuid"}` | Run complete |

---

## Project Structure

```
antimatter/
├── backend/
│   ├── agent/
│   │   ├── graph.py          # LangGraph StateGraph definition
│   │   ├── runner.py         # Streaming agent runner + conversation persistence
│   │   ├── tools.py          # All 14 agent tools
│   │   ├── llm.py            # Multi-provider LLM factory
│   │   ├── context_builder.py # RAG context injection
│   │   ├── memory.py         # Episodic memory logic (check, write, retrieve)
│   │   └── assets/
│   │       └── validate_mermaid.js # Headless Mermaid syntax validator bundle
│   ├── context/
│   │   ├── chunker.py        # Tree-sitter chunking (Python/JS/TS/TSX)
│   │   ├── embedder.py       # VoyageAI embedding client
│   │   ├── indexer.py        # File → chunks → pgvector pipeline
│   │   ├── retriever.py      # Hybrid search + RRF fusion
│   │   ├── vector_store.py   # pgvector read/write interface
│   │   └── watcher.py        # File system watcher for auto-reindex
│   ├── sandbox/
│   │   ├── manager.py        # Docker container lifecycle per user
│   │   ├── background.py     # Background process management
│   │   └── Dockerfile.sandbox # Sandbox container image
│   ├── api/routes/
│   │   ├── agent.py          # WebSocket agent endpoint
│   │   ├── auth.py           # GitHub OAuth + JWT
│   │   ├── files.py          # File CRUD
│   │   ├── projects.py       # Project management
│   │   ├── git.py            # Git operations
│   │   ├── terminal.py       # Terminal WebSocket → sandbox
│   │   ├── lsp.py            # LSP WebSocket bridge
│   │   └── memories.py       # Episodic memory REST API
│   ├── db/                   # SQLAlchemy models + async session
│   ├── core/                 # Config, logging, tracing
│   ├── lsp/                  # pylsp process management
│   ├── git_backend/          # GitPython wrappers
│   ├── alembic/              # Database migrations
│   ├── main.py               # FastAPI app + lifespan
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── CodeEditor.jsx      # Monaco editor integration
│       │   ├── ChatPanel.jsx       # Agent chat + streaming UI
│       │   ├── FileTree.jsx        # Project file browser
│       │   ├── Terminal.jsx        # xterm.js terminal
│       │   ├── GitPanel.jsx        # Git UI
│       │   ├── DiffViewer.jsx      # File diff approval UI
│       │   ├── InlineChatWidget.jsx # Cmd+K inline chat
│       │   ├── SettingsModal.jsx   # Model/provider selector
│       │   └── ActivityDropdown.jsx # Interactive agent activity panel
│       ├── stores/                 # Zustand state management (e.g. agentTraceStore.js)
│       ├── services/               # API + WebSocket clients
│       └── hooks/                  # Shared React hooks
├── docker-compose.yml
├── .env.example
└── Makefile
```

---

## Roadmap

- [ ] **Multi-agent pipeline** — separate Planner, Executor, and Critic nodes in LangGraph with visible reasoning at each step
- [x] **Agent observability UI** — live panel showing every tool call, input, output, and latency for the current run (implemented via WebSocket streaming + `ActivityDropdown` UI)
- [ ] **Evaluation framework** — run the agent against a task suite and track pass@1 over time
- [x] **Agent memory** — store summaries of completed tasks in the vector store; retrieve relevant experiences on new tasks (implemented via `agent_memories` pgvector database table + VoyageAI embeddings)
- [ ] **Selection-based editing** — select any range in Monaco → agent edits only that selection
- [ ] **Project-wide symbol rename** — rename a symbol across all files using Tree-sitter + the patch system
- [ ] **Test generation agent** — dedicated node that writes pytest tests and verifies they pass via the sandbox
- [ ] **Inline comment triggers** — `# ANTIMATTER: refactor this` comments detected and auto-patched on save
- [ ] **Multi-selection patches** — Ctrl+click multiple ranges → one patch per selected region
- [ ] **Token usage dashboard** — per-conversation and per-project cost tracking

---

## Contributing

Contributions are welcome. Please read the following before opening a PR.

### Setup for Development

```bash
git clone https://github.com/madhurchouhan01/antimatter.git
cd antimatter
cp .env.example .env
# Fill in at minimum: DATABASE_URL, REDIS_URL, SECRET_KEY, GROQ_API_KEY

docker compose up -d postgres redis
cd backend && pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload --port 1842

# In a separate terminal
cd frontend && npm install && npm run dev
```

### Linting and Type Checking

```bash
# Backend
cd backend
ruff check .
mypy .

# Frontend
cd frontend
npm run lint
```

### Running Tests

```bash
cd backend
pytest tests/ -v
```

### Pull Request Guidelines

1. **One concern per PR** — keep scope narrow. A PR that fixes a bug and adds a feature is hard to review.
2. **Tests for new tools** — if you add an agent tool, add a test in `backend/tests/` that mocks the sandbox and verifies the output format.
3. **No direct disk writes in tools** — new tools that modify files must go through the `emit_fn` diff proposal path.
4. **Update `requirements.txt`** if you add a new Python dependency. Pin the major+minor version.
5. **Open an issue first** for large changes (new LangGraph nodes, new auth providers, schema changes) so the approach can be discussed before implementation.

### Where to Start

Good first issues are labeled [`good first issue`](https://github.com/madhurchouhan01/antimatter/issues?q=label%3A%22good+first+issue%22) on GitHub. The roadmap items above are all unimplemented — pick one that interests you and open an issue before starting.

---

## Troubleshooting

### `alembic upgrade head` fails with "relation does not exist"

The pgvector extension is not installed. Connect to the database and run:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```
Then retry the migration.

### Agent tool calls return "ERROR: Container not found"

The sandbox image is not built. Run:
```bash
docker build -f backend/sandbox/Dockerfile.sandbox -t antimatter-sandbox:latest .
```

### WebSocket disconnects immediately on `/api/agent`

Usually a CORS or authentication issue. Check that:
- The frontend is running on `http://localhost:5173` or `5174` (the only origins allowed in dev)
- The `SECRET_KEY` in `.env` hasn't changed since you last logged in (it invalidates existing JWTs)

### `pgvector` import error in Python

```bash
pip install pgvector==0.3.5
```
Also ensure the PostgreSQL server has the extension: `CREATE EXTENSION vector;`

### VoyageAI embedding errors / "VOYAGE_API_KEY not set"

Leave `VOYAGE_API_KEY` blank in `.env` to fall back to a local sentence-transformers model. This is slower and requires ~90 MB download on first run but has no API cost.

### Groq rate limits during long agent runs

The agent handles `429` responses and surfaces them to the frontend. Switch to a different model in the settings panel, or use a provider with higher limits (OpenRouter, Anthropic).

### Monaco editor not loading (blank editor pane)

Clear browser cache and hard-reload. Monaco loads from a CDN; a stale service worker can block it.

---

## FAQ

**Can I use this without Docker?**  
The core chat and RAG features work without Docker. The agent's `run_command`, `run_tests`, `install_packages`, and terminal tools require Docker to spawn the per-user sandbox. If Docker is unavailable, those tools will return errors but the rest of the agent still functions.

**Is my code sent to external APIs?**  
Code context is sent to whichever LLM provider you configure (Groq, Anthropic, OpenAI, etc.). Embeddings are sent to VoyageAI if you set an API key; otherwise embedding runs locally via sentence-transformers. No data is sent to the AntiMatter project itself.

**Can multiple users share one instance?**  
Yes. Each GitHub account gets its own projects, workspaces, Docker sandbox, and conversation history. The PostgreSQL schema is multi-tenant.

**How large a codebase can it index?**  
Indexing is bounded by your `pgvector` storage and embedding API rate limits. In practice, repositories up to ~50k lines index in under two minutes. Very large monorepos (500k+ lines) should use selective indexing (exclude `node_modules`, build artifacts, etc.).

**Which model is best for coding tasks?**  
`llama-3.3-70b-versatile` on Groq gives the best latency for most tasks. `claude-sonnet-4-5` (Anthropic) handles complex multi-file refactors more reliably. `gpt-4o` is a strong middle ground. Adjust via the settings panel per task.

**How do I add a new agent tool?**  
Add a new `@tool`-decorated async function inside the `make_tools()` factory in [`backend/agent/tools.py`](backend/agent/tools.py) and append it to the return list at the bottom of the function. The LangGraph ToolNode picks it up automatically on the next session.

---

## License

MIT License. See [LICENSE](LICENSE) for the full text.

---

<div align="center">

Built by [Madhur Chouhan](https://github.com/madhurchouhan01)

</div>
