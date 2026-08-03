#!/usr/bin/env bash
# Ensure naudiodon links against an arm64 PortAudio on Apple Silicon.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAUDIODON="$ROOT/node_modules/naudiodon"
BREW_PA="/opt/homebrew/lib/libportaudio.dylib"

if [[ "$(uname -s)" != "Darwin" ]] || [[ "$(uname -m)" != "arm64" ]]; then
  exit 0
fi

if [[ ! -d "$NAUDIODON" ]]; then
  exit 0
fi

if [[ ! -f "$BREW_PA" ]]; then
  echo "note: install PortAudio for mic capture: brew install portaudio"
  exit 0
fi

mkdir -p "$NAUDIODON/portaudio/bin"
cp "$BREW_PA" "$NAUDIODON/portaudio/bin/libportaudio.dylib"
(cd "$NAUDIODON" && npx --yes node-gyp rebuild) >/dev/null
echo "naudiodon: rebuilt against Homebrew PortAudio (arm64)"
