from __future__ import annotations

from datetime import timedelta
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import UnauthorizedError
from app.core.security import decode_access_token
from app.db.database import get_db
from app.db.models import User, UserRole

_redis: Redis | None = None


def get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    authorization = request.headers.get("authorization") or request.headers.get("Authorization")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or malformed token")
    token = authorization.split(" ", maxsplit=1)[1]
    try:
        payload = decode_access_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    # Check token revocation (logout sets this key)
    redis = get_redis()
    if await redis.exists(f"revoked:{token}"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked")

    result = await db.execute(select(User).where(User.id == UUID(user_id), User.is_active.is_(True)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


async def get_optional_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Like get_current_user but returns None instead of raising on missing/bad token."""
    authorization = request.headers.get("authorization") or request.headers.get("Authorization")
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", maxsplit=1)[1]
    try:
        payload = decode_access_token(token)
    except ValueError:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    redis = get_redis()
    if await redis.exists(f"revoked:{token}"):
        return None
    result = await db.execute(select(User).where(User.id == UUID(user_id), User.is_active.is_(True)))
    return result.scalar_one_or_none()


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


async def rate_limit(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> None:
    redis = get_redis()
    route = f"{request.method}:{request.url.path}"
    key = f"ratelimit:{current_user.id}:{route}"
    count: int = await redis.incr(key)
    if count == 1:
        await redis.expire(key, int(timedelta(minutes=1).total_seconds()))
    if count > 60:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Retry after 1 minute.",
            headers={"Retry-After": "60"},
        )
