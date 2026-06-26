"""
LLM factory supporting multiple providers.

Priority for API key:
  1. User-supplied key (from UserSettings DB row)
  2. Backend environment variable / settings fallback
"""

import httpx
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from core.config import get_settings
from core.logger import get_logger

log = get_logger(__name__)

# ── Canonical model lists exposed to the frontend ────────────────────────────
PROVIDER_MODELS: dict[str, list[str]] = {
    "groq": [
        "llama-3.3-70b-versatile",
        "llama-3.1-70b-versatile",
        "llama-3.1-8b-instant",
        "llama3-groq-70b-8192-tool-use-preview",
        "deepseek-r1-distill-llama-70b",
        "qwen/qwen3-32b",
        "meta-llama/llama-4-scout-17b-16e-instruct",
    ],
    "github": [
        "openai/gpt-4.1",
        "openai/gpt-4o",
        "openai/gpt-4o-mini",
        "openai/o3",
        "openai/o3-mini",
        "meta/llama-4-scout",
        "meta/llama-4-maverick",
        "microsoft/phi-4",
        "mistral-ai/mistral-large-2411",
        "deepseek/deepseek-v3",
        "cohere/cohere-command-r-plus-08-2024",
    ],
    "openai": [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4.1",
        "gpt-4.1-mini",
        "o3",
        "o3-mini",
        "o4-mini",
    ],
    "openrouter": [
        "openai/gpt-4o",
        "anthropic/claude-sonnet-4-5",
        "google/gemini-2.5-pro",
        "meta-llama/llama-3.3-70b-instruct",
        "deepseek/deepseek-chat-v3-0324",
        "mistralai/mistral-large-2411",
        "qwen/qwen3-235b-a22b",
    ],
    "anthropic": [
        "claude-opus-4-5",
        "claude-sonnet-4-5",
        "claude-haiku-3-5",
        "claude-3-7-sonnet-latest",
    ],
    "gemini": [
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
    ],
    # Ollama: dynamic — populated at runtime from the user's local instance.
    # The list here is a curated set of tool-calling-capable models as a fallback.
    "ollama": [
        "qwen2.5-coder:14b",
        "qwen2.5-coder:7b",
        "qwen2.5-coder:3b"
        "qwen2.5:14b",
        "qwen2.5:7b",
        "llama3.3:70b",
        "llama3.2:3b",
        "mistral:7b",
        "mistral-nemo:12b",
        "deepseek-coder-v2:16b",
        "gemma3:12b",
        "gemma3:4b",
        "phi4:14b",
        "smollm2:1.7b",
    ],
}

# GitHub Marketplace Azure AI Inference endpoint
_GITHUB_ENDPOINT = "https://models.github.ai/inference"
_OPENROUTER_BASE  = "https://openrouter.ai/api/v1"
_OLLAMA_DEFAULT_BASE = "http://localhost:11434/v1"


async def fetch_ollama_models(base_url: str | None = None) -> dict:
    """
    Probe the user's Ollama instance and return structured status.

    Returns:
        {
            "reachable": bool,       # whether Ollama responded at all
            "installed": list[str],  # models the user has already pulled
            "error": str | None,     # human-readable error if unreachable
        }
    """
    url = (base_url or _OLLAMA_DEFAULT_BASE).rstrip("/")
    # Strip /v1 suffix — Ollama's native /api/tags is NOT under /v1
    root_url = url.replace("/v1", "").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{root_url}/api/tags")
            r.raise_for_status()
            data = r.json()
            installed = [m["name"] for m in data.get("models", [])]
            return {"reachable": True, "installed": installed, "error": None}
    except httpx.ConnectError:
        msg = f"Could not connect to Ollama at {root_url}. Is Ollama running?"
        log.warning("Ollama unreachable", url=root_url)
        return {"reachable": False, "installed": [], "error": msg}
    except httpx.TimeoutException:
        msg = f"Connection to Ollama at {root_url} timed out."
        log.warning("Ollama timeout", url=root_url)
        return {"reachable": False, "installed": [], "error": msg}
    except Exception as exc:
        msg = f"Unexpected error reaching Ollama: {exc}"
        log.warning("Ollama probe failed", url=root_url, error=str(exc))
        return {"reachable": False, "installed": [], "error": msg}


def get_llm(
    provider: str = "groq",
    model_name: str | None = None,
    api_key: str | None = None,
    ollama_base_url: str | None = None,
):
    """
    Build and return a LangChain chat model for the given provider.

    Args:
        provider:        One of groq | github | openai | openrouter | anthropic | gemini | ollama
        model_name:      Model identifier. Falls back to provider default if None.
        api_key:         User-supplied key. Falls back to backend env key if None/empty.
        ollama_base_url: Override the Ollama endpoint (e.g. http://192.168.1.10:11434/v1).
                         If None, falls back to OLLAMA_BASE_URL env/config or localhost.
    """
    settings = get_settings()

    def _key(env_key: str) -> str:
        """Return user key if set, else env fallback."""
        return api_key if api_key else env_key

    if provider == "groq":
        model = model_name or settings.groq_model
        key   = _key(settings.groq_api_key)
        log.debug("Building Groq LLM", model=model)
        return ChatGroq(
            api_key=key,
            model=model,
            temperature=0,
            streaming=True,
            max_retries=3,
        )

    elif provider == "github":
        model = model_name or "openai/gpt-4.1"
        key   = _key(settings.github_pat or "")
        log.debug("Building GitHub Marketplace LLM", model=model)
        # GitHub Marketplace uses OpenAI-compatible endpoint
        return ChatOpenAI(
            api_key=key,
            model=model,
            base_url=_GITHUB_ENDPOINT,
            temperature=0,
            streaming=True,
            max_retries=3,
            stream_options={"include_usage": True},
        )

    elif provider == "openai":
        model = model_name or "gpt-4o"
        key   = _key(settings.openai_api_key or "")
        log.debug("Building OpenAI LLM", model=model)
        return ChatOpenAI(
            api_key=key,
            model=model,
            temperature=0,
            streaming=True,
            max_retries=3,
            stream_options={"include_usage": True},
        )

    elif provider == "openrouter":
        model = model_name or "openai/gpt-4o"
        key   = _key(settings.openrouter_api_key or "")
        log.debug("Building OpenRouter LLM", model=model)
        return ChatOpenAI(
            api_key=key,
            model=model,
            base_url=_OPENROUTER_BASE,
            temperature=0,
            streaming=True,
            max_retries=3,
            max_tokens=100,   # cap to avoid 402 on free-tier accounts
            default_headers={
                "HTTP-Referer": "https://antimatter.dev",
                "X-Title": "AntiMatter IDE",
            },
            stream_options={"include_usage": True},
        )

    elif provider == "anthropic":
        model = model_name or "claude-sonnet-4-5"
        key   = _key(settings.anthropic_api_key or "")
        log.debug("Building Anthropic LLM", model=model)
        return ChatAnthropic(
            api_key=key,
            model=model,
            temperature=0,
            streaming=True,
            max_retries=3,
        )

    elif provider == "gemini":
        model = model_name or "gemini-2.5-flash"
        key   = _key(settings.gemini_api_key or "")
        log.debug("Building Gemini LLM", model=model)
        return ChatGoogleGenerativeAI(
            google_api_key=key,
            model=model,
            temperature=0,
            streaming=True,
        )

    elif provider == "ollama":
        settings = get_settings()
        # Priority: per-request override > user settings URL > backend config default
        base_url = ollama_base_url or settings.ollama_base_url or _OLLAMA_DEFAULT_BASE
        model = model_name or "qwen2.5-coder:7b"
        log.debug("Building Ollama local LLM", model=model, base_url=base_url)
        return ChatOpenAI(
            api_key="ollama",       # Required field; Ollama ignores it
            model=model,
            base_url=base_url,
            temperature=0,
            streaming=True,
            max_retries=2,
            stream_options={"include_usage": True},
        )

    else:
        raise ValueError(f"Unknown provider: {provider!r}. Choose from: {list(PROVIDER_MODELS.keys())}")