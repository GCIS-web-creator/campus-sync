'use client';

import React, { useMemo, useState } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, Clock3, TrendingDown, TrendingUp } from 'lucide-react';

export type LearningAnalyticsSession = {
  id: string;
  subject_name: string;
  task_title: string;
  test_range_title?: string | null;
  focus_seconds: number;
  break_seconds: number;
  started_at: string;
  ended_at?: string | null;
  reflection?: string | null;
  next_action?: string | null;
  finish_kind?: string | null;
};

type Period = 'week' | 'month' | '90days' | 'year' | 'custom';

const SUBJECT_COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#3b82f6', '#f97316', '#14b8a6', '#a855f7', '#84cc16', '#64748b'];
const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];
const pad = (value: number) => String(value).padStart(2, '0');
const dateKey = (date: Date) => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
const parseDate = (key: string) => new Date(key + 'T00:00:00');
const addDays = (date: Date, amount: number) => {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + amount);
  return next;
};
const dayDistance = (start: Date, end: Date) => Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000);
const formatDuration = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  if (hours > 0) return hours + '時間' + (minutes > 0 ? minutes + '分' : '');
  return minutes + '分';
};
const formatCompact = (seconds: number) => {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  if (minutes >= 60) return (minutes / 60).toFixed(minutes % 60 ? 1 : 0) + 'h';
  return minutes + '分';
};
const formatDate = (key: string, options?: Intl.DateTimeFormatOptions) =>
  parseDate(key).toLocaleDateString('ja-JP', options || { month: 'numeric', day: 'numeric' });
const sessionsTotal = (items: LearningAnalyticsSession[]) => items.reduce((sum, item) => sum + Math.max(0, Number(item.focus_seconds) || 0), 0);

export default function StudentLearningAnalytics({ sessions, isDarkMode = false }: {
  sessions: LearningAnalyticsSession[];
  isDarkMode?: boolean;
}) {
  const dark = isDarkMode;
  const [period, setPeriod] = useState<Period>('week');
  const [customStart, setCustomStart] = useState(() => dateKey(addDays(new Date(), -29)));
  const [customEnd, setCustomEnd] = useState(() => dateKey(new Date()));
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));

  const text = dark ? 'text-slate-100' : 'text-slate-900';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const panel = 'rounded-2xl border p-4 ' + (dark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white');
  const inset = dark ? 'bg-slate-900' : 'bg-slate-50';
  const softBorder = dark ? 'border-slate-700' : 'border-slate-200';
  const field = 'min-w-0 rounded-xl border px-3 py-2 text-xs font-semibold outline-none focus:border-cyan-500 ' + (dark ? 'border-slate-600 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-800');

  const filteredSessions = useMemo(() => sessions.filter(item => subjectFilter === 'all' || item.subject_name === subjectFilter), [sessions, subjectFilter]);
  const range = useMemo(() => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (period === 'week') {
      const start = addDays(todayStart, -((todayStart.getDay() + 6) % 7));
      return { start, end: todayStart };
    }
    if (period === 'month') return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: todayStart };
    if (period === '90days') return { start: addDays(todayStart, -89), end: todayStart };
    if (period === 'year') return { start: new Date(today.getFullYear(), 0, 1), end: todayStart };
    let start = customStart ? parseDate(customStart) : addDays(todayStart, -29);
    let end = customEnd ? parseDate(customEnd) : todayStart;
    if (start.getTime() > end.getTime()) [start, end] = [end, start];
    return { start, end };
  }, [period, customStart, customEnd]);

  const previousRange = useMemo(() => {
    const length = Math.max(1, dayDistance(range.start, range.end) + 1);
    const end = addDays(range.start, -1);
    return { start: addDays(end, -(length - 1)), end };
  }, [range]);

  const currentStartKey = dateKey(range.start);
  const currentEndKey = dateKey(range.end);
  const previousStartKey = dateKey(previousRange.start);
  const previousEndKey = dateKey(previousRange.end);
  const currentSessions = useMemo(() => filteredSessions.filter(item => {
    const key = dateKey(new Date(item.started_at));
    return key >= currentStartKey && key <= currentEndKey;
  }), [filteredSessions, currentStartKey, currentEndKey]);
  const previousSessions = useMemo(() => filteredSessions.filter(item => {
    const key = dateKey(new Date(item.started_at));
    return key >= previousStartKey && key <= previousEndKey;
  }), [filteredSessions, previousStartKey, previousEndKey]);

  const currentTotal = sessionsTotal(currentSessions);
  const previousTotal = sessionsTotal(previousSessions);
  const daysInRange = Math.max(1, dayDistance(range.start, range.end) + 1);
  const averagePerDay = currentTotal / daysInRange;
  const studyDayCount = new Set(currentSessions.map(item => dateKey(new Date(item.started_at)))).size;
  const delta = currentTotal - previousTotal;
  const changePercent = previousTotal > 0 ? Math.round(delta / previousTotal * 100) : null;
  const uniqueSubjects = useMemo(() => Array.from(new Set(sessions.map(item => item.subject_name).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ja')), [sessions]);

  const dayTotals = useMemo(() => {
    const map = new Map<string, number>();
    filteredSessions.forEach(item => {
      const key = dateKey(new Date(item.started_at));
      map.set(key, (map.get(key) || 0) + Math.max(0, Number(item.focus_seconds) || 0));
    });
    return map;
  }, [filteredSessions]);

  const trend = useMemo(() => {
    const length = daysInRange;
    const mode = period === 'year' || length > 180 ? 'month' : period === '90days' || length > 42 ? 'week' : 'day';
    const buckets: { label: string; startKey: string; endKey: string; seconds: number }[] = [];
    if (mode === 'month') {
      let cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
      while (cursor.getTime() <= range.end.getTime()) {
        const start = new Date(cursor);
        const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
        const clippedStart = start < range.start ? range.start : start;
        const clippedEnd = end > range.end ? range.end : end;
        let seconds = 0;
        for (let date = new Date(clippedStart); date <= clippedEnd; date = addDays(date, 1)) seconds += dayTotals.get(dateKey(date)) || 0;
        buckets.push({ label: cursor.toLocaleDateString('ja-JP', { month: 'short' }), startKey: dateKey(clippedStart), endKey: dateKey(clippedEnd), seconds });
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
    } else if (mode === 'week') {
      let cursor = new Date(range.start);
      while (cursor <= range.end) {
        const start = new Date(cursor);
        const end = addDays(start, 6) > range.end ? range.end : addDays(start, 6);
        let seconds = 0;
        for (let date = new Date(start); date <= end; date = addDays(date, 1)) seconds += dayTotals.get(dateKey(date)) || 0;
        buckets.push({ label: formatDate(dateKey(start)), startKey: dateKey(start), endKey: dateKey(end), seconds });
        cursor = addDays(end, 1);
      }
    } else {
      for (let date = new Date(range.start); date <= range.end; date = addDays(date, 1)) {
        const key = dateKey(date);
        buckets.push({ label: date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }), startKey: key, endKey: key, seconds: dayTotals.get(key) || 0 });
      }
    }
    return buckets;
  }, [daysInRange, period, range, dayTotals]);
  const trendMax = Math.max(1, ...trend.map(item => item.seconds));

  const subjectTotals = useMemo(() => {
    const map = new Map<string, number>();
    currentSessions.forEach(item => map.set(item.subject_name || 'その他', (map.get(item.subject_name || 'その他') || 0) + Math.max(0, Number(item.focus_seconds) || 0)));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [currentSessions]);
  const subjectSum = sessionsTotal(currentSessions);
  const donutGradient = useMemo(() => {
    if (!subjectTotals.length || subjectSum <= 0) return 'conic-gradient(#64748b 0deg 360deg)';
    let angle = 0;
    const parts = subjectTotals.map(([name, seconds], index) => {
      const next = angle + seconds / subjectSum * 360;
      const part = SUBJECT_COLORS[index % SUBJECT_COLORS.length] + ' ' + angle.toFixed(2) + 'deg ' + next.toFixed(2) + 'deg';
      angle = next;
      return part;
    });
    return 'conic-gradient(' + parts.join(', ') + ')';
  }, [subjectTotals, subjectSum]);

  const weekdayStats = useMemo(() => {
    const totals = Array.from({ length: 7 }, () => 0);
    const counts = Array.from({ length: 7 }, () => 0);
    for (let date = new Date(range.start); date <= range.end; date = addDays(date, 1)) {
      const index = (date.getDay() + 6) % 7;
      counts[index] += 1;
      totals[index] += dayTotals.get(dateKey(date)) || 0;
    }
    return totals.map((seconds, index) => ({ label: WEEKDAYS[index], seconds, average: counts[index] ? seconds / counts[index] : 0, days: counts[index] }));
  }, [range, dayTotals]);
  const weekdayMax = Math.max(1, ...weekdayStats.map(item => item.average));

  const hourStats = useMemo(() => {
    const totals = Array.from({ length: 24 }, () => 0);
    currentSessions.forEach(item => { totals[new Date(item.started_at).getHours()] += Math.max(0, Number(item.focus_seconds) || 0); });
    return totals.map((seconds, hour) => ({ hour, seconds }));
  }, [currentSessions]);
  const hourMax = Math.max(1, ...hourStats.map(item => item.seconds));

  const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const monthLength = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const monthOffset = (monthStart.getDay() + 6) % 7;
  const calendarCells = Array.from({ length: 42 }, (_, index) => {
    const day = index - monthOffset + 1;
    if (day < 1 || day > monthLength) return null;
    const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
    const key = dateKey(date);
    return { day, key, seconds: dayTotals.get(key) || 0 };
  });
  const monthMax = Math.max(1, ...calendarCells.filter(Boolean).map(item => item?.seconds || 0));
  const selectedSessions = filteredSessions.filter(item => dateKey(new Date(item.started_at)) === selectedDate).sort((a, b) => a.started_at.localeCompare(b.started_at));
  const selectedSeconds = sessionsTotal(selectedSessions);
  const year = calendarMonth.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearDayCount = new Date(year, 1, 29).getMonth() === 1 ? 366 : 365;
  const yearOffset = (yearStart.getDay() + 6) % 7;
  const heatmapStart = addDays(yearStart, -yearOffset);
  const yearDays = Array.from({ length: Math.ceil((yearOffset + yearDayCount) / 7) * 7 }, (_, index) => {
    const date = addDays(heatmapStart, index);
    const key = dateKey(date);
    return { key, date, active: date.getFullYear() === year, seconds: dayTotals.get(key) || 0 };
  });
  const yearMax = Math.max(1, ...yearDays.filter(item => item.active).map(item => item.seconds));

  const intensityClass = (seconds: number, max: number) => {
    if (seconds <= 0) return dark ? 'bg-slate-900 border-slate-700' : 'bg-slate-100 border-slate-200';
    const ratio = seconds / max;
    if (ratio < 0.25) return dark ? 'bg-cyan-950 border-cyan-900' : 'bg-cyan-100 border-cyan-200';
    if (ratio < 0.5) return 'bg-cyan-400 border-cyan-400';
    if (ratio < 0.75) return 'bg-teal-500 border-teal-500';
    return 'bg-lime-400 border-lime-400';
  };
  const selectedPeriodLabel = period === 'week' ? '今週（月曜〜今日）' : period === 'month' ? '今月' : period === '90days' ? '直近90日' : period === 'year' ? '今年' : '選択期間';
  const previousPeriodLabel = '直前の同じ日数';
  const comparisonLabel = previousTotal > 0
    ? (changePercent === null ? '' : (delta > 0 ? '＋' : '') + changePercent + '%')
    : currentTotal > 0 ? '新しく記録' : '比較データなし';

  return <div className="space-y-4">
    <section className="relative overflow-hidden rounded-3xl border border-cyan-200/70 bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-900 p-4 text-white shadow-lg sm:p-5">
      <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 h-44 w-44 rounded-full bg-violet-500/20 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div><p className="flex items-center gap-2 text-[10px] font-black tracking-[.2em] text-cyan-200"><BarChart3 size={14}/> LEARNING ANALYTICS</p><h2 className="mt-1 text-xl font-black sm:text-2xl">学習分析ダッシュボード</h2><p className="mt-1 text-[11px] leading-5 text-white/65">時間の使い方と変化を、日・週・月・年単位で可視化。</p></div>
        <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-right backdrop-blur"><p className="text-[9px] font-bold text-cyan-100">これまでの保存記録</p><p className="text-xl font-black tabular-nums">{sessions.length.toLocaleString('ja-JP')}<span className="ml-1 text-[10px]">件</span></p></div>
      </div>
      <div className="relative mt-4 flex flex-wrap gap-2">
        {([{ id: 'week', label: '週' }, { id: 'month', label: '月' }, { id: '90days', label: '90日' }, { id: 'year', label: '年' }, { id: 'custom', label: '期間指定' }] as { id: Period; label: string }[]).map(item =>
          <button key={item.id} type="button" onClick={() => setPeriod(item.id)} className={'min-h-10 rounded-xl border px-4 text-xs font-black transition ' + (period === item.id ? 'border-white bg-white text-slate-950 shadow-lg' : 'border-white/20 bg-white/10 text-white hover:bg-white/20')}>{item.label}</button>
        )}
      </div>
      {period === 'custom' && <div className="relative mt-3 grid grid-cols-2 gap-2 rounded-xl border border-white/15 bg-black/15 p-3">
        <label className="space-y-1 text-[10px] font-bold text-white/70">開始日<input aria-label="比較期間の開始日" className="mt-1 w-full min-w-0 rounded-lg border border-white/20 bg-slate-950 px-2 py-2 text-xs text-white" type="date" value={customStart} onChange={event => setCustomStart(event.target.value)}/></label>
        <label className="space-y-1 text-[10px] font-bold text-white/70">終了日<input aria-label="比較期間の終了日" className="mt-1 w-full min-w-0 rounded-lg border border-white/20 bg-slate-950 px-2 py-2 text-xs text-white" type="date" value={customEnd} onChange={event => setCustomEnd(event.target.value)}/></label>
      </div>}
      <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-cyan-100/80">
        <span>{formatDate(currentStartKey)} 〜 {formatDate(currentEndKey)} ・ {daysInRange}日間</span>
        <label className="flex items-center gap-2 font-bold">教科<select aria-label="分析する教科" className="max-w-36 rounded-lg border border-white/20 bg-slate-950 px-2 py-2 text-xs text-white" value={subjectFilter} onChange={event => setSubjectFilter(event.target.value)}><option value="all">すべて</option>{uniqueSubjects.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      </div>
    </section>

    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <article className={panel}><p className={'text-[10px] font-bold ' + muted}>{selectedPeriodLabel}の学習時間</p><p className="mt-2 text-xl font-black tabular-nums text-cyan-600 sm:text-2xl">{formatDuration(currentTotal)}</p><p className={'mt-1 text-[9px] ' + muted}>集中時間の合計</p></article>
      <article className={panel}><p className={'text-[10px] font-bold ' + muted}>{previousPeriodLabel}との比較</p><p className={'mt-2 flex items-center gap-1 text-xl font-black tabular-nums sm:text-2xl ' + (delta > 0 ? 'text-emerald-500' : delta < 0 ? 'text-rose-500' : text)}>{delta > 0 ? <TrendingUp size={19}/> : delta < 0 ? <TrendingDown size={19}/> : null}{comparisonLabel}</p><p className={'mt-1 text-[9px] ' + muted}>{formatDuration(previousTotal)} → {formatDuration(currentTotal)}</p></article>
      <article className={panel}><p className={'text-[10px] font-bold ' + muted}>1日平均</p><p className="mt-2 text-xl font-black tabular-nums text-violet-500 sm:text-2xl">{formatDuration(averagePerDay)}</p><p className={'mt-1 text-[9px] ' + muted}>期間内の全日で平均</p></article>
      <article className={panel}><p className={'text-[10px] font-bold ' + muted}>学習した日・回数</p><p className="mt-2 text-xl font-black tabular-nums text-amber-500 sm:text-2xl">{studyDayCount}<span className="ml-1 text-xs">日</span></p><p className={'mt-1 text-[9px] ' + muted}>{currentSessions.length}セッション</p></article>
    </section>

    <section className={panel}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-black tracking-widest text-cyan-600">TIME TREND</p><h3 className={'mt-1 text-base font-black ' + text}>学習時間の推移</h3></div><span className={'text-[10px] ' + muted}>{period === 'year' || daysInRange > 180 ? '月別' : period === '90days' || daysInRange > 42 ? '週別' : '日別'}</span></div>
      {trend.length ? <div className="overflow-x-auto pb-1"><div className="flex h-48 min-w-full items-end gap-1.5" style={{ minWidth: trend.length > 14 ? trend.length * 28 + 'px' : '100%' }}>
        {trend.map(item => <div key={item.startKey} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className={'whitespace-nowrap text-[8px] font-bold ' + muted}>{item.seconds > 0 ? formatCompact(item.seconds) : '—'}</span>
          <div className={'flex h-32 w-full items-end overflow-hidden rounded-t-md ' + (dark ? 'bg-slate-900' : 'bg-slate-100')} title={item.label + ' ' + formatDuration(item.seconds)}>
            <div className="w-full rounded-t-md bg-gradient-to-t from-cyan-700 via-cyan-500 to-sky-300 transition-all" style={{ height: (item.seconds > 0 ? Math.max(4, item.seconds / trendMax * 100) : 0) + '%' }}/>
          </div><span className={'whitespace-nowrap text-[8px] font-semibold ' + muted}>{item.label}</span>
        </div>)}
      </div></div> : <p className={'py-8 text-center text-xs ' + muted}>この期間の記録はありません。</p>}
      <div className={'mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-[10px] ' + softBorder + ' ' + muted}><span>選択期間：{formatDuration(currentTotal)}</span><span>直前期間：{formatDuration(previousTotal)}</span><span>差：{delta > 0 ? '+' : delta < 0 ? '−' : ''}{formatDuration(Math.abs(delta))}</span></div>
    </section>

    <div className="grid gap-4 lg:grid-cols-2">
      <section className={panel}>
        <div className="mb-4"><p className="text-[10px] font-black tracking-widest text-violet-500">SUBJECT MIX</p><h3 className={'mt-1 text-base font-black ' + text}>教科別の学習時間</h3><p className={'mt-1 text-[10px] ' + muted}>選択した期間における教科ごとの内訳</p></div>
        {subjectTotals.length ? <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <div className="relative h-36 w-36 shrink-0 rounded-full" style={{ background: donutGradient }}><div className={'absolute inset-5 flex flex-col items-center justify-center rounded-full ' + (dark ? 'bg-slate-800' : 'bg-white')}><span className={'text-[9px] font-bold ' + muted}>合計</span><b className={'text-sm font-black ' + text}>{formatCompact(subjectSum)}</b></div></div>
          <div className="w-full min-w-0 space-y-2">{subjectTotals.map(([name, seconds], index) => <div key={name} className="flex items-center gap-2 text-xs"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SUBJECT_COLORS[index % SUBJECT_COLORS.length] }}/><span className={'min-w-0 flex-1 truncate font-bold ' + text}>{name}</span><span className={'shrink-0 text-[10px] ' + muted}>{Math.round(seconds / Math.max(1, subjectSum) * 100)}%</span><b className={'w-16 shrink-0 text-right text-[10px] tabular-nums ' + text}>{formatDuration(seconds)}</b></div>)}</div>
        </div> : <p className={'py-8 text-center text-xs ' + muted}>この期間の教科別記録はありません。</p>}
      </section>

      <section className={panel}>
        <div className="mb-4"><p className="text-[10px] font-black tracking-widest text-emerald-500">WEEKDAY PATTERN</p><h3 className={'mt-1 text-base font-black ' + text}>曜日別の平均学習時間</h3><p className={'mt-1 text-[10px] ' + muted}>各曜日が期間内に登場した日数で平均化</p></div>
        <div className="grid grid-cols-7 items-end gap-2">
          {weekdayStats.map((item, index) => <div key={item.label} className="flex min-w-0 flex-col items-center gap-2"><span className={'whitespace-nowrap text-[8px] font-bold ' + muted}>{item.average > 0 ? formatCompact(item.average) : '—'}</span><div className={'flex h-28 w-full items-end overflow-hidden rounded-lg ' + (dark ? 'bg-slate-900' : 'bg-slate-100')}><div className="w-full rounded-t-lg bg-gradient-to-t from-emerald-700 to-lime-400" style={{ height: (item.average > 0 ? Math.max(4, item.average / weekdayMax * 100) : 0) + '%' }}/></div><span className={'text-[10px] font-black ' + (index >= 5 ? 'text-rose-500' : text)}>{item.label}</span><span className={'text-[8px] ' + muted}>{item.days}日</span></div>)}
        </div>
      </section>
    </div>

    <section className={panel}>
      <div className="mb-3"><p className="text-[10px] font-black tracking-widest text-amber-500">TIME OF DAY</p><h3 className={'mt-1 text-base font-black ' + text}>時間帯別の学習量</h3><p className={'mt-1 text-[10px] ' + muted}>セッションの開始時刻をもとに集計</p></div>
      <div className="overflow-x-auto pb-1"><div className="flex min-w-[560px] items-end gap-1.5">
        {hourStats.map(item => <div key={item.hour} className="flex min-w-0 flex-1 flex-col items-center gap-1"><span className={'text-[8px] ' + muted}>{item.seconds ? formatCompact(item.seconds) : ''}</span><div className={'flex h-24 w-full items-end overflow-hidden rounded-t-md ' + (dark ? 'bg-slate-900' : 'bg-slate-100')}><div className="w-full rounded-t-md bg-gradient-to-t from-violet-700 to-fuchsia-400" style={{ height: (item.seconds > 0 ? Math.max(3, item.seconds / hourMax * 100) : 0) + '%' }}/></div><span className={'text-[8px] ' + muted}>{item.hour % 3 === 0 ? pad(item.hour) : ''}</span></div>)}
      </div></div><p className={'mt-2 text-right text-[9px] ' + muted}>時刻は日本時間の端末設定に基づきます。</p>
    </section>

    <section className={panel}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-black tracking-widest text-cyan-600">LEARNING CALENDAR</p><h3 className={'mt-1 text-base font-black ' + text}>学習カレンダー</h3><p className={'mt-1 text-[10px] ' + muted}>色が濃いほど、その日の学習時間が長くなります。</p></div><div className="flex items-center gap-1"><button type="button" aria-label="前の月" onClick={() => { const next = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); setCalendarMonth(next); setSelectedDate(dateKey(next)); }} className={'flex h-10 w-10 items-center justify-center rounded-xl border ' + softBorder}><ChevronLeft size={17}/></button><button type="button" onClick={() => { const next = new Date(); setCalendarMonth(new Date(next.getFullYear(), next.getMonth(), 1)); setSelectedDate(dateKey(next)); }} className={'h-10 rounded-xl border px-3 text-[10px] font-black ' + softBorder}>今月</button><button type="button" aria-label="次の月" onClick={() => { const next = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); setCalendarMonth(next); setSelectedDate(dateKey(next)); }} className={'flex h-10 w-10 items-center justify-center rounded-xl border ' + softBorder}><ChevronRight size={17}/></button></div></div>
      <div className="mb-3 flex items-center justify-between"><h4 className={'text-lg font-black ' + text}>{calendarMonth.getFullYear()}年 {calendarMonth.getMonth() + 1}月</h4><span className={'text-[9px] ' + muted}>月間合計 {formatDuration(calendarCells.reduce((sum, cell) => sum + (cell?.seconds || 0), 0))}</span></div>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((day, index) => <div key={day} className={'pb-1 text-center text-[10px] font-black ' + (index >= 5 ? 'text-rose-500' : muted)}>{day}</div>)}
        {calendarCells.map((cell, index) => cell ? <button key={cell.key} type="button" onClick={() => setSelectedDate(cell.key)} title={formatDate(cell.key, { year: 'numeric', month: 'long', day: 'numeric' }) + ' ・ ' + formatDuration(cell.seconds)} aria-label={formatDate(cell.key) + ' ' + formatDuration(cell.seconds)} aria-pressed={selectedDate === cell.key} className={'relative flex min-h-11 flex-col items-center justify-center rounded-lg border text-xs font-bold transition ' + intensityClass(cell.seconds, monthMax) + (selectedDate === cell.key ? ' ring-2 ring-cyan-500 ring-offset-1 ' + (dark ? 'ring-offset-slate-800' : 'ring-offset-white') : '')}><span className={cell.seconds > 0 && cell.seconds / monthMax > 0.35 ? 'text-slate-950' : text}>{cell.day}</span>{cell.seconds > 0 && <span className="mt-0.5 text-[7px] font-black text-slate-800">{Math.round(cell.seconds / 60)}m</span>}</button> : <div key={'blank-' + index} className="min-h-11 rounded-lg opacity-0"/>)}
      </div>
      <div className={'mt-3 flex flex-wrap items-center justify-between gap-2 text-[9px] ' + muted}><span>選択した日をタップすると、下に詳細を表示します。</span><span className="flex items-center gap-1">少ない <i className="h-3 w-3 rounded-sm bg-slate-200"/> <i className="h-3 w-3 rounded-sm bg-cyan-300"/> <i className="h-3 w-3 rounded-sm bg-teal-500"/> <i className="h-3 w-3 rounded-sm bg-lime-400"/> 多い</span></div>
      <div className={'mt-4 rounded-2xl border p-3 ' + softBorder + ' ' + inset}>
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className={'text-[9px] font-bold ' + muted}>選択した日</p><h4 className={'text-base font-black ' + text}>{formatDate(selectedDate, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</h4></div><p className="text-lg font-black tabular-nums text-cyan-600">{formatDuration(selectedSeconds)}</p></div>
        {selectedSessions.length ? <div className="mt-3 space-y-2">{selectedSessions.map(item => <article key={item.id} className={'rounded-xl border p-3 ' + softBorder + (dark ? ' bg-slate-800' : ' bg-white')}><div className="flex flex-wrap items-center justify-between gap-2"><b className={'text-xs ' + text}>{item.subject_name} ・ {item.task_title || '学習'}</b><b className="text-xs font-black text-cyan-600">{formatDuration(item.focus_seconds)}</b></div><p className={'mt-1 text-[9px] ' + muted}>{new Date(item.started_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}開始 ・ 休憩 {formatDuration(item.break_seconds || 0)}</p>{item.reflection && <p className={'mt-2 whitespace-pre-wrap text-[11px] leading-5 ' + text}>{item.reflection}</p>}{item.next_action && <p className={'mt-2 whitespace-pre-wrap text-[10px] leading-5 ' + muted}>次にやること：{item.next_action}</p>}</article>)}</div> : <p className={'mt-3 text-xs ' + muted}>この日の学習記録はありません。</p>}
      </div>
    </section>

    <section className={panel}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-black tracking-widest text-emerald-500">YEAR AT A GLANCE</p><h3 className={'mt-1 text-base font-black ' + text}>{year}年の年間ヒートマップ</h3><p className={'mt-1 text-[10px] ' + muted}>1年間の学習の積み重ねを一覧できます。</p></div><span className={'rounded-full px-3 py-1 text-[9px] font-black ' + (dark ? 'bg-emerald-950 text-emerald-300' : 'bg-emerald-50 text-emerald-700')}>{yearDays.filter(item => item.active && item.seconds > 0).length}日 学習</span></div>
      <div className="overflow-x-auto pb-2"><div className="min-w-max">
        <div className={'mb-2 flex justify-between pl-8 pr-1 text-[9px] ' + muted}><span>1月</span><span>4月</span><span>7月</span><span>10月</span><span>12月</span></div>
        <div className="flex gap-2"><div className={'flex h-[95px] flex-col justify-between py-0.5 text-[8px] ' + muted}><span>月</span><span>水</span><span>金</span><span>日</span></div><div className="grid" style={{ gridAutoFlow: 'column', gridTemplateRows: 'repeat(7, 11px)', gridAutoColumns: '11px', gap: '3px' }}>
          {yearDays.map(item => item.active ? <button key={item.key} type="button" onClick={() => { setCalendarMonth(new Date(year, item.date.getMonth(), 1)); setSelectedDate(item.key); }} title={formatDate(item.key, { month: 'long', day: 'numeric' }) + ' ・ ' + formatDuration(item.seconds)} aria-label={formatDate(item.key) + ' ' + formatDuration(item.seconds)} className={'h-[11px] w-[11px] rounded-[3px] border ' + intensityClass(item.seconds, yearMax)}/> : <span key={item.key} className="h-[11px] w-[11px]"/>)}
        </div></div>
      </div></div>
      <div className={'mt-2 text-[9px] ' + muted}>年間カレンダーの日付を選ぶと、上の月間カレンダーと日別詳細が連動します。</div>
    </section>

    <section className="rounded-2xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
      <div className="flex items-start gap-2"><Clock3 size={16} className="mt-0.5 shrink-0 text-cyan-600"/><p className={'text-[10px] leading-5 ' + muted}>分析は保存済みの集中時間を集計しています。過去の記録がない期間を0分として扱い、記録がない日と学習時間0分の日を混同しないようにしています。学習セッションの開始時刻に基づいて日付・曜日・時間帯を分類します。</p></div>
    </section>
  </div>;
}
