import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type DiagnosticSeverity = 'debug' | 'info' | 'warning' | 'error' | 'fatal';
export type DiagnosticSource = 'next' | 'api' | 'cron' | 'client' | 'admin' | 'system';

export type SystemDiagnosticInput = {
  severity?: DiagnosticSeverity;
  source?: DiagnosticSource;
  systemKey?: string;
  eventCode: string;
  message: string;
  routePath?: string | null;
  requestId?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  details?: Record<string, unknown>;
};

let cachedAdmin: SupabaseClient | null | undefined;

export function getSystemAdminClient(): SupabaseClient | null {
  if (cachedAdmin !== undefined) return cachedAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    cachedAdmin = null;
    return null;
  }
  cachedAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cachedAdmin;
}

export function sanitizeDiagnosticText(value: unknown, maxLength = 500): string {
  let text = typeof value === 'string' ? value : String(value ?? '');
  text = text
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, '[REDACTED_TOKEN]')
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[REDACTED_KEY]')
    .replace(/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\b\d{6}@tokyo\.soka\.ed\.jp\b/gi, '[REDACTED_SCHOOL_ACCOUNT]')
    .replace(/\b\d{6}\b/g, '[REDACTED_ID]')
    .replace(/\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function resolveSystemKeyFromPath(value: string | null | undefined): string {
  const path = String(value || '').split('?')[0].toLowerCase();
  if (path.includes('line-webhook') || path.includes('line-daily') || path.includes('line-train') || path.includes('line-weekly')) return 'global';
  if (path.includes('campus-ai')) return 'campus-ai';
  if (path.includes('cafeteria') || path.includes('menu')) return 'cafeteria';
  if (path.includes('earthquake')) return 'earthquakes';
  if (path.includes('weather')) return 'weather';
  if (path.includes('timetable') || path.includes('schedule')) return 'timetable';
  if (path.includes('attendance')) return 'attendance';
  if (path.includes('materials')) return 'materials';
  if (path.includes('notes')) return 'notes';
  if (path.includes('workspaces') || path.includes('workspace')) return 'workspaces';
  if (path.includes('chat')) return 'chat';
  if (path.includes('push') || path.includes('notification')) return 'notifications';
  if (path.includes('lost-found') || path.includes('lost_and_found')) return 'lost-found';
  return 'core';
}

function safeDetails(details?: Record<string, unknown>): Record<string, string | number | boolean | null> {
  if (!details) return {};
  const allowed = new Set(['digest','routerKind','routeType','renderSource','renderType','revalidateReason','method','attempt','retryable']);
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(details)) {
    if (!allowed.has(key)) continue;
    if (typeof value === 'string') result[key] = sanitizeDiagnosticText(value, 120);
    else if (typeof value === 'number' && Number.isFinite(value)) result[key] = value;
    else if (typeof value === 'boolean' || value === null) result[key] = value;
  }
  return result;
}

export async function recordSystemDiagnostic(input: SystemDiagnosticInput): Promise<void> {
  try {
    const admin = getSystemAdminClient();
    if (!admin) return;
    const path = input.routePath ? String(input.routePath).split('?')[0].slice(0, 240) : null;
    const code = String(input.eventCode || 'UNSPECIFIED').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80);
    const systemKey = String(input.systemKey || resolveSystemKeyFromPath(path)).slice(0, 80);
    const { error } = await admin.from('system_diagnostic_logs').insert({
      severity: input.severity || 'error',
      source: input.source || 'api',
      system_key: systemKey,
      event_code: code,
      message: sanitizeDiagnosticText(input.message || 'システムエラー', 500) || 'システムエラー',
      route_path: path,
      request_id: input.requestId ? sanitizeDiagnosticText(input.requestId, 100) : null,
      status_code: Number.isInteger(input.statusCode) ? input.statusCode : null,
      duration_ms: Number.isInteger(input.durationMs) ? Math.max(0, Number(input.durationMs)) : null,
      details: safeDetails(input.details),
    });
    if (error) console.error('[system-observability] log insert failed:', error.message);
  } catch (error) {
    console.error('[system-observability] unexpected logger failure:', error instanceof Error ? error.message : 'unknown');
  }
}
