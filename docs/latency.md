# Latency Profile

Wisper Emotion is optimized for low-latency dictation. This document outlines the exact latency characteristics, where time is spent, and the engineering trade-offs made to achieve sub-200ms transcription.

## Audio Specifications
- **Sample Rate**: 16,000 Hz
- **Channels**: 1 (Mono)
- **Format**: Float32 (converted internally from Int16 LE)
- **Frame Duration**: 20ms (320 samples)

## Latency Breakdown

When a user releases the dictation hotkey, the time until the text appears on screen is governed by four phases:

### 1. Finalization & Trimming (~5 - 15ms)
- **OS Audio Flush**: The `Recorder` waits a brief 300ms (configurable) after hotkey release to ensure in-flight OS audio buffers from PortAudio arrive. This prevents cutting off the final trailing consonant.
- **Silence Trimming**: `trimSilencePcm` scans the buffer from both ends in 20ms frames using an RMS threshold (`0.003`). It retains a safety margin of 150ms. This operation takes < 1ms.

### 2. Whisper Inference (Model Dependent)
This is the primary source of latency. Because `whisper.cpp` runs in-memory without disk I/O, latency is purely a function of the model size and system hardware (e.g., Apple Silicon Neural Engine / GPU).

*Approximate inference times for a 3-second audio clip on an M2 Pro chip:*
- **tiny.en (75 MB)**: ~60ms
- **base.en (142 MB)**: ~120ms *(Default)*
- **small.en (466 MB)**: ~350ms
- **medium.en (1.5 GB)**: ~800ms
- **large-v3 (3.1 GB)**: ~2000ms

### 3. Post-Processing Chain (< 2ms)
The string manipulation chain (Fillers, Retractions, Dictionary, Punctuation) uses highly optimized regular expressions. Even on long transcripts, this entire chain executes in less than 2 milliseconds.

### 4. Text Injection (~10 - 50ms)
- **Clipboard Paste**: Writing to the macOS pasteboard and simulating `Cmd+V` takes ~10-20ms.
- **Keystroke Simulation**: Simulating individual keystrokes takes ~2ms per character. (Used for short snippets to avoid polluting clipboard history).

---

## Trade-offs and Engineering Decisions

### Why a 1000ms Pre-Roll?
- **Trade-off**: Memory overhead (holding 16,000 samples continuously).
- **Benefit**: Zero startup latency. If the system waited for the hotkey press to initialize the audio stream, the first 200-400ms of speech would be lost due to OS-level initialization delays. The ring buffer guarantees perfect capture.

### Why not use continuous VAD for triggering?
- **Trade-off**: The user must hold a hotkey (push-to-talk).
- **Benefit**: Voice Activity Detection (VAD) is notoriously prone to false positives (background noise, throat clearing) and false negatives (soft speech). By requiring an explicit physical trigger, we eliminate "hallucinated" transcripts and save battery by keeping the heavy Whisper model completely idle until explicitly summoned.

### Why whisper.cpp over Server APIs?
- **Trade-off**: The app bundle is larger, and transcription quality is bound by local hardware.
- **Benefit**: Network latency (typically 300-800ms round-trip for cloud APIs) is completely eliminated. Furthermore, total privacy is guaranteed.
