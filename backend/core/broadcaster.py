import asyncio
from collections import defaultdict
from fastapi import WebSocket

class ConnectionManager:
    """
    Manages active WebSocket connections per project.
    Used by file watcher, agent, and future real-time features.
    """

    def __init__(self):
        # project_id → set of WebSocket connections
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    def connect(self, project_id: str, ws: WebSocket):
        self._connections[project_id].add(ws)

    def disconnect(self, project_id: str, ws: WebSocket):
        self._connections[project_id].discard(ws)

    async def broadcast(self, project_id: str, message: dict):
        """Send a message to all clients connected to a project."""
        dead = set()
        clients = self._connections.get(project_id, set())
        for ws in clients:
            try:
                await ws.send_json(message)
            except Exception:
                dead.add(ws)
        # Clean up dead connections
        for ws in dead:
            self._connections[project_id].discard(ws)

# Singleton
manager = ConnectionManager()