import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Retired standalone scheduler endpoint.
 * Assignment deadlines are now included in /api/line-daily-digest at 16:00 JST.
 * This guard safely handles any old pg_cron job that has not yet been removed.
 */
export async function POST() {
  return NextResponse.json({
    success: true,
    skipped: true,
    message: '課題期限の個別定期配信は16:00の日次まとめへ統合されました。',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
