import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.core.queue import dequeue, enqueue, send_to_dlq


@pytest.mark.asyncio
async def test_dequeue_returns_parsed_payload() -> None:
    redis = AsyncMock()
    payload = {"type": "recompute_user", "user_id": "abc"}
    redis.blpop.return_value = ("queue:analytics", json.dumps(payload))
    raw, data = await dequeue(redis, "queue:analytics")
    assert data == payload
    assert raw is not None


@pytest.mark.asyncio
async def test_dequeue_returns_none_on_timeout() -> None:
    redis = AsyncMock()
    redis.blpop.return_value = None
    raw, data = await dequeue(redis, "queue:analytics")
    assert raw is None
    assert data is None


@pytest.mark.asyncio
async def test_enqueue_pushes_json() -> None:
    redis = AsyncMock()
    await enqueue(redis, "queue:test", {"key": "value"})
    redis.lpush.assert_called_once()
    call_args = redis.lpush.call_args[0]
    assert call_args[0] == "queue:test"
    assert json.loads(call_args[1]) == {"key": "value"}


@pytest.mark.asyncio
async def test_send_to_dlq_uses_correct_key() -> None:
    redis = AsyncMock()
    await send_to_dlq(redis, "queue:dlq", "queue:analytics", '{"raw": true}', "some error")
    redis.lpush.assert_called_once()
    call_args = redis.lpush.call_args[0]
    assert call_args[0] == "queue:dlq:queue:analytics"
