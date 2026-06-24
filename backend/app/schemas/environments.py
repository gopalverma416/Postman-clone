"""Environment + variable DTOs."""
from __future__ import annotations

from pydantic import Field

from app.schemas.common import CamelModel


class EnvVarDTO(CamelModel):
    key: str = ""
    value: str = ""
    enabled: bool = True
    secret: bool = False


class EnvironmentCreate(CamelModel):
    name: str
    variables: list[EnvVarDTO] = Field(default_factory=list)


class EnvironmentUpsert(CamelModel):
    """PUT body: replaces name + the full variables list."""

    name: str
    variables: list[EnvVarDTO] = Field(default_factory=list)


class EnvironmentActivate(CamelModel):
    """PATCH body: primarily toggling the active environment."""

    is_active: bool | None = None
    name: str | None = None
    sort_order: int | None = None


class EnvironmentRead(CamelModel):
    id: str
    name: str
    is_active: bool = False
    variables: list[EnvVarDTO] = Field(default_factory=list)
    sort_order: int = 0
    created_at: str
    updated_at: str
