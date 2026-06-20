import uuid
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from db.session import get_db, AsyncSessionLocal
from db.models import User, Project, UserSettings
from core.security import decode_access_token
from core.logger import get_logger
from agent.runner import run_agent_streaming
from jose import JWTError
from core.broadcaster import manager
from context.watcher import workspace_watcher
from context.indexer import code_indexer
import asyncio

router = APIRouter()
log = get_logger(__name__)

async def get_user_from_token(token: str, db: AsyncSession) -> User | None:
    try:
        user_id = decode_access_token(token)
        log.debug("Token decoded", user_id=user_id)
    except JWTError as e:
        log.warning("JWT decode failed", error=str(e))
        return None
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    return result.scalar_one_or_none()

@router.websocket("/ws/{project_id}")
async def agent_ws(
    websocket: WebSocket,
    project_id: uuid.UUID,
    token: str = Query(...),
):
    await websocket.accept()

    async with AsyncSessionLocal() as db:
        user = await get_user_from_token(token, db)
        if not user:
            await websocket.send_json({"type": "error", "message": "Unauthorized"})
            await websocket.close(code=4001)
            return

        result = await db.execute(
            select(Project).where(Project.id == project_id, Project.owner_id == user.id)
        )
        project = result.scalar_one_or_none()
        if not project:
            await websocket.send_json({"type": "error", "message": "Project not found"})
            await websocket.close(code=4004)
            return

        # Register WS for broadcasts
        manager.connect(str(project_id), websocket)

        # Start container-polling file watcher (no host path needed)
        await workspace_watcher.start(
            project_id,
            broadcast_fn=manager.broadcast,
        )

        # Trigger background index on first connect
        asyncio.create_task(
            code_indexer.index_project(project_id, project.workspace_path)
        )
        conversation_id = None

        try:
            while True:
                data = await websocket.receive_json()
                user_message = data.get("message", "").strip()
                conversation_id = data.get("conversation_id") or conversation_id
                open_files   = data.get("open_files", [])


                if not user_message:
                    continue

                # Reload user settings on every message so keys saved mid-session
                # (e.g. via the Settings modal while WS is open) are picked up immediately
                fresh_settings = await db.execute(
                    select(UserSettings).where(UserSettings.user_id == user.id)
                )
                user_settings = fresh_settings.scalar_one_or_none()
                provider = data.get("provider") or (user_settings.provider if user_settings else "groq")
                model    = data.get("model")    or (user_settings.model    if user_settings else "llama-3.3-70b-versatile")
                user_api_key = user_settings.api_key if user_settings else None
                # Ollama: read the persisted base URL (falls back to default in get_llm)
                ollama_base_url = getattr(user_settings, "ollama_base_url", None) if user_settings else None

                log.info(
                    "Agent request received",
                    project=str(project_id),
                    provider=provider,
                    model=model,
                    open_files=len(open_files),
                    msg_preview=user_message[:80],
                )

                await run_agent_streaming(
                    user_message=user_message,
                    project=project,
                    conversation_id=uuid.UUID(conversation_id) if conversation_id else None,
                    db=db,
                    send_json=websocket.send_json,
                    open_files=open_files,
                    emit_fn=websocket.send_json,
                    model_name=model,
                    provider=provider,
                    api_key=user_api_key,
                    ollama_base_url=ollama_base_url,
                )

        except (WebSocketDisconnect, RuntimeError):
            pass

        finally:
            manager.disconnect(str(project_id), websocket)
