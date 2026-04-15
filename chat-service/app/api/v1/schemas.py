from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.db.models import InterviewDifficulty, InterviewDomain, InterviewStatus, UserRole


# ── Auth ──────────────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.user

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isdigit() or not c.isalpha() for c in v):
            raise ValueError("Password must contain at least one non-letter character")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    access_token: str
    refresh_token: str


class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int  # seconds


# ── User / Profile ────────────────────────────────────────────────────────────

class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    role: UserRole


class ProfileResponse(BaseModel):
    years_experience: int
    tech_stacks: list[str]
    target_role: str
    target_company: str

    model_config = {"from_attributes": True}


class ProfileUpdateRequest(BaseModel):
    years_experience: int = Field(ge=0, le=50, default=0)
    tech_stacks: list[str] = Field(default_factory=list, max_length=20)
    target_role: str = Field(max_length=200, default="")
    target_company: str = Field(max_length=200, default="")


# ── Interview ─────────────────────────────────────────────────────────────────

class InterviewCreateRequest(BaseModel):
    domain: InterviewDomain
    difficulty: InterviewDifficulty
    scheduled_at: datetime | None = None


class InterviewResponse(BaseModel):
    id: UUID
    domain: InterviewDomain
    difficulty: InterviewDifficulty
    status: InterviewStatus
    scheduled_at: datetime | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4096)


class MessageEvaluation(BaseModel):
    score: int
    clarity: int
    positives: list[str]
    negatives: list[str]
    weak_topics: list[str]
    improvement_points: list[str]
    next_question: str


class InterviewResultResponse(BaseModel):
    interview_id: UUID
    status: str = "ready"          # "ready" | "processing"
    average_score: int | None = None
    clarity_score: int | None = None
    strengths: list[str] | None = None
    weaknesses: list[str] | None = None
    weak_topics: list[str] | None = None
    improvement_points: list[str] | None = None
    summary: str | None = None

    model_config = {"from_attributes": True}


class MessageQueuedResponse(BaseModel):
    status: str = "queued"


# ── Scheduling ────────────────────────────────────────────────────────────────

class RescheduleRequest(BaseModel):
    scheduled_at: datetime


# ── Analytics ─────────────────────────────────────────────────────────────────

class UserAnalyticsResponse(BaseModel):
    total_interviews: int
    avg_score: int
    avg_clarity: int
    total_points: int = 0
    rank_tier: str = "Newbie"


class ScoreHistoryEntry(BaseModel):
    date: datetime
    domain: str
    difficulty: str
    avg_score: int
    clarity_score: int
    points_earned: int


class DomainBreakdown(BaseModel):
    domain: str
    avg_score: float
    count: int


class AnalyticsHistoryResponse(BaseModel):
    history: list[ScoreHistoryEntry]
    domain_breakdown: list[DomainBreakdown]


class LeaderboardEntry(BaseModel):
    rank: int
    handle: str
    rank_tier: str
    total_points: int
    total_interviews: int


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]
    total_users: int


# ── Handle ────────────────────────────────────────────────────────────────────

class HandleUpdateRequest(BaseModel):
    handle: str = Field(min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_\-]+$")


# ── Avatar ─────────────────────────────────────────────────────────────────────

class AvatarUpdateRequest(BaseModel):
    # base64 data URL, e.g. "data:image/jpeg;base64,..."
    avatar: str = Field(max_length=2_000_000)   # ~1.5 MB raw

    @field_validator("avatar")
    @classmethod
    def must_be_data_url(cls, v: str) -> str:
        if not v.startswith("data:image/"):
            raise ValueError("avatar must be a data URL starting with data:image/")
        return v


class AvatarUpdateResponse(BaseModel):
    avatar_url: str


class HandleUpdateResponse(BaseModel):
    handle: str


# ── Public profile ────────────────────────────────────────────────────────────

class PublicProfileResponse(BaseModel):
    handle: str
    rank_tier: str
    total_points: int
    total_interviews: int
    avg_score: int
    avg_clarity: int
    friend_count: int
    is_self: bool = False
    email: str | None = None          # only populated when is_self=True
    is_friend: bool = False           # whether the requesting user has added this person
    avatar_url: str | None = None


# ── Points history (public profile) ──────────────────────────────────────────

class PointsHistoryEntry(BaseModel):
    date: datetime
    points_earned: int
    cumulative_points: int
    domain: str
    difficulty: str
    avg_score: int
    clarity_score: int


class PointsHistoryResponse(BaseModel):
    entries: list[PointsHistoryEntry]


# ── Friends ───────────────────────────────────────────────────────────────────

class FriendEntry(BaseModel):
    handle: str
    rank_tier: str
    total_points: int
    total_interviews: int


class FriendsListResponse(BaseModel):
    friends: list[FriendEntry]


class AdminAnalyticsResponse(BaseModel):
    total_users: int
    active_users: int
    currently_interviewing: int
    total_interviews: int
    total_completed: int


# ── Error ─────────────────────────────────────────────────────────────────────

class ErrorDetail(BaseModel):
    code: str
    detail: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
