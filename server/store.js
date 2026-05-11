const fs = require('fs/promises');
const path = require('path');

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'for', 'in', 'on', 'of', 'at', 'is', 'it', 'that', 'this', 'with', 'as', 'by', 'from', 'be', 'was', 'are', 'how', 'did', 'i', 'you'
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function intersectSize(aTokens, bTokens) {
  const bSet = new Set(bTokens);
  let overlap = 0;
  for (const token of aTokens) {
    if (bSet.has(token)) {
      overlap += 1;
    }
  }
  return overlap;
}

function dedupe(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function normalizeSession(session) {
  return {
    ...session,
    startedAt: session.startedAt instanceof Date ? session.startedAt.toISOString() : session.startedAt,
    endedAt: session.endedAt instanceof Date ? session.endedAt.toISOString() : session.endedAt,
    eventIds: Array.isArray(session.eventIds) ? session.eventIds : [],
    urls: Array.isArray(session.urls) ? session.urls : [],
    entities: Array.isArray(session.entities) ? session.entities : [],
    unresolved: Array.isArray(session.unresolved) ? session.unresolved : []
  };
}

function toSessionRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    startedAt: row.startedAt || row.started_at,
    endedAt: row.endedAt || row.ended_at,
    eventIds: row.eventIds || row.event_ids || [],
    urls: row.urls || [],
    entities: row.entities || [],
    unresolved: row.unresolved || [],
    summary: row.summary || '',
    summaryEmbedding: row.summaryEmbedding || row.summary_embedding || null
  };
}

function scoreSession(queryTokens, session) {
  const content = `${session.label || ''} ${session.summary || ''} ${(session.entities || []).join(' ')} ${(session.unresolved || []).join(' ')}`;
  const contentTokens = tokenize(content);
  const semanticOverlap = intersectSize(queryTokens, contentTokens) / Math.max(queryTokens.length, 1);
  const freshnessDays = (Date.now() - new Date(session.endedAt).getTime()) / (24 * 60 * 60 * 1000);
  const recencyBoost = Math.max(0, 1 - freshnessDays / 14) * 0.25;
  const entityBoost = (session.entities || []).length > 0 ? 0.05 : 0;
  const score = semanticOverlap + recencyBoost + entityBoost;
  const hits = queryTokens.filter((token) => content.toLowerCase().includes(token)).slice(0, 4);
  return {
    ...session,
    score: Number(score.toFixed(3)),
    reason: hits.length ? `Matched on: ${hits.join(', ')}` : 'Matched by recent and related browsing context'
  };
}

class PlutoStore {
  constructor({ pgPool, neo4jDriver, neo4jDatabase, filePath }) {
    this.pgPool = pgPool;
    this.neo4jDriver = neo4jDriver;
    this.neo4jDatabase = neo4jDatabase;
    this.filePath = filePath || path.join(__dirname, 'data', 'pluto-store.json');
    this.mode = 'local';
    this.state = {
      events: [],
      sessions: [],
      settings: {},
      graph: { entities: {}, relationships: [] }
    };
  }

  async init() {
    try {
      await this.pgPool.query('SELECT 1');
      this.mode = 'postgres';
      return this;
    } catch {
      this.mode = 'local';
      await this.loadState();
      return this;
    }
  }

  async loadState() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.state = {
        events: Array.isArray(parsed.events) ? parsed.events : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions.map(normalizeSession) : [],
        settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {},
        graph: parsed.graph && typeof parsed.graph === 'object'
          ? {
              entities: parsed.graph.entities || {},
              relationships: Array.isArray(parsed.graph.relationships) ? parsed.graph.relationships : []
            }
          : { entities: {}, relationships: [] }
      };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      await this.persistState();
    }
  }

  async persistState() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
  }

  async getSettings() {
    return { ...this.state.settings };
  }

  async saveSettings(settings) {
    this.state.settings = { ...(settings || {}) };
    await this.persistState();
    return this.state.settings;
  }

  async exportSnapshot() {
    return {
      mode: this.mode,
      exportedAt: new Date().toISOString(),
      events: await this.getEvents(10000),
      sessions: await this.getSessions(10000),
      settings: await this.getSettings(),
      graph: this.state.graph
    };
  }

  async deleteAllData() {
    this.state = {
      events: [],
      sessions: [],
      settings: {},
      graph: { entities: {}, relationships: [] }
    };
    await this.persistState();
    return { deleted: true };
  }

  async addEvent(event) {
    if (this.mode === 'postgres') {
      const result = await this.pgPool.query(
        `INSERT INTO events (id, type, timestamp, tab_id, url, title, domain, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          event.id,
          event.type,
          new Date(event.timestamp),
          event.tabId || null,
          event.url,
          event.title,
          event.domain,
          JSON.stringify(event.metadata || {}),
          null
        ]
      );

      return result.rows[0];
    }

    this.state.events.push(event);
    this.state.events = this.state.events.slice(-5000);
    await this.persistState();
    return event;
  }

  async getEvents(limit = 100) {
    if (this.mode === 'postgres') {
      const result = await this.pgPool.query(
        `SELECT * FROM events ORDER BY timestamp DESC LIMIT $1`,
        [limit]
      );
      return result.rows;
    }

    return this.state.events
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async addSession(session) {
    if (this.mode === 'postgres') {
      const result = await this.pgPool.query(
        `INSERT INTO sessions (id, label, started_at, ended_at, event_ids, urls, entities, unresolved, summary, summary_embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          session.id,
          session.label,
          new Date(session.startedAt),
          new Date(session.endedAt),
          JSON.stringify(session.eventIds || []),
          JSON.stringify(session.urls || []),
          JSON.stringify(session.entities || []),
          JSON.stringify(session.unresolved || []),
          session.summary,
          null
        ]
      );

      return toSessionRecord({
        ...result.rows[0],
        startedAt: result.rows[0].started_at,
        endedAt: result.rows[0].ended_at,
        eventIds: result.rows[0].event_ids,
        summaryEmbedding: result.rows[0].summary_embedding
      });
    }

    const next = normalizeSession(session);
    this.state.sessions = [...this.state.sessions.filter((item) => item.id !== next.id), next];
    this.state.sessions = this.state.sessions.slice(-500);
    await this.persistState();
    return next;
  }

  async updateSession(id, session) {
    if (this.mode === 'postgres') {
      const result = await this.pgPool.query(
        `UPDATE sessions
         SET label = $1, started_at = $2, ended_at = $3, event_ids = $4, urls = $5, entities = $6, unresolved = $7, summary = $8
         WHERE id = $9
         RETURNING *`,
        [
          session.label,
          new Date(session.startedAt),
          new Date(session.endedAt),
          JSON.stringify(session.eventIds || []),
          JSON.stringify(session.urls || []),
          JSON.stringify(session.entities || []),
          JSON.stringify(session.unresolved || []),
          session.summary,
          id
        ]
      );

      if (result.rows.length === 0) return null;
      return toSessionRecord({
        ...result.rows[0],
        startedAt: result.rows[0].started_at,
        endedAt: result.rows[0].ended_at,
        eventIds: result.rows[0].event_ids,
        summaryEmbedding: result.rows[0].summary_embedding
      });
    }

    const next = normalizeSession({ ...session, id });
    this.state.sessions = this.state.sessions.map((item) => (item.id === id ? next : item));
    await this.persistState();
    return next;
  }

  async getSessions(limit = 100) {
    if (this.mode === 'postgres') {
      const result = await this.pgPool.query(
        `SELECT * FROM sessions ORDER BY ended_at DESC LIMIT $1`,
        [limit]
      );
      return result.rows.map((row) => toSessionRecord(row));
    }

    return this.state.sessions
      .slice()
      .sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime())
      .slice(0, limit)
      .map((session) => ({ ...session }));
  }

  async getSession(id) {
    if (this.mode === 'postgres') {
      const result = await this.pgPool.query(
        `SELECT * FROM sessions WHERE id = $1`,
        [id]
      );

      return result.rows.length ? toSessionRecord(result.rows[0]) : null;
    }

    return this.state.sessions.find((item) => item.id === id) || null;
  }

  async recall({ embedding, query, limit = 5 }) {
    if (this.mode === 'postgres' && Array.isArray(embedding)) {
      const result = await this.pgPool.query(
        `SELECT id, label, summary, started_at, ended_at,
                1 - (summary_embedding <=> $1::vector) as similarity_score
         FROM sessions
         WHERE summary_embedding IS NOT NULL
         ORDER BY summary_embedding <=> $1::vector
         LIMIT $2`,
        [JSON.stringify(embedding), limit]
      );

      return result.rows.map((row) => ({
        id: row.id,
        label: row.label,
        summary: row.summary,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        score: Number.parseFloat(row.similarity_score).toFixed(3)
      }));
    }

    const sessions = await this.getSessions(500);
    const queryTokens = tokenize(query || '');
    if (!queryTokens.length) {
      return sessions.slice(0, limit).map((session) => ({
        ...session,
        score: 0.1,
        reason: 'Recent sessions'
      }));
    }

    return sessions
      .map((session) => scoreSession(queryTokens, session))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async addEntity(name, type, metadata = {}) {
    if (this.neo4jDriver) {
      const session = this.neo4jDriver.session({ database: this.neo4jDatabase });
      try {
        const result = await session.run(
          `CREATE (n:Entity { name: $name, type: $type, metadata: $metadata, created_at: timestamp() })
           RETURN n`,
          { name, type, metadata: JSON.stringify(metadata || {}) }
        );

        return result.records[0]?.get('n').properties;
      } finally {
        await session.close();
      }
    }

    this.state.graph.entities[name] = { name, type, metadata, createdAt: Date.now() };
    await this.persistState();
    return this.state.graph.entities[name];
  }

  async addRelationship(sourceId, targetId, relationshipType) {
    if (this.neo4jDriver) {
      const session = this.neo4jDriver.session({ database: this.neo4jDatabase });
      try {
        const safeType = String(relationshipType || 'RELATED_TO').replace(/[^A-Za-z0-9_]/g, '_') || 'RELATED_TO';
        const result = await session.run(
          `MATCH (a:Entity { name: $sourceId }), (b:Entity { name: $targetId })
           CREATE (a)-[r:${safeType}]->(b)
           RETURN r`,
          { sourceId, targetId }
        );

        return result.records[0]?.get('r').properties;
      } finally {
        await session.close();
      }
    }

    this.state.graph.relationships.push({ sourceId, targetId, relationshipType, createdAt: Date.now() });
    await this.persistState();
    return { sourceId, targetId, relationshipType };
  }

  async getEntity(name) {
    if (this.neo4jDriver) {
      const session = this.neo4jDriver.session({ database: this.neo4jDatabase });
      try {
        const result = await session.run(
          `MATCH (n:Entity { name: $name })-[r]-(m)
           RETURN n, collect({ type: type(r), target: m.name }) as relationships`,
          { name }
        );

        if (result.records.length === 0) {
          return null;
        }

        const record = result.records[0];
        return {
          entity: record.get('n').properties,
          relationships: record.get('relationships')
        };
      } finally {
        await session.close();
      }
    }

    const entity = this.state.graph.entities[name];
    if (!entity) {
      return null;
    }

    const relationships = this.state.graph.relationships
      .filter((item) => item.sourceId === name || item.targetId === name)
      .map((item) => ({ type: item.relationshipType, target: item.sourceId === name ? item.targetId : item.sourceId }));

    return { entity, relationships };
  }
}

module.exports = { PlutoStore };