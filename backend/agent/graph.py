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
{TOOLS_LIST}

Rules:
- Always read a file before editing it unless you're creating it from scratch.
- write_file, replace_file_content, and multi_replace_file_content propose a diff — the user must accept it before you can assume it was written.
- Never propose multiple diffs at once. Propose one file at a time.
- Keep responses concise. Show code in markdown fences.
- Never run destructive commands (rm -rf, drop database, etc.) without explicit user confirmation.
- If a task will take multiple tool calls, narrate your plan first.
- ONLY use your provided tools using standard JSON function calling. Do not output raw function tags like <function(write_file)>.
"""

class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], operator.add]

def build_graph(
    project_id: str,
    user_id: str,
    emit_fn=None,
    model_name: str = "llama-3.3-70b-versatile",
    provider: str = "groq",
    api_key: str | None = None,
):
    tools = make_tools(project_id, user_id, emit_fn=emit_fn)
    llm = get_llm(provider=provider, model_name=model_name, api_key=api_key).bind_tools(tools)

    def agent_node(state: AgentState):
        messages = state["messages"]
        if not any(isinstance(m, SystemMessage) for m in messages):
            tools_desc = "\n".join([f"- {t.name}: {t.description}" for t in tools])
            prompt = SYSTEM_PROMPT.replace("{TOOLS_LIST}", tools_desc)
            messages = [SystemMessage(content=prompt)] + messages
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