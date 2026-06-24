"""Code-snippet generators: turn a resolved RequestSpec into a runnable cURL
command or a browser `fetch()` call.

These are pure functions — no DB, no I/O — so they are trivially testable and
can be reused anywhere (UI "copy as cURL", docs, exports). They operate on a
RequestSpec whose {{var}} tokens are assumed already resolved.

Mapping rules (shared by both targets):
  * Only enabled key/value rows (headers/params/form fields) are emitted.
  * Auth is translated into a single request header:
      - bearer -> `Authorization: Bearer <token>`
      - basic  -> `Authorization: Basic <base64(user:pass)>`
    An explicit Authorization header on the request still wins (we don't add a
    second one).
  * Body:
      - raw                    -> the raw string as-is
      - x-www-form-urlencoded  -> urlencoded `key=value&...` (curl: one --data)
      - form-data              -> multipart parts (curl: repeated -F)
"""
from __future__ import annotations

import base64
from urllib.parse import quote, urlencode

from app.schemas.request_spec import RequestSpec

# Methods that don't normally carry a body — used to decide whether to emit one.
_BODYLESS_METHODS = {"GET", "HEAD"}


# --------------------------------------------------------------------------- #
# Shared header assembly
# --------------------------------------------------------------------------- #
def _effective_headers(spec: RequestSpec) -> list[tuple[str, str]]:
    """Enabled request headers plus a synthesized Authorization header (if the
    spec carries auth and doesn't already set Authorization explicitly)."""
    headers: list[tuple[str, str]] = [
        (h.key, h.value) for h in spec.headers if h.enabled and h.key
    ]

    has_auth_header = any(k.lower() == "authorization" for k, _ in headers)
    auth_header = _auth_header(spec)
    if auth_header is not None and not has_auth_header:
        headers.append(auth_header)

    return headers


def _auth_header(spec: RequestSpec) -> tuple[str, str] | None:
    """Translate the auth block into a single Authorization header value."""
    auth = spec.auth
    config = auth.config or {}
    if auth.type == "bearer":
        token = config.get("token", "")
        return ("Authorization", f"Bearer {token}")
    if auth.type == "basic":
        username = config.get("username", "")
        password = config.get("password", "")
        token = base64.b64encode(f"{username}:{password}".encode()).decode()
        return ("Authorization", f"Basic {token}")
    return None


def _full_url(spec: RequestSpec) -> str:
    """Append enabled query params to the URL.

    If the URL already contains a query string we append with '&', otherwise '?'.
    Params with an empty value emit just the key.
    """
    enabled = [(p.key, p.value) for p in spec.params if p.enabled and p.key]
    if not enabled:
        return spec.url
    pairs = [
        f"{quote(k, safe='')}={quote(v, safe='')}" if v != "" else quote(k, safe="")
        for k, v in enabled
    ]
    sep = "&" if "?" in spec.url else "?"
    return f"{spec.url}{sep}{'&'.join(pairs)}"


def _urlencoded_body(spec: RequestSpec) -> str:
    """Encode form fields as an application/x-www-form-urlencoded string."""
    pairs = [(f.key, f.value) for f in spec.body.fields if f.enabled and f.key]
    return urlencode(pairs)


# --------------------------------------------------------------------------- #
# cURL
# --------------------------------------------------------------------------- #
def _shell_quote(value: str) -> str:
    """Single-quote a string for POSIX shells, escaping embedded single quotes.

    A single quote inside a single-quoted string is closed, escaped, reopened:
    foo'bar -> 'foo'\\''bar'.
    """
    return "'" + value.replace("'", "'\\''") + "'"


def to_curl(spec: RequestSpec) -> str:
    """Render the request as a multi-line cURL command."""
    url = _full_url(spec)
    parts: list[str] = [f"curl -X {spec.method} {_shell_quote(url)}"]

    for key, value in _effective_headers(spec):
        parts.append(f"-H {_shell_quote(f'{key}: {value}')}")

    body_type = spec.body.type
    if body_type != "none" and spec.method not in _BODYLESS_METHODS:
        if body_type == "raw":
            raw = spec.body.raw or ""
            parts.append(f"--data {_shell_quote(raw)}")
        elif body_type == "x-www-form-urlencoded":
            parts.append(f"--data {_shell_quote(_urlencoded_body(spec))}")
        elif body_type == "form-data":
            for field in spec.body.fields:
                if not field.enabled or not field.key:
                    continue
                if field.type == "file":
                    # cURL reads file parts from a path with the @ prefix.
                    parts.append(f"-F {_shell_quote(f'{field.key}=@{field.value}')}")
                else:
                    parts.append(f"-F {_shell_quote(f'{field.key}={field.value}')}")

    # Join with line continuations for a readable, copy-pasteable command.
    return " \\\n  ".join(parts)


# --------------------------------------------------------------------------- #
# fetch()
# --------------------------------------------------------------------------- #
def _js_string(value: str) -> str:
    """Produce a JS double-quoted string literal for `value`."""
    escaped = (
        value.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    )
    return f'"{escaped}"'


def to_fetch(spec: RequestSpec) -> str:
    """Render the request as a browser `fetch()` call."""
    url = _full_url(spec)

    # Build the init options object.
    lines: list[str] = [f"  method: {_js_string(spec.method)},"]

    headers = _effective_headers(spec)
    body_type = spec.body.type
    emit_body = body_type != "none" and spec.method not in _BODYLESS_METHODS

    # For urlencoded/form bodies, ensure a sensible Content-Type is present.
    header_pairs = list(headers)
    has_ct = any(k.lower() == "content-type" for k, _ in header_pairs)
    if emit_body and body_type == "x-www-form-urlencoded" and not has_ct:
        header_pairs.append(("Content-Type", "application/x-www-form-urlencoded"))

    if header_pairs:
        header_entries = ",\n".join(
            f"    {_js_string(k)}: {_js_string(v)}" for k, v in header_pairs
        )
        lines.append("  headers: {\n" + header_entries + "\n  },")

    if emit_body:
        if body_type == "raw":
            lines.append(f"  body: {_js_string(spec.body.raw or '')},")
        elif body_type == "x-www-form-urlencoded":
            lines.append(f"  body: {_js_string(_urlencoded_body(spec))},")
        elif body_type == "form-data":
            # fetch uses a FormData instance for multipart bodies.
            form_lines = ["  body: (() => {", "    const fd = new FormData();"]
            for field in spec.body.fields:
                if not field.enabled or not field.key:
                    continue
                form_lines.append(
                    f"    fd.append({_js_string(field.key)}, {_js_string(field.value)});"
                )
            form_lines.append("    return fd;")
            form_lines.append("  })(),")
            lines.extend(form_lines)

    init = "{\n" + "\n".join(lines) + "\n}"
    return f"fetch({_js_string(url)}, {init});"
