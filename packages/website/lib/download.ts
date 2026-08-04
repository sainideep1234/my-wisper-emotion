/** App version — keep in sync with frontend/package.json */
export const APP_VERSION = '1.0.0';

export const DMG_FILENAME = `Wisper-Emotion-${APP_VERSION}-arm64.dmg`;

/**
 * Public download URL for the macOS DMG.
 * - Set NEXT_PUBLIC_DMG_URL for GitHub Releases / CDN (recommended for production).
 * - Falls back to the local API route that serves from public/downloads/.
 */
export function getDownloadUrl(): string {
  if (process.env.NEXT_PUBLIC_DMG_URL) {
    return process.env.NEXT_PUBLIC_DMG_URL;
  }
  return `https://github.com/sainideep1234/my-wisper-emotion/releases/latest/download/${DMG_FILENAME}`;
}
