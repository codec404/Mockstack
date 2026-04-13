from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from redis.asyncio import Redis
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.core.config import settings
from app.core.queue import dequeue, send_to_dlq

log = logging.getLogger(__name__)

_engine = create_async_engine(settings.database_url, pool_pre_ping=True)
_session_factory = async_sessionmaker(_engine, expire_on_commit=False)


async def process_reminder_job(redis: Redis) -> None:
    raw, data = await dequeue(redis, settings.reminder_queue, timeout=2)
    if data is None:
        return

    reminder_id = data.get("reminder_id")
    if not reminder_id:
        await send_to_dlq(redis, settings.dlq_prefix, settings.reminder_queue, raw or "", "missing reminder_id")
        return

    try:
        await _dispatch_reminder(reminder_id)
    except Exception as exc:
        retries = data.get("retries", 0) + 1
        if retries >= settings.max_retries:
            log.error("reminder_max_retries_exceeded", reminder_id=reminder_id, error=str(exc))
            await send_to_dlq(redis, settings.dlq_prefix, settings.reminder_queue, raw or "", str(exc))
            await _mark_reminder_failed(reminder_id, str(exc))
        else:
            import json
            data["retries"] = retries
            await redis.lpush(settings.reminder_queue, json.dumps(data))
            log.warning("reminder_requeued", reminder_id=reminder_id, retries=retries)


async def _dispatch_reminder(reminder_id: int) -> None:
    from sqlalchemy.dialects.postgresql import UUID as PGUUID

    async with _session_factory() as db:
        from app.db.models import Reminder, ReminderStatus, Interview, User  # lazy import to avoid circular

        result = await db.execute(
            select(Reminder).where(Reminder.id == reminder_id)
        )
        reminder = result.scalar_one_or_none()
        if not reminder:
            log.warning("reminder_not_found", reminder_id=reminder_id)
            return
        if reminder.status != ReminderStatus.pending:
            return  # already handled (idempotent)

        now = datetime.now(UTC).replace(tzinfo=None)
        if now < reminder.send_at:
            # Not time yet — requeue
            import json
            from redis.asyncio import Redis as _Redis
            r = _Redis.from_url(settings.redis_url, decode_responses=True)
            await r.lpush(settings.reminder_queue, json.dumps({"reminder_id": reminder_id, "retries": 0}))
            await r.aclose()
            return

        # Real email integration point
        log.info("reminder_dispatched", reminder_id=reminder_id, interview_id=str(reminder.interview_id))

        reminder.status = ReminderStatus.sent
        reminder.sent_at = now
        await db.commit()


async def _mark_reminder_failed(reminder_id: int, error: str) -> None:
    async with _session_factory() as db:
        from app.db.models import Reminder, ReminderStatus
        result = await db.execute(select(Reminder).where(Reminder.id == reminder_id))
        reminder = result.scalar_one_or_none()
        if reminder:
            reminder.status = ReminderStatus.failed
            reminder.last_error = error
            await db.commit()
