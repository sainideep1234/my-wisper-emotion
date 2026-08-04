import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { DMG_FILENAME } from '@/lib/download';

export const runtime = 'nodejs';

export async function GET() {
  // DMG_URL = plain server-side env var (set in Vercel → Settings → Env Vars)
  // NEXT_PUBLIC_DMG_URL = build-time baked var (fallback)
  const externalUrl = process.env.DMG_URL || process.env.NEXT_PUBLIC_DMG_URL;
  if (externalUrl) {
    return NextResponse.redirect(externalUrl, 302);
  }

  const dmgPath = path.join(process.cwd(), 'public', 'downloads', DMG_FILENAME);

  if (!fs.existsSync(dmgPath)) {
    return NextResponse.json(
      {
        error: 'DMG not found.',
        hint: 'Run `bash scripts/build-release.sh` from the repo root, then restart the website.',
        filename: DMG_FILENAME,
      },
      { status: 404 },
    );
  }

  const stat = fs.statSync(dmgPath);

  // Reject placeholder/stub files (< 1 MB)
  if (stat.size < 1_000_000) {
    return NextResponse.json(
      {
        error: 'DMG file is a placeholder, not a real build.',
        hint: 'Run `bash scripts/build-release.sh` to produce the installable DMG.',
        sizeBytes: stat.size,
      },
      { status: 503 },
    );
  }

  const fileBuffer = fs.readFileSync(dmgPath);

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': 'application/x-apple-diskimage',
      'Content-Disposition': `attachment; filename="${DMG_FILENAME}"`,
      'Content-Length': String(stat.size),
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
