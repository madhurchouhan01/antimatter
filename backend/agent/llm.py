from functools import lru_cache
from langchain_groq import ChatGroq
from core.config import get_settings
from core.logger import get_logger

log = get_logger(__name__)

@lru_cache
def get_llm(model_name: str = "llama-3.3-70b-versatile"):
    """
    Get Groq LLM client with automatic retry mechanism.
    
    Retries up to 3 times with exponential backoff on transient errors.
    """
    settings = get_settings()
    return ChatGroq(
        api_key=settings.groq_api_key,
        model=model_name,
        temperature=0,
        streaming=True,
        # Retry configuration: max 3 attempts with exponential backoff
        max_retries=3,
        # Wait between retries: exponential backoff (1s, 2s, 4s)
    )