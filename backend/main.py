
from api.routes import auth, projects, files, agent, conversations
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db.session import init_db
from core.config import get_settings
from core.tracing import setup_tracing

settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_tracing()
    await init_db()
    yield

app = FastAPI(title="AI Code Editor API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server — update in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,     prefix="/api/auth",     tags=["auth"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
# app.include_router(files.router,    prefix="/api/files",    tags=["files"])

@app.get("/health")
async def health(): return {"status": "ok"}


app.include_router(agent.router, prefix="/api/agent", tags=["agent"])

app.include_router(conversations.router, prefix="/api/projects", tags=["conversations"])
