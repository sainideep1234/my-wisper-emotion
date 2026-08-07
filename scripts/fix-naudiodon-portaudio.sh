#!/usr/bin/env bash
# Ensure naudiodon links against an arm64 PortAudio on Apple Silicon.
# Optional: ELECTRON_VERSION=43.2.0 rebuilds packages/engine/node_modules for Electron ABI.
#
# STRICT=1 turns every "skip silently" case below into a hard failure. Use this
# for release builds (see release:mac) — a packaged app that silently skipped
# an ABI rebuild ships a native module that crashes on every user's Mac with
# "was compiled against a different Node.js version" (NODE_MODULE_VERSION mismatch).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BREW_PA="/opt/homebrew/lib/libportaudio.dylib"
STRICT="${STRICT:-0}"

fail_or_skip() {
  local msg="$1"
  if [[ "$STRICT" == "1" ]]; then
    echo "error: $msg" >&2
    exit 1
  else
    echo "note: $msg" >&2
  fi
}

if [[ "$(uname -s)" != "Darwin" ]] || [[ "$(uname -m)" != "arm64" ]]; then
  exit 0
fi

if [[ ! -f "$BREW_PA" ]]; then
  fail_or_skip "PortAudio not found — install it with: brew install portaudio"
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

  # Fix linkage so the app works on Macs without Homebrew PortAudio installed
  local NODE_FILE="$NAUDIODON/build/Release/naudiodon.node"
  local BREW_PA_REAL="/opt/homebrew/opt/portaudio/lib/libportaudio.2.dylib"
  if [[ -f "$NODE_FILE" ]] && [[ -f "$BREW_PA_REAL" ]]; then
    cp "$BREW_PA_REAL" "$NAUDIODON/build/Release/"
    chmod 755 "$NAUDIODON/build/Release/libportaudio.2.dylib" # Ensure write permissions so xattr -cr doesn't fail
    install_name_tool -change "$BREW_PA_REAL" "@loader_path/libportaudio.2.dylib" "$NODE_FILE"
    # The copy still advertises Homebrew's absolute path as its own install
    # name; rewrite it so nothing in the bundle names a path off this machine.
    install_name_tool -id "@loader_path/libportaudio.2.dylib" "$NAUDIODON/build/Release/libportaudio.2.dylib" 2>/dev/null || true
    codesign --force --sign - "$NAUDIODON/build/Release/libportaudio.2.dylib" >/dev/null 2>&1 || true
    codesign --force --sign - "$NODE_FILE" >/dev/null 2>&1 || true
  fi
}

# Root install: Node ABI (CLI / bun start / test:dictation)
rebuild_native "$ROOT/node_modules/segfault-handler"
rebuild_naudiodon "$ROOT/node_modules/naudiodon"

# Resolve Electron version for ABI-matched rebuilds
EV="${ELECTRON_VERSION:-}"
if [[ -z "$EV" && -f "$ROOT/packages/desktop/node_modules/electron/package.json" ]]; then
  EV="$(node -p "require('$ROOT/packages/desktop/node_modules/electron/package.json').version")"
fi

if [[ -z "$EV" ]]; then
  fail_or_skip "could not resolve an Electron version (run 'cd packages/desktop && bun install' first, or set ELECTRON_VERSION) — skipping Electron-ABI rebuilds"
fi

ELECTRON_GYP=(--target="$EV" --arch=arm64 --dist-url=https://electronjs.org/headers)

# $2 = "required" -> missing dir/EV escalates per STRICT; anything else -> always just a note.
rebuild_for_electron() {
  local DIR="$1"
  local REQUIRED="${2:-optional}"
  if [[ -z "$EV" ]]; then
    return 0
  fi
  if [[ ! -d "$DIR" ]]; then
    if [[ "$REQUIRED" == "required" ]]; then
      fail_or_skip "$DIR does not exist — its native module won't be rebuilt for Electron's ABI"
    else
      echo "note: $DIR does not exist — skipping (not part of the packaged app)" >&2
    fi
    return 0
  fi
  if [[ "$(basename "$DIR")" == "naudiodon" ]]; then
    rebuild_naudiodon "$DIR" "${ELECTRON_GYP[@]}"
  else
    rebuild_native "$DIR" "${ELECTRON_GYP[@]}"
  fi
}

# packages/desktop's copies are what electron-builder's extraResources actually
# ships inside the app — these must exist and match Electron's ABI (STRICT-enforced).
rebuild_for_electron "$ROOT/packages/desktop/node_modules/segfault-handler" required
rebuild_for_electron "$ROOT/packages/desktop/node_modules/naudiodon" required

# packages/engine's copies (if present) are only used by its standalone CLI test
# harness, run under plain Node, not packaged — never worth failing a release over.
rebuild_for_electron "$ROOT/packages/engine/node_modules/segfault-handler"
rebuild_for_electron "$ROOT/packages/engine/node_modules/naudiodon"

if [[ "$STRICT" == "1" && -n "$EV" ]]; then
  for f in \
    "$ROOT/packages/desktop/node_modules/segfault-handler/build/Release/segfault-handler.node" \
    "$ROOT/packages/desktop/node_modules/naudiodon/build/Release/naudiodon.node"
  do
    if [[ ! -f "$f" ]]; then
      echo "error: expected Electron-ABI build output missing: $f" >&2
      exit 1
    fi
  done
  echo "verified: packages/desktop native modules are built for Electron $EV"
fi
