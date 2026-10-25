import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Draft = { title: string; body: string };
type DraftKind = 'notice' | 'assignment';

function authorized(request: Request): boolean {
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  if (!expected || !received) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

function fallbackDraft(question: string, kind: DraftKind = 'notice'): Draft {
  if (kind === 'assignment') {
    const quoted = /[「『]([^」』]{2,100})[」』]/.exec(question)?.[1];
    return {
      title: quoted || '新しい課題（要編集）',
      body: '【課題の内容】\\n（具体的な指示事項を記入してください）\\n\\n' +
        '【提出方法】\\n（提出方法を確認して記入してください）\\n\\n' +
        '【注意事項】\\n（必要な注意事項を記入してください）\\n\\n' +
        '提出期限と課題の種類を管理画面で確認してください。'
    };
  }
  const topics: Array<[RegExp, string]> = [
    [/文化祭/, '文化祭についてのお知らせ'],
    [/休校|臨時休業/, '休校・臨時休業についてのお知らせ'],
    [/電車|運行|遅延/, '交通機関の運行情報'],
    [/課題|提出|締切|期限/, '課題・提出期限についてのお知らせ'],
    [/学食|ランチ|食堂/, '学食についてのお知らせ'],
    [/行事|イベント/, '学校行事についてのお知らせ'],
    [/テスト|考査/, '定期考査についてのお知らせ'],
  ];

  const title = topics.find(([pattern]) => pattern.test(question))?.[1]
    || '学校からのお知らせ';

  return {
    title,
    body:
      '生徒の皆さんへ\n\n' +
      `${title}をお知らせします。\n\n` +
      '【内容】\n（具体的なお知らせ内容を入力してください）\n\n' +
      '【日時・対象】\n（必要に応じて日時や対象者を入力してください）\n\n' +
      '内容を確認し、必要な対応をお願いします。\n\n' +
      '※配信前に、内容・日時・対象者が正しいことを確認してください。',
  };
}

export async function POST(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD) {
    return NextResponse.json(
      { message: 'サーバーに CAMPUS_SYNC_ADMIN_PASSWORD が設定されていません。' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (!authorized(request)) {
    return NextResponse.json(
      { message: '管理用パスワードを確認してください。' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const input = await request.json().catch(() => null) as { question?: unknown; kind?: unknown } | null;
  const question = typeof input?.question === 'string'
    ? input.question.trim().slice(0, 1500)
    : '';

  if (!question) {
    return NextResponse.json({ message: '作成したいお知らせの内容を入力してください。' }, { status: 400 });
  }

  const kind: DraftKind = input?.kind === 'assignment' ? 'assignment' : 'notice';
  const fallback = fallbackDraft(question, kind);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      success: true,
      mode: 'template',
      ...fallback,
      message: '文章生成APIキーが未設定のため、テンプレートの下書きを作成しました。内容を編集して利用してください。',
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.CAMPUS_SYNC_ADMIN_AI_MODEL || 'gpt-4o-mini',
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              (kind === 'assignment'
                ? 'あなたは高校の管理者向け課題作成アシスタントです。課題名と指示事項を作成してください。'
                : 'あなたは高校の管理者向け文章作成アシスタントです。お知らせ文を作成してください。') +
              '回答は {"title":"タイトル","body":"本文"} のJSONのみ。' +
              '依頼にない日時・規則・事実・人物名を創作しないでください。' +
              '不明な情報は本文に【日時】などの確認用プレースホルダーを置いてください。' +
              '本文は明確で丁寧にし、送信済み・公開済みとは決して表現しないでください。',
          },
          { role: 'user', content: question },
        ],
      }),
      cache: 'no-store',
    });

    const result = await response.json().catch(() => null);
    const content = result?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(typeof content === 'string' ? content : '{}') as Partial<Draft>;
    const title = typeof parsed.title === 'string' ? parsed.title.trim().slice(0, 100) : '';
    const body = typeof parsed.body === 'string' ? parsed.body.trim().slice(0, 4900) : '';

    if (!response.ok || !title || !body) throw new Error('AIの下書きを取得できませんでした。');

    return NextResponse.json({
      success: true,
      mode: 'model',
      title,
      body,
      message: '下書きを作成しました。内容を確認・編集してから利用してください。',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('管理者AIの下書き生成に失敗:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({
      success: true,
      mode: 'template',
      ...fallback,
      message: 'AI生成に接続できなかったため、テンプレートの下書きを作成しました。内容を編集して利用してください。',
    }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
