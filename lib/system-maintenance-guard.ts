import { NextResponse } from 'next/server';
import { getSystemAdminClient } from '@/lib/system-observability';

type MaintenanceRow = {
  system_key: string;
  label: string;
  mode: 'normal' | 'notice' | 'maintenance';
  notice_title: string;
  notice_message: string;
};

let cachedRows: MaintenanceRow[] = [];
let cachedAt = 0;
const CACHE_TTL_MS = 5_000;

async function loadModes(): Promise<MaintenanceRow[] | null> {
  if (Date.now() - cachedAt < CACHE_TTL_MS) return cachedRows;
  const admin = getSystemAdminClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin.from('system_maintenance_modes')
      .select('system_key,label,mode,notice_title,notice_message')
      .in('system_key', ['global']);
    if (error) {
      console.error('[system-maintenance] status read failed:', error.message);
      return null;
    }
    // Query the global row and requested module in one query in the caller.
    cachedRows = (data || []) as MaintenanceRow[];
    cachedAt = Date.now();
    return cachedRows;
  } catch (error) {
    console.error('[system-maintenance] unexpected status read failure:', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

export async function getSystemMaintenanceBlock(systemKey: string): Promise<NextResponse | null> {
  const admin = getSystemAdminClient();
  if (!admin) return null;
  try {
    if (Date.now() - cachedAt >= CACHE_TTL_MS) {
      const { data, error } = await admin.from('system_maintenance_modes')
        .select('system_key,label,mode,notice_title,notice_message')
        .in('system_key', ['global', systemKey]);
      if (error) {
        console.error('[system-maintenance] status read failed:', error.message);
        return null;
      }
      cachedRows = (data || []) as MaintenanceRow[];
      cachedAt = Date.now();
    } else if (!cachedRows.some((row) => row.system_key === systemKey)) {
      const { data, error } = await admin.from('system_maintenance_modes')
        .select('system_key,label,mode,notice_title,notice_message')
        .eq('system_key', systemKey)
        .maybeSingle();
      if (error) {
        console.error('[system-maintenance] module status read failed:', error.message);
        return null;
      }
      if (data) cachedRows.push(data as MaintenanceRow);
    }
    const global = cachedRows.find((row) => row.system_key === 'global');
    const module = cachedRows.find((row) => row.system_key === systemKey);
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
