import subprocess
import asyncio
from langchain_core.tools import tool
from services.file_service import FileService, SecurityError
from sandbox.manager import sandbox_manager

# Each tool receives workspace_root at call time via a closure factory
def make_tools(workspace_root: str):
    fs = FileService(workspace_root)

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
        """Write content to a file at the given path. Creates parent directories if needed."""
        try:
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