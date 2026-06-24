"""POST /api/run — the core proxy/runner endpoint. Always returns HTTP 200 with a
RunResult; upstream failures are ok=false envelopes, not HTTP errors."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.schemas.run import RunRequest, RunResult
from app.services.runner_service import run_request

router = APIRouter(prefix="/api", tags=["run"])


@router.post("/run", response_model=RunResult)
async def post_run(payload: RunRequest, session: Session = Depends(get_session)) -> RunResult:
    return await run_request(payload, session)
