from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


STOP_WORDS = {
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "for",
    "in",
    "on",
    "of",
    "at",
    "is",
    "it",
    "that",
    "this",
    "with",
    "as",
    "by",
    "from",
    "be",
    "was",
    "are",
    "how",
    "did",
    "i",
    "you",
}


def tokenize(text: str) -> list[str]:
    parts = re.split(r"[^a-z0-9]+", (text or "").lower())
    return [part.strip() for part in parts if len(part.strip()) > 1 and part.strip() not in STOP_WORDS]


def intersect_size(a_tokens: list[str], b_tokens: list[str]) -> int:
    b_set = set(b_tokens)
    return sum(1 for token in a_tokens if token in b_set)


def dedupe(items: list[Any] | None) -> list[Any]:
    seen = set()
    out: list[Any] = []
    for item in items or []:
        if not item:
            continue
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def _iso_or_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _safe_json_array(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


def _to_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, (int, float)):
        ts = value / 1000.0 if value > 10_000_000_000 else float(value)
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    elif isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = datetime.now(timezone.utc)

    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def normalize_session(session: dict[str, Any]) -> dict[str, Any]:
    return {
        **session,
        "startedAt": _iso_or_value(session.get("startedAt")),
        "endedAt": _iso_or_value(session.get("endedAt")),
        "eventIds": _safe_json_array(session.get("eventIds")),
        "urls": _safe_json_array(session.get("urls")),
        "entities": _safe_json_array(session.get("entities")),
        "unresolved": _safe_json_array(session.get("unresolved")),
    }


def to_session_record(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None

    return {
        "id": row.get("id"),
        "label": row.get("label"),
        "startedAt": row.get("startedAt") or row.get("started_at"),
        "endedAt": row.get("endedAt") or row.get("ended_at"),
        "eventIds": _safe_json_array(row.get("eventIds") or row.get("event_ids")),
        "urls": _safe_json_array(row.get("urls")),
        "entities": _safe_json_array(row.get("entities")),
        "unresolved": _safe_json_array(row.get("unresolved")),
        "summary": row.get("summary") or "",
        "summaryEmbedding": row.get("summaryEmbedding") or row.get("summary_embedding"),
    }


def score_session(query_tokens: list[str], session: dict[str, Any]) -> dict[str, Any]:
    content = (
        f"{session.get('label', '')} {session.get('summary', '')} "
        f"{' '.join(session.get('entities') or [])} {' '.join(session.get('unresolved') or [])}"
    )
    content_tokens = tokenize(content)
    semantic_overlap = intersect_size(query_tokens, content_tokens) / max(len(query_tokens), 1)

    ended_at = session.get("endedAt")
    ended_dt = _to_datetime(ended_at)
    freshness_days = (datetime.now(timezone.utc).replace(tzinfo=None) - ended_dt).total_seconds() / 86400
    recency_boost = max(0.0, 1.0 - (freshness_days / 14.0)) * 0.25
    entity_boost = 0.05 if (session.get("entities") or []) else 0.0
    score = semantic_overlap + recency_boost + entity_boost

    lower_content = content.lower()
    hits = [token for token in query_tokens if token in lower_content][:4]
    reason = (
        f"Matched on: {', '.join(hits)}"
        if hits
        else "Matched by recent and related browsing context"
    )

    return {**session, "score": round(score, 3), "reason": reason}


@dataclass
class PlutoStore:
    pg_conn: Any | None = None
    neo4j_driver: Any | None = None
    neo4j_database: str | None = None
    file_path: Path = Path(__file__).parent / "data" / "pluto-store.json"
    mode: str = "local"
    state: dict[str, Any] = field(
        default_factory=lambda: {
            "events": [],
            "sessions": [],
            "settings": {},
            "graph": {"entities": {}, "relationships": []},
        }
    )

    def init(self) -> "PlutoStore":
        if self.pg_conn is not None:
            try:
                with self.pg_conn.cursor() as cur:
                    cur.execute("SELECT 1")
                self.mode = "postgres"
                return self
            except Exception:
                self.mode = "local"

        self.load_state()
        return self

    def load_state(self) -> None:
        try:
            parsed = json.loads(self.file_path.read_text(encoding="utf-8"))
            self.state = {
                "events": parsed.get("events") if isinstance(parsed.get("events"), list) else [],
                "sessions": [
                    normalize_session(item)
                    for item in (parsed.get("sessions") if isinstance(parsed.get("sessions"), list) else [])
                ],
                "settings": parsed.get("settings") if isinstance(parsed.get("settings"), dict) else {},
                "graph": parsed.get("graph")
                if isinstance(parsed.get("graph"), dict)
                else {"entities": {}, "relationships": []},
            }
            self.state["graph"]["entities"] = self.state["graph"].get("entities") or {}
            self.state["graph"]["relationships"] = self.state["graph"].get("relationships") or []
        except FileNotFoundError:
            self.persist_state()
        except json.JSONDecodeError:
            self.persist_state()

    def persist_state(self) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        self.file_path.write_text(json.dumps(self.state, indent=2), encoding="utf-8")

    def get_settings(self) -> dict[str, Any]:
        return {**(self.state.get("settings") or {})}

    def save_settings(self, settings: dict[str, Any] | None) -> dict[str, Any]:
        self.state["settings"] = {**(settings or {})}
        self.persist_state()
        return self.state["settings"]

    def export_snapshot(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "exportedAt": datetime.now(timezone.utc).isoformat(),
            "events": self.get_events(10000),
            "sessions": self.get_sessions(10000),
            "settings": self.get_settings(),
            "graph": self.state.get("graph"),
        }

    def delete_all_data(self) -> dict[str, bool]:
        if self.mode == "postgres" and self.pg_conn is not None:
            with self.pg_conn.cursor() as cur:
                cur.execute("DELETE FROM events")
                cur.execute("DELETE FROM sessions")
                cur.execute("DELETE FROM settings")

        if self.neo4j_driver is not None:
            with self.neo4j_driver.session(database=self.neo4j_database) as session:
                session.run("MATCH (n) DETACH DELETE n")

        self.state = {
            "events": [],
            "sessions": [],
            "settings": {},
            "graph": {"entities": {}, "relationships": []},
        }
        self.persist_state()
        return {"deleted": True}

    def add_event(self, event: dict[str, Any]) -> dict[str, Any]:
        if self.mode == "postgres" and self.pg_conn is not None:
            with self.pg_conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO events (id, type, timestamp, tab_id, url, title, domain, metadata, embedding)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                    RETURNING *
                    """,
                    (
                        event.get("id"),
                        event.get("type"),
                        _to_datetime(event.get("timestamp")),
                        event.get("tabId"),
                        event.get("url"),
                        event.get("title"),
                        event.get("domain"),
                        json.dumps(event.get("metadata") or {}),
                        None,
                    ),
                )
                row = cur.fetchone()
            return row or event

        self.state["events"].append(event)
        self.state["events"] = self.state["events"][-5000:]
        self.persist_state()
        return event

    def get_events(self, limit: int = 100) -> list[dict[str, Any]]:
        if self.mode == "postgres" and self.pg_conn is not None:
            with self.pg_conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM events ORDER BY timestamp DESC LIMIT %s",
                    (limit,),
                )
                rows = cur.fetchall()
            return rows

        events = list(self.state.get("events") or [])
        events.sort(key=lambda item: _to_datetime(item.get("timestamp")), reverse=True)
        return events[:limit]

    def add_session(self, session: dict[str, Any]) -> dict[str, Any]:
        if self.mode == "postgres" and self.pg_conn is not None:
            with self.pg_conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO sessions (
                      id, label, started_at, ended_at, event_ids, urls, entities, unresolved, summary, summary_embedding
                    )
                    VALUES (%s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s)
                    RETURNING *
                    """,
                    (
                        session.get("id"),
                        session.get("label"),
                        _to_datetime(session.get("startedAt")),
                        _to_datetime(session.get("endedAt")),
                        json.dumps(session.get("eventIds") or []),
                        json.dumps(session.get("urls") or []),
                        json.dumps(session.get("entities") or []),
                        json.dumps(session.get("unresolved") or []),
                        session.get("summary"),
                        None,
                    ),
                )
                row = cur.fetchone()

            return to_session_record(row) or normalize_session(session)

        next_session = normalize_session(session)
        sessions = [item for item in self.state.get("sessions") or [] if item.get("id") != next_session.get("id")]
        sessions.append(next_session)
        self.state["sessions"] = sessions[-500:]
        self.persist_state()
        return next_session

    def update_session(self, session_id: str, session: dict[str, Any]) -> dict[str, Any] | None:
        if self.mode == "postgres" and self.pg_conn is not None:
            with self.pg_conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE sessions
                    SET label = %s,
                        started_at = %s,
                        ended_at = %s,
                        event_ids = %s::jsonb,
                        urls = %s::jsonb,
                        entities = %s::jsonb,
                        unresolved = %s::jsonb,
                        summary = %s
                    WHERE id = %s
                    RETURNING *
                    """,
                    (
                        session.get("label"),
                        _to_datetime(session.get("startedAt")),
                        _to_datetime(session.get("endedAt")),
                        json.dumps(session.get("eventIds") or []),
                        json.dumps(session.get("urls") or []),
                        json.dumps(session.get("entities") or []),
                        json.dumps(session.get("unresolved") or []),
                        session.get("summary"),
                        session_id,
                    ),
                )
                row = cur.fetchone()
            return to_session_record(row) if row else None

        next_session = normalize_session({**session, "id": session_id})
        current = self.state.get("sessions") or []
        self.state["sessions"] = [next_session if item.get("id") == session_id else item for item in current]
        self.persist_state()
        return next_session

    def get_sessions(self, limit: int = 100) -> list[dict[str, Any]]:
        if self.mode == "postgres" and self.pg_conn is not None:
            with self.pg_conn.cursor() as cur:
                cur.execute("SELECT * FROM sessions ORDER BY ended_at DESC LIMIT %s", (limit,))
                rows = cur.fetchall()
            return [to_session_record(row) for row in rows]

        sessions = list(self.state.get("sessions") or [])
        sessions.sort(key=lambda item: _to_datetime(item.get("endedAt")), reverse=True)
        return [{**item} for item in sessions[:limit]]

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        if self.mode == "postgres" and self.pg_conn is not None:
            with self.pg_conn.cursor() as cur:
                cur.execute("SELECT * FROM sessions WHERE id = %s", (session_id,))
                row = cur.fetchone()
            return to_session_record(row) if row else None

        for item in self.state.get("sessions") or []:
            if item.get("id") == session_id:
                return item
        return None

    def recall(self, embedding: list[float] | None, query: str, limit: int = 5) -> list[dict[str, Any]]:
        if self.mode == "postgres" and self.pg_conn is not None and isinstance(embedding, list):
            vector_literal = "[" + ",".join(str(float(value)) for value in embedding) + "]"
            with self.pg_conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, label, summary, started_at, ended_at,
                           1 - (summary_embedding <=> %s::vector) as similarity_score
                    FROM sessions
                    WHERE summary_embedding IS NOT NULL
                    ORDER BY summary_embedding <=> %s::vector
                    LIMIT %s
                    """,
                    (vector_literal, vector_literal, limit),
                )
                rows = cur.fetchall()

            out = []
            for row in rows:
                out.append(
                    {
                        "id": row.get("id"),
                        "label": row.get("label"),
                        "summary": row.get("summary"),
                        "startedAt": row.get("started_at"),
                        "endedAt": row.get("ended_at"),
                        "score": round(float(row.get("similarity_score") or 0.0), 3),
                    }
                )
            return out

        sessions = self.get_sessions(500)
        query_tokens = tokenize(query or "")
        if not query_tokens:
            return [{**session, "score": 0.1, "reason": "Recent sessions"} for session in sessions[:limit]]

        scored = [score_session(session=session, query_tokens=query_tokens) for session in sessions]
        scored = [item for item in scored if item.get("score", 0) > 0]
        scored.sort(key=lambda item: item.get("score", 0), reverse=True)
        return scored[:limit]

    def add_entity(self, name: str, entity_type: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        metadata = metadata or {}

        if self.neo4j_driver is not None:
            with self.neo4j_driver.session(database=self.neo4j_database) as session:
                result = session.run(
                    """
                    CREATE (n:Entity { name: $name, type: $type, metadata: $metadata, created_at: timestamp() })
                    RETURN n
                    """,
                    name=name,
                    type=entity_type,
                    metadata=json.dumps(metadata),
                )
                record = result.single()
                node = record["n"] if record is not None else None
                return dict(node) if node is not None else {}

        self.state["graph"]["entities"][name] = {
            "name": name,
            "type": entity_type,
            "metadata": metadata,
            "createdAt": int(datetime.now(timezone.utc).timestamp() * 1000),
        }
        self.persist_state()
        return self.state["graph"]["entities"][name]

    def add_relationship(self, source_id: str, target_id: str, relationship_type: str) -> dict[str, Any]:
        if self.neo4j_driver is not None:
            safe_type = re.sub(r"[^A-Za-z0-9_]", "_", relationship_type or "RELATED_TO") or "RELATED_TO"
            query = (
                "MATCH (a:Entity { name: $sourceId }), (b:Entity { name: $targetId }) "
                f"CREATE (a)-[r:{safe_type}]->(b) RETURN r"
            )
            with self.neo4j_driver.session(database=self.neo4j_database) as session:
                result = session.run(query, sourceId=source_id, targetId=target_id)
                record = result.single()
                relation = record["r"] if record is not None else None
                return dict(relation) if relation is not None else {}

        entry = {
            "sourceId": source_id,
            "targetId": target_id,
            "relationshipType": relationship_type,
            "createdAt": int(datetime.now(timezone.utc).timestamp() * 1000),
        }
        self.state["graph"]["relationships"].append(entry)
        self.persist_state()
        return {"sourceId": source_id, "targetId": target_id, "relationshipType": relationship_type}

    def get_entity(self, name: str) -> dict[str, Any] | None:
        if self.neo4j_driver is not None:
            with self.neo4j_driver.session(database=self.neo4j_database) as session:
                result = session.run(
                    """
                    MATCH (n:Entity { name: $name })-[r]-(m)
                    RETURN n, collect({ type: type(r), target: m.name }) as relationships
                    """,
                    name=name,
                )
                record = result.single()
                if record is None:
                    return None

                return {
                    "entity": dict(record["n"]),
                    "relationships": list(record["relationships"]),
                }

        entity = self.state["graph"]["entities"].get(name)
        if not entity:
            return None

        relationships = [
            {
                "type": item.get("relationshipType"),
                "target": item.get("targetId") if item.get("sourceId") == name else item.get("sourceId"),
            }
            for item in self.state["graph"]["relationships"]
            if item.get("sourceId") == name or item.get("targetId") == name
        ]
        return {"entity": entity, "relationships": relationships}
