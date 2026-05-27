import asyncio
import json
import uuid

# Directories to ignore inside the container (prevents noise)
IGNORE_DIRS = {
    'node_modules', '__pycache__', '.git', '.pytest_cache', '.venv',
    'venv', 'dist', 'build', '.next', 'coverage', '.idea', '.vscode',
}

POLL_INTERVAL = 2.0  # seconds between polls

# Python snippet run inside the container to snapshot all file mtimes
_SNAPSHOT_SCRIPT = """
import os, json
ignore = %s
result = {}
for dirpath, dirnames, filenames in os.walk('/workspace'):
    dirnames[:] = [d for d in dirnames
                   if d not in ignore and not d.startswith('.')]
    for f in filenames:
        fpath = os.path.join(dirpath, f)
        try:
            result[fpath] = os.path.getmtime(fpath)
        except Exception:
            pass
print(json.dumps(result))
""" % repr(list(IGNORE_DIRS))


class WorkspaceWatcher:
    """
    Watches a sandbox Docker volume for file changes by polling inside the
    container with exec_run every POLL_INTERVAL seconds.

    No host-filesystem access. All file I/O stays inside the Docker volume.
    On change: broadcasts a file.changed event to the frontend for tree sync.
    """

    def __init__(self):
        self._watchers:  dict[str, asyncio.Task] = {}   # project_id → task
        self._snapshots: dict[str, dict]          = {}   # project_id → {path: mtime}

    async def start(
        self,
        project_id: uuid.UUID,
        broadcast_fn,       # async callable(project_id_str, event_dict)
    ):
        pid = str(project_id)
        if pid in self._watchers:
            return  # already watching

        task = asyncio.create_task(
            self._poll_loop(project_id, broadcast_fn)
        )
        self._watchers[pid] = task

    async def stop(self, project_id: uuid.UUID):
        pid  = str(project_id)
        task = self._watchers.pop(pid, None)
        if task:
            task.cancel()
        self._snapshots.pop(pid, None)

    # ------------------------------------------------------------------ #
    #  Internal helpers                                                     #
    # ------------------------------------------------------------------ #

    async def _get_snapshot(self, project_id: uuid.UUID) -> dict[str, float]:
        """Run a Python script inside the container to collect file mtimes."""
        # Import here to avoid circular imports at module load time
        from sandbox.manager import sandbox_manager

        pid     = str(project_id)
        sandbox = sandbox_manager.get(pid)
        if not sandbox:
            return {}

        loop = asyncio.get_event_loop()
        try:
            res = await loop.run_in_executor(
                None,
                lambda: sandbox.container.exec_run(
                    ["python3", "-c", _SNAPSHOT_SCRIPT],
                    workdir="/workspace",
                )
            )
            raw = res.output.decode("utf-8", errors="replace").strip()
            return json.loads(raw)
        except Exception:
            return {}

    async def _poll_loop(self, project_id: uuid.UUID, broadcast_fn):
        pid = str(project_id)

        # Give the container a moment to be fully ready on first connect
        await asyncio.sleep(3)

        # Seed the initial snapshot (no events on first poll)
        self._snapshots[pid] = await self._get_snapshot(project_id)

        while True:
            try:
                await asyncio.sleep(POLL_INTERVAL)

                new_snap = await self._get_snapshot(project_id)
                old_snap = self._snapshots.get(pid, {})

                changes: list[tuple[str, str]] = []

                # Added or modified
                for path, mtime in new_snap.items():
                    if path not in old_snap:
                        changes.append(("created", path))
                    elif mtime != old_snap[path]:
                        changes.append(("modified", path))

                # Deleted
                for path in old_snap:
                    if path not in new_snap:
                        changes.append(("deleted", path))

                self._snapshots[pid] = new_snap

                for event_type, abs_path in changes:
                    # Convert /workspace/foo/bar.py → foo/bar.py
                    rel_path = abs_path.removeprefix("/workspace").lstrip("/")
                    parent   = "/".join(rel_path.split("/")[:-1])

                    await broadcast_fn(pid, {
                        "type":    "file.changed",
                        "event":   event_type,
                        "path":    rel_path,
                        "dir":     parent,
                        "is_file": True,
                    })

            except asyncio.CancelledError:
                raise
            except Exception:
                # Don't let transient errors (container busy, JSON hiccup) kill the loop
                pass


workspace_watcher = WorkspaceWatcher()