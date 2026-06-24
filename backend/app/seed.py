"""Database seeder — `python -m app.seed`.

Populates a fresh SQLite database with a sensible starter set so the app is
immediately usable: one default workspace, two environments (one active), two
collections of demo requests against httpbin.org / jsonplaceholder.typicode.com,
and a few history entries.

This module is intentionally *idempotent*: it ensures exactly one default
``Workspace`` and, if any collections already exist, prints ``Already seeded``
and returns without touching anything. Re-running is therefore safe.

All persistence goes through the same service layer the HTTP API uses
(``collection_service``, ``request_service``, ``environment_service``,
``history_service``) so the seeded rows are byte-for-byte identical to what the
app would create through its endpoints — we never hand-build ORM rows here.
"""
from __future__ import annotations

from sqlmodel import Session, select

from app.db import engine, init_db
from app.models import Workspace

# Service layer — the same functions the routers call. Seeding through these
# keeps the wire/DB translation (e.g. body-type token, auth_config JSON) in one
# place and guarantees seeded data matches API-created data exactly.
from app.services import (
    collection_service,
    environment_service,
    history_service,
    request_service,
)

# DTOs (camelCase wire contract). We build these explicitly rather than raw ORM
# rows so the service layer applies all of its normalization.
from app.schemas import (
    CollectionCreate,
    EnvironmentActivate,
    EnvironmentCreate,
    EnvVarDTO,
    FolderCreate,
    HistoryCreate,
    KeyValueDTO,
    RequestAuthDTO,
    RequestBodyDTO,
    RequestCreate,
    RequestSpec,
)
from app.schemas.collections import RequestBasic, RequestBearer
from app.schemas.request_spec import AuthSpec, BodySpec, WireKeyValue


# --------------------------------------------------------------------------- #
# Default workspace helper
# --------------------------------------------------------------------------- #
def _ensure_default_workspace(session: Session) -> Workspace:
    """Return the single default workspace, creating it if missing.

    The schema is designed around exactly one ``is_default=True`` workspace; the
    services resolve it via the same query. We create it here so a fresh DB has a
    root container for collections/environments/history.
    """
    ws = session.exec(
        select(Workspace).where(Workspace.is_default == True)  # noqa: E712
    ).first()
    if ws is None:
        ws = Workspace(name="My Workspace", is_default=True)
        session.add(ws)
        session.commit()
        session.refresh(ws)
    return ws


# --------------------------------------------------------------------------- #
# Environment seeding
# --------------------------------------------------------------------------- #
def _seed_environments(session: Session) -> tuple[str, str]:
    """Create the two demo environments and activate 'Httpbin'.

    Returns ``(httpbin_env_id, jsonplaceholder_env_id)``.
    """
    httpbin = environment_service.create_environment(
        session,
        EnvironmentCreate(
            name="Httpbin",
            variables=[
                EnvVarDTO(key="base_url", value="https://httpbin.org"),
                # Mark the bearer token secret so the UI masks it.
                EnvVarDTO(key="token", value="demo-bearer-token-123", secret=True),
                EnvVarDTO(key="username", value="user"),
                EnvVarDTO(key="password", value="passwd"),
            ],
        ),
    )

    jsonplaceholder = environment_service.create_environment(
        session,
        EnvironmentCreate(
            name="JSONPlaceholder",
            variables=[
                EnvVarDTO(
                    key="base_url",
                    value="https://jsonplaceholder.typicode.com",
                ),
            ],
        ),
    )

    # Make 'Httpbin' the active environment (sets workspace.active_environment_id).
    environment_service.patch_environment(
        session,
        httpbin.id,
        EnvironmentActivate(is_active=True),
    )

    return httpbin.id, jsonplaceholder.id


# --------------------------------------------------------------------------- #
# Collection seeding
# --------------------------------------------------------------------------- #
def _seed_httpbin_collection(session: Session) -> int:
    """Create the 'Httpbin API' collection with an 'Auth' folder + requests.

    URLs use ``{{base_url}}`` / ``{{token}}`` / ``{{username}}`` / ``{{password}}``
    so the seeded requests demonstrate variable resolution against the active
    environment. Returns the number of requests created.
    """
    collection = collection_service.create_collection(
        session,
        CollectionCreate(
            name="Httpbin API",
            description="Echo / inspection requests against httpbin.org.",
        ),
    )

    auth_folder = collection_service.create_folder(
        session,
        collection.id,
        FolderCreate(collection_id=collection.id, name="Auth"),
    )

    requests = [
        # GET with a query param + a custom header, directly under the collection.
        RequestCreate(
            collection_id=collection.id,
            name="Get with query",
            method="GET",
            url="{{base_url}}/get",
            params=[KeyValueDTO(key="foo", value="bar")],
            headers=[KeyValueDTO(key="X-Demo", value="1")],
        ),
        # POST a raw JSON body.
        RequestCreate(
            collection_id=collection.id,
            name="Post JSON",
            method="POST",
            url="{{base_url}}/post",
            body=RequestBodyDTO(
                type="raw",
                raw_lang="json",
                raw='{"hello":"world"}',
            ),
        ),
        # Bearer auth, inside the 'Auth' folder — token comes from the env.
        RequestCreate(
            collection_id=collection.id,
            folder_id=auth_folder.id,
            name="Bearer auth",
            method="GET",
            url="{{base_url}}/bearer",
            auth=RequestAuthDTO(
                type="bearer",
                bearer=RequestBearer(token="{{token}}"),
            ),
        ),
        # Basic auth, inside the 'Auth' folder — credentials come from the env.
        RequestCreate(
            collection_id=collection.id,
            folder_id=auth_folder.id,
            name="Basic auth",
            method="GET",
            url="{{base_url}}/basic-auth/user/passwd",
            auth=RequestAuthDTO(
                type="basic",
                basic=RequestBasic(
                    username="{{username}}",
                    password="{{password}}",
                ),
            ),
        ),
        # x-www-form-urlencoded POST. The wire token is 'x-www-form-urlencoded';
        # the request service translates it to the DB short token 'urlencoded'.
        RequestCreate(
            collection_id=collection.id,
            name="Form post",
            method="POST",
            url="{{base_url}}/post",
            body=RequestBodyDTO(
                type="x-www-form-urlencoded",
                url_encoded=[
                    KeyValueDTO(key="a", value="1"),
                    KeyValueDTO(key="b", value="2"),
                ],
            ),
        ),
    ]

    for req in requests:
        request_service.persist_new_request(session, req.collection_id, req)

    return len(requests)


def _seed_jsonplaceholder_collection(session: Session) -> int:
    """Create the 'JSONPlaceholder' CRUD-demo collection. Returns request count."""
    collection = collection_service.create_collection(
        session,
        CollectionCreate(
            name="JSONPlaceholder",
            description="CRUD demo against jsonplaceholder.typicode.com.",
        ),
    )

    requests = [
        RequestCreate(
            collection_id=collection.id,
            name="List posts",
            method="GET",
            url="{{base_url}}/posts",
        ),
        RequestCreate(
            collection_id=collection.id,
            name="Get post",
            method="GET",
            url="{{base_url}}/posts/1",
        ),
        RequestCreate(
            collection_id=collection.id,
            name="Create post",
            method="POST",
            url="{{base_url}}/posts",
            body=RequestBodyDTO(
                type="raw",
                raw_lang="json",
                raw='{"title":"foo","body":"bar","userId":1}',
            ),
        ),
        RequestCreate(
            collection_id=collection.id,
            name="Update post",
            method="PUT",
            url="{{base_url}}/posts/1",
            body=RequestBodyDTO(
                type="raw",
                raw_lang="json",
                raw='{"id":1,"title":"foo","body":"bar","userId":1}',
            ),
        ),
        RequestCreate(
            collection_id=collection.id,
            name="Delete post",
            method="DELETE",
            url="{{base_url}}/posts/1",
        ),
    ]

    for req in requests:
        request_service.persist_new_request(session, req.collection_id, req)

    return len(requests)


# --------------------------------------------------------------------------- #
# History seeding
# --------------------------------------------------------------------------- #
def _seed_history(session: Session, httpbin_env_id: str) -> int:
    """Create a few demo history entries with resolved (httpbin) snapshots.

    History stores the *resolved* request that was actually sent, so these
    snapshots use concrete https://httpbin.org URLs rather than {{var}} tokens.
    Returns the number of entries created.
    """
    entries = [
        HistoryCreate(
            environment_id=httpbin_env_id,
            snapshot=RequestSpec(method="GET", url="https://httpbin.org/get"),
            status=200,
            ok=True,
            time_ms=120,
            size_bytes=300,
        ),
        HistoryCreate(
            environment_id=httpbin_env_id,
            snapshot=RequestSpec(method="GET", url="https://httpbin.org/status/404"),
            status=404,
            ok=False,
            time_ms=95,
            size_bytes=0,
        ),
        HistoryCreate(
            environment_id=httpbin_env_id,
            snapshot=RequestSpec(
                method="GET",
                url="https://httpbin.org/get?demo=2",
                params=[WireKeyValue(key="demo", value="2")],
                body=BodySpec(type="none"),
                auth=AuthSpec(type="none"),
            ),
            status=200,
            ok=True,
            time_ms=130,
            size_bytes=320,
        ),
    ]

    for entry in entries:
        history_service.create_history(session, entry)

    return len(entries)


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def main() -> None:
    """Seed the database. Idempotent: a no-op once collections exist."""
    init_db()

    with Session(engine) as session:
        # Always ensure the single default workspace exists first.
        _ensure_default_workspace(session)

        # Idempotency guard: if anything has already been seeded (collections
        # are the canonical marker), do nothing.
        from app.models import Collection

        existing = session.exec(select(Collection)).first()
        if existing is not None:
            print("Already seeded")
            return

        env_count = 2
        httpbin_env_id, _jsonplaceholder_env_id = _seed_environments(session)

        httpbin_requests = _seed_httpbin_collection(session)
        jsonplaceholder_requests = _seed_jsonplaceholder_collection(session)
        collection_count = 2
        request_count = httpbin_requests + jsonplaceholder_requests

        history_count = _seed_history(session, httpbin_env_id)

        print(
            "Seed complete: "
            f"{collection_count} collections, "
            f"{request_count} requests, "
            f"{env_count} environments, "
            f"{history_count} history entries."
        )


if __name__ == "__main__":
    main()
