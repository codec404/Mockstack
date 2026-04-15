from __future__ import annotations

import base64
import hashlib
import hmac
import os
import uuid
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt

from app.core.config import settings

PBKDF2_ROUNDS = 260_000


def hash_password(password: str) -> str:
    """Return a PBKDF2-SHA256 hash of the password."""
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    token = base64.b64encode(salt + digest).decode("utf-8")
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${token}"


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time comparison of plain password against stored hash."""
    try:
        scheme, rounds_str, token = hashed.split("$", maxsplit=2)
        if scheme != "pbkdf2_sha256":
            return False
        decoded = base64.b64decode(token.encode("utf-8"))
        salt, expected = decoded[:16], decoded[16:]
        actual = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt, int(rounds_str))
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def create_access_token(subject: str, email: str, role: str, handle: str = "") -> str:
    expiry = datetime.now(UTC) + timedelta(minutes=settings.access_token_minutes)
    payload = {
        "sub": subject,
        "email": email,
        "role": role,
        "handle": handle,
        "exp": expiry,
        "iat": datetime.now(UTC),
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token() -> str:
    return str(uuid.uuid4())


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "access":
            raise ValueError("not an access token")
        return payload
    except JWTError as exc:
        raise ValueError("invalid token") from exc
