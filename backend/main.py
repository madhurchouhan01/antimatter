
from api.routes import auth, projects, files, agent, conversations, terminal, lsp, git
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import git
from db.session import init_db
from core.config import get_settings
from core.tracing import setup_tracing
from sandbox.manager import sandbox_manager
import asyncio

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_tracing()
    await init_db()

    # Background task — clean up idle containers every 5 minutes
    async def idle_cleanup():
        while True:
            await asyncio.sleep(300)
            await sandbox_manager.cleanup_idle()

    cleanup_task = asyncio.create_task(idle_cleanup())
    yield
    cleanup_task.cancel()
app = FastAPI(title="AI Code Editor API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],  # Vite dev server — update in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,     prefix="/api/auth",     tags=["auth"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(files.router,    prefix="/api/files",    tags=["files"])
app.include_router(agent.router, prefix="/api/agent", tags=["agent"])
app.include_router(conversations.router, prefix="/api/projects", tags=["conversations"])
app.include_router(terminal.router, prefix="/api/terminal", tags=["terminal"])
app.include_router(lsp.router, prefix="/api/lsp", tags=["lsp"])
app.include_router(git.router, prefix="/api/git", tags=["git"])

@app.get("/health")
async def health(): return {"status": "ok"}