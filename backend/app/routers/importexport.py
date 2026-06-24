"""Import/Export endpoints (bonus): Postman Collection v2.1 round-trip.

  * POST /api/collections/import         -> create a collection from a v2.1 doc
  * GET  /api/collections/{id}/export    -> dump a collection as a v2.1 doc

main.py auto-includes this module by name; it exposes `router` with full
`/api/...` paths, matching the convention of the other CRUD routers.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, status
from sqlmodel import Session

from app.db import get_session
from app.postman.v21_export import export_v21
from app.postman.v21_import import import_v21
from app.schemas.collections import CollectionRead

router = APIRouter(prefix="/api", tags=["importexport"])


@router.post(
    "/collections/import",
    response_model=CollectionRead,
    status_code=status.HTTP_201_CREATED,
)
def post_import_collection(
    doc: dict[str, Any] = Body(...),
    session: Session = Depends(get_session),
) -> CollectionRead:
    """Import a Postman Collection v2.1 JSON document as a new collection."""
    return import_v21(session, doc)


@router.get("/collections/{collection_id}/export")
def get_export_collection(
    collection_id: str,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Export an existing collection as a Postman Collection v2.1 JSON document."""
    return export_v21(session, collection_id)
