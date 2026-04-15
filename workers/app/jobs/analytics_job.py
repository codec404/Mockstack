from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.queue import dequeue, send_to_dlq

log = logging.getLogger(__name__)

_engine = create_async_engine(settings.database_url, pool_pre_ping=True)
_session_factory = async_sessionmaker(_engine, expire_on_commit=False)

# ── Rating helpers ─────────────────────────────────────────────────────────────

_DIFF_MULT: dict[str, float] = {
    "easy": 1.0,
    "medium": 1.5,
    "hard": 2.0,
    "expert": 3.0,
}

_TIERS = [
    (2500, "Grandmaster"),
    (2000, "Master"),
    (1500, "Candidate Master"),
    (1000, "Expert"),
    (600,  "Specialist"),
    (300,  "Apprentice"),
    (0,    "Newbie"),
]


def _interview_points(avg_score: int, clarity_score: int, difficulty: str) -> int:
    m = _DIFF_MULT.get(difficulty, 1.0)
    return int(avg_score * m * 10) + int(clarity_score * m * 2)


def _rank_tier(total_pts: int) -> str:
    for threshold, tier in _TIERS:
        if total_pts >= threshold:
            return tier
    return "Newbie"


# ── Job processor ──────────────────────────────────────────────────────────────

async def process_analytics_job(redis: Redis) -> None:
    raw, data = await dequeue(redis, settings.analytics_queue, timeout=2)
    if data is None:
        return

    user_id = data.get("user_id")
    idempotency_key = data.get("idempotency_key", user_id)

    if idempotency_key:
        lock_key = f"analytics:lock:{idempotency_key}"
        already = await redis.set(lock_key, "1", nx=True, ex=300)
        if not already:
            log.info("analytics_job_deduplicated key=%s", idempotency_key)
            return

    try:
        if user_id:
            await _materialize_user_analytics(user_id)
        else:
            await _materialize_all_analytics()
    except Exception as exc:
        retries = data.get("retries", 0) + 1
        if retries >= settings.max_retries:
            log.error("analytics_max_retries_exceeded user_id=%s error=%s", user_id, exc)
            await send_to_dlq(redis, settings.dlq_prefix, settings.analytics_queue, raw or "", str(exc))
        else:
            data["retries"] = retries
            await redis.lpush(settings.analytics_queue, json.dumps(data))
            log.warning("analytics_requeued user_id=%s retries=%d", user_id, retries)


async def _materialize_user_analytics(user_id: str) -> None:
    async with _session_factory() as db:
        rows = await db.execute(
            text("""
                SELECT e.average_score, e.clarity_score, i.difficulty
                FROM interviews i
                JOIN interview_evaluations e ON i.id = e.interview_id
                WHERE i.user_id = :user_id AND i.status = 'completed'
                ORDER BY i.ended_at
            """),
            {"user_id": user_id},
        )
        data = rows.fetchall()
        if not data:
            return

        avg_score = sum(r[0] for r in data) // len(data)
        avg_clarity = sum(r[1] for r in data) // len(data)
        total_pts = sum(_interview_points(r[0], r[1], r[2]) for r in data)
        tier = _rank_tier(total_pts)
        now = datetime.now(UTC).replace(tzinfo=None)

        await db.execute(
            text("""
                INSERT INTO user_analytics_snapshots
                    (user_id, total_interviews, avg_score, avg_clarity,
                     total_points, rank_tier, last_computed_at)
                VALUES
                    (:user_id, :total, :avg_score, :avg_clarity,
                     :total_points, :rank_tier, :now)
                ON CONFLICT (user_id) DO UPDATE SET
                    total_interviews = EXCLUDED.total_interviews,
                    avg_score        = EXCLUDED.avg_score,
                    avg_clarity      = EXCLUDED.avg_clarity,
                    total_points     = EXCLUDED.total_points,
                    rank_tier        = EXCLUDED.rank_tier,
                    last_computed_at = EXCLUDED.last_computed_at
            """),
            {
                "user_id": user_id,
                "total": len(data),
                "avg_score": avg_score,
                "avg_clarity": avg_clarity,
                "total_points": total_pts,
                "rank_tier": tier,
                "now": now,
            },
        )
        await db.commit()
        log.info("analytics_materialized user_id=%s total=%d pts=%d tier=%s",
                 user_id, len(data), total_pts, tier)


async def _materialize_all_analytics() -> None:
    async with _session_factory() as db:
        rows = await db.execute(
            text("SELECT DISTINCT i.user_id FROM interviews i WHERE i.status = 'completed'")
        )
        user_ids = [str(r[0]) for r in rows.fetchall()]

    for uid in user_ids:
        try:
            await _materialize_user_analytics(uid)
        except Exception as exc:
            log.error("analytics_user_failed user_id=%s error=%s", uid, exc)
