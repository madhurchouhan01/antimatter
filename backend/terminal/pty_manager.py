import asyncio
import threading
from fastapi import WebSocket
import docker

class DockerPTYSession:
    """PTY session running inside a sandbox container."""

    def __init__(self, container, session_id: str):
        self.container  = container
        self.session_id = session_id
        self._sock      = None
        self._closed    = False
        self.client     = docker.from_env()
        self.websockets = set()
        self._read_task = None
        self._exec_id   = None

    async def start(self, cols: int = 80, rows: int = 24):
        """Create exec instance with TTY inside the container."""
        loop = asyncio.get_event_loop()
        
        def _create_and_start():
            exec_id = self.client.api.exec_create(
                self.container.id,
                cmd="/bin/bash",
                stdin=True,
                stdout=True,
                stderr=True,
                tty=True,
                environment={"TERM": "xterm-256color"},
                workdir="/workspace",
            )
            self._exec_id = exec_id["Id"]
            self._sock    = self.client.api.exec_start(
                self._exec_id,
                detach=False,
                tty=True,
                socket=True,
            )
        
        await loop.run_in_executor(None, _create_and_start)
        self.resize(cols, rows)
        self._read_task = asyncio.create_task(self._read_loop())

    def resize(self, cols: int, rows: int):
        if self._exec_id:
            try:
                self.client.api.exec_resize(
                    self._exec_id, height=rows, width=cols
                )
            except Exception:
                pass

    def add_websocket(self, websocket: WebSocket):
        self.websockets.add(websocket)

    def remove_websocket(self, websocket: WebSocket):
        if websocket in self.websockets:
            self.websockets.remove(websocket)

    async def _read_loop(self):
        """Forward container PTY output → all connected WebSockets."""
        loop = asyncio.get_event_loop()
        while not self._closed and self._sock:
            try:
                # Docker-py sometimes returns an object with _sock, sometimes the socket directly
                sock = getattr(self._sock, '_sock', self._sock)
                data = await loop.run_in_executor(None, sock.recv, 1024)
                if not data:
                    break
                
                dead_ws = set()
                for ws in list(self.websockets):
                    try:
                        await ws.send_bytes(data)
                    except Exception:
                        dead_ws.add(ws)
                
                for ws in dead_ws:
                    self.remove_websocket(ws)

            except Exception:
                break

    async def write(self, data: bytes):
        """Forward WebSocket keystrokes → container PTY."""
        if not self._closed and self._sock:
            try:
                loop = asyncio.get_event_loop()
                sock = getattr(self._sock, '_sock', self._sock)
                await loop.run_in_executor(None, sock.sendall, data)
            except Exception:
                pass

    def close(self):
        self._closed = True
        self.websockets.clear()
        if self._sock:
            try:
                self._sock.close()
            except Exception:
                pass
        if self._read_task:
            self._read_task.cancel()


class PTYManager:
    def __init__(self):
        self._sessions: dict[str, DockerPTYSession] = {}

    async def create(
        self, session_id: str, container, cols: int = 80, rows: int = 24
    ) -> DockerPTYSession:
        session = DockerPTYSession(container, session_id)
        await session.start(cols=cols, rows=rows)
        self._sessions[session_id] = session
        return session

    def get(self, session_id: str) -> DockerPTYSession | None:
        return self._sessions.get(session_id)

    async def close(self, session_id: str):
        session = self._sessions.pop(session_id, None)
        if session:
            session.close()

pty_manager = PTYManager()