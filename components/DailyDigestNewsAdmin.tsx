'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Newspaper, Save, Trash2, RefreshCw, X, Pencil, ExternalLink } from 'lucide-react';

type NewsItem = {
  id: string;
  target_date: string;
  category: 'news' | 'notice' | 'event' | 'other';
  icon: string;
  title: string;
  body: string;
  url: string | null;
  is_active: boolean;
};

function tokyoDateKey(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
  return new Date(Date.UTC(values.year, values.month - 1, values.day + offsetDays)).toISOString().slice(0, 10);
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

const inputClass = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-500';
const categories = [
  { value: 'news', label: 'ニュース' },
  { value: 'notice', label: 'お知らせ' },
  { value: 'event', label: 'イベント' },
  { value: 'other', label: 'その他' },
] as const;

export default function DailyDigestNewsAdmin() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [targetDate, setTargetDate] = useState(() => tokyoDateKey(1));
  const [category, setCategory] = useState<NewsItem['category']>('news');
  const [icon, setIcon] = useState('📰');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [isActive, setIsActive] = useState(true);

  const resetForm = () => {
    setEditingId(null);
    setTargetDate(tokyoDateKey(1));
    setCategory('news');
    setIcon('📰');
    setTitle('');
    setBody('');
    setUrl('');
    setIsActive(true);
  };

  const loadItems = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/daily-digest-news?from=' + encodeURIComponent(tokyoDateKey()), {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || '登録内容を取得できませんでした。');
      setItems(Array.isArray(result.items) ? result.items as NewsItem[] : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '登録内容を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const startEdit = (item: NewsItem) => {
    setEditingId(item.id);
    setTargetDate(item.target_date);
    setCategory(item.category);
    setIcon(item.icon);
    setTitle(item.title);
    setBody(item.body || '');
    setUrl(item.url || '');
    setIsActive(item.is_active);
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!targetDate || !title.trim()) {
      setMessage('配信予定日とタイトルを入力してください。');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/daily-digest-news', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          targetDate,
          category,
          icon,
          title: title.trim(),
          body: body.trim(),
          url: url.trim(),
          isActive,
        }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || '保存できませんでした。');
      setMessage(editingId ? '配信予定ニュースを更新しました。' : '配信予定ニュースを登録しました。');
      resetForm();
      await loadItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (item: NewsItem) => {
    if (!window.confirm('「' + item.title + '」を削除しますか？')) return;
    setDeletingId(item.id);
    setMessage('');
    try {
      const response = await fetch('/api/admin/daily-digest-news', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || '削除できませんでした。');
      if (editingId === item.id) resetForm();
      setMessage('配信予定ニュースを削除しました。');
      await loadItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '削除できませんでした。');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-black text-white"><Newspaper className="text-cyan-400" /> 定期配信ニュース</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">配信予定日を指定して、ニュース・学校連絡・イベントを事前登録できます。対象日の16:00／土曜12:30／日曜09:00配信で、該当情報がある場合のみ「今日のニュース」カードの先頭に掲載されます。</p>
      </div>

      <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-black text-white">{editingId ? '配信予定ニュースを編集' : '配信予定ニュースを新規登録'}</h3>
          {editingId && <button type="button" onClick={resetForm} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-slate-300 hover:bg-slate-900"><X size={14} />編集をやめる</button>}
        </div>
        <form onSubmit={saveItem} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-300">配信予定日
              <input type="date" required value={targetDate} onChange={event => setTargetDate(event.target.value)} className={inputClass} />
            </label>
            <label className="block text-xs font-bold text-slate-300">種類
              <select value={category} onChange={event => setCategory(event.target.value as NewsItem['category'])} className={inputClass}>
                {categories.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-[110px_1fr]">
            <label className="block text-xs font-bold text-slate-300">アイコン
              <input value={icon} onChange={event => setIcon(event.target.value)} maxLength={12} className={inputClass} placeholder="📰" />
            </label>
            <label className="block text-xs font-bold text-slate-300">タイトル
              <input required value={title} onChange={event => setTitle(event.target.value)} maxLength={120} className={inputClass} placeholder="例：明日の学校行事について" />
            </label>
          </div>
          <label className="block text-xs font-bold text-slate-300">説明
            <textarea value={body} onChange={event => setBody(event.target.value)} maxLength={800} rows={4} className={inputClass + ' resize-y'} placeholder="生徒向けの簡潔な説明（800文字以内）" />
          </label>
          <label className="block text-xs font-bold text-slate-300">詳細リンク（任意・https://）
            <input type="url" value={url} onChange={event => setUrl(event.target.value)} maxLength={1000} className={inputClass} placeholder="https://..." />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-xs font-bold text-slate-300">
            <input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)} className="h-4 w-4 accent-cyan-500" />
            配信対象として有効にする
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-black text-white hover:bg-cyan-500 disabled:opacity-50"><Save size={16} />{saving ? '保存中...' : editingId ? '変更を保存' : '配信予定に追加'}</button>
            <button type="button" onClick={() => void loadItems()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-300 hover:bg-slate-900 disabled:opacity-50"><RefreshCw size={15} />更新</button>
          </div>
        </form>
        {message && <p className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300" role="status">{message}</p>}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-lg font-black text-white"><CalendarClock size={18} className="text-cyan-400" />登録済みニュース</h3>
          <span className="text-xs text-slate-500">{items.length}件</span>
        </div>
        {loading ? <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-400">読み込み中...</div>
          : items.length ? <div className="space-y-3">{items.map(item => (
            <article key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xl">{item.icon}</span>
                    <span className="text-xs font-bold text-cyan-300">{formatDate(item.target_date)}</span>
                    <span className={'rounded-md px-2 py-1 text-[10px] font-bold ' + (item.is_active ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-400')}>{item.is_active ? '配信対象' : '停止中'}</span>
                  </div>
                  <h4 className="mt-2 text-sm font-black text-white">{item.title}</h4>
                  {item.body && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-400">{item.body}</p>}
                  {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-cyan-400"><ExternalLink size={13} />詳細リンク</a>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => startEdit(item)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-900"><Pencil size={13} />編集</button>
                  <button type="button" onClick={() => void deleteItem(item)} disabled={deletingId === item.id} className="inline-flex items-center gap-1 rounded-lg border border-rose-900/70 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-950 disabled:opacity-50"><Trash2 size={13} />{deletingId === item.id ? '削除中' : '削除'}</button>
                </div>
              </div>
            </article>
          ))}</div>
          : <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-500">配信予定ニュースはまだありません。</div>}
      </section>
    </div>
  );
}
