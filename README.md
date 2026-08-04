# Wisper

> **Local, always-on voice dictation for macOS with real-time emotion detection.**  
> Hold `Fn` to speak. Release to paste. All processing happens on-device — no cloud, no API keys.

---

## What it is

Wisper is a macOS Electron app that lets you dictate text into any application using your voice. Press and hold the `Fn` key (or `Cmd+Option+Space`), speak, and the transcribed text is automatically pasted wherever your cursor is.

Built on top of [whisper.cpp](https://github.com/ggerganov/whisper.cpp), it runs OpenAI's Whisper model entirely on your machine. Transcription is fast, private, and works without an internet connection. As a layer on top of the raw transcript, Wisper runs a cleanup pipeline that removes filler words, applies punctuation, handles per-app rules (terminals, chat apps, editors), and supports a custom word dictionary.

The "emotion" part is a lightweight acoustic analysis that classifies each utterance into one of six emotional states — Neutral, Calm, Focused, Happy, Thoughtful, Energetic — based on amplitude and zero-crossing rate of the PCM signal. It surfaces in the UI as a live indicator while you speak and is stored alongside each history entry.

---

## Key Features

- **Push-to-talk** — hold `Fn` to record, release to paste
- **Hands-free mode** — `Fn + Space` locks recording; tap `Fn` again to stop
- **Pre-roll buffer** — captures ~1 second of audio before the key is pressed, so you never miss the first word
- **Auto-paste** — uses a native C helper (`paste-helper`) to inject text without stealing focus
- **Live emotion indicator** — acoustic emotion detection updates the overlay pill every second while speaking
- **Transcript cleanup pipeline** — filler removal, retraction phrases ("scratch that"), ordinal-to-number conversion, punctuation, per-app rules
- **Custom dictionary** — whole-word replacements and spoken snippets
- **Clipboard history** — last 50 dictation results stored in-app; paste any of them back with one click
- **Model picker** — switch between Whisper Tiny through Large v3 from the settings tab; models download directly from Hugging Face
- **System tray icon** — app runs in the background; open settings from the menu bar
- **Privacy-first** — audio is processed in-memory and never written to disk or sent anywhere

---

## Architecture

The project is a monorepo with three packages:

```
my-wisper-emotion/
├── packages/
│   ├── desktop/          # Electron app (main process + React UI)
│   ├── engine/           # Audio pipeline, transcription, emotion, cleanup
│   └── whisper-addon/    # N-API C++ addon source injected into whisper.cpp
├── scripts/
│   ├── build-whisper-addon.sh    # Clones whisper.cpp and compiles addon.node
│   └── fix-naudiodon-portaudio.sh # Patches PortAudio linkage on Apple Silicon
├── build/
│   ├── entitlements.mac.plist    # macOS Hardened Runtime entitlements
│   └── icon.icns / icon.png
├── models/               # Whisper GGML model files (gitignored)
├── whisper.cpp/          # whisper.cpp subdir (gitignored; cloned by setup)
├── bin/                  # Compiled native binaries (gitignored)
└── package.json          # Root scripts and electron-builder config
```

### Packages

#### `packages/engine` — Audio Pipeline

The core of the application. Exposes a single `AudioPipeline` class that owns the entire recording and transcription lifecycle.

```
Recorder (naudiodon, pre-roll ring buffer)
    └─ RingBuffer (1s pre-roll at 16 kHz)
    └─ UtteranceBuffer (up to 10 min)

AudioPipeline (EventEmitter)
    ├─ ContextProvider  → captures frontmost app via osascript at hotkey time
    ├─ Recorder         → always-on mic, starts utterance on hotkey
    ├─ UtteranceQueue   → serialises jobs so Whisper is never re-entered
    ├─ Transcriber      → wraps whisper.cpp N-API addon
    ├─ Chain            → ordered cleanup stages applied to raw transcript
    ├─ detectEmotion()  → acoustic heuristic (amplitude + ZCR)
    └─ HistoryStore     → in-memory ring of last 200 utterances
```

**Cleanup chain stages** (in order):

| Stage | What it does |
|---|---|
| `stripFillers` | Removes `um`, `uh`, `erm`, `hmm`, `ah`, `eh` |
| `retractions` | "scratch that", "delete that", "no wait" → drops preceding clause |
| `numberedLists` | "First … Second …" → "1. … 2. …" |
| `lightPunctuation` | Capitalises sentence starts; skipped for terminals |
| `perAppRules` | Collapses newlines for terminals; strips trailing period in chat apps |
| `dictionary` | Whole-word replacements + spoken snippet expansions |

**Emotion detection** — `detectEmotion(pcm: Float32Array)` computes average amplitude (`avgAmp`) and zero-crossing rate (`zcr`) over the PCM buffer, then maps them to six labels using fixed thresholds. There is no ML model for this; it is a deterministic signal heuristic. The comment in the source notes an ONNX model path is a potential future upgrade.

#### `packages/desktop` — Electron App

The desktop package contains:

- **`electron/main.ts`** — main process: creates windows, registers hotkeys, owns the `AudioPipeline`, handles all IPC
- **`electron/preload.ts`** — exposes a typed `window.electronAPI` bridge to the renderer (context isolation on)
- **`electron/text-injector.ts`** — pastes text into the focused app using the native `paste-helper` binary, with AppleScript as fallback
- **`electron/download-model.ts`** — streams Whisper model files from Hugging Face to the user data directory with progress callbacks
- **`electron/paths.ts`** — resolves paths for models, engine, addon, and native binaries between dev and packaged modes
- **`electron/native/fn-poll.c`** — 125 Hz C poller that reads `CGEventSourceKeyState` to reliably detect the macOS Fn key
- **`electron/native/paste.c`** — posts a synthetic Cmd+V keyboard event via `CGEventPost`
- **`src/App.tsx`** — single-file React component (~1400 lines) with five tabs: Dictate, Models, Emotions, Settings, Clipboard

**Two windows run from the same React bundle:**

| Window | Purpose |
|---|---|
| Main window (1080×740) | Settings, history, model management, emotion analytics |
| Overlay window (360×72) | Floating pill that shows recording state and emotion colour; `type: 'panel'` on macOS so it stays on all Spaces and never steals focus |

The renderer detects which window it is via `window.location.search.includes('overlay=1')` and renders a completely different view.

#### `packages/whisper-addon` — N-API Addon Source

This package contains `addon.cpp`, a Node-API wrapper around `whisper_full()` from whisper.cpp. It exposes a single `whisper(params, callback)` function that accepts a `pcmf32` Float32Array (in-memory audio, never file-based) and calls the callback with the transcription result.

The addon supports GPU acceleration via `use_gpu`, flash attention via `flash_attn`, and optional Voice Activity Detection via the Silero VAD model. VAD is not used by Wisper currently; the addon is called with `vad: false`.

The source is not compiled in place. `build-whisper-addon.sh` injects it into `whisper.cpp/examples/addon.node/` and compiles it from within the whisper.cpp CMake tree so it can link against `libwhisper`.

---

## How a Dictation Works

```
User presses Fn
     │
     ▼
fn-poll (C, 125 Hz)  ──stdout "down"──▶  main.ts onFnDown()
     │
     ▼
startRecordingSession()
  ├─ overlayWindow.showInactive()       ← pill appears, no focus steal
  ├─ pipeline.startRecording()
  │    ├─ recorder.beginUtterance()     ← copies pre-roll ring → utterance buffer
  │    ├─ contextProvider.capture()     ← osascript: frontmost app name + bundle ID
  │    └─ setInterval(detectEmotion, 1s) ← live emotion events to UI
  └─ emit('recording_started')

User releases Fn
     │
     ▼
fn-poll ──stdout "up"──▶  onFnUp() → stopRecordingAndInject()
  ├─ overlayWindow.hide()
  ├─ app.hide()                         ← macOS: return focus to target app
  ├─ pipeline.stopRecording()
  │    ├─ recorder.endUtterance()       ← 300 ms flush for in-transit OS buffers
  │    ├─ isSilentPcm() check           ← bail early if mic is silent / unpermitted
  │    └─ queue.enqueue(job)
  │         └─ processJob(job)
  │              ├─ transcriber.transcribe(pcm)  ← whisper.cpp N-API addon
  │              │    └─ trimSilencePcm()        ← 20 ms frame silence trimming
  │              ├─ chain.run(rawText, ctx)       ← 6-stage cleanup pipeline
  │              ├─ detectEmotion(pcm)            ← final emotion for this utterance
  │              ├─ injectDeltaAfterLive()        ← delta after any live-committed words
  │              └─ history.add()
  │
  ├─ injectTextSystemWide(text)
  │    ├─ clipboard.writeText(text)
  │    ├─ pasteViaNativeHelper()        ← bin/paste-helper (CGEventPost Cmd+V)
  │    └─ pasteViaAppleScript()         ← fallback: osascript keystroke v
  │
  └─ sendToWindows('dictation_result')  ← updates history tab silently
```

**Hands-free mode (`Fn + Space`):** When Space is pressed while Fn is held (or vice versa), `isLongSession` is set. The recording continues until the next Fn tap instead of stopping on Fn release.

---

## Context-Aware Behaviour

At hotkey time, `ContextProvider.capture()` queries the frontmost macOS application via AppleScript:

```applescript
tell application "System Events"
  set p to first application process whose frontmost is true
  ...
end tell
```

The result is classified into one of five `AppKind` values: `terminal`, `chat`, `editor`, `browser`, `other`. This classification feeds the cleanup pipeline:

- **Terminal** — collapses newlines to spaces (no accidental Enter), skips punctuation capitalisation
- **Chat** — strips trailing period on short one-liners so messages don't look passive-aggressive
- **Elevated** — skips auto-paste; text goes to clipboard only

---

## Available Models

Models are downloaded directly from Hugging Face (`ggerganov/whisper.cpp`). In development they land in `models/`. In a packaged app they go to `~/Library/Application Support/Wisper/models/`.

| Model | File | Size | RAM |
|---|---|---|---|
| Whisper Tiny (English) | `ggml-tiny.en.bin` | 75 MB | ~300 MB |
| Whisper Base (English) | `ggml-base.en.bin` | 142 MB | ~500 MB |
| Whisper Small (English) | `ggml-small.en.bin` | 466 MB | ~1.2 GB |
| Whisper Medium (English) | `ggml-medium.en.bin` | 1.5 GB | ~2.6 GB |
| Whisper Large v3 (Multilingual) | `ggml-large-v3.bin` | 3.1 GB | ~4.5 GB |

The default on first launch is `base.en`. It downloads automatically in the background while the setup screen is shown.

---

## Prerequisites

- **macOS** (primary target; text injector has partial Windows support via PowerShell SendKeys)
- **Bun** — used for package management and running scripts (`brew install bun`)
- **Node.js 20+** — required for the whisper.cpp N-API build
- **CMake** — for compiling the whisper.cpp addon (`brew install cmake`)
- **Clang** — for the native C helpers (`xcode-select --install`)
- **PortAudio** — for microphone capture via naudiodon (`brew install portaudio`)

On Apple Silicon, the `postinstall` script automatically relinks naudiodon against the Homebrew arm64 `libportaudio.dylib`.

---

## Development Setup

```bash
# 1. Clone the repo
git clone https://github.com/your-org/wisper-emotion.git
cd wisper-emotion

# 2. Run the full setup (installs deps, builds whisper.cpp, compiles native helpers)
bun run setup
```

The `setup` command runs:
1. `bun install` — installs root and engine dependencies
2. `build:whisper-addon` — clones whisper.cpp (if missing) and compiles `addon.node`
3. `build:paste-helper` — compiles `paste.c` → `bin/paste-helper` with clang
4. `build:fn-poll` — compiles `fn-poll.c` → `bin/fn-poll` with clang
5. `cd packages/desktop && bun install` — installs desktop dependencies
6. `rebuild:electron` — rebuilds native modules (naudiodon, uiohook-napi) for Electron's ABI

The whisper.cpp clone step can take a few minutes. Subsequent runs are fast because the addon is skipped if `addon.node` already exists. To force a rebuild: `FORCE=1 bun run build:whisper-addon`.

### macOS Permissions

After the first launch, grant three permissions:

1. **Microphone** — `System Settings → Privacy & Security → Microphone → Wisper`
2. **Accessibility** — `System Settings → Privacy & Security → Accessibility → Wisper`
   - Required for Fn key detection and auto-paste
3. **Fn Key** — `System Settings → Keyboard → Press Fn key to → Do Nothing`

The app will prompt for Microphone on first launch. Accessibility must be granted manually. The app logs clear instructions to the terminal if either is missing.

---

## Running in Development

```bash
bun run dev
```

This starts Vite on port 5173 and launches Electron with `VITE_DEV_SERVER_URL=http://localhost:5173` set. The main process and preload scripts are compiled with esbuild on each start.

Hot reload applies to the React renderer. Changes to `electron/main.ts` or other main-process files require restarting the dev command.

---

## Available Commands

| Command | What it does |
|---|---|
| `bun run setup` | Full first-time setup: deps, whisper.cpp, native helpers, Electron rebuild |
| `bun run dev` | Start Electron app with Vite dev server |
| `bun run build:whisper-addon` | Clone whisper.cpp (if needed) and compile `addon.node` |
| `bun run build:paste-helper` | Compile `paste.c` → `bin/paste-helper` |
| `bun run build:fn-poll` | Compile `fn-poll.c` → `bin/fn-poll` |
| `bun run rebuild:electron` | Rebuild native Node modules for Electron's ABI |
| `bun run build:desktop` | Production build of the desktop app (esbuild + Vite) |
| `bun run release:mac` | Clean `release/`, build, and package as a `.dmg` via electron-builder |

---

## Build Pipeline

### Desktop App Build

```
bun run build:desktop
  └─ build:electron
       ├─ esbuild electron/main.ts  → dist/electron/main.js    (Node, externals excluded)
       ├─ esbuild electron/preload.ts → dist/electron/preload.js
       └─ esbuild electron/text-injector.ts → dist/electron/text-injector.js
  └─ vite build
       └─ src/main.tsx + App.tsx → dist/index.html + assets/
```

esbuild bundles the main-process files with `--platform=node --target=node20`. Native modules (`naudiodon`, `onnxruntime-node`, `uiohook-napi`) are marked `--external` so esbuild leaves their `require()` calls intact for Node's own resolution at runtime.

### Release (macOS DMG)

```bash
bun run release:mac
```

This runs `build:desktop` then `electron-builder --mac --publish never`. The output lands in `release/`. The builder:

- Packages `packages/desktop/dist/**/*` into an ASAR archive
- Unpacks `*.node` and `*.dylib` outside ASAR (`asarUnpack`) so Node can `require()` them
- Copies `addon.node`, `uiohook-napi`, `naudiodon`, `fn-poll`, and `paste-helper` as `extraResources`
- Signs with Hardened Runtime and the entitlements from `build/entitlements.mac.plist`
- Produces `release/Wisper-{version}-{arch}.dmg`

The `entitlements.mac.plist` grants: JIT (Electron), unsigned executable memory (native addons), library validation disabled (runtime-loaded `.node` files), audio input (microphone), and Apple Events (auto-paste via System Events).

---

## Native Helpers

Two small C programs handle things that JavaScript cannot do reliably:

### `fn-poll` (fn-poll.c)

Polls `CGEventSourceKeyState(kCGEventSourceStateHIDSystemState, 0x3F)` at ~125 Hz (8 ms interval). Prints `"down"` or `"up"` to stdout on each state transition. The main process spawns this as a child process and pipes its stdout. This approach is more reliable than uIOhook for the Fn key on macOS, where the key is a hardware modifier that doesn't always surface through the user-space event tap.

### `paste-helper` (paste.c)

Checks `AXIsProcessTrusted()` then posts a synthetic Cmd+V key event pair via `CGEventPost(kCGHIDEventTap, ...)`. Falls back to AppleScript (`osascript -e 'tell application "System Events" to keystroke "v" using command down'`) if the native helper fails. For elevated applications (sudo terminals), the helper is skipped and text lands on the clipboard only.

---

## macOS Hotkeys

| Hotkey | Action |
|---|---|
| Hold `Fn` | Push-to-talk: record while held, paste on release |
| `Fn` + `Space` | Start hands-free mode (also `Space` then `Fn`) |
| `Fn` (tap during hands-free) | Stop hands-free recording and paste |
| `Cmd+Option+Space` | Toggle dictation (backup shortcut, no Accessibility required) |
| `Shift+C` | Re-paste the last transcribed text at current cursor position |

---

## Text Injection Strategy

`injectTextSystemWide()` in `text-injector.ts`:

1. Writes text to the system clipboard
2. Waits 30 ms for the clipboard to settle
3. Calls `pasteViaNativeHelper()` — runs `bin/paste-helper`
4. If that fails, calls `pasteViaAppleScript()` — `osascript keystroke v`
5. After pasting, writes the text to clipboard again to restore it (paste helper may have modified it)

For elevated targets (`sudo`, root terminals): skips paste, returns clipboard only.

---

## IPC Channels

The preload script bridges main ↔ renderer via `contextBridge`. Invoke channels (request/response):

| Channel | Direction | Purpose |
|---|---|---|
| `get_models` | renderer → main | List available models with download status |
| `select_model` | renderer → main | Switch active Whisper model |
| `download_model` | renderer → main | Download a model from Hugging Face |
| `start_dictation` | renderer → main | Begin recording session |
| `stop_dictation` | renderer → main | Stop recording and inject |
| `get_clipboard_history` | renderer → main | Fetch in-memory clipboard history |
| `paste_clipboard_item` | renderer → main | Inject a history item |
| `check_accessibility` | renderer → main | Check macOS Accessibility permission |
| `check_microphone` | renderer → main | Check microphone permission |
| `is_setup_needed` | renderer → main | Whether default model is missing |

Push channels (main → renderer):

| Channel | Payload | Purpose |
|---|---|---|
| `audio_level` | `number` (0–1) | Live mic level for the overlay meter |
| `live_emotion` | `{ label, confidence, scores }` | Emotion while recording |
| `recording_state_changed` | `{ isRecording, isLongSession, isProcessing }` | Drive overlay pill state |
| `dictation_result` | `{ text, emotion, cursorFound, inserted }` | Final result after paste |
| `download_progress` | `{ modelId, percent, done }` | Model download progress |
| `pipeline_ready` | `{ models, activeModel }` | Pipeline initialised |
| `pipeline_error` | `{ message }` | Non-fatal pipeline errors |
| `update_available` | `{ version, downloadUrl, notes }` | Update notification |

---

## Troubleshooting

**No text is pasted, but I can hear recording**

The Fn key or Cmd+Option+Space must have triggered, but Accessibility permission is missing. Check: `System Settings → Privacy & Security → Accessibility → Electron` (or Wisper in production).

**Microphone level stays at zero**

macOS silently returns silence if mic permission is not granted. The app logs: `No microphone signal detected (peak RMS …)`. Fix: `System Settings → Privacy & Security → Microphone → enable Wisper`.

**`whisper.cpp addon not found`**

The `addon.node` file was not compiled or is in the wrong location. Run: `bun run build:whisper-addon`. In packaged mode, `addon.node` is expected at `Resources/whisper.cpp/build/Release/addon.node`.

**naudiodon native module fails on Apple Silicon**

Run: `bun run setup` again (which calls `fix-naudiodon-portaudio.sh`). Make sure PortAudio is installed: `brew install portaudio`.

**`fn-poll` binary not found**

Run: `bun run build:fn-poll`. The binary compiles from `packages/desktop/electron/native/fn-poll.c` and lands in `bin/fn-poll`.

**Transcription is slow**

Switch to a smaller model from the Models tab. `tiny.en` is the fastest; `base.en` is the recommended default. GPU acceleration (`use_gpu: true`) is enabled by default in the addon.

---

## Project-Level Design Decisions

**Why whisper.cpp instead of a cloud API?**  
Privacy. Audio never leaves the machine. No network required after setup. Latency is predictable.

**Why an N-API addon instead of a subprocess?**  
Passing raw Float32Array PCM through a subprocess boundary (pipe, socket, shared memory) adds latency and complexity. The N-API addon loads into the same process and accepts the buffer directly.

**Why a C fn-poll instead of uIOhook for Fn?**  
uIOhook uses a user-space event tap that macOS can swallow or delay for the Fn key (virtual key 0x3F), especially in newer macOS versions. `CGEventSourceKeyState` polled at 125 Hz is the most reliable approach and has negligible CPU cost.

**Why a pre-roll ring buffer?**  
When you press a hotkey, you've usually already started speaking the first syllable. Without pre-roll, the first 100–300 ms of audio is lost. The ring buffer solves this by continuously capturing audio and prepending the last 1 second to the utterance when recording begins.

**Why esbuild for main-process bundling (not tsc)?**  
Speed, and the ability to import TypeScript source from `packages/engine` directly without emitting files. Native modules are passed through as `--external` so they remain as runtime `require()` calls.

**Why a serial utterance queue?**  
The whisper.cpp context is not thread-safe and re-entering `whisper_full()` while it is running would crash or corrupt state. The `UtteranceQueue` ensures only one transcription job runs at a time, queuing the rest.

---

## Repository Structure

```
my-wisper-emotion/
├── packages/
│   ├── desktop/
│   │   ├── electron/
│   │   │   ├── main.ts              # Electron main process
│   │   │   ├── preload.ts           # contextBridge API surface
│   │   │   ├── text-injector.ts     # Platform-specific paste logic
│   │   │   ├── download-model.ts    # HTTPS model downloader
│   │   │   ├── paths.ts             # Dev/prod path resolution
│   │   │   └── native/
│   │   │       ├── fn-poll.c        # macOS Fn key poller (C)
│   │   │       └── paste.c          # CGEventPost Cmd+V (C)
│   │   ├── src/
│   │   │   ├── App.tsx              # React UI (overlay + main window)
│   │   │   ├── icons.tsx            # SVG icon components
│   │   │   ├── main.tsx             # React root
│   │   │   └── styles.css           # Global styles
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   ├── engine/
│   │   ├── pipeline.ts              # AudioPipeline (composition root)
│   │   ├── emotion.ts               # Acoustic emotion detection
│   │   ├── audio-utils.ts           # PCM conversion, RMS, silence trim
│   │   ├── history.ts               # In-memory utterance history
│   │   ├── context/
│   │   │   ├── provider.ts          # Frontmost app capture (osascript)
│   │   │   └── utterance.ts         # UtteranceContext type + helpers
│   │   ├── recorder/
│   │   │   ├── recorder.ts          # naudiodon mic capture + pre-roll
│   │   │   └── ring-buffer.ts       # Fixed-capacity float32 ring buffer
│   │   ├── worker/
│   │   │   ├── transcriber.ts       # whisper.cpp addon wrapper
│   │   │   └── queue.ts             # Serial utterance queue + delta inject
│   │   └── stages/
│   │       ├── base.ts              # Stage interface + Chain runner
│   │       ├── fillers.ts           # Remove um/uh/erm
│   │       ├── retract.ts           # "scratch that" handling
│   │       ├── lists.ts             # Ordinals → numbered lists
│   │       ├── punctuation.ts       # Capitalise sentence starts
│   │       ├── per-app.ts           # Terminal / chat specific rules
│   │       └── dictionary.ts        # Custom replacements and snippets
│   │
│   └── whisper-addon/
│       ├── addon.cpp                # N-API wrapper for whisper_full()
│       ├── CMakeLists.txt           # cmake-js build definition
│       └── index.js                 # CJS loader shim
│
├── scripts/
│   ├── build-whisper-addon.sh       # Clone + compile whisper.cpp addon
│   └── fix-naudiodon-portaudio.sh   # Patch PortAudio dylib on Apple Silicon
│
├── build/
│   ├── entitlements.mac.plist       # Hardened Runtime entitlements
│   ├── icon.icns
│   └── icon.png
│
├── bun.lock
├── tsconfig.json
└── package.json                     # Root: scripts + electron-builder config
```

---

## Technology Stack

| Layer | Technology | Why |
|---|---|---|
| Shell | macOS | Only target for Fn key + AppleScript integration |
| Runtime | Electron 43 + Node 20 | Desktop app with access to native Node addons |
| UI | React 19 + Tailwind CSS v4 | Component model; Tailwind for rapid styling |
| Bundler (renderer) | Vite 8 + `@vitejs/plugin-react` | Fast HMR in dev |
| Bundler (main process) | esbuild | Sub-second rebuilds; external passthrough for native modules |
| Package manager | Bun | Fast installs; used for scripting |
| Transcription | whisper.cpp (N-API addon) | On-device Whisper inference; no cloud required |
| Audio capture | naudiodon (PortAudio) | Cross-platform PCM input; real-time streaming |
| Global hotkeys | uiohook-napi + custom fn-poll | uIOhook for Space/Shift; fn-poll for reliable Fn key |
| Text injection | CGEventPost (C) + AppleScript | Synthetic Cmd+V without focus steal |
| Language | TypeScript 5 (strict) | Type safety across engine ↔ IPC ↔ renderer |
| Build tooling | cmake-js + node-gyp | N-API addon compilation inside CMake tree |

---

## Contributing

1. Fork and clone
2. Run `bun run setup`
3. Work in `packages/engine` or `packages/desktop`
4. Start the app with `bun run dev`
5. Open a pull request

The engine (`packages/engine`) has no Electron dependency and can be tested independently with Bun. The whisper.cpp addon requires a compiled `addon.node` to be present; without it the transcriber silently returns empty strings, so the rest of the pipeline can still be exercised.

---

## License

See [LICENSE](./LICENSE) for details.
