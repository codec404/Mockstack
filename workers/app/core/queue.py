from __future__ import annotations

import json
import logging
from typing import Any

from redis.asyncio import Redis

log = logging.getLogger(__name__)


async def dequeue(redis: Redis, queue: str, timeout: int = 2) -> tuple[str | None, dict | None]:
    """BLPOP from a queue; returns (raw_item, parsed_item) or (None, None)."""
    result = await redis.blpop(queue, timeout=timeout)
    if result is None:
        return None, None
    _, raw = result
    try:
        return raw, json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        log.warning("failed_to_parse_job", raw=raw)
        return raw, None


async def send_to_dlq(redis: Redis, dlq_prefix: str, queue_name: str, raw: str, error: str) -> None:
    dlq = f"{dlq_prefix}:{queue_name}"
    payload = json.dumps({"original": raw, "error": error})
    await redis.lpush(dlq, payload)
    log.warning("job_sent_to_dlq", queue=queue_name, dlq=dlq)


async def enqueue(redis: Redis, queue: str, payload: dict[str, Any]) -> None:
    await redis.lpush(queue, json.dumps(payload))
