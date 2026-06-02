// content.js — injected into every page
// Runs privacy check first, then captures page signals

(function () {
  "use strict";

  const SENSITIVE_URL_PATTERNS = [
    "login", "signin", "sign-in", "auth", "logout", "password",
    "reset-password", "checkout", "payment", "billing", "invoice",
    "receipt", "oauth", "callback?code=",
  ];

  const SENSITIVE_DOMAINS = [
    "paypal.com", "stripe.com", "chase.com", "bankofamerica.com",
    "rbcroyalbank.com", "td.com", "scotiabank.com", "cibc.com",
    "bmo.com", "mail.google.com", "outlook.live.com",
  ];

  const SENSITIVE_SELECTORS = [
    'input[type="password"]',
    'input[autocomplete="cc-number"]',
    'input[autocomplete="current-password"]',
  ];

  function currentDomain() {
    return location.hostname.replace(/^www\./, "");
  }

  function urlMatchesSensitivePattern(url) {
    const lower = url.toLowerCase();
    return SENSITIVE_URL_PATTERNS.some((p) => lower.includes(p));
  }

  function domainIsSensitive(domain) {
    return SENSITIVE_DOMAINS.some(
      (d) => domain === d || domain.endsWith("." + d)
    );
  }

  function pageHasSensitiveFields() {
    return SENSITIVE_SELECTORS.some((sel) => document.querySelector(sel) !== null);
  }

  function checkPrivacy(customBlocklist) {
    const domain = currentDomain();
    const url = location.href;

    if (urlMatchesSensitivePattern(url)) return true;
    if (domainIsSensitive(domain)) return true;
    if (pageHasSensitiveFields()) return true;
    if (customBlocklist && customBlocklist.includes(domain)) return true;

    return false;
  }

  function getSearchQuery() {
    const params = new URLSearchParams(location.search);
    return params.get("q") || params.get("query") || params.get("search") || null;
  }

  function getPageSummary() {
    const meta = document.querySelector('meta[name="description"]');
    if (meta && meta.getAttribute("content")) {
      return meta.getAttribute("content").slice(0, 300);
    }
    const p = document.querySelector("article p, main p, p");
    if (p && p.textContent) {
      return p.textContent.trim().slice(0, 300);
    }
    return null;
  }

  let pageStartTime = Date.now();
  let isVisible = !document.hidden;

  // Get custom blocklist then run main logic
  chrome.storage.local.get(["customBlocklist"], (result) => {
    const customBlocklist = result.customBlocklist || [];
    const isBlocked = checkPrivacy(customBlocklist);

    if (isBlocked) {
      chrome.runtime.sendMessage({
        type: "TAB_BLOCKED",
        domain: currentDomain(),
      });
      return;
    }

    // Send PAGE_VISIT
    chrome.runtime.sendMessage({
      type: "PAGE_VISIT",
      url: location.href,
      domain: currentDomain(),
      title: document.title,
      summary: getPageSummary(),
      searchQuery: getSearchQuery(),
      timestamp: Date.now(),
    });

    // Track visibility and time
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        const timeSpent = Math.round((Date.now() - pageStartTime) / 1000);
        chrome.runtime.sendMessage({
          type: "PAGE_LEAVE",
          timeSpent,
          scrollDepth: getScrollDepth(),
          lastHighlight: lastHighlight,
        });
        isVisible = false;
      } else {
        pageStartTime = Date.now();
        isVisible = true;
      }
    });

    // Scroll depth
    function getScrollDepth() {
      const el = document.documentElement;
      const scrolled = el.scrollTop || document.body.scrollTop;
      const height = el.scrollHeight - el.clientHeight;
      if (height <= 0) return 100;
      return Math.min(100, Math.round((scrolled / height) * 100));
    }

    // Text highlight tracking
    let lastHighlight = null;
    document.addEventListener("mouseup", () => {
      const selection = window.getSelection();
      if (!selection) return;
      const text = selection.toString().trim();
      if (text.length < 20) return;
      const capped = text.slice(0, 500);
      lastHighlight = capped;
      chrome.runtime.sendMessage({
        type: "TEXT_HIGHLIGHTED",
        text: capped,
        url: location.href,
        title: document.title,
      });
    });

    // Send PAGE_LEAVE on beforeunload
    window.addEventListener("beforeunload", () => {
      const timeSpent = Math.round((Date.now() - pageStartTime) / 1000);
      chrome.runtime.sendMessage({
        type: "PAGE_LEAVE",
        timeSpent,
        scrollDepth: getScrollDepth(),
        lastHighlight: lastHighlight,
      });
    });
  });
})();
