#!/usr/bin/env bash
# Build Wisper Emotion DMG and copy to website/public/downloads/ for one-click download.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="1.0.0"
DMG_NAME="Wisper-Emotion-${VERSION}-arm64.dmg"
WEBSITE_DMG_DIR="$ROOT/website/public/downloads"

echo "==> [1/5] Installing backend dependencies & native addon"
cd "$ROOT/backend"
bun install
bash script/build-whisper-addon.sh

echo "==> [2/5] Installing frontend dependencies"
cd "$ROOT/frontend"
bun install

echo "==> [3/5] Building Electron app (Vite + esbuild)"
bun run build

echo "==> [4/5] Packaging DMG with electron-builder"
bun run dist

echo "==> [5/5] Copying DMG to website/public/downloads/"
mkdir -p "$WEBSITE_DMG_DIR"
cp "$ROOT/frontend/release/$DMG_NAME" "$WEBSITE_DMG_DIR/$DMG_NAME"

SIZE=$(du -h "$WEBSITE_DMG_DIR/$DMG_NAME" | cut -f1)
echo ""
echo "Done! DMG ready at:"
echo "  $WEBSITE_DMG_DIR/$DMG_NAME ($SIZE)"
echo ""
echo "To serve downloads:"
echo "  cd website && bun run dev"
echo "  Open http://localhost:3000 and click Download"
echo ""
echo "For production (Vercel), upload the DMG to GitHub Releases and set:"
echo "  NEXT_PUBLIC_DMG_URL=https://github.com/sainideep1234/my-wisper-emotion/releases/download/v${VERSION}/${DMG_NAME}"
