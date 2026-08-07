/**
 * Last-resort fallback only — used when the GitHub releases API is unreachable.
 * The live version comes from the latest GitHub release (see app/api/version),
 * so this going stale no longer breaks update checks.
 * Keep in sync with the root package.json.
 */
export const APP_VERSION = '1.0.15';

export const DMG_FILENAME = `Wisper-${APP_VERSION}-arm64.dmg`;

/**
 * Public download URL for the macOS DMG.
 * Points to our dynamic Next.js API route which resolves the latest GitHub Release asset.
 */
export function getDownloadUrl(): string {
  return '/api/download/mac';
}
