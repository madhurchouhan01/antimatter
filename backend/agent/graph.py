from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from typing import TypedDict, Annotated
from langchain_core.messages import BaseMessage
import operator
from agent.llm import get_llm
from agent.tools import make_tools

SYSTEM_PROMPT = """You are an expert AI coding assistant embedded in a code editor.
You have access to the user's project workspace through these tools:
- read_file: read any file
- write_file: create or overwrite any file
- list_files: browse the directory tree
- run_command: execute shell commands (npm install, python script.py, git status, etc.)

Rules:
- Always read a file before editing it unless you're creating it from scratch.
- After writing a file, confirm by reading it back if the user asks to verify.
- Keep responses concise. Show code in markdown fences.
- Never run destructive commands (rm -rf, drop database, etc.) without explicit user confirmation.
- If a task will take multiple tool calls, narrate your plan first.
"""

class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], operator.add]

def build_graph(project_id: str, user_id: str):
    tools = make_tools(project_id, user_id)
    llm = get_llm().bind_tools(tools)

    def agent_node(state: AgentState):
        messages = state["messages"]
        if not any(isinstance(m, SystemMessage) for m in messages):
            messages = [SystemMessage(content=SYSTEM_PROMPT)] + messages
        from pprint import pprint
        pprint(messages)
        
        response = llm.invoke(messages)
        return {"messages": [response]}

    def should_continue(state: AgentState):
        last = state["messages"][-1]
        if hasattr(last, "tool_calls") and last.tool_calls:
            return "tools"
        return END

    tool_node = ToolNode(tools)

    graph = StateGraph(AgentState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tool_node)
    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", should_continue)
    graph.add_edge("tools", "agent")

    return graph.compile()