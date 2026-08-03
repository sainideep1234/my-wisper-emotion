#!/usr/bin/env bash
# Ensure naudiodon links against an arm64 PortAudio on Apple Silicon.
# Optional: ELECTRON_VERSION=43.2.0 rebuilds packages/engine/node_modules for Electron ABI.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BREW_PA="/opt/homebrew/lib/libportaudio.dylib"

if [[ "$(uname -s)" != "Darwin" ]] || [[ "$(uname -m)" != "arm64" ]]; then
  exit 0
fi

if [[ ! -f "$BREW_PA" ]]; then
  echo "note: install PortAudio for mic capture: brew install portaudio"
  exit 0
fi

rebuild_native() {
  local PKG_DIR="$1"
  shift || true
  if [[ ! -d "$PKG_DIR" ]]; then
    return 0
  fi
  (
    cd "$PKG_DIR"
    if [[ $# -gt 0 ]]; then
      npx --yes node-gyp rebuild "$@"
    else
      npx --yes node-gyp rebuild
    fi
  ) >/dev/null
  echo "native: rebuilt $(basename "$PKG_DIR") at $PKG_DIR${*:+ ($*)}"
}

rebuild_naudiodon() {
  local NAUDIODON="$1"
  shift || true
  if [[ ! -d "$NAUDIODON" ]]; then
    return 0
  fi
  mkdir -p "$NAUDIODON/portaudio/bin"
  cp "$BREW_PA" "$NAUDIODON/portaudio/bin/libportaudio.dylib"
  rebuild_native "$NAUDIODON" "$@"
}

# Root install: Node ABI (CLI / bun start / test:dictation)
rebuild_native "$ROOT/node_modules/segfault-handler"
rebuild_naudiodon "$ROOT/node_modules/naudiodon"

# Resolve Electron version for ABI-matched rebuilds
EV="${ELECTRON_VERSION:-}"
if [[ -z "$EV" && -f "$ROOT/packages/desktop/node_modules/electron/package.json" ]]; then
  EV="$(node -p "require('$ROOT/packages/desktop/node_modules/electron/package.json').version")"
fi

ELECTRON_GYP=(--target="$EV" --arch=arm64 --dist-url=https://electronjs.org/headers)

rebuild_for_electron() {
  local DIR="$1"
  if [[ -z "$EV" || ! -d "$DIR" ]]; then
    return 0
  fi
  if [[ "$(basename "$DIR")" == "naudiodon" ]]; then
    rebuild_naudiodon "$DIR" "${ELECTRON_GYP[@]}"
  else
    rebuild_native "$DIR" "${ELECTRON_GYP[@]}"
  fi
}

# Electron needs segfault-handler + naudiodon rebuilt for its ABI (not Node's)
rebuild_for_electron "$ROOT/packages/desktop/node_modules/segfault-handler"
rebuild_for_electron "$ROOT/packages/desktop/node_modules/naudiodon"
rebuild_for_electron "$ROOT/packages/engine/node_modules/segfault-handler"
rebuild_for_electron "$ROOT/packages/engine/node_modules/naudiodon"
