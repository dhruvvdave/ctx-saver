// background.js — service worker for ctx extension

const BACKEND_URL = "http://localhost:7331";
const INACTIVITY_THRESHOLD = 30 * 60 * 1000; // 30 minutes
const SAVE_ALARM = "ctx-save";
const MAX_LOCAL_SESSIONS = 50;

let currentSession = createSession();
let lastActivityTime = Date.now();

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

// Heuristic summary — pure JS, no backend required
function generateSummary(session) {
  const tabs = Object.values(session.tabs).filter((t) => t.domain);

  const domainTime = {};
  for (const tab of tabs) {
    domainTime[tab.domain] = (domainTime[tab.domain] || 0) + (tab.timeSpent || 0);
  }
  const topDomains = Object.entries(domainTime)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([d]) => d);

  const allQueries = [
    ...(session.searchQueries || []),
    ...tabs.map((t) => t.searchQuery).filter(Boolean),
  ];
  const uniqueQueries = [...new Set(allQueries)].slice(0, 3);

  const topTab = tabs
    .filter((t) => t.title && t.timeSpent)
    .sort((a, b) => (b.timeSpent || 0) - (a.timeSpent || 0))[0];

  const parts = [];
  if (topDomains.length > 0) parts.push(`Active on: ${topDomains.join(", ")}`);
  if (uniqueQueries.length > 0) parts.push(`Searched: ${uniqueQueries.join("; ")}`);
  if (topTab) {
    const m = Math.round((topTab.timeSpent || 0) / 60);
    parts.push(`Most time on: ${topTab.title.slice(0, 40)} (${m}m)`);
  }
  return parts.join(" · ") || "Browsing session";
}

// Set up periodic save alarm
chrome.alarms.create(SAVE_ALARM, { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== SAVE_ALARM) return;

  const inactiveFor = Date.now() - lastActivityTime;

  if (inactiveFor >= INACTIVITY_THRESHOLD) {
    if (hasActivity(currentSession)) {
      await saveSession(currentSession);
    }
    currentSession = createSession();
  } else if (hasActivity(currentSession)) {
    await saveSession(currentSession);
  }
});

function hasActivity(session) {
  return Object.keys(session.tabs).length > 0;
}

function normalizeTabData(tab) {
  return {
    url: tab.url || null,
    domain: tab.domain || null,
    title: tab.title || null,
    summary: tab.summary || null,
    timeSpent: tab.timeSpent || 0,
    scrollDepth: tab.scrollDepth || 0,
    highlights: tab.highlights || [],
    searchQuery: tab.searchQuery || null,
    firstVisit: tab.firstVisit || Date.now(),
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  lastActivityTime = Date.now();

  switch (message.type) {
    case "TAB_BLOCKED": {
      const { domain } = message;
      if (domain && !currentSession.blockedDomains.includes(domain)) {
        currentSession.blockedDomains.push(domain);
      }
      break;
    }

    case "PAGE_VISIT": {
      if (!tabId) break;
      const key = String(tabId);
      const existing = currentSession.tabs[key];
      currentSession.tabs[key] = normalizeTabData({
        ...(existing || {}),
        url: message.url,
        domain: message.domain,
        title: message.title,
        summary: message.summary,
        searchQuery: message.searchQuery || (existing && existing.searchQuery) || null,
        firstVisit: existing ? existing.firstVisit : Date.now(),
      });

      if (message.searchQuery && !currentSession.searchQueries.includes(message.searchQuery)) {
        currentSession.searchQueries.push(message.searchQuery);
      }
      break;
    }

    case "PAGE_LEAVE": {
      if (!tabId) break;
      const key = String(tabId);
      if (!currentSession.tabs[key]) break;
      currentSession.tabs[key].timeSpent =
        (currentSession.tabs[key].timeSpent || 0) + (message.timeSpent || 0);
      currentSession.tabs[key].scrollDepth = Math.max(
        currentSession.tabs[key].scrollDepth || 0,
        message.scrollDepth || 0
      );
      if (message.lastHighlight) {
        currentSession.tabs[key].highlights = currentSession.tabs[key].highlights || [];
        currentSession.tabs[key].highlights.push(message.lastHighlight);
      }
      break;
    }

    case "TEXT_HIGHLIGHTED": {
      const highlight = {
        text: message.text,
        url: message.url,
        title: message.title,
        timestamp: Date.now(),
      };
      currentSession.highlights.push(highlight);
      if (tabId) {
        const key = String(tabId);
        if (currentSession.tabs[key]) {
          currentSession.tabs[key].highlights = currentSession.tabs[key].highlights || [];
          currentSession.tabs[key].highlights.push(message.text);
        }
      }
      break;
    }

    case "SAVE_SESSION": {
      const sessionToSave = { ...currentSession, endTime: Date.now() };
      saveSession(sessionToSave).then(() => {
        currentSession = createSession();
        sendResponse({ success: true });
      });
      return true;
    }

    case "GET_CURRENT_SESSION": {
      sendResponse(currentSession);
      break;
    }

    case "GET_SESSIONS": {
      fetchLocalSessions().then((sessions) => sendResponse(sessions));
      return true;
    }

    case "CLEAR_SESSIONS": {
      chrome.storage.local.set({ offlineSessions: [] }, () => {
        sendResponse({ success: true });
      });
      return true;
    }

    case "DISCARD_SESSION": {
      // Reset current session without saving it
      currentSession = createSession();
      sendResponse({ success: true });
      break;
    }
  }
});

async function saveSession(session) {
  const payload = {
    ...session,
    endTime: session.endTime || Date.now(),
    duration: Math.round(((session.endTime || Date.now()) - session.startTime) / 1000),
    summary: generateSummary(session),
  };

  // Primary: save to chrome.storage.local (works without any backend)
  await new Promise((resolve) => {
    chrome.storage.local.get(["offlineSessions"], (result) => {
      const sessions = result.offlineSessions || [];
      const updated = [payload, ...sessions.filter((s) => s.id !== payload.id)].slice(
        0,
        MAX_LOCAL_SESSIONS
      );
      chrome.storage.local.set({ offlineSessions: updated }, resolve);
    });
  });

  // Optional: sync to backend for CLI access (fire-and-forget, never blocks)
  fetch(`${BACKEND_URL}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Backend not running — that's fine, local storage has the data
  });
}

function fetchLocalSessions() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["offlineSessions"], (result) => {
      resolve(result.offlineSessions || []);
    });
  });
}

// On install/update, create fresh session
chrome.runtime.onInstalled.addListener(() => {
  currentSession = createSession();
});
