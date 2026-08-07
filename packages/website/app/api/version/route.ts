import { NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/download';

export const runtime = 'nodejs';

const GITHUB_LATEST =
  'https://api.github.com/repos/sainideep1234/my-wisper-emotion/releases/latest';
const RELEASES_PAGE =
  'https://github.com/sainideep1234/my-wisper-emotion/releases/latest';

/**
 * The desktop app polls this on startup and compares `version` against its own
 * (see checkForUpdates in packages/desktop/electron/main.ts). It must report the
 * version actually published on GitHub — when this was a hardcoded constant it
 * fell behind the shipped app, so the comparison never found a newer version
 * and the in-app update banner could never fire.
 *
 * `downloadUrl` has to be absolute: the app hands it straight to
 * shell.openExternal, which cannot resolve a site-relative path.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const fallbackUrl = `${origin}/api/download/mac`;

  try {
    const res = await fetch(GITHUB_LATEST, {
      // Cache briefly so a burst of app launches can't exhaust the unauthenticated
      // GitHub rate limit, while still picking up a new release promptly.
      next: { revalidate: 300 },
      headers: { Accept: 'application/vnd.github.v3+json' },
    });

    if (!res.ok) {
      return NextResponse.json({
        version: APP_VERSION,
        downloadUrl: fallbackUrl,
        notes: 'Update available.',
      });
    }

    const data = await res.json();
    const version = String(data.tag_name ?? APP_VERSION).replace(/^v/, '');
    const dmgAsset = data.assets?.find((a: any) => a.name?.endsWith('.dmg'));

    return NextResponse.json({
      version,
      downloadUrl: dmgAsset?.browser_download_url ?? data.html_url ?? fallbackUrl,
      notes: data.name || `Wisper ${version} is available.`,
    });
  } catch {
    return NextResponse.json({
      version: APP_VERSION,
      downloadUrl: fallbackUrl,
      notes: 'Update available.',
    });
  }
}
