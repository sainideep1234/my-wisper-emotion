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

/** Candidate paths for a Whisper model filename. */
export function getModelFileCandidates(filename: string): string[] {
  const backend = getBackendPath();
  const repo = getRepoRoot();
  let userDataModels = '';
  try {
    userDataModels = path.join(app.getPath('userData'), 'models');
  } catch (e) {
    // In some child processes app.getPath might fail if electron app isn't ready
  }

  const candidates = [
    path.join(backend, 'models', filename),
    path.join(backend, 'models', 'whisper', filename),
    path.join(repo, 'models', filename),
    path.join(repo, 'models', 'whisper', filename),
    path.resolve(process.cwd(), '../../packages/engine/models', filename),
    path.resolve(process.cwd(), '../../models', filename),
  ];

  if (userDataModels) {
    candidates.unshift(path.join(userDataModels, 'whisper', filename));
    candidates.unshift(path.join(userDataModels, filename));
  }

  return candidates;
}

export function findModelFile(filename: string): string | null {
  for (const p of getModelFileCandidates(filename)) {
    if (fs.existsSync(p)) {
      try {
        if (fs.statSync(p).size > 10 * 1024 * 1024) {
          return p;
        }
      } catch {
        // skip unreadable paths
      }
    }
  }
  return null;
}
