import asyncio
import re
import json
from fastapi import WebSocket
from lsp.manager import LSPProcess

class LSPProxy:
    """
    Bridges WebSocket (Monaco) ↔ LSP process (Docker socket).

    The Docker exec socket is a raw socket, NOT an asyncio stream.
    We run reads in a thread-pool executor to avoid blocking the event loop.

    LSP uses Content-Length framing over stdio.
    WebSocket sends/receives raw JSON strings.
    """

    HEADER_SEP = b"\r\n\r\n"

    def __init__(self, lsp_process: LSPProcess, websocket: WebSocket):
        self.lsp       = lsp_process
        self.websocket = websocket
        self._closed   = False

    async def run(self):
        """Run both directions concurrently until one side closes."""
        await asyncio.gather(
            self._ws_to_lsp(),
            self._lsp_to_ws(),
            return_exceptions=True,
        )

    # ------------------------------------------------------------------
    # WebSocket → LSP (add Content-Length framing)
    # ------------------------------------------------------------------
    async def _ws_to_lsp(self):
        loop = asyncio.get_event_loop()
        async for text in self.websocket.iter_text():
            if self._closed:
                break
            try:
                encoded = text.encode("utf-8")
                frame   = f"Content-Length: {len(encoded)}\r\n\r\n".encode() + encoded
                # Raw Docker socket write — must be done in executor
                await loop.run_in_executor(None, self._write_to_lsp, frame)
            except Exception as e:
                print(f"LSP ws→lsp error: {e}")
                break

    def _write_to_lsp(self, data: bytes):
        """Blocking write to the Docker exec socket (runs in thread pool)."""
        sock = self.lsp.stdin   # raw socket from LSPProcess
        sock.sendall(data)

    # ------------------------------------------------------------------
    # LSP → WebSocket (strip Content-Length framing)
    # ------------------------------------------------------------------
    async def _lsp_to_ws(self):
        loop = asyncio.get_event_loop()
        while not self._closed:
            try:
                # Read until we get \r\n\r\n — run in executor (blocking recv)
                header = await loop.run_in_executor(None, self._read_header)
                if header is None:
                    break

                match = re.search(rb"Content-Length: (\d+)", header)
                if not match:
                    continue

                length = int(match.group(1))
                body   = await loop.run_in_executor(None, self._read_exact, length)
                if body is None:
                    break

                await self.websocket.send_text(body.decode("utf-8"))

            except Exception as e:
                if not self._closed:
                    print(f"LSP lsp→ws error: {e}")
                break

    def _read_header(self) -> bytes | None:
        """Blocking: read bytes from the Docker socket until \\r\\n\\r\\n."""
        sock   = self.lsp.stdout  # same raw socket, bidirectional
        header = b""
        try:
            while self.HEADER_SEP not in header:
                chunk = sock.recv(1)
                if not chunk:
                    return None
                header += chunk
        except OSError:
            return None
        return header

    def _read_exact(self, n: int) -> bytes | None:
        """Blocking: read exactly n bytes from the Docker socket."""
        sock = self.lsp.stdout
        buf  = b""
        try:
            while len(buf) < n:
                chunk = sock.recv(n - len(buf))
                if not chunk:
                    return None
                buf += chunk
        except OSError:
            return None
        return buf

    def close(self):
        self._closed = True