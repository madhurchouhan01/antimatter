from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage
from typing import TypedDict, Annotated
import operator
import os
import re
import json
import asyncio
from agent.llm import get_llm
from agent.tools import make_tools
from services.file_service import FileService
from sandbox.manager import sandbox_manager
from core.logger import get_logger

log = get_logger(__name__)

SYSTEM_PROMPT = """You are an expert AI coding assistant embedded in a code editor.
You have access to the user's project workspace through these tools:
{TOOLS_LIST}

Rules:
- Prioritize taking action (using tools to read, create, or update files) rather than just showing code blocks in the chat window. If you think a task should be done in code, do that (creating, updating, and reading a file)!
- Always read a file before editing it unless you're creating it from scratch.
- write_file, replace_file_content, and multi_replace_file_content propose a diff — the user must accept it before you can assume it was written.
- Never propose multiple diffs at once. Propose one file at a time.
- Keep responses concise. Show code in markdown fences.
- Never run destructive commands (rm -rf, drop database, etc.) without explicit user confirmation.
- If a task will take multiple tool calls, narrate your plan first.
- ONLY use your provided tools using standard JSON function calling. Do not output raw function tags like <function(write_file)>.
"""

DIAGRAM_GENERATOR_PROMPT = """You are a Mermaid Diagram Generator Agent.
Your single responsibility is to generate a valid Mermaid diagram based on the coding task, codebase context, and conversation history.

Rules:
1. Output ONLY the raw Mermaid diagram code inside a single ```mermaid code block. No explanations or prose outside the block.
2. ALWAYS use valid Mermaid syntax:
   - Node labels MUST be quoted with double-quotes if they contain ANY of: parentheses (), brackets [], commas, angle brackets <>, slashes, colons, or other special characters.
     WRONG:  A[sum_numbers(a, b)]
     CORRECT: A[\"sum_numbers(a, b)\"]
   - Use standard diagram types: `flowchart TD`, `flowchart LR`, `sequenceDiagram`, `classDiagram`, `stateDiagram-v2`, `erDiagram`, `gantt`.
   - Do NOT use `graph TD` — use `flowchart TD` instead.
3. If given a validation error, study it carefully and fix the exact syntax error indicated.
"""


# ---------------------------------------------------------------------------
# Mermaid label sanitizer
# ---------------------------------------------------------------------------

# Match rectangular-bracket node labels that are NOT already quoted.
# (?!") is a negative lookahead: skips labels that start with a double-quote.
# This prevents the sanitizer from corrupting already-correct syntax like
#   A["sum_numbers(a, b)"]
_UNQUOTED_RECT_LABEL_RE = re.compile(
    r'(\b\w+)\[(?!")([^\]]+)\]'
)

_SPECIAL_CHARS = set('(),<>:/\\')

def sanitize_mermaid_labels(code: str) -> str:
    """
    Auto-quote unquoted Mermaid rectangular-bracket node labels that contain
    characters which would cause a parse error (parentheses, commas, etc.).

    Only processes labels that are NOT already double-quoted, so valid syntax
    like  A["sum_numbers(a, b)"]  is left completely untouched.

    Example:
        A[sum_numbers(a, b)]   →   A["sum_numbers(a, b)"]
        A["already quoted"]    →   A["already quoted"]  (unchanged)
    """
    def _maybe_quote(m: re.Match) -> str:
        node_id = m.group(1)
        label   = m.group(2)
        # Only add quotes if the label actually contains special chars
        if any(c in label for c in _SPECIAL_CHARS):
            clean = label.replace('"', '')   # strip any stray inner quotes
            return f'{node_id}["{clean}"]'
        return m.group(0)   # no special chars → leave as-is

    result = []
    for line in code.splitlines():
        stripped = line.lstrip()
        # Skip directive / comment / header lines (no node definitions here)
        if stripped.startswith('%%') or stripped.startswith('graph') or stripped.startswith('flowchart'):
            result.append(line)
            continue
        result.append(_UNQUOTED_RECT_LABEL_RE.sub(_maybe_quote, line))
    return "\n".join(result)

class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], operator.add]
    memory_context: str  # injected before graph run; default ""
    diagram_markdown: str
    validation_errors: str
    validation_retries: int
    needs_diagram: bool
    route: str  # New key for classification route

async def validate_mermaid_diagram(project_id: str, user_id: str, code: str) -> dict:
    fs = FileService(project_id, user_id)
    # Read the asset file from the API container
    asset_path = "/app/agent/assets/validate_mermaid.js"
    if not os.path.exists(asset_path):
        asset_path = os.path.join(os.path.dirname(__file__), "assets", "validate_mermaid.js")
    
    with open(asset_path, "rb") as f:
        bundle_content = f.read()
    
    # Write the bundle to the sandbox workspace as .validate_mermaid.js
    await fs.write_bytes(".validate_mermaid.js", bundle_content)
    
    # Write the diagram code to a temp file in the sandbox
    await fs.write(".temp_diagram.mmd", code)
    
    # Run the validator using node in the sandbox
    sandbox = await sandbox_manager.get_or_create(project_id, user_id)
    sandbox.touch()
    
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: sandbox.exec_run(
            ["/bin/bash", "-c", "node .validate_mermaid.js < .temp_diagram.mmd"],
            workdir="/workspace",
            demux=True,
        ),
    )
    
    # Clean up temp diagram file
    try:
        await fs.delete(".temp_diagram.mmd")
    except Exception:
        pass
        
    stdout, stderr = result.output
    output = ""
    if stdout:
        output += stdout.decode("utf-8", errors="replace")
    if stderr:
        output += stderr.decode("utf-8", errors="replace")
        
    try:
        data = json.loads(output.strip())
        if not isinstance(data, dict):
            match = re.search(r'\{.*\}', output)
            if match:
                data = json.loads(match.group(0))
            else:
                raise ValueError("No JSON object found")
        return data
    except Exception as e:
        return {"valid": False, "error": f"Failed to parse validator output: {output}. Error: {e}"}

def check_fast_path(text: str) -> str | None:
    text_stripped = text.strip()
    if text_stripped.startswith("/"):
        return "coding"
    if "```" in text_stripped:
        return "coding"
    
    # Check for file paths: e.g. *.py, etc.
    file_extensions = r'\.(py|js|ts|tsx|jsx|html|css|md|txt|json|sh|yml|yaml|ini|cfg|db|sql|mdx|svg|png|jpg|jpeg|gif)\b'
    if re.search(file_extensions, text, re.IGNORECASE):
        return "coding"
    
    # Also check if it looks like a path with slashes
    if "/" in text_stripped or "\\" in text_stripped:
        path_pattern = r'(\w+[\/\\]\w+)'
        if re.search(path_pattern, text_stripped):
            return "coding"
            
    return None

def build_graph(
    project_id: str,
    user_id: str,
    emit_fn=None,
    model_name: str = "llama-3.3-70b-versatile",
    provider: str = "groq",
    api_key: str | None = None,
    ollama_base_url: str | None = None,
):
    tools = make_tools(project_id, user_id, emit_fn=emit_fn)
    llm = get_llm(provider=provider, model_name=model_name, api_key=api_key, ollama_base_url=ollama_base_url).bind_tools(tools)
    generator_llm = get_llm(provider=provider, model_name=model_name, api_key=api_key, ollama_base_url=ollama_base_url)

    async def classifier_node(state: AgentState):
        messages = state["messages"]
        last_human = None
        for m in reversed(messages):
            if isinstance(m, HumanMessage):
                last_human = m.content
                break
        
        if not last_human:
            return {"route": "coding"}
            
        fast_route = check_fast_path(last_human)
        if fast_route:
            log.info(f"Classifier skipped (fast-path): {fast_route}")
            return {"route": fast_route}
            
        prompt = """You are a query classifier. Categorize the user's message into one of these 5 categories:
- 'coding': A request to write, refactor, fix, or debug code, run terminal commands, run tests, or install packages.
- 'diagram': A request to generate, draw, or visualize a flowchart, architecture, sequence diagram, or Mermaid diagram.
- 'codebase_question': A question asking about the architecture, files, functions, classes, or how things work in this codebase.
- 'general_chat': A general question, greeting, or conversational query (e.g., greetings, how are you, general programming questions unrelated to this codebase).
- 'off_topic': A query that is completely unrelated to programming, coding, software development, or the codebase (e.g., food recipes, history, sports, politics, etc.).

Respond with EXACTLY one of these words: coding, diagram, codebase_question, general_chat, off_topic.
Do not output anything else. No explanation, no markdown formatting. Just the category name."""

        response = await generator_llm.ainvoke([
            SystemMessage(content=prompt),
            HumanMessage(content=last_human)
        ])
        
        classification = response.content.strip().lower()
        classification = re.sub(r'[^a-z_]', '', classification)
        
        valid_routes = {"coding", "diagram", "codebase_question", "general_chat", "off_topic"}
        if classification not in valid_routes:
            classification = "coding"
            
        log.info(f"Classifier result: {classification} (input: {last_human[:60]})")
        return {"route": classification}

    async def general_chat_node(state: AgentState):
        messages = state["messages"]
        prompt = "You are a helpful programming assistant. Answer the user's query directly and concisely."
        system_msg = SystemMessage(content=prompt)
        
        cleaned_messages = []
        for m in messages:
            if isinstance(m, SystemMessage):
                continue
            if isinstance(m, HumanMessage) and "<codebase_context>" in m.content:
                content = re.sub(r'<codebase_context>.*?</codebase_context>\n\n', '', m.content, flags=re.DOTALL)
                cleaned_messages.append(HumanMessage(content=content))
            else:
                cleaned_messages.append(m)
                
        llm_messages = [system_msg] + cleaned_messages
        response = await generator_llm.ainvoke(llm_messages)
        return {"messages": [response]}

    async def off_topic_node(state: AgentState):
        rejection_text = "I am a dedicated coding assistant and can only help with software development, programming, and codebase-related tasks. Please ask a coding or codebase question!"
        
        if emit_fn:
            import random
            words = rejection_text.split(" ")
            shuffled_words = words.copy()
            random.shuffle(shuffled_words)
            for i, word in enumerate(shuffled_words):
                # Exponential wait before changing the word
                delay = 0.02 * (1.1 ** i)
                await asyncio.sleep(delay)
                space = " " if i > 0 else ""
                await emit_fn({"type": "token", "content": space + word})
                
        rejection_msg = AIMessage(content=rejection_text)
        return {"messages": [rejection_msg]}

    def agent_node(state: AgentState):
        messages = state["messages"]
        if not any(isinstance(m, SystemMessage) for m in messages):
            tools_desc = "\n".join([f"- {t.name}: {t.description}" for t in tools])
            prompt = SYSTEM_PROMPT.replace("{TOOLS_LIST}", tools_desc)
            memory_context = state.get("memory_context", "")
            if memory_context:
                prompt += f"\n\n## Relevant Past Experience\n{memory_context}"
            messages = [SystemMessage(content=prompt)] + messages
        response = llm.invoke(messages)
        return {"messages": [response]}

    async def diagram_generator_node(state: AgentState):
        messages = state["messages"]
        validation_errors = state.get("validation_errors", "")
        validation_retries = state.get("validation_retries", 0)
        diagram_markdown = state.get("diagram_markdown", "")

        prompt = DIAGRAM_GENERATOR_PROMPT
        if validation_errors:
            prompt += f"\n\n### Previous Attempt Error:\n{validation_errors}\n\n### Previous Attempt Diagram:\n{diagram_markdown}\n\nPlease correct the syntax error above and output the fully corrected diagram."

        system_msg = SystemMessage(content=prompt)
        cleaned_messages = [m for m in messages if not isinstance(m, SystemMessage)]
        llm_messages = [system_msg] + cleaned_messages
        
        response = await generator_llm.ainvoke(llm_messages)
        content = response.content if isinstance(response.content, str) else str(response.content)

        mermaid_match = re.search(r'```mermaid\s*(.*?)\s*```', content, re.DOTALL)
        if mermaid_match:
            diagram = mermaid_match.group(1).strip()
        else:
            diagram = content.strip()
            diagram = diagram.replace("```mermaid", "").replace("```", "").strip()

        # Auto-fix common label syntax errors before the validator sees the diagram
        diagram = sanitize_mermaid_labels(diagram)

        state_messages = []
        if state.get("route") == "diagram":
            state_messages = [AIMessage(content="Here is the diagram visualization based on your request:")]

        return {
            "diagram_markdown": diagram,
            "validation_retries": validation_retries,
            "messages": state_messages
        }

    async def diagram_validator_node(state: AgentState):
        diagram = state.get("diagram_markdown", "")
        retries = state.get("validation_retries", 0)
        
        if not diagram:
            return {
                "validation_errors": "No diagram found to validate.",
                "validation_retries": retries + 1
            }

        try:
            res = await validate_mermaid_diagram(project_id, user_id, diagram)
            if res.get("valid"):
                return {
                    "validation_errors": "",
                    "validation_retries": retries
                }
            else:
                return {
                    "validation_errors": res.get("error", "Unknown validation error"),
                    "validation_retries": retries + 1
                }
        except Exception as e:
            return {
                "validation_errors": f"Validator execution error: {str(e)}",
                "validation_retries": retries + 1
            }

    def should_generate_diagram(state: AgentState) -> bool:
        if state.get("needs_diagram"):
            return True

        last_human = None
        for m in reversed(state["messages"]):
            if isinstance(m, HumanMessage):
                last_human = m.content
                break
        
        if last_human:
            lh_lower = last_human.lower()
            if any(word in lh_lower for word in ["diagram", "flowchart", "mermaid", "visualize", "draw"]):
                return True

        last_ai = None
        for m in reversed(state["messages"]):
            if isinstance(m, AIMessage):
                last_ai = m.content
                break
                
        if last_ai:
            if "```mermaid" in last_ai:
                return True

        return False

    def should_continue(state: AgentState):
        last = state["messages"][-1]
        if hasattr(last, "tool_calls") and last.tool_calls:
            return "tools"
        
        if should_generate_diagram(state):
            return "diagram_generator"
        return END

    def check_validation(state: AgentState):
        errors = state.get("validation_errors", "")
        retries = state.get("validation_retries", 0)

        if not errors:
            return END

        if retries < 3:
            return "diagram_generator"

        # Max retries hit — clear errors so runner.py will still emit the best
        # diagram we managed to produce rather than suppressing it entirely.
        log.warning(f"Mermaid validation failed after {retries} retries. Emitting best-effort diagram. Error: {errors}")
        state["validation_errors"] = ""
        return END

    tool_node = ToolNode(tools)

    def route_from_classifier(state: AgentState):
        route = state.get("route", "coding")
        if route in ("coding", "codebase_question"):
            return "agent"
        elif route == "diagram":
            return "diagram_generator"
        elif route == "general_chat":
            return "general_chat"
        elif route == "off_topic":
            return "off_topic"
        return "agent"

    graph = StateGraph(AgentState)
    graph.add_node("classifier", classifier_node)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tool_node)
    graph.add_node("diagram_generator", diagram_generator_node)
    graph.add_node("diagram_validator", diagram_validator_node)
    graph.add_node("general_chat", general_chat_node)
    graph.add_node("off_topic", off_topic_node)
    
    graph.set_entry_point("classifier")
    graph.add_conditional_edges("classifier", route_from_classifier)
    graph.add_conditional_edges("agent", should_continue)
    graph.add_edge("tools", "agent")
    graph.add_edge("diagram_generator", "diagram_validator")
    graph.add_conditional_edges("diagram_validator", check_validation)
    graph.add_edge("general_chat", END)
    graph.add_edge("off_topic", END)

    return graph.compile()