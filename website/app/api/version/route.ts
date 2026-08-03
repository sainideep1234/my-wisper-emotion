import { NextResponse } from 'next/server';
import { APP_VERSION, getDownloadUrl } from '@/lib/download';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    version: APP_VERSION,
    downloadUrl: getDownloadUrl(),
    notes: 'New performance improvements and native accessibility shortcut support.',
  });
}
