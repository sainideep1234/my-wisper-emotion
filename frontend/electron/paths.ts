import { app } from 'electron';
import path from 'path';

/** Resolve backend root — dev uses repo sibling; packaged app uses extraResources. */
export function getBackendPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend');
  }
  return path.resolve(app.getAppPath(), '../backend');
}

export const DEFAULT_MODEL_ID = 'base.en';
