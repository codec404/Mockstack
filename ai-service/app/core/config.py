from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "ai-service"
    env: str = "dev"
    grpc_host: str = "0.0.0.0"
    grpc_port: int = 50051
    prompt_version: str = "v1"


settings = Settings()  # type: ignore[call-arg]
