import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return url && key ? { url, key } : null;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function readTable(
  config: { url: string; key: string },
  table: string,
  query: string,
) {
  const response = await fetch(
    `${config.url}/rest/v1/${table}?${query}`,
    {
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
      },
      cache: 'no-store',
    },
  );
  if (!response.ok) throw new Error(`READ_${table}_${response.status}`);
  return response.json();
}

export async function GET(request: Request) {
  if (!authorized(request)) return jsonError('管理用パスワードを確認してください。', 401);

  const config = supabaseConfig();
  if (!config) return jsonError(
    'サーバーにSupabase URLまたはSUPABASE_SERVICE_ROLE_KEYが設定されていません。',
    503,
  );

  try {
    const [knowledge, examples] = await Promise.all([
      readTable(
        config,
        'campus_ai_knowledge',
        'select=id,title,content,category,active,created_at&order=created_at.desc&limit=100',
      ),
      readTable(
        config,
        'campus_ai_examples',
        'select=id,kind,request_text,approved_title,approved_body,approved_due_at,created_at&order=created_at.desc&limit=100',
      ),
    ]);

    const q = new URL(request.url).searchParams.get('q')?.trim().toLowerCase() || '';
    const matches = (values: unknown[], fields: string[]) =>
      (values as Record<string, unknown>[]).filter((row) =>
        !q || fields.some((field) =>
          String(row[field] ?? '').toLowerCase().includes(q),
        ),
      );

    return NextResponse.json({
      success: true,
      knowledge: matches(knowledge, ['title', 'content', 'category']),
      examples: matches(examples, [
        'kind', 'request_text', 'approved_title', 'approved_body',
      ]),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('CampusSync AI memory read failed:', error);
    return jsonError(
      '記憶を取得できませんでした。Supabaseのテーブル名・権限・環境変数を確認してください。',
      500,
    );
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return jsonError('管理用パスワードを確認してください。', 401);

  const config = supabaseConfig();
  if (!config) return jsonError(
    'サーバーにSupabase URLまたはSUPABASE_SERVICE_ROLE_KEYが設定されていません。',
    503,
  );

  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input) return jsonError('送信データを読み取れませんでした。', 400);

  let table = '';
  let row: Record<string, unknown>;

  if (input.type === 'knowledge') {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const content = typeof input.content === 'string' ? input.content.trim() : '';
    const category = typeof input.category === 'string'
      ? input.category.trim().slice(0, 50) || 'general'
      : 'general';

    if (!title || !content) return jsonError('知識のタイトルと内容を入力してください。', 400);
    if (title.length > 200 || content.length > 10000) {
      return jsonError('タイトルは200文字、内容は10000文字以内にしてください。', 400);
    }

    table = 'campus_ai_knowledge';
    row = { title, content, category, active: true };
  } else if (input.type === 'example') {
    const kind = input.kind === 'assignment' ? 'assignment' :
      input.kind === 'notice' ? 'notice' : '';
    const requestText = typeof input.requestText === 'string' ? input.requestText.trim() : '';
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const body = typeof input.body === 'string' ? input.body.trim() : '';
    const dueAt = typeof input.dueAt === 'string' && input.dueAt.trim()
      ? input.dueAt.trim()
      : null;

    if (!kind || !requestText || !title || !body) {
      return jsonError('種類・元の依頼・確定したタイトル・本文を入力してください。', 400);
    }
    if (requestText.length > 1500 || title.length > 200 || body.length > 10000) {
      return jsonError('依頼は1500文字、タイトルは200文字、本文は10000文字以内にしてください。', 400);
    }
    if (dueAt && (!Number.isFinite(Date.parse(dueAt)))) {
      return jsonError('提出期限の日付形式が正しくありません。', 400);
    }

    table = 'campus_ai_examples';
    row = {
      kind,
      request_text: requestText,
      approved_title: title,
      approved_body: body,
      approved_due_at: dueAt,
    };
  } else {
    return jsonError('typeにはknowledgeまたはexampleを指定してください。', 400);
  }

  try {
    const response = await fetch(`${config.url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(row),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`CampusSync AI memory insert failed: ${table} ${response.status}`);
      return jsonError(
        '記憶を保存できませんでした。Supabaseのテーブル・列・権限を確認してください。',
        502,
      );
    }

    const saved = await response.json();
    return NextResponse.json({
      success: true,
      message: 'CampusSync AIの記憶に保存しました。',
      item: Array.isArray(saved) ? saved[0] : null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('CampusSync AI memory insert failed:', error);
    return jsonError('記憶を保存できませんでした。サーバーログを確認してください。', 500);
  }
}
