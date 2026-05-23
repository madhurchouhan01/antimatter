import asyncio
from agent.runner import run_agent_streaming
from db.session import AsyncSessionLocal
from db.models import Project
import uuid

async def fake_send_json(data):
    print("SEND_JSON:", data)

async def main():
    async with AsyncSessionLocal() as db:
        # Get a real project or just mock one
        project = Project(id=uuid.uuid4(), workspace_path="D:\\AntiMatter\\test_workspace", owner_id=uuid.uuid4())
        await run_agent_streaming(
            user_message="create a file hello.py and write print('hello world') inside",
            project=project,
            conversation_id=uuid.uuid4(),
            db=db,
            send_json=fake_send_json
        )

if __name__ == "__main__":
    asyncio.run(main())
