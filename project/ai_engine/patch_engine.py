"""
ANTIMATTER — Patch Engine
Step 1: File identification from natural language via RAG
Step 2: Structured JSON patch generation with line-level localization
"""

import json
import difflib
from typing import List, Dict, Tuple, Optional
from groq import Groq
from dotenv import load_dotenv
import os

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))
DEFAULT_MODEL = "llama-3.1-8b-instant"


# ─── STEP 1: FILE IDENTIFICATION ─────────────────────────────────────────────

def identify_target_files(
    task: str,
    rag_chunks: List[Dict],
    available_files: List[str],
    planner_files: List[str],
    model: str = DEFAULT_MODEL,
) -> List[str]:
    """
    Given a natural language task, identify which files need to be modified.
    
    Strategy:
    1. Trust Planner's files_needed if it has high-confidence matches
    2. Use RAG chunk filenames as supporting evidence
    3. Ask LLM to confirm/refine if ambiguous
    
    Returns ordered list of filenames (most relevant first).
    """

    # Build evidence from RAG
    rag_files = []
    seen = set()
    for chunk in rag_chunks:
        fname = chunk["metadata"].get("filename", "")
        if fname and fname not in seen:
            rag_files.append({
                "filename": fname,
                "relevance": chunk.get("relevance", 0),
                "symbol": chunk["metadata"].get("name", ""),
                "preview": chunk["text"][:120],
            })
            seen.add(fname)

    # If planner and RAG agree — high confidence, no LLM call needed
    planner_set = set(planner_files)
    rag_set = set(f["filename"] for f in rag_files[:3])
    overlap = planner_set & rag_set

    if overlap:
        # Return overlap first, then remaining planner files
        ordered = list(overlap) + [f for f in planner_files if f not in overlap]
        return ordered[:3]

    # Ambiguous — ask LLM to decide
    evidence = json.dumps({
        "task": task,
        "planner_suggested": planner_files,
        "rag_retrieved": [
            {"file": f["filename"], "relevance": f["relevance"], "symbol": f["symbol"]}
            for f in rag_files[:5]
        ],
        "all_available": available_files[:20],
    }, indent=2)

    system = """You are a file router for a code editor AI.
Given a task and evidence about which files are relevant, output a JSON array of filenames to modify.
Output ONLY a JSON array of strings. No explanation. No markdown. Example: ["auth.py", "utils.py"]
Order by most relevant first. Maximum 3 files."""

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": evidence},
        ],
        max_tokens=256,
        temperature=0.1,
    )

    raw = response.choices[0].message.content.strip()
    try:
        result = json.loads(raw)
        if isinstance(result, list):
            return [f for f in result if f in available_files][:3]
    except json.JSONDecodeError:
        pass

    # Final fallback: return planner files
    return planner_files[:3]


# ─── STEP 2: STRUCTURED PATCH GENERATION ─────────────────────────────────────

PATCH_SYSTEM_PROMPT = """You are ANTIMATTER's Patch Executor — a surgical code modification engine.

Your ONLY job is to output a JSON patch object. No prose. No explanation outside the JSON.

RULES:
1. Output ONLY valid JSON matching the schema below
2. The "original" field MUST be copied CHARACTER-FOR-CHARACTER from the provided file content
   — same indentation, same whitespace, same everything
3. Keep patches minimal — only change the lines that need changing
4. If a fix requires adding new lines, include them in "replacement"
5. If a fix requires deleting lines, set "replacement" to ""
6. One patch per logical change — do not bundle unrelated fixes
7. "explanation" should be one sentence per patch

OUTPUT SCHEMA:
{
  "file": "filename.py",
  "patches": [
    {
      "original": "exact line(s) from file, copied verbatim",
      "replacement": "the new line(s) to replace with",
      "explanation": "why this change fixes the issue"
    }
  ],
  "summary": "overall description of what was fixed"
}

If the task requires a full rewrite (>60% of file changes), set "full_rewrite": true and include
the complete new file content in "replacement" of a single patch with "original" set to the full file."""


def generate_patches(
    task: str,
    filename: str,
    file_content: str,
    rag_context: str = "",
    model: str = DEFAULT_MODEL,
) -> Dict:
    """
    Ask the LLM to generate a structured JSON patch for the given file.
    Returns parsed patch dict or error dict.
    """

    user_prompt = f"""Task: {task}

File to modify: {filename}
File content:
```
{file_content}
```
{f'Additional context from codebase:{chr(10)}{rag_context}' if rag_context else ''}

Generate the minimal JSON patch to accomplish this task.
Copy original lines EXACTLY as they appear in the file above."""

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": PATCH_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=2048,
        temperature=0.15,
    )

    raw = response.choices[0].message.content.strip()

    # Strip markdown fences if model added them
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

    try:
        patch_data = json.loads(raw)
        return {"success": True, "data": patch_data}
    except json.JSONDecodeError as e:
        return {"success": False, "error": str(e), "raw": raw}


# ─── LINE LOCALIZATION ────────────────────────────────────────────────────────

def localize_patch(
    original_text: str,
    file_content: str,
    fuzzy_threshold: float = 0.15,
) -> Optional[Tuple[int, int]]:
    """
    Given an 'original' string from the LLM patch,
    find its exact start and end line numbers in the file.

    Strategy:
    1. Exact string match (fast, reliable)
    2. Fuzzy match via difflib (fallback for whitespace/minor differences)

    Returns (start_line, end_line) 1-indexed, or None if not found.
    """
    file_lines = file_content.splitlines()
    patch_lines = original_text.splitlines()
    patch_len = len(patch_lines)

    # ── Exact match ──────────────────────────────────────────────────────────
    for i in range(len(file_lines) - patch_len + 1):
        window = file_lines[i: i + patch_len]
        if window == patch_lines:
            return (i + 1, i + patch_len)  # 1-indexed

    # ── Fuzzy match ──────────────────────────────────────────────────────────
    best_score = 0.0
    best_pos = None

    for i in range(len(file_lines) - patch_len + 1):
        window = "\n".join(file_lines[i: i + patch_len])
        score = difflib.SequenceMatcher(None, original_text, window).ratio()
        if score > best_score:
            best_score = score
            best_pos = (i + 1, i + patch_len)

    if best_score >= fuzzy_threshold:
        return best_pos

    # Not found
    return None


def resolve_patches(patch_data: Dict, file_content: str) -> Dict:
    """
    Takes raw LLM patch output and resolves each patch to exact line numbers.
    Returns enriched patch data with line numbers attached.
    Sorts patches bottom-up (highest line first) for safe sequential application.
    """
    resolved = []
    unresolved = []

    for patch in patch_data.get("patches", []):
        original = patch.get("original", "")
        lines = localize_patch(original, file_content)

        if lines:
            resolved.append({
                **patch,
                "start_line": lines[0],
                "end_line": lines[1],
                "located": True,
            })
        else:
            unresolved.append({
                **patch,
                "located": False,
                "error": "Could not locate original text in file",
            })

    # Sort resolved patches bottom-up to prevent line offset drift
    resolved.sort(key=lambda p: p["start_line"], reverse=True)

    return {
        **patch_data,
        "patches": resolved + unresolved,
        "unresolved_count": len(unresolved),
        "resolved_count": len(resolved),
    }


# ─── FULL PIPELINE: TASK → PATCHES ───────────────────────────────────────────

def generate_surgical_patches(
    task: str,
    target_files: List[str],
    file_contents: Dict[str, str],
    rag_context: str = "",
    model: str = DEFAULT_MODEL,
) -> List[Dict]:
    """
    Main entry point.
    For each target file, generate + resolve patches.
    Returns list of resolved patch dicts, one per file.
    """
    results = []

    for filename in target_files:
        content = file_contents.get(filename, "")
        if not content:
            results.append({
                "file": filename,
                "success": False,
                "error": "File content not available",
            })
            continue

        # Generate patches
        patch_result = generate_patches(
            task=task,
            filename=filename,
            file_content=content,
            rag_context=rag_context,
            model=model,
        )

        if not patch_result["success"]:
            results.append({
                "file": filename,
                "success": False,
                "error": patch_result["error"],
                "raw": patch_result.get("raw", ""),
            })
            continue

        # Resolve line numbers
        resolved = resolve_patches(patch_result["data"], content)
        results.append({
            "file": filename,
            "success": True,
            **resolved,
        })

    return results