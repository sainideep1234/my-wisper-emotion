#!/usr/bin/env bash
# Stage the whisper.cpp addon + its dylibs for packaging, with self-relative paths.
#
# whisper.cpp builds addon.node against @rpath/libwhisper.1.dylib (and five
# libggml*.dylib), and CMake bakes in an LC_RPATH pointing at the absolute
# build directory on the machine that compiled it. Shipping addon.node alone
# therefore produces an app that works only on the build machine — everywhere
# else it dies at load with "Library not loaded: @rpath/libwhisper.1.dylib".
#
# This copies the addon and every dylib it needs into one flat staging dir and
# rewrites the rpaths to @loader_path, so the whole set resolves relative to
# itself inside the .app. extraResources ships the staging dir as-is.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_ADDON="$ROOT/whisper.cpp/build/Release/addon.node"
SRC_LIBS="$ROOT/whisper.cpp/build/bin"
STAGE="$ROOT/build/whisper-runtime"

if [[ ! -f "$SRC_ADDON" ]]; then
  echo "error: $SRC_ADDON not found — run: bun run build:whisper-addon" >&2
  exit 1
fi
if [[ ! -d "$SRC_LIBS" ]]; then
  echo "error: $SRC_LIBS not found — whisper.cpp has not been built" >&2
  exit 1
fi

rm -rf "$STAGE"
mkdir -p "$STAGE"

cp "$SRC_ADDON" "$STAGE/"
# -R keeps the versioned symlinks (libwhisper.1.dylib -> libwhisper.1.9.1.dylib)
# that the @rpath references actually name.
cp -R "$SRC_LIBS"/*.dylib "$STAGE/"
chmod u+w "$STAGE"/*

# Point everything at its own directory instead of the build machine's paths.
for f in "$STAGE"/*.node "$STAGE"/*.dylib; do
  [[ -L "$f" ]] && continue   # symlinks inherit the target's load commands
  while read -r rp; do
    [[ -z "$rp" ]] && continue
    install_name_tool -delete_rpath "$rp" "$f" 2>/dev/null || true
  done < <(otool -l "$f" | awk '/LC_RPATH/{f=1} f&&/path /{print $2; f=0}')
  install_name_tool -add_rpath "@loader_path" "$f" 2>/dev/null || true
  # install_name_tool invalidates the existing signature; arm64 refuses to load
  # unsigned Mach-O, so re-apply an ad-hoc one.
  codesign --force --sign - "$f" >/dev/null 2>&1 || true
done

echo "staged whisper runtime -> ${STAGE#"$ROOT/"}"
ls "$STAGE" | sed 's/^/  /'
