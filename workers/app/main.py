from __future__ import annotations

import asyncio
import logging
import signal

import structlog
from redis.asyncio import Redis

from app.core.config import settings
from app.jobs.ai_job import process_ai_eval_job, process_ai_report_job
from app.jobs.analytics_job import process_analytics_job
from app.jobs.reminder_job import process_reminder_job

structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

log = structlog.get_logger()
_running = True


async def worker_loop() -> None:
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    log.info("workers_started", queues=[
        settings.reminder_queue,
        settings.analytics_queue,
        settings.ai_eval_queue,
        settings.ai_report_queue,
    ])

    while _running:
        try:
            # AI jobs are highest priority — process first each tick
            await process_ai_eval_job(redis)
            await process_ai_report_job(redis)
            await process_reminder_job(redis)
            await process_analytics_job(redis)
        except Exception as exc:
            log.error("worker_loop_error", error=str(exc))
            await asyncio.sleep(settings.poll_interval_seconds)


def _handle_shutdown(signum, frame) -> None:
    global _running
    log.info("workers_shutdown_signal_received", signal=signum)
    _running = False


def run() -> None:
    signal.signal(signal.SIGINT, _handle_shutdown)
    signal.signal(signal.SIGTERM, _handle_shutdown)
    asyncio.run(worker_loop())


if __name__ == "__main__":
    run()
