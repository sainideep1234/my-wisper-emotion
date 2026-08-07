# Wisper

> **Local, always-on voice dictation for macOS with real-time emotion detection.**
> Hold `Fn` to speak. Release to paste. Everything runs on-device — no cloud, no API keys.

Built on [whisper.cpp](https://github.com/ggerganov/whisper.cpp). Audio is processed in memory and never written to disk or sent anywhere.

---

## Features

- **Push-to-talk** — hold `Fn` to record, release to paste into any app
- **Hands-free mode** — `Fn + Space` locks recording; tap `Fn` to stop
- **Pre-roll buffer** — captures ~1s before the key press, so the first word is never clipped
- **Transcript cleanup** — filler removal, retractions ("scratch that"), numbered lists, punctuation, per-app rules, custom dictionary
- **Context-aware** — detects the frontmost app and adapts (terminals skip capitalisation and newlines; chat apps drop trailing periods; elevated shells get clipboard-only)
- **Emotion indicator** — acoustic heuristic (amplitude + zero-crossing rate) labels each utterance Neutral / Calm / Focused / Happy / Thoughtful / Energetic. No ML model
- **Clipboard history** — last 50 results, re-paste with one click
- **Model picker** — Whisper Tiny → Large v3, downloaded from Hugging Face on demand

---

## Requirements

- macOS on Apple Silicon
- [Bun](https://bun.sh) — `brew install bun`
- Node.js 20+, CMake (`brew install cmake`), Clang (`xcode-select --install`)
- PortAudio (`brew install portaudio`) — dev only; the DMG bundles its own copy

---

## Setup

```bash
git clone https://github.com/sainideep1234/my-wisper-emotion.git
cd my-wisper-emotion
bun run setup     # deps, whisper.cpp clone + addon build, native helpers, Electron ABI rebuild
bun run dev       # Vite on :5173 + Electron
```

The whisper.cpp clone takes a few minutes on first run. Force an addon rebuild with `FORCE=1 bun run build:whisper-addon`.

### macOS permissions

| Permission | Where | Needed for |
|---|---|---|
| Microphone | Privacy & Security → Microphone | Recording (prompted on first launch) |
| Accessibility | Privacy & Security → Accessibility | Fn detection + auto-paste (grant manually) |
| Fn key | Keyboard → "Press 🌐 fn key to" → **Do Nothing** | Stops macOS firing its own action |

**The Fn setting is enforced.** Wisper polls the Fn key but cannot intercept it, so macOS's emoji picker would open on the same press. On startup the app reads `AppleFnUsageType` from `com.apple.HIToolbox`; if it isn't `0`, the dashboard is blocked behind a setup screen that deep-links to Keyboard settings and unlocks itself once the value changes. A restart is sometimes needed for macOS to apply it.

---

## Commands

| Command | What it does |
|---|---|
| `bun run setup` | Full first-time setup |
| `bun run dev` | Electron + Vite dev server |
| `bun run build:desktop` | Production build (esbuild + Vite) |
| `bun run release:mac` | Build, package, and verify the `.dmg` |
| `bun run publish:release` | Tag and upload the DMG to GitHub Releases |

---

## Architecture

```
packages/
├── desktop/        Electron main process + React UI (main window + overlay pill)
├── engine/         AudioPipeline: recorder → transcriber → cleanup → history
├── whisper-addon/  N-API wrapper around whisper_full() (in-memory PCM, no temp files)
└── website/        Next.js landing page + /api/download/mac + /api/version
```

**Dictation flow:**

```
Fn down → fn-poll (C, 125 Hz) → pipeline.startRecording()
            ├─ pre-roll ring buffer → utterance buffer
            └─ capture frontmost app via osascript

Fn up   → UtteranceQueue (serial — whisper.cpp is not re-entrant)
            └─ transcribe → cleanup chain → emotion → history
                 └─ clipboard + synthetic Cmd+V (paste-helper, AppleScript fallback)
```

**Cleanup chain** (`packages/engine/stages/`), applied in order to the raw transcript:

| Stage | What it does |
|---|---|
| `stripFillers` | Regex removal of `um` / `uh` / `erm` / `hmm` / `ah` / `eh` — exact match, no model |
| `retractions` | "scratch that" / "no wait" drops the preceding clause |
| `numberedLists` | "First … Second …" → "1. … 2. …" |
| `lightPunctuation` | Capitalises sentence starts (skipped in terminals) |
| `perAppRules` | Terminal / chat specific adjustments |
| `dictionary` | Whole-word replacements and snippet expansion |

`fn-poll` exists because uIOhook's user-space event tap misses the Fn key (VK `0x3F`) on modern macOS; `CGEventSourceKeyState` polled at 125 Hz is reliable and cheap.

---

## Models

Downloaded from Hugging Face on demand. Dev: `models/`. Packaged: `~/Library/Application Support/wisper-emotion/models/` (Electron uses the `name` field, not `productName`).

| Model | Size | RAM |
|---|---|---|
| `tiny.en` | 75 MB | ~300 MB |
| `base.en` **(default)** | 142 MB | ~500 MB |
| `small.en` | 466 MB | ~1.2 GB |
| `medium.en` | 1.5 GB | ~2.6 GB |
| `large-v3` | 3.1 GB | ~4.5 GB |

---

## Release

`bun run release:mac` runs five steps and **fails rather than shipping a broken bundle**:

```
1. build:desktop                        esbuild main/preload + vite renderer
2. STRICT=1 fix-naudiodon-portaudio.sh  rebuild native modules for Electron's ABI
3. stage-whisper-runtime.sh             stage addon.node + dylibs, rpaths → @loader_path
4. electron-builder --mac               package .app and .dmg
5. verify-native-modules.sh             load-test the packaged bundle
```

### Two packaging rules

Both of these previously shipped bugs that worked on the build machine and failed everywhere else.

**1. Native modules must exist exactly once.** `naudiodon` is a root dependency, so electron-builder would bundle the *root* `node_modules` copies — built for system Node — into the ASAR, alongside the Electron-ABI copies `extraResources` puts in `Resources/node_modules`. The app resolves the ASAR copy and dies with `NODE_MODULE_VERSION 147 … requires 148`. The `!node_modules/...` entries in `build.files` exist only to prevent this.

**2. Nothing may depend on a path outside the `.app`.** CMake bakes an absolute `LC_RPATH` into `addon.node`, which links `@rpath/libwhisper.1.dylib` plus five `libggml*.dylib`. `stage-whisper-runtime.sh` collects them into one directory, rewrites rpaths to `@loader_path`, and re-signs ad-hoc (`install_name_tool` invalidates signatures; arm64 won't load unsigned Mach-O).

`verify-native-modules.sh` enforces both after packaging: loads every `.node` under Electron's runtime, fails on modules present in both roots, and rejects any binary pointing outside the bundle.

### Gatekeeper

**The DMG is ad-hoc signed, not notarized.** Browser downloads get a `com.apple.quarantine` flag, and on Apple Silicon an unnotarized quarantined app is rejected with *"Wisper is damaged and can't be opened"* — a dialog with no bypass. Users must either clear the flag:

```bash
xattr -cr "/Applications/Wisper.app"
```

or install via `curl`, which never sets the flag:

```bash
curl -L -o ~/Downloads/Wisper.dmg "https://<site>/api/download/mac"
```

Removing this requires an Apple Developer ID ($99/yr) + notarization: set `CSC_LINK` / `CSC_KEY_PASSWORD` and `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`, and electron-builder notarizes automatically. Since `disable-library-validation` is on, every bundled binary must be signed for the notary service to accept it.

---

## Troubleshooting

**"was compiled against a different Node.js version (NODE_MODULE_VERSION …)"**
A native module was built for system Node instead of Electron. Run `bun run setup`, then `bun run release:mac` — step 5 will confirm.

**Recording works but nothing pastes**
Accessibility permission is missing → Privacy & Security → Accessibility.

**Mic level stays at zero**
macOS returns silence when permission is denied. Log shows `No microphone signal detected`.

**`whisper.cpp addon not found`**
Run `bun run build:whisper-addon`. Packaged path: `Resources/whisper.cpp/build/Release/addon.node`.

**Transcription is slow**
Switch to a smaller model in the Models tab. GPU (`use_gpu`) is on by default.
