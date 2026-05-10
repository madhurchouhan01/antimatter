"""
ANTIMATTER — Multi-Agent AI Engine
Agents: Planner → Executor → Oracle (advisory) → Memory Manager
"""

import os
import json
import sqlite3
import datetime
from typing import List, Dict, Optional, Generator
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
DEFAULT_MODEL = "llama-3.3-70b-versatile"

# ─── MEMORY MANAGER (SQLite) ──────────────────────────────────────────────────

class MemoryManager:
    def __init__(self, db_path: str = "./memory/antimatter.db"):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self._init_db()

    def _init_db(self):
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS agent_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task TEXT,
                plan TEXT,
                result TEXT,
                critique TEXT,
                files_involved TEXT,
                model TEXT,
                created_at TEXT
            );

            CREATE TABLE IF NOT EXISTS code_decisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT,
                decision TEXT,
                context TEXT,
                created_at TEXT
            );

            CREATE TABLE IF NOT EXISTS project_patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern_type TEXT,
                description TEXT,
                example TEXT,
                created_at TEXT
            );
        """)
        self.conn.commit()

    def save_run(self, task: str, plan: str, result: str,
                 critique: str, files: List[str], model: str):
        self.conn.execute(
            """INSERT INTO agent_runs
               (task, plan, result, critique, files_involved, model, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (task, plan, result, critique,
             json.dumps(files), model,
             datetime.datetime.now().isoformat())
        )
        self.conn.commit()

    def save_decision(self, filename: str, decision: str, context: str):
        self.conn.execute(
            """INSERT INTO code_decisions
               (filename, decision, context, created_at) VALUES (?, ?, ?, ?)""",
            (filename, decision, context, datetime.datetime.now().isoformat())
        )
        self.conn.commit()

    def get_recent_runs(self, n: int = 5) -> List[Dict]:
        cur = self.conn.execute(
            "SELECT task, plan, result, critique, files_involved, created_at "
            "FROM agent_runs ORDER BY id DESC LIMIT ?", (n,)
        )
        rows = cur.fetchall()
        return [
            {
                "task": r[0], "plan": r[1], "result": r[2],
                "critique": r[3], "files": json.loads(r[4]), "at": r[5]
            }
            for r in rows
        ]

    def get_file_decisions(self, filename: str) -> List[Dict]:
        cur = self.conn.execute(
            "SELECT decision, context, created_at FROM code_decisions "
            "WHERE filename=? ORDER BY id DESC LIMIT 10", (filename,)
        )
        return [{"decision": r[0], "context": r[1], "at": r[2]}
                for r in cur.fetchall()]

    def get_memory_summary(self) -> str:
        runs = self.get_recent_runs(3)
        if not runs:
            return "No previous sessions found."
        lines = ["Recent agent activity:"]
        for r in runs:
            lines.append(f"- Task: {r['task'][:80]} | Files: {', '.join(r['files'])}")
        return "\n".join(lines)

    def stats(self) -> Dict:
        runs = self.conn.execute("SELECT COUNT(*) FROM agent_runs").fetchone()[0]
        decisions = self.conn.execute("SELECT COUNT(*) FROM code_decisions").fetchone()[0]
        return {"total_runs": runs, "total_decisions": decisions}


# ─── BASE AGENT ───────────────────────────────────────────────────────────────

def call_agent(
    system_prompt: str,
    user_prompt: str,
    model: str = DEFAULT_MODEL,
    temperature: float = 0.3,
    stream: bool = False,
):
    """Single agent LLM call. Returns string or generator."""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_prompt},
    ]
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=2048,
        temperature=temperature,
        stream=stream,
    )
    if stream:
        return response
    return response.choices[0].message.content.strip()


# ─── PLANNER AGENT ────────────────────────────────────────────────────────────

def planner_agent(
    task: str,
    open_file: str,
    open_filename: str,
    available_files: List[str],
    memory_summary: str,
    model: str = DEFAULT_MODEL,
) -> Dict:
    """
    Analyzes the task and produces a structured plan.
    Returns JSON with: steps, files_needed, approach, complexity.
    """
    system = """You are the PLANNER agent inside ANTIMATTER, an AI code editor.
Your job is to analyze a developer's task and create a clear execution plan.
You must respond ONLY with valid JSON — no markdown, no explanation outside the JSON.

Your response format:
{
  "understanding": "one sentence: what the developer wants",
  "complexity": "simple | moderate | complex",
  "files_needed": ["list of filenames relevant to this task"],
  "approach": "brief description of the strategy",
  "steps": [
    {"type": "understand", "description": "Analyze the codebase structure"},
    {"type": "execute",    "description": "Refactor the auth module"},
    {"type": "verify",     "description": "Run tests to confirm changes"},
    {"type": "summarize",  "description": "Document what changed"}
  ],
  "warnings": ["any potential issues or risks (can be empty list)"]
}

Step types:
- "understand" : read-only analysis, no code changes
- "execute"    : code changes via patches (FORGE)
- "verify"     : run code in sandbox, check output
- "summarize"  : record results to memory"""

    user = f"""Task: {task}

Open file: {open_filename}
Open file content (first 80 lines):
```
{chr(10).join(open_file.splitlines()[:80]) if open_file else 'none'}
```

All files in project: {json.dumps(available_files)}

Memory from past sessions:
{memory_summary}

Produce the plan JSON."""

    raw = call_agent(system, user, model=model, temperature=0.2)

    # Parse JSON safely
    try:
        clean = raw.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        return json.loads(clean)
    except json.JSONDecodeError:
        # Fallback plan
        return {
            "understanding": task,
            "complexity": "moderate",
            "files_needed": [open_filename] if open_filename else [],
            "approach": "Direct implementation",
            "steps": [
                {"type": "understand", "description": "Analyze the code"},
                {"type": "execute",    "description": "Implement the solution"},
                {"type": "verify",     "description": "Verify correctness"},
                {"type": "summarize",  "description": "Summarize changes"},
            ],
            "warnings": ["Could not parse structured plan — proceeding with direct execution"]
        }


# ─── EXECUTOR AGENT ───────────────────────────────────────────────────────────

def executor_agent(
    task: str,
    plan: Dict,
    open_file: str,
    open_filename: str,
    rag_context: str,
    model: str = DEFAULT_MODEL,
    stream: bool = True,
):
    """
    Implements the solution based on the Planner's plan.
    Streams the response for real-time display.
    """
    steps_str = "\n".join(
        s.get("description", s) if isinstance(s, dict) else s
        for s in plan.get("steps", [])
    )
    warnings_str = "\n".join(plan.get("warnings", [])) or "none"

    system = f"""You are the EXECUTOR agent inside ANTIMATTER, an AI code editor.
You have been given a plan by the Planner agent. Your job is to implement it.

"If the task is a small fix or targeted change (fixing a bug, adding validation, "
"renaming a variable), output ONLY the modified function or class, not the entire file. "
"If the task requires rewriting most of the file, then output the full file. "
"Always start your code block with a comment indicating what was changed and where."

Planner's approach: {plan.get('approach', '')}
Warnings to watch for: {warnings_str}"""

    user = f"""Task: {task}

Execution plan:
{steps_str}

Current file ({open_filename}):
```
{open_file[:6000] if open_file else 'no file open'}
```

Additional codebase context:
{rag_context[:3000] if rag_context else 'none'}

Execute the plan. Write the solution."""

    if stream:
        return call_agent(system, user, model=model, temperature=0.25, stream=True)
    return call_agent(system, user, model=model, temperature=0.25, stream=False)


# ─── ORACLE AGENT ─────────────────────────────────────────────────────────────

def oracle_agent(
    query: str,
    open_file: str,
    open_filename: str,
    rag_context: str,
    model: str = DEFAULT_MODEL,
    use_web_search: bool = False,
    stream: bool = True,
):
    """
    Advisory-only agent for ORACLE mode.
    Reads, explains, warns — never applies code changes.
    Streams response chunks.
    """
    web_hint = (
        " You have broad knowledge of the web and current best practices. "
        "When relevant, reference documentation, CVEs, or ecosystem trends."
        if use_web_search else ""
    )

    system = (
        "You are ORACLE — the intelligence layer inside ANTIMATTER, an AI code editor. "
        "Your role is purely advisory: you read, understand, explain, and warn. "
        "You NEVER apply code patches or suggest direct file modifications — that is FORGE's job. "
        "You CAN show short illustrative snippets to explain a concept, but always prefix them with "
        "'[Example — send to FORGE to apply]'. "
        "Be precise, structured, and actionable. Use markdown headers and bullet points. "
        "When you spot a vulnerability, complexity issue, or bad pattern, state it clearly with severity."
        + web_hint
    )

    user_parts = [f"Query: {query}"]
    if open_filename and open_file:
        user_parts.append(
            f"\nActive file ({open_filename}):\n```\n{open_file[:6000]}\n```"
        )
    if rag_context:
        user_parts.append(f"\nRelated codebase context:\n{rag_context[:3000]}")

    user = "\n".join(user_parts)

    messages = [
        {"role": "system", "content": system},
        {"role": "user",   "content": user},
    ]
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=2048,
        temperature=0.3,
        stream=stream,
    )
    if stream:
        return response
    return response.choices[0].message.content.strip()


# ─── ORCHESTRATOR ─────────────────────────────────────────────────────────────

def run_agent_pipeline(
    task: str,
    open_file: str,
    open_filename: str,
    available_files: List[str],
    rag_context: str,
    memory: MemoryManager,
    model: str = DEFAULT_MODEL,
) -> Generator[str, None, None]:
    """
    Planner → Executor pipeline (used by CORTEX execute steps).
    Yields formatted SSE-style text chunks for streaming to the frontend.
    Each chunk is prefixed with an event type:
      [PLANNER] ...
      [EXECUTOR] ...
      [MEMORY] ...
    """

    # ── PLANNER ──────────────────────────────────────────
    yield "[PLANNER_START]\n"

    memory_summary = memory.get_memory_summary()
    plan = planner_agent(
        task=task,
        open_file=open_file,
        open_filename=open_filename,
        available_files=available_files,
        memory_summary=memory_summary,
        model=model,
    )

    yield f"[PLANNER_RESULT]{json.dumps(plan)}[/PLANNER_RESULT]\n"

    # ── EXECUTOR ─────────────────────────────────────────
    yield "[EXECUTOR_START]\n"

    stream = executor_agent(
        task=task,
        plan=plan,
        open_file=open_file,
        open_filename=open_filename,
        rag_context=rag_context,
        model=model,
        stream=True,
    )

    executor_full = ""
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            executor_full += delta
            yield f"[EXECUTOR_CHUNK]{delta}[/EXECUTOR_CHUNK]"

    yield "\n[EXECUTOR_DONE]\n"

    # ── MEMORY SAVE ──────────────────────────────────────
    memory.save_run(
        task=task,
        plan=json.dumps(plan),
        result=executor_full[:500],
        critique="",
        files=plan.get("files_needed", [open_filename]),
        model=model,
    )

    if open_filename:
        memory.save_decision(
            filename=open_filename,
            decision=plan.get("approach", task),
            context=task,
        )

    yield "[MEMORY_SAVED]\n"
    yield "[PIPELINE_DONE]\n"