const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/pluto'
});

const schema = `
-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- Events table
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
);

-- Sessions table
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
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) UNIQUE NOT NULL,
  value JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

const indexes = [
  'CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp DESC)',
  'CREATE INDEX IF NOT EXISTS idx_events_domain ON events (domain)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_ended_at ON sessions (ended_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_label ON sessions (label)',
  'CREATE INDEX IF NOT EXISTS idx_events_embedding ON events USING ivfflat (embedding vector_cosine_ops)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_embedding ON sessions USING ivfflat (summary_embedding vector_cosine_ops)'
];

async function runMigrations() {
  try {
    console.log('Running migrations...');
    
    const statements = schema.split(';').filter(s => s.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        await pool.query(statement);
      }
    }

    for (const statement of indexes) {
      await pool.query(statement);
    }
    
    console.log('✓ Migrations complete');
    await pool.end();
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

runMigrations();
