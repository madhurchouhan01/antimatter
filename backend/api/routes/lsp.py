import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from db.session import AsyncSessionLocal
from db.models import User, Project
from core.security import decode_access_token
from lsp.manager import lsp_manager, LSP_COMMANDS
from lsp.proxy import LSPProxy
from jose import JWTError

router = APIRouter()

async def get_user_from_token(token: str, db: AsyncSession) -> User | None:
    try:
        user_id = decode_access_token(token)
    except JWTError:
        return None
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    return result.scalar_one_or_none()

@router.websocket("/ws/{project_id}/{language}")
async def lsp_ws(
    websocket: WebSocket,
    project_id: uuid.UUID,
    language: str,
    token: str = Query(...),
):
    await websocket.accept()

    # Validate language
    if language not in LSP_COMMANDS:
        await websocket.send_text('{"error": "Unsupported language"}')
        await websocket.close(code=4003)
        return

    async with AsyncSessionLocal() as db:
        user = await get_user_from_token(token, db)
        if not user:
            await websocket.close(code=4001)
            return

        result = await db.execute(
            select(Project).where(
                Project.id == project_id,
                Project.owner_id == user.id
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            await websocket.close(code=4004)
            return

        session_id = str(project_id)

        try:
            lsp_process = await lsp_manager.get_or_create(
                session_id, language, project.workspace_path
            )
            proxy = LSPProxy(lsp_process, websocket)
            await proxy.run()

        except WebSocketDisconnect:
            pass
        finally:
            proxy.close()