"""Shared httpx.AsyncClient factory + lifespan management.

A single pooled client is reused across requests for connection reuse. We do NOT
enable httpx's own follow_redirects on the pooled client; redirects are driven
manually in the executor so each hop can be re-validated by the SSRF guard.
"""
from __future__ import annotations

import httpx

_client: httpx.AsyncClient | None = None


def _build_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        follow_redirects=False,  # manual redirect handling in executor
        timeout=httpx.Timeout(30.0),
        limits=httpx.Limits(max_connections=50, max_keepalive_connections=10),
        verify=True,
    )


async def startup_client() -> None:
    global _client
    if _client is None:
        _client = _build_client()


async def shutdown_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def get_client() -> httpx.AsyncClient:
    """Return the shared client (lazily created for tests that skip lifespan)."""
    global _client
    if _client is None:
        _client = _build_client()
    return _client
