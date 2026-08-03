# ADR 002: Ring Buffer Pre-Roll vs On-Demand Capture

## Status
Accepted

## Context
When a user presses a hotkey to dictate, they intuitively begin speaking at the exact millisecond they press the key, or even slightly before it bottoms out. 
If the application waits for the OS `keyDown` event to initialize the microphone and begin streaming, the first 200-400ms of audio is lost. This results in the classic "first syllable cut-off" problem (e.g., "Hello" becomes "lo").

## Decision
We implemented a continuously running microphone loop that writes 16kHz mono audio into a fixed-size circular buffer (a `RingBuffer`), preserving a rolling 1000ms "pre-roll" of audio.

## Rationale
- **Zero Data Loss**: When the hotkey is pressed, the system instantly grabs the last 1000ms of audio from the Ring Buffer. This guarantees that even if the user spoke slightly before the key press registered, their speech is captured perfectly.
- **Resource Efficiency**: A 1000ms buffer of 16kHz Float32 audio requires only 64 KB of memory. Keeping the `naudiodon` stream open in the background consumes negligible CPU (< 0.1%). 
- **Simplicity**: This approach avoids complex OS-level audio buffering hooks and keeps the logic entirely within the Node.js domain.

## Consequences
- **Positive**: Perfect dictation accuracy on the first word. The system feels instantly responsive.
- **Negative**: The microphone is constantly "hot" at the OS level. The user will see an active microphone indicator (e.g., the orange dot in the macOS menu bar) as long as the app is running. This requires clear messaging in our privacy policy and documentation that audio is strictly stored in a tiny volatile ring buffer and never saved or transmitted until the explicit trigger is pressed.
