// Lightweight dev mock for chrome.runtime.sendMessage
// Only defines a mock if one isn't already present (safe for extension use).

interface MockSession {
  id: string;
  label: string;
  endedAt: number;
  urls: string[];
  summary: string;
  entities: unknown[];
  unresolved: string[];
  score?: number;
  reason?: string;
}

interface MockResponse {
  [key: string]: unknown;
}

(function () {
  // Check if chrome.runtime.sendMessage already exists
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    return;
  }

  // Initialize window.chrome if it doesn't exist
  if (typeof window !== 'undefined') {
    (window as any).chrome = (window as any).chrome || {};
    (window as any).chrome.runtime = (window as any).chrome.runtime || {};

    const sampleSessions: MockSession[] = [
      {
        id: 's1',
        label: 'Redis fix',
        endedAt: Date.now() - 1000 * 60 * 60 * 24,
        urls: ['https://redis.io'],
        summary: 'Fixed eviction policy',
        entities: [],
        unresolved: []
      },
      {
        id: 's2',
        label: 'Graph schema',
        endedAt: Date.now() - 1000 * 60 * 60 * 48,
        urls: ['https://neo4j.com'],
        summary: 'Designed entity relationships',
        entities: [],
        unresolved: ['follow up']
      }
    ];

    function respond(type: string, payload: Record<string, unknown>): any {
      switch (type) {
        case 'pluto.getStats':
          return { sessions: sampleSessions.length, events: 42 };
        case 'pluto.getRecentSessions':
          return sampleSessions.slice(0, (payload.limit as number) || 6);
        case 'pluto.getOpenLoops':
          return sampleSessions.filter((s: MockSession) => s.unresolved && s.unresolved.length).slice(0, (payload.limit as number) || 4);
        case 'pluto.queryRecall':
          return sampleSessions.map((s: MockSession, i: number) => ({ ...s, score: 0.9 - i * 0.1, reason: 'Mocked match' }));
        case 'pluto.resumeSession':
          return { opened: (payload.sessionId as string) };
        case 'pluto.exportData':
          return {
            exportedAt: new Date().toISOString(),
            local: {
              events: sampleSessions.length,
              sessions: sampleSessions,
              settings: {}
            },
            backend: null,
            source: 'mock'
          };
        case 'pluto.deleteAllData':
          return { deleted: true };
        default:
          return {};
      }
    }

    (window as any).chrome.runtime.sendMessage = function (
      message: Record<string, unknown>,
      callback?: Function
    ) {
      const { type, ...payload } = message || {};
      setTimeout(() => {
        const result = respond(type as string, payload);
        if (callback) {
          callback({ ok: true, result });
        }
      }, 100);
    };
  }
})();
