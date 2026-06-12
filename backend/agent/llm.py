"""
LLM factory supporting multiple providers.

Priority for API key:
  1. User-supplied key (from UserSettings DB row)
  2. Backend environment variable / settings fallback
"""

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
}

# GitHub Marketplace Azure AI Inference endpoint
_GITHUB_ENDPOINT = "https://models.github.ai/inference"
_OPENROUTER_BASE  = "https://openrouter.ai/api/v1"


def get_llm(
    provider: str = "groq",
    model_name: str | None = None,
    api_key: str | None = None,
):
    """
    Build and return a LangChain chat model for the given provider.

    Args:
        provider:   One of groq | github | openai | openrouter | anthropic | gemini
        model_name: Model identifier. Falls back to provider default if None.
        api_key:    User-supplied key. Falls back to backend env key if None/empty.
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
            max_tokens=4000,   # cap to avoid 402 on free-tier accounts
            default_headers={
                "HTTP-Referer": "https://antimatter.dev",
                "X-Title": "AntiMatter IDE",
            },
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

    else:
        raise ValueError(f"Unknown provider: {provider!r}. Choose from: {list(PROVIDER_MODELS.keys())}")