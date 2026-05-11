# Pluto MVP – Complete Setup Guide

## Architecture
```
Browser Extension → API Server → Postgres (pgvector) + Neo4j
```

- Extension captures browser events locally
- Server handles storage, embeddings, and graph operations
- Fallback to local storage if server is unavailable
- All data stored in your infrastructure (privacy-first)

## Prerequisites
- Node.js 16+ and npm
- Docker (recommended for databases) or manual Postgres 14+ and Neo4j 5+ installation

## Quick Start (Docker)

### 1. Start databases using Docker
```bash
# Terminal 1: Start Postgres with pgvector
docker run --name pluto-postgres -e POSTGRES_PASSWORD=pluto -e POSTGRES_USER=pluto -e POSTGRES_DB=pluto -p 5432:5432 pgvector/pgvector:latest

# Terminal 2: Start Neo4j
docker run --name pluto-neo4j -p 7687:7687 -e NEO4J_AUTH=neo4j/password neo4j:latest
```

### 2. Setup backend server
```bash
cd server
cp .env.example .env
npm install
npm run migrate
npm start
```
Server will be running on http://localhost:3000

### 3. Load extension in browser
1. Open Chrome/Edge extensions page: `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the pluto project folder
5. Pin the extension

### 4. Start browsing
- Browse normally for a few minutes
- Open the Pluto popup and search
- Try queries like: `"Redis article from last week"` or `"job search"`

## Manual Database Setup

### Postgres
```bash
# Install Postgres 14+
# Enable pgvector extension
psql -U postgres
CREATE DATABASE pluto;
\c pluto
CREATE EXTENSION vector;
```

Then update `.env`:
```
DATABASE_URL=postgresql://pluto:pluto@localhost:5432/pluto
```

### Neo4j
```bash
# Download and run Neo4j 5+
# Visit http://localhost:7474 for browser
# Default auth: neo4j / password
```

Update `.env`:
```
NEO4J_URI=neo4j://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

## Verify Setup

### Check server health
```bash
curl http://localhost:3000/health
# Expected: {"ok": true}
```

### Check Postgres
```bash
psql -h localhost -U pluto -d pluto -c "SELECT version();"
```

### Check Neo4j
```
curl -u neo4j:password http://localhost:7474/browser
```

## Usage

### Extension popup actions
1. **Recall** – search sessions by natural language
2. **Open Loops** – unfinished workflows
3. **Recent Sessions** – browse past sessions
4. **Resume** – reopen session URLs

### Example queries
- `find redis article`
- `continue job search`
- `debugging session last friday`
- `compare databases`

## Architecture Details

### Event Flow
1. Browser tab updated → extension captures event
2. Event ingested into local storage + backend
3. Session model updated (grouping, labeling, entity extraction)
4. Summary text generated and embedded (local model)
5. Embedding stored in pgvector for similarity search

### Semantic Recall
- Query text embedded using same local model
- pgvector similarity search finds closest sessions
- Results ranked by similarity, recency, and entity overlap

### Graph (Neo4j)
- Entities (people, companies, products) created as nodes
- Relationships (applied_to, connected_with, etc.) tracked
- Available for advanced continuity features in future phases

## Troubleshooting

### Extension not connecting to backend?
- Check server is running on port 3000
- Check browser console for errors
- Extension will use local storage fallback automatically

### Postgres/Neo4j connection errors?
- Verify containers are running: `docker ps`
- Check .env file has correct URLs
- Verify credentials match database setup

### Embeddings slow on first run?
- First-time download is ~50MB
- Model cached locally afterward
- No internet required after initial download

## Next Steps
- Add inspect/delete/export UI for memory management
- Implement knowledge graph queries for advanced continuity
- Add routine detection and behavioral patterns
- Integrate multi-session correlation

## Environment Variables (.env)
```
# Postgres
DATABASE_URL=postgresql://pluto:pluto@localhost:5432/pluto

# Neo4j
NEO4J_URI=neo4j://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Server
PORT=3000
NODE_ENV=development
```
