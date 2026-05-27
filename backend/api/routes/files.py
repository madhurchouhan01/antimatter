import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from db.session import get_db
from db.models import User, Project
from api.middleware.auth import get_current_user
from services.file_service import FileService, SecurityError

router = APIRouter()

class FileWriteRequest(BaseModel):
    path: str
    content: str

async def get_project_and_verify_owner(
    project_id: uuid.UUID,
    db: AsyncSession,
    user: User,
) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or not owned by you",
        )
    return project

@router.get("/{project_id}/list")
async def list_files(
    project_id: uuid.UUID,
    path: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await get_project_and_verify_owner(project_id, db, user)
    service = FileService(project_id, user.id)
    try:
        return await service.list_dir(path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except SecurityError as e:
        raise HTTPException(status_code=403, detail=str(e))

@router.get("/{project_id}/read")
async def read_file(
    project_id: uuid.UUID,
    path: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await get_project_and_verify_owner(project_id, db, user)
    service = FileService(project_id, user.id)
    try:
        content = await service.read(path)
        return {"content": content}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except SecurityError as e:
        raise HTTPException(status_code=403, detail=str(e))

@router.post("/{project_id}/write")
async def write_file(
    project_id: uuid.UUID,
    body: FileWriteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await get_project_and_verify_owner(project_id, db, user)
    service = FileService(project_id, user.id)
    try:
        await service.write(body.path, body.content)
        return {"status": "success"}
    except SecurityError as e:
        raise HTTPException(status_code=403, detail=str(e))

@router.delete("/{project_id}")
async def delete_file(
    project_id: uuid.UUID,
    path: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await get_project_and_verify_owner(project_id, db, user)
    service = FileService(project_id, user.id)
    try:
        await service.delete(path)
        return {"status": "success"}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except SecurityError as e:
        raise HTTPException(status_code=403, detail=str(e))

from fastapi import UploadFile, File, Form

@router.post("/{project_id}/upload")
async def upload_file(
    project_id: uuid.UUID,
    path: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await get_project_and_verify_owner(project_id, db, user)
    service = FileService(project_id, user.id)
    try:
        content = await file.read()
        await service.write_bytes(path, content)
        return {"status": "success"}
    except SecurityError as e:
        raise HTTPException(status_code=403, detail=str(e))
