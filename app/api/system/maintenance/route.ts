import { NextResponse } from 'next/server';
import { getSystemAdminClient } from '@/lib/system-observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = getSystemAdminClient();
  if (!admin) {
    return NextResponse.json({ success: false, modes: [], message: 'メンテナンス設定を読み込めません。' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  const { data, error } = await admin
    .from('system_maintenance_modes')
    .select('system_key,mode,notice_title,notice_message,updated_at')
    .order('system_key');
  if (error) {
    return NextResponse.json({ success: false, modes: [], message: 'メンテナンス設定を取得できませんでした。' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return NextResponse.json({ success: true, modes: data || [], checkedAt: new Date().toISOString() }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
