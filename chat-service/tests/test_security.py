import pytest
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_hash_and_verify_password() -> None:
    hashed = hash_password("StrongPass1!")
    assert verify_password("StrongPass1!", hashed)
    assert not verify_password("WrongPass", hashed)


def test_hash_is_different_each_time() -> None:
    h1 = hash_password("same_password_1")
    h2 = hash_password("same_password_1")
    assert h1 != h2  # random salt


def test_access_token_roundtrip() -> None:
    token = create_access_token("user-123", "test@example.com", "user")
    payload = decode_access_token(token)
    assert payload["sub"] == "user-123"
    assert payload["email"] == "test@example.com"
    assert payload["role"] == "user"
    assert payload["type"] == "access"


def test_decode_invalid_token_raises() -> None:
    with pytest.raises(ValueError, match="invalid token"):
        decode_access_token("not.a.valid.token")
