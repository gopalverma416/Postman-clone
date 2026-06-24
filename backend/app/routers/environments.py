"""Environment CRUD endpoints.

Thin HTTP layer over ``app.services.environment_service``: it parses/validates the
request, hands the session + DTO to the service, and returns the service's
*Read DTO. All business logic (default-workspace resolution, active-environment
bookkeeping on ``workspace.active_environment_id``, snake_case<->camelCase mapping)
lives in the service, mirroring the runner_service / routers.run split.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlmodel import Session

from app.db import get_session
from app.schemas.common import ListEnvelope
from app.schemas.environments import (
    EnvironmentActivate,
    EnvironmentCreate,
    EnvironmentRead,
    EnvironmentUpsert,
)
from app.services import environment_service

router = APIRouter(prefix="/api", tags=["environments"])


@router.get("/environments", response_model=ListEnvelope[EnvironmentRead])
def list_environments(session: Session = Depends(get_session)) -> ListEnvelope[EnvironmentRead]:
    """List all environments in the default workspace (sorted by sort_order)."""
    items = environment_service.list_environments(session)
    return ListEnvelope[EnvironmentRead](items=items, total=len(items))


@router.post(
    "/environments",
    response_model=EnvironmentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_environment(
    payload: EnvironmentCreate, session: Session = Depends(get_session)
) -> EnvironmentRead:
    """Create a new environment (with its initial variable rows)."""
    return environment_service.create_environment(session, payload)


@router.get("/environments/{environment_id}", response_model=EnvironmentRead)
def get_environment(
    environment_id: str, session: Session = Depends(get_session)
) -> EnvironmentRead:
    """Fetch a single environment by id (404 if missing)."""
    return environment_service.get_environment(session, environment_id)


@router.put("/environments/{environment_id}", response_model=EnvironmentRead)
def replace_environment(
    environment_id: str,
    payload: EnvironmentUpsert,
    session: Session = Depends(get_session),
) -> EnvironmentRead:
    """Replace an environment's name and full variable list (404 if missing)."""
    return environment_service.replace_environment(session, environment_id, payload)


@router.patch("/environments/{environment_id}", response_model=EnvironmentRead)
def update_environment(
    environment_id: str,
    payload: EnvironmentActivate,
    session: Session = Depends(get_session),
) -> EnvironmentRead:
    """Partial update: toggle active (workspace.active_environment_id), rename, reorder."""
    return environment_service.patch_environment(session, environment_id, payload)


@router.delete("/environments/{environment_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_environment(
    environment_id: str, session: Session = Depends(get_session)
) -> None:
    """Delete an environment (404 if missing). Active pointer clears via SET NULL."""
    environment_service.delete_environment(session, environment_id)
