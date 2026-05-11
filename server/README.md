Pluto Storage Layer Setup

## Services
This folder contains the Pluto backend server for persistent storage and semantic search.

### Included
- Postgres database with pgvector for semantic search
- Neo4j graph database for entity relationships
- Local embeddings using transformers.js (Xenova/all-MiniLM-L6-v2)
- REST API endpoints for events, sessions, recall, and graph operations

## Prerequisites
- Node.js 16+
- Postgres 14+ with pgvector extension
- Neo4j 5+

## Setup

### 1. Install dependencies
\`\`\`bash
cd server
npm install
\`\`\`

### 2. Configure environment
\`\`\`bash
cp .env.example .env
# Edit .env with your database URLs and credentials
\`\`\`

### 3. Run migrations
\`\`\`bash
npm run migrate
\`\`\`

### 4. Start the server
\`\`\`bash
npm start
# or development mode
npm run dev
\`\`\`

Server will listen on http://localhost:3000

## API Endpoints

### Events
- **POST /api/events** – store a new event
- **GET /api/events** – list recent events

### Sessions
- **POST /api/sessions** – create a session
- **PUT /api/sessions/:id** – update session
- **GET /api/sessions** – list recent sessions
- **GET /api/sessions/:id** – get session details

### Semantic Recall
- **POST /api/recall** – search sessions by embedding similarity

### Graph (Neo4j)
- **POST /api/graph/entity** – create entity node
- **POST /api/graph/relationship** – create relationship
- **GET /api/graph/entity/:name** – get entity and relationships

## Extension Integration

The extension (`background.js`) uses `db-client.js` to communicate with the server.
Update `PlutoClient` baseUrl to match your server address if not localhost.

## Storage Schema

### Postgres tables
- **events** – raw browser events with optional embeddings
- **sessions** – grouped sessions with summaries and embeddings
- **settings** – extension settings and config

### Neo4j nodes/relationships
- **Entity** – people, companies, products, technologies
- **Relationships** – applied_to, connected_with, researched, etc.

## Local Embeddings
- Model: Xenova/all-MiniLM-L6-v2 (384-dim)
- Downloaded and cached automatically on first run
- ~50MB disk space
- No API calls or external dependencies

## Architecture Notes
- Extension → API Server → Postgres + Neo4j
- Embeddings computed server-side and stored in pgvector
- No direct database connections from browser extension
- All data stored locally in your infrastructure
