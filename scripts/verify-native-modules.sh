#!/usr/bin/env bash
# Loads the packaged app's native modules under Electron's own embedded Node
# runtime (ELECTRON_RUN_AS_NODE) and fails loudly on any ABI mismatch —
# exactly the failure mode of "was compiled against a different Node.js
# version" that end users would otherwise only discover after installing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/release/mac-arm64/Wisper.app"
BIN="$APP/Contents/MacOS/Wisper"
RES="$APP/Contents/Resources"

if [[ ! -x "$BIN" ]]; then
  echo "error: packaged app not found at $BIN — build it first" >&2
  exit 1
fi

VERIFY_JS="$(mktemp -t wisper-verify-natives).js"
cat > "$VERIFY_JS" <<'EOF'
const path = require('path');
const res = process.env.WISPER_RESOURCES;
const mods = ['naudiodon', 'segfault-handler'];
let failed = false;
for (const m of mods) {
  const p = path.join(res, 'node_modules', m);
  try {
    require(p);
    console.log(`OK: ${m} loads under Electron's Node ABI ${process.versions.modules}`);
  } catch (err) {
    failed = true;
    console.error(`FAIL: ${m} ->`, err.message);
  }
}
process.exit(failed ? 1 : 0);
EOF

if WISPER_RESOURCES="$RES" ELECTRON_RUN_AS_NODE=1 "$BIN" "$VERIFY_JS"; then
  STATUS=0
else
  STATUS=$?
fi
rm -f "$VERIFY_JS"
exit $STATUS
