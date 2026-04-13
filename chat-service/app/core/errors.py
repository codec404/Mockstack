from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, status_code: int, code: str, detail: str) -> None:
        self.status_code = status_code
        self.code = code
        self.detail = detail
        super().__init__(detail)


class NotFoundError(AppError):
    def __init__(self, resource: str) -> None:
        super().__init__(404, "NOT_FOUND", f"{resource} not found")


class ConflictError(AppError):
    def __init__(self, detail: str) -> None:
        super().__init__(409, "CONFLICT", detail)


class ForbiddenError(AppError):
    def __init__(self, detail: str = "Insufficient permissions") -> None:
        super().__init__(403, "FORBIDDEN", detail)


class UnauthorizedError(AppError):
    def __init__(self, detail: str = "Authentication required") -> None:
        super().__init__(401, "UNAUTHORIZED", detail)


class BadRequestError(AppError):
    def __init__(self, detail: str) -> None:
        super().__init__(400, "BAD_REQUEST", detail)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "detail": exc.detail}},
    )
