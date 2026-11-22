import { recordLineDeliveryResponse } from './_shared/line-delivery-audit.ts';
import { applyCampusSyncFlexFooters } from './_shared/line-flex-footer.ts';
import { getActiveLineBot } from './_shared/line-bot-rotation.ts';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { buildWeeklySchoolScheduleFlexMessage } from './_shared/line-flex.ts';
import { CLASS_TIMETABLE_DATA, mapClassTimetableRows, type ClassTimetableData, type ClassTimetableRow } from './_shared/class-timetable.ts';
import { pushLineMessagesToRegisteredChats, summarizeLineGroupDelivery } from './_shared/line-group-chats.ts';
import { buildWeatherForecastBubble } from './_shared/line-weather-flex.ts';

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
  const url = Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') || Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
function jsonError(message: string, status: number) {
  return Response.json({ success: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
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
type WeeklyExamSubjectRow = { exam_date: string; subject: string; sort_order: number };
type WeeklyExamDefinitionRow = { id: string; target_classes: string[] | null };

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
  const bodyContents: Record<string, unknown>[] = [];
  if (failed) {
    bodyContents.push({
      type: 'text', text: 'カウントダウン情報を取得できませんでした。', size: 'sm', color: '#B91C1C', wrap: true,
    });
  } else if (!events.length) {
    bodyContents.push({
      type: 'box', layout: 'vertical', paddingAll: '14px', cornerRadius: '12px', backgroundColor: '#EAF2F1',
      contents: [{
        type: 'text', text: '現在、登録されている今後の学校行事はありません。',
        size: 'sm', color: '#315B59', weight: 'bold', wrap: true,
      }],
    });
  } else {
    for (const event of events.slice(0, 6)) {
      const remaining = daysUntil(today, event.event_date);
      const remainingText = remaining === 0 ? '本日' : remaining === 1 ? 'あと1日' : 'あと' + remaining + '日';
      const countdownBackground = remaining <= 3 ? '#FCE8E7' : '#E2EFED';
      const countdownColor = remaining <= 3 ? '#B42318' : '#376C69';
      const eventDetails: Record<string, unknown>[] = [
        { type: 'text', text: String(event.title || '学校行事').slice(0, 70), size: 'md', color: '#0F172A', weight: 'bold', wrap: true },
      ];
      if (event.summary) eventDetails.push({
        type: 'text', text: String(event.summary).slice(0, 100), size: 'xs', color: '#64748B', wrap: true,
      });

      bodyContents.push({
        type: 'box', layout: 'vertical', paddingAll: '2px', cornerRadius: '14px', backgroundColor: '#C6D6D6',
        contents: [{
          type: 'box', layout: 'vertical', paddingAll: '12px', cornerRadius: '12px',
          backgroundColor: '#F8FAFC', spacing: 'sm',
          contents: [
            { type: 'box', layout: 'vertical', height: '3px', cornerRadius: '2px', backgroundColor: '#5C9291', contents: [{ type: 'filler' }] },
            {
              type: 'box', layout: 'horizontal', alignItems: 'center',
              contents: [
                { type: 'text', text: 'SCHOOL CALENDAR', size: 'xxs', color: '#5C9291', weight: 'bold', flex: 1 },
                {
                  type: 'box', layout: 'vertical', paddingAll: '6px', cornerRadius: '18px', backgroundColor: countdownBackground,
                  contents: [{ type: 'text', text: remainingText, size: 'xs', color: countdownColor, weight: 'bold', align: 'center' }],
                },
              ],
            },
            {
              type: 'box', layout: 'horizontal', alignItems: 'center', spacing: 'md',
              contents: [
                {
                  type: 'box', layout: 'vertical', width: '72px', paddingAll: '10px', cornerRadius: '10px',
                  backgroundColor: '#163A40', justifyContent: 'center', alignItems: 'center', spacing: 'xs',
                  contents: [
                    { type: 'text', text: event.event_date.slice(5).replace('-', '/'), size: 'lg', color: '#FFFFFF', weight: 'bold', align: 'center' },
                    { type: 'text', text: 'EVENT', size: 'xxs', color: '#A7D3CD', weight: 'bold', align: 'center' },
                  ],
                },
                { type: 'box', layout: 'vertical', flex: 1, spacing: 'xs', contents: eventDetails },
              ],
            },
          ],
        }],
      });
    }
  }

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: '#0F172A', paddingAll: '18px', spacing: 'sm',
      contents: [
        { type: 'text', text: 'CAMPUSSYNC  /  SCHOOL EVENTS', size: 'xs', color: '#67E8F9', weight: 'bold' },
        { type: 'text', text: '学校イベント・カウントダウン', size: 'xl', color: '#FFFFFF', weight: 'bold', wrap: true },
        { type: 'text', text: 'UPCOMING EVENTS  •  COUNTDOWN', size: 'xs', color: '#CBD5E1', wrap: true },
      ],
    },
    body: { type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md', contents: bodyContents },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: '#F8FAFC', spacing: 'xs',
      contents: [{ type: 'text', text: 'CAMPUSSYNC・SOKA HIGH SCHOOL', size: 'xs', color: '#64748B', align: 'center', wrap: true }],
    },
  };
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
  const payload = await request.json().catch(() => ({})) as { mode?: unknown; weekStart?: unknown; probe?: unknown };
  const manualRequest = payload.mode === 'manual';
  const probeRequest = payload.probe === true;
  const groupOnlyRequest = payload.groupOnly === true;
  if (manualRequest) {
    const expectedPassword = Deno.env.get('CAMPUS_SYNC_ADMIN_PASSWORD') || '';
    const receivedPassword = request.headers.get('x-admin-password') || '';
    if (!expectedPassword || !receivedPassword || !constantTimeEqual(expectedPassword, receivedPassword)) {
      return jsonError('学校予定表の手動配信には正しいAdmin用パスワードが必要です。', 401);
    }
  } else {
    const expectedSecret = Deno.env.get('CRON_SECRET') || '';
    const receivedSecret = request.headers.get('x-cron-secret') || '';
    if (!expectedSecret || !receivedSecret || !constantTimeEqual(expectedSecret, receivedSecret)) {
      return jsonError('学校予定表の定期配信認証に失敗しました。', 401);
    }
  }

  const supabaseUrl = Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') || Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const activeLineBot = await getActiveLineBot();
  const accessToken = activeLineBot?.accessToken || null;
  if (!supabaseUrl || !serviceKey || !activeLineBot || !accessToken) {
    return jsonError('Supabaseの設定と現在使用中のLINE BOTのアクセストークンを確認してください。', 503);
  }
  const supabase = getAdminSupabase();
  if (!supabase) return jsonError('Supabaseのサーバー設定が不足しています。', 503);

  const weekStart = manualRequest && isDateKey(payload.weekStart) ? String(payload.weekStart) : getNextSchoolWeekStart();
  if (!isDateKey(weekStart) || !isMonday(weekStart)) return jsonError('送信週は月曜日の日付で指定してください。', 400);

  const today = getTokyoTodayKey();
  const weekEnd = addDays(weekStart, 6);
  const [scheduleResult, weeklyEventsResult, countdownResult, assignmentResult, timetableResult, weatherCacheResult, changeResult, examScheduleResult] = await Promise.all([
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
    supabase.from('campussync_weather_forecast_cache')
      .select('forecast,fetched_at')
      .eq('cache_key', 'kodaira-5day-v1')
      .maybeSingle(),
    supabase.from('campussync_schedule_change_events')
      .select('id,entity_type,entity_id,action,title,subject,priority,summary,previous_value,next_value,reason,created_at,digest_sent_at')
      .is('digest_sent_at', null)
      .order('created_at', { ascending: true })
      .limit(8),
    supabase.from('school_test_exams')
      .select('id,target_classes')
      .eq('school_year', Number(weekStart.slice(0, 4)))
      .eq('term', 2)
      .eq('exam_type', '期末考査')
      .lte('start_date', weekEnd)
      .gte('end_date', weekStart),
  ]);
  if (scheduleResult.error) console.error('週間予定表の取得に失敗（行事情報で代替）:', scheduleResult.error.message);
  if (weeklyEventsResult.error) console.error('週間予定表：学校行事の取得に失敗:', weeklyEventsResult.error.message);
  if (countdownResult.error) console.error('週間予定表：カウントダウン取得に失敗:', countdownResult.error.message);
  if (assignmentResult.error) console.error('週間予定表：課題取得に失敗:', assignmentResult.error.message);
  if (changeResult.error) console.error('週間予定表：日程変更取得に失敗:', changeResult.error.message);
  if (examScheduleResult.error) console.error('週間予定表：定期考査日程の取得に失敗:', examScheduleResult.error.message);
  if (timetableResult.error) console.error('週間予定表：月曜日の時間割取得エラー（初期データへフォールバック）', timetableResult.error.message);
  if (weatherCacheResult.error) console.error('週間学校予定表：天気キャッシュの取得に失敗:', weatherCacheResult.error.message);

  const schedule = scheduleResult.data;
  if (!schedule && manualRequest) {
    return jsonError('選択した週の予定表がまだ保存されていません。先に予定表を保存してください。', 404);
  }
  const weeklyEvents = (weeklyEventsResult.data || []) as WeeklyEventRow[];
  const savedDays = Array.isArray(schedule?.days) ? schedule.days as Array<any> : [];
  const hasSavedSchedule = Boolean(schedule && savedDays.length > 0);
  // 次週の週間予定表が未登録でも、登録済みの学校行事を日付別にまとめて配信を継続する。
  const baseDays = hasSavedSchedule ? savedDays : buildFallbackWeekDays(weekStart, weeklyEvents);
  const matchingExamIds = ((examScheduleResult.data || []) as WeeklyExamDefinitionRow[])
    .filter(exam => Array.isArray(exam.target_classes) && exam.target_classes.includes('2-7') && exam.target_classes.includes('2-8'))
    .map(exam => exam.id);
  let examSubjects: WeeklyExamSubjectRow[] = [];
  if (matchingExamIds.length) {
    const examSubjectsResult = await supabase.from('school_test_subjects')
      .select('exam_date,subject,sort_order')
      .in('exam_id', matchingExamIds)
      .gte('exam_date', weekStart)
      .lte('exam_date', weekEnd)
      .order('exam_date', { ascending: true })
      .order('sort_order', { ascending: true });
    if (examSubjectsResult.error) {
      console.error('週間予定表：定期考査の教科取得に失敗:', examSubjectsResult.error.message);
    } else {
      examSubjects = (examSubjectsResult.data || []) as WeeklyExamSubjectRow[];
    }
  }
  const days = baseDays.map((day: any) => {
    const subjects = examSubjects.filter(row => row.exam_date === day.date);
    if (!subjects.length) return day;
    const existingItems = Array.isArray(day.items) ? [...day.items] : [];
    if (!existingItems.some((item: any) => String(item?.id || '') === 'exam-schedule-' + day.date)) {
      existingItems.push({
        id: 'exam-schedule-' + day.date,
        title: '定期考査',
        details: '教科：' + subjects.map(row => row.subject).join('・'),
      });
    }
    return { ...day, items: existingItems };
  });
  const examScheduleDays = examSubjects.reduce((dates: Set<string>, row) => dates.add(row.exam_date), new Set<string>());
  if (manualRequest && !days.some(day => day?.isHoliday || String(day?.holidayName || '').trim() || (Array.isArray(day?.items) && day.items.some((item: any) => String(item?.title || item?.details || item?.time || item?.location || '').trim())))) {
    return jsonError('予定または祝日設定がないため、配信できません。', 400);
  }

  const timetableRows = timetableResult.data || [];
  const timetable: ClassTimetableData = timetableRows.length ? mapClassTimetableRows(timetableRows as ClassTimetableRow[]) : CLASS_TIMETABLE_DATA;
  const weatherCacheRow = weatherCacheResult.data as { forecast?: unknown; fetched_at?: string } | null;
  const weatherCacheAgeMs = weatherCacheRow?.fetched_at
    ? Math.max(0, Date.now() - new Date(weatherCacheRow.fetched_at).getTime())
    : Number.POSITIVE_INFINITY;
  const forecastDays = Array.isArray(weatherCacheRow?.forecast) && weatherCacheAgeMs <= 6 * 60 * 60 * 1000
    ? weatherCacheRow.forecast as any[]
    : [];
  const weatherTargetDates = [weekStart, addDays(weekStart, 1), addDays(weekStart, 2)];
  const weeklyWeather = forecastDays
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
  if (probeRequest) {
    const { count: registeredGroups, error: groupCountError } = await supabase
      .from('line_group_chats')
      .select('chat_id', { count: 'exact', head: true })
      .eq('active', true)
      .eq('receive_school_schedule', true);
    if (groupCountError) return jsonError('週間予定表のLINE配信先を確認できません。', 500);
    return Response.json({
      success: true,
      probe: true,
      sendsPerformed: false,
      activeBotSlot: activeLineBot.slot,
      weekStart,
      weeklyScheduleSaved: hasSavedSchedule,
      mondayTimetableRows: timetableRows.length,
      assignmentCount: assignments.length,
      countdownCount: countdownEvents.length,
      weatherDays: weeklyWeather.length,
      changeCount: changeEvents.length,
      registeredGroups: registeredGroups || 0,
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (groupOnlyRequest) {
    const retryKey = retryKeyForWeek(weekStart);
    const groupDelivery = await pushLineMessagesToRegisteredChats(accessToken, [flex], retryKey, 'school_schedule', retryKey);
    if (changeEvents.length && !groupDelivery.lookupError && groupDelivery.registered > 0 && groupDelivery.failed === 0) {
      const { error: markChangesError } = await supabase.from('campussync_schedule_change_events')
        .update({ digest_sent_at: new Date().toISOString() })
        .in('id', changeEvents.map(item => item.id))
        .is('digest_sent_at', null);
      if (markChangesError) console.error('週間予定表のグループ再送に含めた日程変更の処理済み記録に失敗:', markChangesError.message);
    }
    const succeeded = groupDelivery.registered > 0 && groupDelivery.sent === groupDelivery.registered && groupDelivery.failed === 0 && !groupDelivery.lookupError;
    return Response.json({
      success: succeeded,
      groupOnlyReplay: true,
      broadcastSkipped: true,
      weekStart,
      groupDelivery,
      content: {
        weeklySchedule: hasSavedSchedule,
        weeklyEventFallback: !hasSavedSchedule,
        examScheduleDays: examScheduleDays.size,
        examSubjects: examSubjects.length,
        countdowns: countdownEvents.length,
        weather: weeklyWeather.length,
      },
      message: succeeded
        ? weekStart + '〜' + weekEnd + 'の週間予定をLINEグループへ再送しました。公式アカウントへの重複配信は行っていません。'
        : 'グループ再送に失敗しました：' + summarizeLineGroupDelivery(groupDelivery),
    }, { status: succeeded ? 200 : 502, headers: { 'Cache-Control': 'no-store' } });
  }

  const retryKey = manualRequest ? randomUUID() : retryKeyForWeek(weekStart);
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
    if (changeEvents.length && !groupDelivery.lookupError && (groupDelivery.registered === 0 || groupDelivery.failed === 0)) {
      const { error: markChangesError } = await supabase.from('campussync_schedule_change_events')
        .update({ digest_sent_at: new Date().toISOString() })
        .in('id', changeEvents.map(item => item.id))
        .is('digest_sent_at', null);
      if (markChangesError) console.error('週間予定表に含めた日程変更の処理済み記録に失敗:', markChangesError.message);
    }
    const weekEnd = addDays(weekStart, 6);
    return Response.json({
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
    return jsonError('LINEへの学校予定表配信に失敗しました。Supabase Edge Functionのログを確認してください。', 502);
  }
}
