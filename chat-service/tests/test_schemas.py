import pytest
from pydantic import ValidationError
from app.api.v1.schemas import SignupRequest, InterviewCreateRequest
from app.db.models import InterviewDomain, InterviewDifficulty


def test_signup_request_valid() -> None:
    req = SignupRequest(email="user@test.com", password="Secure1pass")
    assert req.email == "user@test.com"


def test_signup_password_too_short() -> None:
    with pytest.raises(ValidationError):
        SignupRequest(email="user@test.com", password="short")


def test_signup_invalid_email() -> None:
    with pytest.raises(ValidationError):
        SignupRequest(email="not-an-email", password="validPass1!")


def test_interview_create_request_valid() -> None:
    req = InterviewCreateRequest(domain=InterviewDomain.dsa, difficulty=InterviewDifficulty.medium)
    assert req.domain == InterviewDomain.dsa
    assert req.scheduled_at is None
