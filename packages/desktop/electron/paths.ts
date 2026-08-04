import path from 'path';
import fs from 'fs';
import { app } from 'electron';

export const DEFAULT_MODEL_ID = 'base.en';

export function getBackendPath(): string {
  const isDev = process.env.VITE_DEV_SERVER_URL !== undefined || !app.isPackaged;
  if (isDev) {
    return path.resolve(process.cwd(), '../../packages/engine');
  }
  return path.join(process.resourcesPath, 'packages', 'engine');
}

/** Repo root (parent of packages/engine/) — whisper.cpp and models/ live here in dev. */
export function getRepoRoot(): string {
  const isDev = process.env.VITE_DEV_SERVER_URL !== undefined || !app.isPackaged;
  if (isDev) {
    return path.resolve(process.cwd(), '../../');
  }
  return path.join(process.resourcesPath);
}

export function getModelsDirPath(): string {
  const isDev = process.env.VITE_DEV_SERVER_URL !== undefined || !app.isPackaged;
  if (isDev) {
    const backendPath = getBackendPath();
    const backendModels = path.join(backendPath, 'models');
    if (fs.existsSync(backendModels)) {
      return backendModels;
    }
    return path.join(getRepoRoot(), 'models');
  }
  // Production: Models must be mutable, store in user data directory
  return path.join(app.getPath('userData'), 'models');
}

export function getWhisperAddonPath(): string {
  const candidates = [
    path.join(getRepoRoot(), 'whisper.cpp', 'build', 'Release', 'addon.node'),
    path.join(getBackendPath(), 'whisper.cpp', 'build', 'Release', 'addon.node'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0]!;
}

/** All directories to search when resolving native Node modules (naudiodon, onnxruntime). */
export function getNativeModuleSearchPaths(): string[] {
  const backend = getBackendPath();
  const repo = getRepoRoot();
  return [backend, repo, process.cwd()];
}

