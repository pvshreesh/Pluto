from __future__ import annotations

import os
import sys

import psycopg
from dotenv import load_dotenv


load_dotenv()

database_url = os.getenv("DATABASE_URL", "postgresql://localhost/pluto")
print(f"Testing Postgres connection to {database_url}")

try:
    with psycopg.connect(database_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 AS result")
            row = cur.fetchone()
            print(f"Query succeeded, result = {row[0] if row else 'unknown'}")
    sys.exit(0)
except Exception as error:
    print(f"Postgres connection test failed: {error}")
    sys.exit(2)
