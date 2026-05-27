import uuid
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from db.session import AsyncSessionLocal
from db.models import User, Project, TerminalSession
from core.security import decode_access_token
from terminal.pty_manager import pty_manager
from jose import JWTError
from datetime import datetime, timezone
from sandbox.manager import sandbox_manager

import asyncio  # add at top
router = APIRouter()

async def get_user_from_token(token: str, db: AsyncSession) -> User | None:
    try:
        user_id = decode_access_token(token)
    except JWTError:
        return None
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    return result.scalar_one_or_none()

@router.websocket("/ws/{project_id}")
async def terminal_ws(
    websocket: WebSocket,
    project_id: uuid.UUID,
    token: str = Query(...),
    terminal_id: str = Query("default"),
):
    await websocket.accept()

    async with AsyncSessionLocal() as db:
        user = await get_user_from_token(token, db)
        if not user:
            await websocket.send_json({"type": "error", "message": "Unauthorized"})
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
            await websocket.send_json({"type": "error", "message": "Project not found"})
            await websocket.close(code=4004)
            return

        # Create DB record
        session_id_db = str(uuid.uuid4())
        db_session = TerminalSession(
            id=uuid.UUID(session_id_db),
            project_id=project.id,
            user_id=user.id
        )
        db.add(db_session)
        await db.commit()


        # Use project_id + terminal_id for terminal session persistence
        session_id = f"term-{project.id}-{terminal_id}"
        
        # Check if PTY session already exists
        pty_session = pty_manager.get(session_id)
        if not pty_session:
            sandbox = await sandbox_manager.get_or_create(
                project_id=str(project.id),
                user_id=str(user.id)
            )
            # Spawn PTY
            pty_session = await pty_manager.create(
                session_id=session_id,
                container=sandbox.container,
                cols=80,
                rows=24
            )
        
        pty_session.add_websocket(websocket)

        try:
            while True:
                message = await websocket.receive()

                if "bytes" in message:
                    # Raw keystrokes → PTY stdin
                    await pty_session.write(message["bytes"])

                elif "text" in message:
                    # Control messages (resize, etc.)
                    try:
                        data = json.loads(message["text"])
                        if data.get("type") == "resize":
                            pty_session.resize(
                                cols=data.get("cols", 80),
                                rows=data.get("rows", 24)
                            )
                    except json.JSONDecodeError:
                        pass

        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            pty_session.remove_websocket(websocket)
            # We don't close the pty_session here to allow terminal persistence
            # Mark session closed in DB not needed since we persist it

