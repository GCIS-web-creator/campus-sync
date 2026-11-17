import { NextResponse } from 'next/server';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';
import { getSystemAdminClient, recordSystemDiagnostic } from '@/lib/system-observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENVIRONMENT_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVER_KEY',
  'CRON_SECRET',
  'LINE_CHANNEL_SECRET',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_CHANNEL_SECRET_1',
  'LINE_CHANNEL_ACCESS_TOKEN_1',
  'LINE_CHANNEL_SECRET_2',
  'LINE_CHANNEL_ACCESS_TOKEN_2',
  'LINE_CHANNEL_SECRET_3',
  'LINE_CHANNEL_ACCESS_TOKEN_3',
  'LINE_CHANNEL_SECRET_4',
  'LINE_CHANNEL_ACCESS_TOKEN_4',
  'LINE_CHANNEL_SECRET_5',
  'LINE_CHANNEL_ACCESS_TOKEN_5',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'CAMPUS_SYNC_BASE_URL',
  'CAMPUS_SYNC_ADMIN_PASSWORD',
  'CAMPUS_SYNC_HIADMIN_EMAILS',
  'CAMPUS_SYNC_HIADMIN_PASSWORD_2',
  'CAMPUS_SYNC_HIADMIN_PASSWORD_3',
  'ADMIN_BROADCAST_PASSWORD',
  'STUDENT_PROFILE_EXPORT_PASSWORD',
  'CLUB_POST_CODE_PEPPER',
  'CLUB_NOTES_LINE_BROADCAST_ENABLED',
] as const;

function noStore() {
  return { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };
}

export async function GET(request: Request) {
  if (!verifyAdminSessionRequest(request)) {
    return NextResponse.json({ success: false, message: 'Adminにログインしてください。' }, { status: 401, headers: noStore() });
  }
  const admin = getSystemAdminClient();
  if (!admin) {
    return NextResponse.json({ success: false, message: 'SUPABASE_SECRET_KEY または SUPABASE_SERVICE_ROLE_KEY が設定されていません。' }, { status: 503, headers: noStore() });
  }

  const url = new URL(request.url);
  const severity = url.searchParams.get('severity') || 'all';
  const systemKey = url.searchParams.get('system') || 'all';
  const limit = Math.max(20, Math.min(250, Number(url.searchParams.get('limit')) || 100));
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    let logsQuery = admin.from('system_diagnostic_logs')
      .select('id,created_at,severity,source,system_key,event_code,message,route_path,request_id,status_code,duration_ms,details')
      .order('created_at', { ascending: false }).limit(limit);
    if (severity !== 'all') logsQuery = logsQuery.eq('severity', severity);
    if (systemKey !== 'all') logsQuery = logsQuery.eq('system_key', systemKey);

    const [logsResult, totalResult, errorResult, fatalResult, warningResult, dbResult, maintenanceResult, migrationResult] = await Promise.all([
      logsQuery,
      admin.from('system_diagnostic_logs').select('id', { count: 'exact', head: true }).gte('created_at', since),
      admin.from('system_diagnostic_logs').select('id', { count: 'exact', head: true }).in('severity', ['error','fatal']).gte('created_at', since),
      admin.from('system_diagnostic_logs').select('id', { count: 'exact', head: true }).eq('severity', 'fatal').gte('created_at', since),
      admin.from('system_diagnostic_logs').select('id', { count: 'exact', head: true }).eq('severity', 'warning').gte('created_at', since),
      admin.from('system_diagnostic_logs').select('id', { count: 'exact', head: true }).limit(1),
      admin.from('system_maintenance_modes').select('system_key,mode,label,updated_at').order('system_key'),
      admin.rpc('campussync_list_applied_migrations'),
    ]);
    if (logsResult.error || totalResult.error || errorResult.error || fatalResult.error || warningResult.error || dbResult.error || maintenanceResult.error || migrationResult.error) {
      throw new Error('診断データの一部を取得できませんでした。Supabaseの接続とSQL適用状態を確認してください。');
    }

    const environment = ENVIRONMENT_KEYS.map((key) => ({
      key: key === 'SUPABASE_SERVER_KEY'
        ? 'SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY'
        : key,
      configured: key === 'SUPABASE_SERVER_KEY'
        ? Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
        : Boolean(process.env[key]),
    }));
    const configuredCount = environment.filter((item) => item.configured).length;
    const modes = maintenanceResult.data || [];

    let localMigrationFiles: string[] = [];
    let migrationSourceAvailable = true;
    try {
      localMigrationFiles = readdirSync(join(process.cwd(), 'supabase', 'migrations'))
        .filter((name) => /^\\d{14}_.+\\.sql$/.test(name));
    } catch {
      migrationSourceAvailable = false;
    }
    const localMigrations = localMigrationFiles.map((fileName) => {
      const match = fileName.match(/^(\\d{14})_(.+)\\.sql$/);
      return match ? { version: match[1], name: match[2] } : null;
    }).filter((item): item is { version: string; name: string } => item !== null);
    const localByVersion = new Map(localMigrations.map((item) => [item.version, item]));
    const appliedMigrations = (migrationResult.data || []) as Array<{ version: string; name: string }>;
    const appliedByVersion = new Map(appliedMigrations.map((item) => [item.version, item]));
    const migrationItems = [
      ...appliedMigrations.map((item) => ({
        version: item.version,
        name: item.name || localByVersion.get(item.version)?.name || 'unknown',
        status: migrationSourceAvailable && localByVersion.has(item.version) ? 'applied' : 'source_missing',
      })),
      ...localMigrations.filter((item) => !appliedByVersion.has(item.version)).map((item) => ({
        version: item.version,
        name: item.name,
        status: 'pending',
      })),
    ].sort((a, b) => b.version.localeCompare(a.version));
    const migrations = {
      sourceAvailable: migrationSourceAvailable,
      localCount: localMigrations.length,
      appliedCount: appliedMigrations.length,
      pendingCount: migrationItems.filter((item) => item.status === 'pending').length,
      missingSourceCount: migrationItems.filter((item) => item.status === 'source_missing').length,
      items: migrationItems,
    };
    const deployment = {
      environment: process.env.VERCEL_ENV || 'unknown',
      branch: process.env.VERCEL_GIT_COMMIT_REF || null,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      url: process.env.VERCEL_URL || null,
    };
    return NextResponse.json({
      success: true,
      checkedAt: new Date().toISOString(),
      deployment,
      migrations,
      environment,
      summary: {
        logs24h: totalResult.count || 0,
        errors24h: errorResult.count || 0,
        fatal24h: fatalResult.count || 0,
        warnings24h: warningResult.count || 0,
        environmentConfigured: configuredCount,
        environmentTotal: environment.length,
        database: 'connected',
        maintenanceEnabled: modes.filter((item) => item.mode === 'maintenance').length,
        noticesEnabled: modes.filter((item) => item.mode === 'notice').length,
      },
      maintenanceModes: modes,
      logs: logsResult.data || [],
    }, { headers: noStore() });
  } catch (error) {
    await recordSystemDiagnostic({
      severity: 'error',
      source: 'api',
      systemKey: 'core',
      eventCode: 'ADMIN_DIAGNOSTICS_READ_FAILED',
      message: error instanceof Error ? error.message : '管理者向け診断情報の取得に失敗しました。',
      routePath: '/api/admin/system/diagnostics',
    });
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '診断情報を取得できませんでした。' }, {
      status: 503,
      headers: noStore(),
    });
  }
}
