#!/usr/bin/env bash
# Builds the Chrome Web Store upload artifact from packages/extension/ ONLY.
# No build step, no dependencies — the zip contains exactly the reviewed source.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT="$ROOT/packages/extension"
VERSION="$(node -p "require('$EXT/manifest.json').version")"
OUT="$ROOT/store/ctx-extension-$VERSION.zip"

rm -f "$OUT"
cd "$EXT"
zip -r -q -X "$OUT" . \
  -x '*.DS_Store' -x '__MACOSX/*' -x '*/.*' -x '.*' \
  -x 'popup/fonts/README.md'

echo "built $OUT"
unzip -l "$OUT" | tail -3
