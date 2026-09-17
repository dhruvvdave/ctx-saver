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

The Chrome extension works entirely on its own. The backend and CLI shown below
are optional extras for reading the same sessions from a terminal.

---

## Architecture

The extension is the product. Everything below the dashed line is optional and
exists only so the same sessions can be read from a terminal.

```
Chrome Extension (Manifest V3, vanilla JS, no build step)
  │  privacy gate → capture → chrome.storage.local
  │  ← this alone is a complete, working extension
  ╵ - - - - - - - - - - - - - - - - - - - - - - - - - -
  ↓ optional fire-and-forget POST to localhost:7331
Local Backend (TypeScript + Node + Hono)
  ↓ stores in
SQLite database (~/.ctx/sessions.db)
  ↓ served to
CLI tool (ctx resume / ctx sessions / ctx clear)
```

If the backend is not running the POST fails silently and nothing changes. The
extension never needs it.

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

Full detail is in **[PRIVACY.md](PRIVACY.md)**, which is also the text behind the
Chrome Web Store privacy policy field. In short, the extension runs a privacy
check **before reading anything** from a page, and repeats it continuously:

- **301 explicit domains** — webmail, messaging apps, 97 banks and brokerages,
  49 payment processors and crypto exchanges, health and pharmacy, government
  and tax filing, password managers
- **11 hostname patterns** — any government domain worldwide, `mail.*`,
  `secure.*`, `login.*`, online banking subdomains, credit unions, patient
  portals, payroll systems
- **91 URL keywords** — `/login`, `/checkout`, `/account/transactions`,
  `/tax-return`, plus any auth token or session id in the query string
- **25 page-title phrases** — lab results, prescription histories, tax returns,
  passport applications: sensitive pages that sit on unremarkable domains
- **18 form signals** — a password field, a card field or a payment iframe
  blocks the page whatever else matched
- **Your own blocklist** — added in the popup's Privacy tab, effective on the
  next page load

The check does not run once at load and stop. A login form mounted by
JavaScript after the page settles, or a single-page app routing to
`/account/transactions`, is caught too — **and if the page had already been
recorded, that record is deleted.**

Blocked pages are logged as `🔒 private — domain.com`: the bare domain, and
nothing else. No URL, no title, no content.

All the rules live in one file, [`packages/extension/privacy-rules.js`](packages/extension/privacy-rules.js),
which is loaded by both the content script and the popup — so the Privacy tab
describes the rules that actually run rather than a copy that drifts.

### Highlighted text

Text you select is saved on any page that is **not** blocked, including sites on
no blocklist at all. That is deliberate, and the Privacy tab says so in those
words. Selections that look like a card number, an API key, a JWT or an email
address are dropped, and the whole behaviour has an off switch.

### Controls

The popup's Privacy tab carries four switches: pause all tracking, save
highlighted text, load site icons from Google (the only third-party request the
extension makes), and your custom blocklist.

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
│   └── extension/      ← Chrome MV3 extension (ships on its own)
│       ├── manifest.json
│       ├── privacy-rules.js ← the blocklist, shared by content script + popup
│       ├── background.js    ← session manager service worker
│       ├── content.js       ← privacy gate + page capture
│       ├── icons/
│       └── popup/
│           ├── popup.html
│           ├── popup.css
│           ├── popup.js
│           └── fonts/       ← bundled woff2, no network call at open time
├── store/              ← Chrome Web Store artifacts
│   ├── LISTING.md          ← listing copy, permission justifications, disclosures
│   ├── build-zip.sh        ← builds the upload artifact from packages/extension only
│   └── screenshot-*.png    ← 1280x800 store screenshots
├── PRIVACY.md          ← privacy policy (source for the store field)
├── LICENSE             ← MIT
└── package.json        ← npm workspaces root
```

---

## Packaging for the Chrome Web Store

```bash
./store/build-zip.sh
```

Zips `packages/extension/` only — not the monorepo — to
`store/ctx-extension-<version>.zip`. There is no build step: the zip contains
exactly the source you can read in this repo.

Listing copy, the single-purpose statement, permission justifications and the
Privacy Practices answers are all in [`store/LISTING.md`](store/LISTING.md).

---

## License

MIT — see [LICENSE](LICENSE).

The bundled fonts in `packages/extension/popup/fonts/` are licensed separately
under the SIL Open Font License 1.1.
