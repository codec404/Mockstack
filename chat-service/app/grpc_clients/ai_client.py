from __future__ import annotations

import json
from typing import Any

import grpc
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings


class AIGrpcClient:
    def __init__(self) -> None:
        self._channel: grpc.aio.Channel | None = None

    def _get_channel(self) -> grpc.aio.Channel:
        if self._channel is None:
            self._channel = grpc.aio.insecure_channel(settings.ai_grpc_target)
        return self._channel

    def _stub(self, method: str):
        return self._get_channel().unary_unary(
            f"/interviewengine.InterviewEngineService/{method}",
            request_serializer=lambda data: json.dumps(data).encode("utf-8"),
            response_deserializer=lambda data: json.loads(data.decode("utf-8")),
        )

    async def _call(self, method: str, payload: dict[str, Any]) -> dict[str, Any]:
        stub = self._stub(method)
        timeout = settings.ai_grpc_timeout_seconds
        result = await stub(payload, timeout=timeout)
        return result  # type: ignore[return-value]

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=0.5, max=4), reraise=True)
    async def generate_next_question(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._call("GenerateNextQuestion", payload)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=0.5, max=4), reraise=True)
    async def evaluate(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._call("EvaluateAnswer", payload)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=0.5, max=4), reraise=True)
    async def finalize(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._call("FinalizeInterviewReport", payload)


ai_client = AIGrpcClient()
