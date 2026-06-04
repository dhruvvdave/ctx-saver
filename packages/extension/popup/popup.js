// popup.js — ctx extension popup

const BACKEND = "http://localhost:7331";

// ─── Utilities ───────────────────────────────────────────────────────────────

function fmt(seconds) {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function timeAgo(ms) {
  if (!ms) return "unknown";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 10)  return "just now";
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  const d = Math.round(s / 86400);
  return `${d}d ago`;
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makeFavicon(domain, className = "tab-fav") {
  const img = document.createElement("img");
  img.className = className;
  img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
  img.alt = "";
  img.onerror = () => {
    const ph = document.createElement("div");
    ph.className = "tab-fav-ph";
    ph.textContent = domain[0]?.toUpperCase() ?? "?";
    img.replaceWith(ph);
  };
  return img;
}

// ─── Tab navigation ──────────────────────────────────────────────────────────

const panelLoaders = {
  resume:  loadResume,
  live:    loadLive,
  history: loadHistory,
  privacy: loadPrivacy,
};

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.getElementById(`panel-${tab}`).classList.add("active");
    panelLoaders[tab]?.();
  });
});

// ─── Backend sync status (informational only) ─────────────────────────────────

async function checkBackend() {
  const pill = document.getElementById("sync-pill");
  try {
    const r = await fetch(`${BACKEND}/`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) {
      pill.textContent = "● cli sync on";
      pill.className = "sync-pill online";
      pill.title = "Backend running — ctx resume / ctx sessions work in your terminal";
      return;
    }
  } catch { /* ignore */ }
  pill.textContent = "● cli sync off";
  pill.className = "sync-pill";
  pill.title = "Backend not running — extension works fine without it";
}

// ─── RESUME TAB ──────────────────────────────────────────────────────────────

function loadResume() {
  chrome.storage.local.get(["offlineSessions"], (result) => {
    const session = (result.offlineSessions || [])[0] ?? null;
    renderResume(session);
  });
}

function renderResume(session) {
  const root = document.getElementById("resume-content");

  if (!session) {
    root.innerHTML = `
      <div class="empty">
        <span class="empty-icon">▶</span>
        <strong>Nothing saved yet</strong>
        Browse some pages and hit "Save Session" — ctx will remember exactly what you were working on.
      </div>
    `;
    return;
  }

  const tabs = Object.values(session.tabs ?? {})
    .filter((t) => t.domain)
    .sort((a, b) => (b.timeSpent ?? 0) - (a.timeSpent ?? 0));

  const queries = (session.searchQueries ?? []).filter(Boolean);

  // Collect highlights: session-level objects + per-tab strings, deduped
  const rawHighlights = [
    ...(session.highlights ?? []).map((h) => (typeof h === "string" ? h : h?.text)).filter(Boolean),
    ...tabs.flatMap((t) => t.highlights ?? []).filter(Boolean),
  ];
  const highlights = [...new Set(rawHighlights)].slice(0, 5);

  const frag = document.createDocumentFragment();

  // ── Session header bar ──
  const bar = el("div", "resume-bar");
  bar.innerHTML = `
    <div class="resume-bar-left">
      <span class="resume-age">${esc(timeAgo(session.startTime))}</span>
      <span class="resume-duration">${esc(fmt(session.duration))}</span>
    </div>
    <span class="resume-tabs-badge">${tabs.length} tab${tabs.length !== 1 ? "s" : ""}</span>
  `;
  frag.appendChild(bar);

  // ── Summary card ──
  if (session.summary) {
    const card = el("div", "summary-card");
    card.innerHTML = `
      <div class="summary-card-label">What you were doing</div>
      <div class="summary-card-text">${esc(session.summary)}</div>
    `;
    frag.appendChild(card);
  }

  // ── Top tabs ──
  if (tabs.length > 0) {
    const sec = el("div", "section");
    const label = el("div", "section-title");
    label.textContent = "Top tabs";
    sec.appendChild(label);

    for (const tab of tabs.slice(0, 7)) {
      const row = el("div", "tab-row");

      const fav = makeFavicon(tab.domain);

      const info = el("div", "tab-info");
      info.innerHTML = `
        <div class="tab-title">${esc(tab.title ?? tab.domain)}</div>
        <div class="tab-domain">${esc(tab.domain)}</div>
      `;

      const meta = el("div", "tab-meta");
      const depth = tab.scrollDepth ?? 0;
      meta.innerHTML = `
        <span class="tab-time">${esc(fmt(tab.timeSpent))}</span>
        <div class="depth-bar"><div class="depth-fill" style="width:${depth}%"></div></div>
        <span class="depth-label">${depth}% read</span>
      `;

      row.appendChild(fav);
      row.appendChild(info);
      row.appendChild(meta);
      sec.appendChild(row);
    }

    frag.appendChild(sec);
  }

  // ── Search queries ──
  if (queries.length > 0) {
    const sec = el("div", "section");
    const label = el("div", "section-title");
    label.textContent = "Searched for";
    sec.appendChild(label);

    const chips = el("div", "chip-row");
    for (const q of queries) {
      const chip = el("span", "chip");
      chip.textContent = q;
      chips.appendChild(chip);
    }
    sec.appendChild(chips);
    frag.appendChild(sec);
  }

  // ── Highlights / notes ──
  if (highlights.length > 0) {
    const sec = el("div", "section");
    const label = el("div", "section-title");
    label.textContent = "Notes you captured";
    sec.appendChild(label);

    for (const text of highlights) {
      const q = el("div", "quote-block");
      q.textContent = text.slice(0, 220);
      sec.appendChild(q);
    }
    frag.appendChild(sec);
  }

  // Spacer so last section breathes
  const spacer = el("div", "");
  spacer.style.height = "10px";
  frag.appendChild(spacer);

  root.innerHTML = "";
  root.appendChild(frag);
}

// ─── LIVE TAB ────────────────────────────────────────────────────────────────

function loadLive() {
  chrome.runtime.sendMessage({ type: "GET_CURRENT_SESSION" }, (session) => {
    if (!session) return;

    const tabs = Object.values(session.tabs ?? {}).filter((t) => t.domain);
    const blocked = session.blockedDomains ?? [];
    const isActive = tabs.length > 0;

    const dot = document.getElementById("status-dot");
    dot.classList.toggle("active", isActive);

    document.getElementById("live-main").textContent = isActive ? "Active session" : "Idle";
    document.getElementById("live-sub").textContent = isActive
      ? `Started ${timeAgo(session.startTime)}`
      : "Waiting for page activity…";

    document.getElementById("live-tabs").textContent = tabs.length;
    document.getElementById("live-blocked").textContent = blocked.length;

    const list = document.getElementById("live-list");
    const sorted = [...tabs].sort((a, b) => (b.timeSpent ?? 0) - (a.timeSpent ?? 0));

    if (sorted.length === 0 && blocked.length === 0) {
      list.innerHTML = `<div class="empty"><strong>Nothing tracked yet</strong>Browse a few pages to start building context.</div>`;
      return;
    }

    list.innerHTML = "";

    for (const tab of sorted) {
      const row = el("div", "live-row");

      const fav = makeFavicon(tab.domain, "tab-fav");

      const info = el("div", "tab-info");
      info.innerHTML = `
        <div class="tab-title">${esc(tab.title ?? tab.domain)}</div>
        <div class="tab-domain">${esc(tab.domain)}</div>
      `;

      const meta = el("div", "tab-meta");
      meta.innerHTML = `
        <span class="tab-time">${esc(fmt(tab.timeSpent))}</span>
        <span class="depth-label">${tab.scrollDepth ?? 0}% scroll</span>
      `;

      row.appendChild(fav);
      row.appendChild(info);
      row.appendChild(meta);
      list.appendChild(row);
    }

    for (const domain of blocked) {
      const row = el("div", "live-blocked");
      row.innerHTML = `<span style="font-style:normal">🔒</span> private — <span style="font-family:var(--mono)">${esc(domain)}</span>`;
      list.appendChild(row);
    }
  });
}

// ─── HISTORY TAB ─────────────────────────────────────────────────────────────

function loadHistory() {
  const root = document.getElementById("history-list");
  root.innerHTML = `<div class="empty">Loading…</div>`;

  chrome.storage.local.get(["offlineSessions"], (result) => {
    const sessions = (result.offlineSessions ?? []).slice(0, 20);

    if (sessions.length === 0) {
      root.innerHTML = `<div class="empty"><strong>No sessions saved</strong>Save a session to build your history.</div>`;
      return;
    }

    root.innerHTML = "";

    for (const s of sessions) {
      const tabCount = Object.keys(s.tabs ?? {}).length;
      const blockedCount = (s.blockedDomains ?? []).length;
      const summary = (s.summary ?? "Browsing session").slice(0, 100);

      const item = el("div", "history-item");
      item.innerHTML = `
        <div class="history-meta">
          <span class="history-age">${esc(timeAgo(s.startTime))}</span>
          <span class="history-dur">${esc(fmt(s.duration))}</span>
        </div>
        <div class="history-summary">${esc(summary)}</div>
        <div class="history-footer">
          <span>${tabCount} tab${tabCount !== 1 ? "s" : ""}</span>
          ${blockedCount > 0 ? `<span>${blockedCount} private</span>` : ""}
        </div>
      `;
      root.appendChild(item);
    }
  });
}

// ─── PRIVACY TAB ─────────────────────────────────────────────────────────────

function loadPrivacy() {
  chrome.storage.local.get(["customBlocklist"], (r) => {
    renderBlocklist(r.customBlocklist ?? []);
  });
}

function renderBlocklist(list) {
  const root = document.getElementById("custom-blocklist");
  root.innerHTML = "";

  if (list.length === 0) {
    root.innerHTML = `<p style="color:var(--tx2);font-size:12px;padding:4px 0 8px;">No custom domains added yet.</p>`;
    return;
  }

  for (const domain of list) {
    const row = el("div", "blocklist-row");
    const span = el("span", "blocklist-domain");
    span.textContent = domain;

    const btn = el("button", "remove-btn");
    btn.type = "button";
    btn.textContent = "remove";
    btn.addEventListener("click", () => removeDomain(domain));

    row.appendChild(span);
    row.appendChild(btn);
    root.appendChild(row);
  }
}

function removeDomain(domain) {
  chrome.storage.local.get(["customBlocklist"], (r) => {
    const list = (r.customBlocklist ?? []).filter((d) => d !== domain);
    chrome.storage.local.set({ customBlocklist: list }, () => renderBlocklist(list));
  });
}

document.getElementById("blocklist-add").addEventListener("click", () => {
  const input = document.getElementById("blocklist-input");
  const raw = input.value.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!raw) return;

  chrome.storage.local.get(["customBlocklist"], (r) => {
    const list = r.customBlocklist ?? [];
    if (list.includes(raw)) return;
    list.push(raw);
    chrome.storage.local.set({ customBlocklist: list }, () => {
      renderBlocklist(list);
      input.value = "";
    });
  });
});

document.getElementById("blocklist-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("blocklist-add").click();
});

// ─── FOOTER ──────────────────────────────────────────────────────────────────

document.getElementById("btn-save").addEventListener("click", () => {
  const btn = document.getElementById("btn-save");
  btn.disabled = true;
  btn.textContent = "Saving…";

  chrome.runtime.sendMessage({ type: "SAVE_SESSION" }, (resp) => {
    btn.textContent = "Saved!";
    setTimeout(() => {
      btn.textContent = "Save Session";
      btn.disabled = false;
      loadLive();
      // If Resume tab is active, refresh it to show the new session
      if (document.querySelector(".nav-btn[data-tab='resume']").classList.contains("active")) {
        loadResume();
      }
    }, 1400);
  });
});

document.getElementById("btn-discard").addEventListener("click", () => {
  if (!confirm("Discard the current session? This can't be undone.")) return;
  chrome.runtime.sendMessage({ type: "DISCARD_SESSION" }, () => {
    loadLive();
    if (document.querySelector(".nav-btn[data-tab='resume']").classList.contains("active")) {
      // Resume tab stays unchanged — last saved session is unaffected
    }
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function el(tag, className) {
  const node = document.createElement(tag || "div");
  if (className) node.className = className;
  return node;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

checkBackend();
loadResume();
loadLive();

// Refresh live tracking every 10s while popup is open
const liveTimer = setInterval(loadLive, 10_000);
const backendTimer = setInterval(checkBackend, 60_000);
