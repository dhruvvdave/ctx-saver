// popup.js — ctx popup controller.
//
// Two rules this file follows:
//   1. Every label states what the code actually does. The old Clear button
//      asked "Clear current session?" and then saved it; that class of bug is
//      what the two-step confirmations below are structured to prevent.
//   2. The Privacy tab is rendered from privacy-rules.js — the same module the
//      content script gates on — so it cannot describe a blocklist that isn't
//      the one running.

const BACKEND_URL = "http://localhost:7331";
const REFRESH_MS = 5000;
const CONFIRM_WINDOW_MS = 4000;

const PRIVACY = globalThis.CTX_PRIVACY;
const $ = (id) => document.getElementById(id);

let refreshTimer = null;
let showFavicons = true;

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function timeAgo(ms) {
  if (!ms) return "unknown";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function send(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        void chrome.runtime.lastError;
        resolve(response);
      });
    } catch {
      resolve(undefined);
    }
  });
}

function announce(text) {
  $("live-region").textContent = text;
}

// ---------------------------------------------------------------------------
// Shared render helpers
// ---------------------------------------------------------------------------

// `glyph` and `heading` are escaped; `body` is trusted markup written in this
// file (it carries <em>/<b>), never anything read from a page.
function emptyState(glyph, heading, body) {
  const el = document.createElement("div");
  el.className = "empty reveal";
  el.innerHTML = `
    <div class="glyph">${esc(glyph)}</div>
    <h3>${esc(heading)}</h3>
    <p>${body}</p>
  `;
  return el;
}

// Keeps the google.com/s2/favicons behaviour, including the graceful swap when
// the fetch fails. Offline, the image errors immediately and every row gets a
// lettered tile instead — the list never waits on the network and never shows a
// broken-image glyph.
function letterTile(domain) {
  const tile = document.createElement("div");
  tile.className = "row-icon-fallback";
  tile.setAttribute("aria-hidden", "true");
  tile.textContent = (domain || "?").replace(/^www\./, "").charAt(0) || "?";
  return tile;
}

function faviconFor(domain) {
  if (!showFavicons) return letterTile(domain);
  const img = document.createElement("img");
  img.className = "row-icon";
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
  img.addEventListener("error", () => img.replaceWith(letterTile(domain)));
  return img;
}

// ---------------------------------------------------------------------------
// Live panel
// ---------------------------------------------------------------------------

function renderLive(session) {
  const list = $("live-list");

  if (!session) {
    list.replaceChildren(
      emptyState(
        "[ ?? ]",
        "No answer from the tracker",
        "The background worker did not respond. Reopening the popup usually wakes it."
      )
    );
    return;
  }

  const pages = Object.values(session.tabs || {}).filter((p) => p.domain);
  const blocked = session.blockedDomains || [];
  const totalTime = pages.reduce((sum, p) => sum + (p.timeSpent || 0), 0);
  const live = pages.length > 0 || blocked.length > 0;

  $("pulse").dataset.live = String(live);
  $("status-text").innerHTML = live
    ? `<strong>Active</strong> &middot; session opened ${esc(timeAgo(session.startTime))}`
    : "Standing by &middot; nothing tracked yet";

  setGauge("g-pages", String(pages.length), pages.length === 0);
  setGauge("g-time", fmtDuration(totalTime), totalTime === 0);
  setGauge("g-blocked", String(blocked.length), blocked.length === 0);
  $("count-live").textContent = pages.length ? `·${pages.length}` : "";

  if (pages.length === 0 && blocked.length === 0) {
    list.replaceChildren(
      emptyState(
        "[ \u00b7\u00b7\u00b7 ]",
        "Nothing tracked yet",
        "Open a few tabs and keep working. Pages show up here once you have spent a moment on them."
      )
    );
    return;
  }

  const sorted = pages.sort((a, b) => (b.timeSpent || 0) - (a.timeSpent || 0));
  const peak = Math.max(1, ...sorted.map((p) => p.timeSpent || 0));

  const frag = document.createDocumentFragment();
  let index = 0;

  for (const page of sorted) {
    const row = document.createElement("div");
    row.className = "row reveal";
    row.style.setProperty("--i", String(index++));

    const title = document.createElement("div");
    title.className = "row-title";
    title.textContent = page.title || page.domain;
    title.title = page.title || page.domain;

    const domain = document.createElement("div");
    domain.className = "row-domain";
    domain.textContent = page.domain;

    const time = document.createElement("div");
    time.className = "row-time";
    time.innerHTML = `<b>${esc(fmtDuration(page.timeSpent || 0))}</b><span>${esc(
      String(page.scrollDepth || 0)
    )}%</span>`;

    const meter = document.createElement("div");
    meter.className = "meter";
    const fill = document.createElement("i");
    fill.style.setProperty("--pct", `${Math.round(((page.timeSpent || 0) / peak) * 100)}%`);
    meter.appendChild(fill);

    row.append(faviconFor(page.domain), title, domain, time, meter);
    frag.appendChild(row);
  }

  if (blocked.length) {
    const head = document.createElement("div");
    head.className = "section-head reveal";
    head.style.setProperty("--i", String(index++));
    head.style.marginTop = "14px";
    head.innerHTML = "<h2>Skipped for privacy</h2>";
    frag.appendChild(head);

    for (const domain of blocked) {
      const row = document.createElement("div");
      row.className = "blocked-row reveal";
      row.style.setProperty("--i", String(index++));
      row.innerHTML = `
        <span class="lock">&#128274;</span>
        <span class="blocked-domain" title="${esc(domain)}">${esc(domain)}</span>
        <span class="blocked-note">nothing recorded</span>
      `;
      frag.appendChild(row);
    }
  }

  list.replaceChildren(frag);
}

function setGauge(id, value, isZero) {
  const el = $(id);
  el.textContent = value;
  el.dataset.zero = String(!!isZero);
}

async function loadLive() {
  renderLive(await send({ type: "GET_CURRENT_SESSION" }));
}

// ---------------------------------------------------------------------------
// Sessions panel
// ---------------------------------------------------------------------------

function renderSessions(sessions) {
  const list = $("sessions-list");
  $("count-sessions").textContent = sessions.length ? `·${sessions.length}` : "";
  $("btn-clear-history").style.display = sessions.length ? "" : "none";

  if (!sessions.length) {
    list.replaceChildren(
      emptyState(
        "[ \u2014\u2014 ]",
        "No saved sessions",
        "ctx files one automatically every few minutes while you browse, or you can save the current one from the button below."
      )
    );
    return;
  }

  const frag = document.createDocumentFragment();

  sessions.slice(0, 20).forEach((session, i) => {
    const pages = Object.values(session.tabs || {}).filter((p) => p.domain);
    const domains = [...new Set(pages.map((p) => p.domain))].slice(0, 3);
    const blockedCount = (session.blockedDomains || []).length;
    const highlight = (session.highlights || [])[0];

    const card = document.createElement("article");
    card.className = "session reveal";
    card.style.setProperty("--i", String(i));

    const chips = domains
      .map((d) => `<span class="chip" title="${esc(d)}">${esc(d)}</span>`)
      .join("");
    const more = pages.length
      ? `<span class="chip" data-kind="count">${pages.length} page${pages.length === 1 ? "" : "s"}</span>`
      : "";
    const guard = blockedCount
      ? `<span class="chip" data-kind="guard">&#128274; ${blockedCount} private</span>`
      : "";

    card.innerHTML = `
      <div class="session-head">
        <span class="session-when">${esc(timeAgo(session.startTime))}</span>
        <span class="session-dur">${esc(fmtDuration(session.duration))}</span>
      </div>
      <div class="session-summary">${esc(session.summary || "Browsing session")}</div>
      <div class="chips">${chips}${more}${guard}</div>
      ${highlight && highlight.text ? `<div class="quote">${esc(highlight.text)}</div>` : ""}
    `;
    frag.appendChild(card);
  });

  list.replaceChildren(frag);
}

async function loadSessions() {
  renderSessions((await send({ type: "GET_SESSIONS" })) || []);
}

// ---------------------------------------------------------------------------
// Privacy panel
// ---------------------------------------------------------------------------

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve));
}

async function loadPrivacy() {
  const stored = await storageGet([
    "customBlocklist", "captureHighlights", "trackingPaused", "showFavicons",
  ]);
  $("opt-pause").checked = stored.trackingPaused === true;
  $("opt-highlights").checked = stored.captureHighlights !== false;
  $("opt-favicons").checked = stored.showFavicons !== false;
  renderBlocklist(stored.customBlocklist || []);
}

function renderBlocklist(list) {
  const el = $("blocklist");

  if (!list.length) {
    el.innerHTML =
      '<p class="note" style="margin-top:0">Nothing added yet. The built-in rules below already cover the big categories &mdash; add anything else you would rather ctx never looked at.</p>';
    return;
  }

  const frag = document.createDocumentFragment();
  list.forEach((domain, i) => {
    const row = document.createElement("div");
    row.className = "blocklist-row reveal";
    row.style.setProperty("--i", String(i));
    row.innerHTML = `<span class="d" title="${esc(domain)}">${esc(domain)}</span>`;

    const remove = document.createElement("button");
    remove.className = "x-btn";
    remove.type = "button";
    remove.textContent = "remove";
    remove.setAttribute("aria-label", `Remove ${domain} from the blocklist`);
    remove.addEventListener("click", async () => {
      const stored = await storageGet(["customBlocklist"]);
      const next = (stored.customBlocklist || []).filter((d) => d !== domain);
      await storageSet({ customBlocklist: next });
      renderBlocklist(next);
      announce(`${domain} removed from the blocklist`);
    });

    row.appendChild(remove);
    frag.appendChild(row);
  });

  el.replaceChildren(frag);
}

// Built from the live rules module, so this table is always the truth.
function renderRules() {
  const el = $("rules");
  if (!PRIVACY) {
    el.innerHTML = '<div class="rule-row"><span class="name">Rules unavailable</span></div>';
    return;
  }

  el.innerHTML = PRIVACY.categories
    .map(
      (c) => `
      <div class="rule-row">
        <span class="name">${esc(c.label)}</span>
        <span class="eg">${esc(c.sample.join(" · "))}</span>
        <span class="n">${c.count}</span>
      </div>`
    )
    .join("");

  const s = PRIVACY.stats;
  $("rules-note").innerHTML =
    `<b>${s.domains} domains</b> in those groups, plus <b>${s.hostPatterns} hostname patterns</b> ` +
    `(any <b>.gov</b>, <b>mail.*</b>, <b>secure.*</b>, credit unions, patient portals), ` +
    `<b>${s.urlPatterns} URL keywords</b> (/login, /checkout, /account/transactions, OAuth tokens in the query string), ` +
    `<b>${s.titlePatterns} page-title phrases</b> for health records, government ID and tax filing, and ` +
    `<b>${s.formSelectors} form signals</b> &mdash; a password or card field blocks the page even if nothing else matched. ` +
    `Blocked pages record the bare domain and nothing else: no URL, no title, no text.`;
}

// ---------------------------------------------------------------------------
// Two-step confirmation for destructive buttons.
//
// window.confirm() is unreliable inside an extension popup — on some Chrome
// builds it dismisses the popup along with the dialog, which is how a mislabelled
// action can go unnoticed. An inline second click stays inside the panel and
// keeps the wording attached to the button that performs it.
// ---------------------------------------------------------------------------

function armConfirm(button, confirmLabel, onConfirm) {
  const original = button.textContent;
  let armed = false;
  let timer = null;

  const disarm = () => {
    armed = false;
    button.textContent = original;
    button.dataset.armed = "false";
    if (timer) clearTimeout(timer);
  };

  button.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      button.textContent = confirmLabel;
      button.dataset.armed = "true";
      announce(`${confirmLabel} — click again to confirm`);
      timer = setTimeout(disarm, CONFIRM_WINDOW_MS);
      return;
    }
    disarm();
    await onConfirm();
  });
}

function flashFooter(message) {
  const flash = $("flash");
  flash.textContent = message;
  flash.dataset.show = "true";
  announce(message);
  setTimeout(() => {
    flash.dataset.show = "false";
  }, 1400);
}

// ---------------------------------------------------------------------------
// Backend probe — informational only
// ---------------------------------------------------------------------------

async function checkBackend() {
  const el = $("link-state");
  const label = $("link-label");
  try {
    const res = await fetch(`${BACKEND_URL}/`, { signal: AbortSignal.timeout(1200) });
    if (!res.ok) throw new Error("bad status");
    el.dataset.on = "true";
    label.textContent = "cli link";
    el.title = "Local backend is running — `ctx resume` works in a terminal.";
  } catch {
    // Expected whenever the optional backend is not running. The extension does
    // not need it; Chrome logs the refused connection at the network layer.
    el.dataset.on = "false";
    label.textContent = "cli off";
    el.title =
      "Optional local backend is not running. The extension works fully without it — it is only needed for the `ctx` terminal commands.";
  }
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function selectTab(name) {
  for (const tab of document.querySelectorAll(".tab")) {
    tab.setAttribute("aria-selected", String(tab.dataset.panel === name));
  }
  for (const panel of document.querySelectorAll(".panel")) {
    panel.dataset.active = String(panel.id === `panel-${name}`);
  }
  if (name === "live") loadLive();
  if (name === "sessions") loadSessions();
  if (name === "privacy") loadPrivacy();
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => selectTab(tab.dataset.panel));
}

$("blocklist-add").addEventListener("click", async () => {
  const input = $("blocklist-input");
  const domain = input.value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");

  if (!domain || !domain.includes(".")) {
    input.focus();
    input.select();
    announce("Enter a domain such as example.com");
    return;
  }

  const stored = await storageGet(["customBlocklist"]);
  const list = stored.customBlocklist || [];
  if (!list.includes(domain)) list.push(domain);
  await storageSet({ customBlocklist: list });
  renderBlocklist(list);
  input.value = "";
  announce(`${domain} added to the blocklist`);
});

$("blocklist-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("blocklist-add").click();
});

$("opt-pause").addEventListener("change", async (e) => {
  await storageSet({ trackingPaused: e.target.checked });
  announce(e.target.checked ? "Tracking paused" : "Tracking resumed");
});

$("opt-favicons").addEventListener("change", async (e) => {
  showFavicons = e.target.checked;
  await storageSet({ showFavicons: e.target.checked });
  loadLive();
  announce(e.target.checked ? "Site icons on" : "Site icons off");
});

$("opt-highlights").addEventListener("change", async (e) => {
  await storageSet({ captureHighlights: e.target.checked });
  announce(e.target.checked ? "Highlight capture on" : "Highlight capture off");
});

// Save: file the current session and start a fresh one.
$("btn-save").addEventListener("click", async () => {
  const button = $("btn-save");
  button.disabled = true;
  const response = await send({ type: "SAVE_SESSION" });
  button.disabled = false;

  if (response?.success) {
    flashFooter("Session filed");
    loadLive();
    loadSessions();
  } else if (response?.reason === "empty") {
    flashFooter("Nothing to save yet");
  } else {
    flashFooter("Save failed");
  }
});

// Discard: throw the in-progress session away WITHOUT saving it. This is the bug
// the old build had backwards — the confirm said "clear" and the code saved.
armConfirm($("btn-discard"), "Discard?", async () => {
  const response = await send({ type: "CLEAR_CURRENT_SESSION" });
  if (response?.success) {
    flashFooter("Session discarded");
    loadLive();
  } else {
    flashFooter("Discard failed");
  }
});

// Clear history: delete the saved sessions. Leaves the in-progress one alone.
armConfirm($("btn-clear-history"), "delete all?", async () => {
  const response = await send({ type: "CLEAR_SESSIONS" });
  if (response?.success) {
    renderSessions([]);
    announce("Saved sessions deleted");
  }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

renderRules();
// Read the icon preference before the first paint so rows are never rendered
// with a network request the user has switched off.
storageGet(["showFavicons"]).then((stored) => {
  showFavicons = stored.showFavicons !== false;
  loadLive();
});
loadSessions();
checkBackend();

refreshTimer = setInterval(() => {
  if ($("panel-live").dataset.active === "true") loadLive();
}, REFRESH_MS);

window.addEventListener("unload", () => clearInterval(refreshTimer));
