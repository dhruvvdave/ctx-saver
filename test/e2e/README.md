# End-to-end suite

These run **real Chromium with the extension loaded** — not jsdom, not mocks.
They are the tests behind the manual-pass results reported for version 1.0.1.

```bash
npm install                        # once
npx playwright install chromium    # once
./test/e2e/run.sh                  # suites 1, 3, 4, 6
./test/e2e/run.sh all              # plus 2 (needs a display) and 5 (needs the backend)
```

A local fixture server on `127.0.0.1:8099` serves `fixtures/`, which contains
pages engineered to trip each privacy rule: a `/login` URL, a page with a
password field, a health-record title, a tax title, a single-page app that
routes to `/account/transactions`, and a page that grows a password field 1.2
seconds after load.

| Suite | Covers |
|---|---|
| `01-tracking-and-privacy` | Page tracking across tabs, time, scroll depth, search capture; every blocking rule; retroactive blocking; highlight secret filter; popup rendering; 380px overflow; bundled font loading |
| `02-time-and-scroll` | Foreground time accrual and peak scroll depth. **Needs a display** — headless Chromium never fires `visibilitychange`, so tab-switch flushes cannot be exercised without one |
| `03-worker-lifecycle` | Alarm period and the rescheduling-starvation regression; alarm firing; service-worker termination via CDP; full browser restart |
| `04-popup-actions` | Discard vs. Save (the two reported bugs), clear-history scoping, blocklist add/remove taking effect on next load, pause and highlight switches |
| `05-backend-parity` | Behaviour with the optional backend running. **Needs** `npm run backend` |
| `06-packaged-build` | The actual store zip, unpacked onto a clean profile: manifest, permissions, popup, fonts, no console errors |

## Notes

- Suite 03 reads `chrome.storage` and `chrome.alarms` through an **extension
  page** rather than the service-worker handle, because Playwright's worker
  handles do not survive a termination.
- The favicon service (`google.com/s2/favicons`) is unreachable from some
  sandboxes. That is not a failure: the suites assert the lettered-tile
  fallback, and network errors are filtered from the console-error checks.
