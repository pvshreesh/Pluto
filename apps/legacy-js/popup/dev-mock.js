// Lightweight dev mock for chrome.runtime.sendMessage
// Only defines a mock if one isn't already present (safe for extension use).
(function () {
  if (window.chrome && window.chrome.runtime && window.chrome.runtime.sendMessage) return;

  window.chrome = window.chrome || {};
  window.chrome.runtime = window.chrome.runtime || {};

  const sampleSessions = [
    { id: 's1', label: 'Redis fix', endedAt: Date.now() - 1000 * 60 * 60 * 24, urls: ['https://redis.io'], summary: 'Fixed eviction policy', entities: [], unresolved: [] },
    { id: 's2', label: 'Graph schema', endedAt: Date.now() - 1000 * 60 * 60 * 48, urls: ['https://neo4j.com'], summary: 'Designed entity relationships', entities: [], unresolved: ['follow up'] }
  ];

  function respond(type, payload) {
    switch (type) {
      case 'pluto.getStats':
        return { sessions: sampleSessions.length, events: 42 };
      case 'pluto.getRecentSessions':
        return sampleSessions.slice(0, payload.limit || 6);
      case 'pluto.getOpenLoops':
        return sampleSessions.filter(s => s.unresolved && s.unresolved.length).slice(0, payload.limit || 4);
      case 'pluto.queryRecall':
        return sampleSessions.map((s, i) => ({ ...s, score: 0.9 - i * 0.1, reason: 'Mocked match' }));
      case 'pluto.resumeSession':
        return { opened: payload.sessionId };
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

  window.chrome.runtime.sendMessage = function (message, callback) {
    const { type, ...payload } = message || {};
    setTimeout(() => {
      const result = respond(type, payload);
      callback({ ok: true, result });
    }, 100);
  };
})();
