"""History endpoints — the reverse-chronological log of executed sends.

Thin HTTP layer over ``app.services.history_service``. Sends are normally recorded
by the runner (see services.runner_service), so the write endpoint here exists for
explicit/non-UI callers; the rest are read/delete operations for the History tab.
The collection-level DELETE (clear all) and the item-level DELETE share the same
``/history`` base path, distinguished only by the trailing ``{history_id}``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlmodel import Session

from app.db import get_session
from app.schemas.common import ListEnvelope
from app.schemas.history import HistoryCreate, HistoryRead
from app.services import history_service

router = APIRouter(prefix="/api", tags=["history"])


@router.get("/history", response_model=ListEnvelope[HistoryRead])
def list_history(
    session: Session = Depends(get_session),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    q: str | None = Query(None, description="Substring filter on URL"),
    method: str | None = Query(None, description="Exact HTTP method filter"),
) -> ListEnvelope[HistoryRead]:
    """List history newest-first with paging + optional URL/method filters.

    ``total`` reflects the full filtered count (ignoring limit/offset) so the UI
    can render accurate paging.
    """
    items, total = history_service.list_history(
        session, limit=limit, offset=offset, q=q, method=method
    )
    return ListEnvelope[HistoryRead](items=items, total=total)


@router.get("/history/{history_id}", response_model=HistoryRead)
def get_history(history_id: str, session: Session = Depends(get_session)) -> HistoryRead:
    """Fetch a single history entry by id (404 if missing)."""
    return history_service.get_history(session, history_id)


@router.post(
    "/history",
    response_model=HistoryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_history(
    payload: HistoryCreate, session: Session = Depends(get_session)
) -> HistoryRead:
    """Explicitly record a history entry (the normal path records via /api/run)."""
    return history_service.create_history(session, payload)


@router.delete("/history/{history_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_history(history_id: str, session: Session = Depends(get_session)) -> None:
    """Delete a single history entry (404 if missing)."""
    history_service.delete_history(session, history_id)


@router.delete("/history", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def clear_history(session: Session = Depends(get_session)) -> None:
    """Clear all history entries in the default workspace."""
    history_service.clear_history(session)
