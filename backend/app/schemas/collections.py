"""Collection / Folder / SavedRequest DTOs.

The SavedRequest is assembled from the request row + its child tables
(headers/params/form fields) into a nested object whose shape matches the
frontend `Request` type. Note the body.type token is the full wire form
('x-www-form-urlencoded'); the DB stores the short 'urlencoded' — translation
happens in the service layer only.
"""
from __future__ import annotations

from pydantic import Field

from app.schemas.common import CamelModel
from app.schemas.request_spec import AuthType, BodyType, HttpMethod, RawLang


# --- Reusable nested DTOs --- #
class KeyValueDTO(CamelModel):
    """A persisted key/value row (header/param/form). id is the server row id."""

    id: str | None = None
    key: str = ""
    value: str = ""
    enabled: bool = True
    description: str | None = None


class RequestBearer(CamelModel):
    token: str = ""


class RequestBasic(CamelModel):
    username: str = ""
    password: str = ""


class RequestAuthDTO(CamelModel):
    type: AuthType = "none"
    bearer: RequestBearer | None = None
    basic: RequestBasic | None = None


class RequestBodyDTO(CamelModel):
    type: BodyType = "none"
    raw: str | None = None
    raw_lang: RawLang = "json"
    form_data: list[KeyValueDTO] = Field(default_factory=list)
    url_encoded: list[KeyValueDTO] = Field(default_factory=list)


# --- Collection --- #
class CollectionCreate(CamelModel):
    name: str
    description: str | None = None


class CollectionUpdate(CamelModel):
    name: str | None = None
    description: str | None = None
    sort_order: int | None = None


class CollectionRead(CamelModel):
    id: str
    name: str
    description: str | None = None
    sort_order: int = 0
    created_at: str
    updated_at: str
    folders: list["FolderRead"] = Field(default_factory=list)
    requests: list["RequestSummary"] = Field(default_factory=list)


# --- Folder --- #
class FolderCreate(CamelModel):
    collection_id: str
    parent_folder_id: str | None = None
    name: str
    description: str | None = None


class FolderUpdate(CamelModel):
    name: str | None = None
    description: str | None = None
    parent_folder_id: str | None = None
    sort_order: int | None = None


class FolderRead(CamelModel):
    id: str
    collection_id: str
    parent_folder_id: str | None = None
    name: str
    description: str | None = None
    sort_order: int = 0
    created_at: str
    updated_at: str


# --- Request --- #
class RequestSummary(CamelModel):
    """Lightweight node for tree hydration."""

    id: str
    name: str
    method: HttpMethod
    folder_id: str | None = None
    sort_order: int = 0


class RequestCreate(CamelModel):
    collection_id: str
    folder_id: str | None = None
    name: str = "Untitled Request"
    method: HttpMethod = "GET"
    url: str = ""
    description: str | None = None
    params: list[KeyValueDTO] = Field(default_factory=list)
    headers: list[KeyValueDTO] = Field(default_factory=list)
    auth: RequestAuthDTO = Field(default_factory=RequestAuthDTO)
    body: RequestBodyDTO = Field(default_factory=RequestBodyDTO)


class RequestUpdate(CamelModel):
    name: str | None = None
    folder_id: str | None = None
    method: HttpMethod | None = None
    url: str | None = None
    description: str | None = None
    params: list[KeyValueDTO] | None = None
    headers: list[KeyValueDTO] | None = None
    auth: RequestAuthDTO | None = None
    body: RequestBodyDTO | None = None
    sort_order: int | None = None


class RequestRead(CamelModel):
    id: str
    name: str
    collection_id: str
    folder_id: str | None = None
    method: HttpMethod
    url: str
    description: str | None = None
    params: list[KeyValueDTO] = Field(default_factory=list)
    headers: list[KeyValueDTO] = Field(default_factory=list)
    auth: RequestAuthDTO = Field(default_factory=RequestAuthDTO)
    body: RequestBodyDTO = Field(default_factory=RequestBodyDTO)
    sort_order: int = 0
    created_at: str
    updated_at: str


CollectionRead.model_rebuild()
