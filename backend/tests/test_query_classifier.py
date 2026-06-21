import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from agent.graph import (
    check_fast_path,
    build_graph,
)

def test_check_fast_path():
    # Fast-path for slash commands
    assert check_fast_path("/explain codebase") == "coding"
    assert check_fast_path("  /refactor file.py ") == "coding"
    
    # Fast-path for code blocks
    assert check_fast_path("here is some code:\n```python\nprint('hello')\n```") == "coding"
    
    # Fast-path for file extensions
    assert check_fast_path("Check out index.js for details") == "coding"
    assert check_fast_path("Can you fix test_agents.py?") == "coding"
    assert check_fast_path("Look at config.yml") == "coding"
    
    # Fast-path for path separators
    assert check_fast_path("look in src/components/ChatPanel") == "coding"
    assert check_fast_path("go to backend\\agent\\graph.py") == "coding"
    
    # Non-fast-path queries
    assert check_fast_path("Hello how are you?") is None
    assert check_fast_path("Draw a flowchart for authentication flow") is None
    assert check_fast_path("What is the recipe for chocolate cake?") is None

@pytest.mark.asyncio
async def test_classifier_node_routing():
    with patch("agent.graph.make_tools", return_value=[]), \
         patch("agent.graph.get_llm") as mock_get_llm:
        
        mock_llm = AsyncMock()
        mock_get_llm.return_value = mock_llm
        
        # Test 1: Bypassed by fast-path
        graph = build_graph("p", "u")
        classifier = graph.builder.nodes["classifier"].runnable
        
        state = {
            "messages": [HumanMessage(content="/explain codebase")],
            "memory_context": "",
            "diagram_markdown": "",
            "validation_errors": "",
            "validation_retries": 0,
            "needs_diagram": False
        }
        res = await classifier.ainvoke(state)
        assert res["route"] == "coding"
        mock_llm.ainvoke.assert_not_called()
        
        # Test 2: LLM classification for chat
        mock_response = MagicMock()
        mock_response.content = "general_chat"
        mock_llm.ainvoke.return_value = mock_response
        
        state_chat = {
            "messages": [HumanMessage(content="Hello assistant, who are you?")],
            "memory_context": "",
            "diagram_markdown": "",
            "validation_errors": "",
            "validation_retries": 0,
            "needs_diagram": False
        }
        res_chat = await classifier.ainvoke(state_chat)
        assert res_chat["route"] == "general_chat"
        mock_llm.ainvoke.assert_called_once()

@pytest.mark.asyncio
async def test_general_chat_node():
    with patch("agent.graph.make_tools", return_value=[]), \
         patch("agent.graph.get_llm") as mock_get_llm:
        
        mock_llm = AsyncMock()
        mock_get_llm.return_value = mock_llm
        
        mock_response = AIMessage(content="I am a helpful assistant.")
        mock_llm.ainvoke.return_value = mock_response
        
        graph = build_graph("p", "u")
        chat_node = graph.builder.nodes["general_chat"].runnable
        
        # HumanMessage with enriched codebase context should be cleaned
        state = {
            "messages": [
                HumanMessage(content="<codebase_context>\nSome context\n</codebase_context>\n\nWhat is Python?")
            ],
            "memory_context": "",
            "diagram_markdown": "",
            "validation_errors": "",
            "validation_retries": 0,
            "needs_diagram": False
        }
        
        res = await chat_node.ainvoke(state)
        assert len(res["messages"]) == 1
        assert isinstance(res["messages"][0], AIMessage)
        assert res["messages"][0].content == "I am a helpful assistant."
        
        # Verify the context is stripped before invoking LLM
        called_args = mock_llm.ainvoke.call_args[0][0]
        assert len(called_args) == 2
        assert isinstance(called_args[0], SystemMessage)
        assert isinstance(called_args[1], HumanMessage)
        assert called_args[1].content == "What is Python?"

@pytest.mark.asyncio
async def test_off_topic_node():
    with patch("agent.graph.make_tools", return_value=[]), \
         patch("agent.graph.get_llm"):
        
        mock_emit = AsyncMock()
        graph = build_graph("p", "u", emit_fn=mock_emit)
        off_topic = graph.builder.nodes["off_topic"].runnable
        
        state = {
            "messages": [HumanMessage(content="What is the weather like?")],
            "memory_context": "",
            "diagram_markdown": "",
            "validation_errors": "",
            "validation_retries": 0,
            "needs_diagram": False
        }
        
        res = await off_topic.ainvoke(state)
        assert len(res["messages"]) == 1
        assert "dedicated coding assistant" in res["messages"][0].content
        
        # Verify it streamed the rejection tokens
        assert mock_emit.call_count > 0
        streamed_text = "".join([call[0][0]["content"] for call in mock_emit.call_args_list])
        for word in ["dedicated", "coding", "assistant"]:
            assert word in streamed_text
