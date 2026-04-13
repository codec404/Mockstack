from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.routes import router as v1_router
from app.core.config import settings
from app.core.errors import AppError, app_error_handler
from app.core.observability import request_logging_middleware
from app.db.database import engine
from app.db.models import Base

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(_: FastAPI):
    last_error: Exception | None = None
    for attempt in range(1, 31):
        try:
            async with engine.begin() as conn:
                # create_all is idempotent for tables but not for PG enum types on re-deploy;
                # checkfirst=True skips objects that already exist.
                await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))
            last_error = None
            log.info("database_ready", attempt=attempt)
            break
        except Exception as exc:
            last_error = exc
            log.warning("database_init_retry", attempt=attempt, error=str(exc))
            await asyncio.sleep(2)
    if last_error:
        raise last_error
    yield
    await engine.dispose()


app = FastAPI(
    title="Mockstack Chat Service",
    version="1.0.0",
    docs_url="/docs" if settings.env != "production" else None,
    redoc_url="/redoc" if settings.env != "production" else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(request_logging_middleware)
app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "VALIDATION_ERROR", "detail": exc.errors()}},
    )


app.include_router(v1_router, prefix="/api/v1")


@app.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name, "env": settings.env}
