from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    redis_url: str
    secret_key: str
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    groq_api_key: str = ""
    workspace_root: str = "/workspaces"
    environment: str = "development"

    # LLM
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

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
    
@lru_cache
def get_settings() -> Settings:
    return Settings()