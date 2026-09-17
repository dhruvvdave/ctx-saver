#!/usr/bin/env bash
# Runs the ctx end-to-end suite against real Chromium with the extension loaded.
#
#   ./test/e2e/run.sh            # suites 1, 3, 4, 6
#   ./test/e2e/run.sh all        # also 2 (needs a display) and 5 (needs the backend)
#
# Requires: npm install (playwright), and `npx playwright install chromium` once.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PORT="${CTX_PORT:-8099}"
FAILED=0

cleanup() { [[ -n "${SITE_PID:-}" ]] && kill "$SITE_PID" 2>/dev/null; }
trap cleanup EXIT

# Browser profiles persist chrome.storage between runs, which makes any
# assertion on absolute counts flaky. Start every run from nothing.
rm -rf "$HERE/.profiles"
mkdir -p "$HERE/.profiles"

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$HERE/fixtures" >/dev/null 2>&1 &
SITE_PID=$!
sleep 1

run() { echo; echo "───── $1 ─────"; node "$HERE/$1" || FAILED=1; }

run 01-tracking-and-privacy.mjs
run 03-worker-lifecycle.mjs
run 04-popup-actions.mjs

# 06 exercises the actual upload artifact, so build and unpack it first.
"$ROOT/store/build-zip.sh" >/dev/null
VERSION="$(node -p "require('$ROOT/packages/extension/manifest.json').version")"
mkdir -p "$HERE/.profiles/unpacked"
unzip -q "$ROOT/store/ctx-extension-$VERSION.zip" -d "$HERE/.profiles/unpacked"
run 06-packaged-build.mjs

if [[ "${1:-}" == "all" ]]; then
  # 02 needs a real display: visibilitychange never fires headless.
  echo; echo "───── 02-time-and-scroll.mjs (needs a display) ─────"
  if command -v xvfb-run >/dev/null; then
    xvfb-run -a --server-args="-screen 0 1280x900x24" node "$HERE/02-time-and-scroll.mjs" || FAILED=1
  else
    node "$HERE/02-time-and-scroll.mjs" || FAILED=1
  fi
  # 05 needs the optional backend on :7331.
  if curl -sS -m 2 -o /dev/null http://127.0.0.1:7331/; then
    run 05-backend-parity.mjs
  else
    echo; echo "───── 05-backend-parity.mjs SKIPPED (start it with: npm run backend) ─────"
  fi
fi

echo
[[ $FAILED -eq 0 ]] && echo "ALL SUITES PASSED" || echo "SOME SUITES FAILED"
exit $FAILED
