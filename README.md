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
- **Emotion indicator** — an optional 361 MB wav2vec2 model classifies each utterance's tone; without it, a cheap acoustic heuristic fills in and the tone tag is hidden
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
| `bun run build:paste-helper` | Rebuild the C auto-paste helper (included in `setup`) |
| `bun run build:fn-poll` | Rebuild the C Fn-key poller (included in `setup`) |

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

**Overlay pill.** The engine emits a mic level every 20 ms. The renderer keeps that in a ref and writes bar heights straight to the DOM from a single `requestAnimationFrame` loop — React re-renders only when the speaking/idle boolean flips. Listing the level in the effect's dependency array instead rebuilt that loop 50 times a second and put the waveform visibly behind the voice. Smoothing is asymmetric (fast attack, slower release) and there is no CSS height transition, since easing on top of the rAF interpolation just re-adds lag. Tuning lives in named constants at the top of `App.tsx`.

The pill is a drag region, so it can be moved. It re-centres on every show — and on display add/remove/metrics changes — using `workArea` including its `x`/`y` origin, on the display nearest the cursor. Centring from `workAreaSize` alone (a bare width/height) puts it off-centre whenever the Dock is on the left or right, or on a non-primary display.

---

## Models

### Speech

Downloaded from Hugging Face on demand. Dev: `models/`. Packaged: `~/Library/Application Support/wisper-emotion/models/` (Electron uses the `name` field, not `productName`).

| Model | Size | RAM |
|---|---|---|
| `tiny.en` | 75 MB | ~300 MB |
| `base.en` **(default)** | 142 MB | ~500 MB |
| `small.en` | 466 MB | ~1.2 GB |
| `medium.en` | 1.5 GB | ~2.6 GB |
| `large-v3` | 3.1 GB | ~4.5 GB |

**Disk hygiene.** Every download streams to `<name>.tmp` and renames on completion, so a quit or crash mid-download strands the partial — one interrupted `large-v3` fetch leaves 1.3 GB in Application Support that nothing else ever looks at and the UI can't show. Any `.tmp` present at startup is by definition abandoned (no download is in flight yet), so `sweepStalePartialDownloads()` removes it at `app.whenReady()` and logs what it reclaimed.

### Emotion (optional)

[`superb/wav2vec2-base-superb-er`](https://huggingface.co/superb/wav2vec2-base-superb-er) exported to ONNX — 361 MB, fp32, opset 17, logits only. Downloaded on demand from the `models-v1` GitHub release into the same userData folder; nothing about dictation depends on it. Re-export with `scripts/export-emotion-onnx.py`.

Inference runs through `onnxruntime-node` (N-API v6 prebuilds — ABI-stable, so no Electron rebuild is needed):

- **Once per utterance**, after transcription, so the two never contend for CPU. The 1 s interval during recording is the heuristic only — it drives the live overlay tag and costs nothing.
- **Capped at 8 s.** Cost is linear in input length (77 ms @3 s, 207 ms @8 s), so a long hands-free session would otherwise run inference over minutes of audio. The cap picks the *highest-energy* 8 s window rather than head-cropping — an utterance that opens with a breath and trails into silence would otherwise be judged mostly on room tone.
- **Lazy-loaded, unloaded after 60 s idle.** The session holds ~538 MB resident; dictation is bursty, so it gets handed back between bursts.
- **Every failure degrades to the heuristic** — model absent, corrupt, or throwing. A failed *load* latches so it stops retrying; a failed *run* does not.

The model emits four SUPERB classes, reported as-is — `neu` → **Neutral**, `hap` → **Happy**, `ang` → **Angry**, `sad` → **Sad**.

An earlier revision mapped `ang` → "Energetic" and `sad` → "Thoughtful" to fit the UI's non-judgemental palette. That was dropped: it meant someone who sounded angry was shown "Energetic", and `Calm`/`Focused` sat on the Tone page forever at zero because the model can't emit them. A dashboard that renames its own findings isn't insight. The four real labels ship, and the Tone page states their limits on-screen.

The heuristic keeps its own arousal-only vocabulary (`Calm`, `Focused`, `Thoughtful`, `Energetic`) and deliberately cannot reach `Angry`/`Sad` — inferring negative emotion from loudness alone would be a guess dressed as a measurement. It only drives the live overlay while recording; the Tone page is built from model output only.

Realistic accuracy for 4-class speech emotion recognition is 62–75% — roughly one call in three is wrong. Treat a single label as a hint and the distribution as the signal.

**Keep the export fp32.** Quantizing looks like an obvious win on a 361 MB model and isn't: int8 measured 2.7× *slower* on Apple Silicon (quantize/dequantize overhead beats ARM's optimized fp32 kernels) and disagreed with fp32 on 40% of labels. fp16 won't load on the CPU EP at all.

**Removing it** cancels any in-flight download first (otherwise the finishing download renames its `.tmp` back over the file just deleted), releases the ONNX session so the ~538 MB returns immediately, deletes both `emotion.onnx` and any `emotion.onnx.tmp`, then confirms against the filesystem. An already-absent model is a success, not an error. The UI reports what is actually on disk afterwards rather than assuming the delete worked.

---

## Release

`bun run release:mac` runs six steps and **fails rather than shipping a broken bundle**:

```
1. build:desktop                        esbuild main/preload + vite renderer
2. STRICT=1 fix-naudiodon-portaudio.sh  rebuild native modules for Electron's ABI
3. stage-whisper-runtime.sh             stage addon.node + dylibs, rpaths → @loader_path
4. preflight-package.sh                 every extraResources source exists, before packaging
5. electron-builder --mac               package .app and .dmg
6. verify-native-modules.sh             load-test the packaged bundle
```

### Three packaging rules

Each of these previously shipped a bug that worked on the build machine and failed everywhere else.

**1. Native modules must exist exactly once.** `naudiodon` is a root dependency, so electron-builder would bundle the *root* `node_modules` copies — built for system Node — into the ASAR, alongside the Electron-ABI copies `extraResources` puts in `Resources/node_modules`. The app resolves the ASAR copy and dies with `NODE_MODULE_VERSION 147 … requires 148`. The `!node_modules/...` entries in `build.files` exist only to prevent this.

**2. Nothing may depend on a path outside the `.app`.** CMake bakes an absolute `LC_RPATH` into `addon.node`, which links `@rpath/libwhisper.1.dylib` plus five `libggml*.dylib`. `stage-whisper-runtime.sh` collects them into one directory, rewrites rpaths to `@loader_path`, and re-signs ad-hoc (`install_name_tool` invalidates signatures; arm64 won't load unsigned Mach-O).

**3. A missing `extraResources` source does not fail the build.** electron-builder logs `• file source doesn't exist` and **exits 0**, so the file is simply absent from the DMG. For a native module the app dies loudly on first `require`; for the two C helpers it degrades *silently* — no `paste-helper` means auto-paste falls back to clipboard-only, no `fn-poll` means the Fn hotkey never fires, and `main.ts` only `console.warn`s, which nobody sees in a packaged app. Neither is a `.node` or `.dylib`, so the load-test below skipped them entirely until an explicit check was added for both. `release:mac` also never builds them (only `setup` does), so a clone that skips `setup` produces a green build that is broken for every user. `preflight-package.sh` reads `build.extraResources` straight from `package.json` — so entries added later are covered automatically — and fails *before* packaging with the exact command to fix it.

`verify-native-modules.sh` enforces all three after packaging: loads every `.node` under Electron's runtime, fails on modules present in both roots, rejects any binary pointing outside the bundle, resolves each module the way the app itself does, and confirms both helper binaries shipped executable.

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
A native module was built for system Node instead of Electron. Run `bun run setup`, then `bun run release:mac` — step 6 will confirm.

**Recording works but nothing pastes**
Accessibility permission is missing → Privacy & Security → Accessibility.

**Mic level stays at zero**
macOS returns silence when permission is denied. Log shows `No microphone signal detected`.

**`whisper.cpp addon not found`**
Run `bun run build:whisper-addon`. Packaged path: `Resources/whisper.cpp/build/Release/addon.node`.

**Transcription is slow**
Switch to a smaller model in the Models tab. GPU (`use_gpu`) is on by default.

**No tone tag on transcripts**
The emotion model isn't installed — download it from the Tone tab. The tag is hidden rather than faked when the model is absent.

**Tone tags look wrong**
The model hears delivery, not meaning — a loud room or an emphatic sentence reads as `Angry`, tiredness reads as `Sad`. At a 62–75% ceiling roughly one call in three is wrong; the Tone page flags anything under 50% confidence as *unsure*. See [Models → Emotion](#emotion-optional).
