"""RequestSpec — the concrete, resolved request the frontend sends to /api/run.

This is the wire contract for executing a request. Variable resolution ({{var}})
has already happened on the frontend by the time a RequestSpec arrives (the backend
can also resolve via environmentId as a fallback for non-UI callers).
"""
from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel

HttpMethod = Literal["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
BodyType = Literal["none", "raw", "form-data", "x-www-form-urlencoded"]
RawLang = Literal["json", "text", "xml", "html", "javascript"]
AuthType = Literal["none", "bearer", "basic"]


class WireKeyValue(CamelModel):
    key: str = ""
    value: str = ""
    enabled: bool = True


class WireFormField(CamelModel):
    key: str = ""
    value: str = ""
    type: Literal["text", "file"] = "text"
    enabled: bool = True


class BodySpec(CamelModel):
    type: BodyType = "none"
    language: RawLang | None = "json"
    raw: str | None = None
    fields: list[WireFormField] = Field(default_factory=list)


class AuthSpec(CamelModel):
    type: AuthType = "none"
    # Flat config: bearer -> {token}; basic -> {username, password}.
    config: dict[str, str] | None = None


class RequestSpec(CamelModel):
    method: HttpMethod = "GET"
    url: str = ""
    params: list[WireKeyValue] = Field(default_factory=list)
    headers: list[WireKeyValue] = Field(default_factory=list)
    body: BodySpec = Field(default_factory=BodySpec)
    auth: AuthSpec = Field(default_factory=AuthSpec)
