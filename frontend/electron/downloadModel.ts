import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { AVAILABLE_MODELS } from '../../backend/sidecar/pipeline.ts';
import { getBackendPath } from './paths.js';

export type DownloadProgressCallback = (data: {
  modelId: string;
  percent: number;
  done: boolean;
  error?: string;
}) => void;

export function isModelDownloaded(modelId: string): boolean {
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (!model) return false;

  const destPath = path.join(getBackendPath(), 'models', 'whisper', model.filename);
  return fs.existsSync(destPath) && fs.statSync(destPath).size > 10 * 1024 * 1024;
}

export function downloadModelById(
  modelId: string,
  onProgress: DownloadProgressCallback,
): Promise<{ success: boolean; already?: boolean; error?: string }> {
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (!model) return Promise.resolve({ success: false, error: 'Unknown model' });

  const whisperDir = path.join(getBackendPath(), 'models', 'whisper');
  fs.mkdirSync(whisperDir, { recursive: true });
  const destPath = path.join(whisperDir, model.filename);

  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 10 * 1024 * 1024) {
    onProgress({ modelId, percent: 100, done: true });
    return Promise.resolve({ success: true, already: true });
  }

  onProgress({ modelId, percent: 0, done: false });

  return new Promise((resolve) => {
    const curlCmd = `curl -fL --progress-bar -o "${destPath}" "${model.downloadUrl}" 2>&1`;
    const child = exec(curlCmd, { maxBuffer: 1024 * 1024 * 10 });

    child.stdout?.on('data', (chunk: string) => {
      const match = chunk.match(/(\d+(?:\.\d+)?)\s*%/);
      if (match) {
        onProgress({ modelId, percent: Math.round(parseFloat(match[1])), done: false });
      }
    });

    child.stderr?.on('data', (chunk: string) => {
      const match = chunk.match(/(\d+(?:\.\d+)?)\s*%/);
      if (match) {
        onProgress({ modelId, percent: Math.round(parseFloat(match[1])), done: false });
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        onProgress({ modelId, percent: 100, done: true });
        resolve({ success: true });
      } else {
        onProgress({ modelId, percent: 0, done: true, error: 'Download failed' });
        resolve({ success: false, error: `curl exited with code ${code}` });
      }
    });
  });
}
