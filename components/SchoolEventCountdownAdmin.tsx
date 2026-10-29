'use client';

import React, { useEffect, useState } from 'react';
import { CalendarClock, Plus, Save, Trash2, RefreshCw, X, Pencil, CalendarCheck } from 'lucide-react';

type CountdownEvent = {
  id: string;
  title: string;
  summary: string;
  event_date: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

type Props = { adminPassword: string; onAdminPasswordChange: (value: string) => void };

function formatDate(dateKey: string): string {
  const parts = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
    .format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])));
}

export default function SchoolEventCountdownAdmin({ adminPassword, onAdminPasswordChange }: Props) {
  const [events, setEvents] = useState<CountdownEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [isActive, setIsActive] = useState(true);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setSummary('');
    setEventDate('');
    setIsActive(true);
  };

  const loadEvents = async () => {
    if (!adminPassword.trim()) {
      setEvents([]);
      setMessage('Admin用パスワードを入力すると、登録済みイベントを読み込めます。');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/school-countdowns', {
        headers: { 'x-admin-password': adminPassword },
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'イベントを読み込めませんでした。');
      setEvents(Array.isArray(result.events) ? result.events as CountdownEvent[] : []);
    } catch (error) {
      setEvents([]);
      setMessage(error instanceof Error ? error.message : 'イベントを読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminPassword.trim()) void loadEvents();
  }, [adminPassword]);

  const startEdit = (event: CountdownEvent) => {
    setEditingId(event.id);
    setTitle(event.title);
    setSummary(event.summary || '');
    setEventDate(event.event_date);
    setIsActive(event.is_active);
    setMessage('');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!adminPassword.trim()) {
      setMessage('Admin用パスワードを入力してください。');
      return;
    }
    if (!title.trim() || !eventDate) {
      setMessage('タイトルと開催日を入力してください。');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/school-countdowns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ id: editingId, title: title.trim(), summary: summary.trim(), eventDate, isActive }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || '保存できませんでした。');
      setMessage(editingId ? 'イベントを更新しました。' : 'イベントを登録しました。');
      resetForm();
      await loadEvents();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (event: CountdownEvent) => {
    if (!adminPassword.trim()) {
      setMessage('Admin用パスワードを入力してください。');
      return;
    }
    if (!window.confirm('「' + event.title + '」を削除します。よろしいですか？')) return;
    setDeletingId(event.id);
    setMessage('');
    try {
      const response = await fetch('/api/school-countdowns', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ id: event.id }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || '削除できませんでした。');
      if (editingId === event.id) resetForm();
      setMessage('イベントを削除しました。');
      await loadEvents();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '削除できませんでした。');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black"><CalendarClock className="text-indigo-400" /> 学校イベント・カウントダウン</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">タイトル・概要・開催日を登録すると、生徒用ダッシュボードに直近イベントが表示されます。開催日の30・15・7・5・3・1日前の正午に、該当イベントをLINE Flex Messageで通知します。</p>
        </div>
      </div>

      <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-5 sm:p-6">
        <label className="block text-xs font-bold text-slate-300">
          Admin用パスワード
          <input type="password" autoComplete="current-password" value={adminPassword} onChange={event => onAdminPasswordChange(event.target.value)} placeholder="VercelのCAMPUS_SYNC_ADMIN_PASSWORD" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-indigo-500" />
        </label>

        <form onSubmit={saveEvent} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-black text-white">{editingId ? 'イベントを編集' : '新しいイベントを登録'}</h3>
            {editingId && <button type="button" onClick={resetForm} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-slate-300 hover:bg-slate-900"><X size={14} />編集をやめる</button>}
          </div>
          <label className="block text-xs font-bold text-slate-300">イベントタイトル
            <input required value={title} onChange={event => setTitle(event.target.value)} maxLength={120} placeholder="例：文化祭、体育祭、修学旅行" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-indigo-500" />
          </label>
          <label className="block text-xs font-bold text-slate-300">概要・生徒向け説明
            <textarea value={summary} onChange={event => setSummary(event.target.value)} maxLength={1200} rows={4} placeholder="イベントの概要、集合時間、持ち物、注意事項など" className="mt-1 w-full resize-y rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm leading-6 text-white outline-none focus:border-indigo-500" />
          </label>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="block text-xs font-bold text-slate-300">開催日
              <input type="date" required value={eventDate} onChange={event => setEventDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-indigo-500" />
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-xs font-bold text-slate-300">
              <input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)} className="h-4 w-4 accent-indigo-500" />
              生徒用サイトに公開・LINE対象
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white hover:bg-indigo-500 disabled:opacity-50"><Save size={16} />{saving ? '保存中...' : editingId ? '変更を保存' : 'イベントを登録'}</button>
            <button type="button" onClick={() => void loadEvents()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-300 hover:bg-slate-900 disabled:opacity-50"><RefreshCw size={15} />{loading ? '更新中...' : '登録内容を更新'}</button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-lg font-black text-white"><CalendarCheck size={18} className="text-cyan-400" />登録済みイベント（開催日順）</h3>
          <span className="text-xs text-slate-500">{events.length}件</span>
        </div>
        {loading ? <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-400">イベントを読み込み中...</div>
          : events.length ? <div className="space-y-3">{events.map(event => (
            <article key={event.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="break-words text-base font-black text-white">{event.title}</h4>
                    <span className={'rounded-full px-2 py-1 text-[10px] font-black ' + (event.is_active ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800 text-slate-400')}>{event.is_active ? '公開中' : '非公開'}</span>
                  </div>
                  <p className="mt-1 text-xs font-bold text-indigo-300">{formatDate(event.event_date)}</p>
                  {event.summary && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-400">{event.summary}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => startEdit(event)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-900"><Pencil size={13} />編集</button>
                  <button type="button" onClick={() => void deleteEvent(event)} disabled={deletingId === event.id} className="inline-flex items-center gap-1 rounded-lg border border-rose-900/70 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-950/40 disabled:opacity-50"><Trash2 size={13} />{deletingId === event.id ? '削除中...' : '削除'}</button>
                </div>
              </div>
            </article>
          ))}</div> : <div className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">まだイベントは登録されていません。上のフォームから最初のイベントを登録してください。</div>}
      </section>

      {message && <p role="status" className={'rounded-xl border p-3 text-xs leading-5 ' + (message.includes('失敗') || message.includes('正しく') || message.includes('入力してください') || message.includes('不正') ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-indigo-500/30 bg-indigo-500/10 text-indigo-100')}>{message}</p>}
      <p className="text-[10px] leading-5 text-slate-500">イベントを非公開にすると、生徒用サイトとLINE通知の対象から外れます。開催後のイベントは自動配信されず、生徒用カウントダウンにも表示されません。</p>
    </div>
  );
}
