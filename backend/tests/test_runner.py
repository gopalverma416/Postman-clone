"""Runner tests using httpx MockTransport (no real network)."""
from __future__ import annotations

import httpx
import pytest

from app.runner import client as client_mod
from app.schemas.request_spec import RequestSpec
from app.schemas.run import RunOptions
from app.runner.executor import execute


def _mock_client(handler):
    transport = httpx.MockTransport(handler)
    return httpx.AsyncClient(transport=transport, follow_redirects=False)


async def _run(spec, options=None, **kw):
    defaults = dict(
        default_timeout_ms=30000,
        max_timeout_ms=120000,
        default_max_redirects=10,
        max_redirects_cap=20,
        default_max_bytes=10 * 1024 * 1024,
        safe_default=False,
    )
    defaults.update(kw)
    return await execute(spec, options or RunOptions(), **defaults)


@pytest.mark.anyio
async def test_basic_get(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/get"
        return httpx.Response(200, json={"ok": True}, headers={"content-type": "application/json"})

    monkeypatch.setattr(client_mod, "get_client", lambda: _mock_client(handler))
    res = await _run(RequestSpec(method="GET", url="https://api.test/get"))
    assert res.ok and res.response.status == 200
    assert res.response.content_type.startswith("application/json")
    assert res.timing_ms >= 0


@pytest.mark.anyio
async def test_query_params_merged(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["query"] = dict(request.url.params)
        return httpx.Response(200, text="ok")

    monkeypatch.setattr(client_mod, "get_client", lambda: _mock_client(handler))
    spec = RequestSpec(method="GET", url="https://api.test/x", params=[{"key": "a", "value": "b", "enabled": True}, {"key": "c", "value": "d", "enabled": False}])
    await _run(spec)
    assert seen["query"].get("a") == "b" and "c" not in seen["query"]


@pytest.mark.anyio
async def test_bearer_auth_header(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, text="ok")

    monkeypatch.setattr(client_mod, "get_client", lambda: _mock_client(handler))
    spec = RequestSpec(method="GET", url="https://api.test/x", auth={"type": "bearer", "config": {"token": "T"}})
    await _run(spec)
    assert seen["auth"] == "Bearer T"


@pytest.mark.anyio
async def test_json_body_content_type(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["ct"] = request.headers.get("content-type")
        seen["body"] = request.content.decode()
        return httpx.Response(201, text="created")

    monkeypatch.setattr(client_mod, "get_client", lambda: _mock_client(handler))
    spec = RequestSpec(method="POST", url="https://api.test/x", body={"type": "raw", "language": "json", "raw": '{"a":1}'})
    await _run(spec)
    assert seen["ct"] == "application/json" and seen["body"] == '{"a":1}'


@pytest.mark.anyio
async def test_redirect_chain(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/a":
            return httpx.Response(302, headers={"location": "https://api.test/b"})
        return httpx.Response(200, text="final")

    monkeypatch.setattr(client_mod, "get_client", lambda: _mock_client(handler))
    res = await _run(RequestSpec(method="GET", url="https://api.test/a"))
    assert res.ok and res.response.status == 200 and len(res.response.redirect_chain) == 1


@pytest.mark.anyio
async def test_invalid_scheme():
    res = await _run(RequestSpec(method="GET", url="file:///etc/passwd"))
    assert res.ok is False and res.error.code == "INVALID_URL"


@pytest.mark.anyio
async def test_blocked_host_when_safe():
    res = await _run(
        RequestSpec(method="GET", url="http://127.0.0.1/x"),
        RunOptions(block_private_hosts=True),
        safe_default=True,
    )
    assert res.ok is False and res.error.code == "BLOCKED_HOST"


@pytest.mark.anyio
async def test_truncation(monkeypatch):
    big = "x" * 5000

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=big)

    monkeypatch.setattr(client_mod, "get_client", lambda: _mock_client(handler))
    res = await _run(RequestSpec(method="GET", url="https://api.test/big"), default_max_bytes=1000)
    assert res.ok and res.response.truncated and res.response.size_bytes == 1000
