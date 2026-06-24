"""Shared schema base + envelope types."""
from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

T = TypeVar("T")


class CamelModel(BaseModel):
    """Base model: serialize to camelCase, accept either camel or snake on input."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class ListEnvelope(CamelModel, Generic[T]):
    items: list[T]
    total: int | None = None


class ErrorDetail(CamelModel):
    code: str  # NOT_FOUND | CONFLICT | VALIDATION_ERROR | INTERNAL
    message: str
    resource: str | None = None
    id: str | None = None
    detail: Any | None = None


class ErrorBody(CamelModel):
    error: ErrorDetail
