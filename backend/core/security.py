# core/security.py
from datetime import datetime, timedelta, timezone
import secrets
from jose import jwt, JWTError
from passlib.context import CryptContext
from core.config import get_settings

settings = get_settings()
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode({"sub": user_id, "exp": expire}, settings.secret_key, algorithm="HS256")

def decode_access_token(token: str) -> str:
    payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    user_id = payload.get("sub")
    if not user_id:
        raise JWTError("Invalid token")
    return user_id

def create_refresh_token() -> str:
    return secrets.token_urlsafe(64)