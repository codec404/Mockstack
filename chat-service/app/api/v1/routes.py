from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, get_optional_user, get_redis, rate_limit, require_admin
from app.api.v1.schemas import (
    AdminAnalyticsResponse,
    AnalyticsHistoryResponse,
    DomainBreakdown,
    FriendEntry,
    FriendsListResponse,
    AvatarUpdateRequest,
    AvatarUpdateResponse,
    HandleUpdateRequest,
    HandleUpdateResponse,
    PointsHistoryEntry,
    PointsHistoryResponse,
    InterviewCreateRequest,
    InterviewResponse,
    InterviewResultResponse,
    LeaderboardEntry,
    LeaderboardResponse,
    LoginRequest,
    LogoutRequest,
    MessageEvaluation,
    MessageQueuedResponse,
    ProfileResponse,
    ProfileUpdateRequest,
    PublicProfileResponse,
    RefreshRequest,
    RescheduleRequest,
    ScoreHistoryEntry,
    SendMessageRequest,
    SignupRequest,
    TokenPairResponse,
    UserAnalyticsResponse,
    UserResponse,
)
from app.core.config import settings
from app.core.errors import BadRequestError, ConflictError, NotFoundError, UnauthorizedError
from app.core.security import create_access_token, create_refresh_token, hash_password, verify_password
from app.db.database import get_db
from app.db.models import (
    Friend,
    Interview,
    InterviewEvaluation,
    InterviewMessage,
    InterviewStatus,
    Reminder,
    ReminderStatus,
    User,
    UserAnalyticsSnapshot,
    UserProfile,
    UserRole,
)
from app.services.interview_state import validate_transition

router = APIRouter()
log = structlog.get_logger()


# ── Auth ──────────────────────────────────────────────────────────────────────

@router.post("/auth/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)) -> UserResponse:
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise ConflictError("An account with this email already exists")
    # Default handle = email local-part, ensure uniqueness by appending suffix if taken
    base_handle = payload.email.split("@")[0][:50]
    handle = base_handle
    suffix = 1
    while (await db.execute(select(User.id).where(User.handle == handle))).scalar_one_or_none():
        handle = f"{base_handle[:47]}_{suffix}"
        suffix += 1
    user = User(
        email=payload.email,
        handle=handle,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    await db.flush()
    db.add(UserProfile(user_id=user.id))
    await db.commit()
    await db.refresh(user)
    log.info("user_signed_up", user_id=str(user.id), email=user.email, role=user.role.value)
    return UserResponse(id=user.id, email=user.email, role=user.role)


@router.post("/auth/login", response_model=TokenPairResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenPairResponse:
    result = await db.execute(select(User).where(User.email == payload.email, User.is_active.is_(True)))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    access_token = create_access_token(str(user.id), user.email, user.role.value, user.handle or "")
    refresh_token = create_refresh_token()
    redis = get_redis()
    await redis.setex(
        f"refresh:{refresh_token}",
        timedelta(hours=settings.refresh_token_hours),
        str(user.id),
    )
    log.info("user_logged_in", user_id=str(user.id))
    return TokenPairResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_minutes * 60,
    )


@router.post("/auth/refresh", response_model=TokenPairResponse)
async def refresh_tokens(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenPairResponse:
    redis = get_redis()
    user_id = await redis.get(f"refresh:{payload.refresh_token}")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    # Rotate: delete old refresh token, issue new pair
    await redis.delete(f"refresh:{payload.refresh_token}")

    result = await db.execute(select(User).where(User.id == UUID(user_id), User.is_active.is_(True)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    new_access = create_access_token(str(user.id), user.email, user.role.value, user.handle or "")
    new_refresh = create_refresh_token()
    await redis.setex(
        f"refresh:{new_refresh}",
        timedelta(hours=settings.refresh_token_hours),
        str(user.id),
    )
    return TokenPairResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        expires_in=settings.access_token_minutes * 60,
    )


@router.post("/auth/logout", status_code=status.HTTP_200_OK)
async def logout(payload: LogoutRequest) -> dict:
    redis = get_redis()
    await redis.setex(
        f"revoked:{payload.access_token}",
        timedelta(minutes=settings.access_token_minutes + 5),
        "1",
    )
    await redis.delete(f"refresh:{payload.refresh_token}")
    return {"detail": "Logged out"}


# ── Profile ───────────────────────────────────────────────────────────────────

@router.get("/profile/me", response_model=ProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise NotFoundError("Profile")
    return ProfileResponse.model_validate(profile)


@router.put("/profile/me", response_model=ProfileResponse)
async def update_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
    profile.years_experience = payload.years_experience
    profile.tech_stacks = payload.tech_stacks
    profile.target_role = payload.target_role
    profile.target_company = payload.target_company
    await db.commit()
    await db.refresh(profile)
    return ProfileResponse.model_validate(profile)


# ── Interviews ────────────────────────────────────────────────────────────────

@router.post("/interviews", response_model=InterviewResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit)])
async def create_interview(
    payload: InterviewCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewResponse:
    initial_status = InterviewStatus.scheduled if payload.scheduled_at else InterviewStatus.draft
    interview = Interview(
        user_id=current_user.id,
        domain=payload.domain,
        difficulty=payload.difficulty,
        scheduled_at=payload.scheduled_at,
        status=initial_status,
    )
    db.add(interview)
    await db.commit()
    await db.refresh(interview)

    if payload.scheduled_at:
        send_at = payload.scheduled_at - timedelta(hours=1)
        reminder = Reminder(
            interview_id=interview.id,
            user_id=current_user.id,
            send_at=send_at,
        )
        db.add(reminder)
        await db.commit()

    log.info("interview_created", interview_id=str(interview.id), user_id=str(current_user.id))
    return InterviewResponse.model_validate(interview)


@router.get("/interviews", response_model=list[InterviewResponse])
async def list_interviews(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[InterviewResponse]:
    result = await db.execute(
        select(Interview)
        .where(Interview.user_id == current_user.id)
        .order_by(Interview.created_at.desc())
    )
    return [InterviewResponse.model_validate(i) for i in result.scalars().all()]


@router.get("/interviews/{interview_id}", response_model=InterviewResponse)
async def get_interview(
    interview_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewResponse:
    interview = await _get_user_interview(interview_id, current_user.id, db)
    return InterviewResponse.model_validate(interview)


@router.post("/interviews/{interview_id}/start", response_model=InterviewResponse, dependencies=[Depends(rate_limit)])
async def start_interview(
    interview_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewResponse:
    interview = await _get_user_interview(interview_id, current_user.id, db)
    validate_transition(interview.status, InterviewStatus.in_progress)
    interview.status = InterviewStatus.in_progress
    interview.started_at = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()
    await db.refresh(interview)

    # Fetch profile for context then enqueue async first-question generation
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    redis = get_redis()
    import json as _json
    await redis.lpush(settings.ai_eval_queue, _json.dumps({
        "type": "generate_first_question",
        "interview_id": str(interview_id),
        "domain": interview.domain.value,
        "difficulty": interview.difficulty.value,
        "experience_level": str(profile.years_experience if profile else 0),
        "tech_stacks": profile.tech_stacks if profile else [],
        "retries": 0,
    }))
    log.info("first_question_enqueued", interview_id=str(interview_id))
    return InterviewResponse.model_validate(interview)


@router.get("/interviews/{interview_id}/messages")
async def get_messages(
    interview_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    await _get_user_interview(interview_id, current_user.id, db)
    result = await db.execute(
        select(InterviewMessage)
        .where(InterviewMessage.interview_id == interview_id)
        .order_by(InterviewMessage.created_at)
    )
    return [{"role": m.role, "content": m.content, "score": m.score} for m in result.scalars().all()]


@router.post(
    "/interviews/{interview_id}/messages",
    response_model=MessageQueuedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(rate_limit)],
)
async def send_message(
    interview_id: UUID,
    payload: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageQueuedResponse:
    interview = await _get_user_interview(interview_id, current_user.id, db)
    if interview.status != InterviewStatus.in_progress:
        raise BadRequestError("Interview is not active")

    # Load conversation history BEFORE storing the new message
    result = await db.execute(
        select(InterviewMessage)
        .where(InterviewMessage.interview_id == interview_id)
        .order_by(InterviewMessage.created_at)
    )
    existing = result.scalars().all()

    # Persist user message immediately so frontend can see it on the next poll
    user_msg = InterviewMessage(
        interview_id=interview_id,
        role="user",
        content=payload.content,
    )
    db.add(user_msg)
    await db.flush()
    await db.commit()

    # Build history list for the AI (include the new user message at the end)
    history_list = [{"role": m.role, "content": m.content} for m in existing]
    history_list.append({"role": "user", "content": payload.content})

    import json as _json
    redis = get_redis()
    await redis.lpush(settings.ai_eval_queue, _json.dumps({
        "type": "generate_next_question",       # no real-time evaluation
        "interview_id": str(interview_id),
        "user_message_id": str(user_msg.id),
        "domain": interview.domain.value,
        "difficulty": interview.difficulty.value,
        "history": history_list,                # full conversation so far
        "retries": 0,
    }))
    log.info("next_question_enqueued", interview_id=str(interview_id))
    return MessageQueuedResponse()


@router.post(
    "/interviews/{interview_id}/end",
    response_model=InterviewResultResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(rate_limit)],
)
async def end_interview(
    interview_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewResultResponse:
    interview = await _get_user_interview(interview_id, current_user.id, db)
    validate_transition(interview.status, InterviewStatus.completed)

    interview.status = InterviewStatus.completed
    interview.ended_at = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()

    import json as _json
    redis = get_redis()
    await redis.lpush(settings.ai_report_queue, _json.dumps({
        "type": "finalize_report",
        "interview_id": str(interview_id),
        "user_id": str(current_user.id),
        "retries": 0,
    }))
    log.info("report_generation_enqueued", interview_id=str(interview_id))
    return InterviewResultResponse(interview_id=interview_id, status="processing")


@router.get("/interviews/{interview_id}/result", response_model=InterviewResultResponse)
async def get_result(
    interview_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewResultResponse:
    await _get_user_interview(interview_id, current_user.id, db)
    result = await db.execute(
        select(InterviewEvaluation).where(InterviewEvaluation.interview_id == interview_id)
    )
    evaluation = result.scalar_one_or_none()
    if not evaluation:
        # Worker hasn't finished yet — tell the client to keep polling
        return InterviewResultResponse(interview_id=interview_id, status="processing")
    return InterviewResultResponse(
        interview_id=interview_id,
        status="ready",
        average_score=evaluation.average_score,
        clarity_score=evaluation.clarity_score,
        strengths=evaluation.strengths,
        weaknesses=evaluation.weaknesses,
        weak_topics=evaluation.weak_topics,
        improvement_points=evaluation.improvement_points,
        summary=evaluation.summary,
    )


# ── Scheduling ────────────────────────────────────────────────────────────────

@router.get("/schedules/upcoming", response_model=list[InterviewResponse])
async def upcoming_schedules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[InterviewResponse]:
    now = datetime.now(UTC).replace(tzinfo=None)
    result = await db.execute(
        select(Interview)
        .where(
            Interview.user_id == current_user.id,
            Interview.status == InterviewStatus.scheduled,
            Interview.scheduled_at >= now,
        )
        .order_by(Interview.scheduled_at)
    )
    return [InterviewResponse.model_validate(i) for i in result.scalars().all()]


@router.put("/schedules/{interview_id}/reschedule", response_model=InterviewResponse)
async def reschedule(
    interview_id: UUID,
    payload: RescheduleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewResponse:
    interview = await _get_user_interview(interview_id, current_user.id, db)
    if interview.status not in {InterviewStatus.draft, InterviewStatus.scheduled}:
        raise BadRequestError("Only draft or scheduled interviews can be rescheduled")

    interview.scheduled_at = payload.scheduled_at
    interview.status = InterviewStatus.scheduled

    # Cancel previous pending reminders and create new one
    await db.execute(
        select(Reminder)
        .where(Reminder.interview_id == interview_id, Reminder.status == ReminderStatus.pending)
    )
    existing_reminders = (await db.execute(
        select(Reminder).where(
            Reminder.interview_id == interview_id,
            Reminder.status == ReminderStatus.pending,
        )
    )).scalars().all()
    for r in existing_reminders:
        r.status = ReminderStatus.cancelled

    new_reminder = Reminder(
        interview_id=interview_id,
        user_id=current_user.id,
        send_at=payload.scheduled_at - timedelta(hours=1),
    )
    db.add(new_reminder)
    await db.commit()
    await db.refresh(interview)
    return InterviewResponse.model_validate(interview)


@router.post("/schedules/{interview_id}/cancel", response_model=InterviewResponse)
async def cancel_schedule(
    interview_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewResponse:
    interview = await _get_user_interview(interview_id, current_user.id, db)
    validate_transition(interview.status, InterviewStatus.cancelled)
    interview.status = InterviewStatus.cancelled
    await db.commit()
    await db.refresh(interview)
    return InterviewResponse.model_validate(interview)


# ── Analytics ─────────────────────────────────────────────────────────────────

@router.get("/analytics/me", response_model=UserAnalyticsResponse)
async def user_analytics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserAnalyticsResponse:
    result = await db.execute(
        select(UserAnalyticsSnapshot).where(UserAnalyticsSnapshot.user_id == current_user.id)
    )
    snapshot = result.scalar_one_or_none()
    if not snapshot:
        return UserAnalyticsResponse(total_interviews=0, avg_score=0, avg_clarity=0,
                                     total_points=0, rank_tier="Newbie")
    return UserAnalyticsResponse(
        total_interviews=snapshot.total_interviews,
        avg_score=snapshot.avg_score,
        avg_clarity=snapshot.avg_clarity,
        total_points=snapshot.total_points,
        rank_tier=snapshot.rank_tier,
    )


@router.get("/analytics/history", response_model=AnalyticsHistoryResponse)
async def analytics_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalyticsHistoryResponse:
    rows = (await db.execute(
        select(
            Interview.domain,
            Interview.difficulty,
            Interview.ended_at,
            InterviewEvaluation.average_score,
            InterviewEvaluation.clarity_score,
        )
        .join(InterviewEvaluation, InterviewEvaluation.interview_id == Interview.id)
        .where(
            Interview.user_id == current_user.id,
            Interview.status == InterviewStatus.completed,
        )
        .order_by(Interview.ended_at.asc())
        .limit(20)
    )).all()

    _DIFF_MULT = {"easy": 1.0, "medium": 1.5, "hard": 2.0, "expert": 3.0}

    def _pts(score: int, clarity: int, diff: str) -> int:
        m = _DIFF_MULT.get(diff, 1.0)
        return int(score * m * 10) + int(clarity * m * 2)

    history = [
        ScoreHistoryEntry(
            date=r.ended_at,
            domain=r.domain.value if hasattr(r.domain, "value") else str(r.domain),
            difficulty=r.difficulty.value if hasattr(r.difficulty, "value") else str(r.difficulty),
            avg_score=r.average_score,
            clarity_score=r.clarity_score,
            points_earned=_pts(r.average_score, r.clarity_score,
                               r.difficulty.value if hasattr(r.difficulty, "value") else str(r.difficulty)),
        )
        for r in rows
    ]

    # Domain breakdown: aggregate per domain
    domain_map: dict[str, list[int]] = {}
    for r in rows:
        d = r.domain.value if hasattr(r.domain, "value") else str(r.domain)
        domain_map.setdefault(d, []).append(r.average_score)
    domain_breakdown = [
        DomainBreakdown(domain=d, avg_score=round(sum(scores) / len(scores), 1), count=len(scores))
        for d, scores in domain_map.items()
    ]

    return AnalyticsHistoryResponse(history=history, domain_breakdown=domain_breakdown)


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def leaderboard(db: AsyncSession = Depends(get_db)) -> LeaderboardResponse:
    """Public endpoint — no auth required."""
    rows = (await db.execute(
        select(User.handle, User.email, UserAnalyticsSnapshot.total_points,
               UserAnalyticsSnapshot.rank_tier, UserAnalyticsSnapshot.total_interviews)
        .join(UserAnalyticsSnapshot, UserAnalyticsSnapshot.user_id == User.id)
        .where(User.is_active.is_(True), UserAnalyticsSnapshot.total_points > 0)
        .order_by(UserAnalyticsSnapshot.total_points.desc())
        .limit(100)
    )).all()

    total = (await db.execute(select(func.count(User.id)).where(User.is_active.is_(True)))).scalar_one()

    entries = [
        LeaderboardEntry(
            rank=idx + 1,
            handle=r.handle or r.email.split("@")[0],
            rank_tier=r.rank_tier,
            total_points=r.total_points,
            total_interviews=r.total_interviews,
        )
        for idx, r in enumerate(rows)
    ]
    return LeaderboardResponse(entries=entries, total_users=total)


# ── Handle ────────────────────────────────────────────────────────────────────

@router.patch("/users/me/handle", response_model=HandleUpdateResponse)
async def update_handle(
    payload: HandleUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HandleUpdateResponse:
    clash = (await db.execute(
        select(User.id).where(User.handle == payload.handle, User.id != current_user.id)
    )).scalar_one_or_none()
    if clash:
        raise ConflictError("Handle already taken")
    current_user.handle = payload.handle
    await db.commit()
    return HandleUpdateResponse(handle=payload.handle)


# ── Avatar ────────────────────────────────────────────────────────────────────

@router.patch("/users/me/avatar", response_model=AvatarUpdateResponse)
async def update_avatar(
    payload: AvatarUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AvatarUpdateResponse:
    current_user.avatar_url = payload.avatar
    await db.commit()
    return AvatarUpdateResponse(avatar_url=payload.avatar)


# ── Public profile ─────────────────────────────────────────────────────────────

@router.get("/profile/{handle}", response_model=PublicProfileResponse)
async def public_profile(
    handle: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> PublicProfileResponse:
    """Public — no login required. Viewer identity resolved from token if present."""
    result = await db.execute(
        select(User, UserAnalyticsSnapshot)
        .outerjoin(UserAnalyticsSnapshot, UserAnalyticsSnapshot.user_id == User.id)
        .where(User.handle == handle, User.is_active.is_(True))
    )
    row = result.first()
    if not row:
        raise NotFoundError("Profile not found")
    user, snap = row

    # Friend count (how many people have added this user)
    friend_count = (await db.execute(
        select(func.count()).select_from(Friend).where(Friend.user_id == user.id)
    )).scalar_one()

    is_self = current_user is not None and current_user.id == user.id
    is_friend = False
    if current_user and not is_self:
        is_friend = (await db.execute(
            select(Friend).where(Friend.user_id == current_user.id, Friend.friend_id == user.id)
        )).scalar_one_or_none() is not None

    return PublicProfileResponse(
        handle=user.handle or handle,
        rank_tier=snap.rank_tier if snap else "Newbie",
        total_points=snap.total_points if snap else 0,
        total_interviews=snap.total_interviews if snap else 0,
        avg_score=snap.avg_score if snap else 0,
        avg_clarity=snap.avg_clarity if snap else 0,
        friend_count=friend_count,
        is_self=is_self,
        email=user.email if is_self else None,
        is_friend=is_friend,
        avatar_url=user.avatar_url,
    )


# ── Public points history ─────────────────────────────────────────────────────

@router.get("/profile/{handle}/points-history", response_model=PointsHistoryResponse)
async def profile_points_history(
    handle: str,
    db: AsyncSession = Depends(get_db),
) -> PointsHistoryResponse:
    """Publicly visible points history for a given handle."""
    user_row = (await db.execute(
        select(User.id).where(User.handle == handle, User.is_active.is_(True))
    )).scalar_one_or_none()
    if not user_row:
        raise NotFoundError("Profile not found")

    _DIFF_MULT = {"easy": 1.0, "medium": 1.5, "hard": 2.0, "expert": 3.0}

    rows = (await db.execute(
        select(
            Interview.ended_at,
            Interview.domain,
            Interview.difficulty,
            InterviewEvaluation.average_score,
            InterviewEvaluation.clarity_score,
        )
        .join(InterviewEvaluation, InterviewEvaluation.interview_id == Interview.id)
        .where(
            Interview.user_id == user_row,
            Interview.status == InterviewStatus.completed,
            Interview.ended_at.is_not(None),
        )
        .order_by(Interview.ended_at.asc())
    )).all()

    entries: list[PointsHistoryEntry] = []
    cumulative = 0
    for r in rows:
        diff = r.difficulty.value if hasattr(r.difficulty, "value") else str(r.difficulty)
        m = _DIFF_MULT.get(diff, 1.0)
        pts = int(r.average_score * m * 10) + int(r.clarity_score * m * 2)
        cumulative += pts
        entries.append(PointsHistoryEntry(
            date=r.ended_at,
            points_earned=pts,
            cumulative_points=cumulative,
            domain=r.domain.value if hasattr(r.domain, "value") else str(r.domain),
            difficulty=diff,
            avg_score=r.average_score,
            clarity_score=r.clarity_score,
        ))

    return PointsHistoryResponse(entries=entries)


# ── Friends ─────────────────────────────────────────────────────────────────

@router.post("/friends/{handle}", status_code=status.HTTP_201_CREATED)
async def add_friend(
    handle: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target = (await db.execute(
        select(User).where(User.handle == handle, User.is_active.is_(True))
    )).scalar_one_or_none()
    if not target:
        raise NotFoundError("User not found")
    if target.id == current_user.id:
        raise BadRequestError("Cannot add yourself as a friend")
    existing = (await db.execute(
        select(Friend).where(Friend.user_id == current_user.id, Friend.friend_id == target.id)
    )).scalar_one_or_none()
    if existing:
        raise ConflictError("Already friends")
    db.add(Friend(user_id=current_user.id, friend_id=target.id))
    await db.commit()
    return {"detail": "Friend added"}


@router.delete("/friends/{handle}", status_code=status.HTTP_200_OK)
async def remove_friend(
    handle: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target = (await db.execute(
        select(User).where(User.handle == handle, User.is_active.is_(True))
    )).scalar_one_or_none()
    if not target:
        raise NotFoundError("User not found")
    row = (await db.execute(
        select(Friend).where(Friend.user_id == current_user.id, Friend.friend_id == target.id)
    )).scalar_one_or_none()
    if not row:
        raise NotFoundError("Not in your friends list")
    await db.delete(row)
    await db.commit()
    return {"detail": "Friend removed"}


@router.get("/friends", response_model=FriendsListResponse)
async def list_friends(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FriendsListResponse:
    rows = (await db.execute(
        select(User.handle, User.email,
               UserAnalyticsSnapshot.rank_tier,
               UserAnalyticsSnapshot.total_points,
               UserAnalyticsSnapshot.total_interviews)
        .join(Friend, Friend.friend_id == User.id)
        .outerjoin(UserAnalyticsSnapshot, UserAnalyticsSnapshot.user_id == User.id)
        .where(Friend.user_id == current_user.id, User.is_active.is_(True))
        .order_by(UserAnalyticsSnapshot.total_points.desc())
        .limit(20)
    )).all()

    friends = [
        FriendEntry(
            handle=r.handle or r.email.split("@")[0],
            rank_tier=r.rank_tier or "Newbie",
            total_points=r.total_points or 0,
            total_interviews=r.total_interviews or 0,
        )
        for r in rows
    ]
    return FriendsListResponse(friends=friends)


@router.get("/admin/analytics", response_model=AdminAnalyticsResponse)
async def admin_analytics(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminAnalyticsResponse:
    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    active_users = (await db.execute(
        select(func.count(User.id)).where(User.is_active.is_(True))
    )).scalar_one()
    currently_interviewing = (await db.execute(
        select(func.count(Interview.id)).where(Interview.status == InterviewStatus.in_progress)
    )).scalar_one()
    total_interviews = (await db.execute(select(func.count(Interview.id)))).scalar_one()
    total_completed = (await db.execute(
        select(func.count(Interview.id)).where(Interview.status == InterviewStatus.completed)
    )).scalar_one()
    return AdminAnalyticsResponse(
        total_users=total_users,
        active_users=active_users,
        currently_interviewing=currently_interviewing,
        total_interviews=total_interviews,
        total_completed=total_completed,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_user_interview(interview_id: UUID, user_id: UUID, db: AsyncSession) -> Interview:
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == user_id)
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise NotFoundError("Interview")
    return interview
