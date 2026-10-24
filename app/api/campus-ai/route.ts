// CampusSync AI v3: TypeScript上で推論し、回答スロットには画面と同じSupabaseデータを埋め込む。
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { answerDetailed, isTaskTemplate, type Availability, type Counts, type Direction, type Target } from '@/lib/campus-ai/answer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const str = (v: unknown, fallback = '未登録') => v === null || v === undefined || String(v).trim() === '' ? fallback : String(v).trim();
const normalize = (s: string) => s.toLocaleLowerCase().replace(/[\s　]/g, '').replace(/[－―ー−]/g, '-');
const toMin = (time: string) => {
  const [hour, minute] = String(time ?? '').slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.POSITIVE_INFINITY;
  return (hour < 4 ? hour + 24 : hour) * 60 + minute;
};
function commonSub(a: string, b: string): string {
  let best = '';
  for (let i = 0; i < a.length; i++) {
    for (let j = a.length; j - i > Math.max(1, best.length); j--) {
      const candidate = a.slice(i, j);
      if (b.includes(candidate)) { best = candidate; break; }
    }
  }
  return best;
}
function findTarget(q: string, names: string[], minLen = 3): number {
  let bestIndex = -1, bestLen = 0;
  names.forEach((name, index) => {
    const shared = commonSub(q, name);
    if (shared.length >= minLen && shared.length > bestLen) { bestLen = shared.length; bestIndex = index; }
  });
  return bestIndex;
}
const isCrowdQuestion = (q: string) => /混雑|混ん|空いて|空き具合|投票|食堂.*混|学食.*混/.test(q);
const isSoldQuestion = (q: string) => /売り切れ|売切れ|売り切|売切/.test(q);
const isSoldListQuestion = (q: string) => /売り切れのメニュー|売り切れてるのは|今売り切れのもの|売り切れ教えて|売り切れてるメニュー|売り切れ一覧|売切れメニュー/.test(q);
const isTaskQuestion = (q: string) => /課題|宿題|提出|期限|ワーク|プリント|やること/.test(q);
const isTrainQuestion = (q: string) => /電車|何分後|何本目|何本後|何時発|何時来る|駅/.test(q);
const isClubQuestion = (q: string) => /部活|部活動|委員会|連絡ノート|吹奏楽部/.test(q);
const isLibraryQuestion = (q: string) => /蔵書|蔵書検索|図書館.*本|図書室.*本|本ある|本は|本を|著者名|貸出中|借りられる/.test(q);
const isCareerQuestion = (q: string) => /キャリアセンター|進路室|自習室.*空|座席状況/.test(q);
const isLostQuestion = (q: string) => /落とし物|忘れ物|届けられてる/.test(q);
const isReviewQuestion = (q: string) => /口コミ|レビュー|感想|評価/.test(q);
const isContributionQuestion = (q: string) => /貢献度|貢献ポイント|累計ポイント|学校貢献/.test(q);
const isNotificationQuestion = (q: string) => /通知|お知らせ/.test(q);
const isQueueQuestion = (q: string) => /並び|行列|列が長|待ち時間/.test(q);
const isRoomQuestion = (q: string) => /教室|温度|気温|暑い|寒い|栄冠ホール|化学実験室|生物実験室|グローリーホール|ミーティングルーム|グローバルステーション|PC教室|パソコン教室|コンピューター室|家庭科室|図書館|図書室|Call|自習室|体育館|視聴覚室|多目的室|職員室/.test(q);

const DEFAULT_ROOMS = [
  { room_id: '101', room_name: '栄冠ホール', status: '快適', temp: '25℃' },
  { room_id: '102', room_name: '化学実験室', status: '快適', temp: '25℃' },
  { room_id: '103', room_name: '生物実験室', status: '快適', temp: '25℃' },
  { room_id: '104', room_name: 'グローリーホール', status: '快適', temp: '25℃' },
  { room_id: '105', room_name: 'ミーティングルーム1', status: '快適', temp: '25℃' },
  { room_id: '106', room_name: 'ミーティングルーム2', status: '快適', temp: '25℃' },
  { room_id: '107', room_name: '図書館', status: '快適', temp: '25℃' },
  { room_id: '108', room_name: 'グローバルステーション', status: '快適', temp: '25℃' },
  { room_id: '109', room_name: 'Call教室', status: '快適', temp: '25℃' },
  { room_id: '110', room_name: 'PC教室', status: '快適', temp: '25℃' },
  { room_id: '111', room_name: '家庭科室', status: '快適', temp: '25℃' },
  { room_id: '112', room_name: '普通教室（1-1）', status: '快適', temp: '25℃' },
];
// 現在のCampusSync画面にある通知サンプルと同一内容。通知テーブルが導入されたら共通テーブルに置き換える。
const FALLBACK_MENUS = [
  { id: 'snack', name: 'スナック（唐揚げポテト）', calorie: '450kcal', allergy: '小麦・鶏肉' },
  { id: 'soka', name: '創価ランチ（日替わりA）', calorie: '680kcal', allergy: '小麦・卵・乳' },
  { id: 'noodles', name: '情熱ラーメン / うどん', calorie: '520kcal', allergy: '小麦・大豆' },
  { id: 'curry', name: '栄光カレーライス', calorie: '710kcal', allergy: '小麦・豚肉・リンゴ' },
  { id: 'healthy', name: 'ヘルシーバリューランチ', calorie: '540kcal', allergy: 'さば・大豆・ごま' },
];
const CURRENT_UI_NOTIFICATIONS = [
  { title: '明日の体育はグラウンドです（熱中症対策を万全に）', time: '10分前' },
  { title: '図書室の新着おすすめ本が入荷しました！', time: '1時間前' },
  { title: '【重要】鷹の台駅の電車発車時刻について', time: '昨日' },
  { title: '食堂の期間限定「栄光フェス丼」メニュー開始のお知らせ', time: '昨日' },
  { title: '定期考査の範囲表がClassroomにアップロードされました', time: '3日前' },
];

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { question?: unknown } | null;
  let question = typeof body?.question === 'string' ? body.question.trim().slice(0, 100) : '';
  if (!question) return NextResponse.json({ error: '質問を入力してください。' }, { status: 400 });

  const wantsCrowd = isCrowdQuestion(question);
  const wantsSold = isSoldQuestion(question);
  const wantsTask = isTaskQuestion(question);
  const trainQuestion = isTrainQuestion(question);
  const wantsClub = isClubQuestion(question);
  const wantsLibrary = isLibraryQuestion(question);
  const wantsCareer = isCareerQuestion(question);
  const wantsLost = isLostQuestion(question);
  const wantsReviews = isReviewQuestion(question);
  const wantsContribution = isContributionQuestion(question);
  const wantsNotifications = isNotificationQuestion(question);
  const wantsQueue = isQueueQuestion(question);
  const wantsRoom = isRoomQuestion(question) && !wantsCrowd && !wantsLibrary && !wantsCareer;
  const wantsMenu = /メニュー|学食|ランチ|カロリー|アレルギー|食べられる/.test(question) && !wantsCrowd && !wantsReviews;
  const direction: Direction = /東村山|本川越/.test(question)
    ? '東村山方面'
    : /国分寺/.test(question) ? '国分寺方面' : trainQuestion ? '両方' : '国分寺方面';

  const nowDate = new Date();
  const jst = new Date(nowDate.getTime() + 9 * 60 * 60 * 1000);
  const jstHour = jst.getUTCHours();
  const now = (jstHour < 4 ? jstHour + 24 : jstHour) * 60 + jst.getUTCMinutes();

  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '')?.[1] || '';
  const authed = token && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } },
      )
    : null;
  const db = authed ?? supabase;
  const userResult = authed ? await authed.auth.getUser().catch(() => ({ data: { user: null }, error: { message: 'auth lookup failed' } })) : null;
  const email = userResult?.data?.user?.email ?? '';
  const studentId = /^([0-9]{6})@tokyo\.soka\.ed\.jp$/i.exec(email)?.[1] ?? '';
  let userClass = '1-1';
  if (wantsRoom && authed && studentId) {
    let profile: { user_class?: unknown } | null = null;
    try {
      const profileResult = await authed.from('profiles').select('user_class').eq('student_id', studentId).maybeSingle();
      if (!profileResult.error) {
        profile = profileResult.data;
      }
    } catch {
      profile = null;
    }
    const rawClass = String(profile?.user_class ?? '').trim();
    if (/^[1-3]-[1-8]$/.test(rawClass)) userClass = rawClass;
    else {
      const legacyClass = /^([1-3])[- ]([A-H])$/i.exec(rawClass);
      if (legacyClass) userClass = `${legacyClass[1]}-${legacyClass[2].toUpperCase().charCodeAt(0) - 64}`;
    }
  }

  const [menuRes, kokubunjiRes, eastRes, roomRes, soldRes, voteRes, taskRes, todoRes, clubRes, booksRes, careerRes, lostRes, reviewsRes] = await Promise.all([
    db.from('cafeteria_menu').select('id, name, calorie, allergy, is_active').eq('is_active', true).order('id', { ascending: true }),
    db.from('takanodai_timetable').select('departure_time, service').eq('direction', 'kokubunji'),
    db.from('takanodai_timetable').select('departure_time, service').eq('direction', 'higashimurayama'),
    db.from('room_status').select('room_id, room_name, status, temp, updated_at'),
    db.from('cafeteria_sold_out').select('menu_id, is_sold_out'),
    db.from('cafeteria_votes').select('status').eq('scope_key', 'overall'),
    authed
      ? authed.from('assignments').select('title, due, due_at').eq('is_active', true).order('created_at', { ascending: false })
      : Promise.resolve({ data: null, error: null }),
    authed && studentId
      ? authed.from('todos').select('title, due, due_at, completed, created_at').eq('student_id', studentId).order('created_at', { ascending: true })
      : Promise.resolve({ data: null, error: null }),
    db.from('club_notes').select('club_name, title, content, author, created_at').order('created_at', { ascending: false }).limit(8),
    db.from('library_books').select('id, title, author, code, status, created_at').order('created_at', { ascending: false }).limit(500),
    db.from('study_room_status').select('room_key, room_name, occupied_seats, total_seats, updated_at').eq('room_key', 'career_center').maybeSingle(),
    db.from('lost_and_found').select('*').order('created_at', { ascending: false }).limit(8),
    db.from('cafeteria_reviews').select('menu_id, user_name, rating, comment, created_at').order('created_at', { ascending: false }).limit(8),
  ]);

  // 貢献履歴は画面と同様にページングし、1000行を超えても全件合計する。
  let contributionPoints = 0;
  let contributionError: { message?: string } | null = null;
  if (wantsContribution && authed && studentId) {
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await authed.from('contribution_history').select('delta')
        .eq('student_id', studentId).order('created_at', { ascending: true }).range(offset, offset + pageSize - 1);
      if (error) { contributionError = error; break; }
      const rows = data ?? [];
      contributionPoints += rows.reduce((sum, row) => sum + (Number(row.delta) || 0), 0);
      if (rows.length < pageSize) break;
      offset += rows.length;
    }
  }

  // クエリ失敗を「データ0件」と誤認しない。質問された分野の失敗は明示する。
  if (wantsTask && !authed) return NextResponse.json({ answer: '課題は学校アカウントでログインすると確認できます。ログインしてからもう一度聞いてください。' });
  if (wantsTask && (taskRes.error || todoRes.error)) return NextResponse.json({ answer: '課題を読み込めませんでした。ログイン状態と課題テーブルの権限を確認してください。' });
  if (wantsRoom && roomRes.error) return NextResponse.json({ answer: '教室の状況を読み込めませんでした。少し待ってからもう一度試してください。' });
  if (wantsCrowd && voteRes.error) return NextResponse.json({ answer: '学食の混雑情報を読み込めませんでした。少し待ってからもう一度試してください。' });
  if (wantsSold && soldRes.error) return NextResponse.json({ answer: '売り切れ情報を読み込めませんでした。少し待ってからもう一度試してください。' });
  if (wantsMenu && menuRes.error) return NextResponse.json({ answer: '学食メニューを読み込めませんでした。少し待ってからもう一度試してください。' });
  if (trainQuestion && (kokubunjiRes.error || eastRes.error)) return NextResponse.json({ answer: '電車の時刻表を読み込めませんでした。少し待ってからもう一度試してください。' });
  if (wantsClub && clubRes.error) return NextResponse.json({ answer: '部活ノートを読み込めませんでした。少し待ってからもう一度試してください。' });
  if (wantsLibrary && booksRes.error) return NextResponse.json({ answer: '蔵書情報を読み込めませんでした。少し待ってからもう一度試してください。' });
  if (wantsCareer && careerRes.error) return NextResponse.json({ answer: 'キャリアセンターの座席情報を読み込めませんでした。少し待ってからもう一度試してください。' });
  if (wantsLost && lostRes.error) return NextResponse.json({ answer: '落とし物情報を読み込めませんでした。少し待ってからもう一度試してください。' });
  if (wantsReviews && reviewsRes.error) return NextResponse.json({ answer: '口コミを読み込めませんでした。少し待ってからもう一度試してください。' });
  if (wantsContribution && !authed) return NextResponse.json({ answer: '貢献度を確認するには学校アカウントでログインしてください。' });
  if (wantsContribution && contributionError) return NextResponse.json({ answer: '貢献度を読み込めませんでした。少し待ってからもう一度試してください。' });

  type Menu = { id: string | number; name: string; calorie: string | number | null; allergy: string | null; is_active?: boolean | null };
  const liveMenus = ((menuRes.data ?? []) as Menu[]).filter(m => m.is_active !== false);
  // app/page.tsxと同じく、DBに有効メニューがない場合は画面内の初期メニューを使う。
  const allMenus: Menu[] = liveMenus.length ? liveMenus : FALLBACK_MENUS;
  const menuForList = allMenus.slice(0, 5); // v3は5件まで {N1}〜{N5}
  const soldRows = (soldRes.data ?? []) as Array<{ menu_id: string | number | null; is_sold_out: boolean | null }>;
  const soldIds = new Set(soldRows.filter(r => r.is_sold_out).map(r => String(r.menu_id)));
  const soldNames = allMenus.filter(m => soldIds.has(String(m.id))).map(m => m.name);

  const cleanTrains = (rows: Array<{ departure_time: string; service: string | null }> | null | undefined) =>
    (rows ?? []).filter(r => toMin(r.departure_time) >= now).sort((a, b) => toMin(a.departure_time) - toMin(b.departure_time)).slice(0, 3);
  const kokubunji = cleanTrains(kokubunjiRes.data as Array<{ departure_time: string; service: string | null }> | null);
  const higashimurayama = cleanTrains(eastRes.data as Array<{ departure_time: string; service: string | null }> | null);
  type TaskRow = { title: string; due: string | null; due_at: string | null; completed?: boolean | null; created_at?: string | null };
  const assignmentRows = (taskRes.data ?? []) as TaskRow[];
  const personalRows = (todoRes.data ?? []) as TaskRow[];
  const assignmentTitles = new Set(assignmentRows.map(r => normalize(str(r.title, ''))));
  // 画面のvisibleTodosと同様に、個人課題のうち教職員課題と重複するタイトルを除いて統合する。
  const taskRows: TaskRow[] = [
    ...personalRows.filter(r => !assignmentTitles.has(normalize(str(r.title, '')))),
    ...assignmentRows,
  ];
  const tasksReadable = !!authed && !taskRes.error && !todoRes.error;
  const tasks = taskRows.map(r => ({
    title: str(r.title),
    due: r.due_at
      ? new Date(r.due_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : str(r.due, '期限未設定'),
  }));
  const taskList = tasks.slice(0, 3); // 学習テンプレートが対応する一覧スロットはJ1〜J3

  type Room = { room_id: string; room_name: string; status: string; temp: string | null; updated_at?: string | null };
  const roomMap = new Map<string, Room>();
  for (const original of DEFAULT_ROOMS) {
    const r = original.room_id === '112' ? { ...original, room_name: `普通教室（${userClass}）` } : original;
    roomMap.set(String(r.room_id), { ...r, room_id: String(r.room_id), temp: r.temp });
  }
  for (const raw of (roomRes.data ?? []) as Array<{ room_id: string | number | null; room_name: string | null; status: string | null; temp: string | number | null; updated_at?: string | null }>) {
    const id = String(raw.room_id ?? '');
    // UIは初期12室を表示し、同じroom_idのDB値で上書きする。画面にないDB行はAI一覧にも追加しない。
    const prev = roomMap.get(id) ?? [...roomMap.values()].find(r => normalize(r.room_name) === normalize(str(raw.room_name, '')));
    if (!prev) continue;
    const key = prev.room_id;
    roomMap.set(key, {
      ...prev,
      room_name: str(raw.room_name, prev.room_name),
      status: str(raw.status, prev.status),
      temp: raw.temp === null || raw.temp === undefined || String(raw.temp).trim() === '' ? null : (/℃/.test(String(raw.temp)) ? String(raw.temp) : `${raw.temp}℃`),
      updated_at: raw.updated_at ?? prev.updated_at,
    });
  }
  const rooms = [...roomMap.values()];
  const voteRows = (voteRes.data ?? []) as Array<{ status: string | null }>;
  const voteCounts = voteRows.reduce((acc, row) => {
    if (row.status === 'empty') acc.empty++;
    if (row.status === 'normal') acc.normal++;
    if (row.status === 'crowded') acc.crowded++;
    return acc;
  }, { empty: 0, normal: 0, crowded: 0 });
  const crowdLabel = voteCounts.crowded > voteCounts.normal && voteCounts.crowded >= voteCounts.empty
    ? '混んでいる'
    : voteCounts.empty > voteCounts.normal && voteCounts.empty > voteCounts.crowded ? '空いている' : '普通';
  const roomList = `教室名　状態　温度\n${rooms.map(r => `${r.room_name}　${r.status}${r.temp ? `　${r.temp}` : ''}`).join('\n')}`;

  const clubRows = (clubRes.data ?? []) as Array<{ club_name: string | null; title: string | null; content: string | null; author: string | null; created_at: string | null }>;
  let clubsFiltered = clubRows;
  const clubMatch = clubRows.find(r => r.club_name && normalize(question).includes(normalize(r.club_name)));
  if (clubMatch?.club_name) {
    clubsFiltered = clubRows.filter(r => r.club_name === clubMatch.club_name);
    question = question.replace(clubMatch.club_name, '{CLUB}');
  } else if (wantsClub) {
    const mentionedClub = /(.+?)(?:になにか連絡|に何か連絡|に連絡(?:来てる|来た|あります)?)/.exec(question)?.[1]?.trim();
    if (mentionedClub && mentionedClub.length <= 20 && !/部活|委員会/.test(mentionedClub)) {
      question = question.replace(mentionedClub, '{CLUB}');
    }
  }
  const clubList = clubsFiltered.slice(0, 5).map(r => {
    const when = r.created_at ? new Date(r.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '日時不明';
    return `${str(r.club_name, '部活・委員会')}｜${str(r.title, 'タイトル未登録')}（${when}）\n${str(r.content, '本文なし')}`;
  }).join('\n\n');

  const bookRows = (booksRes.data ?? []) as Array<{ id: string | number; title: string | null; author: string | null; code?: string | null; status: string | null }>;
  const bookFound = bookRows.find(b => {
    const t = str(b.title, ''); const a = str(b.author, '');
    return (t.length >= 2 && question.includes(t)) || (a.length >= 3 && question.includes(a));
  });
  let bookCandidate = bookFound ? str(bookFound.title) : '';
  let bookQueryTerm = bookFound
    ? ([str(bookFound.title, ''), str(bookFound.author, '')].find(v => v.length >= 2 && question.includes(v)) ?? '')
    : '';
  if (!bookCandidate) {
    const quoted = /[「『]([^」』]+)[」』]/.exec(question)?.[1];
    if (quoted) bookCandidate = quoted.trim();
    else {
      bookCandidate = question
        .replace(/^(?:ねえ、|すみません、|あの、|ちょっと聞きたいんだけど、)?/, '')
        .replace(/図書館|図書室|蔵書検索して|蔵書検索|蔵書を検索|蔵書|本あるかな|本ある\??|本はある\??|って本ある\??|ってある\??|を検索して|で検索して|で蔵書検索して|の本ある\??|を|に|って|は|ですか\??|教えてください|教えて|検索して|あるかな|ある\??|[?？!！。]/g, '')
        .replace(/で$/, '')
        .trim();
    }
  }
  let bookResult = '';
  if (bookFound) {
    const status = normalize(str(bookFound.status, ''));
    bookResult = /貸出中|borrowed|checkedout/.test(status)
      ? '貸出中'
      : /貸出可|在架|利用可能|available|availableforloan/.test(status)
        ? '所蔵あり・貸出可能'
        : `所蔵あり（状態：${str(bookFound.status)}）`;
    if (bookQueryTerm) question = question.replace(bookQueryTerm, '{BT}');
  } else {
    bookResult = '見つかりません';
  }

  // app/page.tsx の初期表示と同じ値をfallbackにする。DB行があればその値で上書き。
  const career = (careerRes.data as { room_name?: string | null; occupied_seats?: number | null; total_seats?: number | null } | null)
    ?? { room_name: 'キャリアセンター自習室', occupied_seats: 22, total_seats: 35 };
  const lostRows = (lostRes.data ?? []) as Array<Record<string, unknown>>;
  const lostList = lostRows.slice(0, 6).map(r => `${str(r.title ?? r.item_name, '品名未登録')}｜${str(r.location ?? r.found_location, '場所不明')}｜${str(r.description ?? r.details, '詳細なし')}`).join('\n');
  const reviewRows = (reviewsRes.data ?? []) as Array<{ menu_id: string | number | null; user_name: string | null; rating: number | null; comment: string | null; created_at: string | null }>;
  const menuById = new Map(allMenus.map(m => [String(m.id), m.name]));
  const reviewList = reviewRows.slice(0, 6).map(r => `${menuById.get(String(r.menu_id)) ?? '学食'}｜★${Number(r.rating) || 0}/5｜${str(r.comment, 'コメントなし')}（${str(r.user_name, '匿名')}）`).join('\n');
  const notificationList = CURRENT_UI_NOTIFICATIONS.map(r => `${r.time}｜${r.title}`).join('\n');

  const slots: Record<string, string | number> = {};
  menuForList.forEach((r, i) => {
    slots[`N${i + 1}`] = str(r.name);
    slots[`K${i + 1}`] = str(r.calorie);
    slots[`A${i + 1}`] = str(r.allergy);
  });
  slots.SL = soldNames.join('、') || '該当なし';
  slots.CR = crowdLabel;
  slots.CN = voteRows.length;
  slots.RL = roomList;
  slots.CLUB_LIST = clubList || '連絡ノートはまだ登録されていません。';
  slots.BT = bookCandidate || (bookFound ? str(bookFound.title) : '検索した本');
  slots.BRESULT = bookResult;
  slots.CA = career ? Math.max(0, Number(career.total_seats ?? 0) - Number(career.occupied_seats ?? 0)) : 0;
  slots.CO = Number(career?.occupied_seats ?? 0);
  slots.CT = Number(career?.total_seats ?? 0);
  slots.LF_LIST = lostList || '現在、落とし物の登録情報はありません。';
  slots.REVIEW_LIST = reviewList || 'まだ口コミは投稿されていません。';
  slots.PTS = Math.max(0, contributionPoints);
  slots.NT_LIST = notificationList || '通知はありません。';

  const addTrainSlots = (rows: Array<{ departure_time: string; service: string | null }>, hPrefix: string, sPrefix: string, mKey: string) => {
    rows.forEach((r, i) => {
      slots[`${hPrefix}${i + 1}`] = String(r.departure_time).slice(0, 5);
      slots[`${sPrefix}${i + 1}`] = str(r.service, '種別未登録');
    });
    if (rows[0]) slots[mKey] = Math.max(0, toMin(rows[0].departure_time) - now);
  };
  if (direction === '両方') {
    addTrainSlots(kokubunji, 'H', 'S', 'M1');
    addTrainSlots(higashimurayama, 'EH', 'ES', 'EM1');
  } else {
    addTrainSlots(direction === '国分寺方面' ? kokubunji : higashimurayama, 'H', 'S', 'M1');
  }
  taskList.forEach((t, i) => { slots[`J${i + 1}`] = t.title; slots[`D${i + 1}`] = t.due; });

  let target: Target = 'なし';
  let targetMenu: Menu | undefined;
  let targetTask: (typeof tasks)[number] | undefined;
  let targetRoom: (typeof rooms)[number] | undefined;

  const menuIndex = findTarget(question, allMenus.map(m => m.name), 3);
  if (menuIndex >= 0 && (wantsSold || wantsQueue || wantsMenu || /栄光カレー|情熱ラーメン|ヘルシーバリュー|スナック|創価ランチ/.test(question))) {
    targetMenu = allMenus[menuIndex]; target = '学食';
    slots.TN = str(targetMenu.name); slots.TK = str(targetMenu.calorie); slots.TA = str(targetMenu.allergy);
    const match = commonSub(question, targetMenu.name);
    if (match) question = question.replace(match, '{TN}');
  } else if (wantsTask && tasks.length) {
    let idx = findTarget(question, tasks.map(t => t.title), 3);
    if (idx < 0) {
      const subjects = ['数学', '英語', '国語', '物理', '化学', '生物', '日本史', '世界史', '地理', '情報', '古典', '現代文'];
      const subject = subjects.find(s => question.includes(s) && tasks.some(t => t.title.includes(s)));
      if (subject) idx = tasks.findIndex(t => t.title.includes(subject));
    }
    if (idx >= 0) {
      targetTask = tasks[idx]; target = '課題'; slots.TJ = targetTask.title; slots.TD = targetTask.due;
      const match = commonSub(question, targetTask.title);
      if (match.length >= 2) question = question.replace(match, '{TJ}');
    }
  }

  if (wantsRoom && !targetMenu && !targetTask) {
    const qNorm = normalize(question);
    const aliases: Array<{ alias: RegExp; room: string }> = [
      { alias: /パソコン教室|コンピューター室|コンピュータ室/, room: 'PC教室' },
      { alias: /栄光ホール/, room: '栄冠ホール' },
      { alias: /図書室/, room: '図書館' },
    ];
    let mentioned: { alias: string; room: (typeof rooms)[number] } | undefined;
    for (const row of rooms) {
      const name = str(row.room_name, ''); const short = name.replace(/教室$/, '');
      const candidates = [name, short];
      if (row.room_id === '112') candidates.push('普通教室', `${userClass}教室`, `${userClass}の教室`);
      const hit = candidates.filter(x => x.length >= 2).sort((a, b) => b.length - a.length).find(x => qNorm.includes(normalize(x)));
      if (hit) { mentioned = { alias: hit, room: row }; break; }
    }
    if (!mentioned) {
      for (const a of aliases) {
        const match = a.alias.exec(question);
        const room = rooms.find(r => normalize(r.room_name) === normalize(a.room));
        if (match && room) { mentioned = { alias: match[0], room }; break; }
      }
    }
    if (mentioned) {
      targetRoom = mentioned.room; target = '教室';
      slots.TR = str(targetRoom.room_name);
      slots.TS = `${str(targetRoom.status)}${targetRoom.temp ? `（${targetRoom.temp}）` : ''}`;
      question = question.replace(mentioned.alias, '{TR}');
    }
  }

  if (wantsClub) target = '部活';
  if (wantsLibrary) target = '蔵書';
  if (wantsCareer) target = 'キャリア';
  if (wantsLost) target = '落とし物';
  if (wantsReviews) target = '口コミ';
  if (wantsContribution) target = '貢献度';
  if (wantsNotifications) target = '通知';

  const soldContext: Availability = !wantsSold ? 'なし' : targetMenu
    ? (soldIds.has(String(targetMenu.id)) ? 'あり' : 'なし')
    : (isSoldListQuestion(question) && soldNames.length > 0 ? 'あり' : 'なし');
  const counts: Counts = {
    menu: Math.min(allMenus.length, 5),
    kokubunji: kokubunji.length,
    higashimurayama: higashimurayama.length,
    task: Math.min(tasks.length, 3),
    room: rooms.length ? 'あり' : 'なし',
    vote: voteRows.length ? 'あり' : 'なし',
    sold: soldContext,
    club: clubRows.length ? 'あり' : 'なし',
    books: bookRows.length ? 'あり' : 'なし',
    career: 'あり',
    lost: lostRows.length ? 'あり' : 'なし',
    reviews: reviewRows.length ? 'あり' : 'なし',
    contribution: authed && studentId ? 'あり' : 'なし',
    notifications: CURRENT_UI_NOTIFICATIONS.length ? 'あり' : 'なし',
  };

  // 教室一覧はモデルに長文を作らせず、実データを構造化した表として返す。
  const roomListQuestion = /教室の状況|各教室|教室一覧|教室の温度|教室の気温|教室の様子|どの教室|全教室|一覧/.test(question);
  if (wantsRoom && !targetRoom && roomListQuestion) {
    return NextResponse.json({
      answer: '現在の教室の状況です。',
      table: {
        headers: ['教室名', '状態', '温度'],
        rows: rooms.map(r => [r.room_name, r.status, r.temp ?? '—']),
      },
    });
  }
  // 行列の報告はチャット内の選択肢で投票できるようにする。
  if (wantsQueue && targetMenu) {
    return NextResponse.json({
      answer: `情報提供ありがとうございます！${str(targetMenu.name)}の列の長さを教えてください。`,
      queueMenuId: String(targetMenu.id),
      quickReplies: [
        { label: '並びなし', status: 'empty' },
        { label: '普通', status: 'normal' },
        { label: '行列大', status: 'crowded' },
      ],
    });
  }
  // 未登録の本は、モデルの文末に不自然な「です」が付かないよう直接案内する。
  if (wantsLibrary && bookCandidate && !bookFound) {
    return NextResponse.json({ answer: `蔵書データで「${bookCandidate}」は見つかりませんでした。タイトルや著者名を確認して検索してください。` });
  }

  try {
    const { tpl, text } = answerDetailed(counts, direction, target, question, slots);
    if (!tasksReadable && isTaskTemplate(tpl)) {
      return NextResponse.json({ answer: authed
        ? '課題を読み込めませんでした。ログイン状態と課題テーブルの権限を確認してください。'
        : '課題は学校アカウントでログインすると確認できます。ログインしてからもう一度聞いてください。' });
    }
    if (wantsContribution && !studentId) return NextResponse.json({ answer: '貢献度を確認するには学校アカウントでログインしてください。' });
    // 本や教室の検索対象が質問中にあったのに別の出力型になった場合は、推測したデータを返さない。
    if (wantsRoom && targetRoom && !/\{TR\}/.test(tpl) && !tpl.includes(targetRoom.room_name)) {
      return NextResponse.json({ answer: `${targetRoom.room_name}の状況は${slots.TS}です。` });
    }
    return NextResponse.json({ answer: text });
  } catch (e) {
    console.error('campus-ai v3: model inference failed', e);
    return NextResponse.json({ answer: 'AIの回答生成に失敗しました。少し待ってからもう一度試してください。' }, { status: 503 });
  }
}
