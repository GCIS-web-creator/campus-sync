'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, X, ArrowUpRight, Command } from 'lucide-react';

export type CampusSearchItem = {
  id: string;
  title: string;
  description: string;
  keywords?: string[];
  tab: string;
  scrollTarget?: string;
  kind: string;
};

export default function CampusGlobalSearch({
  open,
  items,
  onClose,
  onSelect,
}: {
  open: boolean;
  items: CampusSearchItem[];
  onClose: () => void;
  onSelect: (item: CampusSearchItem) => void;
}) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const ranked = items.map(item => {
      const title = item.title.toLocaleLowerCase();
      const description = item.description.toLocaleLowerCase();
      const keywords = (item.keywords || []).join(' ').toLocaleLowerCase();
      const text = [title, description, keywords, item.kind.toLocaleLowerCase()].join(' ');
      const score = !q ? 0 : title === q ? 100 : title.startsWith(q) ? 50 : keywords.includes(q) ? 30 : text.includes(q) ? 10 : -1;
      return { item, score };
    }).filter(entry => entry.score >= 0);
    return ranked.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, 'ja')).slice(0, 30).map(entry => entry.item);
  }, [items, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-950/55 p-3 pt-[8vh] backdrop-blur-sm sm:p-6 sm:pt-[10vh]" role="presentation" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="CampusSync全体検索" className="flex max-h-[82dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-100 p-4">
          <Search size={20} className="shrink-0 text-cyan-700"/>
          <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="課題・学食・施設・お知らせを検索" className="min-w-0 flex-1 bg-transparent text-base font-medium text-slate-900 outline-none placeholder:text-slate-400"/>
          <button type="button" onClick={onClose} aria-label="検索を閉じる" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={19}/></button>
        </div>
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
          <span className="text-[10px] font-black tracking-wider text-slate-500">{query.trim() ? 'SEARCH RESULTS' : 'QUICK SEARCH'}</span>
          <span className="text-[10px] text-slate-400">{results.length}件</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">一致する情報がありません。別のキーワードを入力してください。</div>
          ) : (
            <div className="space-y-1">
              {results.map(item => (
                <button key={item.id} type="button" onClick={() => onSelect(item)} className="flex w-full items-start gap-3 rounded-xl p-3 text-left transition hover:bg-cyan-50 focus:bg-cyan-50 focus:outline-none">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Search size={15}/></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><span className="text-xs font-black text-slate-800">{item.title}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">{item.kind}</span></span>
                    {item.description && <span className="mt-1 block line-clamp-2 text-[10px] leading-4 text-slate-500">{item.description}</span>}
                  </span>
                  <ArrowUpRight size={15} className="mt-1 shrink-0 text-slate-300"/>
                </button>
              ))}
            </div>
          )}
        </div>
        <footer className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-[10px] text-slate-400">
          <span>CampusSync内の情報を横断検索</span>
          <span className="inline-flex items-center gap-1"><Command size={11}/> Escで閉じる</span>
        </footer>
      </section>
    </div>
  );
}
