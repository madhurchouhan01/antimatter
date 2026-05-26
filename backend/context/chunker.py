from pathlib import Path
from dataclasses import dataclass
from tree_sitter import Language, Parser
import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript
import tree_sitter_typescript as tstypescript

@dataclass
class Chunk:
    file_path: str
    content: str
    start_line: int
    end_line: int
    language: str
    chunk_type: str   # function | class | module | block

# Build language objects once
PY_LANGUAGE  = Language(tspython.language())
JS_LANGUAGE  = Language(tsjavascript.language())
TS_LANGUAGE  = Language(tstypescript.language_typescript())
TSX_LANGUAGE = Language(tstypescript.language_tsx())

LANGUAGE_MAP = {
    ".py":  ("python",     PY_LANGUAGE),
    ".js":  ("javascript", JS_LANGUAGE),
    ".jsx": ("javascript", JS_LANGUAGE),
    ".ts":  ("typescript", TS_LANGUAGE),
    ".tsx": ("typescript", TSX_LANGUAGE),
}

# Node types that represent meaningful code units per language
CHUNK_NODE_TYPES = {
    "python": {
        "function_definition":       "function",
        "async_function_definition": "function",
        "class_definition":          "class",
        "decorated_definition":      "function",
    },
    "javascript": {
        "function_declaration":         "function",
        "arrow_function":               "function",
        "method_definition":            "function",
        "class_declaration":            "class",
        "export_statement":             "function",
        "lexical_declaration":          "block",
    },
    "typescript": {
        "function_declaration":         "function",
        "arrow_function":               "function",
        "method_definition":            "function",
        "class_declaration":            "class",
        "interface_declaration":        "class",
        "type_alias_declaration":       "block",
        "export_statement":             "function",
    },
}

MAX_CHUNK_LINES = 80    # split oversized nodes into windows
OVERLAP_LINES   = 10    # overlap between windows for context continuity

def _split_large_chunk(chunk: Chunk) -> list[Chunk]:
    """Split chunks exceeding MAX_CHUNK_LINES into overlapping windows."""
    lines = chunk.content.splitlines()
    if len(lines) <= MAX_CHUNK_LINES:
        return [chunk]

    result = []
    step   = MAX_CHUNK_LINES - OVERLAP_LINES
    for i in range(0, len(lines), step):
        window = lines[i:i + MAX_CHUNK_LINES]
        result.append(Chunk(
            file_path  = chunk.file_path,
            content    = "\n".join(window),
            start_line = chunk.start_line + i,
            end_line   = chunk.start_line + i + len(window),
            language   = chunk.language,
            chunk_type = chunk.chunk_type,
        ))
    return result

def chunk_file(file_path: str, content: str) -> list[Chunk]:
    """
    Parse a file with Tree-sitter and extract chunks at
    function/class boundaries. Falls back to line-window
    chunking for unsupported file types.
    """
    ext = Path(file_path).suffix.lower()

    if ext not in LANGUAGE_MAP:
        return _fallback_chunk(file_path, content)

    language_name, ts_language = LANGUAGE_MAP[ext]
    node_types = CHUNK_NODE_TYPES[language_name]

    parser = Parser(ts_language)
    tree   = parser.parse(content.encode("utf-8"))
    lines  = content.splitlines()

    chunks = []
    visited_ranges = set()

    def visit(node):
        if node.type in node_types:
            start = node.start_point[0]
            end   = node.end_point[0]
            key   = (start, end)

            if key not in visited_ranges:
                visited_ranges.add(key)
                chunk_content = "\n".join(lines[start:end + 1])
                chunk = Chunk(
                    file_path  = file_path,
                    content    = chunk_content,
                    start_line = start,
                    end_line   = end,
                    language   = language_name,
                    chunk_type = node_types[node.type],
                )
                chunks.extend(_split_large_chunk(chunk))

        for child in node.children:
            visit(child)

    visit(tree.root_node)

    # If no named nodes found (e.g. script file), chunk whole file
    if not chunks:
        chunks = _fallback_chunk(file_path, content, language_name)

    return chunks

def _fallback_chunk(
    file_path: str,
    content: str,
    language: str = "plaintext"
) -> list[Chunk]:
    """Line-window chunking for unsupported file types."""
    lines = content.splitlines()
    result = []
    step   = MAX_CHUNK_LINES - OVERLAP_LINES

    for i in range(0, len(lines), step):
        window = lines[i:i + MAX_CHUNK_LINES]
        result.append(Chunk(
            file_path  = file_path,
            content    = "\n".join(window),
            start_line = i,
            end_line   = i + len(window),
            language   = language,
            chunk_type = "block",
        ))
    return result