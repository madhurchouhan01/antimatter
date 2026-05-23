import pytest
import asyncio
from httpx import AsyncClient
from unittest.mock import patch, AsyncMock

@pytest.mark.asyncio
async def test_agent_websocket(client):
    # Register + get token
    r = await client.post("/api/auth/register", json={
        "email": "agent@test.com", "password": "secret123"
    })
    token = r.json()["access_token"]

    # Create project
    r2 = await client.post(
        "/api/projects/",
        json={"name": "test-project"},
        headers={"Authorization": f"Bearer {token}"}
    )
    project_id = r2.json()["id"]

    # Test WebSocket
    from httpx_ws import aconnect_ws
    async with aconnect_ws(
        f"/api/agent/ws/{project_id}?token={token}", client
    ) as ws:
        await ws.send_json({"message": "list the files in the workspace"})

        events = []
        for _ in range(20):   # collect up to 20 events
            msg = await asyncio.wait_for(ws.receive_json(), timeout=10)
            events.append(msg)
            if msg["type"] == "done":
                break

        types = [e["type"] for e in events]
        assert "done" in types
