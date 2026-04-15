"""
AI evaluation and report generation worker jobs.

queue:ai_eval  → evaluate_answer | generate_first_question
queue:ai_report → finalize_report
"""
from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

import grpc
import structlog
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings
from app.core.queue import dequeue, enqueue, send_to_dlq

log = structlog.get_logger()

_engine = create_async_engine(settings.database_url, pool_pre_ping=True)
_session_factory = async_sessionmaker(_engine, expire_on_commit=False)


# ── Lightweight gRPC client ────────────────────────────────────────────────────

class _AIClient:
    def __init__(self) -> None:
        self._channel: grpc.aio.Channel | None = None

    def _ch(self) -> grpc.aio.Channel:
        if self._channel is None:
            self._channel = grpc.aio.insecure_channel(settings.ai_grpc_target)
        return self._channel

    def _stub(self, method: str):
        return self._ch().unary_unary(
            f"/interviewengine.InterviewEngineService/{method}",
            request_serializer=lambda d: json.dumps(d).encode("utf-8"),
            response_deserializer=lambda d: json.loads(d.decode("utf-8")),
        )

    async def _call(self, method: str, payload: dict[str, Any]) -> dict[str, Any]:
        result = await self._stub(method)(payload, timeout=settings.ai_grpc_timeout_seconds)
        return result  # type: ignore[return-value]

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, max=8), reraise=True)
    async def generate_next_question(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._call("GenerateNextQuestion", payload)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, max=8), reraise=True)
    async def evaluate(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._call("EvaluateAnswer", payload)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, max=8), reraise=True)
    async def finalize(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._call("FinalizeInterviewReport", payload)


_ai = _AIClient()


# ── Public processors ──────────────────────────────────────────────────────────

async def process_ai_eval_job(redis: Redis) -> None:
    raw, data = await dequeue(redis, settings.ai_eval_queue, timeout=1)
    if data is None:
        return

    job_type = data.get("type", "generate_next_question")
    try:
        if job_type == "generate_first_question":
            await _handle_first_question(data)
        else:
            # Both "generate_next_question" and legacy "evaluate_answer" types
            await _handle_generate_next_question(data)
    except Exception as exc:
        retries = data.get("retries", 0) + 1
        log.error("ai_eval_job_failed type=%s error=%s retries=%d", job_type, exc, retries)
        if retries >= settings.max_retries:
            await send_to_dlq(redis, settings.dlq_prefix, settings.ai_eval_queue, raw or "", str(exc))
        else:
            data["retries"] = retries
            await redis.lpush(settings.ai_eval_queue, json.dumps(data))


async def process_ai_report_job(redis: Redis) -> None:
    raw, data = await dequeue(redis, settings.ai_report_queue, timeout=1)
    if data is None:
        return

    try:
        await _handle_finalize(data)
        user_id = data.get("user_id")
        if user_id:
            await enqueue(redis, settings.analytics_queue, {
                "type": "recompute_user",
                "user_id": user_id,
            })
    except Exception as exc:
        retries = data.get("retries", 0) + 1
        log.error("ai_report_job_failed", error=str(exc), retries=retries)
        if retries >= settings.max_retries:
            await send_to_dlq(redis, settings.dlq_prefix, settings.ai_report_queue, raw or "", str(exc))
        else:
            data["retries"] = retries
            await redis.lpush(settings.ai_report_queue, json.dumps(data))


# ── Handlers ───────────────────────────────────────────────────────────────────

async def _handle_first_question(data: dict[str, Any]) -> None:
    interview_id = data["interview_id"]
    result = await _ai.generate_next_question({
        "interview_id": interview_id,
        "domain": data["domain"],
        "difficulty": data["difficulty"],
        "experience_level": data.get("experience_level", "0"),
        "tech_stacks": data.get("tech_stacks", []),
        "transcript": "",
    })
    async with _session_factory() as db:
        # id is autoincrement Integer — omit it; interview_id must be uuid.UUID for asyncpg
        await db.execute(
            text("""
                INSERT INTO interview_messages (interview_id, role, content, created_at)
                VALUES (:interview_id, 'assistant', :content, :now)
            """),
            {
                "interview_id": uuid.UUID(interview_id),
                "content": result["question"],
                "now": datetime.now(UTC).replace(tzinfo=None),
            },
        )
        await db.commit()
    log.info("first_question_stored", interview_id=interview_id)


async def _handle_generate_next_question(data: dict[str, Any]) -> None:
    """
    Called after a user sends a message.
    Generates only the next question — no per-answer scoring.
    All evaluation happens in batch when the session ends.
    """
    interview_id = data["interview_id"]
    history = data.get("history", [])   # list of {role, content}

    result = await _ai.generate_next_question({
        "interview_id": interview_id,
        "domain": data["domain"],
        "difficulty": data["difficulty"],
        "history": history,
    })

    async with _session_factory() as db:
        await db.execute(
            text("""
                INSERT INTO interview_messages (interview_id, role, content, created_at)
                VALUES (:interview_id, 'assistant', :content, :now)
            """),
            {
                "interview_id": uuid.UUID(interview_id),
                "content": result["question"],
                "now": datetime.now(UTC).replace(tzinfo=None),
            },
        )
        await db.commit()
    log.info("next_question_stored interview_id=%s", interview_id)


async def _handle_finalize(data: dict[str, Any]) -> None:
    """
    Load the full Q&A transcript and send it to the AI in one batch call.
    The AI evaluates all answers at once and generates the report.
    """
    interview_id = data["interview_id"]
    iid = uuid.UUID(interview_id)

    async with _session_factory() as db:
        msgs_result = await db.execute(
            text("""
                SELECT id, role, content FROM interview_messages
                WHERE interview_id = :iid ORDER BY created_at
            """),
            {"iid": iid},
        )
        rows = msgs_result.fetchall()

        iv_result = await db.execute(
            text("SELECT domain, difficulty FROM interviews WHERE id = :iid"),
            {"iid": iid},
        )
        iv_row = iv_result.fetchone()
        domain = iv_row[0] if iv_row else "general"
        difficulty = iv_row[1] if iv_row else "medium"

    # Build a structured Q&A transcript for the LLM
    history = [{"role": r[1], "content": r[2]} for r in rows]
    msg_ids_by_index = [r[0] for r in rows if r[1] == "user"]  # user message ids in order

    report = await _ai.finalize({
        "interview_id": interview_id,
        "domain": domain,
        "difficulty": difficulty,
        "history": history,   # full conversation: AI questions + user answers
    })

    now = datetime.now(UTC).replace(tzinfo=None)

    # Persist per-answer scores returned by the batch evaluation
    qa_evaluations: list[dict[str, Any]] = report.get("qa_evaluations", [])
    async with _session_factory() as db:
        for i, qa in enumerate(qa_evaluations):
            if i < len(msg_ids_by_index):
                await db.execute(
                    text("""
                        UPDATE interview_messages
                        SET score = :score, clarity = :clarity
                        WHERE id = :id
                    """),
                    {
                        "score": qa.get("score"),
                        "clarity": qa.get("clarity"),
                        "id": msg_ids_by_index[i],
                    },
                )

        await db.execute(
            text("""
                INSERT INTO interview_evaluations
                    (interview_id, average_score, clarity_score,
                     strengths, weaknesses, weak_topics, improvement_points, summary, created_at)
                VALUES
                    (:interview_id, :avg_score, :clarity_score,
                     CAST(:strengths AS jsonb), CAST(:weaknesses AS jsonb),
                     CAST(:weak_topics AS jsonb), CAST(:improvement_points AS jsonb),
                     :summary, :now)
                ON CONFLICT (interview_id) DO UPDATE SET
                    average_score      = EXCLUDED.average_score,
                    clarity_score      = EXCLUDED.clarity_score,
                    strengths          = EXCLUDED.strengths,
                    weaknesses         = EXCLUDED.weaknesses,
                    weak_topics        = EXCLUDED.weak_topics,
                    improvement_points = EXCLUDED.improvement_points,
                    summary            = EXCLUDED.summary,
                    created_at         = EXCLUDED.created_at
            """),
            {
                "interview_id": iid,
                "avg_score": report["average_score"],
                "clarity_score": report["clarity_score"],
                "strengths": json.dumps(report["strengths"]),
                "weaknesses": json.dumps(report["weaknesses"]),
                "weak_topics": json.dumps(report["weak_topics"]),
                "improvement_points": json.dumps(report["improvement_points"]),
                "summary": report["summary"],
                "now": now,
            },
        )
        await db.commit()
    log.info("report_stored interview_id=%s score=%s", interview_id, report.get("average_score"))
