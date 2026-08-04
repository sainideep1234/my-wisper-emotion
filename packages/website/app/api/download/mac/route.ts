import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Fetch the latest release from the GitHub API
    // Revalidate every 3600 seconds (1 hour) to cache the response and avoid rate limits
    const res = await fetch(
      'https://api.github.com/repos/sainideep1234/my-wisper-emotion/releases/latest',
      {
        next: { revalidate: 3600 },
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!res.ok) {
      // Fallback: If GitHub API fails or rate limits, redirect to the latest release page
      return NextResponse.redirect('https://github.com/sainideep1234/my-wisper-emotion/releases/latest');
    }

    const data = await res.json();
    
    // Find the first asset that ends with .dmg
    const dmgAsset = data.assets?.find((asset: any) => asset.name.endsWith('.dmg'));

    if (dmgAsset && dmgAsset.browser_download_url) {
      // Direct the user to the actual file download URL
      return NextResponse.redirect(dmgAsset.browser_download_url);
    }

    // Fallback if no .dmg asset is found in the latest release
    return NextResponse.redirect(data.html_url || 'https://github.com/sainideep1234/my-wisper-emotion/releases/latest');
  } catch (error) {
    // Fallback on any fetch errors
    return NextResponse.redirect('https://github.com/sainideep1234/my-wisper-emotion/releases/latest');
  }
}
