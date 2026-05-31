from functools import lru_cache
from langchain_groq import ChatGroq
from core.config import get_settings

@lru_cache
def get_llm(model_name: str = "llama-3.3-70b-versatile"):
    settings = get_settings()
    return ChatGroq(
        api_key=settings.groq_api_key,
        model=model_name,
        temperature=0,
        streaming=True,
    )