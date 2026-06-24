"""Variable resolver — Python mirror of frontend/src/lib/variableResolver.ts.

The frontend resolves {{var}} before sending, so this is a fallback for non-UI
callers (and for the optional environmentId path on /api/run). It MUST behave
identically to the TS resolver; tests/test_resolver_parity.py enforces this on a
shared fixture set.

Rules: TOKEN_RE = r"\\{\\{\\s*([^{}]+?)\\s*\\}\\}"; single-pass; unknown -> literal;
escape `\\{{` -> literal `{{`; never percent-encodes; case-sensitive names.
"""
from __future__ import annotations

import re

TOKEN_RE = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")
_ESC_OPEN_RE = re.compile(r"\\\{\{")
_ESC_SENTINEL = " ESC_OPEN "


def build_scope(variables: list[dict]) -> dict[str, str]:
    """Flatten enabled environment variables into a name->value map (last wins)."""
    scope: dict[str, str] = {}
    for v in variables:
        if v.get("enabled", True) and v.get("key", "") != "":
            scope[v["key"]] = v.get("value", "")
    return scope


def resolve_string(value: str | None, scope: dict[str, str], unresolved: set[str] | None = None) -> str:
    """Single-pass {{var}} substitution. Unknown tokens left literal + reported."""
    if value is None or value == "":
        return value or ""
    masked = _ESC_OPEN_RE.sub(_ESC_SENTINEL, value)

    def _repl(m: re.Match[str]) -> str:
        name = m.group(1).strip()
        if name in scope:
            return scope[name]
        if unresolved is not None:
            unresolved.add(name)
        return m.group(0)  # unknown -> literal {{name}}

    out = TOKEN_RE.sub(_repl, masked)
    return out.replace(_ESC_SENTINEL, "{{")


def extract_tokens(value: str | None) -> list[str]:
    if not value:
        return []
    masked = _ESC_OPEN_RE.sub(_ESC_SENTINEL, value)
    return [m.group(1).strip() for m in TOKEN_RE.finditer(masked)]
