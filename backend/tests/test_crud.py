"""End-to-end CRUD + history API tests via the FastAPI TestClient."""
from __future__ import annotations


def test_collection_crud(client):
    # Create
    col = client.post("/api/collections", json={"name": "C1"}).json()
    assert col["name"] == "C1"
    # List
    lst = client.get("/api/collections").json()
    assert lst["total"] >= 1
    # Rename
    upd = client.patch(f"/api/collections/{col['id']}", json={"name": "C1b"}).json()
    assert upd["name"] == "C1b"
    # Delete
    assert client.delete(f"/api/collections/{col['id']}").status_code == 204
    assert client.get(f"/api/collections/{col['id']}").status_code == 404


def test_folder_cycle_rejected(client):
    col = client.post("/api/collections", json={"name": "C"}).json()
    f = client.post(f"/api/collections/{col['id']}/folders", json={"collectionId": col["id"], "name": "F"}).json()
    resp = client.patch(f"/api/folders/{f['id']}", json={"parentFolderId": f["id"]})
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CONFLICT"


def test_request_save_and_body_token_roundtrip(client):
    col = client.post("/api/collections", json={"name": "C"}).json()
    payload = {
        "collectionId": col["id"],
        "name": "R",
        "method": "POST",
        "url": "https://x/y",
        "params": [{"key": "a", "value": "1", "enabled": True}],
        "headers": [],
        "auth": {"type": "bearer", "bearer": {"token": "tk"}},
        "body": {"type": "x-www-form-urlencoded", "raw": "", "rawLang": "json", "formData": [], "urlEncoded": [{"key": "u", "value": "v", "enabled": True}]},
    }
    sr = client.post(f"/api/collections/{col['id']}/requests", json=payload).json()
    assert sr["body"]["type"] == "x-www-form-urlencoded"
    assert len(sr["body"]["urlEncoded"]) == 1
    assert sr["auth"]["bearer"]["token"] == "tk"
    # Reload
    got = client.get(f"/api/requests/{sr['id']}").json()
    assert got["params"][0]["key"] == "a"


def test_disabled_form_rows_preserved(client):
    # Regression: a disabled form row must survive a read->save round-trip
    # (not silently dropped), exactly like params/headers.
    col = client.post("/api/collections", json={"name": "C"}).json()
    payload = {
        "collectionId": col["id"],
        "name": "R",
        "method": "POST",
        "url": "https://x/y",
        "params": [],
        "headers": [],
        "auth": {"type": "none"},
        "body": {
            "type": "x-www-form-urlencoded",
            "raw": "",
            "rawLang": "json",
            "formData": [],
            "urlEncoded": [
                {"key": "on", "value": "1", "enabled": True},
                {"key": "off", "value": "2", "enabled": False},
            ],
        },
    }
    sr = client.post(f"/api/collections/{col['id']}/requests", json=payload).json()
    rows = sr["body"]["urlEncoded"]
    assert len(rows) == 2, rows
    assert any(r["key"] == "off" and r["enabled"] is False for r in rows)
    # Reload preserves it too.
    got = client.get(f"/api/requests/{sr['id']}").json()
    assert len(got["body"]["urlEncoded"]) == 2


def test_environment_activate_and_replace(client):
    e1 = client.post("/api/environments", json={"name": "E1", "variables": [{"key": "base_url", "value": "u", "enabled": True}]}).json()
    assert e1["variables"][0]["key"] == "base_url"
    # Activate
    client.patch(f"/api/environments/{e1['id']}", json={"isActive": True})
    envs = client.get("/api/environments").json()
    assert any(e["id"] == e1["id"] and e["isActive"] for e in envs["items"])
    # PUT replace
    rep = client.put(f"/api/environments/{e1['id']}", json={"name": "E1b", "variables": []}).json()
    assert rep["name"] == "E1b" and len(rep["variables"]) == 0


def test_history_record_via_run_is_listed(client, monkeypatch):
    # Mock the runner so no real network is hit, but history still records.
    from app.services import runner_service
    from app.schemas.run import RunResult, RunResponse

    async def fake_execute(*args, **kwargs):
        return RunResult(ok=True, response=RunResponse(status=200, reason="OK", ok=True, headers=[], size_bytes=2, body="hi"), timing_ms=5, size_bytes=2)

    monkeypatch.setattr(runner_service, "execute", fake_execute)
    res = client.post("/api/run", json={"request": {"method": "GET", "url": "https://x/y", "params": [], "headers": [], "body": {"type": "none"}, "auth": {"type": "none"}}}).json()
    assert res["ok"] and res["historyId"]
    hist = client.get("/api/history").json()
    assert hist["total"] >= 1
    assert hist["items"][0]["url"] == "https://x/y"
