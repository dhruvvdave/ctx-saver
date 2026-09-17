# ctx — Privacy Policy

**Last updated: 17 September 2026 · Applies to ctx — context saver, version 1.0.1**

ctx records what you were working on in your browser so you can pick it up
again later. It does that entirely on your own computer.

**ctx does not transmit your data anywhere. There is no ctx server, no account,
no sign-in, no analytics, and no telemetry. Nothing you browse is sent to the
developer or to any third party.**

---

## What ctx collects

All of the following is written to your browser's local extension storage
(`chrome.storage.local`) on your own machine, and nowhere else.

| Category | What is stored |
|---|---|
| **Browsing activity** | For each page you spend time on: page URL, page title, the page's own `<meta name="description">` (or its first paragraph, up to 300 characters), the domain, seconds spent with the page in the foreground, the furthest scroll depth reached, and the time of first visit. |
| **Search terms** | The `q`, `query` or `search` parameter from URLs you visit, so a session can show what you were looking up. |
| **User-selected content** | Text you select on a page, if it is longer than 20 characters, truncated to 500 characters. See **Highlighted text** below. |
| **Blocked-domain names** | For pages ctx refuses to read, only the bare domain (for example `chase.com`) is recorded, so the popup can show that something was deliberately skipped. No URL, no title, no page content. |
| **Your settings** | Your custom blocklist, and whether highlight capture, site icons and tracking are switched on. |

### What ctx never collects

- Passwords, payment card details, or anything typed into a form.
- Page content in general. ctx reads a page's title and its own description
  meta tag; it does not read, copy or index the body of a page.
- Cookies, browsing history from before ctx was installed, bookmarks, downloads,
  or files on your computer.
- Your name, email address, IP address, device identifiers, or location.
- Anything at all from a page that matches the privacy rules below.

---

## Pages ctx refuses to look at

Before ctx reads anything from a page, that page is checked against a set of
rules. If any rule matches, ctx stops: nothing about that page is recorded
except the bare domain name. The check is repeated while you stay on the page,
so a login form that appears after the page has loaded, or a single-page app
that navigates to a sensitive route, is caught too. **If ctx had already
recorded a page when it became sensitive, that record is deleted.**

As of version 1.0.1 the rules are:

- **301 explicit domains** across seven groups — webmail (30), messaging apps
  (29), banks and brokerages (97), payment processors and crypto exchanges (49),
  health and pharmacy (36), government and tax filing (38), and sign-in pages
  and password managers (22).
- **11 hostname patterns** covering the long tail no fixed list can reach: any
  government domain worldwide (`.gov`, `.gov.uk`, `.gc.ca`, `.govt.nz` and
  similar), `mail.*` and `webmail.*`, `secure.*`, `login.*`, `sso.*`, online
  banking subdomains, credit unions, patient portals, and payroll systems.
- **91 URL keywords** — `/login`, `/checkout`, `/account/transactions`,
  `/tax-return`, `/lab-results` and so on — plus any URL carrying an
  authentication token, session id, API key or one-time code in its query string.
- **25 page-title phrases** for pages that sit on ordinary domains but are
  plainly sensitive: patient portals, lab results, prescription histories, tax
  returns, passport and visa applications, social security statements, benefit
  claims, bank statements.
- **18 form signals** — a password field, a credit-card field, a one-time-code
  field, or an embedded payment iframe blocks the page no matter what else
  matched.
- **Your own blocklist**, added from the popup's Privacy tab. Entries cover
  subdomains and take effect on the next page you load.

These rules err toward blocking. A page that is merely *about* tax or banking
may be skipped; ctx treats a missed page as much cheaper than a leaked one.

You can also switch off all capture entirely with **Pause all tracking** in the
Privacy tab.

### Highlighted text

Text you select is saved on any page that is **not** blocked by the rules above
— including sites that are not on any blocklist. This is deliberate: recalling
the passage you were reading is a main reason the extension exists. Two things
limit it:

1. Selections that look like a credit-card number, a national insurance or
   social security number, an IBAN, an API key, a JWT, a private key or an
   email address are discarded and never stored.
2. You can turn the whole behaviour off with **Save text you highlight** in the
   Privacy tab. The setting takes effect immediately.

---

## Where your data is stored, and for how long

Everything lives in `chrome.storage.local`, in your Chrome profile, on your
computer. ctx keeps the **50 most recent sessions** and discards older ones
automatically. It also trims the history if its storage grows past roughly 8 MB.

To delete data:

- **Clear all** on the popup's Sessions tab deletes every saved session.
- **Discard** on the popup deletes the session currently in progress without
  saving it.
- Removing the extension from Chrome deletes all of its stored data.

---

## Network connections

ctx makes exactly one kind of network request, and only to your own machine:

> `POST http://localhost:7331/api/sessions`

This is the **optional** ctx backend — a separate program you would have to
install and start yourself, which stores sessions in a SQLite file at
`~/.ctx/sessions.db` so the `ctx resume` terminal command can read them. It runs
on your computer. `localhost` never leaves the machine.

If that backend is not running — which is the default, since it does not ship
with the extension — the request fails silently and the extension carries on
unchanged. The extension is fully functional without it.

The popup also loads site icons from `https://www.google.com/s2/favicons`, which
sends Google the domain names shown in your session list. This is the only
request ctx makes to anyone other than your own machine, and you can switch it
off: **Load site icons from Google** in the Privacy tab. With it off — or simply
offline — each row falls back to a lettered tile and nothing else changes.

Beyond those, ctx contacts no server. The extension's host permissions are
limited to `http://localhost:7331` and `http://127.0.0.1:7331` precisely so it
*cannot* reach anywhere else.

---

## Permissions, and why each one is needed

| Permission | Why |
|---|---|
| `storage` | To save your sessions and settings on your machine. This is where all the data lives. |
| `alarms` | To wake the extension every five minutes to file the session in progress, so your work is not lost if the browser closes. |
| `unlimitedStorage` | To keep a 50-session history without hitting Chrome's default 10 MB cap on a heavy browsing day. |
| Content scripts on `http://*/*` and `https://*/*` | ctx cannot know in advance which sites you will work on, so it has to be able to run its privacy check and time a page on any site. The script's first action on every page is the privacy check described above. |
| `http://localhost:7331` host access | The optional local backend described under **Network connections**. |

ctx does **not** request the `tabs`, `activeTab`, `scripting`, `history`,
`cookies`, `webRequest` or `downloads` permissions.

---

## Chrome Web Store data disclosures

For the Privacy Practices form, ctx declares:

- **Web history** — collected. Stored locally on the user's device only.
- **User activity** — collected (time on page, scroll depth). Stored locally on
  the user's device only.
- **Website content** — collected (page titles, meta descriptions, and text the
  user selects). Stored locally on the user's device only.
- **Personally identifiable information** — not collected.
- **Health information** — not collected; pages that appear to be health records
  are explicitly blocked.
- **Financial and payment information** — not collected; banking, payment and
  checkout pages are explicitly blocked.
- **Authentication information** — not collected; login pages and any page with
  a password field are explicitly blocked.
- **Personal communications** — not collected; webmail and messaging apps are
  explicitly blocked.
- **Location** — not collected.

And confirms:

- ctx does **not** sell or transfer user data to third parties.
- ctx does **not** use or transfer user data for any purpose unrelated to its
  single purpose.
- ctx does **not** use or transfer user data to determine creditworthiness or
  for lending purposes.

---

## Changes

Any change to what ctx collects will be reflected here and in the version
history before it ships.

## Contact

Questions or a privacy report: open an issue at
<https://github.com/dhruvvdave/ctx-saver/issues>.
