from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Application
    app_name: str = "chat-service"
    env: str = "dev"
    host: str = "0.0.0.0"
    port: int = 8000

    # Database
    database_url: str = "postgresql+asyncpg://mock:mock@localhost:5432/mockstack"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_hours: int = 72

    # gRPC
    ai_grpc_target: str = "ai-service:50051"
    ai_grpc_timeout_seconds: float = 10.0

    # CORS – comma-separated origins (overridden via env in production)
    cors_origins: str = "http://localhost:4200,http://127.0.0.1:4200"

    # Queues (shared naming with workers)
    ai_eval_queue: str = "queue:ai_eval"
    ai_report_queue: str = "queue:ai_report"

    # Security
    max_request_body_bytes: int = 1_048_576  # 1 MB

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()  # type: ignore[call-arg]
