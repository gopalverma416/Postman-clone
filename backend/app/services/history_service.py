"""History read/list/create/delete service.

The *write* path for the normal "send a request" flow lives in
``runner_service`` — every ``POST /api/run`` records a ``HistoryEntry`` row.
This service covers the remaining History-tab operations: listing (newest
first, with optional text/method filters), fetching a single entry, an explicit
``POST /api/history`` create (used by callers that record sends out-of-band), and
deletion (single + clear-all).

History rows are stored DENORMALIZED: the resolved request is a JSON
``request_snapshot`` and the response summary is spread across nullable columns.
On read we rehydrate those into the camelCase ``HistoryRead`` DTO (never returning
raw ORM rows), parsing ``request_snapshot`` back into a ``RequestSpec`` and, when a
status code was captured, rebuilding a ``RunResponse`` preview.
"""
from __future__ import annotations

import json

from sqlmodel import Session, func, select

from app.api_errors import not_found
from app.models import HistoryEntry
from app.schemas.history import HistoryCreate, HistoryRead
from app.schemas.request_spec import RequestSpec
from app.schemas.run import RunResponse
from app.services.collection_service import get_default_workspace


# --------------------------------------------------------------------------- #
# DTO mapping
# --------------------------------------------------------------------------- #
def _to_dto(row: HistoryEntry) -> HistoryRead:
    """Build the camelCase HistoryRead DTO from a denormalized ORM row.

    ``request_snapshot`` is parsed back into a RequestSpec. When the send reached
    a server (``status_code`` is not None) we reconstruct a RunResponse preview
    from the stored summary columns; failed sends (timeout/network) leave it None.
    """
    # Rehydrate the point-in-time request spec from its JSON snapshot.
    snapshot = RequestSpec.model_validate_json(row.request_snapshot)

    response_preview: RunResponse | None = None
    if row.status_code is not None:
        # A binary response was stored with no text body but a non-zero size; infer
        # the flag so the UI shows the "binary, not previewed" notice on reopen.
        is_binary = (row.response_body is None or row.response_body == "") and (row.response_size_bytes or 0) > 0
        response_preview = RunResponse(
            status=row.status_code,
            reason=row.status_text or "",
            ok=200 <= row.status_code < 400,
            headers=json.loads(row.response_headers or "[]"),
            content_type=row.response_content_type,
            body=row.response_body,
            is_binary=is_binary,
            truncated=False,
            size_bytes=row.response_size_bytes or 0,
            declared_content_length=None,
            header_bytes=0,
            final_url=row.url,
            redirect_chain=[],
            http_version="HTTP/1.1",
        )

    return HistoryRead(
        id=row.id,
        method=row.method,
        url=row.url,
        status=row.status_code,
        ok=(not row.is_error and row.status_code is not None and 200 <= row.status_code < 400),
        time_ms=row.response_time_ms,
        size_bytes=row.response_size_bytes,
        sent_at=row.sent_at,
        request_snapshot=snapshot,
        response_preview=response_preview,
    )


# --------------------------------------------------------------------------- #
# List
# --------------------------------------------------------------------------- #
def list_history(
    session: Session,
    limit: int = 100,
    offset: int = 0,
    q: str | None = None,
    method: str | None = None,
) -> tuple[list[HistoryRead], int]:
    """Return (items, total) for the default workspace, newest-first.

    ``q`` is a case-insensitive substring filter on the URL; ``method`` is an exact
    match. ``total`` is the count of matching rows *before* limit/offset is applied
    so the UI can paginate.
    """
    workspace = get_default_workspace(session)

    # Shared WHERE clause for both the page query and the total count.
    conditions = [HistoryEntry.workspace_id == workspace.id]
    if q:
        # ILIKE-style case-insensitive contains. SQLite's LIKE is already
        # case-insensitive for ASCII; we lower() both sides to be explicit.
        conditions.append(func.lower(HistoryEntry.url).like(f"%{q.lower()}%"))
    if method:
        conditions.append(HistoryEntry.method == method)

    total = session.exec(
        select(func.count()).select_from(HistoryEntry).where(*conditions)
    ).one()

    rows = session.exec(
        select(HistoryEntry)
        .where(*conditions)
        .order_by(HistoryEntry.sent_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    return [_to_dto(r) for r in rows], int(total)


# --------------------------------------------------------------------------- #
# Get one
# --------------------------------------------------------------------------- #
def get_history(session: Session, id: str) -> HistoryRead:
    """Fetch a single history entry, or raise not_found('history', id)."""
    row = session.get(HistoryEntry, id)
    if row is None:
        raise not_found("history", id)
    return _to_dto(row)


# --------------------------------------------------------------------------- #
# Create (explicit out-of-band record)
# --------------------------------------------------------------------------- #
def create_history(session: Session, payload: HistoryCreate) -> HistoryRead:
    """Insert a history entry from an explicit POST payload.

    Method and URL are taken from the resolved snapshot. When a response preview
    is supplied we persist its status/headers/body/content-type summary; otherwise
    those columns stay NULL (a failed/no-response send).
    """
    workspace = get_default_workspace(session)
    snapshot = payload.snapshot
    preview = payload.response_preview

    entry = HistoryEntry(
        workspace_id=workspace.id,
        request_id=payload.request_id,
        environment_id=payload.environment_id,
        method=snapshot.method,
        url=snapshot.url,
        # Store the exact resolved spec for faithful reopen/replay.
        request_snapshot=snapshot.model_dump_json(by_alias=True),
        status_code=payload.status,
        status_text=(preview.reason if preview else None),
        response_time_ms=payload.time_ms,
        response_size_bytes=payload.size_bytes,
        response_headers=(json.dumps(preview.headers) if preview else None),
        response_body=(preview.body if preview else None),
        response_content_type=(preview.content_type if preview else None),
        # is_error is the inverse of a successful (ok) send.
        is_error=not payload.ok,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return _to_dto(entry)


# --------------------------------------------------------------------------- #
# Delete
# --------------------------------------------------------------------------- #
def delete_history(session: Session, id: str) -> None:
    """Delete a single history entry, or raise not_found('history', id)."""
    row = session.get(HistoryEntry, id)
    if row is None:
        raise not_found("history", id)
    session.delete(row)
    session.commit()


def clear_history(session: Session) -> int:
    """Delete every history entry for the default workspace; return the count."""
    workspace = get_default_workspace(session)
    rows = session.exec(
        select(HistoryEntry).where(HistoryEntry.workspace_id == workspace.id)
    ).all()
    count = len(rows)
    for row in rows:
        session.delete(row)
    session.commit()
    return count
