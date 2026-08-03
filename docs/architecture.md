# Architecture Overview

Wisper Emotion uses a deterministic, linear pipeline to capture audio, run speech-to-text inference, and inject the result into the system. This document explains the core components and data flow.

## 1. Hotkey & Context Triggering

The entry point to the system is a global hotkey capture (e.g., holding `fn`). This is managed by `uiohook-napi` in the Electron main process (`packages/desktop/electron/main.ts`).

When triggered, the system captures the **UtteranceContext** via the `ContextProvider`. This records:
- The active executable (e.g., `com.microsoft.VSCode`).
- The window title.
- Whether the application is a terminal.

This context is passed down the pipeline so that the cleanup stages know how to format the text (e.g., omitting trailing punctuation in a terminal).

## 2. Audio Capture & Pre-Roll (RingBuffer)

The `Recorder` (`packages/engine/recorder/recorder.ts`) uses `naudiodon` to constantly capture audio at 16kHz mono. 

Because humans often start speaking exactly as (or even slightly before) they press a hotkey, starting the microphone *after* the hotkey is pressed results in clipped audio (the "first syllable cut-off" problem).

To solve this, the `Recorder` is always running, writing into a fixed-size `RingBuffer` (`packages/engine/recorder/ring-buffer.ts`). By default, it holds 1000ms of "pre-roll". 

When the user triggers dictation:
1. The 1000ms pre-roll is immediately copied into an `utteranceBuffer`.
2. Subsequent audio chunks are appended to this buffer.
3. When the user releases the hotkey, the buffer is finalized, trimmed of trailing silence, and sent to the next stage.

## 3. Streaming (Optional)

The pipeline supports an optional `Streamer` stage for real-time transcription feedback. If enabled, the `Recorder` periodically emits a partial snapshot of the `utteranceBuffer`. The Streamer uses a **LocalAgreement-2** algorithm to emit "committed" words (words that have appeared identically in consecutive Whisper partial passes) so the UI can type them out before the user even finishes speaking.

## 4. Inference Worker (Transcriber)

Once the utterance is complete, it is queued for inference. 
The `Transcriber` (`packages/engine/worker/transcriber.ts`) wraps `whisper.cpp` using a native Node C++ Addon. 
- The raw Float32Array PCM data is passed directly into C++ memory.
- There is zero disk I/O.
- The `whisper.cpp` engine runs inference (often using Metal/GPU acceleration on macOS).

## 5. Cleanup Chain

Raw Whisper output often contains filler words ("um", "uh"), hesitations, or unwanted punctuation. 
The text is passed through the `Chain` (`packages/engine/stages/base.ts`), a series of sequential processors:

1. **Fillers**: Uses regex boundaries to strip common hesitations.
2. **Retractions**: Looks for phrases like "no wait" or "scratch that" to delete the preceding words.
3. **Punctuation**: Strips or modifies punctuation based on the `UtteranceContext`. For example, `perAppRules` ensures terminal commands don't end in periods.
4. **Dictionary**: Applies custom word replacements (e.g., "swara" -> "Svara").

## 6. Text Injection

The final, clean string is sent to the `TextInjector` (`packages/desktop/electron/text-injector.ts`).
Depending on the length of the string and user settings, it is injected either via simulated keystrokes (using `uiohook-napi`) or by securely placing it on the clipboard and triggering `Cmd+V`. 

## 7. Emotion Detection

Concurrently with transcription, the raw PCM data is passed to `detectEmotion` (`packages/engine/emotion.ts`), which analyzes the RMS energy, zero-crossing rate, and cadence to output an acoustic emotion label (e.g., "Energetic", "Calm"). This label is saved alongside the transcript in the `HistoryStore`.
