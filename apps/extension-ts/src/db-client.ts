/**
 * Database client for communicating with Pluto backend server.
 * Handles events, sessions, and semantic recall via REST API.
 */

interface Event {
  [key: string]: unknown;
}

interface Session {
  [key: string]: unknown;
}

interface RequestOptions {
  method: string;
  headers: Record<string, string>;
  timeout: number;
  body?: string;
}

class PlutoClient {
  baseUrl: string;
  timeout: number;

  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.timeout = 5000;
  }

  async request(method: string, path: string, body: unknown = null): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestOptions = {
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: this.timeout
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options as RequestInit);
      const data = await response.json() as { ok: boolean; error?: string; result?: unknown };

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
  async addEvent(event: Event): Promise<unknown> {
    return this.request('POST', '/api/events', { event });
  }

  async getEvents(limit = 100): Promise<Event[]> {
    return this.request('GET', `/api/events?limit=${limit}`) as Promise<Event[]>;
  }

  // Sessions
  async addSession(session: Session): Promise<unknown> {
    return this.request('POST', '/api/sessions', { session });
  }

  async updateSession(id: string, session: Session): Promise<unknown> {
    return this.request('PUT', `/api/sessions/${id}`, { session });
  }

  async getSessions(limit = 100): Promise<Session[]> {
    return this.request('GET', `/api/sessions?limit=${limit}`) as Promise<Session[]>;
  }

  async getSession(id: string): Promise<Session> {
    return this.request('GET', `/api/sessions/${id}`) as Promise<Session>;
  }

  async exportData(): Promise<unknown> {
    return this.request('GET', '/api/export');
  }

  async deleteAllData(): Promise<unknown> {
    return this.request('DELETE', '/api/data');
  }

  // Semantic recall
  async recall(embedding: number[], limit = 5): Promise<unknown> {
    return this.request('POST', '/api/recall', { embedding, limit });
  }

  // Graph (Neo4j)
  async addEntity(name: string, type: string, metadata: Record<string, unknown> = {}): Promise<unknown> {
    return this.request('POST', '/api/graph/entity', { name, type, metadata });
  }

  async addRelationship(sourceId: string, targetId: string, relationshipType: string): Promise<unknown> {
    return this.request('POST', '/api/graph/relationship', {
      sourceId,
      targetId,
      relationshipType
    });
  }

  async getEntity(name: string): Promise<unknown> {
    return this.request('GET', `/api/graph/entity/${encodeURIComponent(name)}`);
  }
}

// Export for extension context
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).PlutoClient = PlutoClient;
}
