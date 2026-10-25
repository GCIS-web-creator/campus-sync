import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DraftKind = 'notice' | 'assignment';

function authorized(request: Request): boolean {
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  if (!expected || !received) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseDueAt(question: string): string | null {
  const explicit = question.match(
    /(20\d{2})[-/年]\s*(\d{1,2})[-/月]\s*(\d{1,2})日?/,
  );
  const japanese = question.match(
    /(\d{1,2})月\s*(\d{1,2})日\s*(?:まで|までに|締切|期限)/,
  );
  const numeric = question.match(
    /(?:^|[^\d])(\d{1,2})\/(\d{1,2})(?=\s*(?:まで|までに|締切|期限))/,
  );

  const currentYear = Number(
    new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
    }).format(new Date()),
  );

  const match = japanese || numeric;
  if (!explicit && !match) return null;

  let year = explicit ? Number(explicit[1]) : currentYear;
  const month = Number(explicit ? explicit[2] : match![1]);
  const day = Number(explicit ? explicit[3] : match![2]);

  const due = new Date(Date.UTC(year, month - 1, day, 14, 59));
  if (
    month < 1 || month > 12 || day < 1 ||
    due.getUTCMonth() !== month - 1 ||
    due.getUTCDate() !== day
  ) return null;

  if (!explicit && due.getTime() < Date.now()) {
    year += 1;
    due.setUTCFullYear(year);
  }

  return due.toISOString();
}

function makeLocalDraft(question: string, kind: DraftKind) {
  const dueAt = kind === 'assignment' ? parseDueAt(question) : null;

  if (kind === 'assignment') {
    const firstLine = question.split(/\r?\n/)[0] || '';
    const pages = question.match(
      /P\s*\d+\s*[〜～~\-–]\s*P?\s*\d+/i,
    )?.[0]?.replace(/\s+/g, '');

    const subject = firstLine
      .replace(/(?:の)?課題(?:を)?(?:作成|作ってください|作って|作る).*/u, '')
      .replace(/課題作成.*/u, '')
      .replace(/P\s*\d+\s*[〜～~\-–]\s*P?\s*\d+/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[のを、。:：]+$/u, '');

    let title = !subject
      ? '新しい課題'
      : /課題|プリント/u.test(subject)
        ? subject
        : `${subject}の課題`;

    if (pages && !title.includes(pages)) {
      title += `（${pages}）`;
    }

    const body =
      `【依頼された課題内容】\n${question}\n\n` +
      '【管理者の確認事項】\n' +
      '・指示事項が正しく伝わるか確認してください。\n' +
      '・提出方法や評価基準など、依頼文にない条件は必要に応じて追記してください。\n' +
      '・提出期限を確認してから保存してください。';

    return { title, body, dueAt };
  }

  const noticeRules: Array<[RegExp, string]> = [
    [/文化祭/u, '文化祭についてのお知らせ'],
    [/休校|臨時休業/u, '休校・臨時休業についてのお知らせ'],
    [/電車|運行|遅延/u, '交通機関についてのお知らせ'],
    [/課題|提出|締切|期限/u, '課題・提出期限についてのお知らせ'],
    [/学食|ランチ|食堂/u, '学食についてのお知らせ'],
    [/行事|イベント/u, '学校行事についてのお知らせ'],
    [/テスト|考査/u, '定期考査についてのお知らせ'],
  ];

  const title =
    noticeRules.find(([pattern]) => pattern.test(question))?.[1] ||
    '学校からのお知らせ';

  const body =
    `【依頼内容】\n${question}\n\n` +
    '配信前に、日時・対象者・具体的な案内内容を確認して編集してください。';

  return { title, body, dueAt: null };
}


type MemoryKnowledge = {
  title: string;
  content: string;
  category: string;
  active: boolean;
};

type MemoryExample = {
  kind: DraftKind;
  request_text: string;
  approved_title: string;
  approved_body: string;
};

function textFeatures(value: string): Set<string> {
  const normalized = value.toLowerCase().replace(/\s+/g, "");
  const features = new Set<string>();
  const words = normalized.match(/[a-z0-9]+|[\u3040-\u30ff\u3400-\u9fff]+/g) || [];

  for (const word of words) {
    features.add(word);
    if (/^[\u3040-\u30ff\u3400-\u9fff]+$/.test(word)) {
      for (let i = 0; i + 1 < word.length; i++) {
        features.add(word.slice(i, i + 2));
      }
    }
  }
  return features;
}

function similarity(a: string, b: string): number {
  const left = textFeatures(a);
  const right = textFeatures(b);
  if (!left.size || !right.size) return 0;

  let common = 0;
  for (const feature of left) {
    if (right.has(feature)) common++;
  }
  return (2 * common) / (left.size + right.size);
}

async function retrieveMemories(question: string, kind: DraftKind) {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !key) {
    return { knowledge: [] as MemoryKnowledge[], examples: [] as MemoryExample[], unavailable: true };
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };

  try {
    const [knowledgeResponse, exampleResponse] = await Promise.all([
      fetch(
        `${url}/rest/v1/campus_ai_knowledge?select=title,content,category,active&active=eq.true&order=created_at.desc&limit=100`,
        { headers, cache: "no-store" },
      ),
      fetch(
        `${url}/rest/v1/campus_ai_examples?select=kind,request_text,approved_title,approved_body&kind=eq.${kind}&order=created_at.desc&limit=100`,
        { headers, cache: "no-store" },
      ),
    ]);

    if (!knowledgeResponse.ok || !exampleResponse.ok) {
      throw new Error("記憶テーブルを取得できませんでした");
    }

    const knowledge = await knowledgeResponse.json() as MemoryKnowledge[];
    const examples = await exampleResponse.json() as MemoryExample[];

    return { knowledge, examples, unavailable: false };
  } catch (error) {
    console.error(
      "CampusSync AI memory retrieval failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return { knowledge: [] as MemoryKnowledge[], examples: [] as MemoryExample[], unavailable: true };
  }
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

  const input = await request.json().catch(() => null) as {
    question?: unknown;
    kind?: unknown;
  } | null;

  const question = typeof input?.question === 'string'
    ? input.question.trim().slice(0, 1500)
    : '';

  if (!question) {
    return NextResponse.json(
      { message: '作成したい内容を入力してください。' },
      { status: 400 },
    );
  }

  const kind: DraftKind =
    input?.kind === 'assignment' ? 'assignment' : 'notice';

  const draft = makeLocalDraft(question, kind);
  const memories = await retrieveMemories(question, kind);

  const relevantKnowledge = memories.knowledge
    .map(item => ({
      item,
      score: similarity(
        question,
        `${item.title} ${item.content} ${item.category}`,
      ),
    }))
    .filter(({ item, score }) =>
      score >= 0.08 ||
      item.category === kind ||
      item.category === "school_rules"
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const currentDue = kind === "assignment" ? parseDueAt(question) : null;

  const bestExample = memories.examples
    .map(item => ({
      item,
      score: similarity(question, item.request_text),
      storedDue: kind === "assignment" ? parseDueAt(item.request_text) : null,
    }))
    .filter(({ score, storedDue }) =>
      score >= 0.62 && storedDue === currentDue
    )
    .sort((a, b) => b.score - a.score)[0];

  let title = draft.title;
  let body = draft.body;
  let reusedExample = false;

  if (bestExample) {
    title = bestExample.item.approved_title;
    body = bestExample.item.approved_body;
    reusedExample = true;
  }

  const notes: string[] = [
    "APIを使わないCampusSync内のルールで下書きを作成しました。",
  ];

  if (reusedExample) {
    notes.push("依頼に似た保存済みのお手本を下書きの土台として再利用しました。内容は必ず確認してください。");
  }

  if (relevantKnowledge.length) {
    notes.push(
      "関連しそうな登録知識：" +
      relevantKnowledge.map(({ item }) => item.title).join("、") +
      "。必要に応じて知識一覧を確認してください。"
    );
  }

  if (memories.unavailable) {
    notes.push("Supabaseの記憶を取得できなかったため、保存済み知識を参照せずに作成しました。");
  }

  return NextResponse.json({
    success: true,
    mode: "template",
    title,
    body,
    dueAt: currentDue,
    memoryUsed: {
      exampleReused: reusedExample,
      knowledgeTitles: relevantKnowledge.map(({ item }) => item.title),
    },
    message: notes.join(" "),
  }, {
    headers: { "Cache-Control": "no-store" },
  });

  return NextResponse.json({
    success: true,
    mode: 'template',
    ...draft,
    message:
      'APIを使わないCampusSync内のルールで下書きを作成しました。内容を確認・編集してから利用してください。',
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
