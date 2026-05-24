from pathlib import Path

class SecurityError(Exception):
    pass

class FileService:
    def __init__(self, workspace_root: str):
        self.root = Path(workspace_root).resolve()

    def _safe_path(self, path: str) -> Path:
        resolved = (self.root / path.lstrip("/")).resolve()
        if not str(resolved).startswith(str(self.root)):
            raise SecurityError("Path traversal detected")
        return resolved

    async def read(self, path: str) -> str:
        return self._safe_path(path).read_text()

    async def write(self, path: str, content: str) -> None:
        p = self._safe_path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)

    async def write_bytes(self, path: str, content: bytes) -> None:
        p = self._safe_path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(content)

    async def list_dir(self, path: str = "") -> list[dict]:
        p = self._safe_path(path)
        if not p.is_dir():
            raise FileNotFoundError(f"{path} is not a directory")
        return [
            {"name": child.name, "path": str(child.relative_to(self.root)), "is_dir": child.is_dir()}
            for child in sorted(p.iterdir())
        ]