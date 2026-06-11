from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    redis_url: str
    secret_key: str
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    workspace_root: str = "/users"
    environment: str = "development"
    echo : bool = False
    # LLM — Groq (default provider)
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # GitHub Marketplace (Azure AI Inference)
    github_pat: str = ""

    # OpenAI
    openai_api_key: str = ""

    # OpenRouter
    openrouter_api_key: str = ""

    # Anthropic
    anthropic_api_key: str = ""

    # Google Gemini
    gemini_api_key: str = ""

    # LangSmith (optional — leave blank to disable)
    langchain_api_key: str = ""
    langchain_tracing_v2: str = "false"
    langchain_project: str = "ai-code-editor"

    sandbox_image:   str = "antimatter-sandbox:latest"
    sandbox_network: str = "antimatter-sandbox-net"
    sandbox_cpu:     str = "1.0"       # CPU limit
    sandbox_memory:  str = "512m"      # RAM limit
    sandbox_idle_timeout: int = 1800   # 30 min in seconds

    voyage_api_key: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    frontend_url: str = "http://localhost:5173"
    
@lru_cache
def get_settings() -> Settings:
    return Settings()