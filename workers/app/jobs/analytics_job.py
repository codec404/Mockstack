from __future__ import annotations

import logging
from datetime import UTC, datetime

from redis.asyncio import Redis
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.core.config import settings
from app.core.queue import dequeue, send_to_dlq

log = logging.getLogger(__name__)

_engine = create_async_engine(settings.database_url, pool_pre_ping=True)
_session_factory = async_sessionmaker(_engine, expire_on_commit=False)


async def process_analytics_job(redis: Redis) -> None:
    raw, data = await dequeue(redis, settings.analytics_queue, timeout=2)
    if data is None:
        return

    user_id = data.get("user_id")
    idempotency_key = data.get("idempotency_key", user_id)

    # Idempotency check: skip if same job was processed recently
    if idempotency_key:
        lock_key = f"analytics:lock:{idempotency_key}"
        already = await redis.set(lock_key, "1", nx=True, ex=300)
        if not already:
            log.info("analytics_job_deduplicated", key=idempotency_key)
            return

    try:
        if user_id:
            await _materialize_user_analytics(user_id)
        else:
            await _materialize_all_analytics()
    except Exception as exc:
        retries = data.get("retries", 0) + 1
        if retries >= settings.max_retries:
            log.error("analytics_max_retries_exceeded", user_id=user_id, error=str(exc))
            await send_to_dlq(redis, settings.dlq_prefix, settings.analytics_queue, raw or "", str(exc))
        else:
            import json
            data["retries"] = retries
            await redis.lpush(settings.analytics_queue, json.dumps(data))
            log.warning("analytics_requeued", user_id=user_id, retries=retries)


async def _materialize_user_analytics(user_id: str) -> None:
    async with _session_factory() as db:
        rows = await db.execute(
            text("""
                SELECT e.average_score, e.clarity_score
                FROM interviews i
                JOIN interview_evaluations e ON i.id = e.interview_id
                WHERE i.user_id = :user_id AND i.status = 'completed'
            """),
            {"user_id": user_id},
        )
        data = rows.fetchall()
        if not data:
            return

        avg_score = sum(r[0] for r in data) // len(data)
        avg_clarity = sum(r[1] for r in data) // len(data)
        now = datetime.now(UTC).replace(tzinfo=None)

        await db.execute(
            text("""
                INSERT INTO user_analytics_snapshots
                    (user_id, total_interviews, avg_score, avg_clarity, last_computed_at)
                VALUES
                    (:user_id, :total, :avg_score, :avg_clarity, :now)
                ON CONFLICT (user_id) DO UPDATE
                SET total_interviews = EXCLUDED.total_interviews,
                    avg_score = EXCLUDED.avg_score,
                    avg_clarity = EXCLUDED.avg_clarity,
                    last_computed_at = EXCLUDED.last_computed_at
            """),
            {
                "user_id": user_id,
                "total": len(data),
                "avg_score": avg_score,
                "avg_clarity": avg_clarity,
                "now": now,
            },
        )
        await db.commit()
        log.info("analytics_materialized", user_id=user_id, total=len(data))


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
            log.error("analytics_user_failed", user_id=uid, error=str(exc))
