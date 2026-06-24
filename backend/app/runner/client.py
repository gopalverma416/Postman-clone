"""Shared httpx.AsyncClient factory + lifespan management.

A single pooled client is reused across requests for connection reuse. We do NOT
enable httpx's own follow_redirects on the pooled client; redirects are driven
manually in the executor so each hop can be re-validated by the SSRF guard.
"""
from __future__ import annotations

import httpx

# Two pooled clients: one that verifies TLS (default) and one that does not, so
# the per-request verifyTls option can be honored without rebuilding a client
# every send.
_clients: dict[bool, httpx.AsyncClient] = {}


def _build_client(verify: bool) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        follow_redirects=False,  # manual redirect handling in executor
        timeout=httpx.Timeout(30.0),
        limits=httpx.Limits(max_connections=50, max_keepalive_connections=10),
        verify=verify,
    )


async def startup_client() -> None:
    if True not in _clients:
        _clients[True] = _build_client(True)


async def shutdown_client() -> None:
    for client in list(_clients.values()):
        await client.aclose()
    _clients.clear()


def get_client(verify: bool = True) -> httpx.AsyncClient:
    """Return the shared client for the given TLS-verify setting (lazily created)."""
    if verify not in _clients:
        _clients[verify] = _build_client(verify)
    return _clients[verify]
