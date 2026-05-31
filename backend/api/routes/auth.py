from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from db.session import get_db
from db.models import User, RefreshToken
from core.security import hash_password, verify_password, create_access_token, create_refresh_token
from core.logger import get_logger
from datetime import datetime, timezone, timedelta
from core.config import get_settings
import uuid
import httpx

router = APIRouter()
settings = get_settings()
log = get_logger(__name__)

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
        log.warning("Registration failed — email already exists", email=body.email)
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
    log.info("User registered", email=body.email, user_id=str(user.id))
    return TokenResponse(access_token=create_access_token(str(user.id)), refresh_token=refresh.token)

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        log.warning("Login failed — invalid credentials", email=body.email)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    refresh = RefreshToken(
        token=create_refresh_token(),
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    )
    db.add(refresh)
    await db.commit()
    log.info("User logged in", email=body.email, user_id=str(user.id))
    return TokenResponse(access_token=create_access_token(str(user.id)), refresh_token=refresh.token)

@router.post("/logout")
async def logout(body: dict, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RefreshToken).where(RefreshToken.token == body.get("refresh_token")))
    token = result.scalar_one_or_none()
    if token:
        token.revoked = True
        await db.commit()
    return {"ok": True}


# ── GitHub OAuth ─────────────────────────────────────────────────────────────

@router.get("/github/login")
async def github_login():
    """Return the GitHub authorization URL for the frontend to open as a popup."""
    params = (
        f"client_id={settings.github_client_id}"
        f"&scope=user:email"
        f"&redirect_uri=http://localhost:1842/api/auth/github/callback"
    )
    return {"url": f"https://github.com/login/oauth/authorize?{params}"}


@router.get("/github/callback", response_class=HTMLResponse)
async def github_callback(code: str, db: AsyncSession = Depends(get_db)):
    """Exchange the code for a token, upsert the user, then send tokens back via postMessage."""
    # 1. Exchange code for GitHub access token
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id":     settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code":          code,
                "redirect_uri":  "http://localhost:1842/api/auth/github/callback",
            },
            headers={"Accept": "application/json"},
        )
        token_data = token_res.json()

    gh_access_token = token_data.get("access_token")
    if not gh_access_token:
        return _popup_error("GitHub did not return an access token. Try again.")

    # 2. Fetch GitHub user profile
    async with httpx.AsyncClient() as client:
        user_res = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {gh_access_token}", "Accept": "application/json"},
        )
        emails_res = await client.get(
            "https://api.github.com/user/emails",
            headers={"Authorization": f"Bearer {gh_access_token}", "Accept": "application/json"},
        )

    gh_user   = user_res.json()
    gh_emails = emails_res.json()

    # Pick the primary verified email
    email = next(
        (e["email"] for e in gh_emails if e.get("primary") and e.get("verified")),
        gh_user.get("email"),
    )
    if not email:
        return _popup_error("Could not retrieve a verified email from GitHub.")

    # 3. Upsert user
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        user = User(
            email=email,
            name=gh_user.get("name") or gh_user.get("login"),
            hashed_password=None,   # GitHub-only account has no password
        )
        db.add(user)
        await db.flush()

    # 4. Issue our own JWT + refresh token
    refresh = RefreshToken(
        token=create_refresh_token(),
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(refresh)
    await db.commit()

    access_token  = create_access_token(str(user.id))
    refresh_token = refresh.token

    # 5. Return HTML that sends tokens to the opener via postMessage, then closes
    return HTMLResponse(_popup_success_html(access_token, refresh_token))


def _popup_success_html(access_token: str, refresh_token: str) -> str:
    return f"""
<!DOCTYPE html>
<html>
<body>
<script>
  window.opener.postMessage(
    {{ type: "GITHUB_AUTH_SUCCESS", access_token: "{access_token}", refresh_token: "{refresh_token}" }},
    "{settings.frontend_url}"
  );
  window.close();
</script>
</body>
</html>
"""


def _popup_error(message: str) -> HTMLResponse:
    return HTMLResponse(f"""
<!DOCTYPE html>
<html>
<body>
<script>
  window.opener.postMessage(
    {{ type: "GITHUB_AUTH_ERROR", error: "{message}" }},
    "{settings.frontend_url}"
  );
  window.close();
</script>
</body>
</html>
""")