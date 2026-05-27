import asyncio
import os
from dataclasses import dataclass, field
import docker

# LSP server commands per language
LSP_COMMANDS = {
    "python": ["pylsp"],
    "typescript": ["typescript-language-server", "--stdio"],
    "javascript": ["typescript-language-server", "--stdio"],
}

# File extension → language mapping
EXTENSION_MAP = {
    ".py":   "python",
    ".ts":   "typescript",
    ".tsx":  "typescript",
    ".js":   "javascript",
    ".jsx":  "javascript",
}

def detect_language(file_path: str) -> str | None:
    ext = os.path.splitext(file_path)[1].lower()
    return EXTENSION_MAP.get(ext)

class LSPProcess:
    def __init__(self, language: str, container):
        self.language  = language
        self.container = container
        self._exec_id  = None
        self._sock     = None
        self.client    = docker.from_env()

    async def start(self):
        loop = asyncio.get_event_loop()
        cmd = LSP_COMMANDS[self.language]
        
        def _start():
            exec_id = self.client.api.exec_create(
                self.container.id,
                cmd=cmd,
                stdin=True,
                stdout=True,
                stderr=False,
                tty=False,
                workdir="/workspace",
            )
            self._exec_id = exec_id["Id"]
            self._sock    = self.client.api.exec_start(
                self._exec_id,
                detach=False,
                tty=False,
                socket=True,
            )
            
        await loop.run_in_executor(None, _start)

    @property
    def stdin(self):
        return self._sock._sock

    @property
    def stdout(self):
        return self._sock._sock

    def close(self):
        if self._sock:
            try:
                self._sock.close()
            except Exception:
                pass

class LSPManager:
    """One LSP process per (session_id, language)."""

    def __init__(self):
        self._processes: dict[str, LSPProcess] = {}

    def _key(self, session_id: str, language: str) -> str:
        return f"{session_id}:{language}"

    async def get_or_create(
        self, session_id: str, language: str, project_id: str, user_id: str
    ) -> LSPProcess:
        key = self._key(session_id, language)
        if key not in self._processes:
            from sandbox.manager import sandbox_manager
            sandbox = await sandbox_manager.get_or_create(project_id, user_id)
            lsp = LSPProcess(language=language, container=sandbox.container)
            await lsp.start()
            self._processes[key] = lsp
        return self._processes[key]

    async def close_session(self, session_id: str):
        """Kill all LSP processes for a session."""
        to_close = [k for k in self._processes if k.startswith(f"{session_id}:")]
        for key in to_close:
            lsp = self._processes.pop(key)
            await lsp.close()

# Singleton
lsp_manager = LSPManager()