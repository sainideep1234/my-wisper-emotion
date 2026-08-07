#!/usr/bin/env bash
# Post-package safety net for native-module ABI mismatches.
#
# Electron embeds its own Node with its own NODE_MODULE_VERSION (ABI), which
# differs from the system Node used for CLI work. A .node compiled for the
# wrong one loads fine in dev and then crashes on every user's Mac with
# "was compiled against a different Node.js version".
#
# An earlier version of this script only probed two hardcoded paths under
# Resources/node_modules and reported OK while a *second*, wrong-ABI copy of
# the same module sat in app.asar.unpacked — which is the copy the app
# actually resolved at runtime. So this script now:
#   1. loads EVERY .node in the bundle, wherever it lives, and
#   2. resolves the modules the way the app itself does, and
#   3. fails if the same module is present in more than one place.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/release/mac-arm64/Wisper.app"
BIN="$APP/Contents/MacOS/Wisper"
RES="$APP/Contents/Resources"

if [[ ! -x "$BIN" ]]; then
  echo "error: packaged app not found at $BIN — build it first" >&2
  exit 1
fi

FAILED=0

# ── 1. Every .node in the bundle must load under Electron's own runtime ──────
# Packages like uiohook-napi ship prebuilds/ for every platform and pick the
# right one at runtime; the foreign-platform ones are *expected* to be
# unloadable here, so only this platform's slice is probed.
echo "── loading every native binary in the bundle ──"
ALL_NODE_FILES="$(find "$RES" -name '*.node' -type f | sort)"
NODE_FILES="$(grep -v '/prebuilds/' <<< "$ALL_NODE_FILES" || true)"
THIS_PLATFORM_PREBUILDS="$(grep '/prebuilds/darwin-arm64/' <<< "$ALL_NODE_FILES" || true)"
if [[ -n "$THIS_PLATFORM_PREBUILDS" ]]; then
  NODE_FILES="$(printf '%s\n%s' "$NODE_FILES" "$THIS_PLATFORM_PREBUILDS" | sed '/^$/d' | sort)"
fi
if [[ -z "$NODE_FILES" ]]; then
  echo "error: no loadable .node files found in $RES — packaging is broken" >&2
  exit 1
fi

PROBE="$(mktemp -t wisper-probe).js"
cat > "$PROBE" <<'EOF'
try {
  require(process.env.PROBE_TARGET);
  console.log('  OK   ' + process.env.PROBE_LABEL);
  process.exit(0);
} catch (err) {
  console.error('  FAIL ' + process.env.PROBE_LABEL);
  console.error('       ' + String(err.message).split('\n')[0]);
  process.exit(1);
}
EOF

while IFS= read -r f; do
  label="${f#"$RES/"}"
  if ! PROBE_TARGET="$f" PROBE_LABEL="$label" ELECTRON_RUN_AS_NODE=1 "$BIN" "$PROBE"; then
    FAILED=1
  fi
done <<< "$NODE_FILES"

# ── 2. A module must not exist in BOTH module roots (the bug that shipped in
# v1.0.15): electron-builder auto-bundles root package.json dependencies into
# app.asar while extraResources places the Electron-ABI build under
# Resources/node_modules. When both are present the app resolves the asar copy
# — built for the system Node — and dies on the ABI check at launch. ─────────
echo "── checking the same module isn't in both app.asar.unpacked and Resources ──"
ASAR_MODS="$([[ -d "$RES/app.asar.unpacked/node_modules" ]] && ls "$RES/app.asar.unpacked/node_modules" 2>/dev/null | sort || true)"
RES_MODS="$([[ -d "$RES/node_modules" ]] && ls "$RES/node_modules" 2>/dev/null | sort || true)"
COLLISIONS="$(comm -12 <(printf '%s\n' "$ASAR_MODS") <(printf '%s\n' "$RES_MODS") | sed '/^$/d')"
if [[ -n "$COLLISIONS" ]]; then
  echo "error: these modules exist in BOTH app.asar.unpacked and Resources/node_modules;" >&2
  echo "       the app will resolve the asar copy, which is built for the wrong ABI:" >&2
  while IFS= read -r m; do echo "  collision: $m" >&2; done <<< "$COLLISIONS"
  echo "       fix: add \"!node_modules/<name>/**/*\" to build.files in package.json" >&2
  FAILED=1
else
  echo "  OK   no module is duplicated across both roots"
fi

# ── 3. Nothing may depend on a path outside the .app ────────────────────────
# whisper.cpp's addon.node ships with an LC_RPATH baked in by CMake pointing at
# the build machine's own checkout. On the build machine it loads fine; on a
# user's Mac it dies with "Library not loaded: @rpath/libwhisper.1.dylib".
# Only system locations and bundle-relative prefixes are legitimate here.
echo "── checking for dependencies outside the app bundle ──"
while IFS= read -r f; do
  # Read load commands directly: LC_ID_DYLIB (a dylib's own install name) is
  # not a dependency and must not be treated as one.
  offenders="$(otool -l "$f" 2>/dev/null | awk '
      /LC_RPATH/{r=1} r&&/ path /{print $2; r=0}
      /LC_LOAD_DYLIB|LC_LOAD_WEAK_DYLIB|LC_REEXPORT_DYLIB/{d=1} d&&/ name /{print $2; d=0}')"
  while IFS= read -r dep; do
    [[ -z "$dep" ]] && continue
    case "$dep" in
      @loader_path*|@rpath*|@executable_path*) continue ;;
      /usr/lib/*|/System/*) continue ;;
      *)
        echo "  FAIL ${f#"$RES/"}" >&2
        echo "       depends on out-of-bundle path: $dep" >&2
        FAILED=1
        ;;
    esac
  done <<< "$offenders"
done <<< "$NODE_FILES
$(find "$RES" -name '*.dylib' -type f ! -type l | sort)"
[[ "$FAILED" == "0" ]] && echo "  OK   every binary resolves within the bundle or the OS"

# ── 4. Resolve modules the way the app actually does ─────────────────────────
echo "── resolving modules the way the app does ──"
RESOLVE="$(mktemp -t wisper-resolve).js"
cat > "$RESOLVE" <<'EOF'
// Mirror the module-path injection main.ts performs before any native require.
const path = require('path');
const Module = require('module');
const nativePath = path.join(process.env.WISPER_RESOURCES, 'node_modules');
const orig = Module._nodeModulePaths.bind(Module);
Module._nodeModulePaths = (from) => {
  const paths = orig(from);
  if (!paths.includes(nativePath)) paths.unshift(nativePath);
  return paths;
};
if (require.main && require.main.paths) require.main.paths.unshift(nativePath);

let failed = false;
for (const name of ['naudiodon', 'segfault-handler', 'uiohook-napi']) {
  try {
    require(name);
    console.log(`  OK   require('${name}') -> ${require.resolve(name)}`);
  } catch (err) {
    failed = true;
    console.error(`  FAIL require('${name}')`);
    console.error('       ' + String(err.message).split('\n')[0]);
  }
}
process.exit(failed ? 1 : 0);
EOF

if ! WISPER_RESOURCES="$RES" ELECTRON_RUN_AS_NODE=1 "$BIN" "$RESOLVE"; then
  FAILED=1
fi

rm -f "$PROBE" "$RESOLVE"

if [[ "$FAILED" == "1" ]]; then
  echo "" >&2
  echo "error: native module verification FAILED — do not ship this build" >&2
  exit 1
fi

echo ""
echo "verified: all native modules load under Electron's ABI $(ELECTRON_RUN_AS_NODE=1 "$BIN" -p 'process.versions.modules')"
