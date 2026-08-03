#!/usr/bin/env bash
# Download Silero VAD + DiSER v2 ONNX + Whisper base.en into models/
# Skips any file that already exists (and looks non-empty / large enough).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VAD_DIR="$ROOT/models/vad"
EMOTION_DIR="$ROOT/models/emotion"
WHISPER_DIR="$ROOT/models/whisper"

mkdir -p "$VAD_DIR" "$EMOTION_DIR/preprocessor" "$WHISPER_DIR"

VAD_MODEL="$VAD_DIR/silero_vad_16k_op15.onnx"
if [[ -f "$VAD_MODEL" ]] && [[ "$(wc -c < "$VAD_MODEL")" -gt 100000 ]]; then
  echo "Keeping existing Silero VAD ($(du -h "$VAD_MODEL" | cut -f1))."
else
  echo "Downloading Silero VAD (snakers4/silero-vad)…"
  curl -fsSL \
    "https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad_16k_op15.onnx" \
    -o "$VAD_MODEL"
fi

CONFIG="$EMOTION_DIR/config.json"
PREPROC="$EMOTION_DIR/preprocessor_config.json"
PREPROC_NESTED="$EMOTION_DIR/preprocessor/preprocessor_config.json"
if [[ -f "$CONFIG" ]] && [[ -f "$PREPROC" ]] && [[ -f "$PREPROC_NESTED" ]]; then
  echo "Keeping existing DiSER config/preprocessor."
else
  echo "Downloading DiSER v2 config/preprocessor (shrey416/DiSER_v2_ONNX)…"
  curl -fsSL "https://huggingface.co/shrey416/DiSER_v2_ONNX/resolve/main/config.json" \
    -o "$CONFIG"
  curl -fsSL "https://huggingface.co/shrey416/DiSER_v2_ONNX/resolve/main/preprocessor/preprocessor_config.json" \
    -o "$PREPROC"
  cp "$PREPROC" "$PREPROC_NESTED"
fi

# HF only ships a broken graph-only ONNX (~1.6MB). Prefer a local self-contained export.
ONNX="$EMOTION_DIR/ser_wavlm.onnx"
if [[ -f "$ONNX" ]] && [[ "$(wc -c < "$ONNX")" -gt 10000000 ]]; then
  echo "Keeping existing self-contained ser_wavlm.onnx ($(du -h "$ONNX" | cut -f1))."
else
  echo ""
  echo "NOTE: HF DiSER_v2_ONNX ONNX is incomplete (missing weights)."
  echo "  Re-export a working model from the PyTorch checkpoint:"
  echo "    curl -L https://huggingface.co/shrey416/DiSER/resolve/main/best_model.pt \\"
  echo "      -o models/emotion/_export/best_model.pt"
  echo "    .venv-export/bin/python script/export-emotion-onnx.py"
fi

WHISPER_MODEL="$WHISPER_DIR/ggml-base.en.bin"
if [[ -f "$WHISPER_MODEL" ]] && [[ "$(wc -c < "$WHISPER_MODEL")" -gt 100000000 ]]; then
  echo "Keeping existing ggml-base.en.bin ($(du -h "$WHISPER_MODEL" | cut -f1))."
else
  echo "Downloading Whisper base.en (ggerganov/whisper.cpp)…"
  curl -fL \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" \
    -o "$WHISPER_MODEL"
fi

echo "Done."
ls -lah "$VAD_DIR" "$EMOTION_DIR" "$WHISPER_DIR"
