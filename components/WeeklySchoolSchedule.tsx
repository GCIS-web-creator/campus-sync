'use client';

import React, { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Clock, CalendarCheck } from 'lucide-react';

type ScheduleItem = { id: string; time: string; title: string; location: string; details: string };
type ScheduleDay = { date: string; dayLabel: string; isHoliday: boolean; holidayName: string; items: ScheduleItem[] };
type SchedulePayload = { week_start: string; title: string; days: ScheduleDay[] };

function addDays(dateKey: string, amount: number): string {
  const parts = dateKey.split('-').map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + amount)).toISOString().slice(0, 10);
}
function mondayOf(dateKey: string): string {
  const parts = dateKey.split('-').map(Number);
  const day = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
  return addDays(dateKey, -((day + 6) % 7));
}
function tokyoToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return String(values.year) + '-' + String(values.month) + '-' + String(values.day);
}
function formatRange(weekStart: string): string {
  return weekStart.replace(/-/g, '/') + ' 〜 ' + addDays(weekStart, 6).replace(/-/g, '/');
}

export default function WeeklySchoolSchedule() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(tokyoToday()));
  const [schedule, setSchedule] = useState<SchedulePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const dayNames = ['月', '火', '水', '木', '金', '土', '日'];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMessage('');
    fetch('/api/school-schedule?weekStart=' + encodeURIComponent(weekStart), { cache: 'no-store' })
      .then(async response => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result?.message || '学校予定表を取得できませんでした。');
        return result;
      })
      .then(result => {
        if (cancelled) return;
        setSchedule(result.schedule || null);
      })
      .catch(error => {
        if (cancelled) return;
        setSchedule(null);
        setErrorMessage(error instanceof Error ? error.message : '学校予定表を取得できませんでした。');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [weekStart]);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900"><CalendarCheck className="text-cyan-700" /> 学校予定表</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">月曜日〜日曜日の1週間の行事・連絡を確認できます。</p>
        </div>
        <span className="shrink-0 rounded-xl bg-cyan-50 px-3 py-2 text-[10px] font-black text-cyan-800">週間予定</span>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <button type="button" aria-label="前の週" onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ChevronLeft size={18} /></button>
        <div className="min-w-0 text-center">
          <p className="text-xs font-black text-slate-800">{formatRange(weekStart)}</p>
          <p className="mt-1 truncate text-[10px] text-slate-500">{schedule?.title || '学校予定表'}</p>
        </div>
        <button type="button" aria-label="次の週" onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ChevronRight size={18} /></button>
      </div>
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">学校予定表を読み込み中...</div>
      ) : errorMessage ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{errorMessage}</div>
      ) : !schedule ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <CalendarDays className="mx-auto text-slate-300" size={30} />
          <p className="mt-3 text-sm font-black text-slate-700">この週の予定表はまだありません</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">学校から予定表が公開されると、ここに表示されます。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dayNames.map((label, index) => {
            const date = addDays(weekStart, index);
            const day = schedule.days?.find(item => item.date === date);
            const items = (day?.items || []).filter(item => item.title || item.details || item.time || item.location);
            return (
              <section key={date} className={'overflow-hidden rounded-2xl border bg-white shadow-sm ' + (day?.isHoliday ? 'border-rose-200' : 'border-slate-200')}>
                <div className={'flex items-center justify-between gap-3 px-4 py-3 ' + (day?.isHoliday ? 'bg-rose-50' : 'bg-slate-50')}>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-slate-900">{label}曜日 <span className="ml-1 text-[10px] font-medium text-slate-500">{date}</span></h3>
                    {day?.isHoliday && <p className="mt-1 text-[10px] font-black text-rose-700">祝日・休校日{day.holidayName ? '：' + day.holidayName : ''}</p>}
                  </div>
                  {day?.isHoliday && <span className="shrink-0 rounded-full bg-rose-100 px-2 py-1 text-[10px] font-black text-rose-700">祝日</span>}
                </div>
                <div className="space-y-2 p-3">
                  {items.length ? items.map(item => (
                    <div key={item.id} className="rounded-xl border border-slate-100 bg-white p-3">
                      <div className="flex items-start gap-2">
                        {item.time ? <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-800"><Clock size={11} />{item.time}</span> : null}
                        <p className="min-w-0 flex-1 text-sm font-black leading-5 text-slate-800">{item.title || '予定'}</p>
                      </div>
                      {item.location ? <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-500"><MapPin size={11} />{item.location}</p> : null}
                      {item.details ? <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{item.details}</p> : null}
                    </div>
                  )) : <p className="py-2 text-center text-xs text-slate-400">{day?.isHoliday ? '祝日・休校日です。' : '登録された予定はありません。'}</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
