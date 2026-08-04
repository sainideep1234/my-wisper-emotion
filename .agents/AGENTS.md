# Workspace Agent Rules & Indexing Guidelines

## Indexing & `@` Mention Autocomplete Rules

- **Workspace File Indexing**: All active project source files across `packages/`, `frontend/`, `backend/`, `website/`, `docs/`, `scripts/`, `bin/`, and `build/` are indexed for `@` mention discovery.
- **Watcher Exclusions**: Massive dependency folders (`node_modules/`, `whisper.cpp/`, `release/mac-arm64/`) and binary assets (`*.pak`, `*.dylib`, `*.bin`, `*.onnx`) are excluded via `.vscode/settings.json` and `.geminiignore` to prevent OS file descriptor exhaustion and keep `@` autocomplete fast.
- **New & Renamed Files**: Newly created files in any workspace subfolder are automatically picked up by the file watcher and instantly available via `@` mention.
