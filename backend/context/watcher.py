import asyncio
import uuid
from pathlib import Path
from watchfiles import awatch, Change
from context.indexer import code_indexer

# Directories to ignore (prevents noise from node_modules, caches, etc.)
IGNORE_PATTERNS = {
    'node_modules', '__pycache__', '.git', '.pytest_cache', '.venv',
    'venv', 'dist', 'build', '.egg-info', '.next', 'coverage',
    '.DS_Store', 'Thumbs.db', '.env', '.vscode', '.idea'
}

class WorkspaceWatcher:
    """
    Watches a workspace directory for file changes.
    On change: re-indexes the file + broadcasts event to frontend.
    Includes: debouncing (prevents rapid refreshes), filtering (ignores common dirs).
    """

    def __init__(self):
        self._watchers: dict[str, asyncio.Task] = {}  # project_id → task
        self._debounce_timers: dict[str, asyncio.Task] = {}  # project_id → debounce task
        self._pending_changes: dict[str, dict] = {}  # project_id → {path → change_type}

    async def start(
        self,
        project_id: uuid.UUID,
        workspace_path: str,
        broadcast_fn,      # async callable(project_id, event_dict)
    ):
        pid = str(project_id)
        if pid in self._watchers:
            return  # already watching

        task = asyncio.create_task(
            self._watch_loop(project_id, workspace_path, broadcast_fn)
        )
        self._watchers[pid] = task

    async def stop(self, project_id: uuid.UUID):
        pid  = str(project_id)
        task = self._watchers.pop(pid, None)
        if task:
            task.cancel()

    async def _watch_loop(
        self,
        project_id: uuid.UUID,
        workspace_path: str,
        broadcast_fn,
    ):
        pid = str(project_id)
        async for changes in awatch(workspace_path):
            for change_type, file_path in changes:
                # Skip ignored directories
                if self._should_ignore(file_path):
                    continue
                
                # Accumulate changes for debouncing
                if pid not in self._pending_changes:
                    self._pending_changes[pid] = {}
                self._pending_changes[pid][file_path] = change_type
                
                # Cancel existing debounce timer
                if pid in self._debounce_timers:
                    self._debounce_timers[pid].cancel()
                
                # Start new debounce timer (300ms)
                async def debounce_callback():
                    await asyncio.sleep(0.3)
                    if pid in self._pending_changes:
                        for path, ctype in self._pending_changes[pid].items():
                            await self._handle_change(
                                project_id, workspace_path, ctype, path, broadcast_fn
                            )
                        del self._pending_changes[pid]
                    if pid in self._debounce_timers:
                        del self._debounce_timers[pid]
                
                timer_task = asyncio.create_task(debounce_callback())
                self._debounce_timers[pid] = timer_task
    
    def _should_ignore(self, file_path: str) -> bool:
        """Check if file should be ignored based on path patterns."""
        path = Path(file_path)
        for part in path.parts:
            if part in IGNORE_PATTERNS or part.startswith('.'):
                return True
        return False

    async def _handle_change(
        self,
        project_id: uuid.UUID,
        workspace_path: str,
        change_type: Change,
        file_path: str,
        broadcast_fn,
    ):
        path = Path(file_path)
        rel_path = str(path.relative_to(workspace_path))

        # Re-index on add/modify
        if change_type in (Change.added, Change.modified):
            asyncio.create_task(
                code_indexer.index_file(
                    project_id, file_path, workspace_path
                )
            )
            event_type = "created" if change_type == Change.added else "modified"

        elif change_type == Change.deleted:
            asyncio.create_task(
                code_indexer.delete_file_index(project_id, file_path)
            )
            event_type = "deleted"

        else:
            return

        # Broadcast to frontend for file tree sync
        # Include both file path and parent directory for smart refresh
        await broadcast_fn(str(project_id), {
            "type":      "file.changed",
            "event":     event_type,
            "path":      rel_path,
            "dir":       str(path.parent.relative_to(workspace_path)),
            "is_file":   path.is_file(),
        })

workspace_watcher = WorkspaceWatcher()