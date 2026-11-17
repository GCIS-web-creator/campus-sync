import { NextResponse } from 'next/server';
import { getSystemAdminClient, recordSystemDiagnostic, sanitizeDiagnosticText } from '@/lib/system-observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ success: false }, { status: 403 });
  const admin = getSystemAdminClient();
  if (!admin) return NextResponse.json({ success: false }, { status: 503 });
  try {
    const { count, error } = await admin
      .from('system_diagnostic_logs')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'client')
      .gte('created_at', new Date(Date.now() - 60_000).toISOString());
    if (!error && (count || 0) >= 30) return NextResponse.json({ success: false, rateLimited: true }, { status: 429 });

    const body = await request.json().catch(() => null) as { digest?: unknown; message?: unknown; path?: unknown } | null;
    await recordSystemDiagnostic({
      severity: 'error',
      source: 'client',
      systemKey: 'core',
      eventCode: 'CLIENT_RENDER_ERROR',
      message: sanitizeDiagnosticText(body?.message || '画面の描画中にエラーが発生しました。', 300),
      routePath: typeof body?.path === 'string' ? body.path.split('?')[0] : null,
      requestId: typeof body?.digest === 'string' ? body.digest : null,
      details: { digest: typeof body?.digest === 'string' ? body.digest : null },
    });
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
