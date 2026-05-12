from __future__ import annotations

import os
import sys

import psycopg
from dotenv import load_dotenv


load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost/pluto")

SCHEMA_STATEMENTS = [
    "CREATE EXTENSION IF NOT EXISTS vector",
    """
    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      tab_id INTEGER,
      url TEXT NOT NULL,
      title TEXT,
      domain VARCHAR(255),
      metadata JSONB,
      embedding vector(384),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY,
      label VARCHAR(255) NOT NULL,
      started_at TIMESTAMP NOT NULL,
      ended_at TIMESTAMP NOT NULL,
      event_ids JSONB,
      urls JSONB,
      entities JSONB,
      unresolved JSONB,
      summary TEXT,
      summary_embedding vector(384),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      key VARCHAR(255) UNIQUE NOT NULL,
      value JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
]

INDEX_STATEMENTS = [
    "CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp DESC)",
    "CREATE INDEX IF NOT EXISTS idx_events_domain ON events (domain)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_ended_at ON sessions (ended_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_label ON sessions (label)",
    "CREATE INDEX IF NOT EXISTS idx_events_embedding ON events USING ivfflat (embedding vector_cosine_ops)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_embedding ON sessions USING ivfflat (summary_embedding vector_cosine_ops)",
]


def run_migrations() -> int:
    print("Running migrations...")
    try:
        with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
            with conn.cursor() as cur:
                for statement in SCHEMA_STATEMENTS:
                    cur.execute(statement)

                for statement in INDEX_STATEMENTS:
                    cur.execute(statement)

        print("✓ Migrations complete")
        return 0
    except Exception as error:
        print(f"Migration error: {error}")
        return 1


if __name__ == "__main__":
    sys.exit(run_migrations())
