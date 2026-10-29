'use client';

import React, { useEffect, useState } from 'react';
import { CalendarDays, Plus, Trash2, Send, Save, CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react';

type ScheduleItem = { id: string; time: string; title: string; location: string; details: string };
type ScheduleDay = { date: string; dayLabel: string; isHoliday: boolean; holidayName: string; isWeekendSchool?: boolean; items: ScheduleItem[] };
type SchedulePayload = { week_start: string; title: string; days: ScheduleDay[] };
type Props = { adminPassword: string; onAdminPasswordChange: (value: string) => void };

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

function addDays(dateKey: string, amount: number): string {
  const parts = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + amount));
  return date.toISOString().slice(0, 10);
}

function mondayOf(dateKey: string): string {
  const parts = dateKey.split('-').map(Number);
  const day = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
  return addDays(dateKey, -((day + 6) % 7));
}

function tokyoToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return String(values.year) + '-' + String(values.month) + '-' + String(values.day);
}

function nextMonday(): string {
  const today = tokyoToday();
  return addDays(mondayOf(today), 7);
}

function newItem(): ScheduleItem {
  return { id: 'event-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8), time: '', title: '', location: '', details: '' };
}

function emptyDays(weekStart: string): ScheduleDay[] {
  return WEEKDAYS.map((label, index) => ({
    date: addDays(weekStart, index),
    dayLabel: label,
    isHoliday: false,
    holidayName: '',
    isWeekendSchool: false,
    items: [newItem()],
  }));
}

function normalizeDays(weekStart: string, raw: unknown): ScheduleDay[] {
  const base = emptyDays(weekStart);
  if (!Array.isArray(raw)) return base;
  return base.map((day, index) => {
    const incoming = raw[index] as Partial<ScheduleDay> | undefined;
    const incomingItems = Array.isArray(incoming?.items) ? incoming?.items as ScheduleItem[] : [];
    const items = incomingItems.map(item => ({
      id: String(item?.id || newItem().id),
      time: String(item?.time || ''),
      title: String(item?.title || ''),
      location: String(item?.location || ''),
      details: String(item?.details || ''),
    }));
    return {
      ...day,
      isHoliday: incoming?.isHoliday === true,
      holidayName: String(incoming?.holidayName || ''),
      items: items.length ? items : [newItem()],
    };
  });
}

function formatRange(weekStart: string): string {
  const end = addDays(weekStart, 6);
  return weekStart.replace(/-/g, '/') + ' 〜 ' + end.replace(/-/g, '/');
}

export default function SchoolScheduleAdmin({ adminPassword, onAdminPasswordChange }: Props) {
  const [weekStart, setWeekStart] = useState(nextMonday);
  const [weekTitle, setWeekTitle] = useState('学校予定表');
  const [days, setDays] = useState<ScheduleDay[]>(() => emptyDays(nextMonday()));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  const loadSchedule = async (start: string) => {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/school-schedule?weekStart=' + encodeURIComponent(start), { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || '予定表を取得できませんでした。');
      const saved = result?.schedule as SchedulePayload | null;
      if (saved) {
        setWeekTitle(String(saved.title || '学校予定表'));
        setDays(normalizeDays(start, saved.days));
        setMessage('保存済みの週予定表を読み込みました。');
      } else {
        setWeekTitle('学校予定表');
        setDays(emptyDays(start));
        setMessage('この週の予定表は未登録です。各日の予定を入力して保存してください。');
      }
    } catch (error) {
      setDays(emptyDays(start));
      setMessage(error instanceof Error ? error.message : '予定表を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadSchedule(weekStart); }, [weekStart]);

  const changeWeek = (start: string) => {
    setWeekStart(mondayOf(start));
    setMessage('');
  };

  const updateDay = (index: number, patch: Partial<ScheduleDay>) => {
    setDays(current => current.map((day, dayIndex) => dayIndex === index ? { ...day, ...patch } : day));
  };

  const updateItem = (dayIndex: number, itemId: string, patch: Partial<ScheduleItem>) => {
    setDays(current => current.map((day, index) => index !== dayIndex ? day : {
      ...day,
      items: day.items.map(item => item.id === itemId ? { ...item, ...patch } : item),
    }));
  };

  const saveSchedule = async (): Promise<boolean> => {
    if (!adminPassword.trim()) {
      setMessage('Admin用パスワードを入力してください。');
      return false;
    }
    if (weekTitle.trim().length > 100) {
      setMessage('週タイトルは100文字以内にしてください。');
      return false;
    }
    const payload = {
      weekStart,
      title: weekTitle.trim() || '学校予定表',
      days: days.map(day => ({
        ...day,
        items: day.items.filter(item => item.title.trim() || item.details.trim() || item.time.trim() || item.location.trim()),
      })),
    };
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/school-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) throw new Error(result?.message || ('保存に失敗しました（HTTP ' + response.status + '）。'));
      setDays(normalizeDays(weekStart, result.schedule?.days || payload.days));
      setMessage('予定表を保存しました。生徒用サイトに反映されます。');
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '予定表を保存できませんでした。');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const sendSchedule = async () => {
    if (sending || saving) return;
    if (!window.confirm(formatRange(weekStart) + ' の学校予定表をLINE公式アカウントと配信設定済みグループへ送信します。続行しますか？')) return;
    setSending(true);
    setMessage('');
    try {
      const saved = await saveSchedule();
      if (!saved) return;
      const response = await fetch('/api/line-weekly-school-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ mode: 'manual', weekStart }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) throw new Error(result?.message || ('LINE送信に失敗しました（HTTP ' + response.status + '）。'));
      setMessage(result.message || '学校予定表をLINEへ送信しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'LINE送信に失敗しました。');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black"><CalendarCheck className="text-cyan-400" /> 週間学校予定表</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">月曜日〜日曜日を1週間として保存します。土日は基本休日として表示され、休日登校がある場合は切り替えられます。祝日設定や日ごとの予定追加もできます。</p>
        </div>
      </div>

      <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-5 sm:p-6">
        <label className="block text-xs font-bold text-slate-300">
          Admin用パスワード
          <input type="password" autoComplete="current-password" value={adminPassword} onChange={event => onAdminPasswordChange(event.target.value)} placeholder="VercelのCAMPUS_SYNC_ADMIN_PASSWORD" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-500" />
        </label>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
          <label className="block text-xs font-bold text-slate-300">
            週の開始日（月曜日）
            <input type="date" value={weekStart} onChange={event => event.target.value && changeWeek(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-500" />
          </label>
          <label className="block text-xs font-bold text-slate-300">
            週タイトル
            <input value={weekTitle} onChange={event => setWeekTitle(event.target.value)} maxLength={100} placeholder="学校予定表" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-500" />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-900 p-3">
          <button type="button" onClick={() => changeWeek(addDays(weekStart, -7))} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold hover:bg-slate-800"><ChevronLeft size={15} /> 前の週</button>
          <p className="text-center text-xs font-bold text-slate-300">{formatRange(weekStart)}</p>
          <button type="button" onClick={() => changeWeek(addDays(weekStart, 7))} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold hover:bg-slate-800">次の週 <ChevronRight size={15} /></button>
        </div>
      </section>

      {loading ? <p className="rounded-xl bg-slate-950 p-5 text-sm text-slate-400">予定表を読み込み中...</p> : (
        <div className="space-y-4">
          {days.map((day, dayIndex) => (
            <section key={day.date} className={'rounded-2xl border p-4 sm:p-5 ' + (day.isHoliday ? 'border-rose-800/70 bg-rose-950/20' : dayIndex >= 5 && !day.isWeekendSchool ? 'border-slate-700 bg-slate-900/70' : 'border-slate-800 bg-slate-950')}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-white">{day.dayLabel}曜日 <span className="ml-1 text-xs font-medium text-slate-400">{day.date}</span></h3>
                  {day.isHoliday && <span className="mt-1 inline-flex rounded-full bg-rose-500/15 px-2 py-1 text-[10px] font-black text-rose-300">祝日・休校日</span>}
                  {dayIndex >= 5 && !day.isHoliday && <span className={'mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-black ' + (day.isWeekendSchool ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700 text-slate-300')}>{day.isWeekendSchool ? '休日登校日' : '基本休日'}</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => updateDay(dayIndex, { isHoliday: !day.isHoliday, holidayName: day.isHoliday ? '' : day.holidayName, isWeekendSchool: false })} className={'rounded-xl border px-3 py-2 text-xs font-black ' + (day.isHoliday ? 'border-rose-500/50 bg-rose-500/10 text-rose-200' : 'border-slate-700 text-slate-300 hover:bg-slate-900')}>
                    {day.isHoliday ? '祝日設定を解除' : '祝日にする'}
                  </button>
                  {dayIndex >= 5 && !day.isHoliday && <button type="button" onClick={() => updateDay(dayIndex, { isWeekendSchool: !day.isWeekendSchool })} className={'rounded-xl border px-3 py-2 text-xs font-black ' + (day.isWeekendSchool ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-300 hover:bg-slate-900')}>
                    {day.isWeekendSchool ? '休日登校を解除' : '休日登校にする'}
                  </button>}
                </div>
              </div>
              {day.isHoliday && (
                <label className="mb-4 block text-xs font-bold text-slate-300">
                  祝日名・休校理由（任意）
                  <input value={day.holidayName} onChange={event => updateDay(dayIndex, { holidayName: event.target.value })} maxLength={100} placeholder="例：文化の日／創立記念日" className="mt-1 w-full rounded-xl border border-rose-900/60 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-rose-500" />
                </label>
              )}
              <div className="space-y-3">
                {day.items.map((item, itemIndex) => (
                  <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-slate-300">予定 {itemIndex + 1}</p>
                      <button type="button" aria-label="予定を削除" onClick={() => updateDay(dayIndex, { items: day.items.filter(value => value.id !== item.id) })} disabled={day.items.length <= 1} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-rose-300 hover:bg-rose-950 disabled:opacity-30"><Trash2 size={13} /> 削除</button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[130px_1fr_1fr]">
                      <label className="text-[11px] font-bold text-slate-400">時刻（任意）<input value={item.time} onChange={event => updateItem(dayIndex, item.id, { time: event.target.value })} maxLength={30} placeholder="例：08:30" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500" /></label>
                      <label className="text-[11px] font-bold text-slate-400">予定・行事名<input value={item.title} onChange={event => updateItem(dayIndex, item.id, { title: event.target.value })} maxLength={120} placeholder="例：全校朝礼" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500" /></label>
                      <label className="text-[11px] font-bold text-slate-400">場所（任意）<input value={item.location} onChange={event => updateItem(dayIndex, item.id, { location: event.target.value })} maxLength={100} placeholder="例：体育館" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500" /></label>
                    </div>
                    <label className="mt-3 block text-[11px] font-bold text-slate-400">詳細（任意）<textarea value={item.details} onChange={event => updateItem(dayIndex, item.id, { details: event.target.value })} maxLength={800} rows={2} placeholder="集合時間、持ち物、注意事項など" className="mt-1 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm leading-5 text-white outline-none focus:border-cyan-500" /></label>
                  </div>
                ))}
                <button type="button" onClick={() => updateDay(dayIndex, { items: [...day.items, newItem()] })} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-cyan-700/70 px-3 py-2 text-xs font-black text-cyan-300 hover:bg-cyan-950/40"><Plus size={15} /> この日に予定を追加</button>
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="sticky bottom-3 z-10 flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-950/95 p-3 backdrop-blur">
        <button type="button" onClick={() => void saveSchedule()} disabled={loading || saving || sending} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-500 disabled:opacity-50"><Save size={16} /> {saving ? '保存中...' : '予定表を保存'}</button>
        <button type="button" onClick={() => void sendSchedule()} disabled={loading || saving || sending} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-50"><Send size={16} /> {sending ? 'LINE送信中...' : 'この週をLINEへ手動送信'}</button>
      </div>
      {message && <p role="status" className={'rounded-xl border p-3 text-xs leading-5 ' + (message.includes('失敗') || message.includes('入力してください') || message.includes('正しく') ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100')}>{message}</p>}
      <p className="text-[10px] leading-5 text-slate-500">自動配信は毎週日曜日の9:00（日本時間）に、翌月曜日〜日曜日の予定表を送ります。週予定表の保存後、すぐ生徒用サイトに反映されます。</p>
    </div>
  );
}
