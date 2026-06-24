"""FastAPI application factory: lifespan (httpx client + DB init), CORS, routers,
and shared exception handlers that emit the {error:{code,message,...}} body."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api_errors import ApiError
from app.config import settings
from app.db import init_db
from app.runner.client import shutdown_client, startup_client

logger = logging.getLogger("postman_clone")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    await startup_client()
    yield
    await shutdown_client()


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        # Also allow any localhost/127.0.0.1 port for local dev convenience
        # (e.g. running the frontend on a non-default port). Safe because the
        # backend proxies outbound requests and uses no cookies/credentials.
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # --- exception handlers ---
    @app.exception_handler(ApiError)
    async def _api_error_handler(_: Request, exc: ApiError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message, "resource": exc.resource, "id": exc.id}},
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(_: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "VALIDATION_ERROR", "message": "Request validation failed.", "detail": exc.errors()}},
        )

    @app.exception_handler(Exception)
    async def _unhandled_handler(_: Request, exc: Exception):
        logger.exception("Unhandled error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "INTERNAL", "message": "An internal error occurred."}},
        )

    # --- routers ---
    from app.routers import run as run_router

    app.include_router(run_router.router)

    # CRUD routers (created by the build phase). Imported defensively so the app
    # still boots if a router module is mid-development.
    for mod_name in ("collections", "folders", "requests", "environments", "history", "importexport"):
        try:
            module = __import__(f"app.routers.{mod_name}", fromlist=["router"])
            app.include_router(module.router)
        except ImportError:
            logger.warning("Router app.routers.%s not available yet", mod_name)

    @app.get("/api/health", tags=["health"])
    async def health():
        return {"status": "ok", "name": settings.app_name, "version": settings.app_version, "safeMode": settings.safe_mode}

    return app


app = create_app()
