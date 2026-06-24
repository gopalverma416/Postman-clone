"""Execute a built request: manual redirects (re-validated per hop), timing,
byte-capped streaming read, charset decode, and exception mapping."""
from __future__ import annotations

import time
from urllib.parse import urljoin

import httpx

from app.runner.builder import build_final_url, build_httpx_request
from app.runner.errors import RunnerException, classify_httpx_error
from app.runner.safety import assert_host_allowed
from app.schemas.request_spec import RequestSpec
from app.schemas.run import RedirectHop, RunOptions, RunResponse, RunResult

REDIRECT_STATUSES = {301, 302, 303, 307, 308}
# Content-Type prefixes we treat as text (everything else -> isBinary if undecodable).
_TEXT_HINTS = ("text/", "application/json", "application/xml", "application/javascript",
               "application/x-www-form-urlencoded", "+json", "+xml")


def _is_textual(content_type: str) -> bool:
    ct = content_type.lower()
    # Only an explicit allowlist of text-ish types (or a missing content-type) is
    # treated as textual. A blanket `application/*` match would wrongly decode
    # binary payloads (application/pdf, /zip, /octet-stream, /x-protobuf) as
    # garbage text and report isBinary=false.
    return any(h in ct for h in _TEXT_HINTS) or ct == ""


def _decode_body(raw: bytes, content_type: str, charset: str | None) -> tuple[str | None, bool]:
    """Decode bytes to text. Returns (text, is_binary)."""
    if raw == b"":
        return "", False
    enc = charset or "utf-8"
    try:
        text = raw.decode(enc)
        # If it's clearly non-text by content-type and contains many NULs, flag binary.
        if not _is_textual(content_type) and "\x00" in text[:1024]:
            return None, True
        return text, False
    except (UnicodeDecodeError, LookupError):
        if _is_textual(content_type):
            return raw.decode("utf-8", errors="replace"), False
        return None, True


async def execute(spec: RequestSpec, options: RunOptions, *, default_timeout_ms: int,
                  max_timeout_ms: int, default_max_redirects: int, max_redirects_cap: int,
                  default_max_bytes: int, safe_default: bool) -> RunResult:
    """Run the request pipeline and return a RunResult (always; never raises out)."""
    from app.runner.client import get_client

    timeout_ms = min(options.timeout_ms or default_timeout_ms, max_timeout_ms)
    max_redirects = min(options.max_redirects or default_max_redirects, max_redirects_cap)
    max_bytes = options.max_response_bytes or default_max_bytes
    block_private = options.block_private_hosts if options.block_private_hosts is not None else safe_default
    follow = options.follow_redirects

    client = get_client(verify=options.verify_tls)
    t0 = time.perf_counter()
    try:
        final_url = build_final_url(spec)
        assert_host_allowed(final_url, block_private=block_private)

        redirect_chain: list[RedirectHop] = []
        current_url = final_url
        current_method = spec.method
        current_spec = spec
        hops = 0
        response: httpx.Response | None = None
        raw = b""
        truncated = False

        while True:
            # Build per-hop (only the first hop carries body/auth; redirected GETs drop body on 303).
            req = build_httpx_request(current_spec, client, current_url)
            # httpx 0.28: per-request timeout is set via the request's extensions.
            req.extensions["timeout"] = httpx.Timeout(timeout_ms / 1000.0).as_dict()
            try:
                resp = await client.send(req, stream=True)
            except Exception as exc:  # noqa: BLE001 - mapped to typed error below
                err = classify_httpx_error(exc, timeout_ms)
                t1 = time.perf_counter()
                return RunResult(ok=False, error=err, timing_ms=round((t1 - t0) * 1000, 2), size_bytes=0)

            # Redirect handling.
            if follow and resp.status_code in REDIRECT_STATUSES and "location" in resp.headers:
                location = resp.headers["location"]
                next_url = urljoin(current_url, location)
                redirect_chain.append(RedirectHop(status=resp.status_code, location=location, url=next_url))
                await resp.aclose()
                hops += 1
                if hops > max_redirects:
                    t1 = time.perf_counter()
                    return RunResult(
                        ok=False,
                        error=classify_httpx_error(httpx.TooManyRedirects("too many redirects"), timeout_ms),
                        timing_ms=round((t1 - t0) * 1000, 2),
                        size_bytes=0,
                    )
                # Re-validate the redirect target (open-redirect-to-internal guard).
                try:
                    assert_host_allowed(next_url, block_private=block_private)
                except RunnerException as exc:
                    t1 = time.perf_counter()
                    return RunResult(ok=False, error=exc.to_error(), timing_ms=round((t1 - t0) * 1000, 2), size_bytes=0)
                # On 303 (and 301/302 for non-GET per common practice), switch to GET and drop body.
                current_url = next_url
                if resp.status_code == 303 or (resp.status_code in (301, 302) and current_method not in ("GET", "HEAD")):
                    current_method = "GET"
                    current_spec = current_spec.model_copy(
                        update={"method": "GET", "body": current_spec.body.model_copy(update={"type": "none"})}
                    )
                else:
                    current_spec = current_spec.model_copy(update={"method": current_method})
                continue

            # Terminal response: read body with byte cap.
            response = resp
            chunks: list[bytes] = []
            total = 0
            async for chunk in resp.aiter_bytes():
                if total + len(chunk) > max_bytes:
                    chunks.append(chunk[: max_bytes - total])
                    total = max_bytes
                    truncated = True
                    break
                chunks.append(chunk)
                total += len(chunk)
            raw = b"".join(chunks)
            await resp.aclose()
            break

        t1 = time.perf_counter()
        elapsed = round((t1 - t0) * 1000, 2)

        assert response is not None
        content_type = response.headers.get("content-type", "")
        charset = response.charset_encoding
        body_text, is_binary = _decode_body(raw, content_type, charset)

        # Ordered header list preserving duplicates (e.g. Set-Cookie).
        headers_list = [{"key": k, "value": v} for k, v in response.headers.multi_items()]
        header_bytes = sum(len(k) + len(v) + 4 for k, v in response.headers.multi_items())
        declared = response.headers.get("content-length")
        declared_len = int(declared) if declared and declared.isdigit() else None

        run_response = RunResponse(
            status=response.status_code,
            reason=response.reason_phrase or "",
            ok=200 <= response.status_code < 400,
            headers=headers_list,
            content_type=content_type or None,
            body=body_text,
            is_binary=is_binary,
            truncated=truncated,
            size_bytes=len(raw),
            declared_content_length=declared_len,
            header_bytes=header_bytes,
            final_url=str(response.url),
            redirect_chain=redirect_chain,
            http_version=response.http_version,
        )
        return RunResult(ok=True, response=run_response, timing_ms=elapsed, size_bytes=len(raw))

    except RunnerException as exc:
        t1 = time.perf_counter()
        return RunResult(ok=False, error=exc.to_error(), timing_ms=round((t1 - t0) * 1000, 2), size_bytes=0)
    except Exception as exc:  # noqa: BLE001 - last-resort mapping; never 500 on send path
        t1 = time.perf_counter()
        return RunResult(
            ok=False,
            error=classify_httpx_error(exc, timeout_ms),
            timing_ms=round((t1 - t0) * 1000, 2),
            size_bytes=0,
        )
