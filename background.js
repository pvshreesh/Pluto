const STORAGE_KEYS = {
  events: "pluto_events_v1",
  sessions: "pluto_sessions_v1",
  settings: "pluto_settings_v1"
};

const DEFAULT_SETTINGS = {
  sensitiveDomainPatterns: [
    "bank",
    "banking",
    "health",
    "hospital",
    "gov",
    "government",
    "login",
    "signin",
    "mail.google.com",
    "outlook.live.com",
    "web.whatsapp.com"
  ],
  maxEvents: 5000,
  maxSessions: 500,
  sessionGapMs: 30 * 60 * 1000
};

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "to", "for", "in", "on", "of", "at", "is", "it", "that", "this", "with", "as", "by", "from", "be", "was", "are", "how", "did", "i", "you"
]);

const runtimeSettings = { ...DEFAULT_SETTINGS };

// Database client (with local fallback)
class LocalPlutoClient {
  constructor() {
    this.serverUrl = 'http://localhost:3000';
    this.timeout = 2000;
    this.available = false;
    this.checkAvailability();
  }

  async checkAvailability() {
    try {
      const response = await Promise.race([
        fetch(`${this.serverUrl}/health`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), this.timeout))
      ]);
      this.available = response.ok;
      if (this.available) {
        console.log('Pluto backend connected');
      }
    } catch (error) {
      this.available = false;
      console.log('Pluto backend unavailable, using local storage');
    }
  }

  async request(method, path, body = null) {
    if (!this.available) {
      return null;
    }

    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        timeout: this.timeout
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await Promise.race([
        fetch(`${this.serverUrl}${path}`, options),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), this.timeout))
      ]);

      const data = await response.json();
      return data.ok ? data.result : null;
    } catch (error) {
      console.error(`Pluto client error [${method} ${path}]:`, error.message);
      return null;
    }
  }

  async addEvent(event) {
    return this.request('POST', '/api/events', { event });
  }

  async addSession(session) {
    return this.request('POST', '/api/sessions', { session });
  }

  async updateSession(id, session) {
    return this.request('PUT', `/api/sessions/${id}`, { session });
  }

  async getSessions(limit = 100) {
    return this.request('GET', `/api/sessions?limit=${limit}`);
  }
}

const plutoClient = new LocalPlutoClient();

init();

function init() {
  chrome.runtime.onInstalled.addListener(async () => {
    const settings = await getSettings();
    await saveSettings(settings);
  });

  chrome.runtime.onStartup.addListener(async () => {
    Object.assign(runtimeSettings, await getSettings());
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete" || !tab.url || shouldExclude(tab.url)) {
      return;
    }

    const event = buildEvent("page_viewed", tab);
    await ingestEvent(event);

    const query = extractSearchQuery(tab.url);
    if (query) {
      await ingestEvent({ ...event, id: crypto.randomUUID(), type: "search_performed", metadata: { query } });
    }
  });

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!tab.url || shouldExclude(tab.url)) {
      return;
    }

    const event = buildEvent("tab_switched", tab);
    await ingestEvent(event);
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  });
}

function buildEvent(type, tab) {
  return {
    id: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    tabId: tab.id,
    url: normalizeUrl(tab.url),
    title: tab.title || "",
    domain: extractDomain(tab.url),
    metadata: {}
  };
}

async function handleMessage(message) {
  const kind = message?.type;

  if (kind === "pluto.queryRecall") {
    return queryRecall(message.query || "", message.limit || 5);
  }

  if (kind === "pluto.getRecentSessions") {
    const sessions = await getSessions();
    return sessions
      .slice()
      .sort((a, b) => b.endedAt - a.endedAt)
      .slice(0, message.limit || 8);
  }

  if (kind === "pluto.getOpenLoops") {
    const sessions = await getSessions();
    return sessions
      .filter((session) => session.unresolved && session.unresolved.length > 0)
      .sort((a, b) => b.endedAt - a.endedAt)
      .slice(0, message.limit || 5);
  }

  if (kind === "pluto.resumeSession") {
    return resumeSession(message.sessionId);
  }

  if (kind === "pluto.whyPage") {
    return explainPageContext(message.url);
  }

  if (kind === "pluto.getStats") {
    const [events, sessions] = await Promise.all([getEvents(), getSessions()]);
    return {
      events: events.length,
      sessions: sessions.length
    };
  }

  if (kind === "pluto.getSettings") {
    return getSettings();
  }

  if (kind === "pluto.saveSettings") {
    const nextSettings = {
      ...(await getSettings()),
      ...message.payload
    };
    await saveSettings(nextSettings);
    return nextSettings;
  }

  if (kind === "pluto.exportData") {
    return exportData();
  }

  if (kind === "pluto.deleteAllData") {
    return deleteAllData();
  }

  throw new Error("Unknown request type");
}

async function ingestEvent(event) {
  const settings = await getSettings();

  // Try to persist to backend
  if (plutoClient.available) {
    try {
      await plutoClient.addEvent(event);
    } catch (error) {
      console.error('Failed to add event to backend:', error);
    }
  }

  // Also update local storage for sync
  const events = await getEvents();
  const nextEvents = [...events, event].slice(-settings.maxEvents);
  await setStorage(STORAGE_KEYS.events, nextEvents);
  await updateSessionModel(event, settings.sessionGapMs);
}

async function updateSessionModel(event, sessionGapMs) {
  const sessions = await getSessions();
  const lastSession = sessions[sessions.length - 1];

  if (!lastSession) {
    const newSession = buildSession(event);
    // Persist to backend
    if (plutoClient.available) {
      try {
        await plutoClient.addSession(newSession);
      } catch (error) {
        console.error('Failed to add session to backend:', error);
      }
    }
    await setStorage(STORAGE_KEYS.sessions, [newSession]);
    return;
  }

  const isGap = event.timestamp - lastSession.endedAt > sessionGapMs;
  const isSameIntent = likelySameIntent(lastSession, event);

  if (isGap || !isSameIntent) {
    const next = [...sessions, buildSession(event)];
    const settings = await getSettings();
    const newSession = buildSession(event);
    // Persist to backend
    if (plutoClient.available) {
      try {
        await plutoClient.addSession(newSession);
      } catch (error) {
        console.error('Failed to add session to backend:', error);
      }
    }
    await setStorage(STORAGE_KEYS.sessions, next.slice(-settings.maxSessions));
    return;
  }

  const updated = {
    ...lastSession,
    endedAt: event.timestamp,
    eventIds: [...lastSession.eventIds, event.id],
    urls: dedupe([...lastSession.urls, event.url]),
    entities: dedupe([...lastSession.entities, ...extractEntities(event)]),
    unresolved: computeUnresolved([...lastSession.unresolved, ...extractUnresolvedSignals(event)]),
    summary: buildSummary({
      ...lastSession,
      urls: dedupe([...lastSession.urls, event.url]),
      entities: dedupe([...lastSession.entities, ...extractEntities(event)])
    })
  };

  // Persist to backend
  if (plutoClient.available) {
    try {
      await plutoClient.updateSession(lastSession.id, updated);
    } catch (error) {
      console.error('Failed to update session in backend:', error);
    }
  }

  const nextSessions = [...sessions.slice(0, -1), updated];
  await setStorage(STORAGE_KEYS.sessions, nextSessions);
}

function buildSession(event) {
  const entities = extractEntities(event);
  const unresolved = extractUnresolvedSignals(event);

  return {
    id: crypto.randomUUID(),
    label: deriveSessionLabel(event),
    startedAt: event.timestamp,
    endedAt: event.timestamp,
    eventIds: [event.id],
    urls: [event.url],
    entities,
    unresolved,
    summary: buildSummary({
      label: deriveSessionLabel(event),
      entities,
      urls: [event.url]
    })
  };
}

function deriveSessionLabel(event) {
  const url = event.url || "";
  const title = (event.title || "").toLowerCase();
  const query = event.metadata?.query || "";

  if (query) {
    return `Research: ${query.slice(0, 60)}`;
  }

  if (title.includes("job") || url.includes("jobs")) {
    return "Job search session";
  }

  if (title.includes("debug") || title.includes("error") || title.includes("stack")) {
    return "Debugging session";
  }

  if (title.includes("compare") || title.includes("vs")) {
    return "Comparison session";
  }

  return `Browsing: ${extractDomain(url)}`;
}

function likelySameIntent(session, event) {
  const domain = event.domain;
  if (session.urls.some((url) => extractDomain(url) === domain)) {
    return true;
  }

  const sessionTerms = tokenize(`${session.label} ${session.summary} ${(session.entities || []).join(" ")}`);
  const eventTerms = tokenize(`${event.title || ""} ${event.metadata?.query || ""}`);

  const overlap = intersectSize(sessionTerms, eventTerms);
  return overlap >= 2;
}

async function queryRecall(query, limit) {
  const sessions = await getSessions();
  const queryTokens = tokenize(query);

  const scored = sessions
    .map((session) => {
      const content = `${session.label} ${session.summary} ${(session.entities || []).join(" ")} ${(session.unresolved || []).join(" ")}`;
      const contentTokens = tokenize(content);
      const score = hybridScore(queryTokens, contentTokens, session);

      return {
        session,
        score,
        reason: buildReason(queryTokens, session)
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => ({
      ...item.session,
      score: Number(item.score.toFixed(3)),
      reason: item.reason
    }));

  return scored;
}

function hybridScore(queryTokens, contentTokens, session) {
  if (!queryTokens.length) {
    return 0;
  }

  const semanticOverlap = intersectSize(queryTokens, contentTokens) / Math.max(queryTokens.length, 1);
  const freshnessDays = (Date.now() - session.endedAt) / (24 * 60 * 60 * 1000);
  const recencyBoost = Math.max(0, 1 - freshnessDays / 14) * 0.25;
  const entityBoost = (session.entities || []).length > 0 ? 0.05 : 0;

  return semanticOverlap + recencyBoost + entityBoost;
}

function buildReason(queryTokens, session) {
  const text = `${session.label} ${session.summary} ${(session.entities || []).join(" ")}`.toLowerCase();
  const hits = queryTokens.filter((token) => text.includes(token)).slice(0, 4);

  if (hits.length) {
    return `Matched on: ${hits.join(", ")}`;
  }

  return "Matched by recent and related browsing context";
}

async function resumeSession(sessionId) {
  const sessions = await getSessions();
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const urls = dedupe(session.urls || []).slice(-5);
  if (urls.length === 0) {
    return { opened: 0 };
  }

  for (const url of urls) {
    await chrome.tabs.create({ url, active: false });
  }

  return {
    opened: urls.length,
    label: session.label
  };
}

async function explainPageContext(url) {
  if (!url) {
    return null;
  }

  const normalized = normalizeUrl(url);
  const sessions = await getSessions();

  const match = sessions
    .slice()
    .reverse()
    .find((session) => (session.urls || []).includes(normalized));

  if (!match) {
    return null;
  }

  return {
    sessionId: match.id,
    label: match.label,
    summary: match.summary,
    unresolved: match.unresolved || []
  };
}

function extractEntities(event) {
  const source = `${event.title || ""} ${event.url || ""} ${event.metadata?.query || ""}`;
  const candidates = source.match(/\b[A-Z][a-zA-Z0-9]{2,}\b/g) || [];
  const domains = event.domain ? [event.domain.split(".")[0]] : [];

  return dedupe([...candidates, ...domains])
    .map((entity) => entity.toLowerCase())
    .filter((entity) => entity.length > 2)
    .slice(0, 12);
}

function extractUnresolvedSignals(event) {
  const source = `${event.title || ""} ${event.metadata?.query || ""}`.toLowerCase();
  const markers = [
    "todo",
    "later",
    "compare",
    "apply",
    "debug",
    "fix",
    "issue",
    "follow up",
    "research"
  ];

  return markers.filter((marker) => source.includes(marker));
}

function computeUnresolved(signals) {
  return dedupe(signals).slice(0, 8);
}

function buildSummary(session) {
  const entityPart = (session.entities || []).slice(0, 5).join(", ");
  const urlsPart = (session.urls || []).slice(-2).map((url) => extractDomain(url)).join(" -> ");
  return `${session.label}. Entities: ${entityPart || "none"}. Trail: ${urlsPart || "none"}.`;
}

function shouldExclude(url) {
  const domain = extractDomain(url);
  if (!domain) {
    return true;
  }

  if (["chrome", "edge", "about", "file"].includes(url.split(":")[0])) {
    return true;
  }

  return runtimeSettings.sensitiveDomainPatterns.some((pattern) => domain.includes(pattern));
}

function extractSearchQuery(url) {
  try {
    const parsed = new URL(url);
    const q = parsed.searchParams.get("q") || parsed.searchParams.get("query") || parsed.searchParams.get("k");
    return q ? q.trim() : "";
  } catch {
    return "";
  }
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function tokenize(text) {
  return text
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
  return [...new Set(items.filter(Boolean))];
}

async function getSettings() {
  const raw = await getStorage(STORAGE_KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(raw || {}) };
}

async function saveSettings(settings) {
  Object.assign(runtimeSettings, settings);
  await setStorage(STORAGE_KEYS.settings, settings);
}

async function exportData() {
  const [localEvents, localSessions, settings] = await Promise.all([getEvents(), getSessions(), getSettings()]);
  const backend = plutoClient.available ? await plutoClient.request('GET', '/api/export') : null;

  return {
    exportedAt: new Date().toISOString(),
    local: {
      events: localEvents,
      sessions: localSessions,
      settings
    },
    backend: backend || null,
    settings,
    source: 'local-extension'
  };
}

async function deleteAllData() {
  if (plutoClient.available) {
    try {
      await plutoClient.deleteAllData();
    } catch (error) {
      console.error('Failed to delete backend data:', error);
    }
  }

  await Promise.all([
    setStorage(STORAGE_KEYS.events, []),
    setStorage(STORAGE_KEYS.sessions, []),
    setStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS)
  ]);
  Object.assign(runtimeSettings, DEFAULT_SETTINGS);
  return { deleted: true };
}

async function getEvents() {
  return (await getStorage(STORAGE_KEYS.events)) || [];
}

async function getSessions() {
  return (await getStorage(STORAGE_KEYS.sessions)) || [];
}

function getStorage(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => resolve(result[key]));
  });
}

function setStorage(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}
