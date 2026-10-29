'use client';

import React, { useEffect, useState } from 'react';
import { CalendarClock, ChevronRight, CalendarDays, RefreshCw } from 'lucide-react';

type CountdownEvent = {
  id: string;
  title: string;
  summary: string;
  event_date: string;
  is_active: boolean;
};

type Props = {
  mode: 'dashboard' | 'list';
  onViewAll?: () => void;
};

function tokyoToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return String(values.year) + '-' + String(values.month) + '-' + String(values.day);
}

function daysUntil(dateKey: string): number {
  const a = dateKey.split('-').map(Number);
  const b = tokyoToday().split('-').map(Number);
  return Math.round((Date.UTC(a[0], a[1] - 1, a[2]) - Date.UTC(b[0], b[1] - 1, b[2])) / 86400000);
}

function formatDate(dateKey: string): string {
  const parts = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
}

export default function CountdownEventWidget({ mode, onViewAll }: Props) {
  const [events, setEvents] = useState<CountdownEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMessage('');
    fetch('/api/school-countdowns', { cache: 'no-store' })
      .then(async response => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || 'イベントを取得できませんでした。');
        return result;
      })
      .then(result => {
        if (cancelled) return;
        const rows = Array.isArray(result.events) ? result.events as CountdownEvent[] : [];
        setEvents(rows.filter(event => event.is_active && daysUntil(event.event_date) >= 0)
          .sort((a, b) => a.event_date.localeCompare(b.event_date)));
      })
      .catch(error => {
        if (cancelled) return;
        setEvents([]);
        setErrorMessage(error instanceof Error ? error.message : 'イベントを取得できませんでした。');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const eventCard = (event: CountdownEvent, prominent: boolean) => {
    const remaining = daysUntil(event.event_date);
    return (
      <article key={event.id} className={'overflow-hidden rounded-2xl border ' + (prominent ? 'border-indigo-200 bg-white shadow-lg shadow-indigo-100' : 'border-slate-200 bg-white shadow-sm')}>
        <div className={'p-4 sm:p-5 ' + (prominent ? 'bg-gradient-to-br from-indigo-700 via-blue-700 to-cyan-600 text-white' : 'bg-slate-50 text-slate-900')}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className={'text-[10px] font-black uppercase tracking-[0.18em] ' + (prominent ? 'text-cyan-100' : 'text-slate-500')}>SCHOOL EVENT COUNTDOWN</p>
              <h3 className={'mt-2 break-words text-lg font-black leading-snug ' + (prominent ? 'text-white sm:text-2xl' : 'text-slate-900')}>{event.title}</h3>
            </div>
            <div className={'min-w-[82px] rounded-2xl px-3 py-2 text-center ' + (prominent ? 'bg-white/15 ring-1 ring-white/20' : 'bg-indigo-100')}>
              <p className={'text-[10px] font-bold ' + (prominent ? 'text-indigo-100' : 'text-indigo-700')}>{remaining === 0 ? 'TODAY' : 'あと'}</p>
              <p className={'mt-0.5 font-black leading-none ' + (prominent ? 'text-white' : 'text-indigo-800')}>
                <span className="text-3xl">{remaining}</span><span className="ml-1 text-xs">{remaining === 0 ? '日目' : '日'}</span>
              </p>
            </div>
          </div>
          <div className={'mt-4 flex items-center gap-2 text-xs font-bold ' + (prominent ? 'text-cyan-50' : 'text-slate-600')}>
            <CalendarDays size={15} />
            <time dateTime={event.event_date}>{formatDate(event.event_date)}</time>
          </div>
        </div>
        {event.summary ? <div className={'whitespace-pre-wrap break-words p-4 text-sm leading-6 ' + (prominent ? 'text-slate-700' : 'text-slate-600')}>{event.summary}</div> : <div className="p-4 text-xs text-slate-400">イベント概要は登録されていません。</div>}
      </article>
    );
  };

  if (mode === 'dashboard') {
    const nearest = events[0];
    return (
      <section className="space-y-3" aria-label="学校イベントのカウントダウン">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[17px] font-black text-slate-900"><CalendarClock size={20} className="text-indigo-600" />学校イベントのカウントダウン</h2>
          <button type="button" onClick={() => setRefreshKey(value => value + 1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="カウントダウンを更新"><RefreshCw size={15} /></button>
        </div>
        {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">イベントを読み込み中...</div>
          : errorMessage ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{errorMessage}</div>
          : nearest ? eventCard(nearest, true)
          : <div className="rounded-2xl border border-dashed border-indigo-200 bg-white p-5"><p className="font-bold text-slate-700">現在、公開中のカウントダウンイベントはありません。</p><p className="mt-1 text-xs text-slate-500">イベントが登録されると、ここに直近の予定が表示されます。</p></div>}
        <div className="flex justify-end">
          <button type="button" onClick={onViewAll} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-50">他のカウントダウンを見る <ChevronRight size={15} /></button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900"><CalendarClock className="text-indigo-600" />学校イベントのカウントダウン</h2>
          <p className="mt-1 text-sm text-slate-500">開催日が近い順に表示しています。</p>
        </div>
        <button type="button" onClick={() => setRefreshKey(value => value + 1)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><RefreshCw size={14} />更新</button>
      </div>
      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">イベントを読み込み中...</div>
        : errorMessage ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{errorMessage}</div>
        : events.length ? <div className="grid gap-4 md:grid-cols-2">{events.map(event => eventCard(event, false))}</div>
        : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">現在、公開中のカウントダウンイベントはありません。</div>}
    </div>
  );
}
