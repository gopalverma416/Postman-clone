"""Collection / Folder-create / Request-create CRUD endpoints.

Thin HTTP controllers: they validate/shape the request, set path-derived ids on
the incoming body, then delegate every bit of persistence and DTO assembly to
``collection_service``. They never touch ORM rows directly and never build the
``*Read`` DTOs themselves — the service owns the snake_case<->camelCase mapping
and the wire<->DB body-token translation (see app/services/collection_service).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlmodel import Session

from app.db import get_session
from app.schemas import (
    CollectionCreate,
    CollectionRead,
    CollectionUpdate,
    FolderCreate,
    FolderRead,
    ListEnvelope,
    RequestCreate,
    RequestRead,
)
from app.services import collection_service

# Full /api paths so main.py can auto-include this module by name.
router = APIRouter(prefix="/api", tags=["collections"])


# --------------------------------------------------------------------------- #
# Collections
# --------------------------------------------------------------------------- #
@router.get("/collections", response_model=ListEnvelope[CollectionRead])
def list_collections(session: Session = Depends(get_session)) -> ListEnvelope[CollectionRead]:
    """List all collections in the default workspace, each fully tree-expanded
    with its folders and request summaries."""
    items = collection_service.list_collections(session)
    return ListEnvelope[CollectionRead](items=items, total=len(items))


@router.post("/collections", response_model=CollectionRead, status_code=status.HTTP_201_CREATED)
def create_collection(
    body: CollectionCreate, session: Session = Depends(get_session)
) -> CollectionRead:
    """Create a new collection under the default workspace."""
    return collection_service.create_collection(session, body)


@router.get("/collections/{collection_id}", response_model=CollectionRead)
def get_collection(
    collection_id: str, session: Session = Depends(get_session)
) -> CollectionRead:
    """Fetch a single collection (tree-expanded). 404 if it does not exist."""
    return collection_service.get_collection(session, collection_id)


@router.patch("/collections/{collection_id}", response_model=CollectionRead)
def update_collection(
    collection_id: str,
    body: CollectionUpdate,
    session: Session = Depends(get_session),
) -> CollectionRead:
    """Partial update of a collection's name/description/sortOrder."""
    return collection_service.update_collection(session, collection_id, body)


@router.delete("/collections/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(
    collection_id: str, session: Session = Depends(get_session)
) -> Response:
    """Delete a collection and everything beneath it (cascade). Returns 204."""
    collection_service.delete_collection(session, collection_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Folder / Request creation nested under a collection
# --------------------------------------------------------------------------- #
@router.post(
    "/collections/{collection_id}/folders",
    response_model=FolderRead,
    status_code=status.HTTP_201_CREATED,
)
def create_folder(
    collection_id: str,
    body: FolderCreate,
    session: Session = Depends(get_session),
) -> FolderRead:
    """Create a folder inside the given collection. The path collection id wins
    over whatever the body carried, so the URL is the source of truth."""
    body.collection_id = collection_id
    return collection_service.create_folder(session, collection_id, body)


@router.post(
    "/collections/{collection_id}/requests",
    response_model=RequestRead,
    status_code=status.HTTP_201_CREATED,
)
def create_request(
    collection_id: str,
    body: RequestCreate,
    session: Session = Depends(get_session),
) -> RequestRead:
    """Create a saved request inside the given collection. The path collection id
    is authoritative (overrides the body's collectionId)."""
    body.collection_id = collection_id
    return collection_service.create_request(session, collection_id, body)
