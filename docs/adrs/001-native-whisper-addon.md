# ADR 001: Native whisper.cpp Addon vs Python/API

## Status
Accepted

## Context
Wisper Emotion requires extremely fast, accurate, and private speech-to-text.
We evaluated several options for the transcription engine:
1. Cloud APIs (OpenAI Whisper API, Deepgram).
2. Local Python server running `transformers` or `faster-whisper`.
3. Native Node C++ Addon wrapping `whisper.cpp`.

## Decision
We chose **Option 3**: A Native Node C++ Addon wrapping `whisper.cpp`.

## Rationale
- **Zero Network Latency**: Cloud APIs introduce unpredictable network latency (300ms - 1000ms) and compromise user privacy. Given this tool is used for system-wide dictation, sending every utterance to the cloud is unacceptable.
- **Zero IPC / Disk I/O Overhead**: A separate Python server (Option 2) requires serializing audio chunks, communicating via WebSockets/HTTP, or writing audio to temporary `.wav` files on disk. By using a native Node addon (N-API), we pass the raw `Float32Array` PCM buffer directly from JavaScript memory into C++ memory. This eliminates IPC overhead and disk I/O entirely.
- **Distribution**: Bundling a Python environment within an Electron app is notoriously fragile and bloated. `whisper.cpp` compiles to a single, lightweight binary module (`addon.node`) that is trivial to package with `electron-builder`.

## Consequences
- **Positive**: Blistering fast inference speeds. Highly maintainable Electron packaging. Complete offline privacy.
- **Negative**: We must manage cross-platform C++ compilation via `cmake-js`. Upgrading the underlying Whisper implementation requires syncing with the `whisper.cpp` upstream repository.
