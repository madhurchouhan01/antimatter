from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from db.session import get_db
from db.models import User, Project
from api.middleware.auth import get_current_user
from core.config import get_settings
import uuid, os

router = APIRouter()
settings = get_settings()

class ProjectCreate(BaseModel):
    name: str
    description: str | None = None

class ProjectOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    workspace_path: str
    created_at: str

    model_config = {"from_attributes": True}

@router.post("/", response_model=ProjectOut, status_code=201)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project_id = uuid.uuid4()
    workspace_path = os.path.join(settings.workspace_root, str(user.id), str(project_id))
    os.makedirs(workspace_path, exist_ok=True)

    project = Project(
        id=project_id,
        owner_id=user.id,
        name=body.name,
        description=body.description,
        workspace_path=workspace_path,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project

@router.get("/", response_model=list[ProjectOut])
async def list_projects(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Project).where(Project.owner_id == user.id))
    return result.scalars().all()

@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Project).where(Project.id == project_id, Project.owner_id == user.id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    await db.delete(project)
    await db.commit()