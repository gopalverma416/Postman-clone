"""SQLModel ORM models — the normalized SQLite schema.

Design highlights (see README "Database Schema"):
  * All primary keys are UUIDv4 hex strings, server-generated.
  * Repeated key/value lists (headers, params, form fields, env vars) are child
    tables (not JSON blobs) so the UI can render editable grids with per-row
    enabled toggles, ordering, and duplicate keys.
  * Opaque variable-shape config (auth, raw body) stays as TEXT/JSON columns.
  * Foreign keys use ON DELETE CASCADE for ownership and SET NULL for soft links
    (history -> request/environment, workspace -> active environment).
  * Timestamps are ISO-8601 UTC strings.
"""
# NOTE: intentionally NOT using `from __future__ import annotations` — it would
# turn SQLModel Relationship annotations into unresolvable string literals.
# Python 3.12 evaluates `str | None` natively at runtime, so it is unnecessary.
import uuid
from datetime import datetime, timezone

from sqlmodel import Field, Relationship, SQLModel


def new_id() -> str:
    """Generate a canonical UUIDv4 string primary key."""
    return str(uuid.uuid4())


def utcnow_iso() -> str:
    """Current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------- #
# Workspace
# --------------------------------------------------------------------------- #
class Workspace(SQLModel, table=True):
    __tablename__ = "workspace"

    id: str = Field(default_factory=new_id, primary_key=True)
    name: str = Field(default="My Workspace", nullable=False)
    is_default: bool = Field(default=True, nullable=False)
    # Remembers the env selected in the top-bar selector. Soft link: SET NULL on env delete.
    active_environment_id: str | None = Field(
        default=None, foreign_key="environment.id", ondelete="SET NULL"
    )
    created_at: str = Field(default_factory=utcnow_iso, nullable=False)
    updated_at: str = Field(default_factory=utcnow_iso, nullable=False)


# --------------------------------------------------------------------------- #
# Collection
# --------------------------------------------------------------------------- #
class Collection(SQLModel, table=True):
    __tablename__ = "collection"

    id: str = Field(default_factory=new_id, primary_key=True)
    workspace_id: str = Field(foreign_key="workspace.id", ondelete="CASCADE", nullable=False, index=True)
    name: str = Field(nullable=False)
    description: str | None = None
    sort_order: int = Field(default=0, nullable=False)
    created_at: str = Field(default_factory=utcnow_iso, nullable=False)
    updated_at: str = Field(default_factory=utcnow_iso, nullable=False)


# --------------------------------------------------------------------------- #
# Folder (self-referential nesting)
# --------------------------------------------------------------------------- #
class Folder(SQLModel, table=True):
    __tablename__ = "folder"

    id: str = Field(default_factory=new_id, primary_key=True)
    collection_id: str = Field(foreign_key="collection.id", ondelete="CASCADE", nullable=False, index=True)
    # NULL = directly under collection; self-ref enables nesting.
    parent_folder_id: str | None = Field(
        default=None, foreign_key="folder.id", ondelete="CASCADE", index=True
    )
    name: str = Field(nullable=False)
    description: str | None = None
    sort_order: int = Field(default=0, nullable=False)
    created_at: str = Field(default_factory=utcnow_iso, nullable=False)
    updated_at: str = Field(default_factory=utcnow_iso, nullable=False)


# --------------------------------------------------------------------------- #
# Request (saved request) + child rows
# --------------------------------------------------------------------------- #
class Request(SQLModel, table=True):
    __tablename__ = "request"

    id: str = Field(default_factory=new_id, primary_key=True)
    # Denormalized parent for fast collection-scoped queries even when nested.
    collection_id: str = Field(foreign_key="collection.id", ondelete="CASCADE", nullable=False, index=True)
    folder_id: str | None = Field(default=None, foreign_key="folder.id", ondelete="CASCADE", index=True)
    name: str = Field(default="Untitled Request", nullable=False)
    method: str = Field(default="GET", nullable=False)
    url: str = Field(default="", nullable=False)
    description: str | None = None
    body_mode: str = Field(default="none", nullable=False)  # none|raw|form-data|urlencoded (DB short token)
    body_raw_language: str = Field(default="json", nullable=False)  # json|text|xml|html|javascript
    body_raw: str | None = None
    auth_type: str = Field(default="none", nullable=False)  # none|bearer|basic
    auth_config: str | None = None  # JSON: {token} | {username,password}
    sort_order: int = Field(default=0, nullable=False)
    created_at: str = Field(default_factory=utcnow_iso, nullable=False)
    updated_at: str = Field(default_factory=utcnow_iso, nullable=False)

    headers: list["RequestHeader"] = Relationship(
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "RequestHeader.sort_order"}
    )
    params: list["RequestParam"] = Relationship(
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "RequestParam.sort_order"}
    )
    form_fields: list["RequestFormField"] = Relationship(
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "RequestFormField.sort_order"}
    )


class RequestHeader(SQLModel, table=True):
    __tablename__ = "request_header"

    id: str = Field(default_factory=new_id, primary_key=True)
    request_id: str = Field(foreign_key="request.id", ondelete="CASCADE", nullable=False, index=True)
    key: str = Field(default="", nullable=False)
    value: str = Field(default="", nullable=False)
    enabled: bool = Field(default=True, nullable=False)
    description: str | None = None
    sort_order: int = Field(default=0, nullable=False)


class RequestParam(SQLModel, table=True):
    __tablename__ = "request_param"

    id: str = Field(default_factory=new_id, primary_key=True)
    request_id: str = Field(foreign_key="request.id", ondelete="CASCADE", nullable=False, index=True)
    key: str = Field(default="", nullable=False)
    value: str = Field(default="", nullable=False)
    enabled: bool = Field(default=True, nullable=False)
    description: str | None = None
    sort_order: int = Field(default=0, nullable=False)


class RequestFormField(SQLModel, table=True):
    __tablename__ = "request_form_field"

    id: str = Field(default_factory=new_id, primary_key=True)
    request_id: str = Field(foreign_key="request.id", ondelete="CASCADE", nullable=False, index=True)
    key: str = Field(default="", nullable=False)
    value: str = Field(default="", nullable=False)
    field_kind: str = Field(default="text", nullable=False)  # text|file
    enabled: bool = Field(default=True, nullable=False)
    content_type: str | None = None
    sort_order: int = Field(default=0, nullable=False)


# --------------------------------------------------------------------------- #
# Environment + variables
# --------------------------------------------------------------------------- #
class Environment(SQLModel, table=True):
    __tablename__ = "environment"

    id: str = Field(default_factory=new_id, primary_key=True)
    workspace_id: str = Field(foreign_key="workspace.id", ondelete="CASCADE", nullable=False, index=True)
    name: str = Field(nullable=False)
    sort_order: int = Field(default=0, nullable=False)
    created_at: str = Field(default_factory=utcnow_iso, nullable=False)
    updated_at: str = Field(default_factory=utcnow_iso, nullable=False)

    variables: list["EnvironmentVariable"] = Relationship(
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "EnvironmentVariable.sort_order"}
    )


class EnvironmentVariable(SQLModel, table=True):
    __tablename__ = "environment_variable"

    id: str = Field(default_factory=new_id, primary_key=True)
    environment_id: str = Field(foreign_key="environment.id", ondelete="CASCADE", nullable=False, index=True)
    key: str = Field(default="", nullable=False)
    value: str = Field(default="", nullable=False)
    is_secret: bool = Field(default=False, nullable=False)
    enabled: bool = Field(default=True, nullable=False)
    sort_order: int = Field(default=0, nullable=False)


# --------------------------------------------------------------------------- #
# History
# --------------------------------------------------------------------------- #
class HistoryEntry(SQLModel, table=True):
    __tablename__ = "history_entry"

    id: str = Field(default_factory=new_id, primary_key=True)
    workspace_id: str = Field(foreign_key="workspace.id", ondelete="CASCADE", nullable=False, index=True)
    # Soft links survive deletion of the originating request/environment.
    request_id: str | None = Field(default=None, foreign_key="request.id", ondelete="SET NULL", index=True)
    environment_id: str | None = Field(default=None, foreign_key="environment.id", ondelete="SET NULL")
    method: str = Field(nullable=False)
    url: str = Field(nullable=False)
    request_snapshot: str = Field(nullable=False)  # JSON: resolved RequestSpec
    status_code: int | None = None
    status_text: str | None = None
    response_time_ms: int | None = None
    response_size_bytes: int | None = None
    response_headers: str | None = None  # JSON: {key,value}[]
    response_body: str | None = None  # truncated capture
    response_content_type: str | None = None
    is_error: bool = Field(default=False, nullable=False)
    error_message: str | None = None
    sent_at: str = Field(default_factory=utcnow_iso, nullable=False, index=True)


__all__ = [
    "new_id",
    "utcnow_iso",
    "Workspace",
    "Collection",
    "Folder",
    "Request",
    "RequestHeader",
    "RequestParam",
    "RequestFormField",
    "Environment",
    "EnvironmentVariable",
    "HistoryEntry",
]
