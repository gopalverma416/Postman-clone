"""Build an httpx.Request from a RequestSpec.

Implements the locked send pipeline (frontend preview mirrors this):
  (1) merge enabled params into the URL (%20 for spaces, fragment stripped)
  (2) assemble enabled header rows
  (3) materialize body + propose Content-Type
  (4) finalize Content-Type (user header wins; multipart -> httpx owns boundary)
  (5) apply auth LAST (exactly one Authorization header ever emitted)
"""
from __future__ import annotations

import base64
from urllib.parse import quote, quote_plus, urlencode, urlsplit, urlunsplit

import httpx

from app.runner.errors import RunnerException
from app.schemas.request_spec import RequestSpec


def _merge_params_into_url(url: str, params: list) -> str:
    """Append enabled param rows to the URL query string. Fragment is stripped."""
    parts = urlsplit(url)
    # Strip fragment for sending.
    existing_query = parts.query
    new_pairs = []
    for p in params:
        if not p.enabled:
            continue
        if p.key == "" and p.value == "":
            continue
        # %20 for spaces in query string (matches frontend encodeURIComponent path).
        k = quote(p.key, safe="")
        v = quote(p.value, safe="")
        new_pairs.append(f"{k}={v}" if (p.value != "" or True) else k)
    appended = "&".join(new_pairs)
    if existing_query and appended:
        query = f"{existing_query}&{appended}"
    else:
        query = existing_query or appended
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, ""))


def _find_header_idx(headers: list[list[str]], name: str) -> int:
    lname = name.lower()
    for i, (k, _) in enumerate(headers):
        if k.lower() == lname:
            return i
    return -1


def build_httpx_request(
    spec: RequestSpec,
    client: httpx.AsyncClient,
    final_url: str,
) -> httpx.Request:
    """Assemble the final httpx.Request (headers, body, auth) for `final_url`."""
    # --- headers (enabled only), as an ordered list of [key, value] ---
    headers: list[list[str]] = [[h.key, h.value] for h in spec.headers if h.enabled and h.key != ""]

    # --- body materialization ---
    content: bytes | str | None = None
    files = None
    proposed_ct: str | None = None
    mode = spec.body.type

    if mode == "none":
        pass
    elif mode == "raw":
        text = spec.body.raw or ""
        content = text.encode("utf-8")
        lang = spec.body.language or "text"
        proposed_ct = {
            "json": "application/json",
            "text": "text/plain",
            "xml": "application/xml",
            "html": "text/html",
            "javascript": "application/javascript",
        }.get(lang, "text/plain")
    elif mode == "x-www-form-urlencoded":
        pairs = [
            (f.key, f.value)
            for f in (spec.body.fields or [])
            if f.enabled and f.key != ""
        ]
        # quote_plus semantics (space -> '+') per HTML form convention.
        content = urlencode(pairs, quote_via=quote_plus).encode("utf-8")
        proposed_ct = "application/x-www-form-urlencoded"
    elif mode == "form-data":
        # Multipart: httpx owns the Content-Type (boundary). For text fields we use
        # the (None, value) tuple form so httpx renders them as plain form parts
        # (Content-Disposition without filename) inside a multipart body. Using a
        # list of tuples preserves duplicate keys and ordering. File parts are a
        # documented future extension (would be (filename, content, content_type)).
        files = [
            (f.key, (None, f.value))
            for f in (spec.body.fields or [])
            if f.enabled and f.key != "" and (f.type or "text") != "file"
        ]
        if not files:
            # No enabled text fields: send an empty multipart body. httpx requires a
            # non-empty files/data to choose multipart, so fall back to empty content
            # with an explicit multipart hint left to finalize (rare edge case).
            files = None
            content = b""
    else:
        raise RunnerException("UNSUPPORTED_BODY", f"Unsupported body type '{mode}'.", {"type": mode})

    # --- strip stale entity headers when there is no body ---
    # On a method-switched redirect (303, or 301/302 from a non-GET) the executor
    # sets body.type='none'. Any user-supplied Content-Length/Content-Type would
    # then mis-frame the bodyless request, so drop them here.
    body_is_empty = mode == "none" or (mode == "raw" and not (spec.body.raw or ""))
    if mode == "none":
        for name in ("content-length", "content-type"):
            idx = _find_header_idx(headers, name)
            if idx >= 0:
                headers.pop(idx)
    else:
        # A user Content-Length is never trustworthy (httpx sets the correct one).
        cl_idx = _find_header_idx(headers, "content-length")
        if cl_idx >= 0:
            headers.pop(cl_idx)

    # --- finalize Content-Type ---
    user_ct_idx = _find_header_idx(headers, "content-type")
    if mode == "form-data":
        # Strip any user Content-Type so httpx can set the boundary-bearing one.
        if user_ct_idx >= 0:
            headers.pop(user_ct_idx)
    elif mode != "none":
        # raw/urlencoded: declare the proposed Content-Type unless the user set one.
        # (An empty raw body still declares its type, matching Postman.)
        if user_ct_idx < 0 and proposed_ct is not None:
            headers.append(["Content-Type", proposed_ct])

    # --- apply auth LAST (exactly one Authorization header) ---
    auth = spec.auth
    if auth.type in ("bearer", "basic"):
        cfg = auth.config or {}
        if auth.type == "bearer":
            value = f"Bearer {cfg.get('token', '')}"
        else:
            user = cfg.get("username", "")
            pw = cfg.get("password", "")
            token = base64.b64encode(f"{user}:{pw}".encode("utf-8")).decode("ascii")
            value = f"Basic {token}"
        auth_idx = _find_header_idx(headers, "authorization")
        if auth_idx >= 0:
            headers[auth_idx][1] = value
            headers[auth_idx][0] = "Authorization"
        else:
            headers.append(["Authorization", value])

    header_tuples = [(k, v) for k, v in headers]

    # httpx multipart: when files set, do NOT also pass content.
    if mode == "form-data" and files:
        return client.build_request(spec.method, final_url, headers=header_tuples, files=files)
    return client.build_request(spec.method, final_url, headers=header_tuples, content=content)


def build_final_url(spec: RequestSpec) -> str:
    """Public helper: produce the final send URL (params merged, fragment stripped)."""
    return _merge_params_into_url(spec.url, spec.params)
