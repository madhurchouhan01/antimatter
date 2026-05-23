import subprocess
import asyncio
from langchain_core.tools import tool
from services.file_service import FileService, SecurityError

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
        """
        Run a shell command inside the project workspace.
        Working directory is set to the workspace root.
        Timeout: 30 seconds. Do NOT run interactive commands.
        """
        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=str(fs.root),
            )
            try:
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
                output = stdout.decode("utf-8", errors="replace")
                return output[:4000] if len(output) > 4000 else output
            except asyncio.TimeoutError:
                proc.kill()
                return "ERROR: Command timed out after 30 seconds."
        except Exception as e:
            return f"ERROR: {e}"

    return [read_file, write_file, list_files, run_command]