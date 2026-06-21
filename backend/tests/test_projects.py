# tests/test_projects.py
import pytest
import uuid

@pytest.mark.asyncio
async def test_project_lifecycle(client):
    # Register and login to get auth token
    r = await client.post("/api/auth/register", json={"email": "proj_test@test.com", "password": "secret123"})
    assert r.status_code == 201
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a project
    create_resp = await client.post(
        "/api/projects/",
        json={"name": "Initial Project Name", "description": "Initial description"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    project = create_resp.json()
    project_id = project["id"]
    assert project["name"] == "Initial Project Name"
    assert project["description"] == "Initial description"

    # 2. List projects to verify it is listed
    list_resp = await client.get("/api/projects/list_projects", headers=headers)
    assert list_resp.status_code == 200
    projects_list = list_resp.json()
    assert len(projects_list) >= 1
    assert any(p["id"] == project_id for p in projects_list)

    # 3. Update the project name and description
    update_resp = await client.put(
        f"/api/projects/{project_id}",
        json={"name": "Updated Project Name", "description": "Updated description"},
        headers=headers,
    )
    assert update_resp.status_code == 200
    updated_project = update_resp.json()
    assert updated_project["name"] == "Updated Project Name"
    assert updated_project["description"] == "Updated description"

    # Verify update persisted in list
    list_resp_2 = await client.get("/api/projects/list_projects", headers=headers)
    assert list_resp_2.status_code == 200
    assert any(p["id"] == project_id and p["name"] == "Updated Project Name" for p in list_resp_2.json())

    # 4. Attempt to update name to empty/whitespace-only (should fail with 400)
    fail_resp = await client.put(
        f"/api/projects/{project_id}",
        json={"name": "   "},
        headers=headers,
    )
    assert fail_resp.status_code == 400
    assert "Project name cannot be empty" in fail_resp.json()["detail"]

    # 5. Attempt to update a non-existent project (should return 404)
    fake_id = str(uuid.uuid4())
    fake_resp = await client.put(
        f"/api/projects/{fake_id}",
        json={"name": "New Name"},
        headers=headers,
    )
    assert fake_resp.status_code == 404

    # 6. Delete the project
    delete_resp = await client.delete(f"/api/projects/{project_id}", headers=headers)
    assert delete_resp.status_code == 204

    # Verify project is deleted
    list_resp_3 = await client.get("/api/projects/list_projects", headers=headers)
    assert list_resp_3.status_code == 200
    assert not any(p["id"] == project_id for p in list_resp_3.json())
