import pytest
from agent.graph import parse_text_tool_calls

def test_parse_text_tool_calls_json_block():
    text = """
Here is the tool call to replace content:
```json
{
  "name": "replace_file_content",
  "arguments": {
    "path": "add.py",
    "target_content": "def add(a, b):\\n    return a + b\\n",
    "replacement_content": ""
  }
}
```
Let me know if that worked!
"""
    calls = parse_text_tool_calls(text)
    assert len(calls) == 1
    assert calls[0]["name"] == "replace_file_content"
    assert calls[0]["args"]["path"] == "add.py"
    assert calls[0]["args"]["replacement_content"] == ""

def test_parse_text_tool_calls_raw_json():
    text = """{
  "name": "write_file",
  "arguments": {
    "path": "hello.py",
    "content": "print('hello')"
  }
}"""
    calls = parse_text_tool_calls(text)
    assert len(calls) == 1
    assert calls[0]["name"] == "write_file"
    assert calls[0]["args"]["path"] == "hello.py"
    assert calls[0]["args"]["content"] == "print('hello')"

def test_parse_text_tool_calls_no_json():
    text = "Hello, I am a model."
    calls = parse_text_tool_calls(text)
    assert len(calls) == 0
