import fs from 'fs';
import path from 'path';
import https from 'https';
import { getModelsDirPath, findModelFile } from './paths.js';
import { AVAILABLE_MODELS } from '../../engine/pipeline.ts';

export function isModelDownloaded(modelId: string): boolean {
  const modelInfo = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (!modelInfo) return false;

  const found = findModelFile(modelInfo.filename);
  if (found) {
    modelInfo.downloaded = true;
    return true;
  }
  return false;
}

export function downloadModelById(
  modelId: string,
  onProgress: (data: { modelId: string; percent: number; done: boolean; error?: string }) => void
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const modelInfo = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!modelInfo) {
      const err = `Model ${modelId} not found in available models catalog`;
      onProgress({ modelId, percent: 0, done: true, error: err });
      return resolve({ success: false, error: err });
    }

    const modelsDir = getModelsDirPath();
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }

    const targetPath = path.join(modelsDir, modelInfo.filename);
    const tempPath = `${targetPath}.tmp`;

    const request = (url: string) => {
      https.get(url, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return request(response.headers.location);
        }

        if (response.statusCode !== 200) {
          const err = `HTTP error ${response.statusCode}`;
          onProgress({ modelId, percent: 0, done: true, error: err });
          return resolve({ success: false, error: err });
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        const fileStream = fs.createWriteStream(tempPath);

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
          onProgress({ modelId, percent, done: false });
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            try {
              if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
              fs.renameSync(tempPath, targetPath);
              modelInfo.downloaded = true;
              onProgress({ modelId, percent: 100, done: true });
              resolve({ success: true });
            } catch (e: any) {
              onProgress({ modelId, percent: 0, done: true, error: e.message });
              resolve({ success: false, error: e.message });
            }
          });
        });

        fileStream.on('error', (err) => {
          try { fs.unlinkSync(tempPath); } catch (e) {}
          onProgress({ modelId, percent: 0, done: true, error: err.message });
          resolve({ success: false, error: err.message });
        });
      }).on('error', (err) => {
        onProgress({ modelId, percent: 0, done: true, error: err.message });
        resolve({ success: false, error: err.message });
      });
    };

    request(modelInfo.downloadUrl);
  });
}
