from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main
from store import PlutoStore


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    store_file = tmp_path / "pluto-store-test.json"
    main.store = PlutoStore(pg_conn=None, neo4j_driver=None, neo4j_database=None, file_path=store_file).init()
    return TestClient(main.app)
