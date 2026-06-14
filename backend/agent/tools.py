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
        """
        Read the full contents of a file at a workspace-relative path.

        Use this before any edit so you have the exact current content.
        path examples: 'main.py', 'src/utils/helpers.py', 'README.md'
        """
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
        Create a new file or completely overwrite an existing file.

        - path: workspace-relative (e.g. 'src/main.py', 'tests/test_foo.py').
        - content: the complete new file content as a string.
        - Prefer replace_file_content / multi_replace_file_content for partial edits.
        - After proposing a diff, wait for user approval before editing this path again.
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
        List files and directories in the workspace.

        - path: workspace-relative directory to list (default '' = project root).
        - max_depth: how many directory levels to recurse (1–10, default 2).
        - Use this to explore project structure before reading or editing files.
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
        Execute a short-lived shell command inside the project sandbox and return its output.

        - Use for: compiling, formatting, linting, one-off scripts, checking versions.
        - Do NOT use for: servers, watchers, or any process that runs indefinitely — use run_background_command instead.
        - timeout: seconds before the command is killed (1–300, default 30).
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
        Search the workspace for text patterns or filenames.

        - mode='content' (default): regex search inside file contents (like ripgrep/grep -rn).
        - mode='filename': glob pattern match on file names only (e.g. '*.py', 'test_*').
        - path: workspace-relative directory to scope the search (default = entire project).
        - case_sensitive: default False (case-insensitive).
        - max_results: cap on returned matches (default 50).
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
        Install one or more packages into the sandbox environment.

        - packages: list of specifiers, e.g. ['requests', 'numpy==1.26']
        - manager: 'pip' for Python, 'npm' for Node.js, 'auto' to detect from package.json.
        - Run this before executing code that imports a library not yet installed.
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
        Run the project's pytest test suite inside the sandbox.

        - path: workspace-relative path to limit scope (e.g. 'tests/test_auth.py', 'tests/').
          Leave empty to run all discovered tests.
        - extra_args: additional pytest flags (e.g. '-v', '-k test_login', '--tb=long').
        - timeout: seconds before the run is killed (1–600, default 120).
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
        Replace a single contiguous block of text inside an existing file.

        - path: workspace-relative file path.
        - target_content: the EXACT text to find (whitespace and indentation must match).
        - replacement_content: the text to substitute in its place.
        - allow_multiple: if True, replaces every occurrence; if False (default) and multiple
          occurrences exist, the call fails — make target_content more specific instead.
        - Use multi_replace_file_content when you need to change several separate blocks at once.
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
        Replace several non-contiguous blocks of text in a single file in one atomic call.

        - path: workspace-relative file path.
        - replacements: ordered list of objects, each with:
            { "target_content": "<exact text to find>",
              "replacement_content": "<text to substitute>" }
        - All target_content values must match EXACTLY (including indentation).
        - Replacements are applied sequentially — earlier changes affect later searches.
        - Use this instead of multiple replace_file_content calls on the same file.
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
        """
        Search the public web and return the top organic results.

        - Use for: looking up library documentation, error messages, package versions,
          recent news, or any information not available in the workspace files.
        - Returns up to 5 result snippets with titles and URLs.
        - query: a concise, keyword-focused search string (e.g. 'FastAPI background tasks docs').
        """
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
        """
        Generate a raster image (photo, illustration, or UI mockup screenshot) from a
        natural-language prompt and return its hosted URL.

        STRICT SCOPE — only call this tool when the user explicitly asks to:
          • produce a photo-realistic or artistic image
          • render a UI / wireframe screenshot as an image file

        Do NOT call this tool for:
          • code flowcharts, architecture diagrams, or sequence diagrams  →  use Mermaid
          • data charts or graphs  →  generate code that plots them
          • any request that can be satisfied with text, code, or a diagram
        """
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
        """
        Start a long-running process in the background and return its command ID.

        - Use for: dev servers, watchers, queue workers, or any process that must
          stay alive across multiple agent turns.
        - Returns a command ID — pass it to command_status or send_command_input.
        - Do NOT use for short one-off commands — use run_command instead.
        """
        try:
            sandbox = await sandbox_manager.get_or_create(project_id, user_id)
            cmd_id = await sandbox.run_background(command)
            return f"OK: Background command started with ID {cmd_id}"
        except Exception as e:
            return f"ERROR: {e}"

    @tool
    async def command_status(cmd_id: str) -> str:
        """
        Retrieve the current status and output (stdout + stderr) of a background command.

        - cmd_id: the ID returned by run_background_command.
        - Returns: status ('running' | 'exited'), exit code, and buffered output.
        - Call this to check whether a server started successfully or a job finished.
        """
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
        """
        Send text to the stdin of a running background command.

        - cmd_id: the ID returned by run_background_command.
        - input_data: the text to write to the process's stdin (include '\n' if needed).
        - Use for: answering interactive prompts, sending keystrokes to REPLs, etc.
        """
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