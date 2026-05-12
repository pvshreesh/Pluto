from __future__ import annotations

import os
from typing import Any

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from neo4j import GraphDatabase
from pydantic import BaseModel, Field
from psycopg.rows import dict_row

from store import PlutoStore


load_dotenv()

PORT = int(os.getenv("PORT", "3000"))
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost/pluto")
NEO4J_URI = os.getenv("NEO4J_URI", "neo4j://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER") or os.getenv("NEO4J_USERNAME") or "neo4j"
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")
NEO4J_DATABASE = os.getenv("NEO4J_DATABASE") or os.getenv("NEO4J_DB")


class EventPayload(BaseModel):
    event: dict[str, Any]


class SessionPayload(BaseModel):
    session: dict[str, Any]


class RecallPayload(BaseModel):
    embedding: list[float] | None = None
    query: str = ""
    limit: int = 5


class EntityPayload(BaseModel):
    name: str
    type: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class RelationshipPayload(BaseModel):
    sourceId: str
    targetId: str
    relationshipType: str


def _create_pg_connection() -> Any | None:
    try:
        return psycopg.connect(DATABASE_URL, row_factory=dict_row, autocommit=True)
    except Exception:
        return None


def _create_neo4j_driver() -> Any | None:
    if not NEO4J_URI:
        return None
    try:
        return GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    except Exception:
        return None


pg_conn = _create_pg_connection()
neo4j_driver = _create_neo4j_driver()
store = PlutoStore(pg_conn=pg_conn, neo4j_driver=neo4j_driver, neo4j_database=NEO4J_DATABASE).init()

app = FastAPI(title="Pluto Server (Python)", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    store.init()
    print(f"Pluto storage mode: {store.mode}")


@app.on_event("shutdown")
def on_shutdown() -> None:
    if pg_conn is not None:
        pg_conn.close()
    if neo4j_driver is not None:
        neo4j_driver.close()


def ok(result: Any) -> dict[str, Any]:
    return {"ok": True, "result": result}


def fail(error: Exception | str, status_code: int = 500) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"ok": False, "error": str(error)})


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "mode": store.mode or "local"}


@app.post("/api/events")
def add_event(payload: EventPayload) -> Any:
    try:
        result = store.add_event(payload.event)
        return ok(result)
    except Exception as error:
        return fail(error)


@app.get("/api/events")
def get_events(limit: int = Query(default=100, ge=1, le=10000)) -> Any:
    try:
        result = store.get_events(limit)
        return ok(result)
    except Exception as error:
        return fail(error)


@app.post("/api/sessions")
def add_session(payload: SessionPayload) -> Any:
    try:
        result = store.add_session(payload.session)
        return ok(result)
    except Exception as error:
        return fail(error)


@app.put("/api/sessions/{session_id}")
def update_session(session_id: str, payload: SessionPayload) -> Any:
    try:
        result = store.update_session(session_id, payload.session)
        return ok(result)
    except Exception as error:
        return fail(error)


@app.get("/api/sessions")
def get_sessions(limit: int = Query(default=100, ge=1, le=10000)) -> Any:
    try:
        result = store.get_sessions(limit)
        return ok(result)
    except Exception as error:
        return fail(error)


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str) -> Any:
    try:
        result = store.get_session(session_id)
        if not result:
            return fail("Session not found", status_code=404)
        return ok(result)
    except Exception as error:
        return fail(error)


@app.post("/api/recall")
def recall(payload: RecallPayload) -> Any:
    try:
        result = store.recall(payload.embedding, payload.query, payload.limit)
        return ok(result)
    except Exception as error:
        return fail(error)


@app.post("/api/graph/entity")
def add_entity(payload: EntityPayload) -> Any:
    try:
        result = store.add_entity(payload.name, payload.type, payload.metadata)
        return ok(result)
    except Exception as error:
        return fail(error)


@app.post("/api/graph/relationship")
def add_relationship(payload: RelationshipPayload) -> Any:
    try:
        result = store.add_relationship(payload.sourceId, payload.targetId, payload.relationshipType)
        return ok(result)
    except Exception as error:
        return fail(error)


@app.get("/api/graph/entity/{name}")
def get_entity(name: str) -> Any:
    try:
        result = store.get_entity(name)
        if not result:
            return fail("Entity not found", status_code=404)
        return ok(result)
    except Exception as error:
        return fail(error)


@app.get("/api/export")
def export_data() -> Any:
    try:
        result = store.export_snapshot()
        return ok(result)
    except Exception as error:
        return fail(error)


@app.delete("/api/data")
def delete_all_data() -> Any:
    try:
        result = store.delete_all_data()
        return ok(result)
    except Exception as error:
        return fail(error)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
