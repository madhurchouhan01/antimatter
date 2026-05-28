import asyncio
import re
import json
from fastapi import WebSocket
from lsp.manager import LSPProcess

class LSPProxy:
    """
    Bridges WebSocket (Monaco) ↔ LSP process (stdio).
    LSP uses Content-Length framing over stdio.
    WebSocket sends/receives raw JSON strings.
    """

    def __init__(self, lsp_process: LSPProcess, websocket: WebSocket):
        self.lsp = lsp_process
        self.websocket = websocket
        self._closed = False

    async def run(self):
        """Run both directions concurrently until one side closes."""
        await asyncio.gather(
            self._ws_to_lsp(),
            self._lsp_to_ws(),
            return_exceptions=True
        )

    async def _ws_to_lsp(self):
        """WebSocket messages → LSP stdin (add Content-Length framing)."""
        async for text in self.websocket.iter_text():
            if self._closed:
                break
            try:
                encoded = text.encode("utf-8")
                header = f"Content-Length: {len(encoded)}\r\n\r\n".encode()
                self.lsp.process.stdin.write(header + encoded)
                await self.lsp.process.stdin.drain()
            except Exception:
                break

    async def _lsp_to_ws(self):
        """LSP stdout → WebSocket (strip Content-Length framing)."""
        while not self._closed:
            try:
                # Read header
                header = b""
                while b"\r\n\r\n" not in header:
                    chunk = await self.lsp.process.stdout.read(1)
                    if not chunk:
                        return
                    header += chunk

                # Parse Content-Length
                match = re.search(rb"Content-Length: (\d+)", header)
                if not match:
                    continue
                length = int(match.group(1))

                # Read body
                body = await self.lsp.process.stdout.readexactly(length)
                await self.websocket.send_text(body.decode("utf-8"))

            except asyncio.IncompleteReadError:
                break
            except Exception:
                break

    def close(self):
        self._closed = True