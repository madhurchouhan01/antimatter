import asyncio
import uuid
from pathlib import Path
from watchfiles import awatch, Change
from context.indexer import code_indexer

class WorkspaceWatcher:
    """
    Watches a workspace directory for file changes.
    On change: re-indexes the file + broadcasts event to frontend.
    """

    def __init__(self):
        self._watchers: dict[str, asyncio.Task] = {}  # project_id → task

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
        async for changes in awatch(workspace_path):
            for change_type, file_path in changes:
                await self._handle_change(
                    project_id, workspace_path,
                    change_type, file_path, broadcast_fn
                )

    async def _handle_change(
        self,
        project_id: uuid.UUID,
        workspace_path: str,
        change_type: Change,
        file_path: str,
        broadcast_fn,
    ):
        path = Path(file_path)

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
        await broadcast_fn(str(project_id), {
            "type":  "file.changed",
            "event": event_type,
            "path":  str(path.relative_to(workspace_path)),
        })

workspace_watcher = WorkspaceWatcher()