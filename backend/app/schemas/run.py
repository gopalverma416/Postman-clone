"""Run (proxy/runner) wire contract: RunRequest in, RunResult out.

POST /api/run ALWAYS returns HTTP 200 with a RunResult envelope. Upstream
failures (timeout, network, invalid URL, blocked host) come back as ok=false with
a typed RunError — they are not HTTP errors of our API.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.common import CamelModel
from app.schemas.request_spec import RequestSpec

RunErrorCode = Literal[
    "INVALID_URL",
    "BLOCKED_HOST",
    "TIMEOUT",
    "CONNECTION_ERROR",
    "TLS_ERROR",
    "TOO_MANY_REDIRECTS",
    "UNSUPPORTED_BODY",
    "UPSTREAM_ERROR",
]


class RunOptions(CamelModel):
    timeout_ms: int | None = None
    follow_redirects: bool = True
    max_redirects: int | None = None
    max_response_bytes: int | None = None
    verify_tls: bool = True
    block_private_hosts: bool | None = None  # defaults to SAFE_MODE at runtime


class RunRequest(CamelModel):
    request: RequestSpec
    options: RunOptions = Field(default_factory=RunOptions)
    record_history: bool = True
    request_id: str | None = None
    environment_id: str | None = None


class RedirectHop(CamelModel):
    status: int
    location: str
    url: str


class RunResponse(CamelModel):
    status: int
    reason: str
    ok: bool
    headers: list[dict[str, str]]  # [{key, value}] preserves duplicates
    content_type: str | None = None
    body: str | None = None
    is_binary: bool = False
    truncated: bool = False
    size_bytes: int = 0
    declared_content_length: int | None = None
    header_bytes: int = 0
    final_url: str = ""
    redirect_chain: list[RedirectHop] = Field(default_factory=list)
    http_version: str = "HTTP/1.1"


class RunError(CamelModel):
    code: RunErrorCode
    message: str
    detail: Any | None = None


class RunResult(CamelModel):
    ok: bool
    response: RunResponse | None = None
    error: RunError | None = None
    timing_ms: float = 0
    size_bytes: int = 0
    history_id: str | None = None
