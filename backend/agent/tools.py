# import asyncio
# from typing import Callable, Awaitable, Optional
# from langchain_core.tools import tool
# from services.file_service import FileService, SecurityError
# from sandbox.manager import sandbox_manager

# # Each tool receives project context at call time via a closure factory
# # emit_fn: optional async callback used by write_file to propose a diff instead of writing directly
# def make_tools(
#     project_id: str,
#     user_id: str,
#     emit_fn: Optional[Callable[[dict], Awaitable[None]]] = None,
# ):
#     fs = FileService(project_id, user_id)

#     @tool
#     async def read_file(path: str) -> str:
#         """Read the contents of a file at the given path inside the project workspace."""
#         try:
#             return await fs.read(path)
#         except FileNotFoundError:
#             return f"ERROR: File not found: {path}"
#         except SecurityError:
#             return "ERROR: Path traversal attempt blocked."

#     @tool
#     async def write_file(path: str, content: str) -> str:
#         """
#         Propose a change to a file. The user must review and accept the diff before
#         it is written to disk. Do NOT call this multiple times for the same file —
#         wait for the user to accept or reject before proposing further changes.
#         """
#         try:
#             # Read current content to compute the diff
#             try:
#                 original = await fs.read(path)
#             except FileNotFoundError:
#                 original = ""  # new file

#             if emit_fn:
#                 # Emit a patch proposal to the frontend — do NOT write to disk
#                 await emit_fn({
#                     "type": "file.patch",
#                     "path": path,
#                     "original": original,
#                     "modified": content,
#                 })
#                 return f"PENDING: Diff proposed for {path}. Waiting for user approval."
#             else:
#                 # Fallback: write directly (used in tests / non-WS contexts)
#                 await fs.write(path, content)
#                 return f"OK: Written to {path}"
#         except SecurityError:
#             return "ERROR: Path traversal attempt blocked."

#     @tool
#     async def list_files(path: str = "") -> str:
#         """List files and directories at a path inside the workspace. Default is root."""
#         try:
#             entries = await fs.list_dir(path)
#             lines = [
#                 f"{'[DIR] ' if e['is_dir'] else '[FILE]'} {e['path']}"
#                 for e in entries
#             ]
#             return "\n".join(lines) if lines else "(empty directory)"
#         except FileNotFoundError as e:
#             return f"ERROR: {e}"

#     @tool
#     async def run_command(command: str) -> str:
#         """Run a shell command inside the project sandbox container."""
#         try:
#             sandbox = await sandbox_manager.get_or_create(project_id, user_id)
#             sandbox.touch()
#             result = sandbox.exec_run(
#                 ["/bin/bash", "-c", command],
#                 workdir="/workspace",
#                 demux=True,
#             )
#             stdout, stderr = result.output
#             output = ""
#             if stdout:
#                 output += stdout.decode("utf-8", errors="replace")
#             if stderr:
#                 output += stderr.decode("utf-8", errors="replace")
#             return output[:4000] if len(output) > 4000 else output
#         except Exception as e:
#             return f"ERROR: {e}"

#     return [read_file, write_file, list_files, run_command]



import asyncio
import fnmatch
import re
from typing import Callable, Awaitable, Optional

from langchain_core.tools import tool
from services.file_service import FileService, SecurityError
from sandbox.manager import sandbox_manager

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_FILE_SIZE_BYTES = 512 * 1024          # 512 KB hard cap for write_file
DEFAULT_COMMAND_TIMEOUT = 30              # seconds
DEFAULT_TEST_TIMEOUT = 120               # pytest can be slow
DEFAULT_INSTALL_TIMEOUT = 120
LIST_FILES_MAX_DEPTH = 10                # absolute ceiling regardless of caller


# ---------------------------------------------------------------------------
# Tool factory
# ---------------------------------------------------------------------------

def make_tools(
    project_id: str,
    user_id: str,
    emit_fn: Optional[Callable[[dict], Awaitable[None]]] = None,
):
    """
    Returns the full list of LangChain tools scoped to a single project/user pair.

    emit_fn
        An async callback used by write_file to *propose* a diff to the frontend
        rather than writing directly. When provided, write_file never touches disk —
        it emits a ``file.patch`` event and returns PENDING. The frontend is
        responsible for confirming or rejecting the patch before the agent proceeds.

        Multi-file writes: each file is emitted as a separate ``file.patch`` event.
        The agent must NOT call write_file for the same path again until the user
        has accepted or rejected the previous diff for that path.
    """
    fs = FileService(project_id, user_id)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _exec_in_sandbox(command: str, timeout: int) -> str:
        """
        Run *command* inside the project sandbox and return combined stdout+stderr,
        truncated to 4 000 characters. Raises asyncio.TimeoutError on expiry.
        """
        sandbox = await sandbox_manager.get_or_create(project_id, user_id)
        sandbox.touch()

        loop = asyncio.get_event_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: sandbox.exec_run(
                    ["/bin/bash", "-c", command],
                    workdir="/workspace",
                    demux=True,
                ),
            ),
            timeout=timeout,
        )

        stdout, stderr = result.output
        output = ""
        if stdout:
            output += stdout.decode("utf-8", errors="replace")
        if stderr:
            output += stderr.decode("utf-8", errors="replace")
        return output[:4000] if len(output) > 4000 else output

    # ------------------------------------------------------------------
    # read_file
    # ------------------------------------------------------------------

    @tool
    async def read_file(path: str) -> str:
        """Read the contents of a file at the given path inside the project workspace."""
        try:
            return await fs.read(path)
        except FileNotFoundError:
            return f"ERROR: File not found: {path}"
        except SecurityError:
            return "ERROR: Path traversal attempt blocked."

    # ------------------------------------------------------------------
    # write_file
    # ------------------------------------------------------------------

    @tool
    async def write_file(path: str, content: str) -> str:
        """
        Propose a change to a file.

        Behaviour depends on whether emit_fn was provided at factory construction:

        • With emit_fn (normal production use):
            A ``file.patch`` diff event is sent to the frontend. The file is NOT
            written to disk. Returns PENDING. The agent must stop and wait for the
            user to accept or reject before making any further changes to this path.

        • Without emit_fn (tests / CLI / non-WebSocket contexts):
            The file is written to disk immediately. Returns OK.

        Constraints
        -----------
        - Maximum content size: 512 KB (UTF-8 encoded). Larger payloads are rejected.
        - Content must be valid UTF-8.
        - Do NOT call this multiple times for the same path without waiting for the
          user to resolve the previous pending diff.
        """
        # --- size guard -------------------------------------------------------
        try:
            encoded = content.encode("utf-8")
        except UnicodeEncodeError:
            return "ERROR: Content contains characters that cannot be encoded as UTF-8."

        if len(encoded) > MAX_FILE_SIZE_BYTES:
            size_kb = len(encoded) // 1024
            return (
                f"ERROR: Content is {size_kb} KB, which exceeds the 512 KB limit. "
                "Split the file or reduce its size before writing."
            )

        try:
            try:
                original = await fs.read(path)
            except FileNotFoundError:
                original = ""  # new file

            if emit_fn:
                await emit_fn({
                    "type": "file.patch",
                    "path": path,
                    "original": original,
                    "modified": content,
                })
                return f"PENDING: Diff proposed for {path}. Waiting for user approval."
            else:
                await fs.write(path, content)
                return f"OK: Written to {path}"

        except SecurityError:
            return "ERROR: Path traversal attempt blocked."

    # ------------------------------------------------------------------
    # list_files
    # ------------------------------------------------------------------

    @tool
    async def list_files(path: str = "", max_depth: int = 2) -> str:
        """
        List files and directories at *path* inside the workspace.

        Parameters
        ----------
        path      : Relative path inside the workspace. Defaults to the root.
        max_depth : How many directory levels to recurse (1 = immediate children
                    only, up to 10). Defaults to 2.

        Symlinks are listed with a ``[LINK]`` prefix and are not followed, so
        circular links cannot cause infinite recursion.
        """
        max_depth = max(1, min(max_depth, LIST_FILES_MAX_DEPTH))

        try:
            entries = await fs.list_dir(path, recursive=True)
        except FileNotFoundError as exc:
            return f"ERROR: {exc}"

        lines: list[str] = []
        for e in entries:
            depth = e["path"].count("/")
            if depth >= max_depth:
                continue

            if e.get("is_symlink"):
                prefix = "[LINK]"
            elif e["is_dir"]:
                prefix = "[DIR] "
            else:
                prefix = "[FILE]"

            lines.append(f"{prefix} {e['path']}")

        return "\n".join(lines) if lines else "(empty directory)"

    # ------------------------------------------------------------------
    # run_command
    # ------------------------------------------------------------------

    @tool
    async def run_command(command: str, timeout: int = DEFAULT_COMMAND_TIMEOUT) -> str:
        """
        Run a shell command inside the project sandbox container.

        Parameters
        ----------
        command : The bash command to execute.
        timeout : Maximum seconds to wait before the command is killed (default 30,
                  max 300). Use a higher value only for known long-running builds.

        The combined stdout+stderr is returned, capped at 4 000 characters.
        """
        timeout = max(1, min(timeout, 300))
        try:
            return await _exec_in_sandbox(command, timeout)
        except asyncio.TimeoutError:
            return f"ERROR: Command timed out after {timeout}s."
        except Exception as exc:
            return f"ERROR: {exc}"

    # ------------------------------------------------------------------
    # search_files  (NEW)
    # ------------------------------------------------------------------

    @tool
    async def search_files(
        query: str,
        mode: str = "content",
        path: str = "",
        case_sensitive: bool = False,
        max_results: int = 50,
    ) -> str:
        """
        Search the workspace for files or symbols.

        Parameters
        ----------
        query          : The search term. For ``content`` mode this is a regex
                         pattern (ripgrep syntax). For ``filename`` mode it is a
                         glob pattern (e.g. ``*.py``, ``test_*``).
        mode           : ``"content"``  — search inside file contents (default).
                         ``"filename"`` — search by file name / glob pattern.
        path           : Subdirectory to scope the search (defaults to workspace root).
        case_sensitive : Honour case in the pattern (default False).
        max_results    : Cap the number of matching lines/files returned (default 50).

        Returns
        -------
        For ``content`` mode: matching lines in ``filepath:line_no: text`` format.
        For ``filename`` mode: list of matching relative file paths.
        """
        mode = mode.strip().lower()
        if mode not in ("content", "filename"):
            return "ERROR: mode must be 'content' or 'filename'."

        scope = path.strip("/") or "."

        if mode == "content":
            flags = "" if case_sensitive else "-i"
            # ripgrep: line numbers, no heading, limit results via head
            rg_cmd = (
                f"rg {flags} --line-number --no-heading --color=never "
                f"-m {max_results} "
                f"-- {re.escape(repr(query))[1:-1]!r} {scope} 2>&1 | head -n {max_results}"
            )
            # fall back to grep if rg is unavailable
            grep_cmd = (
                f"grep -rn {'--ignore-case' if not case_sensitive else ''} "
                f"-m {max_results} "
                f"-- {query!r} {scope} 2>&1 | head -n {max_results}"
            )
            check_rg = (
                f"command -v rg >/dev/null 2>&1 && {rg_cmd} || {grep_cmd}"
            )
            try:
                output = await _exec_in_sandbox(check_rg, timeout=20)
                if not output.strip():
                    return f"No matches found for pattern '{query}' in '{scope}'."
                return output
            except asyncio.TimeoutError:
                return "ERROR: Search timed out after 20s. Try narrowing the scope."
            except Exception as exc:
                return f"ERROR: {exc}"

        else:  # filename mode
            try:
                all_entries = await fs.list_dir(scope, recursive=True)
            except FileNotFoundError as exc:
                return f"ERROR: {exc}"

            ic_query = query.lower() if not case_sensitive else query
            matches: list[str] = []
            for e in all_entries:
                if e["is_dir"]:
                    continue
                name = e["path"].split("/")[-1]
                candidate = name.lower() if not case_sensitive else name
                if fnmatch.fnmatch(candidate, ic_query):
                    matches.append(e["path"])
                    if len(matches) >= max_results:
                        break

            if not matches:
                return f"No files matching '{query}' found under '{scope}'."
            return "\n".join(matches)

    # ------------------------------------------------------------------
    # install_packages  (NEW)
    # ------------------------------------------------------------------

    @tool
    async def install_packages(packages: list[str], manager: str = "auto") -> str:
        """
        Install one or more packages inside the project sandbox.

        Parameters
        ----------
        packages : List of package specifiers, e.g. ``["requests", "numpy==1.26"]``.
        manager  : ``"pip"``, ``"npm"``, or ``"auto"`` (default). When set to
                   ``"auto"`` the tool inspects the workspace for ``package.json``
                   (→ npm) or ``requirements.txt`` / ``pyproject.toml`` (→ pip),
                   falling back to pip if neither is conclusive.

        Returns the combined install output, truncated to 4 000 characters.
        """
        if not packages:
            return "ERROR: No packages specified."

        manager = manager.strip().lower()
        if manager not in ("pip", "npm", "auto"):
            return "ERROR: manager must be 'pip', 'npm', or 'auto'."

        # --- auto-detect -------------------------------------------------------
        if manager == "auto":
            try:
                probe = await _exec_in_sandbox(
                    "[ -f package.json ] && echo npm || echo pip", timeout=5
                )
                manager = probe.strip() if probe.strip() in ("pip", "npm") else "pip"
            except Exception:
                manager = "pip"

        pkg_str = " ".join(f'"{p}"' for p in packages)

        if manager == "pip":
            cmd = f"pip install --quiet {pkg_str} 2>&1"
        else:
            cmd = f"npm install --save {pkg_str} 2>&1"

        try:
            output = await _exec_in_sandbox(cmd, timeout=DEFAULT_INSTALL_TIMEOUT)
            if not output.strip():
                return f"OK: Installed {', '.join(packages)} via {manager}."
            return output
        except asyncio.TimeoutError:
            return (
                f"ERROR: Package installation timed out after {DEFAULT_INSTALL_TIMEOUT}s. "
                "The sandbox may be slow or the package unusually large."
            )
        except Exception as exc:
            return f"ERROR: {exc}"

    # ------------------------------------------------------------------
    # run_tests  (NEW)
    # ------------------------------------------------------------------

    @tool
    async def run_tests(
        path: str = "",
        extra_args: str = "",
        timeout: int = DEFAULT_TEST_TIMEOUT,
    ) -> str:
        """
        Run the pytest test suite inside the project sandbox and return a
        structured summary of the results.

        Parameters
        ----------
        path       : File or directory to scope the test run (e.g. ``tests/``
                     or ``tests/test_auth.py``). Defaults to auto-discovery.
        extra_args : Additional pytest flags, e.g. ``"-k payment -x --tb=short"``.
        timeout    : Max seconds before the test run is killed (default 120).

        Output format
        -------------
        Returns pytest's terminal output (stdout + stderr), including the
        short test summary, pass/fail counts, and any assertion errors.
        Output is capped at 4 000 characters; if truncated, the tail is
        preserved so that the failure summary is always visible.
        """
        timeout = max(1, min(timeout, 600))

        scope = path.strip() or ""
        cmd_parts = ["python", "-m", "pytest", "--tb=short", "-q"]
        if scope:
            cmd_parts.append(scope)
        if extra_args.strip():
            cmd_parts.append(extra_args.strip())
        cmd = " ".join(cmd_parts) + " 2>&1"

        try:
            raw = await _exec_in_sandbox(cmd, timeout=timeout)
        except asyncio.TimeoutError:
            return f"ERROR: Test run timed out after {timeout}s."
        except Exception as exc:
            return f"ERROR: {exc}"

        # Prefer the tail so the summary line (passed/failed counts) is visible
        if len(raw) > 4000:
            head = raw[:1000]
            tail = raw[-3000:]
            return f"{head}\n... [truncated] ...\n{tail}"
        return raw if raw.strip() else "OK: No tests collected."

    # ------------------------------------------------------------------
    # replace_file_content (NEW)
    # ------------------------------------------------------------------

    @tool
    async def replace_file_content(path: str, target_content: str, replacement_content: str, allow_multiple: bool = False) -> str:
        """
        Replace a specific contiguous block of text in a file and propose a change.
        """
        try:
            try:
                original = await fs.read(path)
            except FileNotFoundError:
                return f"ERROR: File not found: {path}"

            occurrences = original.count(target_content)
            if occurrences == 0:
                return "ERROR: target_content not found in the file."
            if occurrences > 1 and not allow_multiple:
                return "ERROR: target_content found multiple times. Set allow_multiple=True to replace all, or make target_content more specific."

            modified = original.replace(target_content, replacement_content)

            if emit_fn:
                await emit_fn({
                    "type": "file.patch",
                    "path": path,
                    "original": original,
                    "modified": modified,
                })
                return f"PENDING: Diff proposed for {path}. Waiting for user approval."
            else:
                await fs.write(path, modified)
                return f"OK: Replaced content in {path}"
        except SecurityError:
            return "ERROR: Path traversal attempt blocked."

    # ------------------------------------------------------------------
    # multi_replace_file_content (NEW)
    # ------------------------------------------------------------------

    @tool
    async def multi_replace_file_content(path: str, replacements: list[dict]) -> str:
        """
        Replace multiple separate blocks of text in a file and propose a change.
        replacements should be a list of dicts: [{"target_content": "...", "replacement_content": "..."}]
        """
        try:
            try:
                original = await fs.read(path)
            except FileNotFoundError:
                return f"ERROR: File not found: {path}"

            modified = original
            for i, rep in enumerate(replacements):
                target = rep.get("target_content")
                repl = rep.get("replacement_content")
                if target is None or repl is None:
                    return f"ERROR: Replacement at index {i} missing target_content or replacement_content."
                if target not in modified:
                    return f"ERROR: target_content at index {i} not found."
                modified = modified.replace(target, repl)

            if emit_fn:
                await emit_fn({
                    "type": "file.patch",
                    "path": path,
                    "original": original,
                    "modified": modified,
                })
                return f"PENDING: Diff proposed for {path}. Waiting for user approval."
            else:
                await fs.write(path, modified)
                return f"OK: Replaced content in {path}"
        except SecurityError:
            return "ERROR: Path traversal attempt blocked."

    # ------------------------------------------------------------------
    # search_web (NEW)
    # ------------------------------------------------------------------
    
    @tool
    async def search_web(query: str) -> str:
        """Search the web using the Serper API."""
        import os, aiohttp
        api_key = os.getenv("SERPER_API_KEY")
        if not api_key:
            return "ERROR: SERPER_API_KEY environment variable is not set."
        url = "https://google.serper.dev/search"
        payload = {"q": query}
        headers = {
            "X-API-KEY": api_key,
            "Content-Type": "application/json"
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers) as response:
                    if response.status != 200:
                        return f"ERROR: Serper API returned status {response.status}"
                    data = await response.json()
                    results = []
                    if "answerBox" in data:
                        results.append(f"Answer Box: {data['answerBox'].get('answer') or data['answerBox'].get('snippet')}")
                    for item in data.get("organic", [])[:5]:
                        results.append(f"- {item.get('title')}: {item.get('snippet')} ({item.get('link')})")
                    return "\n".join(results) if results else "No results found."
        except Exception as e:
            return f"ERROR: Web search failed: {e}"

    # ------------------------------------------------------------------
    # generate_image (NEW)
    # ------------------------------------------------------------------

    @tool
    async def generate_image(prompt: str) -> str:
        """Generate an image using the KIE AI API."""
        import os, aiohttp
        api_key = os.getenv("KIE_API_KEY")
        if not api_key:
            return "ERROR: KIE_API_KEY environment variable is not set."
        url = os.getenv("KIE_API_URL", "https://api.kie.ai/v1/images/generations")
        payload = {"prompt": prompt, "n": 1, "size": "1024x1024"}
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers) as response:
                    if response.status != 200:
                        return f"ERROR: KIE AI API returned status {response.status}"
                    data = await response.json()
                    if "data" in data and len(data["data"]) > 0:
                        return f"OK: Image generated at {data['data'][0].get('url')}"
                    return "ERROR: No image data returned."
        except Exception as e:
            return f"ERROR: Image generation failed: {e}"

    # ------------------------------------------------------------------
    # Background commands (NEW)
    # ------------------------------------------------------------------

    @tool
    async def run_background_command(command: str) -> str:
        """Run a shell command in the background and return its ID."""
        try:
            sandbox = await sandbox_manager.get_or_create(project_id, user_id)
            cmd_id = await sandbox.run_background(command)
            return f"OK: Background command started with ID {cmd_id}"
        except Exception as e:
            return f"ERROR: {e}"

    @tool
    async def command_status(cmd_id: str) -> str:
        """Get the status of a background command."""
        try:
            sandbox = await sandbox_manager.get_or_create(project_id, user_id)
            status = sandbox.get_background_status(cmd_id)
            if "error" in status:
                return f"ERROR: {status['error']}"
            return (f"Status: {status['status']}\n"
                    f"Exit code: {status['exit_code']}\n"
                    f"Stdout: {status['stdout']}\n"
                    f"Stderr: {status['stderr']}")
        except Exception as e:
            return f"ERROR: {e}"

    @tool
    async def send_command_input(cmd_id: str, input_data: str) -> str:
        """Send stdin to a running background command."""
        try:
            sandbox = await sandbox_manager.get_or_create(project_id, user_id)
            return await sandbox.send_background_input(cmd_id, input_data)
        except Exception as e:
            return f"ERROR: {e}"

    # ------------------------------------------------------------------

    return [read_file, write_file, list_files, run_command,
            search_files, install_packages, run_tests,
            replace_file_content, multi_replace_file_content,
            search_web, generate_image, run_background_command,
            command_status, send_command_input]