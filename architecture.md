# Wisper Emotion — Complete Architecture (First Principles)

> This document explains how every single part of this project works from scratch, in plain language.
> No prior knowledge required.

---

## What Is This App?

**Wisper Emotion** is a macOS desktop app that does two things:

1. **Voice Dictation** — You press a key, speak, and your words are typed into whatever app is focused (Slack, VS Code, Terminal, etc.) — completely offline, no internet needed.
2. **Emotion Detection** — While you speak, it analyses the acoustic properties of your voice (loudness, frequency changes) and labels your emotional tone: Calm, Happy, Energetic, Focused, Thoughtful, or Neutral.

**Core Promise**: Everything happens on your machine. No audio or text ever leaves your device.

---

## First Principles: The Core Problem This Solves

Normal dictation apps (Siri, Google, etc.) send your audio to a cloud server, wait for a response, and paste the text back. This creates:
- **Privacy risks** (your words on someone's server)
- **Latency** (network round trip = 300–1000ms delay)
- **Dependency** (no internet = no dictation)

This app solves all three by running the AI model **locally on your Mac's CPU/GPU** using a C++ library called `whisper.cpp`.

---

## The Technology Stack (Simplified)

| Layer | Technology | What It Does |
|---|---|---|
| Desktop Shell | **Electron** | Wraps a web app into a native macOS app |
| UI | **React + Vite** | The settings window and floating overlay |
| Audio Capture | **naudiodon** (Node.js + PortAudio) | Reads raw microphone audio |
| AI Transcription | **whisper.cpp** (C++) | Converts audio → text on-device |
| Fn Key Detection | **Custom C binary** (`fn-poll`) | Polls macOS for the Fn key state |
| Text Injection | **AppleScript + CGEvent** (C) | Simulates Cmd+V to paste text |
| Monorepo Build | **Bun** | Package manager and build runner |
| Website | **Next.js** | Landing page (separate from the app) |

---

## Repository Layout

```
wisper-emotion/               ← Root monorepo
├── packages/
│   ├── desktop/              ← The Electron app (main process + React UI)
│   │   ├── electron/         ← Node.js main process (runs with full OS access)
│   │   │   ├── main.ts       ← App entry point, hotkey logic, IPC handlers
│   │   │   ├── preload.ts    ← Bridge between Electron and React
│   │   │   ├── text-injector.ts  ← Pastes text into other apps
│   │   │   ├── download-model.ts ← Downloads Whisper model weights
│   │   │   └── native/
│   │   │       ├── fn-poll.c ← C program: polls Fn key via macOS API
│   │   │       └── paste.c   ← C program: fires Cmd+V via macOS API
│   │   └── src/              ← React frontend (runs in browser sandbox)
│   │       └── App.tsx       ← Entire UI: settings, overlay, history
│   │
│   ├── engine/               ← The audio processing brain
│   │   ├── pipeline.ts       ← Composition root: wires everything together
│   │   ├── recorder/
│   │   │   ├── ring-buffer.ts ← Circular memory buffer for pre-roll audio
│   │   │   └── recorder.ts    ← Always-on mic → ring buffer
│   │   ├── worker/
│   │   │   ├── transcriber.ts ← Calls the whisper.cpp C++ addon
│   │   │   └── queue.ts       ← Serial job queue (one transcription at a time)
│   │   ├── stages/           ← Text cleanup pipeline (chain of processors)
│   │   │   ├── base.ts       ← Stage interface + Chain runner
│   │   │   ├── fillers.ts    ← Strips "um", "uh", "erm"
│   │   │   ├── retract.ts    ← Handles spoken corrections ("no wait")
│   │   │   ├── lists.ts      ← Formats "one two three" → numbered lists
│   │   │   ├── punctuation.ts ← Light punctuation fixes
│   │   │   ├── per-app.ts    ← Different rules for Terminal vs Slack
│   │   │   └── dictionary.ts ← Custom word replacements ("get hub" → "GitHub")
│   │   ├── context/
│   │   │   ├── provider.ts   ← Detects which app is focused (via AppleScript)
│   │   │   └── utterance.ts  ← Data type: metadata about a single recording
│   │   ├── streamer/         ← Live partial transcription (LocalAgreement-2)
│   │   ├── emotion.ts        ← Acoustic emotion classifier (no ML model needed)
│   │   └── history.ts        ← In-memory log of past dictations
│   │
│   └── whisper-addon/        ← C++ Node.js native addon
│       ├── addon.cpp         ← Wraps whisper.cpp for Node.js (N-API)
│       └── CMakeLists.txt    ← CMake build config
│
├── whisper.cpp/              ← Git submodule: the actual AI engine (C++)
├── models/                   ← Where downloaded .bin model weights go
├── website/                  ← Next.js marketing/landing page
├── docs/                     ← Architecture Decision Records (ADRs)
├── scripts/                  ← Shell scripts to build native parts
└── bin/                      ← Compiled C binaries (fn-poll, paste-helper)
```

---

## How Everything Fits Together: The Big Picture

When you press the Fn key to start recording and release it to stop, here is the exact sequence of events:

```
You Press Fn Key
      │
      ▼
[fn-poll.c] — tiny C program polling macOS CGEventSource at 125Hz
Prints "down" to stdout
      │
      ▼
[main.ts] reads "down" from child process stdout
Calls: startRecordingSession()
      │
      ├──► Shows floating overlay pill (non-focusable window)
      │
      ├──► Calls pipeline.startRecording()
      │         │
      │         ├──► ContextProvider.capture()
      │         │    └── Runs AppleScript: "which app is frontmost?"
      │         │    Saves: exe name, window title, app kind (terminal/editor/chat)
      │         │
      │         └──► Recorder.beginUtterance()
      │              └── Copies last 1000ms from RingBuffer (pre-roll)
      │              └── Starts accumulating new audio into utteranceBuffer
      │
      ▼
[You speak...]
      │
      ▼ (microphone is always running via naudiodon/PortAudio)
      │
      Raw PCM audio chunks → RingBuffer (always)
                           → utteranceBuffer (while recording)
                           → Every 1 second: detectEmotion() runs on snapshot
                                             → emits 'live_emotion' to UI
      │
You Release Fn Key
      │
      ▼
[fn-poll.c] prints "up"
[main.ts] calls: stopRecordingAndInject()
      │
      ▼
[pipeline.stopRecording()]
      │
      ├──► Recorder.endUtterance()
      │    └── Waits 300ms flush (catches trailing OS audio buffers)
      │    └── Returns: Float32Array of raw PCM samples
      │
      ├──► Checks silence: if peak RMS < threshold → error, skip
      │
      └──► UtteranceQueue.enqueue(job)
               │
               ▼ (serial — only one job processes at a time)
           processJob(job)
               │
               ├──► Transcriber.transcribe(pcm)
               │    └── trimSilencePcm() — strips leading/trailing silence
               │    └── Calls whisper.cpp addon (C++) with raw float array
               │    └── whisper.cpp runs Whisper neural network locally
               │    └── Returns raw text string
               │
               ├──► Chain.run(rawText, ctx)  ← Cleanup pipeline
               │    └── stripFillers()       ← remove "um", "uh"
               │    └── retractions()        ← handle spoken corrections
               │    └── numberedLists()      ← format spoken lists
               │    └── lightPunctuation()   ← fix spacing/commas
               │    └── perAppRules()        ← terminal vs chat formatting
               │    └── createDictionaryStage() ← custom word fixes
               │    └── Returns: cleaned text
               │
               ├──► detectEmotion(pcm) ← analyse voice acoustics
               │    Returns: { label: "Calm", confidence: 0.88 }
               │
               └──► HistoryStore.add(entry)
                    Returns final result

      │
      ▼
Back in stopRecordingAndInject():
      ├──► clipboard.writeText(cleanedText)
      ├──► Waits 60ms (let target app regain focus)
      └──► injectTextSystemWide(text)
               │
               ├── Check: is target app elevated/admin? → clipboard only
               ├── Try: native C paste module (CGEvent Cmd+V)
               └── Fallback: AppleScript "System Events keystroke v"

      │
      ▼
Text appears in Slack / VS Code / Terminal / wherever you were typing
UI updates: history list, emotion badge, recording state = idle
```

---

## Deep Dive: Each Component Explained

### 1. The Fn Key Poller (`fn-poll.c`)

**Problem**: The macOS `fn` key is special — JavaScript event listeners often miss it because the OS intercepts it before it reaches normal apps.

**Solution**: A tiny C program compiled to a binary (`bin/fn-poll`). It uses the low-level macOS `CGEventSourceKeyState` API to poll the hardware state of key `0x3F` (the Fn virtual key) at 125 times per second (every 8ms). When the key state changes, it prints `"down"` or `"up"` to its standard output.

The Electron main process spawns this binary as a child process and reads its output line-by-line, translating it into recording state changes.

---

### 2. The Ring Buffer (`ring-buffer.ts`)

**What is a Ring Buffer?**
Imagine a circular track with 16,000 slots (1 second of audio at 16kHz). Audio samples constantly fill the track. When you reach the end, you wrap around and overwrite the oldest data. At any moment, the buffer contains exactly the last 1 second of audio.

**Why is this needed?**
When you press the Fn key, you have already started speaking. Without the pre-roll, the first syllable of your dictation would be cut off. With the ring buffer, as soon as you press the key, the recorder immediately copies the last 1000ms of audio — capturing your opening word even if you started speaking just before pressing the key.

---

### 3. The Microphone Recorder (`recorder.ts`)

Uses **naudiodon**, a Node.js wrapper around **PortAudio** (a cross-platform audio library). It opens a mono, 16kHz, 16-bit PCM audio stream from the default microphone.

- **Always running**: Even when not recording, audio flows into the ring buffer.
- **On `beginUtterance()`**: Copies pre-roll from ring buffer, then starts appending new chunks to a flat `utteranceBuffer` (up to 10 minutes max).
- **Audio level events**: Emitted per-chunk so the UI waveform animates in real time.

---

### 4. The Whisper.cpp Addon (`packages/whisper-addon/`)

**whisper.cpp** is a pure C++ implementation of OpenAI's Whisper speech recognition model. It can run the neural network entirely on CPU (or Apple Metal GPU).

The addon (`addon.cpp`) wraps whisper.cpp using **N-API** — Node.js's C++ binding interface. This lets TypeScript/JavaScript call into C++ code directly without any inter-process communication. The addon:
- Receives a `Float32Array` of PCM samples directly in memory
- Runs the Whisper inference (the actual AI neural network)
- Returns the transcribed text segments

**Models** are `.bin` files (GGUF/GGML format) downloaded from HuggingFace:

| Model | Size | RAM | Best For |
|---|---|---|---|
| `tiny.en` | 75 MB | ~300 MB | Speed, simple commands |
| `base.en` | 142 MB | ~500 MB | Default, everyday use |
| `small.en` | 466 MB | ~1.2 GB | Technical terminology |
| `medium.en` | 1.5 GB | ~2.6 GB | Accents, noisy rooms |
| `large-v3` | 3.1 GB | ~4.5 GB | Maximum accuracy, 99+ languages |

---

### 5. The Cleanup Chain (`packages/engine/stages/`)

Raw Whisper output is often messy. The Chain runs a series of deterministic text processors in order:

| Stage | What It Does | Example |
|---|---|---|
| `stripFillers` | Removes filler words | `"I um need uh coffee"` → `"I need coffee"` |
| `retractions` | Handles spoken corrections | `"start server no wait stop server"` → `"stop server"` |
| `numberedLists` | Formats spoken enumerations | `"one apples two bananas"` → `"1. apples 2. bananas"` |
| `lightPunctuation` | Fixes spacing around punctuation | `" ."` → `"."` |
| `perAppRules` | Context-aware formatting | No trailing period in Terminal commands |
| `dictionary` | Custom word replacements | `"get hub"` → `"GitHub"`, `"wispr"` → `"Wispr"` |

Each stage receives the text and the **UtteranceContext** (which app is focused, what kind it is) so it can make smarter decisions.

---

### 6. The Emotion Detector (`emotion.ts`)

**No ML model required.** The emotion classifier uses two simple acoustic signals calculated directly from the raw PCM waveform:

- **Average Amplitude** (`avgAmp`): How loud the voice is overall. Louder = more energetic.
- **Zero-Crossing Rate** (`zcr`): How many times per second the audio waveform crosses zero. High ZCR = higher-pitched, more excited speech.

These two numbers are compared against fixed thresholds to pick a label:

```
avgAmp > 0.07 AND zcr > 0.04  → Energetic
avgAmp > 0.035                 → Happy
zcr < 0.025 AND avgAmp < 0.03  → Calm
avgAmp < 0.015                 → Thoughtful
avgAmp < 0.02                  → Neutral
(default)                      → Focused
```

This runs both **live** (every 1 second during recording) and **final** (on the complete utterance PCM).

---

### 7. Context Provider (`context/provider.ts`)

When recording starts, the app needs to know: *where will this text be pasted?*

It runs an AppleScript via `osascript` to query the macOS Accessibility API:
```applescript
tell application "System Events"
  set p to first application process whose frontmost is true
  return name of p & tab & bundle identifier & tab & window title
end tell
```

The result (e.g., `"Visual Studio Code", "com.microsoft.VSCode", "main.ts"`) is classified into an `AppKind`:
- `terminal` — Terminal, iTerm, Warp, Ghostty, Alacritty, etc.
- `editor` — VS Code, Cursor, Zed, Vim, Neovim, etc.
- `chat` — Slack, Discord, WhatsApp, Teams, etc.
- `browser` — Safari, Chrome, Firefox, Arc, etc.
- `other` — anything else

This context is passed to the cleanup chain and text injector to make smarter decisions.

---

### 8. Text Injector (`text-injector.ts` + `paste.c`)

**Step 1**: Copy text to the system clipboard via Electron's `clipboard.writeText()`.

**Step 2**: Simulate pressing Cmd+V in the previously-focused app.

Three methods tried in order:
1. **Native C addon** (`paste.c`): Uses macOS `CGEventCreateKeyboardEvent` to fire a real hardware-level Cmd+V event. Most reliable.
2. **AppleScript fallback**: `osascript -e 'tell application "System Events" to keystroke "v" using command down'`. Works if Automation permission is granted.
3. **Clipboard only**: If in an elevated (admin) process or permissions are not available, just leaves text on clipboard — user presses Cmd+V manually.

---

### 9. Electron Main Process (`electron/main.ts`)

This is the **orchestrator**. It runs in Node.js with full OS access and:

- Creates two windows:
  - **Main window**: The settings/history UI (1080×740, with hidden title bar)
  - **Overlay window**: A 360×72 transparent floating pill that shows recording status, always on top, non-focusable (so it does not steal focus from your work)
- Manages the **hotkey state machine**:
  - Hold Fn → push-to-talk (release Fn to stop)
  - Fn + Space → hands-free lock (tap Fn again to stop)
  - Cmd+Option+Space → alternative shortcut (works without Accessibility)
  - Shift+C → re-paste last dictation
- Handles **IPC** (Inter-Process Communication) between the Electron backend and the React frontend

---

### 10. The Preload Script (`preload.ts`)

Electron runs the React UI in a sandboxed browser context (like a normal webpage) — it has no direct access to Node.js APIs.

The preload script acts as a **secure bridge**. It uses `contextBridge.exposeInMainWorld` to selectively expose safe methods to the React code via `window.electronAPI`:

```
React UI                    Preload Bridge              Electron Main
─────────────────────────────────────────────────────────────────────
window.electronAPI          contextBridge               ipcMain.handle()
  .startDictation()    ──►  ipcRenderer.invoke()  ──►  startRecordingSession()
  .onAudioLevel(cb)    ◄──  ipcRenderer.on()      ◄──  pipeline.emit('audio_level')
```

The UI can never directly call Node.js — it must go through this bridge. This is a security feature.

---

### 11. The React UI (`src/App.tsx`)

A single React component that renders two very different UIs depending on a URL query param:

**Main Window** (`?overlay` absent):
- Setup wizard (download model on first launch)
- Live microphone waveform animation
- Emotion badge with real-time updates
- Settings panel: model selection, permission checks
- Clipboard/dictation history list
- Permission status indicators (Microphone, Accessibility)

**Overlay Window** (`?overlay=1`):
- Minimal floating pill: recording indicator + waveform bars
- Disappears when recording stops (shown with `showInactive()` so it never steals focus)

---

## The IPC Message Bus

Everything between the Electron backend and the React frontend flows through named IPC channels:

| Channel | Direction | Meaning |
|---|---|---|
| `recording_state_changed` | Main → UI | isRecording, isProcessing changed |
| `audio_level` | Main → UI | Current mic level (0.0–1.0) |
| `live_emotion` | Main → UI | Emotion detected mid-utterance |
| `dictation_result` | Main → UI | Final: text + emotion + where it was pasted |
| `partial_transcript` | Main → UI | Live streaming partial text |
| `utterance_context` | Main → UI | Which app is focused |
| `pipeline_ready` | Main → UI | Models loaded, ready to record |
| `pipeline_error` | Main → UI | Something went wrong |
| `download_progress` | Main → UI | Model download % |
| `start_dictation` | UI → Main | User pressed record button |
| `stop_dictation` | UI → Main | User pressed stop button |
| `select_model` | UI → Main | User changed model |
| `download_model` | UI → Main | User clicked download |

---

## Build System

The project is a **Bun monorepo** (Bun is a fast JavaScript runtime + package manager).

### Key Build Steps

```bash
bun run setup
```
Runs in sequence:
1. `bun install` — installs all Node.js packages
2. `build:whisper-addon` — compiles `whisper.cpp` + `addon.cpp` via CMake into `addon.node`
3. `build:paste-helper` — compiles `paste.c` with Clang into `bin/paste-helper`
4. `build:fn-poll` — compiles `fn-poll.c` with Clang into `bin/fn-poll`

### The Native Addon (whisper-addon)

```
CMakeLists.txt
  → Links: whisper.cpp library + Node.js N-API headers
  → Compiles: addon.cpp
  → Output: whisper.cpp/build/Release/addon.node
```

`addon.node` is a compiled C++ shared library that Node.js loads with `require()`. It runs the Whisper neural network in the same process as Electron — no subprocess, no IPC latency.

### Development Mode

```bash
bun run dev
```
- Starts Vite dev server for React hot-reload
- Launches Electron pointing at the Vite dev server URL
- The `VITE_DEV_SERVER_URL` env var tells Electron to load from localhost

### Production Build

```bash
bun run build:app
```
- Vite builds React into `packages/desktop/dist/`
- `electron-builder` packages everything into a `.dmg` for macOS
- The `addon.node`, `paste-helper`, and `fn-poll` binaries are bundled into the app

---

## macOS Permissions Required

The app needs three macOS permissions to function:

| Permission | Why Needed | Where to Grant |
|---|---|---|
| **Microphone** | To capture audio | System Settings → Privacy → Microphone |
| **Accessibility** | To detect Fn key globally and simulate Cmd+V | System Settings → Privacy → Accessibility |
| **Automation** | For the AppleScript fallback to control System Events | System Settings → Privacy → Automation |

If permissions are missing, the app gracefully degrades:
- No Accessibility → fallback to Cmd+Option+Space hotkey
- No Automation → text is copied to clipboard only (manual Cmd+V)
- No Microphone → shows error message

---

## Data Flow Summary (One Sentence Each)

1. **Fn key down** → C binary detects it → Electron starts recording session
2. **AppleScript** → finds which app is focused → saves context
3. **PortAudio** → raw PCM audio from microphone → ring buffer (always) + utterance buffer (while recording)
4. **Fn key up** → recorder stops → PCM array handed to job queue
5. **Transcriber** → PCM array → C++ whisper.cpp neural network → raw text
6. **Chain** → raw text + context → cleaned/corrected text
7. **Emotion detector** → PCM array → amplitude + zero-crossing rate → emotion label
8. **Text injector** → puts text on clipboard → fires Cmd+V via C binary or AppleScript
9. **History store** → saves entry in memory → UI list updates
10. **IPC** → sends result to React UI → emotion badge, history entry update

---

## The Website (`website/`)

A separate **Next.js** app (not part of the Electron app). It is a marketing landing page that:
- Shows the app features and download link
- Hosts the `/api/version` endpoint that the Electron app polls on startup to check for updates
- Deployed separately (e.g., Vercel)

---

## Key Design Decisions (Why Things Are The Way They Are)

| Decision | Reason |
|---|---|
| **Local AI only** | Privacy: audio never leaves the machine |
| **Pre-roll ring buffer** | Never cut off the first syllable of speech |
| **Serial utterance queue** | whisper.cpp is not thread-safe — one transcription at a time |
| **Two separate windows** | Overlay must never steal focus from the app you are dictating into |
| **C binary for Fn key** | JavaScript cannot reliably detect the macOS Fn key |
| **C binary for paste** | Most reliable way to simulate Cmd+V system-wide on macOS |
| **Acoustic emotion (no ML model)** | Fast, no extra download, works offline, no model load time |
| **Cleanup chain (deterministic)** | Predictable, auditable, no AI hallucination risk in post-processing |
| **Bun monorepo** | Faster installs than npm/yarn, single lock file, workspace support |
