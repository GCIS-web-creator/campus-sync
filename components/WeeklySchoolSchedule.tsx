'use client';

import React, { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Clock, CalendarCheck, Plus, BookOpen } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type ScheduleItem = { id: string; time: string; title: string; location: string; details: string };
type ScheduleDay = { date: string; dayLabel: string; isHoliday: boolean; holidayName: string; isWeekendSchool?: boolean; items: ScheduleItem[] };
type SchedulePayload = { week_start: string; title: string; days: ScheduleDay[] };
type MiniTestEvent = { id: string; subject: string; title: string; test_date: string; scope: string; notes: string; audience: 'school' | 'personal'; source: string };

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
  const [miniTests, setMiniTests] = useState<MiniTestEvent[]>([]);
  const [miniTestLoading, setMiniTestLoading] = useState(false);
  const [miniTestSaving, setMiniTestSaving] = useState(false);
  const [miniTestMessage, setMiniTestMessage] = useState('');
  const [testSubject, setTestSubject] = useState('英コミュ');
  const [testTitle, setTestTitle] = useState('');
  const [testDate, setTestDate] = useState(() => tokyoToday());
  const [testScope, setTestScope] = useState('');
  const [testNotes, setTestNotes] = useState('');
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
      .then(result => { if (!cancelled) setSchedule(result.schedule || null); })
      .catch(error => {
        if (cancelled) return;
        setSchedule(null);
        setErrorMessage(error instanceof Error ? error.message : '学校予定表を取得できませんでした。');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [weekStart]);

  useEffect(() => {
    let cancelled = false;
    setMiniTestLoading(true);
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (!cancelled) { setMiniTests([]); setMiniTestMessage('小テスト予定の表示・登録には生徒ログインが必要です。'); }
        return;
      }
      const response = await fetch('/api/mini-tests?from=' + encodeURIComponent(weekStart) + '&to=' + encodeURIComponent(addDays(weekStart, 6)), {
        headers: { Authorization: 'Bearer ' + token }, cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || '小テスト予定を取得できませんでした。');
      if (!cancelled) { setMiniTests(result.events || []); setMiniTestMessage(''); }
    })().catch(error => {
      if (!cancelled) setMiniTestMessage(error instanceof Error ? error.message : '小テスト予定を取得できませんでした。');
    }).finally(() => { if (!cancelled) setMiniTestLoading(false); });
    return () => { cancelled = true; };
  }, [weekStart]);

  const addMiniTest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (miniTestSaving || !testTitle.trim()) return;
    setMiniTestSaving(true);
    setMiniTestMessage('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('生徒ログインが必要です。');
      const response = await fetch('/api/mini-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ subject: testSubject, title: testTitle.trim(), test_date: testDate, scope: testScope, notes: testNotes }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || '小テスト予定を保存できませんでした。');
      if (result.event.test_date >= weekStart && result.event.test_date <= addDays(weekStart, 6)) {
        setMiniTests(current => [...current, result.event].sort((a, b) => a.test_date.localeCompare(b.test_date)));
      }
      setTestTitle('');
      setTestScope('');
      setTestNotes('');
      setMiniTestMessage('自分用の小テスト予定を登録しました。');
    } catch (error) {
      setMiniTestMessage(error instanceof Error ? error.message : '登録に失敗しました。');
    } finally { setMiniTestSaving(false); }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900"><CalendarCheck className="text-cyan-700" /> 学校予定表</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">月曜日〜日曜日の1週間の行事・連絡・小テストを確認できます。</p>
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

      <form onSubmit={addMiniTest} className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50 p-4">
        <div className="flex items-center gap-2"><BookOpen size={18} className="text-violet-700" /><h3 className="text-sm font-black text-violet-950">自分の小テスト予定を追加</h3></div>
        <p className="text-[11px] leading-5 text-violet-800">ここで登録した予定は自分だけに表示されます。LINEからの登録は先生の承認後に学校全体へ公開されます。</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-700">教科
            <select value={testSubject} onChange={event => setTestSubject(event.target.value)} className="mt-1 w-full rounded-lg border border-violet-200 bg-white p-2.5 text-sm">
              {['国語演習','古典探求','物理','生物','数３','数C','公共','英コミュ','論表','情報','保健','その他'].map(subject => <option key={subject}>{subject}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">実施日
            <input type="date" required value={testDate} onChange={event => setTestDate(event.target.value)} className="mt-1 w-full rounded-lg border border-violet-200 bg-white p-2.5 text-sm" />
          </label>
        </div>
        <label className="block text-xs font-bold text-slate-700">テスト名
          <input required maxLength={160} value={testTitle} onChange={event => setTestTitle(event.target.value)} placeholder="例：英単語小テスト" className="mt-1 w-full rounded-lg border border-violet-200 bg-white p-2.5 text-sm" />
        </label>
        <label className="block text-xs font-bold text-slate-700">出題範囲
          <textarea maxLength={1200} rows={2} value={testScope} onChange={event => setTestScope(event.target.value)} placeholder="例：Lesson 5〜6" className="mt-1 w-full rounded-lg border border-violet-200 bg-white p-2.5 text-sm" />
        </label>
        <label className="block text-xs font-bold text-slate-700">備考（任意）
          <input maxLength={1200} value={testNotes} onChange={event => setTestNotes(event.target.value)} placeholder="例：授業開始時に実施" className="mt-1 w-full rounded-lg border border-violet-200 bg-white p-2.5 text-sm" />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-[11px] text-violet-800">{miniTestMessage || (miniTestLoading ? '小テスト予定を確認中...' : '')}</p>
          <button type="submit" disabled={miniTestSaving || !testTitle.trim()} className="inline-flex items-center gap-1 rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><Plus size={14} />{miniTestSaving ? '登録中...' : '自分用に登録'}</button>
        </div>
      </form>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">学校予定表を読み込み中...</div>
      ) : errorMessage ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{errorMessage}</div>
      ) : !schedule && miniTests.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <CalendarDays className="mx-auto text-slate-300" size={30} />
          <p className="mt-3 text-sm font-black text-slate-700">この週の予定表はまだありません</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">学校から予定表が公開されると、ここに表示されます。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dayNames.map((label, index) => {
            const date = addDays(weekStart, index);
            const day = schedule?.days?.find(item => item.date === date);
            const items = (day?.items || []).filter(item => item.title || item.details || item.time || item.location);
            const tests = miniTests.filter(test => test.test_date === date);
            return (
              <section key={date} className={'overflow-hidden rounded-2xl border bg-white shadow-sm ' + (day?.isHoliday ? 'border-rose-200' : (label === '土' || label === '日') ? day?.isWeekendSchool ? 'border-emerald-200' : 'border-slate-300' : 'border-slate-200')}>
                <div className={'flex items-center justify-between gap-3 px-4 py-3 ' + (day?.isHoliday ? 'bg-rose-50' : (label === '土' || label === '日') ? day?.isWeekendSchool ? 'bg-emerald-50' : 'bg-slate-100' : 'bg-slate-50')}>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-slate-900">{label}曜日 <span className="ml-1 text-[10px] font-medium text-slate-500">{date}</span></h3>
                    {day?.isHoliday && <p className="mt-1 text-[10px] font-black text-rose-700">祝日・休校日{day.holidayName ? '：' + day.holidayName : ''}</p>}
                    {!day?.isHoliday && (label === '土' || label === '日') && <p className={'mt-1 text-[10px] font-black ' + (day?.isWeekendSchool ? 'text-emerald-700' : 'text-slate-600')}>{day?.isWeekendSchool ? '休日登校日' : '基本休日'}</p>}
                  </div>
                  {day?.isHoliday ? <span className="shrink-0 rounded-full bg-rose-100 px-2 py-1 text-[10px] font-black text-rose-700">祝日</span> : (label === '土' || label === '日') ? <span className={'shrink-0 rounded-full px-2 py-1 text-[10px] font-black ' + (day?.isWeekendSchool ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700')}>{day?.isWeekendSchool ? '登校' : '休日'}</span> : null}
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
                  )) : tests.length === 0 ? <p className="py-2 text-center text-xs text-slate-400">{day?.isHoliday ? '祝日・休校日です。' : (label === '土' || label === '日') && !day?.isWeekendSchool ? '基本休日です。' : '登録された予定はありません。'}</p> : null}
                  {tests.map(test => (
                    <article key={test.id} className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                      <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-violet-200 px-2 py-1 text-[10px] font-black text-violet-900">小テスト</span><span className="text-[10px] font-bold text-violet-800">{test.subject}</span><span className="ml-auto text-[9px] font-bold text-violet-700">{test.audience === 'school' ? '学校共通' : '自分用'}</span></div>
                      <p className="mt-2 text-sm font-black text-slate-900">{test.title}</p>
                      {test.scope && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">範囲：{test.scope}</p>}
                      {test.notes && <p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-slate-600">備考：{test.notes}</p>}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
