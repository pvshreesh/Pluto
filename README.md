# Pluto: A Calm Browser Memory and Continuity Layer

This is the MVP implementation of Pluto, a browser extension that preserves context across your web activity.

## What's Included

### Extension (Browser-side)
- Event capture (page views, tab switches, searches)
- Session understanding (auto-grouping, labeling, summarization)
- Continuity and resumption (resume prior sessions)
- Open-loop detection (unfinished workflows)
- Local fallback (works without backend)

### Backend Server
- Postgres with pgvector for semantic search
- Neo4j for entity relationship graphs
- Local embeddings (Xenova/all-MiniLM-L6-v2, 384-dim)
- REST API for persistence and recall

## Quick Start

**See [SETUP.md](SETUP.md) for complete installation instructions.**

### TL;DR (Docker)
```bash
# Terminal 1: Postgres
docker run --name pluto-postgres -e POSTGRES_PASSWORD=pluto -e POSTGRES_USER=pluto -e POSTGRES_DB=pluto -p 5432:5432 pgvector/pgvector:latest

# Terminal 2: Neo4j
docker run --name pluto-neo4j -p 7687:7687 -e NEO4J_AUTH=neo4j/password neo4j:latest

# Terminal 3: Backend server
cd server && npm install && npm run migrate && npm start

# Terminal 4: Load extension in Chrome
# chrome://extensions → Developer mode → Load unpacked → select /pluto folder
```

## Example Usage

1. Browse normally for a few minutes
2. Open the Pluto popup
3. Search: `"find the Redis article I used"`
4. Click "Resume" on a session to reopen its pages
5. See "Open Loops" for unfinished work

## Architecture

```
Browser Extension
    ↓ (events)
Backend API Server (Node.js)
    ├→ Postgres + pgvector (events, sessions, embeddings)
    ├→ Neo4j (entities, relationships)
    └→ Local embeddings (transformers.js)
```

## Features

- **Session Understanding**: Auto-groups browsing into workflows
- **Semantic Recall**: Search sessions by meaning, not keywords
- **Continuity**: Resume unfinished sessions with one click
- **Open-Loop Detection**: Identifies incomplete tasks
- **Privacy-First**: Local storage, no external APIs, sensitive domains excluded by default
- **Calm by Design**: No notifications, no automation, just memory

## Files

- `manifest.json` – extension permissions
- `background.js` – event capture, sessionization, recall
- `db-client.js` – backend API client
- `popup/` – extension UI
- `server/` – Node.js backend with Postgres + Neo4j
- `plan.md` – MVP execution plan
- `SETUP.md` – detailed setup guide

## Next Steps

- Implement inspect/delete/export memory UI
- Enhance session labeling with AI
- Add knowledge graph querying for advanced continuity
- Detect behavioral patterns (routines)
- Multi-session correlation

## Philosophy

> "Silent but present."

Pluto is not an AI browser or automation tool. It's a memory system that helps you stay contextually aware across time. The goal is to strengthen continuity of thought, not replace human agency.
