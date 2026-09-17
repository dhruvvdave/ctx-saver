// background.js — service worker for the ctx extension.
//
// The one thing to understand about this file: an MV3 service worker is not a
// long-lived process. Chrome kills it after ~30s of inactivity and starts a
// fresh one on the next event. Anything held in a module-level variable is gone
// by then. So the session lives in chrome.storage.local and the module-level
// `cache` below is only a within-lifetime read-through cache, never the source
// of truth.

const BACKEND_URL = "http://localhost:7331";
const INACTIVITY_THRESHOLD = 30 * 60 * 1000; // roll over to a new session after this idle gap
const SAVE_ALARM = "ctx-save";
const SAVE_PERIOD_MINUTES = 5;
const STATE_KEY = "ctxState";
const SESSIONS_KEY = "offlineSessions";

const MAX_LOCAL_SESSIONS = 50;
const MAX_PAGES_PER_SESSION = 150;
const MAX_HIGHLIGHTS_PER_SESSION = 100;
const MAX_HIGHLIGHTS_PER_PAGE = 5;
const MAX_QUERIES_PER_SESSION = 50;
const MAX_BLOCKED_DOMAINS = 100;
const STORAGE_SOFT_LIMIT = 8 * 1024 * 1024; // trim history before local storage gets heavy

// ---------------------------------------------------------------------------
// Session shape
// ---------------------------------------------------------------------------

function generateId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createSession() {
  return {
    id: generateId(),
    startTime: Date.now(),
    tabs: {},
    blockedDomains: [],
    searchQueries: [],
    highlights: [],
  };
}

function freshState() {
  return { session: createSession(), lastActivityTime: Date.now() };
}

// ---------------------------------------------------------------------------
// Persistence. Every read-modify-write goes through `withState` so two messages
// arriving in the same tick cannot clobber each other's writes, and so a worker
// that is killed mid-flight loses at most the message it was handling.
// ---------------------------------------------------------------------------

let cache = null;
let queue = Promise.resolve();

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve));
}

async function loadState() {
  if (cache) return cache;
  const stored = await storageGet([STATE_KEY]);
  const state = stored[STATE_KEY];
  if (state && state.session && state.session.id) {
    // Repair anything a partial write or an older version left missing.
    state.session.tabs = state.session.tabs || {};
    state.session.blockedDomains = state.session.blockedDomains || [];
    state.session.searchQueries = state.session.searchQueries || [];
    state.session.highlights = state.session.highlights || [];
    state.lastActivityTime = state.lastActivityTime || state.session.startTime || Date.now();
    cache = state;
  } else {
    cache = freshState();
  }
  return cache;
}

function withState(fn) {
  const run = queue.then(async () => {
    const state = await loadState();
    const result = await fn(state);
    cache = state;
    await storageSet({ [STATE_KEY]: state });
    return result;
  });
  // Keep the chain alive even if one operation throws.
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

// ---------------------------------------------------------------------------
// Summary — pure JS, no backend required
// ---------------------------------------------------------------------------

function generateSummary(session) {
  const pages = Object.values(session.tabs).filter((t) => t.domain);

  const domainTime = {};
  for (const page of pages) {
    domainTime[page.domain] = (domainTime[page.domain] || 0) + (page.timeSpent || 0);
  }
  const topDomains = Object.entries(domainTime)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([d]) => d);

  const allQueries = [
    ...(session.searchQueries || []),
    ...pages.map((t) => t.searchQuery).filter(Boolean),
  ];
  const uniqueQueries = [...new Set(allQueries)].slice(0, 3);

  const topPage = pages
    .filter((t) => t.title && t.timeSpent)
    .sort((a, b) => (b.timeSpent || 0) - (a.timeSpent || 0))[0];

  const parts = [];
  if (topDomains.length > 0) parts.push(`Active on: ${topDomains.join(", ")}`);
  if (uniqueQueries.length > 0) parts.push(`Searched: ${uniqueQueries.join("; ")}`);
  if (topPage) {
    const m = Math.round((topPage.timeSpent || 0) / 60);
    parts.push(`Most time on: ${topPage.title.slice(0, 40)} (${m}m)`);
  }
  return parts.join(" · ") || "Browsing session";
}

function hasActivity(session) {
  return (
    Object.keys(session.tabs || {}).length > 0 ||
    (session.highlights || []).length > 0
  );
}

// ---------------------------------------------------------------------------
// Alarms
//
// `chrome.alarms.create` with an existing name REPLACES that alarm and restarts
// its period. Calling it unconditionally at the top level meant every content
// script message — every page load — woke the worker, reset the alarm, and
// pushed the 5-minute save another 5 minutes out. On an ordinary browsing day
// it could go hours without firing. So: only create the alarm if it is missing.
// ---------------------------------------------------------------------------

async function ensureAlarm() {
  const existing = await chrome.alarms.get(SAVE_ALARM);
  if (!existing) {
    await chrome.alarms.create(SAVE_ALARM, { periodInMinutes: SAVE_PERIOD_MINUTES });
  }
}

ensureAlarm();
chrome.runtime.onInstalled.addListener(() => ensureAlarm());
chrome.runtime.onStartup.addListener(() => ensureAlarm());

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== SAVE_ALARM) return;
  withState(async (state) => {
    const idleFor = Date.now() - state.lastActivityTime;

    if (idleFor >= INACTIVITY_THRESHOLD) {
      if (hasActivity(state.session)) {
        // End the session when the user actually stopped, not now — otherwise
        // every session absorbs the whole idle gap and reports a false duration.
        await saveSession({ ...state.session, endTime: state.lastActivityTime });
      }
      state.session = createSession();
      state.lastActivityTime = Date.now();
    } else if (hasActivity(state.session)) {
      // Checkpoint. saveSession upserts by id, so the same session is
      // overwritten rather than duplicated.
      await saveSession(state.session);
    }
  });
});

// ---------------------------------------------------------------------------
// Page bookkeeping
// ---------------------------------------------------------------------------

// Keyed per page, not per tab. Keying by tab id alone meant that navigating a
// tab from A to B kept A's accumulated time and scroll depth and re-labelled
// them with B's title — time on one site silently reported as time on another.
function pageKey(tabId, url) {
  let normalized = url || "";
  try {
    const u = new URL(url);
    u.hash = "";
    normalized = u.href;
  } catch {
    /* keep the raw string */
  }
  return `${tabId}::${normalized}`;
}

function blankPage(tabId) {
  return {
    url: null,
    domain: null,
    title: null,
    summary: null,
    timeSpent: 0,
    scrollDepth: 0,
    highlights: [],
    searchQuery: null,
    firstVisit: Date.now(),
    tabId,
  };
}

// Drop the least interesting pages first when a session runs long.
function enforcePageCap(session) {
  const keys = Object.keys(session.tabs);
  if (keys.length <= MAX_PAGES_PER_SESSION) return;
  const ranked = keys
    .map((k) => ({ k, t: session.tabs[k].timeSpent || 0, v: session.tabs[k].firstVisit || 0 }))
    .sort((a, b) => b.t - a.t || b.v - a.v)
    .slice(MAX_PAGES_PER_SESSION);
  for (const { k } of ranked) delete session.tabs[k];
}

function pushCapped(list, value, cap) {
  list.push(value);
  if (list.length > cap) list.splice(0, list.length - cap);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (message.type) {
    case "TAB_BLOCKED":
      withState((state) => {
        state.lastActivityTime = Date.now();
        const domain = message.domain;
        if (domain && !state.session.blockedDomains.includes(domain)) {
          pushCapped(state.session.blockedDomains, domain, MAX_BLOCKED_DOMAINS);
        }

        // Retroactive block: the content script captured this page before it
        // turned out to be sensitive. Drop everything already recorded for it.
        if (message.retractUrl && tabId !== undefined) {
          delete state.session.tabs[pageKey(tabId, message.retractUrl)];
          state.session.highlights = state.session.highlights.filter(
            (h) => h.url !== message.retractUrl
          );
        }
      }).then(() => sendResponse({ ok: true }));
      return true;

    case "PAGE_VISIT":
      withState((state) => {
        state.lastActivityTime = Date.now();
        if (tabId === undefined) return;
        const key = pageKey(tabId, message.url);
        const existing = state.session.tabs[key] || blankPage(tabId);
        state.session.tabs[key] = {
          ...existing,
          url: message.url || existing.url,
          domain: message.domain || existing.domain,
          title: message.title || existing.title,
          summary: message.summary || existing.summary,
          searchQuery: message.searchQuery || existing.searchQuery || null,
        };
        if (
          message.searchQuery &&
          !state.session.searchQueries.includes(message.searchQuery)
        ) {
          pushCapped(state.session.searchQueries, message.searchQuery, MAX_QUERIES_PER_SESSION);
        }
        enforcePageCap(state.session);
      }).then(() => sendResponse({ ok: true }));
      return true;

    // Sent every ~20s while a page is in the foreground, so the popup shows real
    // elapsed time instead of 0 until the user happens to switch tabs.
    case "PAGE_HEARTBEAT":
    case "PAGE_LEAVE":
      withState((state) => {
        state.lastActivityTime = Date.now();
        if (tabId === undefined) return;
        const key = pageKey(tabId, message.url);
        const page = state.session.tabs[key];
        if (!page) return;
        page.timeSpent = (page.timeSpent || 0) + Math.max(0, message.timeSpent || 0);
        page.scrollDepth = Math.max(page.scrollDepth || 0, message.scrollDepth || 0);
      }).then(() => sendResponse({ ok: true }));
      return true;

    case "TEXT_HIGHLIGHTED":
      withState((state) => {
        state.lastActivityTime = Date.now();
        if (!message.text) return;
        pushCapped(
          state.session.highlights,
          {
            text: message.text,
            url: message.url,
            title: message.title,
            timestamp: Date.now(),
          },
          MAX_HIGHLIGHTS_PER_SESSION
        );
        if (tabId === undefined) return;
        const page = state.session.tabs[pageKey(tabId, message.url)];
        if (page) {
          page.highlights = page.highlights || [];
          // Deduplicate: the old code pushed the same selection here and again
          // on every PAGE_LEAVE, so one highlight multiplied by tab switches.
          if (!page.highlights.includes(message.text)) {
            pushCapped(page.highlights, message.text, MAX_HIGHLIGHTS_PER_PAGE);
          }
        }
      }).then(() => sendResponse({ ok: true }));
      return true;

    // Archive the current session and start a new one.
    case "SAVE_SESSION":
      withState(async (state) => {
        if (!hasActivity(state.session)) return { success: false, reason: "empty" };
        await saveSession({ ...state.session, endTime: Date.now() });
        state.session = createSession();
        state.lastActivityTime = Date.now();
        return { success: true };
      }).then(sendResponse, () => sendResponse({ success: false, reason: "error" }));
      return true;

    // Throw the in-progress session away WITHOUT saving it. This is what the
    // popup's "Discard" button says it does; it used to send SAVE_SESSION.
    case "CLEAR_CURRENT_SESSION":
      withState((state) => {
        state.session = createSession();
        state.lastActivityTime = Date.now();
        return { success: true };
      }).then(sendResponse, () => sendResponse({ success: false }));
      return true;

    case "GET_CURRENT_SESSION":
      withState((state) => ({ ...state.session, lastActivityTime: state.lastActivityTime }))
        .then(sendResponse, () => sendResponse(null));
      return true;

    case "GET_SESSIONS":
      fetchLocalSessions().then(sendResponse, () => sendResponse([]));
      return true;

    // Delete the saved history. Leaves the in-progress session alone.
    case "CLEAR_SESSIONS":
      storageSet({ [SESSIONS_KEY]: [] }).then(
        () => sendResponse({ success: true }),
        () => sendResponse({ success: false })
      );
      return true;

    default:
      return false;
  }
});

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

async function saveSession(session) {
  const endTime = session.endTime || Date.now();
  const payload = {
    ...session,
    endTime,
    duration: Math.max(0, Math.round((endTime - session.startTime) / 1000)),
    summary: generateSummary(session),
  };

  // Primary store: chrome.storage.local. Works with no backend, no network.
  const stored = await storageGet([SESSIONS_KEY]);
  const sessions = stored[SESSIONS_KEY] || [];
  const updated = [payload, ...sessions.filter((s) => s.id !== payload.id)].slice(
    0,
    MAX_LOCAL_SESSIONS
  );
  await storageSet({ [SESSIONS_KEY]: updated });
  await trimIfLarge();

  // Optional: hand the same payload to the local backend so `ctx resume` can
  // read it in a terminal. Fire-and-forget by design — if nothing is listening
  // on 7331 the extension carries on exactly as before. Nothing leaves the
  // machine; 7331 is localhost.
  try {
    await fetch(`${BACKEND_URL}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* backend not running — expected, and not an error */
  }
}

// chrome.storage.local is unlimited only because of the unlimitedStorage
// permission; keep it from growing without bound anyway.
async function trimIfLarge() {
  let bytes = 0;
  try {
    bytes = await chrome.storage.local.getBytesInUse(null);
  } catch {
    return;
  }
  if (bytes < STORAGE_SOFT_LIMIT) return;
  const stored = await storageGet([SESSIONS_KEY]);
  const sessions = stored[SESSIONS_KEY] || [];
  if (sessions.length <= 5) return;
  await storageSet({ [SESSIONS_KEY]: sessions.slice(0, Math.floor(sessions.length / 2)) });
}

function fetchLocalSessions() {
  return storageGet([SESSIONS_KEY]).then((result) => result[SESSIONS_KEY] || []);
}

// On browser start, decide whether the session that was in flight when Chrome
// closed should continue or be filed away.
chrome.runtime.onStartup.addListener(() => {
  withState(async (state) => {
    if (Date.now() - state.lastActivityTime >= INACTIVITY_THRESHOLD) {
      if (hasActivity(state.session)) {
        await saveSession({ ...state.session, endTime: state.lastActivityTime });
      }
      state.session = createSession();
      state.lastActivityTime = Date.now();
    }
  });
});
