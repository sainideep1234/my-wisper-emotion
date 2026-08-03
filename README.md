# my-wisper-emotion

System-wide dictation (macOS Electron + whisper.cpp) with a Svara-style pipeline:

```
hotkey ──► Recorder ──────────────► streamer ──► injector ──► your app
 │         (pre-roll ring buffer)      │  live partials, LocalAgreement-2
 │                   opm                  │
 └──► ContextProvider                  └──► queue ──► worker
        exe · title · locale                          │
        terminal? chat?                               ├─► Transcriber (whisper.cpp)
              │                                       ├─► Chain  (cleanup)
              └──────────► UtteranceContext ──────────┴─► TextInjector
                           (frozen, shared by stages)         │
                                                              └─► History
```

- **Mic**: naudiodon — 16 kHz mono, always-on pre-roll (~1 s)
- **STT**: whisper.cpp Node addon — pcmf32 in memory (never written to disk)
- **Streaming**: rolling re-transcribe + LocalAgreement-2 word commit
- **Cleanup**: fillers → retractions → lists → punctuation → per-app → dictionary
- **Inject**: clipboard + paste-helper (macOS) / SendKeys (Windows)

## Setup

```bash
brew install portaudio cmake
bun run setup          # models + whisper addon + paste-helper + frontend deps
```

Or step by step:

```bash
bun install
bun run build:whisper-addon
bun run build:paste-helper
cd packages/desktop && bun install
bash ../../scripts/fix-naudiodon-portaudio.sh   # Electron ABI for naudiodon
```

## Run

```bash
# Desktop app (tray overlay + system-wide inject)
bun run dev

# CLI live mic → VAD → Whisper (no Electron)
bun start

# Mic → Whisper smoke test (Ctrl+C to stop & transcribe)
bun run test:dictation

# LocalAgreement-2 unit check
bun run test:agreement
```

**Hotkeys (Electron)**

| Gesture | Action |
|---------|--------|
| Hold `fn` | Push-to-talk |
| `fn` + Space | Hands-free lock |
| `⌘ ⌥ Space` | Toggle (no Accessibility needed) |
| Shift+C | Re-paste last dictation |

Grant **Microphone** + **Accessibility** (for `fn`) + **Automation → System Events** (for auto-paste) under System Settings → Privacy & Security.

## Layout

```
packages/engine/     composition root + pipeline stages
  context/           ContextProvider, UtteranceContext
  recorder/          RingBuffer + always-on Recorder
  streamer/          LocalAgreement-2 + Streamer
  stages/            cleanup Chain stages
  worker/            Transcriber + serial queue
packages/desktop/electron/   hotkey, overlay, TextInjector
models/              whisper / vad weights
```
