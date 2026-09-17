# Chrome Web Store listing — ctx — context saver

Copy-paste source for the Developer Dashboard. Version **1.0.1**.
Upload artifact: **`store/ctx-extension-1.0.1.zip`** (the contents of
`packages/extension/` only).

---

## Item name

```
ctx — context saver
```

## Category

Productivity → Workflow & Planning

## Language

English (United States)

---

## Short description

*(132 character limit — the text below is 116.)*

```
Remember what you were working on. ctx tracks your browsing sessions entirely on your machine. No cloud, no account.
```

---

## Detailed description

```
You closed the tabs a week ago. What were you actually trying to do?

ctx watches your browsing quietly and, when you come back, tells you what you
were working on: which pages held your attention, how long you spent on each,
how far you read, what you searched for, and the lines you highlighted.

Open the popup and you get three things:

LIVE — the session in progress. Every page you have spent time on, ranked by
time, with a meter showing where your attention actually went, plus scroll
depth so you can tell a page you read from a page you glanced at.

SESSIONS — your recent sessions, each with a one-line summary of what it was
about, the domains involved, and the first thing you highlighted.

PRIVACY — the controls. Your own blocklist, a switch for highlight capture, a
switch for the one third-party request the popup makes (site icons), and a
pause switch that stops everything.

═══════════════════════════════════════════════

EVERYTHING STAYS ON YOUR MACHINE

There is no ctx server. There is no account to create and nothing to sign in
to. Your sessions are written to your browser's local storage on your own
computer and they stay there. No analytics. No telemetry. Nothing is sold,
shared, or transmitted to the developer or anyone else.

═══════════════════════════════════════════════

IT REFUSES TO LOOK AT THE THINGS THAT MATTER

Before ctx reads anything from a page, it checks that page against a privacy
blocklist. If anything matches, ctx stops: only the bare domain is recorded, so
you can see that something was skipped, with no URL, no title and no content.

Version 1.0.1 blocks:

• 301 domains — webmail, WhatsApp, Slack, Discord, Telegram, 97 banks and
  brokerages, 49 payment processors and crypto exchanges, health and pharmacy
  sites, government and tax-filing portals, and password managers
• Any government domain worldwide, plus mail.*, secure.*, login.*, online
  banking subdomains, credit unions and patient portals
• 91 URL keywords — /login, /checkout, /account/transactions, /tax-return — and
  any URL carrying an auth token or session id
• 25 page-title phrases, so a lab result or a tax return on an ordinary domain
  is caught by what the page calls itself
• Any page with a password field, a card field or a payment iframe

The check runs continuously, not just once. A login form that appears after the
page loads, or an app that navigates to a sensitive route, is caught too — and
if ctx had already recorded that page, the record is deleted.

Add your own domains in the Privacy tab. They apply on the next page you load.

═══════════════════════════════════════════════

ABOUT HIGHLIGHTED TEXT — read this bit

Text you select is saved on any page that is not blocked, including sites that
are on no blocklist at all. That is deliberate: getting back the passage you
were reading is half the point of the extension. Selections that look like a
card number, an API key, a JWT or an email address are always dropped, and you
can switch the whole behaviour off in the Privacy tab.

We would rather tell you this plainly here than have you find it later.

═══════════════════════════════════════════════

OPTIONAL: THE TERMINAL COMMAND

ctx has a companion command-line tool that prints your last session in a
terminal:

  $ ctx resume

This is NOT part of the extension and is NOT required. The extension is fully
functional on its own. The CLI is a separate open-source npm package that runs
a small backend on your own computer (localhost:7331), which the extension will
hand sessions to if — and only if — it happens to be running. If it is not, the
extension behaves identically.

Both live at https://github.com/dhruvvdave/ctx-saver

═══════════════════════════════════════════════

OPEN SOURCE

MIT licensed. Vanilla JavaScript, no build step, no bundled dependencies — the
source you review is the code that runs.

https://github.com/dhruvvdave/ctx-saver
```

---

## Single purpose description

*(Required field. Chrome Web Store: "An extension must have a single purpose
that is narrow and easy to understand.")*

```
ctx has one purpose: to record the pages you spend time on during a browsing
session and show them back to you afterwards, so you can resume the work you
were doing. It does nothing else.
```

---

## Permission justifications

### Host permission justification — content scripts on `http://*/*` and `https://*/*`

*(This is the broad host access reviewers ask about. Paste this into the
"Host permission justification" field.)*

```
ctx measures how long you spend on a page and how far you read it. Both are
properties of the page itself, so a content script has to run on the page.

A user's work is spread across sites we cannot know in advance — documentation,
issue trackers, forums, internal tools on private hostnames. Restricting the
match pattern to a fixed list would mean the extension silently fails to record
exactly the pages a given user cares about, which is its entire function. There
is no narrower pattern that delivers the feature.

Critically, broad injection is what makes the privacy guarantee possible rather
than undermining it. The content script's first action on every page, before it
reads anything, is to check that page against a blocklist of 301 sensitive
domains, 11 hostname patterns, 91 URL keywords, 25 page-title phrases and 18
form signals. If any match, the script records only the bare domain and reads
nothing else. That check cannot happen on a page the extension was never
allowed to run on.

The script reads only: the page title, the page's own meta description tag,
elapsed foreground time, scroll depth, and text the user deliberately selects.
It does not read page bodies, form inputs, cookies or credentials.

All of it is stored in chrome.storage.local on the user's own machine. Nothing
is transmitted anywhere.
```

### `storage`

```
Stores the user's sessions and settings on their own machine. This is the only
place ctx keeps data; there is no server.
```

### `alarms`

```
Wakes the extension every five minutes to file the session in progress, so a
user's work is preserved if the browser closes unexpectedly. Manifest V3
service workers are terminated when idle, so a periodic alarm is the only
reliable way to do this.
```

### `unlimitedStorage`

```
ctx keeps a rolling history of the 50 most recent sessions. On a heavy browsing
day this can exceed Chrome's default 10 MB local storage cap, which would cause
writes to fail and lose a user's session. The extension enforces its own caps
and trims history past roughly 8 MB.
```

### `http://localhost:7331/` host permission

```
Optional integration with a local companion program the user installs
separately, which stores sessions in a SQLite file so they can be read from a
terminal. The request goes to the user's own computer and never leaves it. If
the program is not running the request fails silently and the extension is
unaffected. Host access is scoped to this one local port precisely so the
extension cannot reach any other origin.
```

---

## Privacy Practices form

| Field | Answer |
|---|---|
| Does your extension collect **web history**? | **Yes** — page URLs and titles of pages visited. Stored locally on the user's device only. |
| Does it collect **user activity**? | **Yes** — time spent on a page and scroll depth. Stored locally on the user's device only. |
| Does it collect **website content**? | **Yes** — page titles, page meta descriptions, and text the user selects. Stored locally on the user's device only. |
| Personally identifiable information? | **No** |
| Health information? | **No** — pages that appear to be health records are explicitly blocked. |
| Financial and payment information? | **No** — banking, payment and checkout pages are explicitly blocked. |
| Authentication information? | **No** — login pages and any page with a password field are explicitly blocked. |
| Personal communications? | **No** — webmail and messaging apps are explicitly blocked. |
| Location? | **No** |

Certifications (all three must be checked):

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:**

```
https://github.com/dhruvvdave/ctx-saver/blob/main/PRIVACY.md
```

---

## Assets

| Asset | Requirement | File |
|---|---|---|
| Store icon | 128×128 PNG | `packages/extension/icons/icon128.png` |
| Screenshot 1 | 1280×800 | `store/screenshot-1-live.png` |
| Screenshot 2 | 1280×800 | `store/screenshot-2-sessions.png` |
| Screenshot 3 | 1280×800 | `store/screenshot-3-privacy.png` |

Small promo tile (440×280) and marquee (1400×560) are optional and not supplied.

---

## Support / homepage URL

```
https://github.com/dhruvvdave/ctx-saver
```
