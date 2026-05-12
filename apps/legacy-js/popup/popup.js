const queryInput = document.getElementById("query");
const searchBtn = document.getElementById("searchBtn");
const resultsEl = document.getElementById("results");
const openLoopsEl = document.getElementById("openLoops");
const recentEl = document.getElementById("recent");
const statsEl = document.getElementById("stats");
const exportBtn = document.getElementById("exportBtn");
const deleteBtn = document.getElementById("deleteBtn");
const controlStatusEl = document.getElementById("controlStatus");

searchBtn.addEventListener("click", onSearch);
queryInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    onSearch();
  }
});
exportBtn?.addEventListener("click", onExport);
deleteBtn?.addEventListener("click", onDeleteAll);

loadInitial();

async function loadInitial() {
  const [stats, recent, loops] = await Promise.all([
    send("pluto.getStats"),
    send("pluto.getRecentSessions", { limit: 6 }),
    send("pluto.getOpenLoops", { limit: 4 })
  ]);

  statsEl.textContent = `${stats.sessions} sessions, ${stats.events} events captured locally`;
  renderSessions(recentEl, recent);
  renderSessions(openLoopsEl, loops, { showUnresolved: true });
}

async function onSearch() {
  const query = queryInput.value.trim();
  if (!query) {
    resultsEl.innerHTML = "";
    return;
  }

  const items = await send("pluto.queryRecall", { query, limit: 5 });
  renderSessions(resultsEl, items, { showScore: true, showReason: true });
}

async function onExport() {
  setControlStatus("Exporting...");
  try {
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
    setControlStatus(`Export failed: ${error.message}`);
  }
}

async function onDeleteAll() {
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
    setControlStatus(`Delete failed: ${error.message}`);
  }
}

function renderSessions(container, sessions, options = {}) {
  if (!sessions || sessions.length === 0) {
    container.innerHTML = '<li class="item"><div class="meta">No sessions yet.</div></li>';
    return;
  }

  container.innerHTML = sessions
    .map((session) => {
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
          <div class="actions">
            <button class="secondary" data-resume="${session.id}">Resume</button>
          </div>
        </li>
      `;
    })
    .join("");

  container.querySelectorAll("[data-resume]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-resume");
      const result = await send("pluto.resumeSession", { sessionId: id });
      button.textContent = `Opened ${result.opened}`;
      button.disabled = true;
    });
  });
}

function send(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.error || "Unknown error"));
        return;
      }

      resolve(response.result);
    });
  });
}

function formatDate(value) {
  if (!value) {
    return "unknown time";
  }
  return new Date(value).toLocaleString();
}

function setControlStatus(text) {
  if (controlStatusEl) {
    controlStatusEl.textContent = text;
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
