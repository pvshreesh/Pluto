from __future__ import annotations

import os
import sys

from dotenv import load_dotenv
from neo4j import GraphDatabase


load_dotenv()

uri = os.getenv("NEO4J_URI", "neo4j://localhost:7687")
user = os.getenv("NEO4J_USER") or os.getenv("NEO4J_USERNAME") or "neo4j"
password = os.getenv("NEO4J_PASSWORD", "password")
database = os.getenv("NEO4J_DATABASE") or None

print(f"Testing Neo4j connection to {uri} as {user} database {database or '(default)'}")

driver = GraphDatabase.driver(uri, auth=(user, password))
try:
    with driver.session(database=database) as session:
        record = session.run("RETURN 1 AS result").single()
        print(f"Query succeeded, result = {record['result'] if record else 'unknown'}")
    sys.exit(0)
except Exception as error:
    print(f"Neo4j connection test failed: {error}")
    sys.exit(2)
finally:
    driver.close()
