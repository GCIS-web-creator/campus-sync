import { createClient } from '@supabase/supabase-js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MessageTable = 'class_chat_messages' | 'school_chat_messages';
type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

function isAuthorized(request: Request): boolean {
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authError(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json(
      { message: 'サーバー環境変数 CAMPUS_SYNC_ADMIN_PASSWORD / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL を設定してください。' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: '管理用パスワードが正しくありません。' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  return null;
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function safeUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function parseDate(value: string | null): Date | null | false {
  if (!value) return null;
  // Date-only values from the admin UI are interpreted in Japan Standard Time.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T00:00:00+09:00' : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? false : parsed;
}

async function writeAdminAudit(
  supabase: NonNullable<ReturnType<typeof getAdminSupabase>>,
  record: Record<string, unknown>,
) {
  const { error } = await supabase.from('chat_audit_logs').insert({
    actor_user_id: null,
    actor_label: 'admin_shared_password',
    ...record,
  });
  if (error) throw new Error('監査ログを記録できませんでした。Phase 5 SQLとテーブル権限を確認してください: ' + error.message);
}

export async function GET(request: Request) {
  const denied = authError(request);
  if (denied) return denied;
  const supabase = getAdminSupabase();
  if (!supabase) return jsonError('Supabaseサーバー設定が不足しています。', 503);

  const url = new URL(request.url);
  if (url.searchParams.get('format') === 'cslogson') {
    const fromDate = parseDate(url.searchParams.get('from'));
    const toDate = parseDate(url.searchParams.get('to'));
    if (fromDate === false || toDate === false) return jsonError('書き出し期間の日付が不正です。');
    if (fromDate && toDate && fromDate > toDate) return jsonError('開始日は終了日以前にしてください。');

    const pageSize = 500;
    const maximum = 50000;
    const rows: Record<string, any>[] = [];
    for (let offset = 0; offset < maximum; offset += pageSize) {
      let query = supabase.from('chat_audit_logs').select('*').order('occurred_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + pageSize - 1);
      if (fromDate) query = query.gte('occurred_at', fromDate.toISOString());
      if (toDate) {
        const toRaw = url.searchParams.get('to') || '';
        const endExclusive = new Date(toDate.getTime());
        if (/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) endExclusive.setTime(endExclusive.getTime() + 24 * 60 * 60 * 1000);
        query = query.lt('occurred_at', endExclusive.toISOString());
      }
      const result = await query;
      if (result.error) return jsonError('監査ログを読み込めません。supabase/class-chat-phase5-audit.sql を実行してください: ' + result.error.message, 409);
      const batch = (result.data || []) as Record<string, any>[];
      rows.push(...batch);
      if (batch.length < pageSize) break;
      if (rows.length >= maximum) {
        let probeQuery = supabase.from('chat_audit_logs').select('id').order('occurred_at', { ascending: true }).order('id', { ascending: true }).range(maximum, maximum);
        if (fromDate) probeQuery = probeQuery.gte('occurred_at', fromDate.toISOString());
        if (toDate) {
          const toRaw = url.searchParams.get('to') || '';
          const endExclusive = new Date(toDate.getTime());
          if (/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) endExclusive.setTime(endExclusive.getTime() + 24 * 60 * 60 * 1000);
          probeQuery = probeQuery.lt('occurred_at', endExclusive.toISOString());
        }
        const probe = await probeQuery;
        if (probe.error) return jsonError('ログ件数の確認に失敗しました: ' + probe.error.message, 500);
        if (probe.data?.length) return jsonError('対象ログが50,000件を超えています。開始日・終了日を絞って書き出してください。', 413);
        break;
      }
    }

    let previousHash = '0'.repeat(64);
    const events = rows.map((row, index) => {
      const canonicalRecord = JSON.stringify(row);
      const recordHash = createHash('sha256').update(previousHash + '\n' + canonicalRecord, 'utf8').digest('hex');
      const wrapped = {
        ...row,
        integrity: {
          sequence: index + 1,
          algorithm: 'SHA-256',
          previous_hash: previousHash,
          record_hash: recordHash,
        },
      };
      previousHash = recordHash;
      return wrapped;
    });

    // The export event is written after the snapshot, so it will appear in the next export.
    try {
      await writeAdminAudit(supabase, {
        event_type: 'logs_exported',
        source_table: 'chat_audit_logs',
        reason: 'cslogson_export',
        metadata: {
          from: url.searchParams.get('from') || null,
          to: url.searchParams.get('to') || null,
          timezone: 'Asia/Tokyo',
          record_count: events.length,
          final_hash: previousHash,
        },
      });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : '書き出し監査ログを記録できません。', 500);
    }

    const packageData = {
      format: 'CampusSync Chat Log JSON',
      extension: '.cslogson',
      schema_version: '1.0',
      exported_at: new Date().toISOString(),
      date_range: { from: url.searchParams.get('from') || null, to: url.searchParams.get('to') || null, timezone: 'Asia/Tokyo', to_date_inclusive: true },
      event_count: events.length,
      integrity: {
        algorithm: 'SHA-256 hash chain over each event JSON',
        initial_hash: '0'.repeat(64),
        final_hash: previousHash,
        note: 'A verifier can remove each event.integrity object and recalculate SHA-256(previous_hash + newline + JSON.stringify(event_without_integrity)). This detects changes to the exported sequence; it does not prove who originally authored a message.',
      },
      events,
    };
    const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
    return new Response(JSON.stringify(packageData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="campus-sync-chat-logs-' + day + '.cslogson"',
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const scope = url.searchParams.get('scope') || 'all';
  if (!['all', 'class', 'grade', 'school'].includes(scope)) return jsonError('対象範囲の指定が不正です。');

  const [reportsResult, logsResult] = await Promise.all([
    supabase.from('chat_message_reports')
      .select('id,reporter_user_id,message_id,message_table,reason,details,status,created_at,reviewed_at,reviewed_by,message_snapshot')
      .order('created_at', { ascending: false }).limit(150),
    supabase.from('chat_audit_logs')
      .select('id,occurred_at,event_type,source_table,record_id,actor_user_id,actor_label,student_id,student_name,user_class,scope,scope_key,body,previous_body,attachment_path,attachment_name,attachment_mime,reason,details,status,previous_status,metadata')
      .order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(150),
  ]);

  if (reportsResult.error) return jsonError('通報一覧を読み込めません。supabase/class-chat-phase3.sql を確認してください: ' + reportsResult.error.message, 409);
  if (logsResult.error) return jsonError('監査ログを読み込めません。supabase/class-chat-phase5-audit.sql を実行してください: ' + logsResult.error.message, 409);

  let classRows: Record<string, any>[] = [];
  let schoolRows: Record<string, any>[] = [];
  if (scope !== 'grade' && scope !== 'school') {
    const result = await supabase.from('class_chat_messages')
      .select('id,user_id,student_id,student_name,class_name,body,created_at,updated_at,attachment_path,attachment_name,attachment_mime')
      .order('created_at', { ascending: false }).limit(100);
    if (result.error) return jsonError('クラスチャットを取得できません: ' + result.error.message, 500);
    classRows = (result.data || []) as Record<string, any>[];
  }
  if (scope !== 'class') {
    let query = supabase.from('school_chat_messages')
      .select('id,user_id,student_id,student_name,user_class,scope,scope_key,body,created_at,updated_at,attachment_path,attachment_name,attachment_mime')
      .order('created_at', { ascending: false }).limit(100);
    if (scope === 'grade') query = query.eq('scope', 'grade');
    if (scope === 'school') query = query.eq('scope', 'school');
    const result = await query;
    if (result.error) return jsonError('学年・全校チャットを取得できません: ' + result.error.message, 500);
    schoolRows = (result.data || []) as Record<string, any>[];
  }

  const reports = (reportsResult.data || []) as Record<string, any>[];
  const logs = (logsResult.data || []) as Record<string, any>[];
  const relevantReports = reports.filter(report => {
    const snapshot = report.message_snapshot as Record<string, any> | null;
    if (scope === 'all') return true;
    if (scope === 'class') return report.message_table === 'class_chat_messages';
    if (report.message_table !== 'school_chat_messages') return false;
    if (scope === 'school') return snapshot?.scope === 'school';
    return snapshot?.scope === 'grade';
  });

  const classMessageIds = relevantReports.filter(r => r.message_table === 'class_chat_messages').map(r => r.message_id);
  const schoolMessageIds = relevantReports.filter(r => r.message_table === 'school_chat_messages').map(r => r.message_id);
  const uniqueClassIds = [...new Set(classMessageIds)];
  const uniqueSchoolIds = [...new Set(schoolMessageIds)];
  const [classTargetsResult, schoolTargetsResult] = await Promise.all([
    classMessageIds.length
      ? supabase.from('class_chat_messages').select('id,student_name,class_name,body,created_at,attachment_path,attachment_name,attachment_mime').in('id', uniqueClassIds)
      : Promise.resolve({ data: [], error: null }),
    schoolMessageIds.length
      ? supabase.from('school_chat_messages').select('id,student_name,user_class,scope,body,created_at,attachment_path,attachment_name,attachment_mime').in('id', uniqueSchoolIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const targetMap = new Map<string, Record<string, any>>();
  for (const row of [...((classTargetsResult.data || []) as Record<string, any>[]), ...((schoolTargetsResult.data || []) as Record<string, any>[])]) {
    targetMap.set(row.id, row);
  }
  const [classDeleteEvents, schoolDeleteEvents] = await Promise.all([
    uniqueClassIds.length
      ? supabase.from('chat_audit_logs').select('record_id,event_type').eq('source_table', 'class_chat_messages').in('record_id', uniqueClassIds).in('event_type', ['message_deleted', 'admin_message_deleted'])
      : Promise.resolve({ data: [], error: null }),
    uniqueSchoolIds.length
      ? supabase.from('chat_audit_logs').select('record_id,event_type').eq('source_table', 'school_chat_messages').in('record_id', uniqueSchoolIds).in('event_type', ['message_deleted', 'admin_message_deleted'])
      : Promise.resolve({ data: [], error: null }),
  ]);
  const deletedMessageIds = new Set<string>();
  for (const row of [...((classDeleteEvents.data || []) as Record<string, any>[]), ...((schoolDeleteEvents.data || []) as Record<string, any>[])]) {
    if (row.record_id) deletedMessageIds.add(String(row.record_id));
  }
  for (const log of logs) {
    if (!log.record_id || !log.body) continue;
    if (log.source_table !== 'class_chat_messages' && log.source_table !== 'school_chat_messages') continue;
    if (!targetMap.has(log.record_id)) targetMap.set(log.record_id, {
      id: log.record_id, student_name: log.student_name, user_class: log.user_class,
      class_name: log.user_class, scope: log.scope, body: log.body, created_at: log.occurred_at,
      deleted: deletedMessageIds.has(String(log.record_id)),
    });
  }

  const hydratedReports = relevantReports.map(report => {
    const snapshot = report.message_snapshot as Record<string, any> | null;
    const savedPreview = snapshot ? {
      id: String(snapshot.id || report.message_id),
      student_name: snapshot.student_name || '投稿者',
      user_class: snapshot.user_class || snapshot.class_name || '',
      class_name: snapshot.class_name || snapshot.user_class || '',
      scope: snapshot.scope || (report.message_table === 'class_chat_messages' ? 'class' : ''),
      body: snapshot.body || '',
      created_at: snapshot.created_at || report.created_at,
      attachment_path: snapshot.attachment_path || null,
      attachment_name: snapshot.attachment_name || null,
      attachment_mime: snapshot.attachment_mime || null,
      deleted: deletedMessageIds.has(report.message_id),
    } : null;
    return {
      ...report,
      message_preview: targetMap.get(report.message_id) || savedPreview,
    };
  });
  // Keep the fields used below explicit; inferred spread-union types can drop
  // properties that exist on the source rows but differ between the two chat tables.
  type AdminChatMessage = Record<string, any> & {
    created_at: string;
    message_table: 'class_chat_messages' | 'school_chat_messages';
    attachment_path?: string | null;
  };
  const messages: AdminChatMessage[] = [
    ...classRows.map((row): AdminChatMessage => ({
      ...row,
      created_at: String(row.created_at ?? ''),
      message_table: 'class_chat_messages',
      scope: 'class',
      scope_key: row.class_name,
    })),
    ...schoolRows.map((row): AdminChatMessage => ({
      ...row,
      created_at: String(row.created_at ?? ''),
      message_table: 'school_chat_messages',
    })),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 150);

  // Private attachments are only exposed to an authenticated admin through short-lived signed URLs.
  const attachmentPaths = [...new Set([
    ...messages.map(message => message.attachment_path),
    ...hydratedReports.map(report => report.message_preview?.attachment_path),
    ...logs.map(log => log.attachment_path),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0 && value.length < 500))];
  const signedUrlByPath = new Map<string, string>();
  if (attachmentPaths.length) {
    const signed = await supabase.storage.from('chat-attachments').createSignedUrls(attachmentPaths, 120);
    for (const item of signed.data || []) {
      if (item.path && item.signedUrl && !item.error) signedUrlByPath.set(item.path, item.signedUrl);
    }
  }
  const messagesWithAttachmentLinks = messages.map(message => ({
    ...message,
    attachment_url: message.attachment_path ? signedUrlByPath.get(message.attachment_path) || null : null,
  }));
  const reportsWithAttachmentLinks = hydratedReports.map(report => ({
    ...report,
    message_preview: report.message_preview ? {
      ...report.message_preview,
      attachment_url: report.message_preview.attachment_path
        ? signedUrlByPath.get(report.message_preview.attachment_path) || null
        : null,
    } : null,
  }));
  const logsWithAttachmentLinks = logs.map(log => ({
    ...log,
    attachment_url: log.attachment_path ? signedUrlByPath.get(log.attachment_path) || null : null,
  }));

  try {
    await writeAdminAudit(supabase, {
      event_type: 'admin_chat_data_viewed',
      source_table: 'chat_audit_logs',
      reason: 'moderation_data_read',
      metadata: {
        scope,
        report_count: hydratedReports.length,
        message_count: messages.length,
        visible_audit_event_count: logs.length,
      },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : '管理者の閲覧履歴を記録できません。', 500);
  }

  return NextResponse.json({
    reports: reportsWithAttachmentLinks,
    messages: messagesWithAttachmentLinks,
    auditLogs: logsWithAttachmentLinks,
    counts: {
      openReports: hydratedReports.filter(r => r.status === 'open').length,
      totalReports: hydratedReports.length,
      messages: messages.length,
      auditEvents: logs.length,
    },
  }, { headers: { 'Cache-Control': 'no-store, private' } });
}

export async function PATCH(request: Request) {
  const denied = authError(request);
  if (denied) return denied;
  const supabase = getAdminSupabase();
  if (!supabase) return jsonError('Supabaseサーバー設定が不足しています。', 503);

  let payload: { id?: string; status?: ReportStatus; note?: string };
  try { payload = await request.json(); } catch { return jsonError('送信データを読み取れません。'); }
  if (!safeUuid(payload.id) || !payload.status || !['open', 'reviewing', 'resolved', 'dismissed'].includes(payload.status)) {
    return jsonError('通報IDまたは対応状況が不正です。');
  }
  if (typeof payload.note === 'string' && payload.note.trim().length > 500) {
    return jsonError('対応メモは500文字以内にしてください。');
  }

  const { data, error } = await supabase.rpc('admin_update_chat_report', {
    p_report_id: payload.id,
    p_status: payload.status,
    p_note: (payload.note || '').trim(),
  });
  if (error) {
    const message = error.message || '通報状態を更新できませんでした。';
    const status = /report not found/i.test(message) ? 404
      : /invalid report status|at most 500/i.test(message) ? 400 : 500;
    return jsonError('通報状態の更新に失敗しました。Phase 5 SQLの適用状況を確認してください: ' + message, status);
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store, private' } });
}

export async function DELETE(request: Request) {
  const denied = authError(request);
  if (denied) return denied;
  const supabase = getAdminSupabase();
  if (!supabase) return jsonError('Supabaseサーバー設定が不足しています。', 503);

  let payload: { id?: string; message_table?: MessageTable; reason?: string };
  try { payload = await request.json(); } catch { return jsonError('送信データを読み取れません。'); }
  if (!safeUuid(payload.id) || !payload.message_table || !['class_chat_messages', 'school_chat_messages'].includes(payload.message_table)) {
    return jsonError('削除対象のメッセージ指定が不正です。');
  }
  const reason = (payload.reason || '').trim();
  if (!reason || reason.length > 500) return jsonError('削除理由を1〜500文字で入力してください。');

  const { data, error } = await supabase.rpc('admin_delete_chat_message', {
    p_message_id: payload.id,
    p_message_table: payload.message_table,
    p_reason: reason,
  });
  if (error) {
    const message = error.message || 'メッセージを削除できませんでした。';
    const status = /message not found/i.test(message) ? 404
      : /invalid chat message table|reason must contain/i.test(message) ? 400 : 500;
    return jsonError('メッセージ削除に失敗しました。Phase 5 SQLの適用状況を確認してください: ' + message, status);
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store, private' } });
}
