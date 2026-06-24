"""Orchestrates a /api/run call: optional backend variable resolution, execute via
the runner, then record history. Returns a RunResult with historyId populated."""
from __future__ import annotations

import json

from sqlmodel import Session, select

from app.config import settings
from app.models import Environment, EnvironmentVariable, HistoryEntry, Workspace
from app.resolver import build_scope, resolve_string
from app.runner.executor import execute
from app.schemas.request_spec import RequestSpec
from app.schemas.run import RunRequest, RunResult


def _resolve_spec_backend(spec: RequestSpec, session: Session, environment_id: str) -> RequestSpec:
    """Fallback resolution for non-UI callers that pass environmentId + raw {{var}}."""
    env = session.get(Environment, environment_id)
    if env is None:
        return spec
    var_rows = session.exec(
        select(EnvironmentVariable).where(EnvironmentVariable.environment_id == environment_id)
    ).all()
    scope = build_scope([{"key": v.key, "value": v.value, "enabled": v.enabled} for v in var_rows])
    R = lambda s: resolve_string(s, scope)  # noqa: E731

    return spec.model_copy(
        update={
            "url": R(spec.url),
            "params": [p.model_copy(update={"key": R(p.key), "value": R(p.value)}) for p in spec.params],
            "headers": [h.model_copy(update={"key": R(h.key), "value": R(h.value)}) for h in spec.headers],
            "body": spec.body.model_copy(
                update={
                    "raw": R(spec.body.raw) if spec.body.raw is not None else None,
                    "fields": [
                        f.model_copy(update={"key": R(f.key), "value": R(f.value)}) for f in (spec.body.fields or [])
                    ],
                }
            ),
            "auth": spec.auth.model_copy(
                update={"config": {k: R(v) for k, v in (spec.auth.config or {}).items()}}
                if spec.auth.config
                else {}
            ),
        }
    )


def _default_workspace_id(session: Session) -> str:
    ws = session.exec(select(Workspace).where(Workspace.is_default == True)).first()  # noqa: E712
    if ws is None:
        ws = session.exec(select(Workspace)).first()
    if ws is None:
        ws = Workspace(name="My Workspace", is_default=True)
        session.add(ws)
        session.commit()
        session.refresh(ws)
    return ws.id


async def run_request(run_req: RunRequest, session: Session) -> RunResult:
    spec = run_req.request
    if run_req.environment_id:
        spec = _resolve_spec_backend(spec, session, run_req.environment_id)

    result = await execute(
        spec,
        run_req.options,
        default_timeout_ms=settings.default_timeout_ms,
        max_timeout_ms=settings.max_timeout_ms,
        default_max_redirects=settings.default_max_redirects,
        max_redirects_cap=settings.max_redirects_cap,
        default_max_bytes=settings.max_response_bytes,
        safe_default=settings.safe_mode,
    )

    if run_req.record_history:
        history_id = _record_history(run_req, spec, result, session)
        result.history_id = history_id

    return result


# Cap the response body we persist to history.
_HISTORY_BODY_CAP = 256 * 1024


def _record_history(run_req: RunRequest, resolved_spec: RequestSpec, result: RunResult, session: Session) -> str:
    workspace_id = _default_workspace_id(session)
    resp = result.response
    body = None
    headers_json = None
    if resp is not None:
        body = (resp.body or "")[:_HISTORY_BODY_CAP]
        headers_json = json.dumps(resp.headers)

    # Display URL = base + merged enabled params (the spec.url alone drops the
    # query string, since params live in spec.params). Keeps History readable.
    from app.runner.builder import build_final_url

    display_url = build_final_url(resolved_spec) or resolved_spec.url

    entry = HistoryEntry(
        workspace_id=workspace_id,
        request_id=run_req.request_id,
        environment_id=run_req.environment_id,
        method=resolved_spec.method,
        url=display_url,
        request_snapshot=resolved_spec.model_dump_json(by_alias=True),
        status_code=resp.status if resp else None,
        status_text=resp.reason if resp else None,
        response_time_ms=int(result.timing_ms),
        response_size_bytes=result.size_bytes,
        response_headers=headers_json,
        response_body=body,
        response_content_type=(resp.content_type if resp else None),
        is_error=not result.ok,
        error_message=(result.error.message if result.error else None),
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry.id
