from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "workers"
    env: str = "dev"
    database_url: str = "postgresql+asyncpg://mock:mock@localhost:5432/mockstack"
    redis_url: str = "redis://localhost:6379/0"

    # gRPC
    ai_grpc_target: str = "ai-service:50051"
    ai_grpc_timeout_seconds: float = 30.0   # longer timeout for async workers

    # Queue settings
    reminder_queue: str = "queue:reminders"
    analytics_queue: str = "queue:analytics"
    ai_eval_queue: str = "queue:ai_eval"
    ai_report_queue: str = "queue:ai_report"
    dlq_prefix: str = "queue:dlq"
    max_retries: int = 3
    visibility_timeout: int = 30
    poll_interval_seconds: float = 1.0


settings = Settings()  # type: ignore[call-arg]
