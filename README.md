# ctx — context saver

Stop losing track of what you were doing. `ctx` watches your browser silently, and when you come back it tells you exactly what you were working on.

```
$ ctx resume

ctx · last session 2d ago (47m)

  Active on: stackoverflow.com, github.com · Searched: jwt expiry nodejs · Most time on: Stack Overflow - JWT exp claim (18m)

  Tab                              Time    Scroll
  ──────────────────────────────────────────────
  Stack Overflow - JWT exp claim   18m       82%
  MDN - Date.now() vs Date         12m       45%
  Your GitHub PR #47                9m       60%

  Searched: jwt expiry nodejs · Date.now milliseconds

  Highlights:
  · tokens should be validated against server time, not client
  · exp claim is in seconds, not milliseconds
```

**Everything stays local. No cloud. No accounts. No data leaving your machine.**

---

## Architecture

```
Chrome Extension (Manifest V3)
  ↓ captures tab/page signals over HTTP
Local Backend (TypeScript + Node + Hono, runs at localhost:7331)
  ↓ stores in
SQLite database (~/.ctx/sessions.db)
  ↓ served to
CLI tool (ctx resume / ctx sessions / ctx clear)
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start the backend

```bash
npm run backend
# or: ctx serve (after installing CLI globally)
```

The backend runs on `http://localhost:7331` and stores data in `~/.ctx/sessions.db`.

### 3. Install the Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `packages/extension/` directory

### 4. Install the CLI globally (optional)

```bash
cd packages/cli
npm run build
npm install -g .
```

Then use `ctx` anywhere:

```bash
ctx resume      # show what you were working on
ctx sessions    # list recent sessions
ctx clear       # clear all sessions
ctx serve       # start the backend server
```

---

## Privacy

The extension runs a privacy check **before reading anything** from a page:

- **URL patterns**: login, signin, auth, password, checkout, payment, billing, oauth, etc.
- **Known sensitive domains**: paypal.com, stripe.com, banking sites, webmail
- **DOM inspection**: pages with password fields or credit card inputs are blocked
- **Custom blocklist**: add any domain via the extension popup → Privacy tab

Blocked pages are logged as `[🔒 private — domain.com]` — no content, no title, no URL.

---

## LLM summaries (optional)

By default ctx generates heuristic summaries with no API calls. To use a local Ollama model for richer summaries:

```bash
CTX_USE_LLM=true ctx serve
```

Requires [Ollama](https://ollama.ai) running locally with `llama3.2` or `phi3`. Still fully private.

---

## Tech stack

| Component | Stack |
|-----------|-------|
| Backend | TypeScript, Node.js, Hono, better-sqlite3 |
| CLI | TypeScript, chalk, cli-table3 |
| Extension | Vanilla JS, Manifest V3 |
| Database | SQLite (`~/.ctx/sessions.db`) |

---

## Project structure

```
ctx/
├── packages/
│   ├── backend/        ← Hono server + SQLite
│   │   └── src/
│   │       ├── server.ts   ← routes + main entry
│   │       ├── db.ts       ← SQLite setup
│   │       └── summary.ts  ← heuristic + Ollama summaries
│   ├── cli/            ← ctx resume/sessions/clear/serve
│   │   └── src/
│   │       └── index.ts
│   └── extension/      ← Chrome MV3 extension
│       ├── manifest.json
│       ├── background.js   ← session manager service worker
│       ├── content.js      ← privacy guard + page capture
│       └── popup/
│           ├── popup.html
│           └── popup.js
└── package.json        ← npm workspaces root
```
