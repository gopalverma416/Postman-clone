"""Postman Collection v2.1 -> our domain model importer.

Parses a Postman Collection v2.1 JSON document and recreates it as a native
Collection (with nested folders + saved requests) by delegating to the same
service functions the REST CRUD endpoints use. We never touch the ORM directly
here — that keeps the snake_case<->camelCase and 'urlencoded' body-token
translation rules centralized in the service layer.

Reference for the v2.1 schema:
  https://schema.getpostman.com/json/collection/v2.1.0/collection.json

The parser is deliberately defensive: real-world exports omit keys, mix string
and object URL forms, and carry vendor extensions. Anything we don't recognize
is skipped rather than raised so a partial import still succeeds.
"""
from __future__ import annotations

from typing import Any

from sqlmodel import Session

from app.schemas.collections import (
    CollectionCreate,
    CollectionRead,
    FolderCreate,
    KeyValueDTO,
    RequestAuthDTO,
    RequestBasic,
    RequestBearer,
    RequestBodyDTO,
    RequestCreate,
)
from app.services import collection_service, request_service

# Postman raw-body language tokens map 1:1 to our RawLang set; anything else
# (e.g. 'graphql') falls back to plain text so the request still round-trips.
_RAW_LANGS = {"json", "text", "xml", "html", "javascript"}
# Methods our schema accepts; unknown verbs default to GET.
_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}


def import_v21(session: Session, doc: dict[str, Any]) -> CollectionRead:
    """Import a Postman Collection v2.1 document and return the created collection.

    Args:
        session: sync SQLModel session (from Depends(get_session)).
        doc: the parsed Postman v2.1 JSON object.

    Returns:
        The fully tree-expanded CollectionRead of the newly created collection.
    """
    info = doc.get("info") or {}
    name = info.get("name") or "Imported"
    description = _stringify_description(info.get("description"))

    created = collection_service.create_collection(
        session, CollectionCreate(name=name, description=description)
    )
    collection_id = created.id

    # Walk the top-level item list. Items directly under the collection have a
    # NULL parent folder.
    for index, item in enumerate(_as_list(doc.get("item"))):
        _import_item(session, collection_id, None, item, index)

    # Re-read so the response reflects everything just persisted (folders +
    # request summaries), exactly like GET /api/collections/{id} would.
    return collection_service.get_collection(session, collection_id)


# --------------------------------------------------------------------------- #
# Recursive item walk
# --------------------------------------------------------------------------- #
def _import_item(
    session: Session,
    collection_id: str,
    parent_folder_id: str | None,
    item: Any,
    sort_order: int,
) -> None:
    """Import one Postman item: a folder (has nested 'item') or a request."""
    if not isinstance(item, dict):
        return

    if "item" in item:
        # Item group -> folder. Create it, then recurse into its children.
        folder = collection_service.create_folder(
            session,
            collection_id,
            FolderCreate(
                collection_id=collection_id,
                parent_folder_id=parent_folder_id,
                name=item.get("name") or "Folder",
                description=_stringify_description(item.get("description")),
            ),
        )
        for child_index, child in enumerate(_as_list(item.get("item"))):
            _import_item(session, collection_id, folder.id, child, child_index)
        return

    if "request" in item:
        _import_request(session, collection_id, parent_folder_id, item, sort_order)


def _import_request(
    session: Session,
    collection_id: str,
    folder_id: str | None,
    item: dict[str, Any],
    sort_order: int,  # noqa: ARG001 - service assigns ordering; kept for symmetry
) -> None:
    """Map a Postman request item to RequestCreate and persist it."""
    request = item.get("request")
    # Some exports use a bare string request (just the URL).
    if isinstance(request, str):
        request = {"url": request, "method": "GET"}
    if not isinstance(request, dict):
        return

    method = str(request.get("method") or "GET").upper()
    if method not in _METHODS:
        method = "GET"

    url_raw, params = _parse_url(request.get("url"))
    headers = _parse_key_values(request.get("header"))
    body = _parse_body(request.get("body"))
    auth = _parse_auth(request.get("auth"))

    create = RequestCreate(
        collection_id=collection_id,
        folder_id=folder_id,
        name=item.get("name") or "Untitled Request",
        method=method,
        url=url_raw,
        description=_stringify_description(request.get("description")),
        params=params,
        headers=headers,
        auth=auth,
        body=body,
    )
    request_service.persist_new_request(session, collection_id, create)


# --------------------------------------------------------------------------- #
# Field parsers
# --------------------------------------------------------------------------- #
def _parse_url(url: Any) -> tuple[str, list[KeyValueDTO]]:
    """Resolve the raw URL string and the query-param rows.

    Postman URLs are either a plain string or an object with `raw`, `protocol`,
    `host[]`, `path[]`, `query[]`. We prefer `raw`; if absent we assemble it
    from the structured parts.
    """
    if url is None:
        return "", []
    if isinstance(url, str):
        return url, []
    if not isinstance(url, dict):
        return "", []

    params = [
        KeyValueDTO(
            key=q.get("key") or "",
            value=q.get("value") or "",
            # Postman marks a disabled row with `disabled: true`.
            enabled=not bool(q.get("disabled", False)),
            description=_stringify_description(q.get("description")),
        )
        for q in _as_list(url.get("query"))
        if isinstance(q, dict)
    ]

    raw = url.get("raw")
    if isinstance(raw, str) and raw:
        return raw, params

    return _assemble_url(url), params


def _assemble_url(url: dict[str, Any]) -> str:
    """Build a URL string from structured Postman parts (no `raw` present)."""
    protocol = url.get("protocol")
    host = url.get("host")
    path = url.get("path")

    host_str = ".".join(_as_str_list(host)) if isinstance(host, list) else (host or "")
    path_parts = _as_str_list(path) if isinstance(path, list) else ([path] if path else [])
    path_str = "/".join(p for p in path_parts if p != "")

    result = ""
    if protocol:
        result += f"{protocol}://"
    result += str(host_str)
    if path_str:
        result += f"/{path_str}"

    # Query is carried in the params table; still reflect enabled ones in the
    # raw URL so the URL bar matches the param grid.
    query_pairs = []
    for q in _as_list(url.get("query")):
        if not isinstance(q, dict) or q.get("disabled"):
            continue
        key = q.get("key") or ""
        value = q.get("value") or ""
        query_pairs.append(f"{key}={value}" if value != "" else key)
    if query_pairs:
        result += "?" + "&".join(query_pairs)
    return result


def _parse_key_values(rows: Any) -> list[KeyValueDTO]:
    """Map a Postman header/param array to KeyValueDTO rows."""
    out: list[KeyValueDTO] = []
    for row in _as_list(rows):
        if not isinstance(row, dict):
            continue
        out.append(
            KeyValueDTO(
                key=row.get("key") or "",
                value=row.get("value") or "",
                enabled=not bool(row.get("disabled", False)),
                description=_stringify_description(row.get("description")),
            )
        )
    return out


def _parse_body(body: Any) -> RequestBodyDTO:
    """Map a Postman request body to our RequestBodyDTO.

    Supported modes: raw, urlencoded, formdata. Anything else (file, graphql)
    degrades to a 'none' body.
    """
    if not isinstance(body, dict):
        return RequestBodyDTO(type="none")

    mode = body.get("mode")

    if mode == "raw":
        raw = body.get("raw")
        # The raw language lives in body.options.raw.language in v2.1.
        options = body.get("options") or {}
        raw_opts = options.get("raw") if isinstance(options, dict) else None
        language = (raw_opts or {}).get("language") if isinstance(raw_opts, dict) else None
        lang = language if language in _RAW_LANGS else "text"
        return RequestBodyDTO(type="raw", raw=raw if isinstance(raw, str) else "", raw_lang=lang)

    if mode == "urlencoded":
        # DTO uses the full wire token 'x-www-form-urlencoded'; the service
        # translates it to the DB 'urlencoded'.
        return RequestBodyDTO(
            type="x-www-form-urlencoded",
            url_encoded=_parse_form_rows(body.get("urlencoded")),
        )

    if mode == "formdata":
        return RequestBodyDTO(
            type="form-data",
            form_data=_parse_form_rows(body.get("formdata")),
        )

    return RequestBodyDTO(type="none")


def _parse_form_rows(rows: Any) -> list[KeyValueDTO]:
    """Map Postman urlencoded/formdata rows to KeyValueDTO rows."""
    out: list[KeyValueDTO] = []
    for row in _as_list(rows):
        if not isinstance(row, dict):
            continue
        # File parts carry `src` instead of `value`.
        value = row.get("value")
        if value is None and row.get("src") is not None:
            src = row.get("src")
            value = src if isinstance(src, str) else (src[0] if isinstance(src, list) and src else "")
        out.append(
            KeyValueDTO(
                key=row.get("key") or "",
                value=value or "",
                enabled=not bool(row.get("disabled", False)),
                description=_stringify_description(row.get("description")),
            )
        )
    return out


def _parse_auth(auth: Any) -> RequestAuthDTO:
    """Map Postman auth (bearer/basic) to our RequestAuthDTO.

    Postman stores auth params as an array of {key,value} objects under the
    auth-type key, e.g. auth.bearer = [{key:'token', value:'...'}].
    """
    if not isinstance(auth, dict):
        return RequestAuthDTO(type="none")

    auth_type = auth.get("type")

    if auth_type == "bearer":
        params = _auth_params(auth.get("bearer"))
        return RequestAuthDTO(type="bearer", bearer=RequestBearer(token=params.get("token", "")))

    if auth_type == "basic":
        params = _auth_params(auth.get("basic"))
        return RequestAuthDTO(
            type="basic",
            basic=RequestBasic(
                username=params.get("username", ""),
                password=params.get("password", ""),
            ),
        )

    return RequestAuthDTO(type="none")


def _auth_params(raw: Any) -> dict[str, str]:
    """Flatten Postman auth params.

    Accepts either the v2.1 array form ([{key,value,type}]) or a plain object.
    """
    out: dict[str, str] = {}
    if isinstance(raw, list):
        for entry in raw:
            if isinstance(entry, dict) and "key" in entry:
                out[str(entry["key"])] = str(entry.get("value", ""))
    elif isinstance(raw, dict):
        for key, value in raw.items():
            out[str(key)] = str(value)
    return out


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #
def _as_list(value: Any) -> list[Any]:
    """Coerce a possibly-missing value to a list."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _as_str_list(value: Any) -> list[str]:
    """Coerce a list of mixed values to a list of strings."""
    return [str(v) for v in value if v is not None]


def _stringify_description(value: Any) -> str | None:
    """Postman descriptions can be a string or a {content, type} object."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        content = value.get("content")
        return content if isinstance(content, str) else None
    return None
