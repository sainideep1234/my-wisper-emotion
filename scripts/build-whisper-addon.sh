#!/usr/bin/env bash
# Build whisper.cpp Node addon (N-API) → whisper.cpp/build/Release/addon.node
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WHISPER_DIR="$ROOT/whisper.cpp"
ADDON_SOURCE="$ROOT/packages/whisper-addon"
ADDON_DIR="$WHISPER_DIR/examples/addon.node"
OUT="$WHISPER_DIR/build/Release/addon.node"

if [[ -f "$OUT" ]]; then
  echo "Addon already present: $OUT ($(du -h "$OUT" | cut -f1))"
  echo "Rebuild with: FORCE=1 bash script/build-whisper-addon.sh"
  if [[ "${FORCE:-}" != "1" ]]; then
    exit 0
  fi
fi

if [[ ! -d "$WHISPER_DIR/.git" ]]; then
  echo "Cloning whisper.cpp..."
  rm -rf "$WHISPER_DIR"
  git clone https://github.com/ggerganov/whisper.cpp.git "$WHISPER_DIR"
fi

echo "Injecting addon source code..."
mkdir -p "$ADDON_DIR"
cp -r "$ADDON_SOURCE/"* "$ADDON_DIR/"

echo "Installing addon build deps…"
(cd "$ADDON_DIR" && bun install)

echo "Compiling addon.node (this may take a minute)…"
(
  cd "$WHISPER_DIR"
  ./examples/addon.node/node_modules/.bin/cmake-js compile -T addon.node -B Release
)

ls -lah "$OUT"
echo "Done."
