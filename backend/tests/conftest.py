"""Pytest fixtures: an isolated in-memory SQLite DB + TestClient per test."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import app.db as db_module
from app.config import settings


@pytest.fixture()
def anyio_backend():
    # Restrict anyio-based async tests to asyncio (avoid requiring trio).
    return "asyncio"


@pytest.fixture()
def engine():
    # Shared in-memory DB across the single connection (StaticPool) for the test.
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(eng, "connect")
    def _fk_on(dbapi_conn, _):  # noqa: ANN001
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    import app.models  # noqa: F401  (register tables)

    SQLModel.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture()
def client(engine, monkeypatch):
    # Point the app's session dependency at the test engine.
    monkeypatch.setattr(db_module, "engine", engine)
    settings.safe_mode = False

    from app.db import get_session
    from app.main import app

    def _get_session_override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = _get_session_override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def session(engine):
    with Session(engine) as s:
        yield s
