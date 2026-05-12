interface ChromeRuntime {
  sendMessage(message: unknown, callback?: Function): void;
  lastError?: { message: string };
}

interface ChromeExtension {
  runtime: ChromeRuntime;
}

declare const chrome: any;

interface Session {
  id: string;
  label?: string;
  endedAt: number;
  urls?: string[];
  summary?: string;
  score?: number;
  reason?: string;
  unresolved?: string[];
}

interface RenderOptions {
  showScore?: boolean;
  showReason?: boolean;
  showUnresolved?: boolean;
}

interface Stats {
  sessions: number;
  events: number;
}

const queryInput = document.getElementById("query") as HTMLInputElement;
const searchBtn = document.getElementById("searchBtn") as HTMLButtonElement;
const resultsEl = document.getElementById("results") as HTMLUListElement;
const openLoopsEl = document.getElementById("openLoops") as HTMLUListElement;
const recentEl = document.getElementById("recent") as HTMLUListElement;
const statsEl = document.getElementById("stats") as HTMLElement;
const exportBtn = document.getElementById("exportBtn") as HTMLButtonElement | null;
const deleteBtn = document.getElementById("deleteBtn") as HTMLButtonElement | null;
const controlStatusEl = document.getElementById("controlStatus") as HTMLElement;

searchBtn.addEventListener("click", onSearch);
queryInput.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.key === "Enter") {
    onSearch();
  }
});
exportBtn?.addEventListener("click", onExport);
deleteBtn?.addEventListener("click", onDeleteAll);

loadInitial();

async function loadInitial(): Promise<void> {
  const [stats, recent, loops] = await Promise.all([
    send("pluto.getStats"),
    send("pluto.getRecentSessions", { limit: 6 }),
    send("pluto.getOpenLoops", { limit: 4 })
  ]);

  const typedStats = stats as Stats;
  statsEl.textContent = `${typedStats.sessions} sessions, ${typedStats.events} events captured locally`;
  renderSessions(recentEl, recent as Session[]);
  renderSessions(openLoopsEl, loops as Session[], { showUnresolved: true });
}

async function onSearch(): Promise<void> {
  const query = queryInput.value.trim();
  if (!query) {
    resultsEl.innerHTML = "";
    return;
  }

  const items = await send("pluto.queryRecall", { query, limit: 5 });
  renderSessions(resultsEl, items as Session[], { showScore: true, showReason: true });
}

async function onExport(): Promise<void> {
  setControlStatus("Exporting...");
  try {
    await send("pluto.exportData");
    const data = await send("pluto.exportData");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pluto-export-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setControlStatus("Export downloaded.");
  } catch (error) {
    setControlStatus(`Export failed: ${(error as Error).message}`);
  }
}

async function onDeleteAll(): Promise<void> {
  const confirmed = confirm("Delete all Pluto data stored locally and in the backend?");
  if (!confirmed) {
    return;
  }

  setControlStatus("Deleting data...");
  try {
    await send("pluto.deleteAllData");
    resultsEl.innerHTML = "";
    openLoopsEl.innerHTML = "";
    recentEl.innerHTML = "";
    statsEl.textContent = "0 sessions, 0 events captured locally";
    setControlStatus("All data deleted.");
  } catch (error) {
    setControlStatus(`Delete failed: ${(error as Error).message}`);
  }
}

function renderSessions(container: HTMLElement, sessions: Session[], options: RenderOptions = {}): void {
  if (!sessions || sessions.length === 0) {
    container.innerHTML = '<li class="item"><div class="meta">No sessions yet.</div></li>';
    return;
  }

  container.innerHTML = sessions
    .map((session: Session) => {
      const score = options.showScore ? `<div class="meta">Score: ${session.score || 0}</div>` : "";
      const reason = options.showReason && session.reason ? `<div class="meta">${escapeHtml(session.reason)}</div>` : "";
      const unresolved = options.showUnresolved && session.unresolved?.length
        ? `<div class="meta">Unresolved: ${session.unresolved.join(", ")}</div>`
        : "";

      return `
        <li class="item">
          <div class="title">${escapeHtml(session.label || "Untitled session")}</div>
          <div class="meta">${formatDate(session.endedAt)} • ${session.urls?.length || 0} pages</div>
          <div class="meta">${escapeHtml(session.summary || "")}</div>
          ${score}
          ${reason}
          ${unresolved}
        </li>
      `;
    })
    .join("");
}

function send(type: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    (chrome as unknown as ChromeExtension).runtime.sendMessage({ type, ...payload }, (response: unknown) => {
      const typedResponse = response as { ok?: boolean; error?: string; result?: unknown } | undefined;
      
      if ((chrome as unknown as ChromeExtension).runtime.lastError) {
        reject(new Error((chrome as unknown as ChromeExtension).runtime.lastError?.message));
        return;
      }

      if (!typedResponse?.ok) {
        reject(new Error(typedResponse?.error || "Unknown error"));
        return;
      }

      resolve(typedResponse.result);
    });
  });
}

function formatDate(value: number): string {
  if (!value) {
    return "unknown time";
  }
  return new Date(value).toLocaleString();
}

function setControlStatus(text: string): void {
  if (controlStatusEl) {
    controlStatusEl.textContent = text;
  }
}

function escapeHtml(text: string): string {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
