from __future__ import annotations

from datetime import datetime, timezone


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["mode"] == "local"


def test_events_sessions_recall_and_export(client):
    event = {
        "id": "11111111-1111-1111-1111-111111111111",
        "type": "page_viewed",
        "timestamp": _now_ms(),
        "tabId": 1,
        "url": "https://example.com/jobs/frontend",
        "title": "Frontend Engineer Job - JPMC",
        "domain": "example.com",
        "metadata": {},
    }
    session = {
        "id": "22222222-2222-2222-2222-222222222222",
        "label": "Job search session",
        "startedAt": event["timestamp"],
        "endedAt": event["timestamp"],
        "eventIds": [event["id"]],
        "urls": [event["url"]],
        "entities": ["jpmc", "frontend"],
        "unresolved": ["apply"],
        "summary": "Applied to JPMC frontend role and followed up.",
    }

    add_event = client.post("/api/events", json={"event": event})
    assert add_event.status_code == 200
    assert add_event.json()["ok"] is True

    add_session = client.post("/api/sessions", json={"session": session})
    assert add_session.status_code == 200
    assert add_session.json()["ok"] is True

    sessions = client.get("/api/sessions?limit=10")
    assert sessions.status_code == 200
    session_items = sessions.json()["result"]
    assert len(session_items) == 1
    assert session_items[0]["id"] == session["id"]

    recall = client.post("/api/recall", json={"query": "jpmc frontend apply", "limit": 5})
    assert recall.status_code == 200
    recall_items = recall.json()["result"]
    assert len(recall_items) >= 1
    assert recall_items[0]["id"] == session["id"]
    assert recall_items[0]["score"] > 0

    export_data = client.get("/api/export")
    assert export_data.status_code == 200
    export_result = export_data.json()["result"]
    assert export_result["mode"] == "local"
    assert len(export_result["events"]) == 1
    assert len(export_result["sessions"]) == 1


def test_update_get_and_delete_data(client):
    base = _now_ms()
    session_id = "33333333-3333-3333-3333-333333333333"
    created = {
        "id": session_id,
        "label": "Initial",
        "startedAt": base,
        "endedAt": base,
        "eventIds": [],
        "urls": ["https://example.com"],
        "entities": ["example"],
        "unresolved": [],
        "summary": "Initial summary",
    }
    client.post("/api/sessions", json={"session": created})

    updated = {
        **created,
        "label": "Updated Label",
        "summary": "Updated summary",
        "unresolved": ["follow up"],
    }

    update_res = client.put(f"/api/sessions/{session_id}", json={"session": updated})
    assert update_res.status_code == 200
    assert update_res.json()["result"]["label"] == "Updated Label"

    get_res = client.get(f"/api/sessions/{session_id}")
    assert get_res.status_code == 200
    assert get_res.json()["result"]["summary"] == "Updated summary"

    delete_res = client.delete("/api/data")
    assert delete_res.status_code == 200
    assert delete_res.json()["result"]["deleted"] is True

    sessions_after = client.get("/api/sessions")
    assert sessions_after.status_code == 200
    assert sessions_after.json()["result"] == []
