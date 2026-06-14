import pytest
import uuid
from unittest.mock import patch, AsyncMock
from sqlalchemy import select
from db.models import AgentMemory, User, Project
from agent.memory import retrieve_memories, check_and_write_memory
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage

@pytest.mark.asyncio
async def test_retrieve_memories_success(client, engine):
    # Setup test project and memory
    from sqlalchemy.ext.asyncio import async_sessionmaker
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    
    async with session_factory() as db:
        # Create owner
        owner = User(email="test@test.com", name="Test User")
        db.add(owner)
        await db.flush()
        
        # Create project
        project = Project(owner_id=owner.id, name="Test Project", workspace_path="/tmp")
        db.add(project)
        await db.flush()

        # Create a dummy memory
        memory = AgentMemory(
            project_id=project.id,
            user_id=owner.id,
            task_description="Solve python environment issue",
            context_signature={"files": ["main.py"], "error_types": []},
            generalizable_lesson="Make sure to set PYTHONPATH.",
            embedding=[0.1] * 1024,
        )
        db.add(memory)
        await db.commit()

        project_id_str = str(project.id)

    # Mock Voyage client embed call
    with patch("agent.memory._embed_memory_query") as mock_embed:
        mock_embed.return_value = [0.1] * 1024
        
        async with session_factory() as db:
            result = await retrieve_memories(
                db=db,
                project_id=project_id_str,
                task_description="Solve python environment issue",
                threshold=0.5,
            )
            assert "Make sure to set PYTHONPATH" in result
            assert "touched main.py" in result

@pytest.mark.asyncio
async def test_check_and_write_memory_worthy(client, engine):
    from sqlalchemy.ext.asyncio import async_sessionmaker
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    
    async with session_factory() as db:
        # Create owner
        owner = User(email="test_worthy@test.com", name="Test User")
        db.add(owner)
        await db.flush()
        
        # Create project
        project = Project(owner_id=owner.id, name="Test Project", workspace_path="/tmp")
        db.add(project)
        await db.flush()
        
        project_id_str = str(project.id)
        user_id_str = str(owner.id)
        await db.commit()
    
    # Mock LLM and Embed responses
    mock_worthy_response = AsyncMock()
    mock_worthy_response.content = '{"worthy": true, "reason": "non-obvious environment setup", "generalizable_lesson": "Set PYTHONPATH for imports"}'
    
    mock_extract_response = AsyncMock()
    mock_extract_response.content = """{
        "task_description": "Setup python imports",
        "context_signature": {
            "files": ["main.py"],
            "modules": [],
            "error_types": ["ModuleNotFoundError"]
        },
        "what_worked": "exporting PYTHONPATH",
        "what_failed_first": "running python directly",
        "generalizable_lesson": "Set PYTHONPATH for imports"
    }"""
    
    mock_llm = AsyncMock()
    mock_llm.ainvoke.side_effect = [mock_worthy_response, mock_extract_response]
    
    messages = [
        HumanMessage(content="run the app"),
        AIMessage(content="", tool_calls=[{"name": "read_file", "args": {"path": "main.py"}, "id": "1"}]),
        ToolMessage(content="ImportError: No module named db", tool_call_id="1", name="read_file"),
        AIMessage(content="Let's set PYTHONPATH", tool_calls=[{"name": "multi_replace_file_content", "args": {"path": "setup.py"}, "id": "2"}]),
        ToolMessage(content="Success", tool_call_id="2", name="multi_replace_file_content"),
        AIMessage(content="Everything works now!"),
    ]
    
    with patch("agent.llm.get_llm", return_value=mock_llm), \
         patch("agent.memory._embed_memory_document", return_value=[0.2] * 1024) as mock_embed:
         
        async with session_factory() as db:
            await check_and_write_memory(
                db=db,
                project_id=project_id_str,
                user_id=user_id_str,
                task_description="Setup python imports",
                final_messages=messages,
                provider="groq",
                model_name="llama-3.3-70b-versatile",
                api_key="dummy",
            )
            
        async with session_factory() as db:
            # Query the stored memory
            result = await db.execute(select(AgentMemory).where(AgentMemory.project_id == uuid.UUID(project_id_str)))
            memories = result.scalars().all()
            assert len(memories) == 1
            assert memories[0].generalizable_lesson == "Set PYTHONPATH for imports"
            assert memories[0].context_signature["files"] == ["main.py", "setup.py"]
            assert memories[0].context_signature["error_types"] == ["ModuleNotFoundError"]
