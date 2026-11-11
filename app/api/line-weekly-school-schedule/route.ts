import { recordLineDeliveryResponse } from '@/lib/line-delivery-audit';
import { applyCampusSyncFlexFooters } from '@/lib/line-flex-footer';
import { getActiveLineBot } from '@/lib/line-bot-rotation';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { buildWeeklySchoolScheduleFlexMessage } from '@/lib/line-flex';
import { CLASS_TIMETABLE_DATA, mapClassTimetableRows, type ClassTimetableData, type ClassTimetableRow } from '@/lib/class-timetable';
import { pushLineMessagesToRegisteredChats, summarizeLineGroupDelivery } from '@/lib/line-group-chats';
import { fetchSchoolWeatherForecast } from '@/lib/weather';
import { buildWeatherForecastBubble } from '@/lib/line-weather-flex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function addDays(dateKey: string, amount: number): string {
  const parts = dateKey.split('-').map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + amount)).toISOString().slice(0, 10);
}
function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function isMonday(dateKey: string): boolean { return new Date(dateKey + 'T00:00:00Z').getUTCDay() === 1; }
function getNextSchoolWeekStart(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const today = String(values.year) + '-' + String(values.month) + '-' + String(values.day);
  const weekday = new Date(today + 'T00:00:00Z').getUTCDay();
  return addDays(today, (8 - weekday) % 7 || 7);
}
function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
function retryKeyForWeek(weekStart: string): string {
  const chars = createHash('sha256').update('campussync-weekly-school-schedule:' + weekStart).digest('hex').slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ((parseInt(chars[16], 16) & 3) | 8).toString(16);
  const value = chars.join('');
  return value.slice(0, 8) + '-' + value.slice(8, 12) + '-' + value.slice(12, 16) + '-' + value.slice(16, 20) + '-' + value.slice(20);
}


function buildMondayClassBubble(group: '7組' | '8組', dateLabel: string, timetable: ClassTimetableData) {
  const accent=group==='7組'?'#5C9291':'#0891B2';
  const rows:Record<string,unknown>[]=timetable[group].Mon.map(slot=>({
    type:'box',layout:'horizontal',alignItems:'center',spacing:'sm',paddingAll:'9px',cornerRadius:'9px',backgroundColor:'#F8FAFC',
    contents:[
      {type:'box',layout:'vertical',width:'42px',paddingAll:'6px',cornerRadius:'6px',backgroundColor:accent,justifyContent:'center',
        contents:[{type:'text',text:slot.period+'限',size:'xs',color:'#FFFFFF',weight:'bold',align:'center'}]},
      {type:'box',layout:'vertical',flex:1,spacing:'xs',contents:[
        {type:'text',text:slot.subject,size:'sm',color:'#1E293B',weight:'bold',wrap:true},
        {type:'text',text:slot.teacher,size:'xs',color:'#64748B',wrap:true},
      ]},
    ],
  }));
  return {
    type:'bubble',size:'mega',
    header:{type:'box',layout:'vertical',backgroundColor:'#0F172A',paddingAll:'18px',spacing:'sm',contents:[
      {type:'text',text:'CAMPUSSYNC / CLASS TIMETABLE',size:'xs',color:'#67E8F9',weight:'bold'},
      {type:'text',text:group+'の月曜日の時間割',size:'xl',color:'#FFFFFF',weight:'bold',wrap:true},
      {type:'text',text:dateLabel+' ・ 月曜日',size:'xs',color:'#CBD5E1',wrap:true},
    ]},
    body:{type:'box',layout:'vertical',paddingAll:'14px',spacing:'sm',contents:rows.length?rows:[
      {type:'text',text:'時間割が登録されていません。',size:'sm',color:'#64748B',wrap:true},
    ]},
    footer:{type:'box',layout:'vertical',paddingAll:'10px',backgroundColor:'#F1F5F9',contents:[
      {type:'text',text:'CAMPUSSYNC・SOKA HIGH SCHOOL',size:'xs',color:'#64748B',align:'center'},
    ]},
  };
}

type WeeklyEventRow = { id: string; title: string; summary?: string | null; event_date: string };
type WeeklyAssignmentRow = { id: string; title: string; details?: string | null; subject?: string | null; subject_option?: string | null; target_class?: string | null; due_at?: string | null; priority?: string | null };
type WeeklyChangeRow = { id: string; entity_type: string; entity_id: string; action: string; title: string; subject: string | null; priority: string; summary: string; previous_value: Record<string, unknown> | null; next_value: Record<string, unknown> | null; reason: string | null; created_at: string; digest_sent_at: string | null };

function getTokyoTodayKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return String(values.year) + '-' + String(values.month) + '-' + String(values.day);
}

function daysUntil(today: string, target: string): number {
  const a = today.split('-').map(Number);
  const b = target.split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}

function buildWeeklyInfoBubble(input: {
  eyebrow: string;
  title: string;
  subtitle: string;
  contents: Record<string, unknown>[];
}) {
  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: '#0F172A', paddingAll: '18px', spacing: 'sm',
      contents: [
        { type: 'text', text: input.eyebrow, size: 'xs', color: '#67E8F9', weight: 'bold' },
        { type: 'text', text: input.title, size: 'xl', color: '#FFFFFF', weight: 'bold', wrap: true },
        { type: 'text', text: input.subtitle, size: 'xs', color: '#CBD5E1', wrap: true },
      ],
    },
    body: { type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'sm', contents: input.contents },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '11px', backgroundColor: '#F8FAFC',
      contents: [{ type: 'text', text: 'CAMPUSSYNC・SOKA HIGH SCHOOL', size: 'xs', color: '#64748B', align: 'center' }],
    },
  };
}

function buildWeeklyAssignmentsBubble(today: string, assignments: WeeklyAssignmentRow[], changes: WeeklyChangeRow[], failed: boolean) {
  const contents: Record<string, unknown>[] = [];
  const priorityLabel = (priority?: string | null) => priority === 'urgent' ? '緊急' : priority === 'important' ? '重要' : '';
  const addAssignment = (item: WeeklyAssignmentRow, overdue: boolean) => {
    const option = item.subject_option ? '・' + item.subject_option + '向け' : '';
    const target = item.target_class === 'science' ? '理系クラス' + option : '全クラス';
    let due = '期限未設定';
    if (item.due_at) {
      const date = new Date(item.due_at);
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
      const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
      const dueKey = String(values.year) + '-' + String(values.month) + '-' + String(values.day);
      const days = daysUntil(today, dueKey);
      const dateLabel = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
      due = dateLabel + ' ・ ' + (overdue ? (days < 0 ? Math.abs(days) + '日超過' : '本日期限超過') : days === 0 ? '今日が期限' : 'あと' + days + '日');
    }
    contents.push({
      type: 'box', layout: 'vertical', backgroundColor: overdue ? '#FFF7F7' : '#F8FAFC', cornerRadius: '10px', paddingAll: '11px', spacing: 'xs',
      contents: [
        { type: 'box', layout: 'horizontal', spacing: 'sm', alignItems: 'center', contents: [
          { type: 'text', text: item.subject || 'その他', size: 'xxs', color: '#0E7490', weight: 'bold', flex: 0 },
          { type: 'text', text: target, size: 'xxs', color: '#64748B', wrap: true, flex: 1 },
          ...(priorityLabel(item.priority) ? [{ type: 'text', text: priorityLabel(item.priority), size: 'xxs', color: item.priority==='urgent'?'#B91C1C':'#B45309', weight: 'bold' }] : []),
        ] },
        { type: 'text', text: item.title, size: 'sm', color: '#0F172A', weight: 'bold', wrap: true },
        ...(item.details ? [{ type: 'text', text: item.details.replace(/\s+/g, ' ').slice(0, 110), size: 'xs', color: '#475569', wrap: true }] : []),
        { type: 'text', text: due, size: 'xs', color: overdue ? '#B91C1C' : '#1D4ED8', weight: 'bold', wrap: true },
      ],
    });
  };

  if (failed) {
    contents.push({ type: 'text', text: '課題一覧を取得できませんでした。CampusSyncで最新情報を確認してください。', size: 'sm', color: '#B91C1C', wrap: true });
  } else {
    const current = assignments.filter(item => !item.due_at || new Date(item.due_at).getTime() >= Date.now());
    const overdue = assignments.filter(item => Boolean(item.due_at) && new Date(item.due_at as string).getTime() < Date.now());
    contents.push({ type: 'text', text: '提出期限内・期限未設定', size: 'sm', color: '#0F766E', weight: 'bold', wrap: true });
    if (current.length) current.slice(0, 8).forEach(item => addAssignment(item, false));
    else contents.push({ type: 'text', text: '期限内に提出できる公開課題はありません。', size: 'xs', color: '#64748B', wrap: true });
    if (overdue.length) {
      contents.push({ type: 'separator', color: '#FECACA', margin: 'lg' });
      contents.push({ type: 'text', text: '期限超過・確認用', size: 'sm', color: '#B91C1C', weight: 'bold', wrap: true });
      overdue.slice(0, 8).forEach(item => addAssignment(item, true));
    }
  }

  if (changes.length) {
    contents.push({ type: 'separator', color: '#CBD5E1', margin: 'lg' });
    contents.push({ type: 'text', text: '日程変更・新規公開', size: 'sm', color: '#1D4ED8', weight: 'bold', wrap: true });
    for (const change of changes.slice(0, 8)) {
      const typeLabel = change.entity_type === 'assignment' ? '課題' : change.entity_type === 'exam' ? '定期考査' : '小テスト';
      const actionLabel = change.action === 'created' ? '新規登録' : change.action === 'published' ? '公開' : change.action === 'cancelled' ? '中止・非公開' : '変更';
      contents.push({
        type: 'box', layout: 'vertical', backgroundColor: '#EFF6FF', cornerRadius: '10px', paddingAll: '10px', spacing: 'xs',
        contents: [
          { type: 'text', text: typeLabel + '・' + actionLabel + '：' + change.title + (change.subject ? ' ・ ' + change.subject : ''), size: 'xs', color: change.priority === 'urgent' ? '#B91C1C' : '#1E40AF', weight: 'bold', wrap: true },
          { type: 'text', text: change.summary, size: 'xs', color: '#334155', wrap: true },
          ...(change.reason ? [{ type: 'text', text: '理由：' + change.reason, size: 'xxs', color: '#64748B', wrap: true }] : []),
        ],
      });
    }
  }
  return buildWeeklyInfoBubble({
    eyebrow: 'CAMPUSSYNC  /  ASSIGNMENTS & CHANGES',
    title: '課題・予定変更',
    subtitle: 'UPCOMING  •  OVERDUE  •  SCHEDULE CHANGES',
    contents,
  });
}

function buildCountdownBubble(today: string, events: WeeklyEventRow[], failed: boolean) {
  const contents: Record<string, unknown>[] = [];
  if (failed) {
    contents.push({ type: 'text', text: 'カウントダウン情報を取得できませんでした。', size: 'sm', color: '#B91C1C', wrap: true });
  } else if (!events.length) {
    contents.push({ type: 'text', text: '現在登録されている今後のカウントダウンはありません。', size: 'sm', color: '#64748B', wrap: true });
  } else {
    for (const event of events.slice(0, 6)) {
      const remaining = daysUntil(today, event.event_date);
      const label = remaining === 0 ? '本日' : remaining === 1 ? 'あと1日' : 'あと' + remaining + '日';
      const dateLabel = event.event_date.slice(5).replace('-', '/');
      contents.push({
        type: 'box', layout: 'horizontal', alignItems: 'center', spacing: 'md', paddingAll: '10px',
        backgroundColor: '#F8FAFC', cornerRadius: '10px',
        contents: [
          { type: 'box', layout: 'vertical', width: '66px', paddingAll: '8px', backgroundColor: '#163A40', cornerRadius: '9px', justifyContent: 'center', alignItems: 'center', spacing: 'xs',
            contents: [
              { type: 'text', text: dateLabel, size: 'md', color: '#FFFFFF', weight: 'bold', align: 'center' },
              { type: 'text', text: label, size: 'xxs', color: '#A7D3CD', weight: 'bold', align: 'center', wrap: true },
            ],
          },
          { type: 'box', layout: 'vertical', flex: 1, spacing: 'xs', contents: [
            { type: 'text', text: event.title, size: 'sm', color: '#0F172A', weight: 'bold', wrap: true },
            ...(event.summary ? [{ type: 'text', text: event.summary.slice(0, 120), size: 'xs', color: '#64748B', wrap: true }] : []),
          ] },
        ],
      });
    }
  }
  return buildWeeklyInfoBubble({
    eyebrow: 'CAMPUSSYNC  /  COUNTDOWN',
    title: '学校イベント・カウントダウン',
    subtitle: 'COMING UP  •  開催日までの日数',
    contents,
  });
}

function buildFallbackWeekDays(weekStart: string, events: WeeklyEventRow[]) {
  const dayLabels = ['月', '火', '水', '木', '金', '土', '日'];
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const items = events.filter(event => event.event_date === date).map(event => ({
      id: event.id,
      title: event.title,
      details: event.summary || '',
    }));
    if (index === 0) items.unshift({
      id: 'weekly-schedule-not-registered',
      title: '詳細な週間予定表は未登録です',
      details: 'このカードには、登録済みの学校行事・カウントダウン情報を掲載しています。',
    });
    return { date, dayLabel: dayLabels[index], isHoliday: false, items };
  });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { mode?: unknown; weekStart?: unknown };
  const manualRequest = payload.mode === 'manual';
  const repairAndSendGroups = payload.mode === 'group_repair_and_send';
  if (manualRequest) {
    const expectedPassword = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
    const receivedPassword = request.headers.get('x-admin-password') || '';
    if (!expectedPassword || !receivedPassword || !constantTimeEqual(expectedPassword, receivedPassword)) {
      return jsonError('学校予定表の手動配信には正しいAdmin用パスワードが必要です。', 401);
    }
  } else {
    const expectedSecret = process.env.CRON_SECRET || '';
    const authorization = request.headers.get('authorization') || '';
    const receivedSecret = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!expectedSecret || !receivedSecret || !constantTimeEqual(expectedSecret, receivedSecret)) {
      return jsonError('学校予定表の定期配信認証に失敗しました。', 401);
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const activeLineBot = await getActiveLineBot();
  const accessToken = activeLineBot?.accessToken || null;
  if (!supabaseUrl || !serviceKey || !activeLineBot || !accessToken) {
    return jsonError('Supabaseの設定と現在使用中のLINE BOTのアクセストークンを確認してください。', 503);
  }
  const supabase = getAdminSupabase();
  if (!supabase) return jsonError('Supabaseのサーバー設定が不足しています。', 503);

  const weekStart = manualRequest || repairAndSendGroups ? String(payload.weekStart || '') : getNextSchoolWeekStart();
  if (!isDateKey(weekStart) || !isMonday(weekStart)) return jsonError('送信週は月曜日の日付で指定してください。', 400);

  const today = getTokyoTodayKey();
  const weekEnd = addDays(weekStart, 6);
  const [scheduleResult, weeklyEventsResult, countdownResult, assignmentResult, timetableResult, forecast, changeResult] = await Promise.all([
    supabase.from('school_weekly_schedules')
      .select('week_start,title,days').eq('week_start', weekStart).maybeSingle(),
    supabase.from('school_event_countdowns')
      .select('id,title,summary,event_date').eq('is_active', true)
      .gte('event_date', weekStart).lte('event_date', weekEnd)
      .order('event_date', { ascending: true }).limit(30),
    supabase.from('school_event_countdowns')
      .select('id,title,summary,event_date').eq('is_active', true)
      .gte('event_date', today).order('event_date', { ascending: true }).limit(6),
    supabase.from('assignments')
      .select('id,title,details,subject,subject_option,target_class,due_at,priority')
      .eq('is_active', true).order('due_at', { ascending: true, nullsFirst: false }).limit(40),
    supabase.from('class_timetable_slots')
      .select('group_name,day_key,period,subject,teacher')
      .order('group_name', { ascending: true }).order('period', { ascending: true }),
    fetchSchoolWeatherForecast(4).catch(error => {
      console.error('週間学校予定表：天気予報の取得に失敗:', error instanceof Error ? error.message : 'unknown');
      return [];
    }),
    supabase.from('campussync_schedule_change_events')
      .select('id,entity_type,entity_id,action,title,subject,priority,summary,previous_value,next_value,reason,created_at,digest_sent_at')
      .is('digest_sent_at', null)
      .order('created_at', { ascending: true })
      .limit(8),
  ]);
  if (scheduleResult.error) console.error('週間予定表の取得に失敗（行事情報で代替）:', scheduleResult.error.message);
  if (weeklyEventsResult.error) console.error('週間予定表：学校行事の取得に失敗:', weeklyEventsResult.error.message);
  if (countdownResult.error) console.error('週間予定表：カウントダウン取得に失敗:', countdownResult.error.message);
  if (assignmentResult.error) console.error('週間予定表：課題取得に失敗:', assignmentResult.error.message);
  if (changeResult.error) console.error('週間予定表：日程変更取得に失敗:', changeResult.error.message);
  if (timetableResult.error) console.error('週間予定表：月曜日の時間割取得エラー（初期データへフォールバック）', timetableResult.error.message);

  const schedule = scheduleResult.data;
  if (!schedule && (manualRequest || repairAndSendGroups)) {
    return jsonError('選択した週の予定表がまだ保存されていません。先に予定表を保存してください。', 404);
  }
  const weeklyEvents = (weeklyEventsResult.data || []) as WeeklyEventRow[];
  const savedDays = Array.isArray(schedule?.days) ? schedule.days as Array<any> : [];
  const hasSavedSchedule = Boolean(schedule && savedDays.length > 0);
  // 次週の週間予定表が未登録でも、登録済みの学校行事を日付別にまとめて配信を継続する。
  const days = hasSavedSchedule ? savedDays : buildFallbackWeekDays(weekStart, weeklyEvents);
  if (manualRequest && !days.some(day => day?.isHoliday || String(day?.holidayName || '').trim() || (Array.isArray(day?.items) && day.items.some((item: any) => String(item?.title || item?.details || item?.time || item?.location || '').trim())))) {
    return jsonError('予定または祝日設定がないため、配信できません。', 400);
  }

  const timetableRows = timetableResult.data || [];
  const timetable: ClassTimetableData = timetableRows.length ? mapClassTimetableRows(timetableRows as ClassTimetableRow[]) : CLASS_TIMETABLE_DATA;
  const weatherTargetDates = [weekStart, addDays(weekStart, 1), addDays(weekStart, 2)];
  const weeklyWeather = (forecast || [])
    .filter(day => weatherTargetDates.includes(day.date))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  const countdownEvents = (countdownResult.data || []) as WeeklyEventRow[];
  const assignments = (assignmentResult.data || []) as WeeklyAssignmentRow[];
  const changeEvents = (changeResult.data || []) as WeeklyChangeRow[];
  const mondayLabel = weekStart.slice(5).replace('-', '/') + '（月）';
  const scheduleTitle = hasSavedSchedule ? String(schedule?.title || '学校予定表') : '今後1週間の予定（登録済み情報）';
  const baseFlex = buildWeeklySchoolScheduleFlexMessage({ title: scheduleTitle, weekStart, days });
  const weeklyScheduleBubble = baseFlex.contents as Record<string, unknown>;
  const assignmentBubble = buildWeeklyAssignmentsBubble(today, assignments, changeEvents, Boolean(assignmentResult.error));
  const countdownBubble = buildCountdownBubble(today, countdownEvents, Boolean(countdownResult.error));
  const flex = {
    ...baseFlex,
    altText: (baseFlex.altText + '｜月曜日の7組・8組時間割・課題・期限超過・日程変更・天気予報・カウントダウン').slice(0, 400),
    contents: {
      type: 'carousel',
      contents: [
        buildMondayClassBubble('7組', mondayLabel, timetable),
        buildMondayClassBubble('8組', mondayLabel, timetable),
        assignmentBubble,
        buildWeatherForecastBubble(weeklyWeather),
        countdownBubble,
        weeklyScheduleBubble,
      ],
    },
  };
  const retryKey = manualRequest ? randomUUID() : retryKeyForWeek(weekStart);
  if (repairAndSendGroups) {
    const { data: registeredChats, error: chatsError } = await supabase
      .from('line_group_chats')
      .select('chat_id,chat_type,active,bot_slot,receive_school_schedule')
      .eq('active', true);
    if (chatsError) {
      console.error('LINEグループ診断：登録先を取得できません:', chatsError.message);
      return jsonError('登録済みLINEグループを取得できません。', 500);
    }

    const candidates = (registeredChats || []).filter(chat => chat.chat_type === 'group');
    if (candidates.length === 0) {
      return NextResponse.json({
        success: false,
        activeBotSlot: activeLineBot.slot,
        checkedGroups: [],
        message: '有効なグループIDが登録されていません。現在のBOTをグループへ招待し、グループ内で発言してWebhook登録してください。',
      }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }

    const botInfoResponse = await fetch('https://api.line.me/v2/bot/info', {
      headers: { Authorization: 'Bearer ' + accessToken },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    const botInfo = botInfoResponse?.ok
      ? await botInfoResponse.json().catch(() => null) as { displayName?: string; basicId?: string } | null
      : null;

    // LINEの公式グループ概要APIで、現在のアクセストークンのBOTが
    // そのIDのグループに本当に参加しているかを検証する。
    const checkedGroups = await Promise.all(candidates.map(async chat => {
      const response = await fetch(
        'https://api.line.me/v2/bot/group/' + encodeURIComponent(chat.chat_id) + '/summary',
        {
          headers: { Authorization: 'Bearer ' + accessToken },
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
        },
      ).catch(() => null);
      const summary = response?.ok
        ? await response.json().catch(() => null) as { groupId?: string; groupName?: string } | null
        : null;
      return {
        chatId: chat.chat_id,
        httpStatus: response?.status || 0,
        verified: Boolean(response?.ok && summary?.groupId === chat.chat_id),
        groupName: summary?.groupName || null,
        error: response && !response.ok
          ? (await response.text().catch(() => '')).slice(0, 300)
          : null,
      };
    }));

    const verifiedGroups = checkedGroups.filter(group => group.verified);
    if (verifiedGroups.length === 0) {
      return NextResponse.json({
        success: false,
        activeBotSlot: activeLineBot.slot,
        botName: botInfo?.displayName || null,
        botBasicId: botInfo?.basicId || null,
        checkedGroups,
        message: '登録済みグループIDを現在のBOTのアクセストークンで照合しましたが、参加中のグループは見つかりませんでした。グループIDが古いか、現在のBOTがそのグループに参加していない可能性があります。',
      }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }

    // 現在のBOTで参加を確認できたグループだけ、週間学校予定表の受信を有効化する。
    for (const group of verifiedGroups) {
      const { error: updateError } = await supabase.from('line_group_chats').update({
        bot_slot: activeLineBot.slot >= 1 && activeLineBot.slot <= 5 ? activeLineBot.slot : null,
        receive_school_schedule: true,
      }).eq('chat_id', group.chatId).eq('active', true);
      if (updateError) {
        console.error('LINEグループのBOT情報・配信設定を更新できません:', updateError.message);
        return jsonError('参加確認済みグループの配信設定を更新できません。', 500);
      }
    }

    const deliveryBatchId = randomUUID();
    const deliveries = await Promise.all(verifiedGroups.map(async group => {
      try {
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/json',
            'X-Line-Retry-Key': randomUUID(),
          },
          body: JSON.stringify({ to: group.chatId, messages: applyCampusSyncFlexFooters([flex]) }),
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        });
        await recordLineDeliveryResponse(response, { channel: 'push', destinationType: 'group', destinationId: group.chatId, kind: 'school_schedule', accessToken, deliveryBatchId, messages: [flex] });
        const responseBody = response.ok ? '' : (await response.text().catch(() => '')).slice(0, 500);
        return {
          chatId: group.chatId,
          groupName: group.groupName,
          success: response.ok || response.status === 409,
          status: response.status,
          errorMessage: responseBody || null,
        };
      } catch (error) {
        return {
          chatId: group.chatId,
          groupName: group.groupName,
          success: false,
          status: 0,
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : '通信エラー',
        };
      }
    }));

    const { error: deliveryLogError } = await supabase.from('line_group_delivery_logs').insert(
      deliveries.map(delivery => ({
        delivery_batch_id: deliveryBatchId,
        kind: 'school_schedule',
        chat_id: delivery.chatId,
        chat_type: 'group',
        bot_slot: activeLineBot.slot >= 1 && activeLineBot.slot <= 5 ? activeLineBot.slot : null,
        status: delivery.success ? 'success' : 'failure',
        http_status: delivery.status,
        error_message: delivery.errorMessage,
        sent_at: new Date().toISOString(),
      })),
    );
    if (deliveryLogError) console.error('LINEグループ配信結果を記録できません:', deliveryLogError.message);

    const sent = deliveries.filter(delivery => delivery.success).length;
    const failed = deliveries.length - sent;
    return NextResponse.json({
      success: failed === 0 && sent > 0,
      mode: 'group_repair_and_send',
      weekStart,
      bot: { slot: activeLineBot.slot, displayName: botInfo?.displayName || null, basicId: botInfo?.basicId || null },
      checkedGroups,
      deliveries,
      deliveryLogSaved: !deliveryLogError,
      deliveryBatchId,
      message: sent + '/' + deliveries.length + '件の参加確認済みLINEグループへ週間予定表を送信しました。' +
        (failed > 0 ? ' 失敗したグループがあります。HTTPステータスを確認してください。' : ''),
    }, { status: failed > 0 || sent === 0 ? 502 : 200, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json', 'X-Line-Retry-Key': retryKey },
      body: JSON.stringify({ messages: applyCampusSyncFlexFooters([flex]) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    await recordLineDeliveryResponse(response, { channel: 'broadcast', kind: 'school_schedule', accessToken, retryKey, messages: [flex] });
    if (!response.ok && response.status !== 409) {
      const errorBody = await response.text().catch(() => '');
      console.error('学校予定表のLINE配信に失敗:', response.status, errorBody.slice(0, 500));
      return jsonError(response.status === 429 ? 'LINEの送信上限・レート制限に達した可能性があります。' : 'LINEへの学校予定表配信に失敗しました（HTTP ' + response.status + '）。', 502);
    }
    const deliveryBatchId = randomUUID();
    const groupDelivery = await pushLineMessagesToRegisteredChats(accessToken, [flex], retryKey, 'school_schedule', deliveryBatchId);
    const groupMessage = summarizeLineGroupDelivery(groupDelivery);
    if (changeEvents.length) {
      const { error: markChangesError } = await supabase.from('campussync_schedule_change_events')
        .update({ digest_sent_at: new Date().toISOString() })
        .in('id', changeEvents.map(item => item.id))
        .is('digest_sent_at', null);
      if (markChangesError) console.error('週間予定表に含めた日程変更の処理済み記録に失敗:', markChangesError.message);
    }
    const weekEnd = addDays(weekStart, 6);
    return NextResponse.json({
      success: true,
      weekStart,
      groupDelivery,
      content: {
        weeklySchedule: hasSavedSchedule,
        weeklyEventFallback: !hasSavedSchedule,
        mondayClassTimetable: true,
        assignments: assignments.length,
        scheduleChanges: changeEvents.length,
        countdowns: countdownEvents.length,
        weather: weeklyWeather.length,
      },
      message: weekStart + '〜' + weekEnd + ' の1週間の予定、月曜日の7組・8組時間割、課題・日程変更、天気、カウントダウンをLINEへ送信しました。' +
        (!hasSavedSchedule ? ' 詳細な週間予定表は未登録のため、行事情報を使った一覧にしています。' : '') + groupMessage,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('学校予定表のLINE配信通信エラー:', error instanceof Error ? error.message : 'unknown error');
    return jsonError('LINEへの学校予定表配信に失敗しました。Vercelのログを確認してください。', 502);
  }
}
