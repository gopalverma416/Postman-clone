"""SavedRequest <-> DB translation — the single body-mode translation point.

A saved request is split across one parent `request` row (scalar fields + JSON
auth/body-raw columns) and three child tables (params, headers, form fields).
This module owns the round-trip between that normalized storage and the nested
`RequestRead` wire DTO that the frontend consumes.

The ONLY place the body-type token is translated between the wire form
('x-www-form-urlencoded') and the DB short token ('urlencoded') is here, via
`_wire_body_type_to_db` / `_db_body_mode_to_wire`. Everything else passes the
token through unchanged ('none' / 'raw' / 'form-data' are identical on both
sides).
"""
from __future__ import annotations

import json

from sqlmodel import Session, select

from app.api_errors import not_found
from app.models import (
    Collection,
    Request,
    RequestFormField,
    RequestHeader,
    RequestParam,
    utcnow_iso,
)
from app.schemas import (
    KeyValueDTO,
    RequestAuthDTO,
    RequestBodyDTO,
    RequestCreate,
    RequestRead,
    RequestUpdate,
)
from app.schemas.collections import RequestBasic, RequestBearer


# --------------------------------------------------------------------------- #
# Body-mode translation — the single source of truth for the token swap.
# --------------------------------------------------------------------------- #
def _wire_body_type_to_db(t: str) -> str:
    """Wire body.type -> DB body_mode. Only 'x-www-form-urlencoded' differs."""
    return "urlencoded" if t == "x-www-form-urlencoded" else t


def _db_body_mode_to_wire(m: str) -> str:
    """DB body_mode -> wire body.type. Only 'urlencoded' differs."""
    return "x-www-form-urlencoded" if m == "urlencoded" else m


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _auth_to_config_json(auth: RequestAuthDTO) -> str | None:
    """Serialize an auth DTO to the opaque `auth_config` JSON column.

    bearer -> {"token": ...}, basic -> {"username":..., "password":...},
    none -> NULL (no config stored).
    """
    if auth.type == "bearer":
        token = auth.bearer.token if auth.bearer else ""
        return json.dumps({"token": token})
    if auth.type == "basic":
        username = auth.basic.username if auth.basic else ""
        password = auth.basic.password if auth.basic else ""
        return json.dumps({"username": username, "password": password})
    return None


def _config_json_to_auth(auth_type: str, auth_config: str | None) -> RequestAuthDTO:
    """Inflate the stored auth_type + JSON config into a typed RequestAuthDTO."""
    cfg = json.loads(auth_config or "{}")
    if auth_type == "bearer":
        return RequestAuthDTO(type="bearer", bearer=RequestBearer(token=cfg.get("token", "")))
    if auth_type == "basic":
        return RequestAuthDTO(
            type="basic",
            basic=RequestBasic(
                username=cfg.get("username", ""),
                password=cfg.get("password", ""),
            ),
        )
    return RequestAuthDTO(type="none")


def _row_to_kv(row: RequestHeader | RequestParam | RequestFormField) -> KeyValueDTO:
    """Map a child row to a KeyValueDTO. Form fields have no description column,
    so it is reported as None for those."""
    return KeyValueDTO(
        id=row.id,
        key=row.key,
        value=row.value,
        enabled=row.enabled,
        description=getattr(row, "description", None),
    )


def _next_sort_order(session: Session, collection_id: str, folder_id: str | None) -> int:
    """Return max(sort_order)+1 among sibling requests in the same
    (collection_id, folder_id) bucket; 0 when there are no siblings."""
    siblings = session.exec(
        select(Request).where(
            Request.collection_id == collection_id,
            Request.folder_id == folder_id,
        )
    ).all()
    if not siblings:
        return 0
    return max(r.sort_order for r in siblings) + 1


# --------------------------------------------------------------------------- #
# DTO assembly (DB -> wire)
# --------------------------------------------------------------------------- #
def assemble_request_dto(session: Session, request_row: Request) -> RequestRead:
    """Build the nested RequestRead from a request row + its child tables.

    Child relationships are ordered by sort_order via the ORM relationship config,
    so the lists arrive pre-sorted. Form fields are routed into formData or
    urlEncoded depending on the DB body_mode (only enabled rows are exposed).
    """
    params = [_row_to_kv(r) for r in request_row.params]
    headers = [_row_to_kv(r) for r in request_row.headers]

    auth = _config_json_to_auth(request_row.auth_type, request_row.auth_config)

    # Form rows only ever belong to one of the two lists, decided by body_mode.
    form_data: list[KeyValueDTO] = []
    url_encoded: list[KeyValueDTO] = []
    enabled_form_rows = [_row_to_kv(r) for r in request_row.form_fields if r.enabled]
    if request_row.body_mode == "form-data":
        form_data = enabled_form_rows
    elif request_row.body_mode == "urlencoded":
        url_encoded = enabled_form_rows

    body = RequestBodyDTO(
        type=_db_body_mode_to_wire(request_row.body_mode),
        raw=request_row.body_raw,
        raw_lang=request_row.body_raw_language,
        form_data=form_data,
        url_encoded=url_encoded,
    )

    return RequestRead(
        id=request_row.id,
        name=request_row.name,
        collection_id=request_row.collection_id,
        folder_id=request_row.folder_id,
        method=request_row.method,
        url=request_row.url,
        description=request_row.description,
        params=params,
        headers=headers,
        auth=auth,
        body=body,
        sort_order=request_row.sort_order,
        created_at=request_row.created_at,
        updated_at=request_row.updated_at,
    )


# --------------------------------------------------------------------------- #
# Child-row builders (wire -> DB rows)
# --------------------------------------------------------------------------- #
def _build_param_rows(request_id: str, items: list[KeyValueDTO]) -> list[RequestParam]:
    return [
        RequestParam(
            request_id=request_id,
            key=kv.key,
            value=kv.value,
            enabled=kv.enabled,
            description=kv.description,
            sort_order=i,
        )
        for i, kv in enumerate(items)
    ]


def _build_header_rows(request_id: str, items: list[KeyValueDTO]) -> list[RequestHeader]:
    return [
        RequestHeader(
            request_id=request_id,
            key=kv.key,
            value=kv.value,
            enabled=kv.enabled,
            description=kv.description,
            sort_order=i,
        )
        for i, kv in enumerate(items)
    ]


def _build_form_rows(request_id: str, body: RequestBodyDTO) -> list[RequestFormField]:
    """Pick the relevant form list for the body type and turn it into rows.

    form-data uses body.formData; x-www-form-urlencoded uses body.urlEncoded;
    every other body type contributes no form rows.
    """
    if body.type == "form-data":
        source = body.form_data
    elif body.type == "x-www-form-urlencoded":
        source = body.url_encoded
    else:
        return []
    return [
        RequestFormField(
            request_id=request_id,
            key=kv.key,
            value=kv.value,
            field_kind="text",
            enabled=kv.enabled,
            sort_order=i,
        )
        for i, kv in enumerate(source)
    ]


# --------------------------------------------------------------------------- #
# Create (wire -> DB)
# --------------------------------------------------------------------------- #
def persist_new_request(session: Session, collection_id: str, payload: RequestCreate) -> RequestRead:
    """Create a new saved request (parent row + child rows) under a collection.

    Raises not_found if the target collection does not exist. The new request is
    appended after its siblings in the same (collection_id, folder_id) bucket.
    """
    collection = session.get(Collection, collection_id)
    if collection is None:
        raise not_found("collection", collection_id)

    sort_order = _next_sort_order(session, collection_id, payload.folder_id)

    request_row = Request(
        collection_id=collection_id,
        folder_id=payload.folder_id,
        name=payload.name,
        method=payload.method,
        url=payload.url,
        description=payload.description,
        body_mode=_wire_body_type_to_db(payload.body.type),
        body_raw_language=payload.body.raw_lang,
        body_raw=payload.body.raw,
        auth_type=payload.auth.type,
        auth_config=_auth_to_config_json(payload.auth),
        sort_order=sort_order,
    )

    # Attach child rows through the relationships so they cascade-insert with the
    # parent on commit.
    request_row.params = _build_param_rows(request_row.id, payload.params)
    request_row.headers = _build_header_rows(request_row.id, payload.headers)
    request_row.form_fields = _build_form_rows(request_row.id, payload.body)

    session.add(request_row)
    session.commit()
    session.refresh(request_row)
    return assemble_request_dto(session, request_row)


# --------------------------------------------------------------------------- #
# Update (wire -> DB; partial)
# --------------------------------------------------------------------------- #
def apply_request_update(session: Session, request_id: str, payload: RequestUpdate) -> RequestRead:
    """Apply a partial update to a saved request.

    Only fields present (non-None) on the payload are touched. params/headers,
    when supplied, fully REPLACE the existing child rows. A supplied body resets
    body_mode/body_raw/body_raw_language and REPLACES the form-field rows for the
    new body type. A supplied auth re-serializes auth_type + auth_config.
    """
    request_row = session.get(Request, request_id)
    if request_row is None:
        raise not_found("request", request_id)

    if payload.name is not None:
        request_row.name = payload.name
    if payload.folder_id is not None:
        request_row.folder_id = payload.folder_id
    if payload.method is not None:
        request_row.method = payload.method
    if payload.url is not None:
        request_row.url = payload.url
    if payload.description is not None:
        request_row.description = payload.description
    if payload.sort_order is not None:
        request_row.sort_order = payload.sort_order

    if payload.auth is not None:
        request_row.auth_type = payload.auth.type
        request_row.auth_config = _auth_to_config_json(payload.auth)

    # Replace params: delete existing, re-insert in payload order.
    if payload.params is not None:
        request_row.params = _build_param_rows(request_row.id, payload.params)

    if payload.headers is not None:
        request_row.headers = _build_header_rows(request_row.id, payload.headers)

    # Replace body scalars + form rows together so they stay consistent.
    if payload.body is not None:
        body = payload.body
        request_row.body_mode = _wire_body_type_to_db(body.type)
        request_row.body_raw = body.raw
        request_row.body_raw_language = body.raw_lang
        request_row.form_fields = _build_form_rows(request_row.id, body)

    request_row.updated_at = utcnow_iso()

    session.add(request_row)
    session.commit()
    session.refresh(request_row)
    return assemble_request_dto(session, request_row)


# Public alias expected by collection_service (kept for naming parity).
assemble_request_read = assemble_request_dto
