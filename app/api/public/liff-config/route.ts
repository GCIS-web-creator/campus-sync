import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const liffId = (process.env.CAMPUS_SYNC_PUBLIC_LIFF_ID || '').trim();
  return NextResponse.json(
    { liffId },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
