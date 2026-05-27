from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from db.session import get_db
from db.models import User, Project
from api.middleware.auth import get_current_user
from core.config import get_settings
import uuid, os, asyncio, subprocess
from datetime import datetime

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
    created_at: datetime   

    model_config = {"from_attributes": True}

class CloneRepoRequest(BaseModel):
    project_id: uuid.UUID
    repo_url: str

class OpenFolderRequest(BaseModel):
    project_id: uuid.UUID
    folder_path: str

@router.post("/", response_model=ProjectOut, status_code=201)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project_id = uuid.uuid4()
    # print(f"Workspace root: {settings.workspace_root}, User ID: {user.id}, Project ID: {project_id}")
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

@router.get("/list_projects", response_model=list[ProjectOut])
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

@router.post("/clone-repo")
async def clone_repo(
    body: CloneRepoRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Clone a git repository into the project workspace."""
    result = await db.execute(
        select(Project).where(Project.id == body.project_id, Project.owner_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    
    try:
        # Extract repo name from URL
        repo_name = body.repo_url.split("/")[-1].replace(".git", "")
        clone_path = os.path.join(project.workspace_path, repo_name)
        
        # Run git clone asynchronously
        process = await asyncio.create_subprocess_exec(
            "git", "clone", body.repo_url, clone_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            raise HTTPException(400, f"Git clone failed: {error_msg}")
        
        return {"status": "success", "message": f"Repository cloned to {repo_name}"}
    
    except Exception as e:
        raise HTTPException(500, f"Clone failed: {str(e)}")

@router.post("/open-folder")
async def open_folder(
    body: OpenFolderRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Verify that a folder exists in the project workspace."""
    result = await db.execute(
        select(Project).where(Project.id == body.project_id, Project.owner_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    
    try:
        # Validate folder path (prevent directory traversal)
        folder_path = os.path.join(project.workspace_path, body.folder_path)
        folder_path = os.path.abspath(folder_path)
        
        # Ensure the folder is within the project workspace
        if not folder_path.startswith(os.path.abspath(project.workspace_path)):
            raise HTTPException(403, "Access denied: folder outside project workspace")
        
        # Check if folder exists
        if not os.path.isdir(folder_path):
            raise HTTPException(404, f"Folder not found: {body.folder_path}")
        
        return {"status": "success", "message": f"Folder opened: {body.folder_path}"}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error opening folder: {str(e)}")