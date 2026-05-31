import asyncio
import uuid

class BackgroundCommand:
    def __init__(self, process: asyncio.subprocess.Process):
        self.id = str(uuid.uuid4())
        self.process = process
        self.stdout_buf = bytearray()
        self.stderr_buf = bytearray()
        self.status = "running"
    
    async def read_output(self):
        async def read_stream(stream, buf):
            while True:
                chunk = await stream.read(1024)
                if not chunk:
                    break
                buf.extend(chunk)
                if len(buf) > 100_000: # Max 100KB buffer
                    del buf[:-100_000]

        try:
            await asyncio.gather(
                read_stream(self.process.stdout, self.stdout_buf),
                read_stream(self.process.stderr, self.stderr_buf)
            )
            await self.process.wait()
            self.status = "done"
        except Exception:
            self.status = "error"
