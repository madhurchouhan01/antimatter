"""
User settings API — provider / model / API key management.

GET  /api/settings/        → returns { provider, model, has_api_key }
PUT  /api/settings/        → upsert  { provider, model, api_key? }
GET  /api/settings/models  → returns PROVIDER_MODELS catalogue
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db.session import get_db
from db.models import UserSettings
from api.middleware.auth import get_current_user
from agent.llm import PROVIDER_MODELS
from core.logger import get_logger

router = APIRouter(prefix="/api/settings", tags=["settings"])
log = get_logger(__name__)


# ── Schemas ──────────────────────────────────────────────────────────────────

class SettingsResponse(BaseModel):
    provider: str
    model: str
    has_api_key: bool


class SettingsUpdate(BaseModel):
    provider: str
    model: str
    api_key: str | None = None   # empty string or None = clear the key


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
        )
    return SettingsResponse(
        provider=row.provider,
        model=row.model,
        has_api_key=bool(row.api_key),
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
    )


@router.get("/models")
async def get_models():
    """Return all supported providers and their model catalogues."""
    return PROVIDER_MODELS
