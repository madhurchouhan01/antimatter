import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from db.session import get_db
from db.models import User, Project
from api.middleware.auth import get_current_user
from git_backend.service import GitService

router = APIRouter()

class CommitRequest(BaseModel):
    message: str
    paths: list[str]       # files to stage before committing

class BranchRequest(BaseModel):
    name: str

def get_git(project: Project) -> GitService:
    return GitService(project.workspace_path)

async def get_project(
    project_id: uuid.UUID,
    db: AsyncSession,
    user: User
) -> Project:
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == user.id
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    return project

@router.get("/{project_id}/status")
async def git_status(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await get_project(project_id, db, user)
    svc = get_git(project)
    if not svc.is_repo:
        svc.init()
    return svc.status()

@router.get("/{project_id}/diff")
async def git_diff(
    project_id: uuid.UUID,
    staged: bool = False,
    file_path: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await get_project(project_id, db, user)
    svc = get_git(project)
    return {"diff": svc.diff(staged=staged, file_path=file_path)}

@router.post("/{project_id}/commit")
async def git_commit(
    project_id: uuid.UUID,
    body: CommitRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await get_project(project_id, db, user)
    svc = get_git(project)
    if body.paths:
        svc.stage(body.paths)
    sha = svc.commit(body.message, user.name or user.email)
    return {"sha": sha}

@router.post("/{project_id}/branch")
async def create_branch(
    project_id: uuid.UUID,
    body: BranchRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await get_project(project_id, db, user)
    get_git(project).create_branch(body.name)
    return {"ok": True}

@router.get("/{project_id}/branches")
async def list_branches(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await get_project(project_id, db, user)
    return {"branches": get_git(project).branches()}

@router.get("/{project_id}/log")
async def git_log(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await get_project(project_id, db, user)
    return {"commits": get_git(project).log()}