import io
import json
import tarfile
import posixpath
from sandbox.manager import sandbox_manager

class SecurityError(Exception):
    pass

class FileService:
    def __init__(self, project_id: str, user_id: str):
        self.project_id = str(project_id)
        self.user_id = str(user_id)
        self.root = "/workspace"

    async def _get_container(self):
        sandbox = await sandbox_manager.get_or_create(self.project_id, self.user_id)
        return sandbox.container

    def _safe_path(self, path: str) -> str:
        # Normalize the path to guard against traversal
        cleaned = posixpath.normpath(path.lstrip("/"))
        if cleaned.startswith("..") or posixpath.isabs(cleaned):
            raise SecurityError("Path traversal detected")
        return posixpath.join(self.root, cleaned)

    async def read_bytes(self, path: str) -> bytes:
        container = await self._get_container()
        target_path = self._safe_path(path)
        
        # Verify file exists and is not a directory
        code = f"""
import os, json
target = {repr(target_path)}
if not os.path.exists(target):
    print(json.dumps({{"error": "not_found"}}))
elif os.path.isdir(target):
    print(json.dumps({{"error": "is_dir"}}))
else:
    print(json.dumps({{"status": "ok"}}))
"""
        res = container.exec_run(["python3", "-c", code])
        try:
            out = json.loads(res.output.decode("utf-8").strip())
        except Exception:
            raise FileNotFoundError(f"{path} not found")
        if "error" in out:
            if out["error"] == "not_found":
                raise FileNotFoundError(f"{path} not found")
            else:
                raise IsADirectoryError(f"{path} is a directory")
                
        stream, stat = container.get_archive(target_path)
        tar_stream = io.BytesIO()
        for chunk in stream:
            if isinstance(chunk, str):
                tar_stream.write(chunk.encode("utf-8"))
            else:
                tar_stream.write(chunk)
        tar_stream.seek(0)
        with tarfile.open(fileobj=tar_stream) as tar:
            member = tar.next()
            f = tar.extractfile(member)
            return f.read()

    async def read(self, path: str) -> str:
        data = await self.read_bytes(path)
        return data.decode("utf-8")

    async def write_bytes(self, path: str, content: bytes) -> None:
        container = await self._get_container()
        target_path = self._safe_path(path)
        
        parent_dir = posixpath.dirname(target_path)
        if parent_dir and parent_dir != "/":
            container.exec_run(["mkdir", "-p", parent_dir])
        
        tar_stream = io.BytesIO()
        filename = posixpath.basename(target_path)
        with tarfile.open(fileobj=tar_stream, mode='w') as tar:
            tarinfo = tarfile.TarInfo(name=filename)
            tarinfo.size = len(content)
            tar.addfile(tarinfo, io.BytesIO(content))
        tar_stream.seek(0)
        container.put_archive(parent_dir, tar_stream.read())

    async def write(self, path: str, content: str) -> None:
        await self.write_bytes(path, content.encode("utf-8"))

    async def list_dir(self, path: str = "", recursive: bool = False) -> list[dict]:
        container = await self._get_container()
        target_path = self._safe_path(path)
        
        code = f"""
import os, json
try:
    root = '/workspace'
    target = {repr(target_path)}
    if not os.path.exists(target):
        print(json.dumps({{"error": "not_found"}}))
        exit(0)
    if not os.path.isdir(target):
        print(json.dumps({{"error": "not_dir"}}))
        exit(0)
    entries = []
    if {str(recursive)}:
        for dirpath, dirnames, filenames in os.walk(target):
            dirnames.sort()
            filenames.sort()
            for dirname in dirnames:
                full_path = os.path.join(dirpath, dirname)
                rel_path = os.path.relpath(full_path, root)
                entries.append({{
                    "name": dirname,
                    "path": rel_path.replace(os.sep, '/'),
                    "is_dir": True,
                    "is_symlink": os.path.islink(full_path)
                }})
            for filename in filenames:
                full_path = os.path.join(dirpath, filename)
                rel_path = os.path.relpath(full_path, root)
                entries.append({{
                    "name": filename,
                    "path": rel_path.replace(os.sep, '/'),
                    "is_dir": False,
                    "is_symlink": os.path.islink(full_path)
                }})
    else:
        for entry in os.scandir(target):
            rel_path = os.path.relpath(entry.path, root)
            entries.append({{
                "name": entry.name,
                "path": rel_path.replace(os.sep, '/'),
                "is_dir": entry.is_dir(),
                "is_symlink": entry.is_symlink()
            }})
        entries.sort(key=lambda x: (not x["is_dir"], x["name"]))
    print(json.dumps({{"status": "success", "data": entries}}))
except Exception as e:
    print(json.dumps({{"error": str(e)}}))
"""
        res = container.exec_run(["python3", "-c", code])
        output_str = res.output.decode("utf-8").strip()
        try:
            out = json.loads(output_str)
        except Exception as e:
            raise RuntimeError(f"Failed to parse container output: {output_str}. Error: {e}")
            
        if "error" in out:
            if out["error"] == "not_found":
                raise FileNotFoundError(f"{path} not found")
            elif out["error"] == "not_dir":
                raise FileNotFoundError(f"{path} is not a directory")
            else:
                raise RuntimeError(out["error"])
        return out["data"]

    async def delete(self, path: str) -> None:
        container = await self._get_container()
        target_path = self._safe_path(path)
        
        code = f"""
import os, shutil, json
try:
    target = {repr(target_path)}
    if target == '/workspace':
        print(json.dumps({{"error": "cannot delete root"}}))
        exit(0)
    if not os.path.exists(target):
        print(json.dumps({{"error": "not_found"}}))
        exit(0)
    if os.path.isdir(target):
        shutil.rmtree(target)
    else:
        os.remove(target)
    print(json.dumps({{"status": "success"}}))
except Exception as e:
    print(json.dumps({{"error": str(e)}}))
"""
        res = container.exec_run(["python3", "-c", code])
        output_str = res.output.decode("utf-8").strip()
        try:
            out = json.loads(output_str)
        except Exception as e:
            raise RuntimeError(f"Failed to parse container output: {output_str}. Error: {e}")
            
        if "error" in out:
            if out["error"] == "not_found":
                raise FileNotFoundError(f"{path} not found")
            else:
                raise RuntimeError(out["error"])