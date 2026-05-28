import asyncio
from typing import Callable, Awaitable, Optional
from langchain_core.tools import tool
from services.file_service import FileService, SecurityError
from sandbox.manager import sandbox_manager

# Each tool receives project context at call time via a closure factory
# emit_fn: optional async callback used by write_file to propose a diff instead of writing directly
def make_tools(
    project_id: str,
    user_id: str,
    emit_fn: Optional[Callable[[dict], Awaitable[None]]] = None,
):
    fs = FileService(project_id, user_id)

    @tool
    async def read_file(path: str) -> str:
        """Read the contents of a file at the given path inside the project workspace."""
        try:
            return await fs.read(path)
        except FileNotFoundError:
            return f"ERROR: File not found: {path}"
        except SecurityError:
            return "ERROR: Path traversal attempt blocked."

    @tool
    async def write_file(path: str, content: str) -> str:
        """
        Propose a change to a file. The user must review and accept the diff before
        it is written to disk. Do NOT call this multiple times for the same file —
        wait for the user to accept or reject before proposing further changes.
        """
        try:
            # Read current content to compute the diff
            try:
                original = await fs.read(path)
            except FileNotFoundError:
                original = ""  # new file

            if emit_fn:
                # Emit a patch proposal to the frontend — do NOT write to disk
                await emit_fn({
                    "type": "file.patch",
                    "path": path,
                    "original": original,
                    "modified": content,
                })
                return f"PENDING: Diff proposed for {path}. Waiting for user approval."
            else:
                # Fallback: write directly (used in tests / non-WS contexts)
                await fs.write(path, content)
                return f"OK: Written to {path}"
        except SecurityError:
            return "ERROR: Path traversal attempt blocked."

    @tool
    async def list_files(path: str = "") -> str:
        """List files and directories at a path inside the workspace. Default is root."""
        try:
            entries = await fs.list_dir(path)
            lines = [
                f"{'[DIR] ' if e['is_dir'] else '[FILE]'} {e['path']}"
                for e in entries
            ]
            return "\n".join(lines) if lines else "(empty directory)"
        except FileNotFoundError as e:
            return f"ERROR: {e}"

    @tool
    async def run_command(command: str) -> str:
        """Run a shell command inside the project sandbox container."""
        try:
            sandbox = await sandbox_manager.get_or_create(project_id, user_id)
            sandbox.touch()
            result = sandbox.exec_run(
                ["/bin/bash", "-c", command],
                workdir="/workspace",
                demux=True,
            )
            stdout, stderr = result.output
            output = ""
            if stdout:
                output += stdout.decode("utf-8", errors="replace")
            if stderr:
                output += stderr.decode("utf-8", errors="replace")
            return output[:4000] if len(output) > 4000 else output
        except Exception as e:
            return f"ERROR: {e}"

    return [read_file, write_file, list_files, run_command]