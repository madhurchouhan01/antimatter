import pytest
from unittest.mock import patch, AsyncMock, MagicMock, mock_open
from langchain_core.messages import HumanMessage, AIMessage
from agent.graph import (
    validate_mermaid_diagram,
    build_graph,
    AgentState,
)

@pytest.mark.asyncio
async def test_validate_mermaid_diagram_success():
    project_id = "test-proj"
    user_id = "test-user"
    code = "graph TD\n  A --> B"

    # Mock FileService
    mock_fs = MagicMock()
    mock_fs.write_bytes = AsyncMock()
    mock_fs.write = AsyncMock()
    mock_fs.delete = AsyncMock()

    # Mock Sandbox and SandboxManager
    mock_sandbox = MagicMock()
    mock_result = MagicMock()
    mock_result.output = (b'{"valid": true}', b'')
    
    # exec_run returns the mock result
    mock_sandbox.exec_run = MagicMock(return_value=mock_result)
    mock_sandbox.touch = MagicMock()

    with patch("agent.graph.FileService", return_value=mock_fs), \
         patch("agent.graph.sandbox_manager.get_or_create", new_callable=AsyncMock) as mock_get_or_create, \
         patch("builtins.open", mock_open(read_data=b"console.log('dummy bundle')")):
         
        mock_get_or_create.return_value = mock_sandbox

        res = await validate_mermaid_diagram(project_id, user_id, code)
        assert res.get("valid") is True
        
        # Verify it wrote bundle, wrote temp diagram, ran node, and deleted temp diagram
        mock_fs.write_bytes.assert_called_once_with(".validate_mermaid.js", b"console.log('dummy bundle')")
        mock_fs.write.assert_called_once_with(".temp_diagram.mmd", code)
        mock_sandbox.exec_run.assert_called_once()
        mock_fs.delete.assert_called_once_with(".temp_diagram.mmd")

@pytest.mark.asyncio
async def test_validate_mermaid_diagram_failure():
    project_id = "test-proj"
    user_id = "test-user"
    code = "graph TD\n  A -->"

    mock_fs = MagicMock()
    mock_fs.write_bytes = AsyncMock()
    mock_fs.write = AsyncMock()
    mock_fs.delete = AsyncMock()

    mock_sandbox = MagicMock()
    mock_result = MagicMock()
    mock_result.output = (b'{"valid": false, "error": "Parse error"}', b'')
    mock_sandbox.exec_run = MagicMock(return_value=mock_result)
    mock_sandbox.touch = MagicMock()

    with patch("agent.graph.FileService", return_value=mock_fs), \
         patch("agent.graph.sandbox_manager.get_or_create", new_callable=AsyncMock) as mock_get_or_create, \
         patch("builtins.open", mock_open(read_data=b"dummy")):
         
        mock_get_or_create.return_value = mock_sandbox

        res = await validate_mermaid_diagram(project_id, user_id, code)
        assert res.get("valid") is False
        assert "Parse error" in res.get("error")

def test_should_generate_diagram_and_validation_routing():
    # Test should_generate_diagram logic by compiling the graph and calling the inner helpers
    # We can inspect the compiled graph's conditional routing or construct a dummy state
    from agent.graph import build_graph
    
    with patch("agent.graph.make_tools") as mock_make_tools, \
         patch("agent.graph.get_llm") as mock_get_llm:
        
        mock_make_tools.return_value = []
        mock_llm = MagicMock()
        mock_get_llm.return_value = mock_llm
        
        compiled = build_graph("p", "u")
        # Assert that diagram nodes are in the compiled graph builder
        assert "diagram_generator" in compiled.builder.nodes
        assert "diagram_validator" in compiled.builder.nodes

@pytest.mark.asyncio
async def test_diagram_generator_node_execution():
    from agent.graph import build_graph
    
    with patch("agent.graph.make_tools") as mock_make_tools, \
         patch("agent.graph.get_llm") as mock_get_llm:
        
        mock_make_tools.return_value = []
        
        mock_llm_inst = AsyncMock()
        mock_get_llm.return_value = mock_llm_inst
        
        mock_response = MagicMock()
        mock_response.content = "Here is the diagram:\n```mermaid\ngraph TD\n  A --> B\n```"
        mock_llm_inst.ainvoke.return_value = mock_response

        # Compile graph
        graph = build_graph("p", "u", model_name="test-model", provider="test-provider")
        
        # Get the diagram_generator node function
        gen_node = graph.builder.nodes["diagram_generator"].runnable
        
        state = {
            "messages": [HumanMessage(content="Draw a diagram")],
            "memory_context": "",
            "diagram_markdown": "",
            "validation_errors": "",
            "validation_retries": 0,
            "needs_diagram": True
        }
        
        res = await gen_node.ainvoke(state)
        assert res["diagram_markdown"] == "graph TD\n  A --> B"
        assert res["validation_retries"] == 0

@pytest.mark.asyncio
async def test_diagram_generator_correction_loop():
    from agent.graph import build_graph
    
    with patch("agent.graph.make_tools") as mock_make_tools, \
         patch("agent.graph.get_llm") as mock_get_llm:
        
        mock_make_tools.return_value = []
        
        mock_llm_inst = AsyncMock()
        mock_get_llm.return_value = mock_llm_inst
        
        mock_response = MagicMock()
        mock_response.content = "```mermaid\ngraph TD\n  A --> B\n```"
        mock_llm_inst.ainvoke.return_value = mock_response

        graph = build_graph("p", "u")
        gen_node = graph.builder.nodes["diagram_generator"].runnable
        
        # Pass a validation error to verify correction prompt addition
        state = {
            "messages": [HumanMessage(content="Draw diagram")],
            "memory_context": "",
            "diagram_markdown": "graph TD\n  A -->",
            "validation_errors": "Parse error expecting EOF",
            "validation_retries": 1,
            "needs_diagram": True
        }
        
        res = await gen_node.ainvoke(state)
        assert res["diagram_markdown"] == "graph TD\n  A --> B"
        # Node must preserve retry count
        assert res["validation_retries"] == 1
