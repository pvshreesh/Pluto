/**
 * Database client for communicating with Pluto backend server.
 * Handles events, sessions, and semantic recall via REST API.
 */

class PlutoClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.timeout = 5000;
  }

  async request(method, path, body = null) {
    const url = `${this.baseUrl}${path}`;
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: this.timeout
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Request failed');
      }

      return data.result;
    } catch (error) {
      console.error(`PlutoClient error [${method} ${path}]:`, error);
      throw error;
    }
  }

  // Events
  async addEvent(event) {
    return this.request('POST', '/api/events', { event });
  }

  async getEvents(limit = 100) {
    return this.request('GET', `/api/events?limit=${limit}`);
  }

  // Sessions
  async addSession(session) {
    return this.request('POST', '/api/sessions', { session });
  }

  async updateSession(id, session) {
    return this.request('PUT', `/api/sessions/${id}`, { session });
  }

  async getSessions(limit = 100) {
    return this.request('GET', `/api/sessions?limit=${limit}`);
  }

  async getSession(id) {
    return this.request('GET', `/api/sessions/${id}`);
  }

  async exportData() {
    return this.request('GET', '/api/export');
  }

  async deleteAllData() {
    return this.request('DELETE', '/api/data');
  }

  // Semantic recall
  async recall(embedding, limit = 5) {
    return this.request('POST', '/api/recall', { embedding, limit });
  }

  // Graph (Neo4j)
  async addEntity(name, type, metadata = {}) {
    return this.request('POST', '/api/graph/entity', { name, type, metadata });
  }

  async addRelationship(sourceId, targetId, relationshipType) {
    return this.request('POST', '/api/graph/relationship', {
      sourceId,
      targetId,
      relationshipType
    });
  }

  async getEntity(name) {
    return this.request('GET', `/api/graph/entity/${encodeURIComponent(name)}`);
  }
}

// Export for extension context
if (typeof window !== 'undefined') {
  window.PlutoClient = PlutoClient;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlutoClient;
}
