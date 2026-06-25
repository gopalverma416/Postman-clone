"""Application configuration loaded from environment / .env.

Centralizes all tunables for the runner, CORS, database, and safety mode so the
rest of the app reads from a single typed settings object.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- App ---
    app_name: str = "Postman Clone API"
    app_version: str = "1.0.0"
    debug: bool = True

    # --- Database ---
    # Relative path resolves against the backend working directory.
    database_url: str = "sqlite:///./app.db"

    # --- CORS ---
    # Comma-separated list of allowed browser origins for the frontend.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # --- Runner defaults (overridable per-request via RunOptions) ---
    default_timeout_ms: int = 30_000
    max_timeout_ms: int = 120_000
    default_max_redirects: int = 10
    max_redirects_cap: int = 20
    # 10 MB response body cap by default.
    max_response_bytes: int = 10 * 1024 * 1024

    # --- Safety / SSRF ---
    # When true, the runner blocks private/loopback/link-local/metadata hosts and
    # restricts schemes to http/https. Default false in dev so testers can hit
    # local mock servers (httpbin in docker, localhost APIs, etc.).
    safe_mode: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def cors_allow_all(self) -> bool:
        """True when CORS_ORIGINS is '*' — allow any origin. Safe here because the
        backend is a credential-less proxy (no cookies), so wildcard CORS exposes
        nothing a user couldn't already do with curl."""
        return "*" in self.cors_origin_list


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
