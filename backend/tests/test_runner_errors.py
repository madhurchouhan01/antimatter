import pytest
import uuid
from unittest.mock import patch, AsyncMock, MagicMock
from agent.runner import run_agent_streaming
from db.models import Project, Conversation

@pytest.mark.asyncio
async def test_run_agent_streaming_token_limit_error():
    # Mock parameters
    project = MagicMock(spec=Project)
    project.id = uuid.uuid4()
    project.owner_id = uuid.uuid4()
    
    conversation_id = uuid.uuid4()
    
    mock_db = AsyncMock()
    # Mock load_history & get_or_create_conversation
    mock_conv = MagicMock(spec=Conversation)
    mock_conv.id = conversation_id
    
    # Send json collector
    sent_messages = []
    async def mock_send_json(data):
        sent_messages.append(data)

    # Mock build_graph to throw an exception resembling OpenRouter token limit
    exc_message = "openai.APIStatusError: Error code: 402 - {'error': {'message': 'Prompt tokens limit exceeded: 3586 > 1197. To increase, visit https://openrouter.ai/settings/credits'}}"
    
    with patch("agent.runner.get_or_create_conversation", new_callable=AsyncMock, return_value=mock_conv), \
         patch("agent.runner.load_history", new_callable=AsyncMock, return_value=[]), \
         patch("agent.runner.build_rag_context", new_callable=AsyncMock, return_value=""), \
         patch("agent.runner.build_graph") as mock_build_graph:
         
        mock_build_graph.side_effect = Exception(exc_message)
        
        await run_agent_streaming(
            user_message="Hello standard query",
            project=project,
            conversation_id=conversation_id,
            db=mock_db,
            send_json=mock_send_json
        )
        
        # Verify socket messages sent
        assert len(sent_messages) > 0
        error_event = next((msg for msg in sent_messages if msg.get("type") == "error"), None)
        assert error_event is not None
        assert error_event["error_type"] == "token_limit"
        assert "context limit was exceeded" in error_event["message"]

@pytest.mark.asyncio
async def test_run_agent_streaming_rate_limit_error():
    project = MagicMock(spec=Project)
    project.id = uuid.uuid4()
    project.owner_id = uuid.uuid4()
    
    mock_db = AsyncMock()
    mock_conv = MagicMock(spec=Conversation)
    mock_conv.id = uuid.uuid4()
    
    sent_messages = []
    async def mock_send_json(data):
        sent_messages.append(data)

    exc_message = "Rate limit hit: 429 too many requests"
    
    with patch("agent.runner.get_or_create_conversation", new_callable=AsyncMock, return_value=mock_conv), \
         patch("agent.runner.load_history", new_callable=AsyncMock, return_value=[]), \
         patch("agent.runner.build_rag_context", new_callable=AsyncMock, return_value=""), \
         patch("agent.runner.build_graph") as mock_build_graph:
         
        mock_build_graph.side_effect = Exception(exc_message)
        
        await run_agent_streaming(
            user_message="Hello standard query",
            project=project,
            conversation_id=mock_conv.id,
            db=mock_db,
            send_json=mock_send_json
        )
        
        assert len(sent_messages) > 0
        error_event = next((msg for msg in sent_messages if msg.get("type") == "error"), None)
        assert error_event is not None
        assert error_event["error_type"] == "rate_limit"
        assert "exhausted your rate limits" in error_event["message"]
