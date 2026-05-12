// Chrome API type declarations (declared in popup.ts)
// declare const chrome: any;

interface Settings {
  sensitiveDomainPatterns: string[];
  maxEvents: number;
  maxSessions: number;
  sessionGapMs: number;
}

interface RuntimeSettings extends Settings {}

interface ExtensionEvent {
  id: string;
  type: string;
  timestamp: number;
  tabId: number;
  url: string;
  title: string;
  domain: string;
  metadata: Record<string, unknown>;
}

interface ChromeTab {
  id?: number;
  url?: string;
  title?: string;
}

interface MessageRequest {
  type?: string;
  query?: string;
  limit?: number;
  sessionId?: string;
  url?: string;
}

const STORAGE_KEYS = {
  events: "pluto_events_v1",
  sessions: "pluto_sessions_v1",
  settings: "pluto_settings_v1"
};

const DEFAULT_SETTINGS: Settings = {
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

const runtimeSettings: RuntimeSettings = { ...DEFAULT_SETTINGS };

// Database client (with local fallback)
class LocalPlutoClient {
  serverUrl: string;
  timeout: number;
  available: boolean;

  constructor() {
    this.serverUrl = 'http://localhost:3000';
    this.timeout = 2000;
    this.available = false;
    this.checkAvailability();
  }

  async checkAvailability(): Promise<void> {
    try {
      const response = await Promise.race([
        fetch(`${this.serverUrl}/health`),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), this.timeout))
      ]);
      this.available = (response as Response).ok;
      if (this.available) {
        console.log('Pluto backend connected');
      }
    } catch (error) {
      this.available = false;
      console.log('Pluto backend unavailable, using local storage');
    }
  }

  async request(method: string, path: string, body: unknown = null): Promise<unknown> {
    if (!this.available) {
      return null;
    }

    try {
      const options: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await Promise.race([
        fetch(`${this.serverUrl}${path}`, options),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), this.timeout))
      ]);

      const data = await (response as Response).json() as { ok: boolean; result?: unknown };
      return data.ok ? data.result : null;
    } catch (error) {
      console.error(`Pluto client error [${method} ${path}]:`, (error as Error).message);
      return null;
    }
  }

  async addEvent(event: ExtensionEvent): Promise<unknown> {
    return this.request('POST', '/api/events', { event });
  }

  async addSession(session: unknown): Promise<unknown> {
    return this.request('POST', '/api/sessions', { session });
  }

  async updateSession(id: string, session: unknown): Promise<unknown> {
    return this.request('PUT', `/api/sessions/${id}`, { session });
  }

  async getSessions(limit = 100): Promise<unknown> {
    return this.request('GET', `/api/sessions?limit=${limit}`);
  }
}

const plutoClient = new LocalPlutoClient();

init();

function init(): void {
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
    
    // Create or update session
    await createOrUpdateSession(tab);

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

  chrome.runtime.onMessage.addListener((message: unknown, sender: unknown, sendResponse: Function) => {
    handleMessage(message as MessageRequest, sender)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: (error as Error).message }));

    return true;
  });
}

function buildEvent(type: string, tab: ChromeTab): ExtensionEvent {
  return {
    id: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    tabId: tab.id || 0,
    url: normalizeUrl(tab.url || ""),
    title: tab.title || "",
    domain: extractDomain(tab.url || ""),
    metadata: {}
  };
}

async function handleMessage(message: MessageRequest, sender: unknown): Promise<unknown> {
  const kind = message?.type;

  if (kind === "pluto.queryRecall") {
    return queryRecall(message.query || "", message.limit || 5);
  }

  if (kind === "pluto.getRecentSessions") {
    const sessions = await getSessions();
    return (sessions as any[])
      .slice()
      .sort((a: any, b: any) => (b.endedAt as number) - (a.endedAt as number))
      .slice(0, message.limit || 8);
  }

  if (kind === "pluto.getOpenLoops") {
    const sessions = await getSessions();
    return (sessions as any[])
      .filter((session: any) => session.unresolved && (session.unresolved as unknown[]).length > 0)
      .sort((a: any, b: any) => (b.endedAt as number) - (a.endedAt as number))
      .slice(0, message.limit || 5);
  }

  if (kind === "pluto.resumeSession") {
    return resumeSession(message.sessionId || "");
  }

  if (kind === "pluto.whyPage") {
    return explainPageContext(message.url || "");
  }

  if (kind === "pluto.getStats") {
    const [events, sessions] = await Promise.all([getEvents(), getSessions()]);
    return {
      events: (events as unknown[]).length,
      sessions: (sessions as unknown[]).length
    };
  }

  if (kind === "pluto.exportData") {
    return exportData();
  }

  if (kind === "pluto.deleteAllData") {
    return deleteAllData();
  }

  return null;
}

async function getEvents(): Promise<ExtensionEvent[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.events], (data) => {
      resolve((data[STORAGE_KEYS.events] as ExtensionEvent[]) || []);
    });
  });
}

async function getSessions(): Promise<unknown[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.sessions], (data) => {
      resolve((data[STORAGE_KEYS.sessions] as unknown[]) || []);
    });
  });
}

async function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.settings], (data) => {
      resolve((data[STORAGE_KEYS.settings] as Settings) || DEFAULT_SETTINGS);
    });
  });
}

async function saveSettings(settings: Settings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings }, resolve);
  });
}

async function ingestEvent(event: ExtensionEvent): Promise<void> {
  const events = await getEvents();
  events.push(event);
  
  if (events.length > runtimeSettings.maxEvents) {
    events.shift();
  }

  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.events]: events }, resolve);
  });
}

async function createOrUpdateSession(tab: ChromeTab): Promise<void> {
  const sessions = await getSessions();
  const now = Date.now();
  
  // Find active session (within sessionGapMs timeframe)
  let activeSession: any = (sessions as any[]).find((s: any) => {
    const timeSinceEnd = now - s.endedAt;
    return timeSinceEnd < runtimeSettings.sessionGapMs;
  });

  if (!activeSession) {
    // Create new session
    activeSession = {
      id: crypto.randomUUID(),
      label: tab.title || "Untitled session",
      startedAt: now,
      endedAt: now,
      urls: [tab.url],
      domains: [extractDomain(tab.url || "")],
      summary: "",
      entities: [],
      unresolved: []
    };
    (sessions as any[]).push(activeSession);
  } else {
    // Update existing session
    activeSession.endedAt = now;
    if (!activeSession.urls) {
      activeSession.urls = [];
    }
    if (!activeSession.urls.includes(tab.url || "")) {
      activeSession.urls.push(tab.url || "");
    }
    activeSession.label = tab.title || activeSession.label;
  }

  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.sessions]: sessions }, resolve);
  });
}

async function queryRecall(query: string, limit: number): Promise<unknown[]> {
  const sessions = await getSessions();
  return (sessions as Record<string, unknown>[]).slice(0, limit);
}

async function resumeSession(sessionId: string): Promise<Record<string, unknown>> {
  const sessions = await getSessions();
  const session = (sessions as Record<string, unknown>[]).find(s => s.id === sessionId);
  
  if (session && session.urls && Array.isArray(session.urls)) {
    const urls = session.urls as string[];
    for (const url of urls) {
      await chrome.tabs.create({ url });
    }
  }

  return { opened: (session?.urls as string[] | undefined)?.length || 0 };
}

async function explainPageContext(url: string): Promise<unknown> {
  return { context: "Page context explanation" };
}

async function exportData(): Promise<Record<string, unknown>> {
  const [events, sessions] = await Promise.all([getEvents(), getSessions()]);
  return {
    exportedAt: new Date().toISOString(),
    local: {
      events: events.length,
      sessions: sessions.length
    }
  };
}

async function deleteAllData(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.clear(resolve);
  });
}

function shouldExclude(url: string): boolean {
  const domain = extractDomain(url);
  return runtimeSettings.sensitiveDomainPatterns.some(pattern => 
    domain.includes(pattern)
  );
}

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return "";
  }
}

function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    urlObj.hash = "";
    return urlObj.toString();
  } catch {
    return url;
  }
}

function extractSearchQuery(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const q = urlObj.searchParams.get('q');
    return q;
  } catch {
    return null;
  }
}
