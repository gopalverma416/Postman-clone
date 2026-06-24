"""Shared CRUD error type + helpers, mapped to {error:{code,message,...}} responses
by the handlers registered in main.py. Kept separate to avoid circular imports
between routers/services and the app factory."""
from __future__ import annotations


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        resource: str | None = None,
        id: str | None = None,
    ):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.resource = resource
        self.id = id
        super().__init__(message)


def not_found(resource: str, id: str) -> ApiError:
    return ApiError(404, "NOT_FOUND", f"{resource} not found.", resource=resource, id=id)


def conflict(message: str) -> ApiError:
    return ApiError(409, "CONFLICT", message)
