# ANTIMATTER
---

## 1. Project Identity

**Name:** ANTIMATTER  
**Type:** AI-powered web-based code editor (browser frontend + Python backend)  
**Port:** `1842`  
**Stack:** Vanilla JS + Monaco Editor (frontend) · FastAPI + Groq SDK + Docker (backend) · ChromaDB + SQLite (memory/sandboxes)  
**Auth:** GitHub OAuth + JWT (HttpOnly Cookies)  
**LLM provider:** Groq API (not Anthropic) — models: `llama-3.1-8b-instant`, `deepseek-r1-distill-llama-70b` 
**Developer:** Madhur — Data Scientist transitioning to GenAI/Agentic AI Engineering  
**Goal:** Portfolio-grade project demonstrating RAG pipelines, multi-agent orchestration, and agentic code editing  

---

## Why ANTIMATTER

Traditional editors and copilots often stop at single-file completion, struggle with repo-scale context, and offer limited review workflows. ANTIMATTER brings agent-driven planning, RAG-based reasoning, and developer-controlled patch review into a lightweight local editor.

Target users:

- AI engineers exploring agentic workflows
- developers who want repo-aware code editing
- teams prototyping autonomous dev tools
- researchers validating multi-agent code pipelines

## Key Features

### Agent Capabilities

- Repository understanding through codebase retrieval
- Multi-file editing with planned patch proposals
- Task planning, execution, and critic review
- Memory persistence for cross-session agent context
- Tool calling for terminal, git, and search
- Context compression via semantic chunking

### Development Tools

- Browser-accessible terminal / sandbox support
- Git-aware workflows and patch generation
- FastAPI backend with streaming agent responses
- Local RAG index using ChromaDB
- Monaco Editor frontend for code review and diffs

### User Experience

- Natural language task prompts
- Agent and chat workflows in one UI
- Review-first patch approval
- Session history and execution trace

## Architecture Overview

```text
User
  └─> Browser UI
        └─> Agent Router
              ├─> Planner
              ├─> Tool Router
              │     ├─> File System
              │     ├─> Terminal / Sandbox
              │     ├─> Git
              │     └─> Search / RAG Index
              └─> LLM Provider
```

- **User**: developer interacting with the frontend.
- **Browser UI**: Monaco-based editor, chat, and agent panel.
- **Agent Router**: decides between chat and agent execution.
- **Planner**: decomposes tasks into actionable steps.
- **Tool Router**: routes file, terminal, git, and search actions.
- **File System**: maintains workspace state and open file content.
- **Terminal**: sandboxed command execution channel.
- **Git**: repository-aware change management.
- **LLM Provider**: external model service for reasoning.
- **Search**: RAG index for relevant code retrieval.

## Installation

### Prerequisites

- Python 3.11+
- Node.js 18+ / npm
- Git
- Docker (optional for sandbox terminal)

### Clone repository

```bash
git clone https://github.com/<your-org>/AntiMatter.git
cd AntiMatter
```

### Backend dependencies

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
```

### Frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### Environment setup

Create a `.env` file in the repository root:

```env
GROQ_API_KEY=your_groq_api_key
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
JWT_SECRET=your_jwt_secret
```

### Run locally

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 1842
```

Open `frontend/index.html` in a browser or serve it with a static file server.

## Quick Start

1. Start the backend server:

```bash
cd backend
.venv\Scripts\activate
uvicorn main:app --reload --host 0.0.0.0 --port 1842
```

2. Open `frontend/index.html`.
3. Load your files or workspace.
4. Ask the agent for code work, for example:

```text
Fix the failing unit test for `calculate_discount`.
Refactor the payment flow into a reusable helper.
Generate regression tests for `order_summary`.
```

5. Review proposed patches and apply them when ready.

## Configuration

### Environment variables

- `GROQ_API_KEY`: Groq provider key.
- `GITHUB_CLIENT_ID`: GitHub OAuth app client ID.
- `GITHUB_CLIENT_SECRET`: GitHub OAuth secret.
- `JWT_SECRET`: JWT signing key.
- `BACKEND_URL` (optional): backend base URL.

### Model selection

Configure model choice in backend request payloads or provider settings.

### Provider setup

The repository is configured for Groq. To switch to another provider, update backend model integration.

### Tool configuration

- `backend/main.py`: API routes and execution router.
- `frontend/index.html`: UI, streaming, and patch workflows.

### Sample `.env`

```env
GROQ_API_KEY=sk-xxxxxx
GITHUB_CLIENT_ID=abcd1234
GITHUB_CLIENT_SECRET=efgh5678
JWT_SECRET=super-secret-value
```

## Agent Permissions & Safety

| Capability | Supported |
|---|---|
| Read files | ✅ |
| Write files | ✅ (after review) |
| Run tests | ✅ |
| Execute commands | ✅ (sandboxed) |
| Git operations | ✅ |
| Internet access | Optional |

### Safety mechanisms

- Agent actions are reviewed before applying patches.
- Backend mediates all file and terminal operations.
- Sandbox mode isolates terminal execution when enabled.
- Secrets live in `.env` and are not committed.

## Examples

### Bug fixing

**Prompt**: Fix `calculate_discount` so negative values are rejected.
**Plan**: locate function, add validation, update tests.
**Actions**: patch code, create regression test, review diff.
**Outcome**: a targeted fix with human approval.

### Refactoring

**Prompt**: Extract shared validation from the payment workflow.
**Plan**: identify duplicated logic, create helper, update call sites.
**Actions**: modify multiple files, generate diff, review and apply.
**Outcome**: cleaner shared logic and safer code.

### Test generation

**Prompt**: Add regression tests for `order_summary`.
**Plan**: inspect route, infer behavior, write assertions.
**Actions**: add new test file and expected cases.
**Outcome**: reproducible tests ready for review.

## Supported Models

| Provider | Model | Support level | Notes |
|---|---|---|---|
| Groq | `llama-3.1-8b-instant` | Primary | Default configuration |
| Groq | `deepseek-r1-distill-llama-70b` | Supported | Higher reasoning capacity |
| Local | custom model | Experimental | Requires backend adapter |
| GPT / Anthropic | custom | Optional | Change provider integration manually |

## Project Structure

```text
backend/      - FastAPI server and agent router
frontend/     - Browser UI, Monaco editor, and streaming client
ai_engine/    - RAG, planner, executor, critic, patch engine
memory/       - ChromaDB index and SQLite persistence
antimatter-env/ - optional local Python virtual environment
```

- `backend/`: server entrypoint, request models, tool orchestration.
- `frontend/`: static editor experience and patch review UI.
- `ai_engine/`: AI orchestration, retrieval, and editing logic.
- `memory/`: local vector store and agent memory.

## Development Guide

### Running tests

No formal test suite is configured in this repository.

### Linting

```bash
npm run lint --prefix frontend
```

### Formatting

Use your editor or `prettier` if installed.

### Building

No production frontend build is required for the current setup.

### Local workflow

1. Start backend: `uvicorn main:app --reload --host 0.0.0.0 --port 1842`
2. Open `frontend/index.html`
3. Load files and issue prompts
4. Review and apply proposed patches

## Evaluation & Benchmarks

No formal benchmark data is available in this repository.

## Limitations

- Experimental project with prototype-quality UX.
- Frontend is a single-file proof of concept.
- Current provider integration is Groq-specific.
- Not all agent workflows are fully hardened.
- No automated backend/frontend test coverage yet.

## Roadmap

- [ ] Add automated backend and frontend tests.
- [ ] Support GPT and Anthropic providers.
- [ ] Add persistent session history.
- [ ] Harden sandbox terminal execution.
- [ ] Add git diff and commit integration.

## FAQ

**Which model should I use?**
Use `llama-3.1-8b-instant` for fast responses and `deepseek-r1-distill-llama-70b` for more complex reasoning.

**Can I use local models?**
Yes, but local providers need backend integration.

**Does code leave my machine?**
Only if you configure an external LLM provider. Code and indexes remain local by default.

**Is internet access required?**
Yes for Groq and GitHub OAuth. The editor can run locally.

**How much does it cost?**
Cost depends on your LLM provider. This repo does not include billing.

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Open a pull request with a clear description.

Keep changes focused and document new behavior.

## License

MIT License

## Community & Support

- Documentation: TBD
- Discord: TBD
- GitHub Issues: https://github.com/<your-org>/AntiMatter/issues
- Discussions: https://github.com/<your-org>/AntiMatter/discussions
- Website: TBD
