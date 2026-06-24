"""Saved-request fetch/update/delete endpoints.

Thin controllers delegating to ``collection_service``. The service assembles the
full ``RequestRead`` from the request row plus its header/param/form-field child
tables and handles the wire<->DB body-token translation
('x-www-form-urlencoded' <-> 'urlencoded').
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlmodel import Session

from app.db import get_session
from app.schemas import RequestRead, RequestUpdate
from app.services import collection_service

# Full /api paths so main.py can auto-include this module by name.
router = APIRouter(prefix="/api", tags=["requests"])


@router.get("/requests/{request_id}", response_model=RequestRead)
def get_request(request_id: str, session: Session = Depends(get_session)) -> RequestRead:
    """Fetch a single saved request as a full ``RequestRead``. 404 if missing."""
    return collection_service.get_request(session, request_id)


@router.patch("/requests/{request_id}", response_model=RequestRead)
def update_request(
    request_id: str,
    body: RequestUpdate,
    session: Session = Depends(get_session),
) -> RequestRead:
    """Partial update of a saved request (scalars + child key/value lists +
    auth/body). Returns the re-assembled ``RequestRead``."""
    return collection_service.update_request(session, request_id, body)


@router.delete("/requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_request(request_id: str, session: Session = Depends(get_session)) -> Response:
    """Delete a saved request and its child rows (cascade). Returns 204."""
    collection_service.delete_request(session, request_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
