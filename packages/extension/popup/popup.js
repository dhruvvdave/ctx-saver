// popup.js — ctx extension popup

const BACKEND_URL = "http://localhost:7331";

// Tab switching
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
    if (tab.dataset.tab === "sessions") loadSessions();
    if (tab.dataset.tab === "privacy") loadPrivacy();
  });
});

// Format seconds to readable string
function fmtTime(seconds) {
  if (!seconds) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function timeAgo(ms) {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// Check backend status
async function checkBackend() {
  const el = document.getElementById("backend-status");
  try {
    const res = await fetch(`${BACKEND_URL}/`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      el.textContent = "● backend ok";
      el.style.color = "#c8f135";
    } else {
      el.textContent = "● backend error";
      el.style.color = "#ff5f5f";
    }
  } catch {
    el.textContent = "● offline";
    el.style.color = "#666";
  }
}

// Load live session data
function loadLive() {
  chrome.runtime.sendMessage({ type: "GET_CURRENT_SESSION" }, (session) => {
    if (!session) return;

    const dot = document.getElementById("status-dot");
    const statusText = document.getElementById("status-text");
    const tabCount = document.getElementById("tab-count");
    const blockedCount = document.getElementById("blocked-count");
    const tabList = document.getElementById("tab-list");

    const tabs = Object.values(session.tabs || {});
    const blocked = (session.blockedDomains || []);
    const hasActivity = tabs.length > 0;

    dot.classList.toggle("active", hasActivity);

    if (hasActivity) {
      const startedAgo = timeAgo(session.startTime);
      statusText.innerHTML = `<strong>Active</strong> · started ${startedAgo}`;
    } else {
      statusText.innerHTML = `<span>No activity yet</span>`;
    }

    tabCount.textContent = tabs.length;
    blockedCount.textContent = blocked.length;

    // Sort tabs by time spent descending
    const sorted = tabs
      .filter((t) => t.domain)
      .sort((a, b) => (b.timeSpent || 0) - (a.timeSpent || 0));

    if (sorted.length === 0 && blocked.length === 0) {
      tabList.innerHTML = '<div class="empty-state">No tabs tracked yet.</div>';
      return;
    }

    tabList.innerHTML = "";

    for (const tab of sorted) {
      const item = document.createElement("div");
      item.className = "tab-item";

      const faviconUrl = `https://www.google.com/s2/favicons?domain=${tab.domain}&sz=32`;
      const favicon = document.createElement("img");
      favicon.className = "tab-favicon";
      favicon.src = faviconUrl;
      favicon.onerror = () => {
        const placeholder = document.createElement("div");
        placeholder.className = "tab-favicon-placeholder";
        favicon.replaceWith(placeholder);
      };

      const info = document.createElement("div");
      info.className = "tab-info";
      info.innerHTML = `
        <div class="tab-title">${escHtml(tab.title || tab.domain)}</div>
        <div class="tab-domain">${escHtml(tab.domain)}</div>
      `;

      const time = document.createElement("div");
      time.className = "tab-time";
      time.textContent = fmtTime(tab.timeSpent || 0);

      item.appendChild(favicon);
      item.appendChild(info);
      item.appendChild(time);
      tabList.appendChild(item);
    }

    for (const domain of blocked) {
      const item = document.createElement("div");
      item.className = "tab-blocked";
      item.innerHTML = `<span class="lock">🔒</span> private — ${escHtml(domain)}`;
      tabList.appendChild(item);
    }
  });
}

// Load sessions from backend or local storage
async function loadSessions() {
  const el = document.getElementById("sessions-list");
  el.innerHTML = '<div class="empty-state">Loading...</div>';

  let sessions = [];

  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions?limit=10`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      sessions = await res.json();
    }
  } catch {
    // Try local storage fallback
    sessions = await new Promise((resolve) => {
      chrome.storage.local.get(["offlineSessions"], (r) =>
        resolve((r.offlineSessions || []).slice(0, 10))
      );
    });
  }

  if (sessions.length === 0) {
    el.innerHTML = '<div class="empty-state">No sessions yet.</div>';
    return;
  }

  el.innerHTML = "";
  for (const s of sessions) {
    const startMs = s.start_time
      ? s.start_time > 1e12
        ? s.start_time
        : s.start_time * 1000
      : s.startTime || 0;
    const durationSec = s.duration || 0;
    const tabCount = s.tab_count || Object.keys(s.tabs || {}).length || 0;
    const summary = s.summary || "Session";

    const item = document.createElement("div");
    item.className = "session-item";
    item.innerHTML = `
      <div class="session-meta">
        <span>${timeAgo(startMs)}</span>
        <span class="duration">${fmtTime(durationSec)}</span>
      </div>
      <div class="session-summary">${escHtml(summary.slice(0, 80))}</div>
      <div style="color: var(--muted); font-size: 10px; margin-top: 2px;">${tabCount} tab${tabCount !== 1 ? "s" : ""}</div>
    `;
    el.appendChild(item);
  }
}

// Load privacy settings
function loadPrivacy() {
  chrome.storage.local.get(["customBlocklist"], (result) => {
    const list = result.customBlocklist || [];
    renderBlocklist(list);
  });
}

function renderBlocklist(list) {
  const el = document.getElementById("custom-blocklist");
  el.innerHTML = "";

  if (list.length === 0) {
    el.innerHTML = '<div style="color: var(--muted); padding: 4px 0;">No custom domains added.</div>';
    return;
  }

  for (const domain of list) {
    const item = document.createElement("div");
    item.className = "blocklist-item";
    item.innerHTML = `
      <span class="blocklist-domain">${escHtml(domain)}</span>
      <button class="remove-btn" data-domain="${escHtml(domain)}">remove</button>
    `;
    item.querySelector(".remove-btn").addEventListener("click", () => removeDomain(domain));
    el.appendChild(item);
  }
}

function removeDomain(domain) {
  chrome.storage.local.get(["customBlocklist"], (result) => {
    const list = (result.customBlocklist || []).filter((d) => d !== domain);
    chrome.storage.local.set({ customBlocklist: list }, () => renderBlocklist(list));
  });
}

document.getElementById("blocklist-add").addEventListener("click", () => {
  const input = document.getElementById("blocklist-input");
  const domain = input.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!domain) return;
  chrome.storage.local.get(["customBlocklist"], (result) => {
    const list = result.customBlocklist || [];
    if (!list.includes(domain)) {
      list.push(domain);
      chrome.storage.local.set({ customBlocklist: list }, () => {
        renderBlocklist(list);
        input.value = "";
      });
    }
  });
});

document.getElementById("blocklist-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("blocklist-add").click();
});

// Footer buttons
document.getElementById("btn-save").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SAVE_SESSION" }, (response) => {
    if (response?.success) {
      const btn = document.getElementById("btn-save");
      const orig = btn.textContent;
      btn.textContent = "Saved!";
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = orig;
        btn.disabled = false;
        loadLive();
      }, 1500);
    }
  });
});

document.getElementById("btn-clear").addEventListener("click", () => {
  if (!confirm("Clear current session? This cannot be undone.")) return;
  chrome.runtime.sendMessage({ type: "SAVE_SESSION" }, () => {
    loadLive();
  });
});

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Init
checkBackend();
loadLive();

// Refresh live data every 10 seconds while popup is open
setInterval(loadLive, 10000);
setInterval(checkBackend, 30000);
