PYTHON ?= python3
VENV_DIR ?= .venv
VENV_BIN := $(VENV_DIR)/bin
UVICORN := $(VENV_BIN)/uvicorn
PIP := $(VENV_BIN)/pip

.PHONY: help venv install install-dev dev run migrate test test-postgres test-neo4j clean

help:
	@echo "Available targets:"
	@echo "  make venv           Create virtual environment"
	@echo "  make install        Install package into venv (editable)"
	@echo "  make dev            Run FastAPI with reload on :3000"
	@echo "  make run            Run FastAPI without reload on :3000"
	@echo "  make migrate        Run Postgres migrations"
	@echo "  make test           Run pytest test suite"
	@echo "  make test-postgres  Run Postgres connectivity check"
	@echo "  make test-neo4j     Run Neo4j connectivity check"
	@echo "  make clean          Remove venv and Python cache artifacts"

venv:
	$(PYTHON) -m venv $(VENV_DIR)

install: venv
	$(PIP) install -e .

install-dev: venv
	$(PIP) install -e ".[dev]"

dev: install
	$(UVICORN) main:app --host 0.0.0.0 --port 3000 --reload

run: install
	$(UVICORN) main:app --host 0.0.0.0 --port 3000

migrate: install
	$(PYTHON) migrations.py

test: install-dev
	$(VENV_BIN)/pytest -q tests

test-postgres: install
	$(PYTHON) postgres_test.py

test-neo4j: install
	$(PYTHON) neo4j_test.py

clean:
	rm -rf $(VENV_DIR)
	find . -type d -name "__pycache__" -prune -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
