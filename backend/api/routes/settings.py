"""
User settings API — provider / model / API key management.

GET  /api/settings/        → returns { provider, model, has_api_key }
PUT  /api/settings/        → upsert  { provider, model, api_key? }
GET  /api/settings/models  → returns PROVIDER_MODELS catalogue
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db.session import get_db
from db.models import UserSettings
from api.middleware.auth import get_current_user
from agent.llm import PROVIDER_MODELS, fetch_ollama_models
from core.config import get_settings
from core.logger import get_logger

router = APIRouter(prefix="/api/settings", tags=["settings"])
log = get_logger(__name__)


# ── Schemas ──────────────────────────────────────────────────────────────────

class SettingsResponse(BaseModel):
    provider: str
    model: str
    has_api_key: bool
    ollama_base_url: str | None = None


class SettingsUpdate(BaseModel):
    provider: str
    model: str
    api_key: str | None = None          # empty string or None = clear the key
    ollama_base_url: str | None = None  # custom Ollama endpoint URL


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=SettingsResponse)
async def get_settings(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Return the current user's provider/model preference. Key is never returned."""
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )
    row = result.scalar_one_or_none()
    if not row:
        return SettingsResponse(
            provider="groq",
            model="llama-3.3-70b-versatile",
            has_api_key=False,
            ollama_base_url=None,
        )
    return SettingsResponse(
        provider=row.provider,
        model=row.model,
        has_api_key=bool(row.api_key),
        ollama_base_url=getattr(row, "ollama_base_url", None),
    )


@router.put("/", response_model=SettingsResponse)
async def save_settings(
    body: SettingsUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Upsert the user's provider/model and optionally update/clear the API key."""
    if body.provider not in PROVIDER_MODELS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown provider '{body.provider}'. Valid: {list(PROVIDER_MODELS.keys())}",
        )

    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )
    row = result.scalar_one_or_none()

    if not row:
        row = UserSettings(user_id=user.id)
        db.add(row)

    row.provider = body.provider
    row.model = body.model

    # Persist Ollama base URL if provided (store None to reset to default)
    if body.ollama_base_url is not None:
        if hasattr(row, "ollama_base_url"):
            row.ollama_base_url = body.ollama_base_url or None

    # Only update the key if the client explicitly sent something
    # Empty string = intentionally clear the key
    if body.api_key is not None:
        row.api_key = body.api_key or None  # store None instead of ""

    await db.commit()
    await db.refresh(row)

    log.info("User settings saved", user=str(user.id), provider=row.provider, model=row.model)
    return SettingsResponse(
        provider=row.provider,
        model=row.model,
        has_api_key=bool(row.api_key),
        ollama_base_url=getattr(row, "ollama_base_url", None),
    )


@router.get("/models")
async def get_models():
    """Return all supported providers and their model catalogues."""
    return PROVIDER_MODELS


@router.get("/ollama/models")
async def get_ollama_models(
    base_url: str | None = Query(default=None, description="Ollama base URL, e.g. http://localhost:11434/v1"),
):
    """
    Probe the user's running Ollama instance.
    Returns:
      - reachable: whether Ollama responded
      - installed: models the user has already pulled (selectable)
      - recommended: curated tool-calling models NOT yet installed (info only)
      - error: human-readable message if unreachable
    """
    settings = get_settings()
    effective_url = base_url or settings.ollama_base_url

    result = await fetch_ollama_models(effective_url)

    # Curated models known to support tool calling well, with notes
    RECOMMENDED = [
        {"name": "qwen2.5-coder:7b",   "note": "Best for 8GB RAM — strong tool calling"},
        {"name": "qwen2.5-coder:14b",  "note": "Best coding model if you have 12GB+ VRAM"},
        {"name": "qwen2.5-coder:32b",  "note": "Requires 24GB+ VRAM"},
        {"name": "qwen2.5:7b",         "note": "General purpose, good tool calling"},
        {"name": "llama3.2:3b",        "note": "Tiny & fast, basic tool support"},
        {"name": "llama3.3:70b",       "note": "Excellent agent, needs 48GB+ VRAM"},
        {"name": "mistral-nemo:12b",   "note": "Great tool calling, 10GB VRAM"},
        {"name": "mistral:7b",         "note": "Fast, decent tool calling"},
        {"name": "deepseek-coder-v2:16b", "note": "Strong coder, 14GB VRAM"},
        {"name": "phi4:14b",           "note": "Microsoft, decent tool calling"},
        {"name": "gemma3:12b",         "note": "⚠️ Limited tool calling support"},
        {"name": "gemma3:4b",          "note": "⚠️ Limited tool calling support"},
        {"name": "smollm2:1.7b",       "note": "⚠️ Very limited, for testing only"},
    ]

    installed_names = set(result["installed"])
    not_installed = [r for r in RECOMMENDED if r["name"] not in installed_names]

    return {
        "reachable": result["reachable"],
        "installed": result["installed"],
        "recommended": not_installed,
        "error": result["error"],
        "base_url": effective_url,
    }
