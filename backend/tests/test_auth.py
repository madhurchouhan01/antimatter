# tests/test_auth.py
import pytest

@pytest.mark.asyncio
async def test_register_and_login(client):
    r = await client.post("/api/auth/register", json={"email": "dev@test.com", "password": "secret123"})
    assert r.status_code == 201
    assert "access_token" in r.json()

    r2 = await client.post("/api/auth/login", json={"email": "dev@test.com", "password": "secret123"})
    assert r2.status_code == 200
    token = r2.json()["access_token"]

    r3 = await client.get("/api/projects/", headers={"Authorization": f"Bearer {token}"})
    assert r3.status_code == 200
    assert isinstance(r3.json(), list)

@pytest.mark.asyncio
async def test_wrong_password(client):
    await client.post("/api/auth/register", json={"email": "dev2@test.com", "password": "correct"})
    r = await client.post("/api/auth/login", json={"email": "dev2@test.com", "password": "wrong"})
    assert r.status_code == 401