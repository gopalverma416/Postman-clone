"""History DTOs."""
from __future__ import annotations

from app.schemas.common import CamelModel
from app.schemas.request_spec import HttpMethod, RequestSpec
from app.schemas.run import RunResponse


class HistoryCreate(CamelModel):
    """Optional explicit history creation (the normal path records via /api/run)."""

    request_id: str | None = None
    environment_id: str | None = None
    snapshot: RequestSpec
    status: int | None = None
    ok: bool = False
    time_ms: int | None = None
    size_bytes: int | None = None
    response_preview: RunResponse | None = None


class HistoryRead(CamelModel):
    id: str
    method: HttpMethod
    url: str
    status: int | None = None
    ok: bool = False
    time_ms: int | None = None
    size_bytes: int | None = None
    sent_at: str
    request_snapshot: RequestSpec
    response_preview: RunResponse | None = None
