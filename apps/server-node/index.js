require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const neo4j = require('neo4j-driver');
const { env } = require('process');
const { PlutoStore } = require('./store');

const app = express();
const port = env.PORT || 3000;

// Database clients
const pgPool = new Pool({
  connectionString: env.DATABASE_URL || 'postgresql://localhost/pluto'
});

const neo4jUri = env.NEO4J_URI || 'neo4j://localhost:7687';
const neo4jUser = env.NEO4J_USER || env.NEO4J_USERNAME || 'neo4j';
const neo4jPassword = env.NEO4J_PASSWORD || 'password';
const neo4jDatabase = env.NEO4J_DATABASE || env.NEO4J_DB || undefined;

const neo4jDriver = neo4j.driver(
  neo4jUri,
  neo4j.auth.basic(neo4jUser, neo4jPassword)
);

const store = new PlutoStore({
  pgPool,
  neo4jDriver,
  neo4jDatabase
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, mode: store.mode || 'local' });
});

// Event endpoints
app.post('/api/events', async (req, res) => {
  try {
    const { event } = req.body;
    const result = await store.addEvent(event);

    res.json({ ok: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const result = await store.getEvents(limit);

    res.json({ ok: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Session endpoints
app.post('/api/sessions', async (req, res) => {
  try {
    const { session } = req.body;
    const result = await store.addSession(session);

    res.json({ ok: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.put('/api/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { session } = req.body;
    const result = await store.updateSession(id, session);

    res.json({ ok: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/sessions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const result = await store.getSessions(limit);

    res.json({ ok: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await store.getSession(id);

    if (!result) {
      return res.status(404).json({ ok: false, error: 'Session not found' });
    }

    res.json({ ok: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Semantic recall endpoint (pgvector similarity search)
app.post('/api/recall', async (req, res) => {
  try {
    const { embedding, query = '', limit = 5 } = req.body;
    const result = await store.recall({ embedding, query, limit });

    res.json({ ok: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Graph endpoints (Neo4j)
app.post('/api/graph/entity', async (req, res) => {
  try {
    const { name, type, metadata } = req.body;
    const result = await store.addEntity(name, type, metadata);

    res.json({ ok: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/graph/relationship', async (req, res) => {
  try {
    const { sourceId, targetId, relationshipType } = req.body;
    const result = await store.addRelationship(sourceId, targetId, relationshipType);

    res.json({ ok: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/graph/entity/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const result = await store.getEntity(name);

    if (!result) {
      return res.status(404).json({ ok: false, error: 'Entity not found' });
    }

    res.json({ ok: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/export', async (req, res) => {
  try {
    const result = await store.exportSnapshot();
    res.json({ ok: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.delete('/api/data', async (req, res) => {
  try {
    const result = await store.deleteAllData();
    res.json({ ok: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Start server
(async () => {
  await store.init();
  console.log(`Pluto storage mode: ${store.mode}`);

  app.listen(port, () => {
    console.log(`Pluto server listening on port ${port}`);
  });
})().catch((error) => {
  console.error('Failed to start Pluto server:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await pgPool.end();
  await neo4jDriver.close();
  process.exit(0);
});
