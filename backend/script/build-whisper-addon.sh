#!/usr/bin/env bash
# Build whisper.cpp Node addon (N-API) → whisper.cpp/build/Release/addon.node
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADDON_DIR="$ROOT/whisper.cpp/examples/addon.node"
OUT="$ROOT/whisper.cpp/build/Release/addon.node"

if [[ -f "$OUT" ]]; then
  echo "Addon already present: $OUT ($(du -h "$OUT" | cut -f1))"
  echo "Rebuild with: FORCE=1 bash script/build-whisper-addon.sh"
  if [[ "${FORCE:-}" != "1" ]]; then
    exit 0
  fi
fi

echo "Installing addon build deps…"
(cd "$ADDON_DIR" && bun install)

echo "Compiling addon.node (this may take a minute)…"
(
  cd "$ROOT/whisper.cpp"
  ./examples/addon.node/node_modules/.bin/cmake-js compile -T addon.node -B Release
)

ls -lah "$OUT"
echo "Done."
