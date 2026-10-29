// CampusSync AI v3: TypeScript上で推論し、回答スロットには画面と同じSupabaseデータを埋め込む。
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { LEGACY_SAMPLE_NOTIFICATION_TITLES } from '@/lib/school-notification-utils';
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
const isCrowdQuestion = (q: string) => /(学食|食堂)/.test(q) && /混雑|混ん|空いて|空き具合|投票|混み具合/.test(q);
const isSoldQuestion = (q: string) => /売り切れ|売切れ|売り切|売切/.test(q);
const isSoldListQuestion = (q: string) => /売り切れのメニュー|売り切れてるのは|今売り切れのもの|売り切れ教えて|売り切れてるメニュー|売り切れ一覧|売切れメニュー/.test(q);
const isTaskQuestion = (q: string) => /課題|宿題|提出|期限|締切|ワーク|プリント|やること|今日中|本日中|今日が期限|本日まで|提出済み?|提出完了|完了|済み?|終わったこと/.test(q);
const isTrainQuestion = (q: string) => /電車|何分後|何本目|何本後|何時発|何時来る|駅/.test(q);
const isClubQuestion = (q: string) => /部活|部活動|委員会|連絡ノート|吹奏楽部/.test(q);
const isLibraryQuestion = (q: string) => /蔵書|図書館.*本|図書室.*本|本ある|本は|本を|本のタイトル|書籍|著者|作者|ISBN|貸出|貸し出し|借り|所蔵状況/.test(q);
const isCareerQuestion = (q: string) => /キャリアセンター|キャリア|進路室|自習室.*空|座席状況|空席|座席|席数/.test(q);
const isLostQuestion = (q: string) => /落とし物|忘れ物|届けられてる/.test(q);
const isReviewQuestion = (q: string) => /口コミ|レビュー|感想|評価/.test(q);
const isContributionQuestion = (q: string) => /貢献度|貢献ポイント|累計ポイント|学校貢献|剣ランク|貢献度ランク|ランク|ブロンズ|シルバー|ゴールド|プラチナ|ダイヤモンド/.test(q);
const isProfileQuestion = (q: string) => /学籍番号|所属クラス|私のクラス|自分のクラス|何年何組|何組ですか|私の名前|自分の名前|名前を教えて/.test(q);
const isNotificationQuestion = (q: string) => /通知|お知らせ|リマインダー/.test(q);
const isQueueQuestion = (q: string) => /並び|行列|列|並んで|待ち時間/.test(q);
const isRoomQuestion = (q: string) => /教室|温度|気温|暑い|寒い|栄冠ホール|化学実験室|生物実験室|グローリーホール|ミーティングルーム|グローバルステーション|PC教室|パソコン教室|コンピューター室|家庭科室|図書館|図書室|Call|自習室|体育館|視聴覚室|多目的室|職員室/.test(q);

const DEFAULT_ROOMS = [
  { room_id: '101', room_name: '栄冠ホール', status: '未取得', temp: null },
  { room_id: '102', room_name: '化学実験室', status: '未取得', temp: null },
  { room_id: '103', room_name: '生物実験室', status: '未取得', temp: null },
  { room_id: '104', room_name: 'グローリーホール', status: '未取得', temp: null },
  { room_id: '105', room_name: 'ミーティングルーム1', status: '未取得', temp: null },
  { room_id: '106', room_name: 'ミーティングルーム2', status: '未取得', temp: null },
  { room_id: '107', room_name: '図書館', status: '未取得', temp: null },
  { room_id: '108', room_name: 'グローバルステーション', status: '未取得', temp: null },
  { room_id: '109', room_name: 'Call教室', status: '未取得', temp: null },
  { room_id: '110', room_name: 'PC教室', status: '未取得', temp: null },
  { room_id: '111', room_name: '家庭科室', status: '未取得', temp: null },
  { room_id: '112', room_name: '普通教室（1-1）', status: '未取得', temp: null },
];


export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    question?: unknown;
    voterId?: unknown;
    history?: Array<{ role?: unknown; content?: unknown; queueMenuId?: unknown; quickReplies?: unknown }>;
  } | null;
  let question = typeof body?.question === 'string' ? body.question.trim().slice(0, 100) : '';
  if (!question) return NextResponse.json({ error: '質問を入力してください。' }, { status: 400 });
  const voterId = typeof body?.voterId === 'string' ? body.voterId.trim().slice(0, 128) : '';
  const history = Array.isArray(body?.history) ? body.history.slice(-12).filter((m) =>
    (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string'
  ) as Array<{ role: 'user' | 'assistant'; content: string; queueMenuId?: string; quickReplies?: unknown }> : [];
  const previousUser = [...history].reverse().find(m => m.role === 'user')?.content ?? '';
  const previousAssistant = [...history].reverse().find(m => m.role === 'assistant')?.content ?? '';
  const pendingQueuePrompt = [...history].reverse().find(m =>
    m.role === 'assistant' && typeof m.queueMenuId === 'string' && Array.isArray(m.quickReplies) && m.quickReplies.length > 0
  );
  let followupTrainAfter: string | null = null;
  if (/^(?:じゃあ|それじゃ|では|じゃ)?(?:次は|その次は)[?？!！。]*$/.test(question.replace(/[\s　]/g, '')) && /電車|方面|発/.test(`${previousUser} ${previousAssistant}`)) {
    const followText = `${previousUser} ${previousAssistant}`;
    const followDirection = /東村山|本川越/.test(followText) ? '東村山方面' : '国分寺方面';
    const times = [...previousAssistant.matchAll(/([01]?\d|2[0-3]):[0-5]\d/g)].map(m => m[0]);
    if (times.length) followupTrainAfter = times[times.length - 1];
    question = `${followDirection}方面の次の電車は何時ですか`;
  }
  const normalizedQuestion = normalize(question);
  if (/(あなたができること|何ができる|何を聞ける|何ができるの|何を手伝える|機能一覧|できること一覧)/.test(question)) {
    return NextResponse.json({
      answer: 'CampusSync AIで対応できる主な機能です。実際の登録データがある機能は、データベースの内容を参照して回答します。',
      table: {
        headers: ['機能', '質問例'],
        rows: [
          ['今日の学食・メニュー', '今日の学食を教えて／売り切れは？'],
          ['学食の混雑・行列', '学食は混んでる？／カレーの列は？'],
          ['電車の時刻表', '国分寺方面の次の電車は？'],
          ['課題・提出期限', '自分の課題と締切を教えて'],
          ['教室・室温', '教室の状況や温度を教えて'],
          ['学校イベント・週間予定', '今週の学校予定やカウントダウンは？'],
          ['部活・委員会ノート', '部活の最新連絡を教えて'],
          ['図書館の蔵書', 'この本は図書館にある？'],
          ['落とし物', '届けられた落とし物はある？'],
          ['キャリアセンター自習室', '自習室の空席は？'],
          ['学校からのお知らせ', '最近のお知らせを教えて'],
          ['貢献度・プロフィール', '自分の貢献度や所属クラスは？'],
        ],
      },
    });
  }
  const isGreeting = /^(こんにちは|こんにちわ|おはよう|こんばんは|やあ|どうも)[!！。?？]*$/.test(normalizedQuestion);
  const isFarewell = /^(さようなら|さよなら|またね|バイバイ|ばいばい|失礼します)[!！。?？]*$/.test(normalizedQuestion);
  if (isGreeting) return NextResponse.json({ answer: 'こんにちは！学食・電車・課題・教室・部活ノート・蔵書・落とし物・口コミ・キャリアセンターなどについて聞いてください。' });
  if (isFarewell) return NextResponse.json({ answer: 'またね！気をつけて帰ってください。' });

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
  const wantsProfile = isProfileQuestion(question);
  const wantsNotifications = isNotificationQuestion(question);
  const wantsQueue = isQueueQuestion(question) || (!!pendingQueuePrompt && /^(?:長いよ|長い|普通|まあまあ|並んでない|並びなし|行列大|混んでる|空いてる|空いている)[!！。?？]*$/.test(question.replace(/[\s　]/g, '')));
  const wantsRoom = isRoomQuestion(question) && !wantsCrowd && !wantsLibrary && !wantsCareer;
  const wantsMenu = /メニュー|学食|ランチ|カロリー|アレルギー|食べられる/.test(question) && !wantsCrowd && !wantsReviews;
  const direction: Direction = /東村山|本川越/.test(question)
    ? '東村山方面'
    : /国分寺/.test(question) ? '国分寺方面' : trainQuestion ? '両方' : '国分寺方面';

  const nowDate = new Date();
  const jst = new Date(nowDate.getTime() + 9 * 60 * 60 * 1000);
  const jstHour = jst.getUTCHours();
  const tokyoDateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(nowDate);
  const tokyoDateValues = Object.fromEntries(tokyoDateParts.map(part => [part.type, part.value]));
  const todayDateKey = String(tokyoDateValues.year) + '-' + String(tokyoDateValues.month) + '-' + String(tokyoDateValues.day);
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
  let profileName = '';
  let profileClass = '';

  if ((wantsRoom || wantsProfile) && authed && studentId) {
    let profile: { user_class?: unknown; student_name?: unknown } | null = null;
    try {
      const profileResult = await authed
        .from('profiles')
        .select('student_name, user_class')
        .eq('student_id', studentId)
        .maybeSingle();

      if (!profileResult.error) profile = profileResult.data;
    } catch {
      profile = null;
    }

    profileName = String(profile?.student_name ?? '').trim();
    const rawClass = String(profile?.user_class ?? '').trim();

    if (/^[1-3]-[1-8]$/.test(rawClass)) {
      userClass = rawClass;
      profileClass = rawClass;
    } else {
      const legacyClass = /^([1-3])[- ]([A-H])$/i.exec(rawClass);
      if (legacyClass) {
        userClass = `${legacyClass[1]}-${legacyClass[2].toUpperCase().charCodeAt(0) - 64}`;
        profileClass = userClass;
      }
    }
  }

  if (wantsProfile) {
    if (!authed || !studentId) {
      return NextResponse.json({
        answer: 'プロフィールを確認するには、学校アカウントでログインしてください。'
      });
    }

    if (/学籍番号/.test(question)) {
      return NextResponse.json({
        answer: `ログイン中の学校アカウントの学籍番号は${studentId}です。`
      });
    }

    if (/名前/.test(question)) {
      return NextResponse.json({
        answer: profileName
          ? `登録されている名前は${profileName}です。`
          : 'プロフィールに名前が登録されていません。'
      });
    }

    if (/所属|クラス|何組/.test(question)) {
      return NextResponse.json({
        answer: profileClass
          ? `登録されている所属クラスは${profileClass}です。`
          : '所属クラスをプロフィールから取得できませんでした。プロフィール設定を確認してください。'
      });
    }
  }

  const [todayMenuRes, menuRes, kokubunjiRes, eastRes, roomRes, soldRes, voteRes, taskRes, todoRes, clubRes, booksRes, careerRes, lostRes, reviewsRes, menuVoteRes, notificationsRes] = await Promise.all([
    db.from('cafeteria_daily_menus').select('*').eq('service_date', todayDateKey).maybeSingle(),
    db.from('cafeteria_menu').select('id, name, calorie, allergy, is_active').eq('is_active', true).order('id', { ascending: true }),
    db.from('takanodai_timetable').select('departure_time, service').eq('direction', 'kokubunji'),
    db.from('takanodai_timetable').select('departure_time, service').eq('direction', 'higashimurayama'),
    db.from('room_status').select('room_id, room_name, status, temp, updated_at'),
    db.from('cafeteria_sold_out').select('menu_id, is_sold_out'),
    db.from('cafeteria_votes').select('status').eq('scope_key', 'overall'),
    authed
      ? authed.from('assignments').select('id, title, details, due, due_at, created_at').eq('is_active', true).order('created_at', { ascending: false })
      : Promise.resolve({ data: null, error: null }),
    authed && studentId
      ? authed.from('todos').select('id, title, due, due_at, completed, created_at, details').eq('student_id', studentId).order('created_at', { ascending: true })
      : Promise.resolve({ data: null, error: null }),
    db.from('club_notes').select('club_name, title, content, author, created_at').order('created_at', { ascending: false }).limit(100),
    db.from('library_books').select('id, title, author, code, status, created_at').order('created_at', { ascending: false }).limit(500),
    db.from('study_room_status').select('room_key, room_name, occupied_seats, total_seats, updated_at').eq('room_key', 'career_center').maybeSingle(),
    db.from('lost_and_found').select('*').order('created_at', { ascending: false }).limit(100),
    db.from('cafeteria_reviews').select('menu_id, user_name, rating, comment, created_at').order('created_at', { ascending: false }).limit(200),
    db.from('cafeteria_votes').select('menu_id, scope_key, status, voter_id').not('menu_id', 'is', null),
    db.from('notifications').select('id, title, created_at').order('created_at', { ascending: false }).limit(100),
  ]);

  // 共通課題の完了状態を生徒ごとに読み、完了済みを未完了一覧から除外する。
  const completionRes = authed && studentId && wantsTask
    ? await authed.from('assignment_completions').select('assignment_id, completed').eq('student_id', studentId)
    : { data: [], error: null };

  // 本日分は画面と同じ contribution_scores.score、累計は contribution_history のdelta合計を使う。
  let contributionPoints = 0;
  let dailyScore = 65;
  let contributionError: { message?: string } | null = null;
  if (wantsContribution && authed && studentId) {
    const { data: scoreRow, error: scoreLookupError } = await authed.from('contribution_scores').select('score').eq('student_id', studentId).maybeSingle();
    if (scoreLookupError) contributionError = scoreLookupError;
    else if (scoreRow && Number.isFinite(Number(scoreRow.score))) dailyScore = Number(scoreRow.score);

    let offset = 0;
    const pageSize = 1000;
    while (!contributionError) {
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
  if (wantsMenu && /今日|本日|現在|学食教えて|メニュー教えて|何がある/.test(question) && !wantsCrowd && !wantsReviews) {
    if (todayMenuRes.error) {
      console.error('今日の学食メニュー取得エラー:', todayMenuRes.error.message);
      return NextResponse.json({ answer: '今日の献立データを読み込めませんでした。Adminの月間献立表とSupabaseの設定を確認してください。' });
    }
    const daily = todayMenuRes.data as Record<string, unknown> | null;
    if (!daily) {
      return NextResponse.json({ answer: '今日（' + todayDateKey + '）の献立はデータベースに登録されていません。サンプルメニューではなく、実際の献立データが登録されるとここに表示されます。' });
    }
    if (daily.is_closed === true) {
      return NextResponse.json({ answer: '今日（' + todayDateKey + '）は学食の営業休止として登録されています。' + (String(daily.note || '').trim() ? ' 備考：' + String(daily.note).trim() : '') });
    }
    const categories = [
      { key: 'soka_lunch', label: '創価ランチ', price: 'soka_lunch_price', calorie: 'soka_lunch_calorie', allergy: 'soka_lunch_allergy' },
      { key: 'healthy_lunch', label: 'ヘルシーランチ', price: 'healthy_lunch_price', calorie: 'healthy_lunch_calorie', allergy: 'healthy_lunch_allergy' },
      { key: 'snack_lunch', label: 'スナックランチ', price: 'snack_lunch_price', calorie: 'snack_lunch_calorie', allergy: 'snack_lunch_allergy' },
      { key: 'curry', label: 'カレー', price: 'curry_price', calorie: 'curry_calorie', allergy: 'curry_allergy' },
      { key: 'noodles', label: '麺類', price: 'noodles_price', calorie: 'noodles_calorie', allergy: 'noodles_allergy' },
    ];
    const dailyRows = categories
      .filter(item => String(daily[item.key] || '').trim())
      .map(item => [
        item.label,
        String(daily[item.key]).trim(),
        String(daily[item.price] || '').trim() || '未登録',
        String(daily[item.calorie] || '').trim() || '未登録',
        String(daily[item.allergy] || '').trim() || '未登録',
      ]);
    if (!dailyRows.length) {
      return NextResponse.json({ answer: '今日（' + todayDateKey + '）の献立レコードはありますが、メニュー名がまだ入力されていません。Adminの月間献立表を確認してください。' + (String(daily.note || '').trim() ? ' 備考：' + String(daily.note).trim() : '') });
    }
    return NextResponse.json({
      answer: '今日（' + todayDateKey + '）のAdmin月間献立表に登録されている実際のメニューです。',
      table: {
        headers: ['カテゴリ', 'メニュー', '価格', 'カロリー', 'アレルギー'],
        rows: dailyRows,
      },
    });
  }

  if (trainQuestion && (kokubunjiRes.error || eastRes.error)) return NextResponse.json({ answer: '電車の時刻表を読み込めませんでした。少し待ってからもう一度試してください。' });
  if (wantsClub && clubRes.error) return NextResponse.json({ answer: '部活ノートを読み込めませんでした。少し待ってからもう一度試してください。' });
  if (wantsLibrary && booksRes.error) return NextResponse.json({ answer: '蔵書情報を読み込めませんでした。少し待ってからもう一度試してください。' });
  if (wantsCareer && careerRes.error) return NextResponse.json({ answer: 'キャリアセンターの座席情報を読み込めませんでした。少し待ってからもう一度試してください。' });
  if (wantsCareer) {
    const data = careerRes.data as {
      room_name?: string | null;
      occupied_seats?: number | null;
      total_seats?: number | null;
      updated_at?: string | null;
    } | null;

    if (
      !data ||
      data.occupied_seats == null ||
      data.total_seats == null ||
      !Number.isFinite(Number(data.occupied_seats)) ||
      !Number.isFinite(Number(data.total_seats)) ||
      Number(data.total_seats) <= 0
    ) {
      return NextResponse.json({
        answer: 'キャリアセンター自習室の座席状況は、まだデータベースに登録されていません。'
      });
    }

    const total = Math.floor(Number(data.total_seats));
    const occupied = Math.min(total, Math.max(0, Math.floor(Number(data.occupied_seats))));
    const free = total - occupied;
    const updatedAt = data.updated_at && Number.isFinite(Date.parse(data.updated_at))
      ? ` 最終更新：${new Date(data.updated_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}。`
      : '';

    return NextResponse.json({
      answer: `${data.room_name || 'キャリアセンター自習室'}は${total}席中${occupied}席が使用中で、空席は${free}席です。${updatedAt}`
    });
  }
  if (wantsLost && lostRes.error) return NextResponse.json({ answer: '落とし物情報を読み込めませんでした。少し待ってからもう一度試してください。' });
  if (wantsReviews && reviewsRes.error) return NextResponse.json({ answer: '口コミを読み込めませんでした。少し待ってからもう一度試してください。' });
  if (wantsNotifications && notificationsRes.error) return NextResponse.json({ answer: '学園総合通知を読み込めませんでした。少し待ってからもう一度試してください。' });
  if (wantsContribution && !authed) return NextResponse.json({ answer: '貢献度を確認するには学校アカウントでログインしてください。' });
  if (wantsContribution && contributionError) return NextResponse.json({ answer: '貢献度を読み込めませんでした。少し待ってからもう一度試してください。' });

  type Menu = { id: string | number; name: string; calorie: string | number | null; allergy: string | null; is_active?: boolean | null };
  const liveMenus = ((menuRes.data ?? []) as Menu[]).filter(m => m.is_active !== false);
  // app/page.tsxと同じく、DBに有効メニューがない場合は画面内の初期メニューを使う。
  const allMenus: Menu[] = liveMenus;
  const menuDataIsLive = !menuRes.error && liveMenus.length > 0;
  const menuForList = allMenus.slice(0, 5); // v3は5件まで {N1}〜{N5}
  const soldRows = (soldRes.data ?? []) as Array<{ menu_id: string | number | null; is_sold_out: boolean | null }>;
  const soldIds = new Set(soldRows.filter(r => r.is_sold_out).map(r => String(r.menu_id)));
  const soldNames = allMenus.filter(m => soldIds.has(String(m.id))).map(m => m.name);

  const nextOccurrenceMinute = (time: string, after: number) => {
    let minute = toMin(time);
    if (!Number.isFinite(minute)) return Number.POSITIVE_INFINITY;
    while (minute <= after) minute += 24 * 60;
    return minute;
  };

  const referenceTrainMinute = (time: string, around: number) => {
    let minute = toMin(time);
    if (!Number.isFinite(minute)) return around;
    while (minute < around - 12 * 60) minute += 24 * 60;
    while (minute > around + 12 * 60) minute -= 24 * 60;
    return minute;
  };

  const trainThreshold = followupTrainAfter
    ? Math.max(now, referenceTrainMinute(followupTrainAfter, now))
    : now;

  const cleanTrains = (rows: Array<{ departure_time: string; service: string | null }> | null | undefined) =>
    (rows ?? [])
      .map(r => ({
        ...r,
        _nextMinute: nextOccurrenceMinute(r.departure_time, trainThreshold),
      }))
      .filter(r => Number.isFinite(r._nextMinute) && r._nextMinute > trainThreshold)
      .sort((a, b) => a._nextMinute - b._nextMinute)
      .slice(0, 3);
  const kokubunji = cleanTrains(kokubunjiRes.data as Array<{ departure_time: string; service: string | null }> | null);
  const higashimurayama = cleanTrains(eastRes.data as Array<{ departure_time: string; service: string | null }> | null);
  type TaskRow = { id?: string | number; title: string; due: string | null; due_at: string | null; completed?: boolean | null; created_at?: string | null; details?: string | null; source?: 'personal' | 'assignment' };
  const assignmentRows = (taskRes.data ?? []) as TaskRow[];
  const personalRows = (todoRes.data ?? []) as TaskRow[];
  const completedAssignmentIds = new Set(((completionRes.data ?? []) as Array<{ assignment_id: string | number; completed: boolean | null }>).filter(r => r.completed).map(r => String(r.assignment_id)));
  const activeAssignments = assignmentRows.filter(r => !r.id || !completedAssignmentIds.has(String(r.id)));
  const assignmentTitles = new Set(assignmentRows.map(r => normalize(str(r.title, ''))));
  // 画面のvisibleTodosと同様に重複を除き、完了済みを落として統合する。
  const taskRows: TaskRow[] = [
    ...personalRows
      .filter(r => !r.completed && !assignmentTitles.has(normalize(str(r.title, ''))))
      .map(r => ({ ...r, source: 'personal' as const })),
    ...activeAssignments.map(r => ({ ...r, source: 'assignment' as const })),
  ];
  const tasksReadable = !!authed && !taskRes.error && !todoRes.error && !completionRes.error;
  const parseDueText = (dueText: string | null): number => {
    const raw = String(dueText ?? '').trim().normalize('NFKC');
    if (!raw) return Number.POSITIVE_INFINITY;

    const direct = Date.parse(raw);
    if (Number.isFinite(direct)) return direct;

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(nowDate);

    const part = (type: string) => Number(
      parts.find(item => item.type === type)?.value ?? 0
    );
    const year = part('year');
    const month = part('month');
    const day = part('day');
    const todayUtc = Date.UTC(year, month - 1, day);
    const endOfDay = (daysFromToday: number) =>
      todayUtc + (daysFromToday + 1) * 24 * 60 * 60 * 1000 - 1;

    if (/本日|今日|当日/.test(raw)) return endOfDay(0);
    if (/明日|翌日/.test(raw)) return endOfDay(1);

    const weekdayPatterns: Array<{ pattern: RegExp; day: number }> = [
      { pattern: /日曜/, day: 0 },
      { pattern: /月曜/, day: 1 },
      { pattern: /火曜/, day: 2 },
      { pattern: /水曜/, day: 3 },
      { pattern: /木曜/, day: 4 },
      { pattern: /金曜/, day: 5 },
      { pattern: /土曜/, day: 6 },
    ];
    const weekday = weekdayPatterns.find(item => item.pattern.test(raw));

    if (weekday) {
      const currentDay = new Date(todayUtc).getUTCDay();
      let delta = (weekday.day - currentDay + 7) % 7;

      if (/来週/.test(raw)) {
        // 月曜始まりで、来週の指定曜日を求める
        const currentWeekday = (currentDay + 6) % 7;
        const targetWeekday = (weekday.day + 6) % 7;
        delta = targetWeekday - currentWeekday;
        if (delta <= 0) delta += 7;
      }

      return endOfDay(delta);
    }

    const japaneseDate = /(?:(\d{4})年)?\s*(\d{1,2})月\s*(\d{1,2})日/.exec(raw);
    if (japaneseDate) {
      const targetYear = Number(japaneseDate[1] || year);
      const targetMonth = Number(japaneseDate[2]);
      const targetDay = Number(japaneseDate[3]);
      const timestamp = Date.UTC(targetYear, targetMonth - 1, targetDay) - 9 * 60 * 60 * 1000;
      const check = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay));
      if (
        check.getUTCFullYear() === targetYear &&
        check.getUTCMonth() === targetMonth - 1 &&
        check.getUTCDate() === targetDay
      ) {
        return timestamp + 24 * 60 * 60 * 1000 - 1;
      }
    }

    return Number.POSITIVE_INFINITY;
  };

  const tasks = taskRows.map(r => {
    const parsedDueAt = r.due_at ? Date.parse(r.due_at) : Number.NaN;
    const dueAtMs = Number.isFinite(parsedDueAt)
      ? parsedDueAt
      : parseDueText(r.due);

    return {
      id: r.id,
      source: r.source,
      completed: Boolean(r.completed),
      title: str(r.title),
      due: Number.isFinite(parsedDueAt)
        ? new Date(parsedDueAt).toLocaleString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : str(r.due, '期限未設定'),
      dueAtMs,
      details: str(r.details, ''),
    };
  }).sort((a, b) => a.dueAtMs - b.dueAtMs);

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
  const menuVoteRows = (menuVoteRes.data ?? []) as Array<{ menu_id: string | number | null; scope_key: string | null; status: string | null }>;
  const voteCounts = voteRows.reduce((acc, row) => {
    if (row.status === 'empty') acc.empty++;
    if (row.status === 'normal') acc.normal++;
    if (row.status === 'crowded') acc.crowded++;
    return acc;
  }, { empty: 0, normal: 0, crowded: 0 });
  const crowdLabel = voteRows.length === 0
    ? '未集計'
    : voteCounts.crowded > voteCounts.normal && voteCounts.crowded >= voteCounts.empty
      ? '混んでいる'
      : voteCounts.empty > voteCounts.normal && voteCounts.empty > voteCounts.crowded
        ? '空いている'
        : '普通';
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
  const quotedBookTerm = /[「『"]([^」』"]+)[」』"]/.exec(question)?.[1]?.trim() ?? '';
  const namedBookTerm = /([一-龥ぁ-んァ-ンA-Za-z0-9]+)(?:と名前がついた|という名前がついた|が名前に入った|という名前の)本/.exec(question)?.[1]?.trim() ?? '';

  const cleanBookQuery = (value: string) => value
    .normalize('NFKC')
    .replace(/^(?:じゃあ|それじゃ|では)\s*/, '')
    .replace(/(?:図書館|図書室|蔵書検索|蔵書を検索|蔵書)\s*/g, '')
    .replace(/(?:本はありますか|本ありますか|はありますか|ありますか|あります|あるのでしょうか|あるでしょうか|でしょうか|を調べてください|を調べて|を検索して|で検索して|教えてください|教えて|調べて|検索して|本あるかな|本ある|本はある|って本ある|ってある|の本ある|本を)$/g, '')
    .replace(/(?:本|蔵書)$/g, '')
    .replace(/[?？!！。]+$/g, '')
    .replace(/^[\s　のがはをにでと]+|[\s　のがはをにでと]+$/g, '')
    .trim();

  let bookCandidate = quotedBookTerm || namedBookTerm;
  if (!bookCandidate && wantsLibrary) {
    bookCandidate = cleanBookQuery(question);
  }
  const bookNeedle = normalize(bookCandidate);
  const bookMatches = bookNeedle
    ? bookRows.filter(b => normalize(str(b.title, '')).includes(bookNeedle) || normalize(str(b.author, '')).includes(bookNeedle))
    : [];
  const bookFound = bookMatches.length === 1 ? bookMatches[0] : undefined;
  let bookQueryTerm = bookCandidate;
  let bookResult = '';
  if (bookFound) {
    const status = normalize(str(bookFound.status, ''));
    bookResult = /貸出中|borrowed|checkedout/.test(status)
      ? '貸出中'
      : /貸出可|在架|利用可能|available|availableforloan/.test(status)
        ? '所蔵あり・貸出可能'
        : `所蔵あり（状態：${str(bookFound.status)}）`;
  } else if (bookMatches.length > 1) {
    bookResult = `${bookMatches.length}件見つかりました`;
  } else {
    bookResult = '見つかりません';
  }

  // app/page.tsx の初期表示と同じ値をfallbackにする。DB行があればその値で上書き。
  const career = (careerRes.data as { room_name?: string | null; occupied_seats?: number | null; total_seats?: number | null; updated_at?: string | null } | null);
  const lostRows = (lostRes.data ?? []) as Array<Record<string, unknown>>;
  const lostList = lostRows.slice(0, 6).map(r => `${str(r.title ?? r.item_name, '品名未登録')}｜${str(r.location ?? r.found_location, '場所不明')}｜${str(r.description ?? r.details, '詳細なし')}`).join('\n');
  const reviewRows = (reviewsRes.data ?? []) as Array<{ menu_id: string | number | null; user_name: string | null; rating: number | null; comment: string | null; created_at: string | null }>;
  const menuById = new Map(allMenus.map(m => [String(m.id), m.name]));
  const reviewList = reviewRows.slice(0, 6).map(r => `${menuById.get(String(r.menu_id)) ?? '学食'}｜★${Number(r.rating) || 0}/5｜${str(r.comment, 'コメントなし')}（${str(r.user_name, '匿名')}）`).join('\n');
  const schoolNotificationRows = ((notificationsRes.data ?? []) as Array<{ title?: string | null; created_at?: string | null }>)
    .filter(row => !LEGACY_SAMPLE_NOTIFICATION_TITLES.has(String(row.title || '').trim()));
  const schoolNotificationTime = (value?: string | null) => {
    if (!value) return '日時不明';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? '日時不明'
      : parsed.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const notificationList = schoolNotificationRows.slice(0, 20)
    .map(row => `${schoolNotificationTime(row.created_at)}｜${str(row.title, '学校からのお知らせ')}`)
    .join('\n');

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
  slots.CA = career && career.total_seats != null && career.occupied_seats != null ? Math.max(0, Number(career.total_seats) - Number(career.occupied_seats)) : '未登録';
  slots.CO = career?.occupied_seats ?? '未登録';
  slots.CT = career?.total_seats ?? '未登録';
  slots.LF_LIST = lostList || '現在、落とし物の登録情報はありません。';
  slots.REVIEW_LIST = reviewList || 'まだ口コミは投稿されていません。';
  slots.PTS = Math.max(0, contributionPoints);
  slots.NT_LIST = notificationList || '通知はありません。';

  const addTrainSlots = (rows: Array<{ departure_time: string; service: string | null; _nextMinute?: number }>, hPrefix: string, sPrefix: string, mKey: string) => {
    rows.forEach((r, i) => {
      slots[`${hPrefix}${i + 1}`] = String(r.departure_time).slice(0, 5);
      slots[`${sPrefix}${i + 1}`] = str(r.service, '種別未登録');
    });
    if (rows[0]) slots[mKey] = Math.max(0, (rows[0]._nextMinute ?? nextOccurrenceMinute(rows[0].departure_time, now)) - now);
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
      if (match.length >= 2 && !wantsTask) question = question.replace(match, '{TJ}');
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
    career: careerRes.data ? 'あり' : 'なし',
    lost: lostRows.length ? 'あり' : 'なし',
    reviews: reviewRows.length ? 'あり' : 'なし',
    contribution: authed && studentId ? 'あり' : 'なし',
    notifications: schoolNotificationRows.length ? 'あり' : 'なし',
  };

  const table = (headers: string[], rows: string[][]) => ({ headers, rows });
  const parseTemp = (value: string | null | undefined) => {
    const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : Number.NEGATIVE_INFINITY;
  };
  const sortedRooms = [...rooms].sort((a, b) => parseTemp(b.temp) - parseTemp(a.temp));
  const roomListQuestion = /教室の状況|各教室|教室一覧|教室の温度|教室の気温|教室の様子|どの教室|全教室|一覧|温度順/.test(question);
  const hottestQuestion = /一番高い|最も高い|最高温度|一番暑い|最も暑い/.test(question) && /温度|気温|暑い|部屋|教室/.test(question);
  const lowestQuestion = /一番低い|最も低い|最低温度|一番寒い|最も寒い/.test(question) && /温度|気温|寒い|部屋|教室/.test(question);

  // 単一教室の回答はモデルを通さず、最新の取得値をそのまま返して前置きの誤生成を防ぐ。
  if (wantsRoom && targetRoom && !hottestQuestion && !lowestQuestion) {
    return NextResponse.json({ answer: `${targetRoom.room_name}は${targetRoom.status}${targetRoom.temp ? `（${targetRoom.temp}）` : ''}です。` });
  }
  if (wantsRoom && (hottestQuestion || lowestQuestion)) {
    const ordered = [...rooms].filter(r => parseTemp(r.temp) !== Number.NEGATIVE_INFINITY).sort((a, b) => parseTemp(a.temp) - parseTemp(b.temp));
    const chosen = hottestQuestion ? ordered[ordered.length - 1] : ordered[0];
    if (!chosen) return NextResponse.json({ answer: '教室の温度データを取得できませんでした。' });
    const extreme = parseTemp(chosen.temp);
    const ties = ordered.filter(r => parseTemp(r.temp) === extreme);
    return NextResponse.json({ answer: `${hottestQuestion ? '最も温度が高い' : '最も温度が低い'}のは${ties.map(r => r.room_name).join('、')}です（${chosen.temp}）。`, table: table(['教室名', '状態', '温度'], ties.map(r => [r.room_name, r.status, r.temp ?? '—'])) });
  }
  if (wantsRoom && !targetRoom && roomListQuestion) {
    const sorted = /温度順|高い順|暑い順/.test(question) ? sortedRooms : /低い順|寒い順/.test(question) ? [...rooms].sort((a, b) => parseTemp(a.temp) - parseTemp(b.temp)) : rooms;
    return NextResponse.json({ answer: '現在の教室の状況です。', table: table(['教室名', '状態', '温度'], sorted.map(r => [r.room_name, r.status, r.temp ?? '—'])) });
  }

  // メニュー一覧もモデルによる省略を避け、実際の有効メニューを表として返す。
  if (wantsMenu && !wantsSold && !targetMenu && /今日|現在|一覧|何がある|メニューは|メニュー教えて/.test(question)) {
    return NextResponse.json({
      answer: menuDataIsLive
        ? 'データベースに登録されている有効な学食メニューです。今日の献立を確認したい場合は「今日の学食を教えて」と聞いてください。'
        : '有効な学食メニューがデータベースに登録されていません。サンプルメニューは実際の献立と誤認されるため表示しません。',
      table: allMenus.length ? table(['メニュー', 'カロリー', 'アレルギー', '販売状況'], allMenus.map(m => [
        str(m.name),
        str(m.calorie),
        str(m.allergy),
        soldIds.has(String(m.id)) ? '売り切れ' : '販売中'
      ])) : undefined
    });
  }

  // 売り切れは直接データから判定し、相反する文をモデルに生成させない。
  if (wantsSold) {
    if (!menuDataIsLive) return NextResponse.json({ answer: '学食メニューが登録されていないため、売り切れ情報と照合できません。' });
    if (isSoldListQuestion(question) || !targetMenu) {
      const rows = allMenus.filter(m => soldIds.has(String(m.id))).map(m => [m.name, '売り切れ']);
      return NextResponse.json({ answer: rows.length ? '現在売り切れのメニューです。' : '現在、売り切れのメニューはありません。', table: rows.length ? table(['メニュー', '状態'], rows) : undefined });
    }
    const isSold = soldIds.has(String(targetMenu.id));
    return NextResponse.json({ answer: isSold ? `${targetMenu.name}は売り切れています。現在は注文できません。` : `${targetMenu.name}は売り切れていません。現在の売り切れ情報では注文可能です。` });
  }

  // 学食全体の混雑状況は最新投票から決定論的に返す。
  if (wantsCrowd && !wantsQueue) {
    return NextResponse.json({
      answer: voteRows.length
        ? `今の学食の混み具合は「${crowdLabel}」です（投票${voteRows.length}件）。`
        : '学食の混雑状況はまだ投票されていません。',
      table: table(['状況', '投票数'], [
        ['空いている', String(voteCounts.empty)],
        ['普通', String(voteCounts.normal)],
        ['混んでいる', String(voteCounts.crowded)]
      ])
    });
  }

  // 行列について「今どうかを尋ねる」のと「長いと報告する」を区別する。
  const explicitQueueQuestion = /どれくらい|どのくらい|今どんな感じ|今.*(?:列|並び)|並んでる[?？]|待ち時間/.test(question);
  const queueStatusFromText = (text: string): 'empty' | 'normal' | 'crowded' | null => {
    if (/並んでない|列なし|並びなし|待ちなし|空いてる|空いている/.test(text)) return 'empty';
    if (/普通|まあまあ|少し並|ちょっと並/.test(text)) return 'normal';
    if (/行列大|長いよ|かなり長|めちゃくちゃ並|すごく並|混んでる|混雑してる|列が長い|並びが長い/.test(text)) return 'crowded';
    return null;
  };
  const isQueueReport = !!queueStatusFromText(question) && !explicitQueueQuestion;
  const pendingQueueId = typeof pendingQueuePrompt?.queueMenuId === 'string' ? pendingQueuePrompt.queueMenuId : '';
  if (wantsQueue && !menuDataIsLive) return NextResponse.json({ answer: '学食メニューが登録されていないため、メニュー別の行列状況を確認できません。' });
  if (wantsQueue && !targetMenu && pendingQueueId && queueStatusFromText(question)) {
    targetMenu = allMenus.find(m => String(m.id) === pendingQueueId);
  }
  if (wantsQueue && targetMenu && menuVoteRes.error) {
    return NextResponse.json({ answer: 'そのメニューの列の投票状況を読み込めませんでした。少し待ってからもう一度試してください。' });
  }
  if (wantsQueue && targetMenu && (isQueueReport || explicitQueueQuestion || /列|並び|待ち時間/.test(question))) {
    const relevantVotes = menuVoteRows.filter(r => String(r.menu_id ?? r.scope_key) === String(targetMenu!.id));
    const queueCounts = relevantVotes.reduce((acc, r) => {
      if (r.status === 'empty') acc.empty++;
      if (r.status === 'normal') acc.normal++;
      if (r.status === 'crowded') acc.crowded++;
      return acc;
    }, { empty: 0, normal: 0, crowded: 0 });
    const queueLabel = queueCounts.crowded > queueCounts.normal && queueCounts.crowded >= queueCounts.empty ? '行列大' : queueCounts.empty > queueCounts.normal && queueCounts.empty > queueCounts.crowded ? '並びなし' : '普通';
    if (soldIds.has(String(targetMenu.id))) return NextResponse.json({ answer: `${targetMenu.name}は売り切れのため、列状況の投票を受け付けていません。` });
    if (isQueueReport) {
      const status = queueStatusFromText(question)!;
      if (!voterId) return NextResponse.json({ answer: `${targetMenu.name}の列の状況は分かりましたが、投票IDを取得できませんでした。画面を再読み込みして試してください。` });
      const saveRes = await db.from('cafeteria_votes').upsert({ menu_id: String(targetMenu.id), scope_key: String(targetMenu.id), voter_id: voterId, status }, { onConflict: 'scope_key,voter_id' });
      if (saveRes.error) return NextResponse.json({ answer: '行列の投票を保存できませんでした。少し待ってからもう一度試してください。' }, { status: 500 });
      const label = status === 'empty' ? '並びなし' : status === 'normal' ? '普通' : '行列大';
      return NextResponse.json({ answer: `情報提供ありがとう！${targetMenu.name}の列を「${label}」として投票しました。` });
    }
    return NextResponse.json({
      answer: relevantVotes.length ? `${targetMenu.name}の現在の列は「${queueLabel}」です（投票${relevantVotes.length}件）。状況を更新する場合は選んでください。` : `${targetMenu.name}の列について、まだ投票データがありません。状況を報告する場合は選んでください。`,
      queueMenuId: String(targetMenu.id),
      quickReplies: [ { label: '並びなし', status: 'empty' }, { label: '普通', status: 'normal' }, { label: '行列大', status: 'crowded' } ],
      table: table(['状況', '投票数'], [['並びなし', String(queueCounts.empty)], ['普通', String(queueCounts.normal)], ['行列大', String(queueCounts.crowded)]]),
    });
  }

  // 課題はログイン中の生徒の未完了データを直接検索する。
  if (wantsTask) {
    if (!tasksReadable) {
      return NextResponse.json({
        answer: authed
          ? '課題データを読み込めませんでした。ログイン状態と課題テーブルの権限を確認してください。'
          : '課題を確認するには学校アカウントでログインしてください。'
      });
    }


    const completionText = question.normalize('NFKC').trim();
    const completionCommand =
      /(?:提出済み?|提出完了|完了済み?|完了|済み?|終わったこと)(?:にしてください|にして|にする|にしたい|に設定(?:して)?|に変えて|とする|に|を完了にして)(?:ください|お願いします)?[。！!？?]*$/.test(completionText);

    if (completionCommand) {
      if (!authed || !studentId) {
        return NextResponse.json({
          answer: '課題の状態を変更するには、学校アカウントでログインしてください。'
        });
      }

      const ordinalMatch =
        /上から\s*(\d+|一|二|三|四|五|六|七|八|九|十)\s*番目/.exec(completionText);
      const ordinalWords: Record<string, number> = {
        一: 1, 二: 2, 三: 3, 四: 4, 五: 5,
        六: 6, 七: 7, 八: 8, 九: 9, 十: 10
      };
      const ordinal = ordinalMatch
        ? (Number(ordinalMatch[1]) || ordinalWords[ordinalMatch[1]] || null)
        : null;

      const queryWithoutAction = completionText
        .replace(/(?:提出済み?|提出完了|完了済み?|完了|済み?|終わったこと)(?:にしてください|にして|にする|にしたい|に設定(?:して)?|に変えて|とする|に|を完了にして)(?:ください|お願いします)?[。！!？?]*$/, '')
        .replace(/上から\s*(?:\d+|一|二|三|四|五|六|七|八|九|十)\s*番目(?:の)?/g, '')
        .replace(/^\s*(?:この|その)?(?:課題|宿題|提出物)\s*(?:を|は)?/, '')
        .replace(/(?:を|は|が|に|へ|も)\s*$/, '')
        .replace(/[。！!？?]+$/, '')
        .trim();

      const canonicalTask = (value: string) =>
        normalize(value)
          .normalize('NFKC')
          .toLocaleLowerCase()
          .replace(/[\s　・「」『』"'“”（）()]/g, '')
          .replace(/の/g, '');

      const taskQuery = canonicalTask(queryWithoutAction);
      const pendingTasks = tasks.filter(t => !t.completed);

      const exactTask = pendingTasks.find(
        t => canonicalTask(t.title) === taskQuery
      );

      const partialMatches = pendingTasks.filter(t => {
        const title = canonicalTask(t.title);
        return taskQuery.length >= 3 &&
          (title.includes(taskQuery) || taskQuery.includes(title));
      });

      // 「上から3番目」は、未完了課題一覧の現在の順番で特定する。
      const targetTask = ordinal !== null
        ? pendingTasks[ordinal - 1]
        : exactTask || (partialMatches.length === 1 ? partialMatches[0] : undefined);

      if (!targetTask || !targetTask.id) {
        return NextResponse.json({
          answer: '変更する課題を一意に特定できませんでした。未完了課題の正確な名前か、「上から3番目の課題を提出済みにして」のように指定してください。状態は変更していません。'
        });
      }

      const updatedAt = new Date().toISOString();

      if (targetTask.source === 'assignment') {
        const { error } = await authed
          .from('assignment_completions')
          .upsert({
            student_id: studentId,
            assignment_id: String(targetTask.id),
            completed: true,
            updated_at: updatedAt
          }, { onConflict: 'student_id,assignment_id' });

        if (error) {
          console.error('共通課題の完了状態保存に失敗:', error);
          return NextResponse.json({
            answer: '課題を完了済みにできませんでした。課題テーブルの権限設定を確認してください。'
          }, { status: 500 });
        }
      } else if (targetTask.source === 'personal') {
        const { data, error } = await authed
          .from('todos')
          .update({ completed: true, updated_at: updatedAt })
          .eq('id', targetTask.id)
          .eq('student_id', studentId)
          .select('id')
          .maybeSingle();

        if (error || !data) {
          console.error('個人課題の完了状態保存に失敗:', error);
          return NextResponse.json({
            answer: '個人課題を完了済みにできませんでした。保存権限と課題データを確認してください。'
          }, { status: 500 });
        }
      } else {
        return NextResponse.json({
          answer: 'この課題の保存先を確認できなかったため、状態は変更していません。'
        });
      }

      return NextResponse.json({
        answer: `CampusSync上で「${targetTask.title}」を完了済みにしました。Google Classroomへの提出が必要な場合は、Classroom側でも提出を確認してください。`
      });
    }
    if (!tasks.length) {
      return NextResponse.json({ answer: '現在の未完了課題はありません。' });
    }

    const q = question.normalize('NFKC');

    const subjects = [
      '数学', '英語', '国語', '物理', '化学', '生物',
      '日本史', '世界史', '地理', '情報', '古典', '現代文'
    ];

    const subject = subjects.find(name => q.includes(name));

    const subjectTasks = subject
      ? tasks.filter(t =>
          normalize(`${t.title} ${t.details}`).includes(normalize(subject))
        )
      : tasks;

    if (subject && !subjectTasks.length) {
      return NextResponse.json({
        answer: `「${subject}」に関する未完了課題は見つかりませんでした。`
      });
    }

    const tokyoDateKey = (date: Date) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(date);

      const part = (type: string) =>
        parts.find(item => item.type === type)?.value ?? '';

      return `${part('year')}-${part('month')}-${part('day')}`;
    };

    const isToday = /今日中|今日まで|今日が期限|今日の課題|本日中|本日まで|本日が期限|今日/.test(q);
    const isNearest = /期限.*近|近い.*課題|締切.*近|一番.*近い|最も近い/.test(q);

    const todayKey = tokyoDateKey(new Date());

    const selectedTasks = isToday
      ? subjectTasks.filter(t =>
          Number.isFinite(t.dueAtMs) &&
          tokyoDateKey(new Date(t.dueAtMs)) === todayKey
        )
      : subjectTasks;

    if (isToday && !selectedTasks.length) {
      return NextResponse.json({
        answer: subject
          ? `今日が期限の「${subject}」の未完了課題はありません。`
          : '今日が期限の未完了課題はありません。'
      });
    }

    if (isNearest) {
      const datedTasks = selectedTasks
        .filter(t => Number.isFinite(t.dueAtMs))
        .sort((a, b) => a.dueAtMs - b.dueAtMs);

      if (!datedTasks.length) {
        return NextResponse.json({
          answer: '期限が登録されている未完了課題は見つかりませんでした。'
        });
      }

      const nextTask = datedTasks[0];

      return NextResponse.json({
        answer: `最も期限が近い未完了課題は「${nextTask.title}」（期限：${nextTask.due}）です。`
      });
    }

    const heading = isToday
      ? '今日が期限の未完了課題です。'
      : subject
        ? `「${subject}」に関する未完了課題です。`
        : '未完了の課題一覧です。';

    return NextResponse.json({
      answer: heading,
      table: table(
        ['課題', '期限', '詳細'],
        selectedTasks.map(t => [t.title, t.due, t.details || '—'])
      )
    });
  }

  // 口コミは指定された評価に応じて直接絞り込む。
  if (wantsReviews) {
    const reviewRowsTyped = reviewRows;
    const normalizedRatingQuestion = question.normalize('NFKC');

    const rangeMatch = /(?:星|★)\s*([1-5])\s*(?:〜|～|-|から)\s*([1-5])/.exec(normalizedRatingQuestion);
    const comparisonMatch = rangeMatch
      ? null
      : /(?:星|★)\s*([1-5])\s*(以上|以下|未満|より上|より下|超え|より高い|より低い)/.exec(normalizedRatingQuestion);
    const singleMatch = rangeMatch || comparisonMatch
      ? null
      : /(?:星|★)\s*([1-5])/.exec(normalizedRatingQuestion);

    const lowOnly = /低評価|低い評価|悪い口コミ|低評価だけ/.test(normalizedRatingQuestion)
      || /(?:星|★)\s*[12](?!\s*(?:以上|以下|未満|より上|より下|超え|より高い|より低い))/.test(normalizedRatingQuestion);
    const highOnly = /高評価|高い評価|良い口コミ|いい口コミ|好評|おすすめの口コミ|高評価だけ/.test(normalizedRatingQuestion);

    const rangeMin = rangeMatch ? Number(rangeMatch[1]) : 0;
    const rangeMax = rangeMatch ? Number(rangeMatch[2]) : 0;
    const comparisonRating = comparisonMatch ? Number(comparisonMatch[1]) : null;
    const comparisonOperator = comparisonMatch?.[2] ?? '';
    const requestedRating = singleMatch ? Number(singleMatch[1]) : null;

    const selectedFilter = rangeMatch
      ? `★${rangeMin}〜${rangeMax}`
      : comparisonMatch
        ? `★${comparisonRating}${comparisonOperator}`
        : requestedRating !== null
          ? `★${requestedRating}`
          : lowOnly
            ? '低評価（★1〜2）'
            : highOnly
              ? '高評価（★4〜5）'
              : '';

    const chosen = reviewRowsTyped.filter(r => {
      const rating = r.rating === null ? null : Number(r.rating);
      if (rating === null || !Number.isFinite(rating)) return false;

      if (rangeMatch) {
        return rating >= rangeMin && rating <= rangeMax;
      }
      if (comparisonMatch) {
        if (comparisonOperator === '以上') return rating >= comparisonRating!;
        if (comparisonOperator === '以下') return rating <= comparisonRating!;
        if (comparisonOperator === '未満' || comparisonOperator === 'より下' || comparisonOperator === 'より低い') return rating < comparisonRating!;
        return rating > comparisonRating!;
      }
      if (requestedRating !== null) return rating === requestedRating;
      if (lowOnly) return rating >= 1 && rating <= 2;
      if (highOnly) return rating >= 4 && rating <= 5;
      return true;
    });

    if (!chosen.length) {
      return NextResponse.json({
        answer: selectedFilter
          ? `${selectedFilter}の口コミは見つかりませんでした。`
          : '口コミはまだ登録されていません。'
      });
    }

    return NextResponse.json({
      answer: selectedFilter ? `${selectedFilter}の口コミです。` : '学食の口コミです。',
      table: table(
        ['メニュー', '評価', '口コミ', '投稿者', '投稿日時'],
        chosen.map(r => [
          menuById.get(String(r.menu_id)) ?? '学食',
          `★${Number(r.rating) || 0}/5`,
          str(r.comment, 'コメントなし'),
          str(r.user_name, '匿名'),
          r.created_at
            ? new Date(r.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
            : '日時不明'
        ])
      )
    });
  }

  // 部活ノートは、最新指定なら1件、それ以外は最大5件表示する。
  if (wantsClub) {
    const matchingClubs = clubsFiltered;
    const latestOnly = /最新|一番新しい|いちばん新しい|直近|最近の連絡|最後の連絡/.test(question);
    const visibleClubs = latestOnly
      ? matchingClubs.slice(0, 1)
      : matchingClubs.slice(0, 5);

    if (!visibleClubs.length) {
      return NextResponse.json({
        answer: '部活・委員会の連絡ノートはまだありません。'
      });
    }

    return NextResponse.json({
      answer: latestOnly
        ? '最新の部活・委員会の連絡ノートです。'
        : '部活・委員会の連絡ノートです。',
      table: table(
        ['部活・委員会', 'タイトル', '投稿日時', '内容'],
        visibleClubs.map(r => [
          str(r.club_name, '未登録'),
          str(r.title, 'タイトルなし'),
          r.created_at
            ? new Date(r.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
            : '日時不明',
          str(r.content, '本文なし')
        ])
      )
    });
  }

  // 蔵書はタイトル・著者の部分一致を許し、「創価を含む本」なども検索する。
  if (wantsLibrary) {
    if (!bookCandidate) {
      return NextResponse.json({ answer: '蔵書一覧です。タイトルや著者の一部を指定すると絞り込めます。', table: table(['タイトル', '著者', '貸出状況'], bookRows.slice(0, 50).map(b => [str(b.title), str(b.author), str(b.status)])) });
    }
    if (!bookMatches.length) return NextResponse.json({ answer: `蔵書データで「${bookCandidate}」を含む本は見つかりませんでした。タイトルや著者名を確認してください。` });
    return NextResponse.json({ answer: `「${bookCandidate}」を含む蔵書が${bookMatches.length}件見つかりました。`, table: table(['タイトル', '著者', '蔵書コード', '貸出状況'], bookMatches.map(b => [str(b.title), str(b.author), str(b.code, '—'), str(b.status)])) });
  }

  // 落とし物は、品名や説明が質問に一致するレコードだけを返す。
  if (wantsLost) {
    const explicitLostItem = /(?:落とし物|忘れ物)(?:に|で|の)?(.+?)(?:はある|ありますか|あるか|はどこ|を探|ってある|ある[?？]|ですか)/.exec(question)?.[1]?.trim() ?? /(.+?)(?:の)?(?:落とし物|忘れ物)(?:は|が)?(?:ある|ありますか|あるか|ってある|はどこ|を探|[?？])/.exec(question)?.[1]?.trim() ?? '';
    const cleanedLostItem = explicitLostItem || question
      .replace(/落とし物|忘れ物|登録情報|何が|どこに届けられた|どこに|届けられた|教えて|一覧|ですか|です|あるの|ありますか|あるか|ある|は|に|を|[?？!！。]/g, '');
    const lostSearch = normalize(
      cleanedLostItem
        .replace(/(?:の)?(?:落とし物|忘れ物)$/g, '')
        .replace(/(?:ありますでしょうか|ありますか|あります|あるかな|あるの|あるか|ある)$/g, '')
        .replace(/(?:の|が|を|は|に|で|と|です)+$/g, '')
        .trim()
    );
    const genericLost = !lostSearch || /^(何|一覧|情報|何がある)$/.test(lostSearch);
    const matchingLost = genericLost ? lostRows : lostRows.filter(r => {
      const title = normalize(str(r.title ?? r.item_name, ''));
      const allText = normalize(`${title} ${str(r.description ?? r.details, '')} ${str(r.location ?? r.found_location, '')} ${str(r.finder ?? r.storage_location ?? r.storage ?? r.found_by, '')}`);
      if (allText.includes(lostSearch)) return true;
      // 「黒い傘」など、登録名に「折りたたみ」が挟まる一般名でも探せるようにする。
      if (lostSearch.endsWith('傘')) {
        const prefix = lostSearch.slice(0, -1);
        return title.includes('傘') && (!prefix || title.includes(prefix));
      }
      return false;
    });
    if (!matchingLost.length) return NextResponse.json({ answer: genericLost ? '落とし物の登録情報はありません。' : `「${lostSearch || question.replace(/[?？!！。]/g, '')}」に一致する落とし物は登録されていません。` });
    return NextResponse.json({ answer: genericLost ? '現在登録されている落とし物です。' : '該当する落とし物が見つかりました。', table: table(['品名', '場所', '詳細', '保管先', '登録日時'], matchingLost.map(r => [str(r.title ?? r.item_name), str(r.location ?? r.found_location), str(r.description ?? r.details), str(r.finder ?? r.storage_location ?? r.storage ?? r.found_by), r.created_at ? new Date(String(r.created_at)).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '日時不明'])) });
  }

  // 学園総合通知は生徒画面と同じnotificationsテーブルの実データを返す。
  if (wantsNotifications) {
    const amountMatch = /([1-9１-９])件/.exec(question);
    const digit = amountMatch?.[1] ?? '';
    const requested = digit ? (/^[１-９]$/.test(digit) ? '１２３４５６７８９'.indexOf(digit) + 1 : Number(digit)) : 5;
    const notifications = schoolNotificationRows.slice(0, Math.min(20, requested));
    if (!notifications.length) {
      return NextResponse.json({ answer: '現在、公開中の学園総合通知はありません。' });
    }
    return NextResponse.json({
      answer: '現在公開中の学園総合通知です。',
      table: table(['日時', '通知内容'], notifications.map(n => [schoolNotificationTime(n.created_at), str(n.title, '学校からのお知らせ')])),
    });
  }

  // 貢献度は、電車など他カテゴリの回答へ流れないよう直接返す。
  if (wantsContribution) {
    if (!authed || !studentId) return NextResponse.json({ answer: '貢献度を確認するには学校アカウントでログインしてください。' });
    const currentContributionPoints = Math.max(0, contributionPoints);
    const rankDefinitions = [
      { name: 'ブロンズ', minPoints: 0 },
      { name: 'シルバー', minPoints: 100 },
      { name: 'ゴールド', minPoints: 250 },
      { name: 'サファイア', minPoints: 500 },
      { name: 'ダイヤモンド', minPoints: 1000 },
      { name: 'アメジスト', minPoints: 1500 },
      { name: 'アクアマリン', minPoints: 2000 },
      { name: 'シトリン', minPoints: 2500 },
      { name: 'エメラルド', minPoints: 3000 },
      { name: 'ペリドット', minPoints: 3500 },
      { name: 'ローズクォーツ', minPoints: 4000 },
      { name: 'ルビー', minPoints: 4500 },
      { name: 'トパーズ', minPoints: 5000 },
      { name: 'オニキス', minPoints: 6000 },
      { name: 'レインボー', minPoints: 8000 },
    ] as const;
    const contributionRank = [...rankDefinitions]
      .reverse()
      .find(rank => currentContributionPoints >= rank.minPoints)?.name ?? 'ブロンズ';

    return NextResponse.json({
      answer: `現在の貢献度ランクは「${contributionRank}」です。本日の貢献度は${dailyScore}/100、累計貢献ポイントは${currentContributionPoints}ポイントです。`,
      table: table(
        ['区分', 'ポイント'],
        [
          ['本日', `${dailyScore}/100`],
          ['累計', `${currentContributionPoints}ポイント`],
          ['現在のランク', contributionRank],
        ]
      )
    });
  }

  if (followupTrainAfter && trainQuestion) {
    const future = direction === '東村山方面' ? higashimurayama : kokubunji;
    const nextTrain = future[0];
    return NextResponse.json({ answer: nextTrain ? `${direction}の次の電車は${String(nextTrain.departure_time).slice(0, 5)}発の${str(nextTrain.service, '種別未登録')}です。` : `${direction}の次の電車を時刻表から確認できませんでした。` });
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
