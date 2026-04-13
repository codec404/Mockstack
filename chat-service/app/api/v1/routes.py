from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, get_redis, rate_limit, require_admin
from app.api.v1.schemas import (
    AdminAnalyticsResponse,
    InterviewCreateRequest,
    InterviewResponse,
    InterviewResultResponse,
    LoginRequest,
    LogoutRequest,
    MessageEvaluation,
    ProfileResponse,
    ProfileUpdateRequest,
    RefreshRequest,
    RescheduleRequest,
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
from app.grpc_clients.ai_client import ai_client
from app.services.interview_state import validate_transition

router = APIRouter()
log = structlog.get_logger()


# ── Auth ──────────────────────────────────────────────────────────────────────

@router.post("/auth/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)) -> UserResponse:
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise ConflictError("An account with this email already exists")
    user = User(
        email=payload.email,
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
    access_token = create_access_token(str(user.id), user.email, user.role.value)
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

    new_access = create_access_token(str(user.id), user.email, user.role.value)
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

    # Enqueue first question generation
    try:
        result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
        profile = result.scalar_one_or_none()
        first_q = await ai_client.generate_next_question({
            "interview_id": str(interview_id),
            "domain": interview.domain.value,
            "difficulty": interview.difficulty.value,
            "experience_level": str(profile.years_experience if profile else 0),
            "tech_stacks": profile.tech_stacks if profile else [],
            "transcript": "",
        })
        db.add(InterviewMessage(
            interview_id=interview_id,
            role="assistant",
            content=first_q["question"],
        ))
        await db.commit()
    except Exception as exc:
        log.warning("first_question_generation_failed", error=str(exc))

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


@router.post("/interviews/{interview_id}/messages", response_model=MessageEvaluation, dependencies=[Depends(rate_limit)])
async def send_message(
    interview_id: UUID,
    payload: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageEvaluation:
    interview = await _get_user_interview(interview_id, current_user.id, db)
    if interview.status != InterviewStatus.in_progress:
        raise BadRequestError("Interview is not active")

    result = await db.execute(
        select(InterviewMessage)
        .where(InterviewMessage.interview_id == interview_id)
        .order_by(InterviewMessage.created_at)
    )
    history = result.scalars().all()
    transcript = "\n".join(f"{m.role}: {m.content}" for m in history)
    last_question = next((m.content for m in reversed(history) if m.role == "assistant"), "")

    evaluation = await ai_client.evaluate({
        "interview_id": str(interview_id),
        "question": last_question,
        "answer": payload.content,
        "domain": interview.domain.value,
        "difficulty": interview.difficulty.value,
        "transcript": transcript,
    })

    db.add(InterviewMessage(
        interview_id=interview_id,
        role="user",
        content=payload.content,
        score=evaluation["score"],
        clarity=evaluation["clarity"],
    ))
    db.add(InterviewMessage(
        interview_id=interview_id,
        role="assistant",
        content=evaluation["next_question"],
    ))
    await db.commit()
    return MessageEvaluation(**evaluation)


@router.post("/interviews/{interview_id}/end", response_model=InterviewResultResponse, dependencies=[Depends(rate_limit)])
async def end_interview(
    interview_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewResultResponse:
    interview = await _get_user_interview(interview_id, current_user.id, db)
    validate_transition(interview.status, InterviewStatus.completed)

    result = await db.execute(
        select(InterviewMessage)
        .where(InterviewMessage.interview_id == interview_id)
        .order_by(InterviewMessage.created_at)
    )
    messages = result.scalars().all()
    user_messages = [m for m in messages if m.role == "user"]

    scores = [m.score for m in user_messages if m.score is not None]
    clarity_scores = [m.clarity for m in user_messages if m.clarity is not None]

    report = await ai_client.finalize({
        "interview_id": str(interview_id),
        "scores": scores or [50],
        "clarity_scores": clarity_scores or [50],
        "positives": ["attempted all questions"],
        "negatives": ["answers need more depth"] if not scores else ["minor gaps in depth"],
        "weak_topics": [interview.domain.value],
        "improvement_points": ["explain trade-offs", "include complexity analysis"],
    })

    interview.status = InterviewStatus.completed
    interview.ended_at = datetime.now(UTC).replace(tzinfo=None)

    # Upsert evaluation
    existing_eval = await db.execute(
        select(InterviewEvaluation).where(InterviewEvaluation.interview_id == interview_id)
    )
    evaluation = existing_eval.scalar_one_or_none()
    if evaluation is None:
        evaluation = InterviewEvaluation(interview_id=interview_id)
        db.add(evaluation)

    evaluation.average_score = report["average_score"]
    evaluation.clarity_score = report["clarity_score"]
    evaluation.strengths = report["strengths"]
    evaluation.weaknesses = report["weaknesses"]
    evaluation.weak_topics = report["weak_topics"]
    evaluation.improvement_points = report["improvement_points"]
    evaluation.summary = report["summary"]
    await db.commit()

    redis = get_redis()
    await redis.lpush("queue:analytics", str({"type": "recompute_user", "user_id": str(current_user.id)}))

    return InterviewResultResponse(
        interview_id=interview_id,
        **report,
    )


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
        raise NotFoundError("Interview result")
    return InterviewResultResponse(
        interview_id=interview_id,
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
        return UserAnalyticsResponse(total_interviews=0, avg_score=0, avg_clarity=0)
    return UserAnalyticsResponse(
        total_interviews=snapshot.total_interviews,
        avg_score=snapshot.avg_score,
        avg_clarity=snapshot.avg_clarity,
    )


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
