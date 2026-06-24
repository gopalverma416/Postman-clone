"""Our domain model -> Postman Collection v2.1 exporter.

Builds a Postman v2.1 JSON document from a stored collection by reading the
tree-expanded CollectionRead plus each full RequestRead, reversing the mappings
applied in v21_import. The output is a plain dict ready to be returned as JSON
and re-imported by Postman (or by our own importer).

Reference for the v2.1 schema:
  https://schema.getpostman.com/json/collection/v2.1.0/collection.json
"""
from __future__ import annotations

from typing import Any

from sqlmodel import Session

from app.schemas.collections import (
    CollectionRead,
    FolderRead,
    KeyValueDTO,
    RequestRead,
)
from app.services import collection_service

_SCHEMA_URL = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"


def export_v21(session: Session, collection_id: str) -> dict[str, Any]:
    """Export a stored collection as a Postman Collection v2.1 document.

    Args:
        session: sync SQLModel session.
        collection_id: id of the collection to export.

    Returns:
        A Postman v2.1 JSON-serializable dict {info, item}.
    """
    # get_collection raises ApiError(404) if the id is unknown — the router
    # surfaces that as the standard error envelope.
    collection: CollectionRead = collection_service.get_collection(session, collection_id)

    info: dict[str, Any] = {
        "name": collection.name,
        "_postman_id": collection.id,
        "schema": _SCHEMA_URL,
    }
    if collection.description:
        info["description"] = collection.description

    # Index folders by parent so we can build the nested item tree. Folders
    # with parent_folder_id == None are top-level (directly under collection).
    children_by_parent: dict[str | None, list[FolderRead]] = {}
    for folder in sorted(collection.folders, key=lambda f: f.sort_order):
        children_by_parent.setdefault(folder.parent_folder_id, []).append(folder)

    # Group request summaries by their folder id (None = directly under collection).
    request_ids_by_folder: dict[str | None, list[str]] = {}
    for summary in sorted(collection.requests, key=lambda r: r.sort_order):
        request_ids_by_folder.setdefault(summary.folder_id, []).append(summary.id)

    items: list[dict[str, Any]] = _build_items(
        session, None, children_by_parent, request_ids_by_folder
    )

    return {"info": info, "item": items}


# --------------------------------------------------------------------------- #
# Tree builders
# --------------------------------------------------------------------------- #
def _build_items(
    session: Session,
    parent_folder_id: str | None,
    children_by_parent: dict[str | None, list[FolderRead]],
    request_ids_by_folder: dict[str | None, list[str]],
) -> list[dict[str, Any]]:
    """Build the ordered item[] list for one folder level (folders first, then requests)."""
    items: list[dict[str, Any]] = []

    # Nested folders become item-groups with their own item[].
    for folder in children_by_parent.get(parent_folder_id, []):
        group: dict[str, Any] = {
            "name": folder.name,
            "item": _build_items(
                session, folder.id, children_by_parent, request_ids_by_folder
            ),
        }
        if folder.description:
            group["description"] = folder.description
        items.append(group)

    # Requests at this level become request items.
    for request_id in request_ids_by_folder.get(parent_folder_id, []):
        full = collection_service.get_request(session, request_id)
        items.append(_export_request(full))

    return items


def _export_request(req: RequestRead) -> dict[str, Any]:
    """Reverse of v21_import._import_request: RequestRead -> Postman request item."""
    request_obj: dict[str, Any] = {
        "method": req.method,
        "header": _export_key_values(req.headers),
        "url": _export_url(req.url, req.params),
    }

    body = _export_body(req)
    if body is not None:
        request_obj["body"] = body

    auth = _export_auth(req)
    if auth is not None:
        request_obj["auth"] = auth

    if req.description:
        request_obj["description"] = req.description

    return {"name": req.name, "request": request_obj}


# --------------------------------------------------------------------------- #
# Field exporters
# --------------------------------------------------------------------------- #
def _export_url(url: str, params: list[KeyValueDTO]) -> dict[str, Any]:
    """Build a Postman URL object with raw + decomposed host/path/query.

    We keep `raw` authoritative (it's exactly what the user typed) and add the
    structured pieces Postman expects, mirroring the param grid into query[].
    """
    url_obj: dict[str, Any] = {"raw": url}

    base, _, _query = url.partition("?")

    # Decompose scheme://host/path for the structured fields. This is best
    # effort; Postman tolerates partial decomposition alongside `raw`.
    scheme = ""
    remainder = base
    if "://" in base:
        scheme, _, remainder = base.partition("://")
        url_obj["protocol"] = scheme

    host_part, _, path_part = remainder.partition("/")
    if host_part:
        url_obj["host"] = host_part.split(".")
    if path_part:
        url_obj["path"] = [seg for seg in path_part.split("/") if seg != ""]

    # Query rows come from the persisted param grid (authoritative), not the
    # raw string, so enabled/disabled state round-trips.
    query = []
    for p in params:
        entry: dict[str, Any] = {"key": p.key, "value": p.value}
        if not p.enabled:
            entry["disabled"] = True
        if p.description:
            entry["description"] = p.description
        query.append(entry)
    if query:
        url_obj["query"] = query

    return url_obj


def _export_key_values(rows: list[KeyValueDTO]) -> list[dict[str, Any]]:
    """Map header/param KeyValueDTO rows to Postman {key,value,disabled?} objects."""
    out: list[dict[str, Any]] = []
    for row in rows:
        entry: dict[str, Any] = {"key": row.key, "value": row.value}
        if not row.enabled:
            entry["disabled"] = True
        if row.description:
            entry["description"] = row.description
        out.append(entry)
    return out


def _export_body(req: RequestRead) -> dict[str, Any] | None:
    """Reverse of v21_import._parse_body: RequestBodyDTO -> Postman body object."""
    body = req.body
    body_type = body.type

    if body_type == "raw":
        return {
            "mode": "raw",
            "raw": body.raw or "",
            "options": {"raw": {"language": body.raw_lang}},
        }

    if body_type == "x-www-form-urlencoded":
        return {
            "mode": "urlencoded",
            "urlencoded": _export_form_rows(body.url_encoded),
        }

    if body_type == "form-data":
        return {
            "mode": "formdata",
            "formdata": _export_form_rows(body.form_data),
        }

    return None


def _export_form_rows(rows: list[KeyValueDTO]) -> list[dict[str, Any]]:
    """Map form/urlencoded KeyValueDTO rows to Postman form rows."""
    out: list[dict[str, Any]] = []
    for row in rows:
        entry: dict[str, Any] = {"key": row.key, "value": row.value, "type": "text"}
        if not row.enabled:
            entry["disabled"] = True
        out.append(entry)
    return out


def _export_auth(req: RequestRead) -> dict[str, Any] | None:
    """Reverse of v21_import._parse_auth: RequestAuthDTO -> Postman auth object."""
    auth = req.auth
    if auth.type == "bearer":
        token = auth.bearer.token if auth.bearer else ""
        return {
            "type": "bearer",
            "bearer": [{"key": "token", "value": token, "type": "string"}],
        }
    if auth.type == "basic":
        username = auth.basic.username if auth.basic else ""
        password = auth.basic.password if auth.basic else ""
        return {
            "type": "basic",
            "basic": [
                {"key": "username", "value": username, "type": "string"},
                {"key": "password", "value": password, "type": "string"},
            ],
        }
    return None
