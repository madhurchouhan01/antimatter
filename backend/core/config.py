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

    # Ollama (local models)
    ollama_base_url: str = "http://host.docker.internal:11434/v1"  # Override for remote Ollama instances


    # LangSmith — supports both old LANGCHAIN_* and new LANGSMITH_* naming
    # New-style keys (preferred, set in .env as LANGSMITH_*)
    langsmith_api_key: str = ""
    langsmith_tracing: str = "false"
    langsmith_endpoint: str = "https://api.smith.langchain.com"
    langsmith_project: str = "Antimatter"
    # Legacy aliases — kept for backward compatibility
    langchain_api_key: str = ""
    langchain_tracing_v2: str = "false"
    langchain_project: str = "ai-code-editor"

    @property
    def effective_langsmith_api_key(self) -> str:
        """Return whichever key is set — new-style wins over legacy."""
        return self.langsmith_api_key or self.langchain_api_key

    @property
    def tracing_enabled(self) -> bool:
        """True when a key is present and tracing is explicitly enabled."""
        has_key = bool(self.effective_langsmith_api_key)
        flag = (self.langsmith_tracing.lower() == "true"
                or self.langchain_tracing_v2.lower() == "true")
        return has_key and flag

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