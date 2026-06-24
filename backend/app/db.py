"""Database engine, session, and connection setup.

Critical detail: SQLite does NOT enforce foreign keys unless `PRAGMA
foreign_keys=ON` is issued on every connection. We register a connect-event
listener to guarantee cascade deletes actually fire.
"""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

# check_same_thread=False is required because FastAPI may use the connection
# across threads; SQLModel/SQLAlchemy manages session lifecycle per request.
engine = create_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False},
)


@event.listens_for(Engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):  # noqa: ANN001
    """Enable FK enforcement on every new SQLite connection."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def init_db() -> None:
    """Create all tables. Import models for side-effect registration first."""
    # Imported here (not at module top) to avoid circular imports and to ensure
    # every model class is registered on SQLModel.metadata before create_all.
    import app.models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a short-lived sync session per request."""
    with Session(engine) as session:
        yield session
