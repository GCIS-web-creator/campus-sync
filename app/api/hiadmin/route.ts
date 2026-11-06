import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AuthContext = { user: User; admin: SupabaseClient };

function fail(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization' } });
}

function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

function matchesSecret(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

async function authorize(request: Request): Promise<AuthContext | NextResponse> {
  const allowed = (process.env.CAMPUS_SYNC_HIADMIN_EMAILS || '').split(/[;,]/).map((v) => v.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length) return fail('CAMPUS_SYNC_HIADMIN_EMAILS が未設定です。', 503);

  const gate2 = process.env.CAMPUS_SYNC_HIADMIN_PASSWORD_2 || '';
  const gate3 = process.env.CAMPUS_SYNC_HIADMIN_PASSWORD_3 || '';
  if (gate2.length < 16 || gate3.length < 16 || gate2 === gate3) {
    return fail('CAMPUS_SYNC_HIADMIN_PASSWORD_2 と CAMPUS_SYNC_HIADMIN_PASSWORD_3 に、異なる16文字以上の秘密文字列を設定してください。', 503);
  }

  const authClient = publicClient();
  const admin = serviceClient();
  if (!authClient || !admin) return fail('Supabaseのサーバー環境変数が不足しています。', 503);
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
  if (!match) return fail('CampusSyncにログインしてください。', 401);
  const { data, error } = await authClient.auth.getUser(match[1]);
  if (error || !data.user) return fail('ログインセッションを確認できません。再度ログインしてください。', 401);
  const email = (data.user.email || '').trim().toLowerCase();
  if (!email || !allowed.includes(email)) return fail('このアカウントは最高管理者として許可されていません。', 403);

  const { data: attempts, error: attemptsError } = await admin.from('hiadmin_gate_attempts')
    .select('failed_attempts,locked_until').eq('user_id', data.user.id).maybeSingle();
  if (attemptsError) return fail('認証ロック状態を確認できません。', 503);
  if (attempts?.locked_until && Date.parse(attempts.locked_until) > Date.now()) {
    return fail('追加パスワードの失敗回数が上限に達しました。15分後に再試行してください。', 423);
  }

  const provided2 = request.headers.get('x-hiadmin-password-2') || '';
  const provided3 = request.headers.get('x-hiadmin-password-3') || '';
  if (!provided2 || !provided3) return fail('第2・第3パスワードを入力してください。', 428);

  const valid2 = matchesSecret(provided2, gate2);
  const valid3 = matchesSecret(provided3, gate3);
  const valid = valid2 && valid3;
  if (!valid) {
    const failed = (attempts?.failed_attempts || 0) + 1;
    const lockedUntil = failed >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    const { error: saveError } = await admin.from('hiadmin_gate_attempts').upsert({
      user_id: data.user.id, failed_attempts: failed, locked_until: lockedUntil, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (saveError) return fail('認証失敗回数を記録できません。', 503);
    if (lockedUntil) return fail('追加パスワードが5回連続で一致しなかったため、15分間ロックしました。', 423);
    return fail('第2・第3パスワードの組み合わせが一致しません。', 409);
  }

  const { error: resetError } = await admin.from('hiadmin_gate_attempts').upsert({
    user_id: data.user.id, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (resetError) return fail('認証状態を更新できません。', 503);
  return { user: data.user, admin };
}


type ExplorerColumn = { name: string; type: string; nullable: boolean; default: string | null };
type ExplorerTable = { name: string; estimated_rows: number; primary_key: string[]; columns: ExplorerColumn[] };

const EXPLORER_TABLE_INFO: Record<string, { label: string; group: string; description: string }> = {
  assignment_completions: { label: '課題の完了記録', group: '授業・学習', description: '生徒ごとの共通課題の完了状態を保存します。' },
  assignments: { label: '共通課題', group: '授業・学習', description: '先生・管理者が登録した課題、説明、提出期限を保存します。' },
  bus_status: { label: 'バス運行・混雑状況', group: '交通・時刻表', description: 'バス停ごとの混雑状態や遅延分数を保存します。' },
  cafeteria_announcements: { label: '学食のお知らせ設定', group: '学食・施設', description: '学食タブに表示するメッセージやポップアップ設定です。' },
  cafeteria_daily_menu_reviews: { label: '日別メニューの評価', group: '学食・施設', description: '生徒が日ごとの献立に付けた評価・コメントです。' },
  cafeteria_daily_menus: { label: '月間献立データ', group: '学食・施設', description: '営業日ごとのメニュー、価格、カロリー、アレルギー情報です。' },
  cafeteria_menu: { label: '学食メニュー基本情報', group: '学食・施設', description: '学食のメニュー名や販売状態などの基本情報です。' },
  cafeteria_reviews: { label: 'メニューのレビュー', group: '学食・施設', description: '学食メニューへの評価とコメントを保存します。' },
  cafeteria_sold_out: { label: '売切状態', group: '学食・施設', description: 'メニューごとの売切・販売再開状態とLINE通知日時です。' },
  cafeteria_sold_out_reports: { label: '売切報告', group: '学食・施設', description: '生徒から寄せられた売切報告の履歴です。' },
  cafeteria_votes: { label: '学食の投票', group: '学食・施設', description: 'メニューや販売内容に対する生徒の投票データです。' },
  campus_ai_examples: { label: 'Campus AIの回答例', group: 'AI・ナレッジ', description: 'AIの回答品質を整えるための質問例・承認済み回答例です。' },
  campus_ai_knowledge: { label: 'Campus AIの知識ベース', group: 'AI・ナレッジ', description: 'Campus AIが参照する学校情報やナレッジです。' },
  campus_note_attachments: { label: 'ノートの添付ファイル情報', group: 'ノート・学習記録', description: 'ノートに添付したファイルの保存先・形式・容量です。' },
  campus_note_collaborators: { label: 'ノートの共同編集者', group: 'ノート・学習記録', description: '共有ノートに参加するユーザーと閲覧・編集権限です。' },
  campus_note_comments: { label: 'ノートのコメント', group: 'ノート・学習記録', description: '共同ノートに付いたコメントです。' },
  campus_note_folders: { label: 'ノートのフォルダー', group: 'ノート・学習記録', description: '生徒ごとのノート整理用フォルダーです。' },
  campus_note_versions: { label: 'ノートの編集履歴', group: 'ノート・学習記録', description: 'ノート本文の過去バージョンです。' },
  campus_notes: { label: 'Campusノート', group: 'ノート・学習記録', description: '生徒が保存したノート本文、タイトル、タグ、公開範囲です。' },
  chat_audit_logs: { label: 'チャット監査ログ', group: 'チャット・コミュニティ', description: 'チャット投稿・編集・削除などの監査記録です。証跡保全のため編集できません。' },
  chat_message_reports: { label: 'チャット通報', group: 'チャット・コミュニティ', description: 'チャット投稿に対する通報理由と確認状況です。' },
  class_chat_messages: { label: 'クラスチャット投稿', group: 'チャット・コミュニティ', description: 'クラス内チャットの本文・投稿者・添付ファイル情報です。' },
  class_chat_reactions: { label: 'クラスチャットのリアクション', group: 'チャット・コミュニティ', description: 'クラスチャット投稿に付けられた絵文字リアクションです。' },
  class_timetable_slots: { label: 'クラス時間割', group: '授業・学習', description: 'クラス・曜日・時限ごとの科目と担当教員です。' },
  club_notes: { label: '部活・委員会のお知らせ', group: 'お知らせ・LINE', description: '部活・委員会が投稿したお知らせとLINE配信状況です。' },
  club_post_code_attempts: { label: '投稿コードの認証試行', group: 'システム・認証', description: '部活投稿コードの入力試行記録です。セキュリティ保護のため編集できません。' },
  club_post_codes: { label: '部活投稿コード', group: 'システム・認証', description: '部活投稿権限を付与する一時コードのハッシュ・期限です。コード自体は保存されません。' },
  club_post_permissions: { label: '部活投稿権限', group: 'お知らせ・LINE', description: 'ユーザーごとの部活投稿許可と表示名です。' },
  contribution_history: { label: '貢献ポイント履歴', group: '生徒・アカウント', description: 'ポイント増減の理由・増減値・処理後スコアを記録します。' },
  contribution_scores: { label: '貢献ポイント現在値', group: '生徒・アカウント', description: '生徒ごとの現在の貢献ポイントです。' },
  hiadmin_audit_logs: { label: 'HighAdmin操作監査ログ', group: 'システム・認証', description: '最高管理者が実行した操作の証跡です。改ざん防止のため編集できません。' },
  hiadmin_gate_attempts: { label: 'HighAdmin認証試行', group: 'システム・認証', description: '追加認証の失敗回数・一時ロック状態です。セキュリティ保護のため編集できません。' },
  jma_earthquake_notifications: { label: '地震通知履歴', group: '気象・防災', description: '地震に関するLINE通知内容・送信結果・再送情報です。' },
  jma_earthquake_reports: { label: '気象庁の地震情報取得履歴', group: '気象・防災', description: '気象庁から取得した地震情報の識別子・発表日時・取得日時です。' },
  jma_earthquake_sync_state: { label: '地震情報の同期状態', group: '気象・防災', description: '地震情報の同期時刻・処理ロック・エラー状態です。自動処理に使うため編集できません。' },
  jma_earthquakes: { label: '地震データ', group: '気象・防災', description: '地震の発生時刻・震源・規模・各地の震度・緊急地震速報情報です。' },
  jma_weather_alert_events: { label: '気象警報・注意報の取得履歴', group: '気象・防災', description: '気象庁の警報XML・対象地域・通知処理結果です。' },
  jma_weather_alerts: { label: '現在の気象警報・注意報', group: '気象・防災', description: '地域ごとの警報名・警戒度・発表状態です。' },
  jma_weather_sync_state: { label: '気象情報の同期状態', group: '気象・防災', description: '気象情報の最終同期時刻や処理ロックです。自動処理に使うため編集できません。' },
  library_books: { label: '図書館の蔵書', group: '学食・施設', description: '本のタイトル・著者・管理番号・貸出状態・表紙画像です。' },
  line_bot_rotation: { label: 'LINE公式アカウント切替設定', group: 'お知らせ・LINE', description: '現在使用中のBOT番号と次回切替日時です。' },
  line_bot_rotation_events: { label: 'LINE BOT切替履歴', group: 'お知らせ・LINE', description: 'LINE公式アカウントを切り替えた日時・前後のBOT番号です。' },
  line_broadcast_history: { label: 'LINE公式アカウント配信履歴', group: 'お知らせ・LINE', description: 'LINEへ配信したタイトル・本文・送信結果・送信日時です。' },
  line_delivery_events: { label: 'LINE配信イベント詳細', group: 'お知らせ・LINE', description: '公式アカウント・グループ等への配信先、Flex本文、HTTP応答、配信IDです。配信証跡のため編集できません。' },
  line_group_chats: { label: 'LINEグループ接続設定', group: 'お知らせ・LINE', description: '連携グループ・BOT割当・配信カテゴリごとの受信設定です。' },
  line_group_delivery_logs: { label: 'LINEグループ配信履歴', group: 'お知らせ・LINE', description: 'LINEグループごとの配信結果・HTTPステータス・エラーです。' },
  line_train_timetable_sends: { label: '電車時刻表の配信記録', group: '交通・時刻表', description: '時刻表の配信対象時間・送信状態・再送キー・エラーです。' },
  lost_and_found: { label: '落とし物・拾得物', group: '学食・施設', description: '拾得物の名前・場所・説明・拾得者・承認・返却状態です。' },
  nkn: { label: 'システム記録（NKN）', group: 'システム・認証', description: '古い機能との互換性のために残されている小規模なシステム記録です。' },
  notification_reads: { label: 'お知らせの既読状態', group: 'お知らせ・LINE', description: 'ユーザーがお知らせを読んだ日時を保存します。' },
  notifications: { label: '全校お知らせ', group: 'お知らせ・LINE', description: '生徒用サイトに表示するお知らせ本文・画像・LINE送信状態です。' },
  profiles: { label: '生徒プロフィール', group: '生徒・アカウント', description: '学籍番号・氏名・クラス・学校メール・アカウント連携情報です。個人情報を含みます。' },
  push_reminder_deliveries: { label: 'プッシュ通知の送信記録', group: '通知・端末', description: '課題リマインダーの送信対象・種類・送信日時です。' },
  push_reminder_preferences: { label: '通知の個人設定', group: '通知・端末', description: '通知ON/OFF、通知時刻、対象曜日、通知カテゴリ、サイレント時間です。' },
  push_subscriptions: { label: 'プッシュ通知の端末登録', group: '通知・端末', description: 'ブラウザー端末への通知配信先・認証キー情報です。端末の秘密情報保護のため編集できません。' },
  room_status: { label: '校内施設の室温・状態', group: '学食・施設', description: '部屋ごとの室名・混雑や温度の状態です。' },
  school_chat_messages: { label: '全校・学年チャット投稿', group: 'チャット・コミュニティ', description: '全校・学年チャットの投稿本文・投稿者・添付ファイル情報です。' },
  school_event_countdowns: { label: '学校イベント・カウントダウン', group: 'お知らせ・LINE', description: '行事名・概要・開催日・表示状態です。' },
  school_weekly_schedules: { label: '週間学校予定表', group: 'お知らせ・LINE', description: '週ごとの学校予定と曜日別スケジュールです。' },
  student_login_handoffs: { label: 'QRログイン引き継ぎ', group: 'システム・認証', description: 'QRログインの一時引き継ぎ状態・期限です。トークン情報を含むため編集できません。' },
  student_study_sessions: { label: '学習タイマー記録', group: 'ノート・学習記録', description: '学習時間・休憩時間・振り返り・次の行動を保存します。' },
  student_test_exams: { label: '定期テスト計画', group: 'ノート・学習記録', description: '年度・学期・テスト期間・ユーザーIDを保存します。' },
  student_test_ranges: { label: 'テスト範囲', group: 'ノート・学習記録', description: '教科ごとのテスト範囲・学習状況・並び順です。' },
  student_test_subjects: { label: 'テスト科目', group: 'ノート・学習記録', description: 'テスト期間ごとの教科名・試験日・並び順です。' },
  study_room_status: { label: '自習室の席数・利用状況', group: '学食・施設', description: '自習室の利用席数・総席数・更新日時です。' },
  takanodai_timetable: { label: '鷹の台駅の時刻表', group: '交通・時刻表', description: '方面・発車時刻・便種別・平日休日区分の時刻表です。' },
  teacher_access_codes: { label: '先生用アクセスコード', group: 'システム・認証', description: '先生用コードのハッシュ・利用期間・有効状態・利用回数です。コードはハッシュ化されており再表示できません。' },
  teacher_access_sessions: { label: '先生用ログインセッション', group: 'システム・認証', description: '先生用アクセスコードでログイン中のセッション期限・世代番号です。セッショントークンのハッシュを含むため編集できません。' },
  timetable: { label: '校内時間割データ', group: '授業・学習', description: '曜日・週区分・時限・科目・担当教員・教室です。' },
  todos: { label: '生徒の個人タスク', group: '生徒・アカウント', description: '生徒ごとの課題・提出期限・詳細・完了状態です。' },
};

const EXPLORER_READ_ONLY = new Set([
  'cafeteria_sold_out_reports', 'chat_audit_logs', 'club_post_code_attempts', 'club_post_codes',
  'contribution_history', 'hiadmin_audit_logs', 'hiadmin_gate_attempts',
  'jma_earthquake_notifications', 'jma_earthquake_reports', 'jma_earthquake_sync_state', 'jma_earthquakes',
  'jma_weather_alert_events', 'jma_weather_alerts', 'jma_weather_sync_state',
  'line_bot_rotation', 'line_bot_rotation_events', 'line_broadcast_history', 'line_delivery_events',
  'line_group_delivery_logs', 'line_train_timetable_sends', 'nkn', 'push_reminder_deliveries',
  'push_subscriptions', 'student_login_handoffs', 'teacher_access_codes', 'teacher_access_sessions',
]);
const EXPLORER_REDACTED_COLUMNS = new Set([
  'card_token', 'code_hash', 'secret_hash', 'login_token_hash', 'session_token_hash',
  'subscription', 'endpoint', 'lock_token', 'high_lock_token', 'long_lock_token', 'sync_lock_token',
]);
const EXPLORER_LABELS: Record<string, string> = {
  id: 'レコードID', student_id: '学籍番号', student_name: '生徒氏名', user_class: 'クラス',
  auth_user_id: '認証ユーザーID', email: '学校メール', title: 'タイトル', summary: '概要',
  description: '説明', details: '詳細', body: '本文', content: '本文', content_text: '本文（テキスト）',
  content_html: '本文（HTML）', created_at: '作成日時', updated_at: '更新日時', status: '状態',
  is_active: '有効', active: '有効', completed: '完了', due: '提出期限', due_at: '提出日時',
  event_date: '開催日', service_date: '対象日', week_start: '週の開始日', days: '曜日別予定',
  score: '現在ポイント', delta: 'ポイント増減', reason: '理由', score_after: '処理後ポイント',
  user_id: 'ユーザーID', chat_id: 'LINEグループID', chat_type: 'グループ種別', bot_slot: '使用BOT',
  line_delivery_status: 'LINE配信状態', line_delivery_error: 'LINE配信エラー', line_sent_at: 'LINE送信日時',
  message: 'メッセージ', message_text: '配信本文', message_payload: '配信データ（JSON）',
  is_closed: '休業日', note: '備考', name: '名称', author: '著者', code: '管理番号',
  room_name: '施設名', room_id: '施設ID', occupied_seats: '利用中の席数', total_seats: '総席数',
  starts_on: '利用開始日', ends_on: '利用終了日', use_count: '利用回数', last_used_at: '最終利用日時',
  rating: '評価', comment: 'コメント', finder: '拾得者', location: '場所', price: '価格',
  calorie: 'カロリー', allergy: 'アレルギー情報', is_sold_out: '売切状態',
  departure_time: '発車時刻', direction: '方面', service: '便種別', service_day: '運行日',
  subject: '科目', teacher: '担当教員', room: '教室', period: '時限', day_key: '曜日',
  group_name: 'クラス・グループ', attachment_name: '添付ファイル名', attachment_mime: '添付形式',
  created_by_label: '発行者', published_at: '公開日時', expires_at: '有効期限',
};
function explorerColumnLabel(name: string): string {
  return EXPLORER_LABELS[name] || name.replace(/_/g, ' ').replace(/\b\w/g, (v) => v.toUpperCase());
}
function explorerTableMeta(name: string, schema: ExplorerTable[]) {
  const table = schema.find((item) => item.name === name);
  if (!table) return null;
  const info = EXPLORER_TABLE_INFO[name] || { label: name, group: 'その他', description: 'Supabaseに保存されているデータです。' };
  return {
    ...table,
    label: info.label,
    group: info.group,
    description: info.description,
    can_write: !EXPLORER_READ_ONLY.has(name),
    columns: table.columns.map((column) => ({
      ...column,
      label: explorerColumnLabel(column.name),
      sensitive: EXPLORER_REDACTED_COLUMNS.has(column.name),
    })),
  };
}
async function getExplorerSchema(admin: SupabaseClient): Promise<ExplorerTable[]> {
  const { data, error } = await admin.rpc('hiadmin_database_explorer_schema');
  if (error || !Array.isArray(data)) throw new Error('データベース構造を取得できません。Supabaseのスキーマ関数を確認してください。');
  return data as ExplorerTable[];
}
function jsonSafeKey(value: unknown): boolean {
  return value !== undefined && value !== null && ['string', 'number', 'boolean'].includes(typeof value);
}
function maskExplorerRow(row: Record<string, unknown>, table: ExplorerTable) {
  const result = { ...row };
  for (const column of table.columns) if (EXPLORER_REDACTED_COLUMNS.has(column.name) && column.name in result) result[column.name] = '[保護された情報]';
  return result;
}
async function recordExplorerAudit(admin: SupabaseClient, user: User, action: string, table: string, key: Record<string, unknown>, changedFields: string[]) {
  const { error } = await admin.from('hiadmin_audit_logs').insert({
    actor_user_id: user.id,
    actor_email: user.email || '',
    action: 'database.' + action,
    details: { table, record_key: key, changed_fields: changedFields.slice(0, 80) },
  });
  if (error) console.error('HiAdmin explorer audit log failed:', error.message);
}

async function countRows(admin: SupabaseClient, table: string, column?: string, value?: string): Promise<number> {
  if (column && !value) return 0;
  let query = admin.from(table).select('*', { count: 'exact', head: true });
  if (column && value) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw new Error('登録データ件数の取得に失敗しました。');
  return count || 0;
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth instanceof NextResponse) return auth;
  const params = new URL(request.url).searchParams;
  const view = params.get('view') || 'overview';

  try {

    if (view === 'explorer-schema') {
      const schema = await getExplorerSchema(auth.admin);
      const tables = schema.map((table) => explorerTableMeta(table.name, schema)).filter(Boolean);
      return NextResponse.json({ tables }, { headers: { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization' } });
    }

    if (view === 'explorer-rows') {
      const tableName = params.get('table') || '';
      const schema = await getExplorerSchema(auth.admin);
      const table = schema.find((item) => item.name === tableName);
      const meta = explorerTableMeta(tableName, schema);
      if (!table || !meta) return fail('指定されたテーブルは存在しません。', 404);
      const page = Math.max(1, Math.min(10000, Number(params.get('page')) || 1));
      const size = 30;
      const queryText = (params.get('q') || '').trim().slice(0, 80).replace(/[%,_()\\]/g, ' ').trim();
      let query = auth.admin.from(tableName).select('*', { count: 'exact' });
      if (queryText) {
        const textColumns = table.columns.filter((column) => ['text', 'character varying', 'character'].includes(column.type) && !EXPLORER_REDACTED_COLUMNS.has(column.name)).map((column) => column.name);
        if (textColumns.length) query = query.or(textColumns.map((column) => column + '.ilike.%' + queryText + '%').join(','));
      }
      const orderColumn = table.primary_key[0] || table.columns[0]?.name;
      if (orderColumn) query = query.order(orderColumn, { ascending: false, nullsFirst: false });
      const start = (page - 1) * size;
      const { data, error, count } = await query.range(start, start + size - 1);
      if (error) throw new Error('レコードを読み込めませんでした: ' + error.message);
      const rows = (data || []).map((row) => maskExplorerRow(row as Record<string, unknown>, table));
      return NextResponse.json({
        table: meta,
        rows,
        count: count || 0,
        page,
        pageSize: size,
        hasMore: (count || 0) > start + rows.length,
      }, { headers: { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization' } });
    }

    if (view === 'explorer-audit') {
      const { data, error } = await auth.admin.from('hiadmin_audit_logs')
        .select('id,actor_email,action,details,created_at')
        .like('action', 'database.%')
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw new Error('データ変更履歴を取得できません。');
      return NextResponse.json({ logs: data || [] }, { headers: { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization' } });
    }

    if (view === 'overview') {
      const [profiles, todos, assignments, classMessages, schoolMessages, lostItems] = await Promise.all([
        countRows(auth.admin, 'profiles'), countRows(auth.admin, 'todos'), countRows(auth.admin, 'assignments'),
        countRows(auth.admin, 'class_chat_messages'), countRows(auth.admin, 'school_chat_messages'), countRows(auth.admin, 'lost_and_found'),
      ]);
      return NextResponse.json({ summary: { profiles, todos, assignments, classMessages, schoolMessages, lostItems } }, {
        headers: { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization' },
      });
    }

    if (view === 'users') {
      const page = Math.min(200, Math.max(1, Number(params.get('page')) || 1));
      const queryText = (params.get('q') || '').trim().slice(0, 80);
      const size = 50;
      let users: Array<{ id: string; email: string | null; created_at: string | null; last_sign_in_at: string | null; email_confirmed_at: string | null; profile: Record<string, unknown> | null }> = [];

      if (queryText) {
        const safe = queryText.replace(/[%,_()\\]/g, ' ').trim().replace(/\s+/g, ' ');
        if (!safe) return NextResponse.json({ users: [], hasMore: false });
        const start = (page - 1) * size;
        const { data: rows, error } = await auth.admin.from('profiles')
          .select('auth_user_id,student_id,student_name,user_class,setup_completed_at,email,created_at')
          .or('student_id.ilike.%' + safe + '%,student_name.ilike.%' + safe + '%,email.ilike.%' + safe + '%')
          .order('created_at', { ascending: false })
          .range(start, start + size);
        if (error) throw new Error('ユーザー検索に失敗しました。');
        const matching = (rows || []).filter((row) => row.auth_user_id);
        users = await Promise.all(matching.slice(0, size).map(async (row) => {
          const { data: result } = await auth.admin.auth.admin.getUserById(row.auth_user_id);
          return {
            id: row.auth_user_id as string,
            email: result.user?.email || row.email || null,
            created_at: result.user?.created_at || row.created_at || null,
            last_sign_in_at: result.user?.last_sign_in_at || null,
            email_confirmed_at: result.user?.email_confirmed_at || null,
            profile: { student_id: row.student_id, student_name: row.student_name, user_class: row.user_class, setup_completed_at: row.setup_completed_at },
          };
        }));
        return NextResponse.json({ users, hasMore: (rows || []).length > size }, {
          headers: { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization' },
        });
      }

      const { data, error } = await auth.admin.auth.admin.listUsers({ page, perPage: size });
      if (error) throw new Error('認証アカウント一覧を取得できません。');
      const accounts = data.users || [];
      const ids = accounts.map((item) => item.id);
      let profiles: Array<{ auth_user_id: string; student_id: string; student_name: string; user_class: string; setup_completed_at: string | null }> = [];
      if (ids.length) {
        const { data: rows, error: profileError } = await auth.admin.from('profiles')
          .select('auth_user_id,student_id,student_name,user_class,setup_completed_at').in('auth_user_id', ids);
        if (profileError) throw new Error('プロフィール一覧を取得できません。');
        profiles = rows || [];
      }
      const byId = new Map(profiles.map((item) => [item.auth_user_id, item]));
      users = accounts.map((item) => {
        const profile = byId.get(item.id);
        return {
          id: item.id,
          email: item.email || null,
          created_at: item.created_at || null,
          last_sign_in_at: item.last_sign_in_at || null,
          email_confirmed_at: item.email_confirmed_at || null,
          profile: profile ? { student_id: profile.student_id, student_name: profile.student_name, user_class: profile.user_class, setup_completed_at: profile.setup_completed_at } : null,
        };
      });
      return NextResponse.json({ users, hasMore: accounts.length === size }, {
        headers: { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization' },
      });
    }

    if (view === 'user') {
      const userId = params.get('userId') || '';
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return fail('ユーザーIDが正しくありません。', 400);
      const [{ data: account, error: accountError }, { data: profile, error: profileError }] = await Promise.all([
        auth.admin.auth.admin.getUserById(userId),
        auth.admin.from('profiles').select('student_id,student_name,user_class,setup_completed_at,created_at').eq('auth_user_id', userId).maybeSingle(),
      ]);
      if (accountError || !account.user) return fail('ユーザーアカウントが見つかりません。', 404);
      if (profileError) throw new Error('プロフィールを取得できません。');
      const studentId = profile?.student_id || '';
      const [todos, assignmentCompletions, contributionHistory, classMessages, schoolMessages, lostItems] = await Promise.all([
        countRows(auth.admin, 'todos', 'student_id', studentId),
        countRows(auth.admin, 'assignment_completions', 'student_id', studentId),
        countRows(auth.admin, 'contribution_history', 'student_id', studentId),
        countRows(auth.admin, 'class_chat_messages', 'user_id', userId),
        countRows(auth.admin, 'school_chat_messages', 'user_id', userId),
        countRows(auth.admin, 'lost_and_found', 'student_id', studentId),
      ]);
      const audit = await auth.admin.from('hiadmin_audit_logs').insert({
        actor_user_id: auth.user.id, actor_email: auth.user.email || '', action: 'user.profile_summary_viewed',
        target_user_id: userId, details: { viewed: ['profile', 'account_status', 'usage_counts'] },
      });
      if (audit.error) throw new Error('監査ログを記録できなかったため、詳細表示を中止しました。');
      return NextResponse.json({
        detail: {
          user: { id: account.user.id, email: account.user.email || null, created_at: account.user.created_at || null, last_sign_in_at: account.user.last_sign_in_at || null, email_confirmed_at: account.user.email_confirmed_at || null },
          profile: profile || null,
          counts: { todos, assignmentCompletions, contributionHistory, classMessages, schoolMessages, lostItems },
        },
      }, { headers: { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization' } });
    }

    if (view === 'audit') {
      const { data, error } = await auth.admin.from('hiadmin_audit_logs').select('id,actor_email,action,target_user_id,created_at').order('created_at', { ascending: false }).limit(100);
      if (error) throw new Error('監査ログを取得できません。');
      return NextResponse.json({ logs: data || [] }, { headers: { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization' } });
    }
    return fail('指定された表示形式は利用できません。', 400);
  } catch (error) {
    console.error('HiAdmin request failed:', error instanceof Error ? error.message : 'unknown error');
    return fail(error instanceof Error ? error.message : '最高管理者データを取得できませんでした。', 500);
  }
}


async function explorerRequestContext(request: Request) {
  const auth = await authorize(request);
  if (auth instanceof NextResponse) return { response: auth } as const;
  return { auth } as const;
}

async function validateExplorerMutation(admin: SupabaseClient, tableName: string, values: unknown, key: unknown) {
  const schema = await getExplorerSchema(admin);
  const table = schema.find((item) => item.name === tableName);
  const meta = explorerTableMeta(tableName, schema);
  if (!table || !meta) return { error: '指定されたテーブルは存在しません。', status: 404 } as const;
  if (!meta.can_write) return { error: 'このテーブルは監査・認証・自動処理の保護対象のため、エクスプローラーから変更できません。', status: 403 } as const;
  if (!values || typeof values !== 'object' || Array.isArray(values)) return { error: '保存するデータの形式が正しくありません。', status: 400 } as const;
  const input = values as Record<string, unknown>;
  const allowed = new Set(table.columns.filter((column) => !EXPLORER_REDACTED_COLUMNS.has(column.name)).map((column) => column.name));
  const filtered: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(input)) {
    if (!allowed.has(name)) return { error: '存在しない列、または保護対象の列が含まれています: ' + name, status: 400 } as const;
    if (name.includes('.') || name.includes(',')) return { error: '列名が正しくありません。', status: 400 } as const;
    if (value === undefined) continue;
    filtered[name] = value;
  }
  if (!Object.keys(filtered).length) return { error: '変更する項目を入力してください。', status: 400 } as const;
  if (key !== undefined && (typeof key !== 'object' || key === null || Array.isArray(key))) return { error: 'レコード識別キーが正しくありません。', status: 400 } as const;
  const keyObject = (key && typeof key === 'object' ? key : {}) as Record<string, unknown>;
  if (key !== undefined) {
    for (const column of table.primary_key) {
      if (!jsonSafeKey(keyObject[column])) return { error: '主キーが不足しています: ' + column, status: 400 } as const;
    }
    if (Object.keys(keyObject).some((name) => !table.primary_key.includes(name))) return { error: '主キーに不要な列が含まれています。', status: 400 } as const;
  }
  return { table, meta, values: filtered, key: keyObject } as const;
}

export async function POST(request: Request) {
  const context = await explorerRequestContext(request);
  if ('response' in context) return context.response;
  const { auth } = context;
  try {
    const body = await request.json().catch(() => null) as { table?: unknown; values?: unknown } | null;
    if (!body || typeof body.table !== 'string') return fail('保存リクエストが正しくありません。', 400);
    const valid = await validateExplorerMutation(auth.admin, body.table, body.values, undefined);
    if ('error' in valid) return fail(valid.error || '入力値が正しくありません。', valid.status || 400);
    const { data, error } = await auth.admin.from(body.table).insert(valid.values).select('*').single();
    if (error) return fail('レコードを追加できませんでした: ' + error.message, 400);
    const tableSchema = valid.table;
    const key = Object.fromEntries(tableSchema.primary_key.map((name) => [name, (data as Record<string, unknown>)[name]]));
    await recordExplorerAudit(auth.admin, auth.user, 'insert', body.table, key, Object.keys(valid.values));
    return NextResponse.json({ success: true, row: maskExplorerRow(data as Record<string, unknown>, tableSchema) }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    console.error('HiAdmin explorer insert failed:', error instanceof Error ? error.message : 'unknown error');
    return fail(error instanceof Error ? error.message : 'レコードを追加できませんでした。', 500);
  }
}

export async function PATCH(request: Request) {
  const context = await explorerRequestContext(request);
  if ('response' in context) return context.response;
  const { auth } = context;
  try {
    const body = await request.json().catch(() => null) as { table?: unknown; values?: unknown; key?: unknown } | null;
    if (!body || typeof body.table !== 'string') return fail('更新リクエストが正しくありません。', 400);
    const valid = await validateExplorerMutation(auth.admin, body.table, body.values, body.key);
    if ('error' in valid) return fail(valid.error || '入力値が正しくありません。', valid.status || 400);
    const changes = Object.fromEntries(Object.entries(valid.values).filter(([name]) => !valid.table.primary_key.includes(name)));
    if (!Object.keys(changes).length) return fail('主キー以外に変更する項目を入力してください。', 400);
    let query = auth.admin.from(body.table).update(changes);
    for (const [name, value] of Object.entries(valid.key)) query = query.eq(name, value as string);
    const { data, error } = await query.select('*').maybeSingle();
    if (error) return fail('レコードを更新できませんでした: ' + error.message, 400);
    if (!data) return fail('対象レコードが見つかりません。変更されていない可能性があります。', 404);
    await recordExplorerAudit(auth.admin, auth.user, 'update', body.table, valid.key, Object.keys(changes));
    return NextResponse.json({ success: true, row: maskExplorerRow(data as Record<string, unknown>, valid.table) }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    console.error('HiAdmin explorer update failed:', error instanceof Error ? error.message : 'unknown error');
    return fail(error instanceof Error ? error.message : 'レコードを更新できませんでした。', 500);
  }
}

export async function DELETE(request: Request) {
  const context = await explorerRequestContext(request);
  if ('response' in context) return context.response;
  const { auth } = context;
  try {
    const body = await request.json().catch(() => null) as { table?: unknown; key?: unknown } | null;
    if (!body || typeof body.table !== 'string') return fail('削除リクエストが正しくありません。', 400);
    const schema = await getExplorerSchema(auth.admin);
    const table = schema.find((item) => item.name === body.table);
    const meta = explorerTableMeta(body.table, schema);
    if (!table || !meta) return fail('指定されたテーブルは存在しません。', 404);
    if (!meta.can_write) return fail('このテーブルは保護対象のため削除できません。', 403);
    if (!body.key || typeof body.key !== 'object' || Array.isArray(body.key)) return fail('レコード識別キーが正しくありません。', 400);
    const key = body.key as Record<string, unknown>;
    if (table.primary_key.some((column) => !jsonSafeKey(key[column])) || Object.keys(key).some((name) => !table.primary_key.includes(name))) return fail('主キーが正しくありません。', 400);
    let query = auth.admin.from(body.table).delete();
    for (const [name, value] of Object.entries(key)) query = query.eq(name, value as string);
    const { data, error } = await query.select('*').maybeSingle();
    if (error) return fail('レコードを削除できませんでした: ' + error.message, 400);
    if (!data) return fail('対象レコードが見つかりません。', 404);
    await recordExplorerAudit(auth.admin, auth.user, 'delete', body.table, key, []);
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    console.error('HiAdmin explorer delete failed:', error instanceof Error ? error.message : 'unknown error');
    return fail(error instanceof Error ? error.message : 'レコードを削除できませんでした。', 500);
  }
}
