"""Environment CRUD service.

Environments are named sets of {{var}} variables selectable in the top-bar
selector. There is no `is_active` column: the *currently selected* environment is
tracked on `workspace.active_environment_id` (a soft FK, SET NULL on env delete).
Each EnvironmentRead therefore derives `isActive` by comparing the env id against
the workspace pointer.

Conventions (mirrors runner_service.py):
  * Sync SQLModel `Session` from `Depends(get_session)`.
  * snake_case DB columns <-> camelCase JSON via the CamelModel DTOs; never return
    raw ORM rows.
  * All ids are server UUID strings.
  * The DB `environment_variable.is_secret` column maps to the wire `secret` field.
"""
from __future__ import annotations

from sqlmodel import Session, select

from app.api_errors import not_found
from app.models import Environment, EnvironmentVariable, Workspace, utcnow_iso
from app.schemas import (
    EnvironmentActivate,
    EnvironmentCreate,
    EnvironmentRead,
    EnvironmentUpsert,
    EnvVarDTO,
)
from app.services.collection_service import get_default_workspace


# --------------------------------------------------------------------------- #
# DTO mapping
# --------------------------------------------------------------------------- #
def _to_dto(env_row: Environment, active_env_id: str | None) -> EnvironmentRead:
    """Build the camelCase EnvironmentRead from an ORM row + the workspace's
    active-environment pointer. Variables are sorted by sort_order; `isActive` is
    derived from whether this env is the workspace's selected one."""
    variables = [
        EnvVarDTO(
            key=v.key,
            value=v.value,
            enabled=v.enabled,
            secret=v.is_secret,
        )
        for v in sorted(env_row.variables, key=lambda v: v.sort_order)
    ]
    return EnvironmentRead(
        id=env_row.id,
        name=env_row.name,
        is_active=(env_row.id == active_env_id),
        variables=variables,
        sort_order=env_row.sort_order,
        created_at=env_row.created_at,
        updated_at=env_row.updated_at,
    )


# --------------------------------------------------------------------------- #
# Read
# --------------------------------------------------------------------------- #
def list_environments(session: Session) -> list[EnvironmentRead]:
    """All environments in the default workspace, ordered by sort_order then
    created_at (stable dropdown ordering)."""
    workspace = get_default_workspace(session)
    rows = session.exec(
        select(Environment)
        .where(Environment.workspace_id == workspace.id)
        .order_by(Environment.sort_order, Environment.created_at)
    ).all()
    return [_to_dto(env, workspace.active_environment_id) for env in rows]


def get_environment(session: Session, id: str) -> EnvironmentRead:
    """Fetch a single environment or raise 404."""
    workspace = get_default_workspace(session)
    env = session.get(Environment, id)
    if env is None:
        raise not_found("Environment", id)
    return _to_dto(env, workspace.active_environment_id)


# --------------------------------------------------------------------------- #
# Create
# --------------------------------------------------------------------------- #
def create_environment(session: Session, payload: EnvironmentCreate) -> EnvironmentRead:
    """Create a new environment with its variables. sort_order is appended
    (current max + 1); variable rows take sort_order = list index."""
    workspace = get_default_workspace(session)

    # Append after the highest existing sort_order in this workspace.
    existing = session.exec(
        select(Environment.sort_order).where(Environment.workspace_id == workspace.id)
    ).all()
    next_sort = (max(existing) + 1) if existing else 0

    env = Environment(
        workspace_id=workspace.id,
        name=payload.name,
        sort_order=next_sort,
    )
    session.add(env)
    session.flush()  # assign env.id before inserting child rows

    for index, var in enumerate(payload.variables):
        session.add(
            EnvironmentVariable(
                environment_id=env.id,
                key=var.key,
                value=var.value,
                enabled=var.enabled,
                is_secret=var.secret,
                sort_order=index,
            )
        )

    session.commit()
    session.refresh(env)
    return _to_dto(env, workspace.active_environment_id)


# --------------------------------------------------------------------------- #
# Replace (PUT)
# --------------------------------------------------------------------------- #
def replace_environment(
    session: Session, id: str, payload: EnvironmentUpsert
) -> EnvironmentRead:
    """PUT semantics: update the name and fully replace the variable set. All
    existing variable rows are deleted and re-inserted from the payload."""
    workspace = get_default_workspace(session)
    env = session.get(Environment, id)
    if env is None:
        raise not_found("Environment", id)

    env.name = payload.name

    # Drop every existing variable row, then re-insert from the payload.
    for old in list(env.variables):
        session.delete(old)
    session.flush()

    for index, var in enumerate(payload.variables):
        session.add(
            EnvironmentVariable(
                environment_id=env.id,
                key=var.key,
                value=var.value,
                enabled=var.enabled,
                is_secret=var.secret,
                sort_order=index,
            )
        )

    env.updated_at = utcnow_iso()
    session.add(env)
    session.commit()
    session.refresh(env)
    return _to_dto(env, workspace.active_environment_id)


# --------------------------------------------------------------------------- #
# Patch (PATCH) — toggle active / rename / reorder
# --------------------------------------------------------------------------- #
def patch_environment(
    session: Session, id: str, payload: EnvironmentActivate
) -> EnvironmentRead:
    """Partial update. Any of name / sort_order / is_active may be supplied:
      * name        -> rename the environment
      * sort_order  -> reorder in the dropdown
      * is_active   -> True selects this env on the workspace pointer; False clears
                       the pointer only if this env is the one currently active."""
    workspace = get_default_workspace(session)
    env = session.get(Environment, id)
    if env is None:
        raise not_found("Environment", id)

    changed = False
    if payload.name is not None:
        env.name = payload.name
        changed = True
    if payload.sort_order is not None:
        env.sort_order = payload.sort_order
        changed = True

    if payload.is_active is not None:
        if payload.is_active:
            workspace.active_environment_id = env.id
        elif workspace.active_environment_id == env.id:
            workspace.active_environment_id = None
        workspace.updated_at = utcnow_iso()
        session.add(workspace)

    if changed:
        env.updated_at = utcnow_iso()
        session.add(env)

    session.commit()
    session.refresh(env)
    session.refresh(workspace)
    return _to_dto(env, workspace.active_environment_id)


# --------------------------------------------------------------------------- #
# Delete
# --------------------------------------------------------------------------- #
def delete_environment(session: Session, id: str) -> None:
    """Delete an environment. The FK ON DELETE CASCADE removes its variable rows
    and ON DELETE SET NULL clears workspace.active_environment_id if it pointed
    here. Uses an ORM delete so the relationship cascade fires."""
    env = session.get(Environment, id)
    if env is None:
        raise not_found("Environment", id)
    session.delete(env)
    session.commit()
