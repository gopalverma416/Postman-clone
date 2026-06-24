"""RunError construction + classification of httpx exceptions."""
from __future__ import annotations

import httpx

from app.schemas.run import RunError, RunErrorCode


class RunnerException(Exception):
    """Raised inside the runner to short-circuit into a typed RunError."""

    def __init__(self, code: RunErrorCode, message: str, detail: object | None = None):
        self.code = code
        self.message = message
        self.detail = detail
        super().__init__(message)

    def to_error(self) -> RunError:
        return RunError(code=self.code, message=self.message, detail=self.detail)


def classify_httpx_error(exc: Exception, timeout_ms: int) -> RunError:
    """Map an httpx/SSL/network exception to a friendly typed RunError."""
    # Timeouts (connect/read/write/pool).
    if isinstance(exc, httpx.TimeoutException):
        return RunError(
            code="TIMEOUT",
            message=f"The request timed out after {timeout_ms} ms.",
            detail={"timeoutMs": timeout_ms, "phase": type(exc).__name__},
        )
    if isinstance(exc, httpx.TooManyRedirects):
        return RunError(
            code="TOO_MANY_REDIRECTS",
            message="Exceeded the maximum number of redirects.",
            detail=str(exc),
        )
    # TLS / certificate verification failures surface as ConnectError wrapping SSLError.
    msg = str(exc).lower()
    if "certificate" in msg or "ssl" in msg or "tls" in msg:
        return RunError(
            code="TLS_ERROR",
            message="TLS certificate could not be verified. You can disable TLS verification in settings for this request.",
            detail=str(exc),
        )
    if isinstance(exc, (httpx.ConnectError, httpx.ConnectTimeout)):
        return RunError(
            code="CONNECTION_ERROR",
            message="Could not connect to the server. The host may be down or the name could not be resolved.",
            detail=str(exc),
        )
    if isinstance(exc, httpx.InvalidURL):
        return RunError(
            code="INVALID_URL",
            message="The URL is not valid. Check the scheme (http/https) and host.",
            detail=str(exc),
        )
    if isinstance(exc, httpx.HTTPError):
        return RunError(
            code="CONNECTION_ERROR",
            message="The request could not be completed due to a network error.",
            detail=str(exc),
        )
    return RunError(
        code="UPSTREAM_ERROR",
        message="An unexpected error occurred while sending the request.",
        detail=str(exc),
    )
