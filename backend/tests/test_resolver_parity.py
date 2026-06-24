"""Variable-resolver parity fixtures. These assert the Python resolver's behavior
on the cases that MUST match the TS resolver (frontend/src/lib/variableResolver.ts).
If the TS resolver changes, mirror the change here and vice versa."""
from __future__ import annotations

import pytest

from app.resolver import build_scope, resolve_string

SCOPE = build_scope(
    [
        {"key": "base_url", "value": "https://api.example.com", "enabled": True},
        {"key": "token", "value": "secret123", "enabled": True},
        {"key": "name", "value": "gopal", "enabled": True},
        {"key": "disabled_var", "value": "nope", "enabled": False},
        {"key": "dup", "value": "first", "enabled": True},
        {"key": "dup", "value": "second", "enabled": True},  # last enabled wins
    ]
)


@pytest.mark.parametrize(
    "template,expected",
    [
        ("{{base_url}}/users", "https://api.example.com/users"),
        ("Bearer {{token}}", "Bearer secret123"),
        ("hello {{ name }}", "hello gopal"),  # whitespace trimmed
        ("{{unknown}}", "{{unknown}}"),  # unknown left literal
        ("{{disabled_var}}", "{{disabled_var}}"),  # disabled -> treated as unknown
        ("{{dup}}", "second"),  # last enabled duplicate wins
        ("{{}}", "{{}}"),  # empty token not substituted
        ("{{   }}", "{{   }}"),  # whitespace-only token not substituted
        (r"\{{name}}", "{{name}}"),  # escaped opener -> literal, no substitution
        ("{{name}} and {{name}}", "gopal and gopal"),  # multiple
        ("no vars here", "no vars here"),
        ("", ""),
    ],
)
def test_resolve_parity(template, expected):
    assert resolve_string(template, SCOPE) == expected


def test_unresolved_reported():
    unresolved: set[str] = set()
    resolve_string("{{a}}/{{b}}/{{base_url}}", SCOPE, unresolved)
    assert unresolved == {"a", "b"}


def test_single_pass_no_recursion():
    # A value that itself looks like a token is inserted verbatim (no re-expansion).
    scope = build_scope([{"key": "a", "value": "{{b}}", "enabled": True}, {"key": "b", "value": "X", "enabled": True}])
    assert resolve_string("{{a}}", scope) == "{{b}}"  # NOT "X"
