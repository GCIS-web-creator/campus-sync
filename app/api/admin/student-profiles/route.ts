import { createClient } from '@supabase/supabase-js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function matchesSecret(expected: string, received: string): boolean {
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function POST(request: Request) {
  const adminPassword = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const exportPassword = process.env.STUDENT_PROFILE_EXPORT_PASSWORD || '';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!adminPassword || !exportPassword || !supabaseUrl || !serviceRoleKey) {
    return jsonError(
      'サーバー環境変数 CAMPUS_SYNC_ADMIN_PASSWORD / STUDENT_PROFILE_EXPORT_PASSWORD / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を設定してください。',
      503,
    );
  }

  // Both secrets are sent in headers over HTTPS, never in a URL or file contents.
  if (!matchesSecret(adminPassword, request.headers.get('x-admin-password') || '')) {
    return jsonError('管理用パスワードが正しくありません。', 401);
  }
  if (!matchesSecret(exportPassword, request.headers.get('x-export-confirmation-password') || '')) {
    return jsonError('書き出し確認パスワードが正しくありません。', 403);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Explicitly select only allowed profile fields. Authentication credentials and
  // hashes are managed by Supabase Auth and are never selected or exported.
  const { data, error } = await supabase
    .from('profiles')
    .select('student_id,student_name,user_class,email,updated_at,setup_completed_at')
    .order('student_id', { ascending: true });

  if (error) return jsonError('登録情報を読み込めませんでした。student-profile-setup.sql と profiles テーブルを確認してください。', 500);

  const exportedAt = new Date().toISOString();
  const rows = (data || []).map((profile) => {
    const match = /^([1-3])-([1-8])$/.exec(String(profile.user_class || ''));
    return {
      event_type: 'student_profile_export_snapshot',
      source_table: 'profiles',
      student_id: String(profile.student_id || ''),
      student_name: String(profile.student_name || ''),
      email: String(profile.email || ''),
      grade: match ? Number(match[1]) : null,
      class_number: match ? Number(match[2]) : null,
      user_class: String(profile.user_class || ''),
      setup_completed_at: profile.setup_completed_at || null,
      updated_at: profile.updated_at || null,
      exported_at: exportedAt,
    };
  });

  let previousHash = '0'.repeat(64);
  const events = rows.map((row, index) => {
    const canonicalRecord = JSON.stringify(row);
    const recordHash = createHash('sha256')
      .update(previousHash + '\n' + canonicalRecord, 'utf8')
      .digest('hex');
    const event = {
      ...row,
      integrity: {
        sequence: index + 1,
        algorithm: 'SHA-256',
        previous_hash: previousHash,
        record_hash: recordHash,
      },
    };
    previousHash = recordHash;
    return event;
  });

  const packageData = {
    format: 'CampusSync Student Profile Export',
    extension: '.cslogson',
    schema_version: '1.0',
    export_type: 'student_profile_snapshot',
    exported_at: exportedAt,
    event_count: events.length,
    integrity: {
      algorithm: 'SHA-256 hash chain over each event JSON',
      initial_hash: '0'.repeat(64),
      final_hash: previousHash,
      note: '個人プロフィールのスナップショットです。パスワード・パスワードハッシュ・Supabase認証トークンは含みません。ハッシュ連鎖はファイル内の変更検出用であり、元データベースの真正性を証明するものではありません。',
    },
    events,
  };

  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  return new Response(JSON.stringify(packageData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="campus-sync-student-profiles-' + day + '.cslogson"',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
