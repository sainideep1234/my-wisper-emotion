/** App version — keep in sync with frontend/package.json */
export const APP_VERSION = '1.0.0';

export const DMG_FILENAME = `Wisper-Emotion-${APP_VERSION}-arm64.dmg`;

/**
 * Public download URL for the macOS DMG.
 * Points to our dynamic Next.js API route which resolves the latest GitHub Release asset.
 */
export function getDownloadUrl(): string {
  return '/api/download/mac';
}
