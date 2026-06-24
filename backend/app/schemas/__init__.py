"""Pydantic v2 schemas — the canonical wire contract.

Every API response uses camelCase JSON (alias_generator=to_camel) while DB columns
stay snake_case. `populate_by_name=True` lets us construct models from either form.
These shapes are mirrored byte-for-byte by frontend/src/types/index.ts.
"""
from app.schemas.collections import (
    CollectionCreate,
    CollectionRead,
    CollectionUpdate,
    FolderCreate,
    FolderRead,
    FolderUpdate,
    KeyValueDTO,
    RequestAuthDTO,
    RequestBodyDTO,
    RequestCreate,
    RequestRead,
    RequestSummary,
    RequestUpdate,
)
from app.schemas.common import CamelModel, ErrorBody, ErrorDetail, ListEnvelope
from app.schemas.environments import (
    EnvironmentActivate,
    EnvironmentCreate,
    EnvironmentRead,
    EnvironmentUpsert,
    EnvVarDTO,
)
from app.schemas.history import HistoryCreate, HistoryRead
from app.schemas.request_spec import (
    AuthSpec,
    BodySpec,
    RequestSpec,
    WireFormField,
    WireKeyValue,
)
from app.schemas.run import (
    RedirectHop,
    RunError,
    RunOptions,
    RunRequest,
    RunResponse,
    RunResult,
)

__all__ = [
    "CamelModel",
    "ErrorBody",
    "ErrorDetail",
    "ListEnvelope",
    "WireKeyValue",
    "WireFormField",
    "BodySpec",
    "AuthSpec",
    "RequestSpec",
    "RunOptions",
    "RunRequest",
    "RunResponse",
    "RunError",
    "RunResult",
    "RedirectHop",
    "KeyValueDTO",
    "RequestAuthDTO",
    "RequestBodyDTO",
    "CollectionCreate",
    "CollectionUpdate",
    "CollectionRead",
    "FolderCreate",
    "FolderUpdate",
    "FolderRead",
    "RequestCreate",
    "RequestUpdate",
    "RequestRead",
    "RequestSummary",
    "EnvVarDTO",
    "EnvironmentCreate",
    "EnvironmentUpsert",
    "EnvironmentActivate",
    "EnvironmentRead",
    "HistoryCreate",
    "HistoryRead",
]
