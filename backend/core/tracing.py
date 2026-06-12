import os
from core.config import get_settings
from core.logger import get_logger

log = get_logger(__name__)


def setup_tracing() -> None:
    """
    Configure LangSmith tracing by setting the environment variables that the
    LangChain/LangSmith SDK reads automatically.

    Supports both naming conventions:
      - New-style: LANGSMITH_API_KEY, LANGSMITH_TRACING, LANGSMITH_PROJECT, LANGSMITH_ENDPOINT
      - Legacy:    LANGCHAIN_API_KEY, LANGCHAIN_TRACING_V2, LANGCHAIN_PROJECT

    Both sets are written so the SDK works regardless of which version of
    langsmith is installed.
    """
    settings = get_settings()

    if not settings.tracing_enabled:
        log.info(
            "LangSmith tracing disabled",
            reason="no key" if not settings.effective_langsmith_api_key else "flag not set",
        )
        return

    api_key  = settings.effective_langsmith_api_key
    project  = settings.langsmith_project or settings.langchain_project or "Antimatter"
    endpoint = settings.langsmith_endpoint

    # ── New-style variables (langsmith >= 0.1) ────────────────────────────
    os.environ["LANGSMITH_API_KEY"]   = api_key
    os.environ["LANGSMITH_TRACING"]   = "true"
    os.environ["LANGSMITH_PROJECT"]   = project
    os.environ["LANGSMITH_ENDPOINT"]  = endpoint

    # ── Legacy variables (langchain-core reads these as fallback) ─────────
    os.environ["LANGCHAIN_API_KEY"]        = api_key
    os.environ["LANGCHAIN_TRACING_V2"]     = "true"
    os.environ["LANGCHAIN_PROJECT"]        = project
    os.environ["LANGCHAIN_ENDPOINT"]       = endpoint

    log.info(
        "LangSmith tracing enabled",
        project=project,
        endpoint=endpoint,
    )