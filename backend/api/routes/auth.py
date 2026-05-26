from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from db.session import get_db
from db.models import User, RefreshToken
from core.security import hash_password, verify_password, create_access_token, create_refresh_token
from datetime import datetime, timezone, timedelta
from core.config import get_settings
import uuid

router = APIRouter()
settings = get_settings()

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(email=body.email, hashed_password=hash_password(body.password), name=body.name)
    db.add(user)
    await db.flush()

    refresh = RefreshToken(
        token=create_refresh_token(),
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    )
    db.add(refresh)
    await db.commit()

    return TokenResponse(access_token=create_access_token(str(user.id)), refresh_token=refresh.token)

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    refresh = RefreshToken(
        token=create_refresh_token(),
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    )
    db.add(refresh)
    await db.commit()
    return TokenResponse(access_token=create_access_token(str(user.id)), refresh_token=refresh.token)

@router.post("/logout")
async def logout(body: dict, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RefreshToken).where(RefreshToken.token == body.get("refresh_token")))
    token = result.scalar_one_or_none()
    if token:
        token.revoked = True
        await db.commit()
    return {"ok": True}