# Pluto Server (Python)

FastAPI backend for Pluto, maintained as a separate app in the monorepo.

## Features

- FastAPI REST server
- Postgres support (pgvector-ready)
- Neo4j graph support
- Local JSON fallback storage

## Prerequisites

- Python 3.10+
- Postgres 14+ (optional but recommended)
- Neo4j 5+ (optional for graph features)

## Setup

```bash
cd apps/server-python
cp .env.example .env
make install
```

Run in dev mode:

```bash
make dev
```

Run tests:

```bash
make test
```

## Commands

- `make dev` - run FastAPI with reload
- `make run` - run FastAPI without reload
- `make migrate` - run Postgres migrations
- `make test` - run pytest suite (`tests/`)
- `make test-postgres` - check Postgres connectivity
- `make test-neo4j` - check Neo4j connectivity
