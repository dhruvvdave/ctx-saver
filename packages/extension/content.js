// content.js — injected into every page.
//
// Loaded after privacy-rules.js, which puts CTX_PRIVACY on the shared isolated
// world. Nothing is read from the page until that module says the page is safe,
// and the check is repeated at every capture point rather than once at load —
// a login form rendered by JavaScript after document_idle, or a single-page app
// that routes to /account/transactions, has to be caught too.

(function () {
  "use strict";

  const PRIVACY = globalThis.CTX_PRIVACY;
  const HEARTBEAT_MS = 10000;   // steady cadence once a page is settled
  const FIRST_BEAT_MS = 3000;   // first reading comes fast so the popup is never stuck on 0s
  const MIN_HIGHLIGHT_CHARS = 20;
  const MAX_HIGHLIGHT_CHARS = 500;
  const LATE_RECHECK_MS = 2500; // catch forms that render after document_idle
  const URL_POLL_MS = 1000;     // detect SPA navigations (see attachListeners)

  // Fail closed: if the rules module did not load for any reason, capture nothing.
  if (!PRIVACY) return;

  // Never run inside a frame, a prerender, or an extension page.
  if (window.top !== window.self) return;

  let settings = { customBlocklist: [], captureHighlights: true, trackingPaused: false };
  let blocked = false;
  let reportedBlockedDomain = null;
  let currentUrl = location.href;
  // Set once a PAGE_VISIT has gone out for currentUrl, so that if the page
  // later turns out to be sensitive we know there is something to take back.
  let capturedUrl = null;
  let segmentStart = Date.now();
  let visible = !document.hidden;
  let heartbeatTimer = null;
  let firstBeatTimer = null;
  // Peak scroll, not current scroll. Reading the position at flush time meant
  // that scrolling to the bottom of an article and back to the top recorded 0%.
  let maxScroll = 0;

  function domain() {
    return PRIVACY.normalizeHost(location.hostname);
  }

  function send(message) {
    try {
      chrome.runtime.sendMessage(message, () => {
        // Reading lastError stops "Unchecked runtime.lastError" noise when the
        // worker is mid-restart or the extension was just reloaded.
        void chrome.runtime.lastError;
      });
    } catch {
      /* extension context invalidated (reload/update) — nothing to do */
    }
  }

  // The gate. Returns true when the page must not be read.
  function isBlocked() {
    if (settings.trackingPaused) return true;
    return (
      PRIVACY.evaluate({
        url: location.href,
        host: location.hostname,
        title: document.title,
        customBlocklist: settings.customBlocklist,
        document,
      }) !== null
    );
  }

  function reportBlocked() {
    const d = domain();
    if (!d) return;

    // A page can pass the gate at document_idle and fail it moments later — a
    // login form mounted by JavaScript, or an SPA routing into /account. The
    // title and URL are already in the session by then, so blocking has to work
    // backwards as well as forwards: name the URL to drop. The service worker
    // deletes that entry and any highlights taken from it.
    const retractUrl = capturedUrl;
    capturedUrl = null;

    if (reportedBlockedDomain === d && !retractUrl) return;
    reportedBlockedDomain = d;

    // Apart from the retraction, only the bare domain is sent. No URL that was
    // not already stored, no title, no page content.
    send({ type: "TAB_BLOCKED", domain: d, retractUrl: retractUrl || undefined });
  }

  function getSearchQuery() {
    const params = new URLSearchParams(location.search);
    const q = params.get("q") || params.get("query") || params.get("search");
    if (!q) return null;
    const trimmed = q.trim().slice(0, 200);
    if (!trimmed) return null;
    // A search box is a confessional. Drop anything that reads like a secret or
    // that would itself be blocked as a title.
    if (PRIVACY.textLooksSecret(trimmed)) return null;
    if (PRIVACY.titleIsSensitive(trimmed)) return null;
    return trimmed;
  }

  function getPageSummary() {
    const meta = document.querySelector('meta[name="description"]');
    const fromMeta = meta && meta.getAttribute("content");
    const raw = fromMeta || textOfFirstParagraph();
    if (!raw) return null;
    const text = raw.trim().slice(0, 300);
    return PRIVACY.textLooksSecret(text) ? null : text;
  }

  function textOfFirstParagraph() {
    const p = document.querySelector("article p, main p, p");
    return p && p.textContent ? p.textContent : null;
  }

  function currentScrollDepth() {
    const el = document.documentElement;
    const scrolled = el.scrollTop || document.body.scrollTop || 0;
    const height = el.scrollHeight - el.clientHeight;
    if (height <= 0) return 100; // whole page fits on screen — you saw all of it
    return Math.max(0, Math.min(100, Math.round((scrolled / height) * 100)));
  }

  function noteScroll() {
    maxScroll = Math.max(maxScroll, currentScrollDepth());
  }

  // Elapsed foreground seconds since the last flush, then reset the clock so no
  // interval is ever counted twice.
  function consumeElapsed() {
    if (!visible) return 0;
    const seconds = Math.round((Date.now() - segmentStart) / 1000);
    segmentStart = Date.now();
    return Math.max(0, seconds);
  }

  function flush(type) {
    const seconds = consumeElapsed();
    if (type === "PAGE_HEARTBEAT" && seconds <= 0) return;
    send({
      type,
      url: currentUrl,
      timeSpent: seconds,
      scrollDepth: maxScroll,
    });
  }

  function capturePageVisit() {
    send({
      type: "PAGE_VISIT",
      url: location.href,
      domain: domain(),
      title: document.title,
      summary: getPageSummary(),
      searchQuery: getSearchQuery(),
      timestamp: Date.now(),
    });
  }

  function beat() {
    if (blocked || !visible) return;
    // Re-gate on every beat: an SPA may have opened a login modal since the
    // last check without changing the URL.
    if (isBlocked()) {
      stopTracking();
      return;
    }
    flush("PAGE_HEARTBEAT");
  }

  function startHeartbeat() {
    if (heartbeatTimer) return;
    noteScroll();
    firstBeatTimer = setTimeout(beat, FIRST_BEAT_MS);
    heartbeatTimer = setInterval(() => {
      beat();
    }, HEARTBEAT_MS);
  }

  function stopTracking() {
    blocked = true;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (firstBeatTimer) {
      clearTimeout(firstBeatTimer);
      firstBeatTimer = null;
    }
    reportBlocked();
  }

  // A URL change inside a single-page app is a new page: close the old one out
  // and re-run the privacy gate before capturing the new one.
  function handleUrlChange() {
    if (location.href === currentUrl) return;
    if (!blocked) flush("PAGE_LEAVE");
    currentUrl = location.href;
    capturedUrl = null;
    segmentStart = Date.now();
    maxScroll = 0; // a new page in an SPA starts its own scroll measurement
    reportedBlockedDomain = null;
    blocked = false;
    evaluateAndCapture();
  }

  function evaluateAndCapture() {
    if (isBlocked()) {
      stopTracking();
      return;
    }
    blocked = false;
    capturePageVisit();
    capturedUrl = location.href;
    startHeartbeat();
  }

  function attachListeners() {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (!blocked) flush("PAGE_LEAVE");
        visible = false;
      } else {
        visible = true;
        segmentStart = Date.now();
        // Coming back to a tab is a good moment to re-check: the page may have
        // changed underneath while it was in the background.
        if (!blocked && isBlocked()) stopTracking();
      }
    });

    // pagehide is delivered reliably, including for bfcache navigations, which
    // beforeunload alone is not.
    window.addEventListener("pagehide", () => {
      if (!blocked) flush("PAGE_LEAVE");
    });

    // Passive so it never delays the page's own scrolling.
    window.addEventListener("scroll", noteScroll, { passive: true });

    document.addEventListener("mouseup", onSelection, true);
    document.addEventListener("keyup", (e) => {
      // Keyboard selection (shift+arrows, ctrl/cmd+A) counts the same as a drag.
      if (e.shiftKey || e.ctrlKey || e.metaKey) onSelection();
    });

    // SPA route changes. popstate and hashchange are window events and do reach
    // this isolated world, but history.pushState does not: patching it here
    // would only ever see calls made by the extension itself, never the page's.
    // So the URL is polled instead. One string comparison a second is cheaper
    // than missing a navigation into /account/transactions.
    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("hashchange", handleUrlChange);
    setInterval(handleUrlChange, URL_POLL_MS);

    // Blocklist edits in the popup take effect on the next capture without an
    // extension reload — and pausing takes effect immediately.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.customBlocklist) {
        settings.customBlocklist = changes.customBlocklist.newValue || [];
      }
      if (changes.captureHighlights) {
        settings.captureHighlights = changes.captureHighlights.newValue !== false;
      }
      if (changes.trackingPaused) {
        settings.trackingPaused = changes.trackingPaused.newValue === true;
      }
      if (!blocked && isBlocked()) stopTracking();
    });
  }

  function onSelection() {
    if (blocked || !settings.captureHighlights) return;
    const selection = window.getSelection();
    if (!selection) return;
    const text = selection.toString().trim();
    if (text.length < MIN_HIGHLIGHT_CHARS) return;

    // The page passed the gate, but this particular selection still might not:
    // a card number or an API key on an otherwise ordinary page.
    if (PRIVACY.textLooksSecret(text)) return;
    // And re-gate the page itself — the selection may be inside a form that
    // appeared since the last check.
    if (isBlocked()) {
      stopTracking();
      return;
    }

    send({
      type: "TEXT_HIGHLIGHTED",
      text: text.slice(0, MAX_HIGHLIGHT_CHARS),
      url: currentUrl,
      title: document.title,
    });
  }

  chrome.storage.local.get(
    ["customBlocklist", "captureHighlights", "trackingPaused"],
    (result) => {
      settings = {
        customBlocklist: result.customBlocklist || [],
        captureHighlights: result.captureHighlights !== false,
        trackingPaused: result.trackingPaused === true,
      };

      attachListeners();
      evaluateAndCapture();

      // Second look once the page has had a moment to render. Plenty of sites
      // mount their login form well after document_idle.
      setTimeout(() => {
        if (!blocked && isBlocked()) stopTracking();
      }, LATE_RECHECK_MS);
    }
  );
})();
