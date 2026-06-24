"""Folder update/delete endpoints.

Thin controllers delegating to ``collection_service``. PATCH supports reparenting
(``parentFolderId``); the service rejects cycles with ``conflict(...)`` -> HTTP 409.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlmodel import Session

from app.db import get_session
from app.schemas import FolderRead, FolderUpdate
from app.services import collection_service

# Full /api paths so main.py can auto-include this module by name.
router = APIRouter(prefix="/api", tags=["folders"])


@router.patch("/folders/{folder_id}", response_model=FolderRead)
def update_folder(
    folder_id: str,
    body: FolderUpdate,
    session: Session = Depends(get_session),
) -> FolderRead:
    """Partial update of a folder (name/description/sortOrder/reparent). The
    service rejects parent cycles with a 409 conflict."""
    return collection_service.update_folder(session, folder_id, body)


@router.delete("/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(folder_id: str, session: Session = Depends(get_session)) -> Response:
    """Delete a folder and everything beneath it (cascade). Returns 204."""
    collection_service.delete_folder(session, folder_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
