Pluto Storage Layer (Python)

## Overview
This folder contains the Python migration of the Pluto backend server.

### Included
- FastAPI REST server
- Postgres support (with pgvector-ready schema)
- Neo4j graph support
- Local JSON fallback storage if Postgres is unavailable
- API-compatible endpoints for extension integration

## Prerequisites
- Python 3.10+
- Postgres 14+ with pgvector extension (optional but recommended)
- Neo4j 5+ (optional for graph features)

## Setup

### 1. Install dependencies
```bash
cd server-python
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

Or use Make targets:
```bash
make install
# or include test deps
make install-dev
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env if needed
```

### 3. Run migrations (Postgres mode)
```bash
python migrations.py
# or
make migrate
```

### 4. Start the server
```bash
uvicorn main:app --host 0.0.0.0 --port 3000 --reload
# or
make dev
```

### 5. Run tests
```bash
make test
```

Server listens on `http://localhost:3000`.

## API Endpoints

### Events
- `POST /api/events`
- `GET /api/events`

### Sessions
- `POST /api/sessions`
- `PUT /api/sessions/{id}`
- `GET /api/sessions`
- `GET /api/sessions/{id}`

### Semantic Recall
- `POST /api/recall`

### Graph (Neo4j)
- `POST /api/graph/entity`
- `POST /api/graph/relationship`
- `GET /api/graph/entity/{name}`

### Data Management
- `GET /health`
- `GET /api/export`
- `DELETE /api/data`

## Notes
- Response shape matches the existing Node server (`{ ok, result }` / `{ ok, error }`).
- If Postgres is unavailable at startup, storage mode falls back to local JSON at `server-python/data/pluto-store.json`.
