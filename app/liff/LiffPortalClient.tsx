'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import WeatherForecast from '@/components/WeatherForecast';
import FunctionCalculator from '@/components/FunctionCalculator';

type PanelKey = 'exams' | 'timetable' | 'events' | 'assignments' | 'weather' | 'trains' | 'calculator';
type ClassCode = `${1 | 2 | 3}-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
type RangeSection = { section_id?: string; kind?: 'range' | 'notice'; title: string; body: string; note?: string | null };
type PublicExam = {
  id: string;
  schoolYear: number;
  term: number;
  examType: string;
  startDate: string;
  endDate: string;
  subjects: Array<{
    subject: string;
    examDate: string;
    ranges: Array<{ displaySubject: string; audience: string; sections: RangeSection[]; broadcastOn: string | null; updatedAt: string }>;
  }>;
};
type PublicAssignment = {
  id: string;
  title: string;
  details: string;
  source: string;
  type: string;
  due: string;
  dueAt: string | null;
  subject: string;
  targetClass: string;
  subjectOption: string;
  priority: string;
  updatedAt: string;
};
type SchoolInfo = { success: boolean; message?: string; today: string; exams: PublicExam[]; assignments: PublicAssignment[] };
type CountdownEvent = { id: string; title: string; summary: string; event_date: string; is_active?: boolean };
type TimetableSlot = { period: number; subject: string; teacher: string };
type ClassTimetable = Record<string, Record<string, TimetableSlot[]>>;
type WeeklySchedule = { schedule?: { week_start: string; title: string; days: Array<{ date: string; dayLabel: string; isHoliday: boolean; holidayName: string; isWeekendSchool: boolean; items: Array<{ id: string; time: string; title: string; location: string; details: string }> }> } | null };
type TrainRow = { direction: string; departure_time: string; service: string; service_day: 'weekday' | 'saturday' };
type TrainPayload = { success: boolean; message?: string; station?: string; rows?: TrainRow[] };

const PANELS: Array<{ key: PanelKey; title: string; subtitle: string; icon: string; tint: string }> = [
  { key: 'exams', title: '試験範囲', subtitle: '学校公開の考査・出題範囲', icon: '▤', tint: 'from-blue-500 to-cyan-500' },
  { key: 'timetable', title: '時間割表', subtitle: 'クラス別の授業・学校予定', icon: '▦', tint: 'from-violet-500 to-indigo-500' },
  { key: 'events', title: 'イベント', subtitle: '学校行事までのカウントダウン', icon: '◷', tint: 'from-amber-500 to-orange-500' },
  { key: 'assignments', title: '課題・提出物', subtitle: 'クラス向けに公開された課題', icon: '☷', tint: 'from-emerald-500 to-teal-500' },
  { key: 'weather', title: '気象パネル', subtitle: '天気・警報・地震情報', icon: '☀', tint: 'from-sky-500 to-blue-500' },
  { key: 'trains', title: '電車発車案内', subtitle: '鷹の台駅の発車時刻表', icon: '↗', tint: 'from-rose-500 to-pink-500' },
  { key: 'calculator', title: '高機能電卓', subtitle: '関数・微積分・グラフ・統計', icon: '∑', tint: 'from-fuchsia-500 to-purple-500' },
];

const CLASSES: ClassCode[] = Array.from({ length: 24 }, (_, index) =>
  `${Math.floor(index / 8) + 1}-${(index % 8) + 1}` as ClassCode,
);
const DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
const DAY_LABELS: Record<string, string> = { Mon: '月', Tue: '火', Wed: '水', Thu: '木', Fri: '金' };

function jstDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function mondayOf(dateKey: string): string {
  const date = new Date(dateKey + 'T00:00:00+09:00');
  const weekday = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })).getDay();
  const shift = (weekday + 6) % 7;
  date.setDate(date.getDate() - shift);
  return jstDateKey(date);
}
function dateLabel(value: string): string {
  if (!value) return '日付未設定';
  const date = new Date(value.slice(0, 10) + 'T12:00:00+09:00');
  return date.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short' });
}
function remainingDays(value: string): number {
  const target = Date.parse(value.slice(0, 10) + 'T00:00:00+09:00');
  const today = Date.parse(jstDateKey() + 'T00:00:00+09:00');
  return Math.round((target - today) / 86400000);
}
function formatTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : value;
}

function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'blue' | 'green' | 'amber' | 'red' }) {
  const colors = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-200',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200',
    red: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200',
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${colors[tone]}`}>{children}</span>;
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">{children}</div>;
}

export default function LiffPortalClient() {
  const [activePanel, setActivePanel] = useState<PanelKey | null>(null);
  const [classCode, setClassCode] = useState<ClassCode>('2-7');
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [schoolInfoLoading, setSchoolInfoLoading] = useState(false);
  const [schoolInfoError, setSchoolInfoError] = useState('');
  const [events, setEvents] = useState<CountdownEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [timetable, setTimetable] = useState<ClassTimetable | null>(null);
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule['schedule']>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [selectedDay, setSelectedDay] = useState<string>('Mon');
  const [trainRows, setTrainRows] = useState<TrainRow[]>([]);
  const [trainLoading, setTrainLoading] = useState(false);
  const [trainError, setTrainError] = useState('');
  const [trainDirection, setTrainDirection] = useState<'kokubunji' | 'higashimurayama'>('kokubunji');
  const [trainDayType, setTrainDayType] = useState<'weekday' | 'saturday'>('weekday');
  const [today, setToday] = useState('');

  useEffect(() => {
    const saved = window.localStorage.getItem('campussync-public-class');
    if (saved && CLASSES.includes(saved as ClassCode)) setClassCode(saved as ClassCode);
    setToday(jstDateKey());
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(new Date());
    setSelectedDay(({ Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri' } as Record<string, string>)[weekday] || 'Mon');
    const dayOfWeek = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(new Date());
    setTrainDayType(dayOfWeek === 'Sat' ? 'saturday' : 'weekday');
  }, []);

  useEffect(() => {
    window.localStorage.setItem('campussync-public-class', classCode);
  }, [classCode]);

  const loadSchoolInfo = useCallback(async () => {
    setSchoolInfoLoading(true);
    setSchoolInfoError('');
    try {
      const response = await fetch('/api/public/school-info?class=' + encodeURIComponent(classCode), { cache: 'no-store' });
      const payload = await response.json() as SchoolInfo;
      if (!response.ok || !payload.success) throw new Error(payload.message || '学校情報を読み込めませんでした。');
      setSchoolInfo(payload);
    } catch (error) {
      setSchoolInfoError(error instanceof Error ? error.message : '学校情報を読み込めませんでした。');
      setSchoolInfo(null);
    } finally {
      setSchoolInfoLoading(false);
    }
  }, [classCode]);

  useEffect(() => { void loadSchoolInfo(); }, [loadSchoolInfo]);

  const loadTimetable = useCallback(async () => {
    setScheduleLoading(true);
    setScheduleError('');
    try {
      const date = jstDateKey();
      const [classResponse, schoolResponse] = await Promise.all([
        fetch('/api/class-timetable', { cache: 'no-store' }),
        fetch('/api/school-schedule?weekStart=' + mondayOf(date), { cache: 'no-store' }),
      ]);
      const classPayload = await classResponse.json().catch(() => null) as { success?: boolean; timetable?: ClassTimetable; message?: string } | null;
      const schoolPayload = await schoolResponse.json().catch(() => null) as WeeklySchedule | null;
      if (!classResponse.ok || !classPayload?.success || !classPayload.timetable) {
        throw new Error(classPayload?.message || 'クラス時間割を取得できませんでした。');
      }
      setTimetable(classPayload.timetable);
      setWeeklySchedule(schoolPayload?.schedule || null);
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : '時間割を取得できませんでした。');
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activePanel === 'timetable' && !timetable && !scheduleLoading) void loadTimetable();
  }, [activePanel, timetable, scheduleLoading, loadTimetable]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    setEventsError('');
    try {
      const response = await fetch('/api/school-countdowns', { cache: 'no-store' });
      const payload = await response.json() as { events?: CountdownEvent[]; message?: string };
      if (!response.ok) throw new Error(payload.message || 'イベント情報を取得できませんでした。');
      setEvents(payload.events || []);
    } catch (error) {
      setEventsError(error instanceof Error ? error.message : 'イベント情報を取得できませんでした。');
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activePanel === 'events' && events.length === 0 && !eventsLoading && !eventsError) void loadEvents();
  }, [activePanel, events.length, eventsLoading, eventsError, loadEvents]);

  const loadTrains = useCallback(async () => {
    setTrainLoading(true);
    setTrainError('');
    try {
      const response = await fetch('/api/public/train-departures', { cache: 'no-store' });
      const payload = await response.json() as TrainPayload;
      if (!response.ok || !payload.success) throw new Error(payload.message || '電車時刻表を取得できませんでした。');
      setTrainRows(payload.rows || []);
    } catch (error) {
      setTrainError(error instanceof Error ? error.message : '電車時刻表を取得できませんでした。');
    } finally {
      setTrainLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activePanel === 'trains' && trainRows.length === 0 && !trainLoading && !trainError) void loadTrains();
  }, [activePanel, trainRows.length, trainLoading, trainError, loadTrains]);

  const panelInfo = useMemo(() => PANELS.find(panel => panel.key === activePanel), [activePanel]);
  const isScienceClass = classCode === '2-7' || classCode === '2-8';
  const groupName = classCode === '2-7' ? '7組' : classCode === '2-8' ? '8組' : '';
  const classSlots = groupName && timetable ? timetable[groupName]?.[selectedDay] || [] : [];
  const currentDayType = (() => {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(new Date());
    return weekday === 'Sat' ? 'saturday' : ['Sun'].includes(weekday) ? null : 'weekday';
  })();
  const nowMinutes = (() => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return Number(values.hour) * 60 + Number(values.minute);
  })();
  const trainDepartures = trainRows
    .filter(row => row.direction === trainDirection && row.service_day === trainDayType)
    .map(row => ({ ...row, minute: Number(row.departure_time.slice(0, 2)) * 60 + Number(row.departure_time.slice(3, 5)) }))
    .sort((a, b) => a.minute - b.minute);
  const trainNext = currentDayType === trainDayType
    ? trainDepartures.filter(row => row.minute >= nowMinutes).slice(0, 8)
    : trainDepartures.slice(0, 8);
  const timetableUnavailable = !groupName;

  return (
    <main className="min-h-screen bg-[#f3f6fb] text-slate-900 dark:bg-[#07111f] dark:text-slate-100">
      <div className="mx-auto min-h-screen max-w-5xl px-3 pb-12 pt-4 sm:px-6 sm:pt-7">
        <header className="mb-5 overflow-hidden rounded-[28px] bg-gradient-to-br from-[#10253c] via-[#173c58] to-[#087b91] p-5 text-white shadow-xl shadow-slate-900/10 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black tracking-[0.26em] text-cyan-200">CAMPUSSYNC / LINE PORTAL</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">学校情報ポータル</h1>
              <p className="mt-1 text-sm text-blue-100">必要な学校情報を、LINEからすぐに。</p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-right backdrop-blur">
              <p className="text-[9px] font-black tracking-[0.16em] text-cyan-100">ACCESS</p>
              <p className="mt-0.5 text-sm font-bold">ログイン不要</p>
              <p className="text-[10px] text-blue-100">個人情報は取得しません</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <p className="text-[10px] font-bold text-cyan-100/80">本日の学校情報</p>
              <p className="mt-1 text-lg font-black">{today ? dateLabel(today) : '学校公開情報を確認'}</p>
              <p className="mt-1 max-w-xl text-xs leading-5 text-blue-100/85">試験範囲、時間割、課題、イベント、気象、電車、電卓を利用できます。</p>
            </div>
            <label className="grid gap-1 text-xs font-bold text-white">
              <span>表示するクラス</span>
              <select value={classCode} onChange={event => setClassCode(event.target.value as ClassCode)} className="min-w-32 rounded-xl border border-white/20 bg-white px-3 py-2.5 font-bold text-slate-900 outline-none focus:ring-2 focus:ring-cyan-300">
                {CLASSES.map(value => <option key={value} value={value}>{value.replace('-', '年') + '組'}</option>)}
              </select>
            </label>
          </div>
        </header>

        {!activePanel ? (
          <>
            <section className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black tracking-[0.2em] text-cyan-700 dark:text-cyan-300">PUBLIC SCHOOL INFORMATION</p>
                <h2 className="mt-1 text-lg font-black">利用できる機能</h2>
              </div>
              <Badge tone="green">7機能・無料公開</Badge>
            </section>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {PANELS.map(panel => (
                <button key={panel.key} type="button" onClick={() => setActivePanel(panel.key)} className="group min-h-36 rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-xl font-black text-white shadow-sm ${panel.tint}`}>{panel.icon}</span>
                  <span className="mt-3 block text-sm font-black">{panel.title}</span>
                  <span className="mt-1 block text-[10px] leading-4 text-slate-500 dark:text-slate-400">{panel.subtitle}</span>
                </button>
              ))}
            </div>
            <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">✓</span>
                <h2 className="text-sm font-black">公開情報だけを表示します</h2>
              </div>
              <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">学校全体または選択クラス向けに公開された内容のみを取得します。学習記録、成績、個人ToDo、プロフィール、提出状況は取得・保存しません。選択クラスはこの端末のブラウザ内だけに保存します。</p>
            </section>
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <button type="button" onClick={() => setActivePanel(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-bold shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-label="メニューに戻る">‹</button>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black tracking-[0.18em] text-cyan-700 dark:text-cyan-300">CAMPUSSYNC PUBLIC</p>
                <h2 className="text-lg font-black">{panelInfo?.title}</h2>
              </div>
              {['exams', 'timetable', 'assignments'].includes(activePanel) && (
                <select value={classCode} onChange={event => setClassCode(event.target.value as ClassCode)} aria-label="表示するクラス" className="max-w-28 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-900">
                  {CLASSES.map(value => <option key={value} value={value}>{value.replace('-', '年') + '組'}</option>)}
                </select>
              )}
            </div>

            {activePanel === 'exams' && (
              schoolInfoLoading ? <Notice>試験範囲を読み込んでいます…</Notice>
              : schoolInfoError ? <Notice>{schoolInfoError} <button onClick={() => void loadSchoolInfo()} className="ml-2 font-bold text-cyan-700 underline">再読み込み</button></Notice>
              : !schoolInfo?.exams.length ? <Notice>選択したクラスに公開されている試験範囲はありません。</Notice>
              : <div className="space-y-4">
                {schoolInfo.exams.map(exam => (
                  <section key={exam.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="bg-gradient-to-r from-blue-950 to-cyan-900 p-4 text-white">
                      <p className="text-[10px] font-bold text-cyan-200">{exam.schoolYear}年度・{exam.term}学期</p>
                      <h3 className="mt-1 text-lg font-black">{exam.examType}</h3>
                      <p className="mt-1 text-xs text-blue-100">{dateLabel(exam.startDate)} 〜 {dateLabel(exam.endDate)}</p>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {exam.subjects.map(subject => (
                        <div key={subject.subject} className="p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-sm font-black">{subject.subject}</h4>
                            <Badge tone="blue">試験日 {dateLabel(subject.examDate)}</Badge>
                          </div>
                          {subject.ranges.length ? subject.ranges.map((range, index) => (
                            <div key={range.audience + index} className="mt-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/60">
                              <p className="text-[10px] font-bold text-cyan-700 dark:text-cyan-300">{range.displaySubject} ・ {range.audience}</p>
                              {range.sections.map((section, sectionIndex) => (
                                <div key={section.section_id || sectionIndex} className="mt-2">
                                  <p className="text-xs font-black">{section.title}</p>
                                  {section.body && <p className="mt-1 whitespace-pre-wrap text-xs leading-6 text-slate-600 dark:text-slate-300">{section.body}</p>}
                                  {section.note && <p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-slate-500">{section.note}</p>}
                                  {section.kind === 'notice' && <Badge tone="amber">お知らせ</Badge>}
                                </div>
                              ))}
                            </div>
                          )) : <p className="mt-2 text-xs text-slate-500">この教科の範囲はまだ公開されていません。</p>}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {activePanel === 'assignments' && (
              schoolInfoLoading ? <Notice>課題を読み込んでいます…</Notice>
              : schoolInfoError ? <Notice>{schoolInfoError} <button onClick={() => void loadSchoolInfo()} className="ml-2 font-bold text-cyan-700 underline">再読み込み</button></Notice>
              : !schoolInfo?.assignments.length ? <Notice>選択したクラス向けに公開されている課題はありません。</Notice>
              : <div className="space-y-3">
                {schoolInfo.assignments.map(item => (
                  <article key={item.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={item.priority === 'urgent' ? 'red' : item.priority === 'important' ? 'amber' : 'slate'}>{item.priority === 'urgent' ? '最優先' : item.priority === 'important' ? '重要' : '通常'}</Badge>
                      <Badge tone="blue">{item.subject}</Badge>
                      {item.subjectOption && <Badge>{item.subjectOption}</Badge>}
                    </div>
                    <h3 className="mt-3 text-sm font-black">{item.title}</h3>
                    {item.details && <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-600 dark:text-slate-300">{item.details}</p>}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] dark:border-slate-800">
                      <span className="text-slate-500">{item.source || '学校公開課題'} ・ {item.type === 'classroom' ? 'Classroom' : item.type === 'paper' ? 'プリント等' : 'その他'}</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">期限：{item.dueAt ? dateLabel(item.dueAt) + ' ' + new Date(item.dueAt).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }) : item.due || '未設定'}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {activePanel === 'timetable' && (
              scheduleLoading ? <Notice>時間割を読み込んでいます…</Notice>
              : scheduleError ? <Notice>{scheduleError} <button onClick={() => void loadTimetable()} className="ml-2 font-bold text-cyan-700 underline">再読み込み</button></Notice>
              : <>
                {timetableUnavailable ? <Notice>現在、クラス時間割として登録されているのは2年7組・2年8組です。管理画面で他のクラスの時間割が登録されると、ここにも表示されます。</Notice> : (
                  <>
                    <section className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div><p className="text-[10px] font-bold text-cyan-700 dark:text-cyan-300">{groupName}・授業時間割</p><h3 className="text-base font-black">週間時間割</h3></div>
                        <Badge tone="green">公開データ</Badge>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {DAY_KEYS.map(day => <button key={day} onClick={() => setSelectedDay(day)} className={`rounded-xl px-2 py-2 text-xs font-black ${selectedDay === day ? 'bg-slate-900 text-white dark:bg-cyan-700' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{DAY_LABELS[day]}</button>)}
                      </div>
                      <div className="mt-3 space-y-2">
                        {classSlots.length ? classSlots.map(slot => <div key={slot.period} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-3 dark:bg-slate-950/60"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-xs font-black text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">{slot.period}</span><div className="min-w-0"><p className="text-sm font-bold">{slot.subject}</p>{slot.teacher && <p className="mt-0.5 text-[10px] text-slate-500">{slot.teacher}</p>}</div></div>) : <p className="py-6 text-center text-xs text-slate-500">この曜日の時間割は登録されていません。</p>}
                      </div>
                    </section>
                  </>
                )}
                {weeklySchedule && (
                  <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-[10px] font-bold text-cyan-700 dark:text-cyan-300">SCHOOL WEEKLY SCHEDULE</p>
                    <h3 className="mt-1 text-base font-black">{weeklySchedule.title}</h3>
                    {weeklySchedule.days.flatMap(day => day.items.map(item => ({ ...item, date: day.date, dayLabel: day.dayLabel }))).map(item => (
                      <div key={item.id + item.date} className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <p className="text-[10px] font-bold text-slate-500">{dateLabel(item.date)} ・ {item.time}</p>
                        <p className="mt-1 text-xs font-black">{item.title}</p>
                        {item.location && <p className="mt-1 text-[10px] text-slate-500">{item.location}</p>}
                        {item.details && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600 dark:text-slate-300">{item.details}</p>}
                      </div>
                    ))}
                  </section>
                )}
                {!weeklySchedule && <p className="mt-3 text-[11px] text-slate-500">今週の学校予定表はまだ公開されていません。</p>}
              </>
            )}

            {activePanel === 'events' && (
              eventsLoading ? <Notice>イベントを読み込んでいます…</Notice>
              : eventsError ? <Notice>{eventsError} <button onClick={() => void loadEvents()} className="ml-2 font-bold text-cyan-700 underline">再読み込み</button></Notice>
              : !events.length ? <Notice>現在公開されているイベントはありません。</Notice>
              : <div className="grid gap-3 sm:grid-cols-2">
                {events.map(event => {
                  const days = remainingDays(event.event_date);
                  return <article key={event.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300">{dateLabel(event.event_date)}</p>
                    <h3 className="mt-2 text-base font-black">{event.title}</h3>
                    {event.summary && <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{event.summary}</p>}
                    <div className="mt-4 flex items-end gap-2"><span className="text-4xl font-black tabular-nums text-amber-600 dark:text-amber-300">{Math.max(0, days)}</span><span className="pb-1 text-xs font-bold text-slate-500">{days === 0 ? '当日' : '日後'}</span></div>
                  </article>;
                })}
              </div>
            )}

            {activePanel === 'weather' && <WeatherForecast />}

            {activePanel === 'trains' && (
              trainLoading ? <Notice>発車時刻表を読み込んでいます…</Notice>
              : trainError ? <Notice>{trainError} <button onClick={() => void loadTrains()} className="ml-2 font-bold text-cyan-700 underline">再読み込み</button></Notice>
              : <>
                <section className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-[10px] font-bold tracking-[0.18em] text-cyan-700 dark:text-cyan-300">TRAIN DEPARTURES</p>
                  <h3 className="mt-1 text-xl font-black">鷹の台駅 発車案内</h3>
                  <p className="mt-1 text-[11px] text-slate-500">登録済み時刻表に基づく案内です。リアルタイムの遅延・運休情報ではありません。</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button onClick={() => setTrainDayType('weekday')} className={`rounded-xl px-3 py-2.5 text-xs font-black ${trainDayType === 'weekday' ? 'bg-cyan-800 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>平日</button>
                    <button onClick={() => setTrainDayType('saturday')} className={`rounded-xl px-3 py-2.5 text-xs font-black ${trainDayType === 'saturday' ? 'bg-cyan-800 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>土曜</button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => setTrainDirection('kokubunji')} className={`rounded-xl border px-3 py-2.5 text-xs font-bold ${trainDirection === 'kokubunji' ? 'border-cyan-500 bg-cyan-50 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200' : 'border-slate-200 dark:border-slate-700'}`}>国分寺方面</button>
                    <button onClick={() => setTrainDirection('higashimurayama')} className={`rounded-xl border px-3 py-2.5 text-xs font-bold ${trainDirection === 'higashimurayama' ? 'border-cyan-500 bg-cyan-50 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200' : 'border-slate-200 dark:border-slate-700'}`}>東村山方面</button>
                  </div>
                  {currentDayType === null && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-[11px] leading-5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">本日は日曜日です。現在のデータには日曜・祝日専用の時刻表がないため、平日または土曜の時刻表を選択して確認してください。</p>}
                  <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                    {trainNext.map((row, index) => <div key={row.departure_time + row.service_day + index} className="flex items-center justify-between gap-3 py-3"><span className="font-mono text-2xl font-black tabular-nums">{formatTime(row.departure_time)}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{row.service || '列車種別未登録'}</span></div>)}
                    {!trainNext.length && <p className="py-6 text-center text-xs text-slate-500">選択した時刻表で表示できる発車時刻はありません。</p>}
                  </div>
                  <p className="mt-3 text-[10px] text-slate-400">※発車時刻・列車種別は登録された時刻表データを使用しています。</p>
                </section>
              </>
            )}

            {activePanel === 'calculator' && <FunctionCalculator />}
          </>
        )}

        <footer className="mt-8 border-t border-slate-200 py-5 text-center text-[10px] leading-5 text-slate-400 dark:border-slate-800">
          CAMPUSSYNC · PUBLIC SCHOOL PORTAL<br />
          学校公開情報のみを表示しています。個人向け機能はCampusSyncにログインして利用してください。
        </footer>
      </div>
    </main>
  );
}
