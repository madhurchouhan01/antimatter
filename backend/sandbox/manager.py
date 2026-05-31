import asyncio
import uuid
import time
import docker
from docker.models.containers import Container
from docker.errors import NotFound
from core.config import get_settings
from sandbox.background import BackgroundCommand

settings = get_settings()

class SandboxContainer:
    def __init__(self, container: Container, project_id: str, user_id: str):
        self.container   = container
        self.project_id  = project_id
        self.user_id     = user_id
        self.last_active = time.time()
        self.background_commands = {}

    def touch(self):
        self.last_active = time.time()

    @property
    def is_idle(self) -> bool:
        return time.time() - self.last_active > settings.sandbox_idle_timeout

    def exec_run(self, cmd: list[str], **kwargs):
        return self.container.exec_run(cmd, **kwargs)

    async def run_background(self, cmd: str) -> str:
        self.touch()
        process = await asyncio.create_subprocess_exec(
            "docker", "exec", "-i", self.container.name, "/bin/bash", "-c", cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        bg_cmd = BackgroundCommand(process)
        self.background_commands[bg_cmd.id] = bg_cmd
        asyncio.create_task(bg_cmd.read_output())
        return bg_cmd.id

    def get_background_status(self, cmd_id: str) -> dict:
        self.touch()
        cmd = self.background_commands.get(cmd_id)
        if not cmd:
            return {"error": "Command not found"}
        return {
            "status": cmd.status,
            "stdout": cmd.stdout_buf.decode('utf-8', errors='replace'),
            "stderr": cmd.stderr_buf.decode('utf-8', errors='replace'),
            "exit_code": cmd.process.returncode
        }

    async def send_background_input(self, cmd_id: str, input_data: str) -> str:
        self.touch()
        cmd = self.background_commands.get(cmd_id)
        if not cmd:
            return "ERROR: Command not found"
        if cmd.status != "running":
            return "ERROR: Command is not running"
        try:
            cmd.process.stdin.write(input_data.encode('utf-8'))
            await cmd.process.stdin.drain()
            return "OK"
        except Exception as e:
            return f"ERROR: {e}"

    async def terminate_background(self, cmd_id: str) -> str:
        self.touch()
        cmd = self.background_commands.get(cmd_id)
        if not cmd:
            return "ERROR: Command not found"
        if cmd.status != "running":
            return "ERROR: Command is not running"
        try:
            cmd.process.terminate()
            return "OK"
        except Exception as e:
            return f"ERROR: {e}"


class SandboxManager:
    """
    Manages one Docker container per project.
    Containers are ephemeral — volumes are persistent.
    """

    def __init__(self):
        self.client     = docker.from_env()
        self._sandboxes: dict[str, SandboxContainer] = {}  # project_id → sandbox
        self._lock      = asyncio.Lock()

    def _volume_name(self, user_id: str, project_id: str) -> str:
        return f"antimatter-workspace-{user_id}-{project_id}"

    def _container_name(self, project_id: str) -> str:
        return f"antimatter-sandbox-{project_id}"

    def _ensure_volume(self, user_id: str, project_id: str) -> str:
        """Create volume if it doesn't exist, return its name."""
        name = self._volume_name(user_id, project_id)
        try:
            self.client.volumes.get(name)
        except NotFound:
            self.client.volumes.create(
                name=name,
                labels={
                    "antimatter.user_id":    user_id,
                    "antimatter.project_id": project_id,
                }
            )
        return name

    async def get_or_create(
        self, project_id: str, user_id: str
    ) -> SandboxContainer:
        async with self._lock:
            # Return existing running sandbox
            if project_id in self._sandboxes:
                sandbox = self._sandboxes[project_id]
                sandbox.touch()
                return sandbox

            # Check if container already exists (e.g. after API restart)
            container_name = self._container_name(project_id)
            try:
                container = self.client.containers.get(container_name)
                if container.status != "running":
                    container.start()
            except NotFound:
                # Ensure named Docker volume exists (no host filesystem leakage)
                volume_name = self._ensure_volume(user_id, project_id)

                container = self.client.containers.run(
                    image=settings.sandbox_image,
                    name=container_name,
                    command="tail -f /dev/null",  # keep alive
                    detach=True,
                    network=settings.sandbox_network,
                    volumes={
                        volume_name: {
                            "bind": "/workspace",
                            "mode": "rw"
                        }
                    },
                    working_dir="/workspace",
                    mem_limit=settings.sandbox_memory,
                    nano_cpus=int(float(settings.sandbox_cpu) * 1e9),
                    labels={
                        "antimatter.project_id": project_id,
                        "antimatter.user_id":    user_id,
                    },
                    cap_drop=["ALL"],
                    security_opt=["no-new-privileges:true"],
                    read_only=False,
                )

            sandbox = SandboxContainer(container, project_id, user_id)
            self._sandboxes[project_id] = sandbox
            return sandbox

    async def stop(self, project_id: str):
        async with self._lock:
            sandbox = self._sandboxes.pop(project_id, None)
            if sandbox:
                try:
                    sandbox.container.stop(timeout=5)
                except Exception:
                    pass

    async def cleanup_idle(self):
        """Call this periodically to stop idle containers."""
        async with self._lock:
            idle = [pid for pid, s in self._sandboxes.items() if s.is_idle]
            for project_id in idle:
                sandbox = self._sandboxes.pop(project_id)
                try:
                    sandbox.container.stop(timeout=5)
                except Exception:
                    pass

    def get(self, project_id: str) -> SandboxContainer | None:
        return self._sandboxes.get(project_id)

# Singleton
sandbox_manager = SandboxManager()