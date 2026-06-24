"""Collection / Folder / Request CRUD and tree assembly.

This service owns the sidebar tree: collections, their nested folders, and the
lightweight request summaries that hang off them. All functions are synchronous
and take a SQLModel `Session` (from `Depends(get_session)`).

Boundaries / rules honored here:
  * Single default workspace (``is_default=True``); resolved via
    :func:`get_default_workspace`, created on demand if missing.
  * snake_case DB columns are mapped to camelCase JSON exclusively through the
    CamelModel ``*Read`` DTOs — we never hand a raw ORM row back to the router.
  * Body-mode token translation (wire ``x-www-form-urlencoded`` <-> DB
    ``urlencoded``) and the full nested-request assembly/persistence live in
    ``request_service``; this module only delegates to it for request bodies.
  * Folder reparenting rejects cycles (a folder may not become a descendant of
    itself) with a 409 ``conflict``.
"""
from __future__ import annotations

from sqlmodel import Session, select

from app.api_errors import conflict, not_found
from app.models import (
    Collection,
    Folder,
    Request,
    Workspace,
    utcnow_iso,
)
from app.schemas import (
    CollectionCreate,
    CollectionRead,
    CollectionUpdate,
    FolderCreate,
    FolderRead,
    FolderUpdate,
    RequestCreate,
    RequestRead,
    RequestSummary,
    RequestUpdate,
)
from app.services.request_service import (
    apply_request_update,
    assemble_request_read,
    persist_new_request,
)


# --------------------------------------------------------------------------- #
# Workspace
# --------------------------------------------------------------------------- #
def get_default_workspace(session: Session) -> Workspace:
    """Return the single default workspace, creating one if none exists.

    The app is single-user / single-workspace for now, so collections and
    environments always hang off this one row. We prefer the flagged default,
    fall back to any workspace, and only then seed a fresh one.
    """
    ws = session.exec(select(Workspace).where(Workspace.is_default == True)).first()  # noqa: E712
    if ws is None:
        ws = session.exec(select(Workspace)).first()
    if ws is None:
        ws = Workspace(name="My Workspace", is_default=True)
        session.add(ws)
        session.commit()
        session.refresh(ws)
    return ws


# --------------------------------------------------------------------------- #
# Tree assembly helpers
# --------------------------------------------------------------------------- #
def _folder_read(folder: Folder) -> FolderRead:
    """Map a Folder ORM row to its camelCase DTO."""
    return FolderRead(
        id=folder.id,
        collection_id=folder.collection_id,
        parent_folder_id=folder.parent_folder_id,
        name=folder.name,
        description=folder.description,
        sort_order=folder.sort_order,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
    )


def _request_summary(req: Request) -> RequestSummary:
    """Map a Request ORM row to the lightweight tree-node DTO."""
    return RequestSummary(
        id=req.id,
        name=req.name,
        method=req.method,
        folder_id=req.folder_id,
        sort_order=req.sort_order,
    )


def _assemble_collection(session: Session, collection: Collection) -> CollectionRead:
    """Build a fully tree-expanded CollectionRead for one collection.

    Folders and requests are loaded collection-scoped (denormalized
    ``collection_id`` on request makes this a single indexed query each) and
    returned sorted by ``sort_order``.
    """
    folders = session.exec(
        select(Folder)
        .where(Folder.collection_id == collection.id)
        .order_by(Folder.sort_order)
    ).all()
    requests = session.exec(
        select(Request)
        .where(Request.collection_id == collection.id)
        .order_by(Request.sort_order)
    ).all()

    return CollectionRead(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        sort_order=collection.sort_order,
        created_at=collection.created_at,
        updated_at=collection.updated_at,
        folders=[_folder_read(f) for f in folders],
        requests=[_request_summary(r) for r in requests],
    )


# --------------------------------------------------------------------------- #
# Collection CRUD
# --------------------------------------------------------------------------- #
def list_collections(session: Session) -> list[CollectionRead]:
    """All collections in the default workspace, each fully tree-expanded.

    Collections are ordered by ``sort_order`` then ``created_at`` so the sidebar
    is stable even when two collections share a sort order.
    """
    workspace = get_default_workspace(session)
    collections = session.exec(
        select(Collection)
        .where(Collection.workspace_id == workspace.id)
        .order_by(Collection.sort_order, Collection.created_at)
    ).all()
    return [_assemble_collection(session, c) for c in collections]


def _require_collection(session: Session, collection_id: str) -> Collection:
    """Fetch a Collection or raise a 404."""
    collection = session.get(Collection, collection_id)
    if collection is None:
        raise not_found("Collection", collection_id)
    return collection


def get_collection(session: Session, collection_id: str) -> CollectionRead:
    """A single fully tree-expanded collection (404 if missing)."""
    collection = _require_collection(session, collection_id)
    return _assemble_collection(session, collection)


def create_collection(session: Session, payload: CollectionCreate) -> CollectionRead:
    """Create a collection in the default workspace, appended to the end.

    ``sort_order`` is one past the current max within the workspace so a new
    collection always lands at the bottom of the sidebar.
    """
    workspace = get_default_workspace(session)
    siblings = session.exec(
        select(Collection.sort_order).where(Collection.workspace_id == workspace.id)
    ).all()
    next_order = (max(siblings) + 1) if siblings else 0

    collection = Collection(
        workspace_id=workspace.id,
        name=payload.name,
        description=payload.description,
        sort_order=next_order,
    )
    session.add(collection)
    session.commit()
    session.refresh(collection)
    return _assemble_collection(session, collection)


def update_collection(
    session: Session, collection_id: str, payload: CollectionUpdate
) -> CollectionRead:
    """Rename / re-describe / reorder a collection; bumps ``updated_at``."""
    collection = _require_collection(session, collection_id)

    if payload.name is not None:
        collection.name = payload.name
    if payload.description is not None:
        collection.description = payload.description
    if payload.sort_order is not None:
        collection.sort_order = payload.sort_order
    collection.updated_at = utcnow_iso()

    session.add(collection)
    session.commit()
    session.refresh(collection)
    return _assemble_collection(session, collection)


def delete_collection(session: Session, collection_id: str) -> None:
    """Delete a collection; FK CASCADE removes folders, requests and child rows."""
    collection = _require_collection(session, collection_id)
    session.delete(collection)
    session.commit()


# --------------------------------------------------------------------------- #
# Folder CRUD
# --------------------------------------------------------------------------- #
def _require_folder(session: Session, folder_id: str) -> Folder:
    """Fetch a Folder or raise a 404."""
    folder = session.get(Folder, folder_id)
    if folder is None:
        raise not_found("Folder", folder_id)
    return folder


def create_folder(
    session: Session, collection_id: str, payload: FolderCreate
) -> FolderRead:
    """Create a folder inside a collection (optionally nested under a parent).

    The collection must exist. ``sort_order`` is appended among siblings, where
    "siblings" means folders sharing the same ``parent_folder_id`` within the
    collection (NULL parent = directly under the collection).
    """
    _require_collection(session, collection_id)

    parent_id = payload.parent_folder_id
    if parent_id is not None:
        # Validate the parent exists and belongs to the same collection.
        parent = _require_folder(session, parent_id)
        if parent.collection_id != collection_id:
            raise conflict("Parent folder belongs to a different collection.")

    sibling_orders = session.exec(
        select(Folder.sort_order)
        .where(Folder.collection_id == collection_id)
        .where(Folder.parent_folder_id == parent_id)
    ).all()
    next_order = (max(sibling_orders) + 1) if sibling_orders else 0

    folder = Folder(
        collection_id=collection_id,
        parent_folder_id=parent_id,
        name=payload.name,
        description=payload.description,
        sort_order=next_order,
    )
    session.add(folder)
    session.commit()
    session.refresh(folder)
    return _folder_read(folder)


def _would_create_cycle(session: Session, folder_id: str, new_parent_id: str) -> bool:
    """True if making ``new_parent_id`` the parent of ``folder_id`` forms a cycle.

    Walk up the prospective parent chain; if we ever reach ``folder_id`` it means
    the new parent is the folder itself or one of its descendants, which would
    create a loop. A defensive visited-set guards against pre-existing cycles.
    """
    seen: set[str] = set()
    cursor: str | None = new_parent_id
    while cursor is not None:
        if cursor == folder_id:
            return True
        if cursor in seen:
            # Pre-existing loop in the data; stop rather than spin forever.
            break
        seen.add(cursor)
        ancestor = session.get(Folder, cursor)
        if ancestor is None:
            break
        cursor = ancestor.parent_folder_id
    return False


def update_folder(session: Session, folder_id: str, payload: FolderUpdate) -> FolderRead:
    """Rename / re-describe / reorder / reparent a folder.

    Reparenting is cycle-checked: a folder cannot become its own parent, nor be
    moved into one of its own descendants. Either violation raises a 409.
    """
    folder = _require_folder(session, folder_id)

    if payload.name is not None:
        folder.name = payload.name
    if payload.description is not None:
        folder.description = payload.description
    if payload.sort_order is not None:
        folder.sort_order = payload.sort_order

    # `parent_folder_id` is nullable, so "field present in payload" matters more
    # than "value is not None": moving a folder to the collection root sets it to
    # None. model_fields_set tells us whether the client actually sent the field.
    if "parent_folder_id" in payload.model_fields_set:
        new_parent_id = payload.parent_folder_id
        if new_parent_id is not None:
            if new_parent_id == folder_id:
                raise conflict("Cannot move a folder into its own descendant.")
            parent = _require_folder(session, new_parent_id)
            if parent.collection_id != folder.collection_id:
                raise conflict("Parent folder belongs to a different collection.")
            if _would_create_cycle(session, folder_id, new_parent_id):
                raise conflict("Cannot move a folder into its own descendant.")
        folder.parent_folder_id = new_parent_id

    folder.updated_at = utcnow_iso()
    session.add(folder)
    session.commit()
    session.refresh(folder)
    return _folder_read(folder)


def delete_folder(session: Session, folder_id: str) -> None:
    """Delete a folder; FK CASCADE removes nested folders, requests and children."""
    folder = _require_folder(session, folder_id)
    session.delete(folder)
    session.commit()


# --------------------------------------------------------------------------- #
# Request CRUD (nested assembly/persistence delegated to request_service)
# --------------------------------------------------------------------------- #
def _require_request(session: Session, request_id: str) -> Request:
    """Fetch a Request or raise a 404."""
    req = session.get(Request, request_id)
    if req is None:
        raise not_found("Request", request_id)
    return req


def get_request(session: Session, request_id: str) -> RequestRead:
    """Assemble the full nested RequestRead DTO (404 if missing).

    The request row plus its header/param/form-field child tables and the
    body-mode token translation are stitched together by request_service.
    """
    req = _require_request(session, request_id)
    return assemble_request_read(session, req)


def create_request(
    session: Session, collection_id: str, payload: RequestCreate
) -> RequestRead:
    """Create a saved request under a collection (and optional folder).

    Persistence of the request row and all of its child rows (including body
    token translation) is delegated to request_service.
    """
    _require_collection(session, collection_id)
    return persist_new_request(session, collection_id, payload)


def update_request(
    session: Session, request_id: str, payload: RequestUpdate
) -> RequestRead:
    """Update a saved request; delegates the nested merge to request_service.

    apply_request_update performs its own lookup + 404, so pass the id string.
    """
    _require_request(session, request_id)
    return apply_request_update(session, request_id, payload)


def delete_request(session: Session, request_id: str) -> None:
    """Delete a saved request; FK CASCADE removes its header/param/form rows."""
    req = _require_request(session, request_id)
    session.delete(req)
    session.commit()
