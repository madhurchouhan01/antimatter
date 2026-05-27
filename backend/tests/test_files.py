import pytest
import os
import shutil
import uuid
from db.models import Project

@pytest.fixture
def temp_workspace(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    yield workspace
    shutil.rmtree(workspace, ignore_errors=True)

@pytest.mark.asyncio
async def test_file_operations(client, temp_workspace, engine):
    # Register and login to get auth token
    r = await client.post("/api/auth/register", json={"email": "file_test@test.com", "password": "secret123"})
    assert r.status_code == 201
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create project
    proj_resp = await client.post("/api/projects/", json={"name": "Test File Project"}, headers=headers)
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["id"]
    workspace_path = proj_resp.json()["workspace_path"]

    # Write a file using the API
    write_resp = await client.post(
        f"/api/files/{project_id}/write",
        json={"path": "hello.py", "content": "print('hello')"},
        headers=headers,
    )
    assert write_resp.status_code == 200
    assert write_resp.json() == {"status": "success"}

    # List files
    list_resp = await client.get(f"/api/files/{project_id}/list", headers=headers)
    assert list_resp.status_code == 200
    files_list = list_resp.json()
    assert len(files_list) == 1
    assert files_list[0]["name"] == "hello.py"
    assert files_list[0]["path"] == "hello.py"
    assert files_list[0]["is_dir"] is False

    # Read the file back
    read_resp = await client.get(f"/api/files/{project_id}/read", params={"path": "hello.py"}, headers=headers)
    assert read_resp.status_code == 200
    assert read_resp.json() == {"content": "print('hello')"}

    # Write into subfolders
    sub_write_resp = await client.post(
        f"/api/files/{project_id}/write",
        json={"path": "src/main.py", "content": "x = 1"},
        headers=headers,
    )
    assert sub_write_resp.status_code == 200

    # List root directory to see the src folder
    list_root_resp = await client.get(f"/api/files/{project_id}/list", headers=headers)
    assert list_root_resp.status_code == 200
    root_files = {f["name"]: f for f in list_root_resp.json()}
    assert "src" in root_files
    assert root_files["src"]["is_dir"] is True

    # List subfolder
    list_sub_resp = await client.get(f"/api/files/{project_id}/list", params={"path": "src"}, headers=headers)
    assert list_sub_resp.status_code == 200
    sub_files = list_sub_resp.json()
    assert len(sub_files) == 1
    assert sub_files[0]["name"] == "main.py"

    # Test reading non-existent file
    read_missing = await client.get(f"/api/files/{project_id}/read", params={"path": "missing.py"}, headers=headers)
    assert read_missing.status_code == 404

    # Test security path traversal prevention
    read_traversal = await client.get(f"/api/files/{project_id}/read", params={"path": "../../some_file.py"}, headers=headers)
    assert read_traversal.status_code == 403

    # Test delete file
    delete_resp = await client.delete(f"/api/files/{project_id}", params={"path": "hello.py"}, headers=headers)
    assert delete_resp.status_code == 200
    assert delete_resp.json() == {"status": "success"}

    # Verify hello.py is gone
    list_after_delete = await client.get(f"/api/files/{project_id}/list", headers=headers)
    assert list_after_delete.status_code == 200
    root_files_after = {f["name"] for f in list_after_delete.json()}
    assert "hello.py" not in root_files_after
    assert "src" in root_files_after

    # Test delete directory
    delete_dir_resp = await client.delete(f"/api/files/{project_id}", params={"path": "src"}, headers=headers)
    assert delete_dir_resp.status_code == 200
    assert delete_dir_resp.json() == {"status": "success"}

    # Verify src directory is gone
    list_after_delete_dir = await client.get(f"/api/files/{project_id}/list", headers=headers)
    assert list_after_delete_dir.status_code == 200
    assert len(list_after_delete_dir.json()) == 0
