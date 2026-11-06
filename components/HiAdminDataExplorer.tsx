'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight,
  ClipboardList, Database, FilePlus2, Folder, FolderOpen, HardDrive,
  History, Pencil, Plus, RefreshCw, Search, ShieldCheck, Table2, Trash2,
  X, LockKeyhole, Eye, Save, Info
} from 'lucide-react';

type Column = { name: string; type: string; nullable: boolean; default: string | null; label: string; sensitive: boolean };
type TableMeta = {
  name: string; label: string; group: string; description: string;
  estimated_rows: number; primary_key: string[]; columns: Column[]; can_write: boolean;
};
type RowData = Record<string, unknown>;
type AuditRow = { id: string; actor_email: string; action: string; details: { table?: string; record_key?: Record<string, unknown>; changed_fields?: string[] }; created_at: string };
type Props = { token: string; password2: string; password3: string };

const GROUP_ORDER = ['生徒・アカウント', '授業・学習', 'ノート・学習記録', 'チャット・コミュニティ', '学食・施設', 'お知らせ・LINE', '交通・時刻表', '気象・防災', 'AI・ナレッジ', '通知・端末', 'システム・認証', 'その他'];

const dateTime = (value: unknown) => {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
};
const displayValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? '有効 / はい' : '無効 / いいえ';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};
const toEditorValue = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};
const isLargeText = (column: Column) => ['json', 'jsonb', 'ARRAY'].includes(column.type) || ['body', 'content', 'content_html', 'content_text', 'details', 'description', 'message', 'message_text', 'summary', 'notification_payload', 'observed_areas', 'eew_targets', 'days', 'metadata', 'payload'].includes(column.name);

export default function HiAdminDataExplorer({ token, password2, password3 }: Props) {
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [rows, setRows] = useState<RowData[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'create' | 'edit' | null>(null);
  const [editingRow, setEditingRow] = useState<RowData | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(GROUP_ORDER);
  const [showSchema, setShowSchema] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RowData | null>(null);
  const [viewingRow, setViewingRow] = useState<RowData | null>(null);

  const authHeaders = useMemo(() => ({
    Authorization: 'Bearer ' + token,
    'X-HiAdmin-Password-2': password2,
    'X-HiAdmin-Password-3': password3,
    'Cache-Control': 'no-store',
  }), [token, password2, password3]);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch('/api/hiadmin?' + path, {
      ...init,
      headers: { ...authHeaders, ...(init?.headers || {}) },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data.message || 'データベースの操作に失敗しました。') as Error & { status?: number };
      err.status = response.status;
      throw err;
    }
    return data;
  }, [authHeaders]);

  const loadTables = useCallback(async (preferred?: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await request('view=explorer-schema');
      const nextTables = (data.tables || []) as TableMeta[];
      setTables(nextTables);
      const nextName = preferred && nextTables.some((table) => table.name === preferred)
        ? preferred
        : selectedName && nextTables.some((table) => table.name === selectedName)
          ? selectedName
          : nextTables[0]?.name || '';
      if (nextName) setSelectedName(nextName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [request]);

  const selected = tables.find((table) => table.name === selectedName) || null;

  const loadRows = useCallback(async (tableName: string, nextPage = 1, query = search) => {
    if (!tableName) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ view: 'explorer-rows', table: tableName, page: String(nextPage), q: query.trim() });
      const data = await request(params.toString());
      setRows((data.rows || []) as RowData[]);
      setCount(Number(data.count || 0));
      setPage(Number(data.page || nextPage));
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [request, search]);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await request('view=explorer-audit');
      setAuditRows((data.logs || []) as AuditRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { void loadTables(); }, [loadTables]);
  useEffect(() => {
    if (selectedName && !showAudit) void loadRows(selectedName, 1, search);
  }, [selectedName, showAudit, loadRows, search]);

  const groups = useMemo(() => {
    const filtered = tables.filter((table) => {
      const target = (table.label + ' ' + table.name + ' ' + table.description + ' ' + table.group).toLowerCase();
      return target.includes(tableSearch.toLowerCase().trim());
    });
    const names = Array.from(new Set([...GROUP_ORDER, ...filtered.map((table) => table.group)]));
    return names.map((group) => ({ group, items: filtered.filter((table) => table.group === group) })).filter((item) => item.items.length);
  }, [tables, tableSearch]);

  const primaryKey = useCallback((row: RowData | null) => {
    if (!row || !selected) return {};
    return Object.fromEntries(selected.primary_key.map((key) => [key, row[key]]));
  }, [selected]);

  const openCreate = () => {
    if (!selected?.can_write) return;
    const initial: Record<string, string> = {};
    selected.columns.forEach((column) => {
      if (column.default !== null || column.sensitive) return;
      if (column.type === 'boolean') initial[column.name] = 'false';
      else if (column.type === 'json' || column.type === 'jsonb') initial[column.name] = '{}';
      else if (column.type === 'ARRAY') initial[column.name] = '[]';
      else initial[column.name] = '';
    });
    setDraft(initial);
    setEditingRow(null);
    setMode('create');
    setMessage('');
    setError('');
  };

  const openEdit = (row: RowData) => {
    if (!selected?.can_write) return;
    const initial: Record<string, string> = {};
    selected.columns.forEach((column) => {
      if (column.sensitive) return;
      initial[column.name] = toEditorValue(row[column.name]);
    });
    setDraft(initial);
    setEditingRow(row);
    setMode('edit');
    setMessage('');
    setError('');
  };

  const convertDraft = () => {
    if (!selected) return {};
    const values: Record<string, unknown> = {};
    for (const column of selected.columns) {
      if (column.sensitive || !(column.name in draft)) continue;
      if (mode === 'edit' && selected.primary_key.includes(column.name)) continue;
      const raw = draft[column.name] ?? '';
      if (raw === '' && column.nullable) { values[column.name] = null; continue; }
      if (raw === '' && column.default !== null && mode === 'create') continue;
      if (column.type === 'boolean') { values[column.name] = raw === 'true'; continue; }
      if (['integer', 'bigint', 'smallint', 'numeric', 'double precision', 'real'].includes(column.type)) {
        if (raw === '' && column.nullable) { values[column.name] = null; continue; }
        const number = Number(raw);
        if (!Number.isFinite(number)) throw new Error(column.label + 'は数値で入力してください。');
        values[column.name] = number;
        continue;
      }
      if (column.type === 'json' || column.type === 'jsonb' || column.type === 'ARRAY') {
        if (!raw.trim() && column.nullable) { values[column.name] = null; continue; }
        try {
          const parsed = JSON.parse(raw);
          if (column.type === 'ARRAY' && !Array.isArray(parsed)) throw new Error('配列（[ ]）で入力してください。');
          values[column.name] = parsed;
        } catch (err) {
          throw new Error(column.label + 'のJSON形式が正しくありません: ' + (err instanceof Error ? err.message : 'JSON parse error'));
        }
        continue;
      }
      values[column.name] = raw;
    }
    return values;
  };

  const saveRow = async () => {
    if (!selected || !mode) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const values = convertDraft();
      if (!Object.keys(values).length) throw new Error('保存する項目がありません。');
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const payload = mode === 'create'
        ? { table: selected.name, values }
        : { table: selected.name, key: primaryKey(editingRow), values };
      await request('', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setMode(null); setEditingRow(null);
      setMessage(mode === 'create' ? 'レコードを追加しました。' : 'レコードを更新しました。');
      await loadTables(selected.name);
      await loadRows(selected.name, page, search);
      await loadAudit();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (row: RowData) => {
    if (!selected) return;
    setSaving(true); setError('');
    try {
      await request('', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: selected.name, key: primaryKey(row) }) });
      setConfirmDelete(null);
      setMessage('レコードを削除しました。');
      await loadTables(selected.name);
      await loadRows(selected.name, page, search);
      await loadAudit();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const visibleColumns = selected?.columns.slice(0, 7) || [];

  return (
    <div className="space-y-4 text-slate-100">
      <header className="rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-950/50 via-slate-950 to-slate-900 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-200"><HardDrive size={18}/><span className="text-[10px] font-black uppercase tracking-[0.25em]">HighAdmin / Supabase Storage</span></div>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">Supabase データエクスプローラー</h2>
            <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-400">Windowsのファイルエクスプローラーのように、CampusSyncの保存データをフォルダー別に整理して確認できます。各項目の意味を日本語で表示し、許可されたテーブルは追加・編集・削除できます。</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setShowAudit((value) => !value); if (!showAudit) void loadAudit(); }} className={'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ' + (showAudit ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100' : 'border-white/10 text-slate-300')}><History size={15}/>{showAudit ? 'データ一覧へ' : '変更履歴'}</button>
            <button onClick={() => { void loadTables(selectedName); if (selectedName) void loadRows(selectedName, page, search); }} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-40"><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>更新</button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-white/5 bg-black/20 p-3"><p className="text-[10px] text-slate-500">公開データテーブル</p><p className="mt-1 text-xl font-black tabular-nums">{tables.length}</p></div>
          <div className="rounded-xl border border-white/5 bg-black/20 p-3"><p className="text-[10px] text-slate-500">分類フォルダー</p><p className="mt-1 text-xl font-black tabular-nums">{groups.length}</p></div>
          <div className="rounded-xl border border-white/5 bg-black/20 p-3"><p className="text-[10px] text-slate-500">選択中のデータ</p><p className="mt-1 truncate text-sm font-black">{selected?.label || '未選択'}</p></div>
          <div className="rounded-xl border border-white/5 bg-black/20 p-3"><p className="text-[10px] text-slate-500">現在のレコード数</p><p className="mt-1 text-xl font-black tabular-nums">{selected ? count.toLocaleString('ja-JP') : '—'}</p></div>
        </div>
      </header>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-100"><AlertTriangle size={16} className="mt-0.5 shrink-0"/><span>{error}</span></div>}
      {message && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-xs text-emerald-100"><Check size={15}/>{message}</div>}

      {showAudit ? (
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
          <div className="border-b border-white/10 p-4"><h3 className="flex items-center gap-2 text-base font-black"><History size={17} className="text-cyan-200"/>データ変更履歴</h3><p className="mt-1 text-xs text-slate-500">HighAdminで行った追加・編集・削除を記録しています（最新100件）。</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-white/[0.04] text-slate-400"><tr><th className="p-3">日時</th><th className="p-3">実行者</th><th className="p-3">操作</th><th className="p-3">テーブル</th><th className="p-3">レコードキー</th><th className="p-3">変更列</th></tr></thead><tbody>{auditRows.map((row) => <tr key={row.id} className="border-t border-white/5"><td className="whitespace-nowrap p-3 text-slate-400">{dateTime(row.created_at)}</td><td className="p-3">{row.actor_email}</td><td className="p-3 font-bold text-cyan-200">{row.action.replace('database.', '')}</td><td className="p-3">{tables.find((table) => table.name === row.details?.table)?.label || row.details?.table || '—'}</td><td className="max-w-[220px] truncate p-3 font-mono text-[10px] text-slate-400">{JSON.stringify(row.details?.record_key || {})}</td><td className="max-w-[240px] p-3 text-slate-400">{row.details?.changed_fields?.map((field) => tables.find((table) => table.name === row.details?.table)?.columns.find((column) => column.name === field)?.label || field).join('、') || '—'}</td></tr>)}{auditRows.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-slate-500">変更履歴はありません。</td></tr>}</tbody></table></div>
        </section>
      ) : (
        <div className="grid min-h-[600px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950 lg:grid-cols-[285px_minmax(0,1fr)]">
          <aside className="border-b border-white/10 bg-slate-950/90 lg:border-b-0 lg:border-r">
            <div className="border-b border-white/10 p-4"><div className="mb-3 flex items-center gap-2 text-sm font-black"><FolderOpen size={17} className="text-amber-300"/>データフォルダー</div><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/><input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} placeholder="テーブルを検索…" className="w-full rounded-lg border border-white/10 bg-slate-900 py-2 pl-9 pr-3 text-xs outline-none focus:border-cyan-300/40"/></div></div>
            <div className="max-h-[520px] space-y-1 overflow-y-auto p-2 lg:max-h-[760px]">
              {groups.map(({ group, items }) => {
                const open = expandedGroups.includes(group);
                return <div key={group}>
                  <button onClick={() => setExpandedGroups((old) => open ? old.filter((item) => item !== group) : [...old, group])} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-black text-slate-300 hover:bg-white/5">
                    {open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}<Folder size={15} className="text-amber-300"/><span className="min-w-0 flex-1 truncate">{group}</span><span className="text-[10px] text-slate-600">{items.length}</span>
                  </button>
                  {open && <div className="ml-4 space-y-0.5 border-l border-white/10 pl-2">{items.map((table) => (
                    <button key={table.name} onClick={() => { setSelectedName(table.name); setSearch(''); setPage(1); setMessage(''); setError(''); setViewingRow(null); }} className={'flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition ' + (selectedName === table.name ? 'bg-cyan-300/10 text-cyan-100 ring-1 ring-inset ring-cyan-300/20' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200')}>
                      <Table2 size={14} className="mt-0.5 shrink-0 text-cyan-300"/><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-bold">{table.label}</span><span className="mt-0.5 block truncate font-mono text-[9px] text-slate-600">{table.name}</span></span>
                      {!table.can_write && <LockKeyhole size={11} className="mt-1 shrink-0 text-slate-600"/>}
                    </button>
                  ))}</div>}
                </div>;
              })}
              {groups.length === 0 && <p className="px-3 py-6 text-center text-xs text-slate-500">一致するデータがありません。</p>}
            </div>
            <div className="border-t border-white/10 p-3 text-[10px] leading-5 text-slate-500"><p className="flex items-center gap-1.5"><LockKeyhole size={11}/>鍵マークは保護対象（読み取り専用）です。</p><p className="mt-1">件数はDB統計に基づく概算です。選択したテーブルの件数は正確な値を表示します。</p></div>
          </aside>

          <section className="min-w-0">
            {selected ? <>
              <div className="border-b border-white/10 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0"><div className="mb-1 flex items-center gap-2 text-[10px] text-slate-500"><span>Supabase</span><ChevronRight size={11}/><span>{selected.group}</span><ChevronRight size={11}/><span className="text-cyan-200">{selected.label}</span></div><h3 className="text-xl font-black">{selected.label}</h3><p className="mt-1 break-all font-mono text-[10px] text-slate-500">public.{selected.name}</p><p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">{selected.description}</p></div>
                  <div className="flex flex-wrap gap-2">{selected.can_write ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-bold text-emerald-200"><Pencil size={11}/>編集可能</span> : <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[10px] font-bold text-amber-100"><LockKeyhole size={11}/>読み取り専用</span>}<span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-slate-400">{selected.columns.length} 項目</span></div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[180px] flex-1 sm:max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="このテーブル内を検索…" className="w-full rounded-lg border border-white/10 bg-slate-900 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-cyan-300/40"/></div>
                  {selected.can_write && <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-300 px-3 py-2.5 text-xs font-black text-slate-950 hover:bg-cyan-200"><Plus size={14}/>新しいデータ</button>}
                  <button onClick={() => setShowSchema((value) => !value)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2.5 text-xs font-bold text-slate-300"><Info size={14}/>{showSchema ? '項目説明を閉じる' : '項目説明'}</button>
                </div>
                {showSchema && <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{selected.columns.map((column) => <div key={column.name} className="rounded-lg border border-white/5 bg-slate-900/70 p-2.5"><div className="flex items-center justify-between gap-2"><b className="text-[11px] text-slate-200">{column.label}</b><span className="text-[9px] text-slate-500">{column.type}</span></div><p className="mt-1 break-all font-mono text-[9px] text-slate-600">{column.name}</p><p className="mt-1 text-[9px] text-slate-500">{selected.primary_key.includes(column.name) ? '主キー' : column.nullable ? '未入力可' : '必須'}{column.default ? '・初期値あり' : ''}{column.sensitive ? '・保護値' : ''}</p></div>)}</div>}
              </div>

              <div className="flex items-center justify-between gap-3 border-b border-white/5 bg-white/[0.02] px-4 py-3 text-[10px] text-slate-500"><span>レコード一覧　·　{count.toLocaleString('ja-JP')} 件</span><span>ページ {page} · 1ページ30件</span></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="bg-white/[0.035] text-slate-400"><tr>{visibleColumns.map((column) => <th key={column.name} className="max-w-[210px] px-3 py-3 font-bold"><span className="block truncate">{column.label}</span><span className="mt-0.5 block font-mono text-[9px] font-normal text-slate-600">{column.name}</span></th>)}<th className="w-[120px] px-3 py-3 text-right">操作</th></tr></thead>
                  <tbody>{rows.map((row, index) => <tr key={JSON.stringify(selected.primary_key.map((key) => row[key])) || index} className="border-t border-white/5 hover:bg-white/[0.025]">
                    {visibleColumns.map((column) => <td key={column.name} className="max-w-[210px] px-3 py-3 align-top"><span className="block max-h-16 overflow-hidden break-all text-[11px] leading-5 text-slate-300">{displayValue(row[column.name])}</span></td>)}
                    <td className="px-3 py-3 text-right"><div className="inline-flex gap-1">{selected.can_write && <><button title="編集" onClick={() => openEdit(row)} className="rounded-lg border border-white/10 p-2 text-cyan-200 hover:bg-cyan-300/10"><Pencil size={13}/></button><button title="削除" onClick={() => setConfirmDelete(row)} className="rounded-lg border border-white/10 p-2 text-rose-300 hover:bg-rose-300/10"><Trash2 size={13}/></button></>}<button title="詳細" onClick={() => setViewingRow(row)} className="rounded-lg border border-white/10 p-2 text-slate-400 hover:bg-white/5"><Eye size={13}/></button></div></td>
                  </tr>)}
                  {rows.length === 0 && <tr><td colSpan={visibleColumns.length + 1} className="p-12 text-center"><Database size={25} className="mx-auto mb-2 text-slate-700"/><p className="text-xs font-bold text-slate-400">{loading ? '読み込み中…' : 'このテーブルにはデータがありません。'}</p><p className="mt-1 text-[10px] text-slate-600">編集可能なテーブルなら「新しいデータ」から登録できます。</p></td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 p-3"><span className="text-[10px] text-slate-500">表示 {rows.length} 件 / 全 {count.toLocaleString('ja-JP')} 件</span><div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => void loadRows(selected.name, page - 1, search)} className="rounded-lg border border-white/10 p-2 disabled:opacity-30"><ArrowLeft size={14}/></button><button disabled={!hasMore || loading} onClick={() => void loadRows(selected.name, page + 1, search)} className="rounded-lg border border-white/10 p-2 disabled:opacity-30"><ArrowRight size={14}/></button></div></div>
            </> : <div className="p-12 text-center text-slate-500"><Database className="mx-auto mb-3" size={30}/><p className="text-sm font-bold">左のフォルダーからデータを選択してください。</p></div>}
          </section>
        </div>
      )}


      {viewingRow && selected && <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="explorer-detail-title">
        <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 p-4"><div><h3 id="explorer-detail-title" className="font-black">レコードの詳細</h3><p className="mt-1 text-[10px] text-slate-500">{selected.label} · public.{selected.name}</p></div><button onClick={() => setViewingRow(null)} className="rounded-lg border border-white/10 p-2"><X size={16}/></button></div>
          <div className="max-h-[72vh] space-y-2 overflow-y-auto p-4 sm:p-5">
            {selected.columns.map((column) => <div key={column.name} className="grid gap-1 rounded-xl border border-white/5 bg-white/[0.025] p-3 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-4">
              <div><p className="text-[11px] font-bold text-slate-300">{column.label}</p><p className="mt-1 break-all font-mono text-[9px] text-slate-600">{column.name}</p></div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-5 text-slate-300">{column.sensitive ? '［保護された情報］' : displayValue(viewingRow[column.name])}</pre>
            </div>)}
          </div>
          <div className="flex justify-between border-t border-white/10 p-4"><span className="text-[10px] text-slate-500">保護対象の認証情報は表示していません。</span>{selected.can_write && <button onClick={() => { setViewingRow(null); openEdit(viewingRow); }} className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-4 py-2.5 text-xs font-black text-slate-950"><Pencil size={13}/>編集</button>}</div>
        </div>
      </div>}

      {mode && selected && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="explorer-edit-title">
        <div className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 p-4"><div><h3 id="explorer-edit-title" className="font-black">{mode === 'create' ? '新しいレコードを追加' : 'レコードを編集'}</h3><p className="mt-1 text-[10px] text-slate-500">{selected.label} · public.{selected.name}</p></div><button onClick={() => setMode(null)} className="rounded-lg border border-white/10 p-2"><X size={16}/></button></div>
          <div className="max-h-[68vh] space-y-3 overflow-y-auto p-4 sm:p-5">
            {selected.columns.map((column) => {
              const isPk = selected.primary_key.includes(column.name);
              if (column.sensitive) return <div key={column.name} className="rounded-xl border border-amber-300/10 bg-amber-300/5 p-3"><div className="flex items-center gap-2 text-xs font-bold text-amber-100"><LockKeyhole size={13}/>{column.label}（保護）</div><p className="mt-1 text-[10px] text-amber-100/60">秘密情報のため、ここでは表示・変更できません。</p></div>;
              if (mode === 'create' && column.default !== null) return null;
              const value = draft[column.name] ?? '';
              const disabled = mode === 'edit' && isPk;
              const common = 'w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-cyan-300/40 disabled:cursor-not-allowed disabled:opacity-50';
              return <label key={column.name} className="block"><span className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-300"><span>{column.label}{!column.nullable && column.default === null && mode === 'create' ? <span className="ml-1 text-rose-300">必須</span> : ''}</span><span className="font-mono text-[9px] font-normal text-slate-500">{column.name} · {column.type}{isPk ? ' · 主キー' : ''}</span></span>
                {column.type === 'boolean' ? <select disabled={disabled} value={value || 'false'} onChange={(event) => setDraft((old) => ({ ...old, [column.name]: event.target.value }))} className={common}><option value="true">有効 / はい (true)</option><option value="false">無効 / いいえ (false)</option></select>
                : isLargeText(column) ? <textarea disabled={disabled} rows={column.type === 'json' || column.type === 'jsonb' || column.type === 'ARRAY' ? 4 : 3} value={value} onChange={(event) => setDraft((old) => ({ ...old, [column.name]: event.target.value }))} className={common + ' font-mono'} placeholder={column.type === 'jsonb' || column.type === 'json' || column.type === 'ARRAY' ? 'JSON形式で入力してください' : ''}/>
                : <input disabled={disabled} type={['integer', 'bigint', 'smallint', 'numeric', 'double precision', 'real'].includes(column.type) ? 'number' : column.type === 'date' ? 'date' : 'text'} step={['numeric', 'double precision', 'real'].includes(column.type) ? 'any' : '1'} value={value} onChange={(event) => setDraft((old) => ({ ...old, [column.name]: event.target.value }))} className={common} placeholder={column.default ? '初期値: ' + column.default : (column.nullable ? '任意' : '入力してください')}/>}
              </label>;
            })}
            <div className="rounded-xl border border-cyan-300/10 bg-cyan-300/5 p-3 text-[10px] leading-5 text-cyan-100/70"><Info size={13} className="mr-1 inline"/>日時・JSON・配列などは形式を確認してから保存してください。主キーは編集できず、作成日時など初期値がある項目は追加時に自動設定されます。</div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 p-4"><span className="text-[10px] text-slate-500">変更はHighAdmin監査ログに記録されます。</span><div className="flex gap-2"><button onClick={() => setMode(null)} className="rounded-lg border border-white/10 px-4 py-2.5 text-xs font-bold text-slate-300">キャンセル</button><button disabled={saving} onClick={() => void saveRow()} className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-4 py-2.5 text-xs font-black text-slate-950 disabled:opacity-50"><Save size={14}/>{saving ? '保存中…' : '保存する'}</button></div></div>
        </div>
      </div>}

      {confirmDelete && selected && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4" role="alertdialog" aria-modal="true">
        <div className="w-full max-w-md rounded-2xl border border-rose-300/20 bg-slate-950 p-5 shadow-2xl"><div className="mb-3 flex items-center gap-2 text-rose-200"><AlertTriangle size={19}/><h3 className="font-black">レコードを完全に削除しますか？</h3></div><p className="text-xs leading-6 text-slate-300">この操作は元に戻せません。削除対象は「{selected.label}」の1件です。関連データの外部処理や通知は自動実行されません。</p><pre className="mt-3 max-h-24 overflow-auto rounded-lg bg-black/30 p-3 text-[10px] text-slate-500">{JSON.stringify(primaryKey(confirmDelete), null, 2)}</pre><div className="mt-5 flex justify-end gap-2"><button onClick={() => setConfirmDelete(null)} className="rounded-lg border border-white/10 px-4 py-2 text-xs font-bold">やめる</button><button disabled={saving} onClick={() => void deleteRow(confirmDelete)} className="rounded-lg bg-rose-500 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{saving ? '削除中…' : '完全に削除する'}</button></div></div>
      </div>}
    </div>
  );
}
