#!/usr/bin/env bash
# Pre-flight gate: every extraResources source must exist BEFORE packaging.
#
# electron-builder does not treat a missing extraResources source as an error.
# It prints an info line and exits 0:
#
#     • file source doesn't exist  from=.../packages/desktop/bin/paste-helper
#
# The DMG then ships without that file. For a native module the app dies loudly
# on first require, but for the two helper binaries it degrades *silently*:
# paste-helper missing -> auto-paste falls back to clipboard-only, and fn-poll
# missing -> the Fn hotkey never fires. main.ts only console.warn()s, which
# nobody sees in a packaged app. Neither is a .node or .dylib, so
# verify-native-modules.sh does not cover them either.
#
# release:mac also never builds those two helpers (only `setup` does), so a
# fresh clone that skips `setup` produces a green build that is broken for
# every user. This script makes that fail here instead of in the wild.
#
# The list is read from package.json rather than hardcoded, so entries added
# later are covered automatically.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FAILED=0

echo "── pre-flight: extraResources sources ──"

# Remedy hints keyed by path prefix — a bare "missing" is not actionable.
remedy_for() {
  case "$1" in
    packages/desktop/bin/paste-helper) echo "bun run build:paste-helper" ;;
    packages/desktop/bin/fn-poll)      echo "bun run build:fn-poll" ;;
    build/whisper-runtime)             echo "bash scripts/stage-whisper-runtime.sh" ;;
    packages/desktop/node_modules/*)   echo "cd packages/desktop && bun install && cd .. && bun run rebuild:electron" ;;
    *)                                 echo "check build.extraResources in package.json" ;;
  esac
}

while IFS= read -r src; do
  [[ -z "$src" ]] && continue
  if [[ -e "$src" ]]; then
    echo "  OK   $src"
  else
    echo "  FAIL $src" >&2
    echo "       missing — electron-builder would skip it silently and still exit 0" >&2
    echo "       fix: $(remedy_for "$src")" >&2
    FAILED=1
  fi
done < <(node -p "require('./package.json').build.extraResources.map(r => r.from).join('\n')")

# ── The helper binaries must also be runnable and this machine's architecture.
# A stale x86_64 build from before an Apple Silicon migration copies fine and
# then fails to exec at runtime, which looks identical to it being absent.
echo "── pre-flight: helper binaries are executable and native ──"
HOST_ARCH="$(uname -m)"
for helper in packages/desktop/bin/paste-helper packages/desktop/bin/fn-poll; do
  [[ -e "$helper" ]] || continue   # already reported above
  if [[ ! -x "$helper" ]]; then
    echo "  FAIL $helper is not executable" >&2
    echo "       fix: chmod +x $helper" >&2
    FAILED=1
    continue
  fi
  archs="$(lipo -archs "$helper" 2>/dev/null || echo unknown)"
  if [[ "$HOST_ARCH" == "arm64" && "$archs" != *arm64* ]]; then
    echo "  FAIL $helper is $archs, not arm64 — it will not exec on this Mac" >&2
    echo "       fix: rm $helper && bun run build:${helper##*/}" >&2
    FAILED=1
  else
    echo "  OK   $helper ($archs)"
  fi
done

if [[ "$FAILED" == "1" ]]; then
  echo "" >&2
  echo "error: pre-flight FAILED — packaging now would produce a broken build" >&2
  exit 1
fi

echo "  all extraResources sources present"
