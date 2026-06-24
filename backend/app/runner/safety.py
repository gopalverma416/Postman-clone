"""SSRF safety guard.

Assignment-level mitigations (documented gaps, not over-engineered):
  * Scheme allowlist: only http/https.
  * Private-network guard: block loopback / RFC1918 / link-local (incl. cloud
    metadata 169.254.169.254) / unique-local IPv6 when enabled.
  * Re-validated on every redirect hop (see executor).
KNOWN GAP: not DNS-rebinding-proof — a robust fix pins the resolved IP to the
connection via a custom transport. Documented rather than fully implemented.
SAFE_MODE can be disabled in dev so testers can hit localhost mock servers.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit

from app.runner.errors import RunnerException

ALLOWED_SCHEMES = {"http", "https"}


def validate_scheme(url: str) -> None:
    parts = urlsplit(url)
    if not parts.scheme or not parts.netloc:
        raise RunnerException("INVALID_URL", "The URL is not valid. Include a scheme (http/https) and host.", {"url": url})
    if parts.scheme.lower() not in ALLOWED_SCHEMES:
        raise RunnerException(
            "INVALID_URL",
            f"Unsupported URL scheme '{parts.scheme}'. Only http and https are allowed.",
            {"scheme": parts.scheme},
        )


def _ip_is_blocked(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return (
        addr.is_loopback
        or addr.is_private
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    )


def assert_host_allowed(url: str, *, block_private: bool) -> None:
    """Validate scheme always; when block_private, also resolve+guard the host IP."""
    validate_scheme(url)
    if not block_private:
        return
    host = urlsplit(url).hostname
    if not host:
        raise RunnerException("INVALID_URL", "The URL has no host.", {"url": url})

    # If host is already an IP literal, check directly.
    try:
        ipaddress.ip_address(host)
        if _ip_is_blocked(host):
            raise RunnerException(
                "BLOCKED_HOST",
                "Requests to private or internal addresses are blocked for safety.",
                {"host": host, "resolvedIp": host},
            )
        return
    except ValueError:
        pass  # not an IP literal; resolve below

    # Resolve hostname; block if ANY resolved address is internal.
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise RunnerException(
            "CONNECTION_ERROR",
            "Could not resolve the host name.",
            {"host": host, "error": str(exc)},
        ) from exc
    for info in infos:
        ip = info[4][0]
        if _ip_is_blocked(ip):
            raise RunnerException(
                "BLOCKED_HOST",
                "Requests to private or internal addresses are blocked for safety.",
                {"host": host, "resolvedIp": ip},
            )
