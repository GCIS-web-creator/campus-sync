import { NextResponse } from 'next/server';
import { getSystemAdminClient } from '@/lib/system-observability';

export async function getSystemMaintenanceBlock(systemKey: string): Promise<NextResponse | null> {
  const admin = getSystemAdminClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin.from('system_maintenance_modes')
      .select('system_key,label,mode,notice_title,notice_message')
      .in('system_key', ['global', systemKey]);
    if (error) {
      console.error('[system-maintenance] status read failed:', error.message);
      return null;
    }
    const rows = data || [];
    const global = rows.find((row) => row.system_key === 'global');
    const module = rows.find((row) => row.system_key === systemKey);
    const active = global?.mode === 'maintenance' ? global : module?.mode === 'maintenance' ? module : null;
    if (!active) return null;
    return NextResponse.json({
      success: false,
      code: 'SYSTEM_MAINTENANCE',
      systemKey: active.system_key,
      title: active.notice_title || active.label + 'はメンテナンス中です',
      message: active.notice_message || 'この機能は一時的に利用できません。時間をおいて再度お試しください。',
      retryable: true,
    }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '60', 'X-CampusSync-Maintenance': active.system_key },
    });
  } catch (error) {
    console.error('[system-maintenance] unexpected status read failure:', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}
