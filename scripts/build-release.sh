#!/usr/bin/env bash
# Build Wisper Emotion DMG for GitHub Releases
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> [1/3] Setup (Install dependencies & build native addons)"
cd "$ROOT"
bun run setup

echo "==> [2/3] Build Electron App"
bun run build:app

echo "==> [3/3] Verifying DMG output"
ls -lah "$ROOT/release/"*.dmg

echo "Done! DMG is ready for upload."
