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

// Set up periodic save alarm
chrome.alarms.create(SAVE_ALARM, { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== SAVE_ALARM) return;

  const inactiveFor = Date.now() - lastActivityTime;

  if (inactiveFor >= INACTIVITY_THRESHOLD) {
    // Inactive too long — save and reset
    if (hasActivity(currentSession)) {
      await saveSession(currentSession);
    }
    currentSession = createSession();
  } else if (hasActivity(currentSession)) {
    // Active — snapshot save without resetting
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
      return true; // async response
    }

    case "GET_CURRENT_SESSION": {
      sendResponse(currentSession);
      break;
    }

    case "GET_SESSIONS": {
      fetchSessions().then((sessions) => sendResponse(sessions));
      return true;
    }
  }
});

async function saveSession(session) {
  const payload = {
    ...session,
    endTime: session.endTime || Date.now(),
    duration: Math.round(((session.endTime || Date.now()) - session.startTime) / 1000),
  };

  try {
    const response = await fetch(`${BACKEND_URL}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      // Clear from local storage if it was saved there
      chrome.storage.local.get(["offlineSessions"], (result) => {
        const offline = (result.offlineSessions || []).filter(
          (s) => s.id !== session.id
        );
        chrome.storage.local.set({ offlineSessions: offline });
      });
      return;
    }
  } catch {
    // Backend unreachable — save locally
  }

  // Fallback to chrome.storage.local
  chrome.storage.local.get(["offlineSessions"], (result) => {
    const offline = result.offlineSessions || [];
    const updated = [payload, ...offline.filter((s) => s.id !== payload.id)].slice(
      0,
      MAX_LOCAL_SESSIONS
    );
    chrome.storage.local.set({ offlineSessions: updated });
  });
}

async function fetchSessions() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/sessions`);
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // fall through to local
  }

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
