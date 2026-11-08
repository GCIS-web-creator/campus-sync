'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ClipboardList, FileText, ChevronLeft, ChevronRight, Plus, RefreshCw, MapPin, Clock3, Pencil, Trash2, Paperclip, MessageCircle, Download, Users, X } from 'lucide-react';

type Member = { user_id: string; display_name: string; user_class: string; member_role: string };
type FileItem = { id: string; file_name: string; mime_type: string; file_size: number };
type Api = (path: string, method?: string, body?: unknown) => Promise<any>;
type EventItem = { id: string; title: string; description: string; starts_at: string; ends_at: string | null; location: string; creator_name: string; rsvps: { attending: number; maybe: number; not_attending: number; mine: string | null } };
type CommentItem = { id: string; body: string; created_at: string; author_name: string; is_mine: boolean };
type TaskItem = { id: string; title: string; description: string; status: string; priority: string; due_at: string | null; creator_name: string; assignee_ids: string[]; assignees: { user_id: string; display_name: string }[]; attachment: FileItem | null; comments: CommentItem[]; can_update_status: boolean };
type MinuteItem = { id: string; title: string; meeting_at: string; attendees: string[]; agenda: string; discussion: string; decisions: string; action_items: string[]; author_name: string; is_mine: boolean; created_at: string; updated_at: string };
type Props = { workspaceId: string; role: string; members: Member[]; isDarkMode?: boolean; api: Api };
const managers = ['owner', 'admin', 'editor'];
const statusNames: Record<string, string> = { todo: '未着手', in_progress: '進行中', review: '確認待ち', done: '完了' };
const priorityNames: Record<string, string> = { low: '低', normal: '通常', high: '高', urgent: '最優先' };
const responseNames: Record<string, string> = { attending: '出席', maybe: '未定', not_attending: '不参加' };
function localInput(value?: string | null) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function dayKey(d: Date) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dateKey(s: string) { return dayKey(new Date(s)); }
function formatDate(s: string) { return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(s)); }

export default function WorkspacePlanning({ workspaceId, role, members, isDarkMode = false, api }: Props) {
  const manager = managers.includes(role);
  const dark = isDarkMode;
  const panel = dark ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-900';
  const field = dark ? 'border-slate-600 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-900';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const outline = dark ? 'border-slate-600 hover:bg-slate-700' : 'border-slate-300 hover:bg-slate-50';
  const endpoint = '/api/workspaces/' + workspaceId + '/planning';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [minutes, setMinutes] = useState<MinuteItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [month, setMonth] = useState(dayKey(new Date()).slice(0, 7));
  const [view, setView] = useState<'month' | 'list'>('month');
  const [selectedDay, setSelectedDay] = useState('');
  const [eventOpen, setEventOpen] = useState(false);
  const [eventId, setEventId] = useState('');
  const [eventForm, setEventForm] = useState({ title: '', description: '', starts_at: localInput(), ends_at: '', location: '' });
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskId, setTaskId] = useState('');
  const [taskForm, setTaskForm] = useState({ title: '', description: '', due_at: '', priority: 'normal', assignee_ids: [] as string[], attachment_file_id: '' });
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [minuteOpen, setMinuteOpen] = useState(false);
  const [minuteId, setMinuteId] = useState('');
  const [minuteForm, setMinuteForm] = useState({ title: '', meeting_at: localInput(), attendees: '', agenda: '', discussion: '', decisions: '', action_items: '' });
  const [minuteSearch, setMinuteSearch] = useState('');

  const load = async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const [data, fileData] = await Promise.all([api(endpoint), api('/api/workspaces/' + workspaceId + '/files')]);
      setEvents(data.events || []);
      setTasks(data.tasks || []);
      setMinutes(data.minutes || []);
      setFiles(fileData.files || []);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : '情報を取得できませんでした。'); }
    finally { if (initial) setLoading(false); }
  };
  useEffect(() => { void load(true); }, [workspaceId, api]);
  const refresh = async () => load(false);

  const monthDate = useMemo(() => new Date(month + '-01T00:00:00'), [month]);
  const days = useMemo(() => {
    const offset = (monthDate.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => new Date(monthDate.getFullYear(), monthDate.getMonth(), i + 1 - offset));
  }, [monthDate]);
  const monthEvents = useMemo(() => events.filter((e) => e.starts_at.slice(0, 7) === month), [events, month]);
  const grouped = useMemo(() => {
    const result: Record<string, EventItem[]> = {};
    monthEvents.forEach((e) => { const key = dateKey(e.starts_at); result[key] = [...(result[key] || []), e]; });
    return result;
  }, [monthEvents]);
  const visibleEvents = selectedDay ? monthEvents.filter((e) => dateKey(e.starts_at) === selectedDay) : monthEvents;
  const visibleMinutes = useMemo(() => {
    const q = minuteSearch.trim().toLowerCase();
    return q ? minutes.filter((m) => [m.title, m.agenda, m.discussion, m.decisions, ...(m.attendees || [])].join(' ').toLowerCase().includes(q)) : minutes;
  }, [minutes, minuteSearch]);

  const saveEvent = async (e: React.FormEvent) => {
    e.preventDefault(); if (!eventForm.title.trim() || !eventForm.starts_at) return;
    setSaving(true);
    try {
      const body = { kind: 'event', title: eventForm.title, description: eventForm.description, starts_at: new Date(eventForm.starts_at).toISOString(), ends_at: eventForm.ends_at ? new Date(eventForm.ends_at).toISOString() : null, location: eventForm.location };
      if (eventId) await api(endpoint, 'PATCH', { ...body, id: eventId }); else await api(endpoint, 'POST', body);
      setEventOpen(false); setEventId(''); setEventForm({ title: '', description: '', starts_at: localInput(), ends_at: '', location: '' }); await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : '予定を保存できませんでした。'); }
    finally { setSaving(false); }
  };
  const editEvent = (e: EventItem) => { setEventId(e.id); setEventForm({ title: e.title, description: e.description, starts_at: localInput(e.starts_at), ends_at: e.ends_at ? localInput(e.ends_at) : '', location: e.location }); setEventOpen(true); };
  const deleteEvent = async (e: EventItem) => {
    if (!window.confirm('「' + e.title + '」を削除しますか？')) return;
    setSaving(true); try { await api(endpoint, 'DELETE', { kind: 'event', id: e.id }); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : '予定を削除できませんでした。'); } finally { setSaving(false); }
  };
  const rsvp = async (e: EventItem, response: string) => {
    setSaving(true); try { await api(endpoint, 'POST', { action: 'rsvp', event_id: e.id, response }); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : '出欠を保存できませんでした。'); } finally { setSaving(false); }
  };

  const saveTask = async (e: React.FormEvent) => {
    e.preventDefault(); if (!taskForm.title.trim()) return;
    setSaving(true);
    try {
      const body = { kind: 'task', title: taskForm.title, description: taskForm.description, due_at: taskForm.due_at ? new Date(taskForm.due_at).toISOString() : null, priority: taskForm.priority, assignee_ids: taskForm.assignee_ids, attachment_file_id: taskForm.attachment_file_id || null };
      if (taskId) await api(endpoint, 'PATCH', { ...body, id: taskId }); else await api(endpoint, 'POST', body);
      setTaskOpen(false); setTaskId(''); setTaskForm({ title: '', description: '', due_at: '', priority: 'normal', assignee_ids: [], attachment_file_id: '' }); await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'タスクを保存できませんでした。'); }
    finally { setSaving(false); }
  };
  const editTask = (t: TaskItem) => { setTaskId(t.id); setTaskForm({ title: t.title, description: t.description, due_at: t.due_at ? localInput(t.due_at) : '', priority: t.priority, assignee_ids: t.assignee_ids || [], attachment_file_id: t.attachment?.id || '' }); setTaskOpen(true); };
  const changeStatus = async (t: TaskItem, status: string) => {
    setSaving(true); try { await api(endpoint, 'POST', { action: 'task_status', task_id: t.id, status }); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : '状態を変更できませんでした。'); } finally { setSaving(false); }
  };
  const deleteTask = async (t: TaskItem) => {
    if (!window.confirm('「' + t.title + '」を削除しますか？')) return;
    setSaving(true); try { await api(endpoint, 'DELETE', { kind: 'task', id: t.id }); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'タスクを削除できませんでした。'); } finally { setSaving(false); }
  };
  const addComment = async (t: TaskItem, e: React.FormEvent) => {
    e.preventDefault(); const body = (commentDrafts[t.id] || '').trim(); if (!body) return;
    setSaving(true); try { await api(endpoint, 'POST', { action: 'task_comment', task_id: t.id, body }); setCommentDrafts((v) => ({ ...v, [t.id]: '' })); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'コメントを送信できませんでした。'); } finally { setSaving(false); }
  };
  const downloadFile = async (id: string) => {
    const popup = window.open('about:blank', '_blank'); if (popup) popup.opener = null;
    try { const result = await api('/api/workspaces/' + workspaceId + '/files?download=' + encodeURIComponent(id)); if (popup) popup.location.href = result.url; else window.location.assign(result.url); }
    catch (err) { popup?.close(); setError(err instanceof Error ? err.message : 'ファイルを開けませんでした。'); }
  };

  const saveMinute = async (e: React.FormEvent) => {
    e.preventDefault(); if (!minuteForm.title.trim() || !minuteForm.meeting_at) return;
    setSaving(true);
    try {
      const body = { kind: 'minute', title: minuteForm.title, meeting_at: new Date(minuteForm.meeting_at).toISOString(), attendees: minuteForm.attendees.split(/[\n,、]/).map((v) => v.trim()).filter(Boolean), agenda: minuteForm.agenda, discussion: minuteForm.discussion, decisions: minuteForm.decisions, action_items: minuteForm.action_items.split(/\r?\n/).map((v) => v.trim()).filter(Boolean) };
      if (minuteId) await api(endpoint, 'PATCH', { ...body, id: minuteId }); else await api(endpoint, 'POST', body);
      setMinuteOpen(false); setMinuteId(''); setMinuteForm({ title: '', meeting_at: localInput(), attendees: '', agenda: '', discussion: '', decisions: '', action_items: '' }); await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : '議事録を保存できませんでした。'); }
    finally { setSaving(false); }
  };
  const editMinute = (m: MinuteItem) => { setMinuteId(m.id); setMinuteForm({ title: m.title, meeting_at: localInput(m.meeting_at), attendees: (m.attendees || []).join('\n'), agenda: m.agenda, discussion: m.discussion, decisions: m.decisions, action_items: (m.action_items || []).join('\n') }); setMinuteOpen(true); };
  const deleteMinute = async (m: MinuteItem) => {
    if (!window.confirm('「' + m.title + '」を削除しますか？')) return;
    setSaving(true); try { await api(endpoint, 'DELETE', { kind: 'minute', id: m.id }); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : '議事録を削除できませんでした。'); } finally { setSaving(false); }
  };

  if (loading) return <div className={'rounded-2xl border p-8 text-center ' + panel}><RefreshCw className="mx-auto animate-spin text-cyan-500"/><p className={'mt-2 text-sm ' + muted}>読み込み中…</p></div>;

  return <div className="space-y-4">
    {error && <div role="status" className="flex items-start justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-500"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="閉じる"><X size={15}/></button></div>}

    <section className={'rounded-2xl border p-4 sm:p-5 ' + panel}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-black"><CalendarDays className="text-cyan-500"/>グループカレンダー</h2><p className={'mt-1 text-xs ' + muted}>予定を共有し、参加・未定・不参加を回答できます。</p></div><div className="flex gap-2"><button type="button" onClick={() => void refresh()} className={'rounded-lg border p-2 ' + outline}><RefreshCw size={15}/></button>{manager && <button type="button" onClick={() => { setEventId(''); setEventForm({ title: '', description: '', starts_at: localInput(), ends_at: '', location: '' }); setEventOpen((v) => !v); }} className="inline-flex items-center gap-1 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-black text-white"><Plus size={15}/>予定追加</button>}</div></div>
      {eventOpen && manager && <form onSubmit={saveEvent} className="mt-4 grid gap-3 rounded-xl border border-cyan-500/30 p-3 sm:grid-cols-2"><h3 className="font-black sm:col-span-2">{eventId ? '予定を編集' : '新しい予定'}</h3>
        <label className="text-xs font-bold sm:col-span-2">予定名<input required maxLength={160} value={eventForm.title} onChange={(e) => setEventForm((v) => ({ ...v, title: e.target.value }))} className={'mt-1 w-full rounded-lg border px-3 py-2 text-sm ' + field}/></label>
        <label className="text-xs font-bold">開始日時<input required type="datetime-local" value={eventForm.starts_at} onChange={(e) => setEventForm((v) => ({ ...v, starts_at: e.target.value }))} className={'mt-1 w-full rounded-lg border px-3 py-2 text-sm ' + field}/></label>
        <label className="text-xs font-bold">終了日時<input type="datetime-local" value={eventForm.ends_at} onChange={(e) => setEventForm((v) => ({ ...v, ends_at: e.target.value }))} className={'mt-1 w-full rounded-lg border px-3 py-2 text-sm ' + field}/></label>
        <label className="text-xs font-bold">場所<input maxLength={240} value={eventForm.location} onChange={(e) => setEventForm((v) => ({ ...v, location: e.target.value }))} className={'mt-1 w-full rounded-lg border px-3 py-2 text-sm ' + field}/></label>
        <label className="text-xs font-bold sm:col-span-2">詳細<textarea rows={3} maxLength={5000} value={eventForm.description} onChange={(e) => setEventForm((v) => ({ ...v, description: e.target.value }))} className={'mt-1 w-full rounded-lg border px-3 py-2 text-sm ' + field}/></label>
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setEventOpen(false)} className={'rounded-lg border px-3 py-2 text-xs ' + outline}>取消</button><button type="submit" disabled={saving} className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white">保存</button></div>
      </form>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><button type="button" onClick={() => { const d = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1); setMonth(dayKey(d).slice(0, 7)); setSelectedDay(''); }} className={'rounded-lg border p-2 ' + outline}><ChevronLeft size={16}/></button><h3 className="min-w-28 text-center font-black">{new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' }).format(monthDate)}</h3><button type="button" onClick={() => { const d = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1); setMonth(dayKey(d).slice(0, 7)); setSelectedDay(''); }} className={'rounded-lg border p-2 ' + outline}><ChevronRight size={16}/></button></div><div className="flex rounded-lg border p-1"><button type="button" onClick={() => setView('month')} className={'rounded-md px-3 py-1.5 text-xs ' + (view === 'month' ? 'bg-cyan-600 text-white' : muted)}>月表示</button><button type="button" onClick={() => setView('list')} className={'rounded-md px-3 py-1.5 text-xs ' + (view === 'list' ? 'bg-cyan-600 text-white' : muted)}>一覧</button></div></div>
      {view === 'month' && <div className="mt-3"><div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold"><span className="text-rose-500">月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span><span className="text-rose-500">日</span></div><div className="mt-1 grid grid-cols-7 gap-1">{days.map((day) => { const key = dayKey(day); const items = grouped[key] || []; const current = day.getMonth() === monthDate.getMonth(); return <button key={key} type="button" onClick={() => setSelectedDay(selectedDay === key ? '' : key)} className={'min-h-16 rounded-lg border p-1 text-left sm:min-h-20 ' + (selectedDay === key ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-500/10') + (current ? '' : ' opacity-35')}><span className={'text-[11px] font-bold ' + (day.getDay() === 0 ? 'text-rose-500' : day.getDay() === 6 ? 'text-sky-500' : '')}>{day.getDate()}</span><span className="mt-1 block space-y-1">{items.slice(0, 2).map((e) => <span key={e.id} className="block truncate rounded bg-cyan-500/15 px-1 py-0.5 text-[9px] font-bold text-cyan-600">{e.title}</span>)}{items.length > 2 && <span className={'block text-[9px] ' + muted}>+{items.length - 2}</span>}</span></button>; })}</div></div>}
      <div className="mt-4 flex items-center justify-between gap-2"><h3 className="font-black">{selectedDay ? selectedDay.replace(/-/g, '/') + ' の予定' : month.replace('-', '年') + '月の予定'} <span className={'text-xs font-normal ' + muted}>{visibleEvents.length}件</span></h3>{selectedDay && <button type="button" onClick={() => setSelectedDay('')} className="text-xs font-bold text-cyan-500">月全体</button>}</div>
      {visibleEvents.length === 0 ? <p className={'mt-3 rounded-xl border border-dashed p-5 text-center text-sm ' + muted}>この期間の予定はありません。</p> : <div className="mt-3 space-y-3">{visibleEvents.map((e) => <article key={e.id} className="rounded-xl border border-slate-500/15 p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h4 className="font-black">{e.title}</h4><p className={'mt-1 text-xs ' + muted}><Clock3 size={12} className="mr-1 inline"/>{formatDate(e.starts_at)}{e.ends_at ? ' 〜 ' + new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date(e.ends_at)) : ''}</p>{e.location && <p className={'mt-1 text-xs ' + muted}><MapPin size={12} className="mr-1 inline"/>{e.location}</p>}</div>{manager && <div className="flex gap-1"><button type="button" onClick={() => editEvent(e)} className={'rounded-lg border p-2 ' + outline}><Pencil size={13}/></button><button type="button" onClick={() => void deleteEvent(e)} className="rounded-lg border border-rose-500/30 p-2 text-rose-500"><Trash2 size={13}/></button></div>}</div>{e.description && <p className="mt-2 whitespace-pre-wrap text-sm">{e.description}</p>}<div className="mt-3 flex flex-wrap items-center gap-1.5"><span className={'mr-1 text-[10px] ' + muted}>出席 {e.rsvps.attending}・未定 {e.rsvps.maybe}・不参加 {e.rsvps.not_attending}</span>{(['attending', 'maybe', 'not_attending'] as const).map((value) => <button key={value} type="button" disabled={saving} onClick={() => void rsvp(e, value)} className={'rounded-full border px-2.5 py-1 text-[10px] font-bold ' + (e.rsvps.mine === value ? 'border-cyan-500 bg-cyan-500/10 text-cyan-500' : outline)}>{responseNames[value]}</button>)}</div></article>)}</div>}
    </section>

    <section className={'rounded-2xl border p-4 sm:p-5 ' + panel}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-black"><ClipboardList className="text-cyan-500"/>タスク管理</h2><p className={'mt-1 text-xs ' + muted}>担当者・期限・優先度・進捗・コメント・共有ファイルを一元管理。</p></div>{manager && <button type="button" onClick={() => { setTaskId(''); setTaskForm({ title: '', description: '', due_at: '', priority: 'normal', assignee_ids: [], attachment_file_id: '' }); setTaskOpen((v) => !v); }} className="inline-flex items-center gap-1 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-bold text-white"><Plus size={15}/>タスク追加</button>}</div>
      {taskOpen && manager && <form onSubmit={saveTask} className="mt-4 space-y-3 rounded-xl border border-cyan-500/30 p-3"><h3 className="font-black">{taskId ? 'タスクを編集' : '新しいタスク'}</h3><label className="block text-xs font-bold">タイトル<input required maxLength={200} value={taskForm.title} onChange={(e) => setTaskForm((v) => ({ ...v, title: e.target.value }))} className={'mt-1 w-full rounded-lg border px-3 py-2 text-sm ' + field}/></label><label className="block text-xs font-bold">詳細<textarea rows={3} maxLength={5000} value={taskForm.description} onChange={(e) => setTaskForm((v) => ({ ...v, description: e.target.value }))} className={'mt-1 w-full rounded-lg border px-3 py-2 text-sm ' + field}/></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">期限<input type="datetime-local" value={taskForm.due_at} onChange={(e) => setTaskForm((v) => ({ ...v, due_at: e.target.value }))} className={'mt-1 w-full rounded-lg border px-3 py-2 text-sm ' + field}/></label><label className="text-xs font-bold">優先度<select value={taskForm.priority} onChange={(e) => setTaskForm((v) => ({ ...v, priority: e.target.value }))} className={'mt-1 w-full rounded-lg border px-3 py-2 text-sm ' + field}><option value="low">低</option><option value="normal">通常</option><option value="high">高</option><option value="urgent">最優先</option></select></label></div><div><p className="mb-2 text-xs font-bold">担当者（複数選択）</p><div className="grid max-h-36 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">{members.map((m) => <label key={m.user_id} className="flex items-center gap-2 rounded-lg border border-slate-500/10 p-2 text-xs"><input type="checkbox" checked={taskForm.assignee_ids.includes(m.user_id)} onChange={(e) => setTaskForm((v) => ({ ...v, assignee_ids: e.target.checked ? [...v.assignee_ids, m.user_id] : v.assignee_ids.filter((id) => id !== m.user_id) }))}/><span className="truncate">{m.display_name}</span></label>)}</div></div><label className="block text-xs font-bold">共有ファイル（先にファイルタブへアップロード）<select value={taskForm.attachment_file_id} onChange={(e) => setTaskForm((v) => ({ ...v, attachment_file_id: e.target.value }))} className={'mt-1 w-full rounded-lg border px-3 py-2 text-sm ' + field}><option value="">添付なし</option>{files.map((f) => <option key={f.id} value={f.id}>{f.file_name}</option>)}</select></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setTaskOpen(false)} className={'rounded-lg border px-3 py-2 text-xs ' + outline}>取消</button><button type="submit" disabled={saving} className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white">保存</button></div></form>}
      {tasks.length === 0 ? <p className={'mt-4 rounded-xl border border-dashed p-6 text-center text-sm ' + muted}>タスクはまだありません。</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{(['todo', 'in_progress', 'review', 'done'] as const).map((status) => <section key={status} className="min-w-0 rounded-xl border border-slate-500/15 p-2.5"><h3 className="mb-2 flex justify-between text-xs font-black">{statusNames[status]}<span>{tasks.filter((t) => t.status === status).length}</span></h3><div className="space-y-2">{tasks.filter((t) => t.status === status).map((t) => <article key={t.id} className={'rounded-lg border p-3 ' + (dark ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-slate-50')}><div className="flex items-start justify-between gap-2"><h4 className="break-words text-sm font-black">{t.title}</h4>{manager && <div className="flex gap-1"><button type="button" onClick={() => editTask(t)} className={'rounded border p-1.5 ' + outline}><Pencil size={12}/></button><button type="button" onClick={() => void deleteTask(t)} className="rounded border border-rose-500/30 p-1.5 text-rose-500"><Trash2 size={12}/></button></div>}</div>{t.description && <p className={'mt-2 whitespace-pre-wrap text-xs ' + muted}>{t.description}</p>}<div className="mt-2 flex flex-wrap gap-1"><span className="rounded bg-amber-500/10 px-2 py-1 text-[10px] text-amber-600">優先度：{priorityNames[t.priority]}</span>{t.due_at && <span className="rounded bg-slate-500/10 px-2 py-1 text-[10px]">期限 {formatDate(t.due_at)}</span>}</div><p className={'mt-2 text-[10px] ' + muted}><Users size={11} className="mr-1 inline"/>{t.assignees.length ? t.assignees.map((a) => a.display_name).join('・') : '担当者なし'}</p>{t.attachment && <button type="button" onClick={() => void downloadFile(t.attachment!.id)} className="mt-2 flex max-w-full items-center gap-1 truncate text-left text-[10px] font-bold text-cyan-500"><Paperclip size={12}/><span className="truncate">{t.attachment.file_name}</span><Download size={11}/></button>}{t.can_update_status && <label className="mt-3 block text-[10px] font-bold">状態<select value={t.status} disabled={saving} onChange={(e) => void changeStatus(t, e.target.value)} className={'mt-1 w-full rounded-lg border px-2 py-1.5 text-xs ' + field}><option value="todo">未着手</option><option value="in_progress">進行中</option><option value="review">確認待ち</option><option value="done">完了</option></select></label>}<details className="mt-3 border-t border-slate-500/15 pt-2"><summary className={'cursor-pointer text-[10px] font-bold ' + muted}><MessageCircle size={12} className="mr-1 inline"/>コメント（{t.comments.length}）</summary><div className="mt-2 space-y-2">{t.comments.map((c) => <div key={c.id} className="rounded-lg bg-slate-500/5 p-2"><p className="text-[10px] font-bold">{c.author_name}<span className={'ml-2 font-normal ' + muted}>{formatDate(c.created_at)}</span></p><p className="mt-1 whitespace-pre-wrap text-xs">{c.body}</p></div>)}<form onSubmit={(e) => void addComment(t, e)} className="flex gap-1.5"><input value={commentDrafts[t.id] || ''} onChange={(e) => setCommentDrafts((v) => ({ ...v, [t.id]: e.target.value }))} maxLength={3000} placeholder="コメントを入力" className={'min-w-0 flex-1 rounded-lg border px-2 py-2 text-xs ' + field}/><button type="submit" disabled={saving || !(commentDrafts[t.id] || '').trim()} className="rounded-lg bg-cyan-600 px-3 text-xs font-bold text-white">送信</button></form></div></details></article>)}</div></section>)}</div>}
    </section>

    <section className={'rounded-2xl border p-4 sm:p-5 ' + panel}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-black"><FileText className="text-cyan-500"/>議事録</h2><p className={'mt-1 text-xs ' + muted}>出席者・議題・話し合い・決定事項・次のアクションを記録します。</p></div>{manager && <button type="button" onClick={() => { setMinuteId(''); setMinuteForm({ title: '', meeting_at: localInput(), attendees: '', agenda: '', discussion: '', decisions: '', action_items: '' }); setMinuteOpen((v) => !v); }} className="inline-flex items-center gap-1 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-bold text-white"><Plus size={15}/>議事録作成</button>}</div>
      {minuteOpen && manager && <form onSubmit={saveMinute} className="mt-4 space-y-3 rounded-xl border border-cyan-500/30 p-3"><h3 className="font-black">{minuteId ? '議事録を編集' : '新しい議事録'}</h3><label className="block text-xs font-bold">タイトル<input required maxLength={160} value={minuteForm.title} onChange={(e) => setMinuteForm((v) => ({ ...v, title: e.target.value }))} className={'mt-1 w-full rounded-lg border px-3 py-2 text-sm ' + field}/></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">会議日時<input required type="datetime-local" value={minuteForm.meeting_at} onChange={(e) => setMinuteForm((v) => ({ ...v, meeting_at: e.target.value }))} className={'mt-1 w-full rounded-lg border px-3 py-2 text-sm ' + field}/></label><label className="text-xs font-bold">出席者（改行・カンマ区切り）<input value={minuteForm.attendees} onChange={(e) => setMinuteForm((v) => ({ ...v, attendees: e.target.value }))} className={'mt-1 w-full rounded-lg border px-3 py-2 text-sm ' + field}/></label></div>{([['agenda','議題',2],['discussion','話し合った内容',4],['decisions','決定事項',3],['action_items','次のアクション（1行1項目）',3]] as const).map(([key,label,rows]) => <label key={key} className="block text-xs font-bold">{label}<textarea rows={rows} value={minuteForm[key]} onChange={(e) => setMinuteForm((v) => ({ ...v, [key]: e.target.value }))} className={'mt-1 w-full rounded-lg border px-3 py-2 text-sm ' + field}/></label>)}<div className="flex justify-end gap-2"><button type="button" onClick={() => setMinuteOpen(false)} className={'rounded-lg border px-3 py-2 text-xs ' + outline}>取消</button><button type="submit" disabled={saving} className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white">保存</button></div></form>}
      <input value={minuteSearch} onChange={(e) => setMinuteSearch(e.target.value)} placeholder="議事録を検索（タイトル・本文・出席者）" className={'mt-4 w-full rounded-lg border px-3 py-2 text-sm ' + field}/>
      {visibleMinutes.length === 0 ? <p className={'mt-3 rounded-xl border border-dashed p-6 text-center text-sm ' + muted}>{minutes.length ? '検索結果がありません。' : '議事録はまだありません。'}</p> : <div className="mt-3 space-y-2">{visibleMinutes.map((m) => <article key={m.id} className="rounded-xl border border-slate-500/15 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-black">{m.title}</h3><p className={'mt-1 text-[10px] ' + muted}>{formatDate(m.meeting_at)} ・ 記録：{m.author_name}{m.updated_at !== m.created_at ? ' ・更新済み' : ''}</p></div>{(manager || m.is_mine) && <div className="flex gap-1"><button type="button" onClick={() => editMinute(m)} className={'rounded-lg border p-2 ' + outline}><Pencil size={13}/></button>{manager && <button type="button" onClick={() => void deleteMinute(m)} className="rounded-lg border border-rose-500/30 p-2 text-rose-500"><Trash2 size={13}/></button>}</div>}</div><p className={'mt-2 text-xs ' + muted}>出席者：{m.attendees?.join('・') || '未記入'}</p><details className="mt-3 border-t border-slate-500/15 pt-2"><summary className="cursor-pointer text-xs font-bold text-cyan-500">議事録を表示</summary><div className="mt-3 space-y-3 text-sm"><div><b className="text-xs">議題</b><p className="mt-1 whitespace-pre-wrap">{m.agenda || '未記入'}</p></div><div><b className="text-xs">話し合った内容</b><p className="mt-1 whitespace-pre-wrap">{m.discussion || '未記入'}</p></div><div><b className="text-xs">決定事項</b><p className="mt-1 whitespace-pre-wrap">{m.decisions || '未記入'}</p></div><div><b className="text-xs">次のアクション</b>{m.action_items?.length ? <ul className="mt-1 list-inside list-disc">{m.action_items.map((v, i) => <li key={i}>{v}</li>)}</ul> : <p className="mt-1">未記入</p>}</div></div></details></article>)}</div>}
    </section>
  </div>;
}
