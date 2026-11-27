'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getPlanetSystemSpec } from '@/lib/planet-system-catalog';
import { getPlanetSurfaceTextureUrl } from '@/lib/planet-world/planet-catalog-v50';
import { Orbit, RefreshCw, Search, Save, CheckCircle2, AlertCircle } from 'lucide-react';

type AssignedPlanet = {
  id: string;
  user_id: string;
  planet_asset_id: string;
  planet_name: string;
  civilization_stage: number;
  updated_at: string;
};

type PlanetUser = {
  auth_user_id: string;
  student_id: string;
  student_name: string;
  user_class: string | null;
  planet: AssignedPlanet | null;
};

const PLANET_OPTIONS = Array.from({ length: 50 }, (_, index) => {
  const id = 'planet-' + String(index + 1).padStart(3, '0');
  return { id, spec: getPlanetSystemSpec(id) };
});

async function adminPlanetRequest<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch('/api/admin/data', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    throw new Error(result?.message || '惑星管理データを処理できませんでした。');
  }
  return result as T;
}

export default function AdminPlanetManagement() {
  const [users, setUsers] = useState<PlanetUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [truncated, setTruncated] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminPlanetRequest<{ users: PlanetUser[]; truncated?: boolean }>('list-planet-assignments');
      const rows = Array.isArray(result.users) ? result.users : [];
      setUsers(rows);
      setDrafts(Object.fromEntries(rows.map(row => [row.auth_user_id, row.planet?.planet_asset_id || 'planet-001'])));
      setTruncated(result.truncated === true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '生徒一覧を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const filtered = useMemo(() => {
    const key = search.trim().toLowerCase();
    if (!key) return users;
    return users.filter(user => [
      user.student_id,
      user.student_name,
      user.user_class || '',
    ].some(value => value.toLowerCase().includes(key)));
  }, [users, search]);

  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleUsers = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const savePlanet = async (user: PlanetUser) => {
    const planetAssetId = drafts[user.auth_user_id] || 'planet-001';
    if (user.planet?.planet_asset_id === planetAssetId) return;
    setSavingId(user.auth_user_id);
    setError('');
    setMessage('');
    try {
      const result = await adminPlanetRequest<{ planet: AssignedPlanet }>('set-user-planet', {
        userId: user.auth_user_id,
        planetAssetId,
      });
      setUsers(previous => previous.map(row => row.auth_user_id === user.auth_user_id
        ? { ...row, planet: result.planet }
        : row));
      setMessage(`${user.student_name || user.student_id || '対象ユーザー'} の惑星を「${getPlanetSystemSpec(planetAssetId).name}」に変更しました。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '惑星を変更できませんでした。');
    } finally {
      setSavingId(null);
    }
  };

  const panel = 'rounded-2xl border border-slate-800 bg-slate-950/60';
  const currentCount = users.filter(user => user.planet).length;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black tracking-[.22em] text-cyan-300">CAMPUSSYNC · PLANET CONTROL</p>
          <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">ユーザー惑星管理</h1>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">生徒ごとに最初の惑星を割り当て直せます。変更は本人の「惑星・文明」画面に反映されます。</p>
        </div>
        <button type="button" onClick={() => void loadUsers()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>更新
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`${panel} p-4`}><p className="text-[10px] font-bold text-slate-500">登録ユーザー</p><p className="mt-1 text-2xl font-black tabular-nums text-white">{users.length.toLocaleString('ja-JP')}</p></div>
        <div className={`${panel} p-4`}><p className="text-[10px] font-bold text-slate-500">惑星割り当て済み</p><p className="mt-1 text-2xl font-black tabular-nums text-cyan-300">{currentCount.toLocaleString('ja-JP')}</p></div>
        <div className={`${panel} p-4`}><p className="text-[10px] font-bold text-slate-500">選択可能な惑星</p><p className="mt-1 text-2xl font-black tabular-nums text-white">50</p></div>
      </div>

      <div className={`${panel} p-3 sm:p-4`}>
        <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5">
          <Search size={16} className="shrink-0 text-slate-500"/>
          <input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="生徒名・学籍番号・クラスで検索" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600"/>
          <span className="whitespace-nowrap text-[10px] text-slate-500">{filtered.length.toLocaleString('ja-JP')}件</span>
        </label>
        {message && <p role="status" className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-800/70 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300"><CheckCircle2 size={14}/>{message}</p>}
        {error && <p role="alert" className="mt-3 flex items-center gap-2 rounded-xl border border-rose-800/70 bg-rose-950/30 px-3 py-2 text-xs text-rose-300"><AlertCircle size={14}/>{error}</p>}
        {truncated && <p className="mt-3 text-[10px] text-amber-300">安全上の上限により、先頭10,000件までを表示しています。検索しても見つからない場合は対象データを確認してください。</p>}
      </div>

      <section className="space-y-3">
        {loading ? <div className={`${panel} flex items-center justify-center gap-2 p-10 text-sm text-slate-400`}><RefreshCw size={16} className="animate-spin"/>ユーザー一覧を読み込んでいます…</div>
          : visibleUsers.length === 0 ? <div className={`${panel} p-10 text-center text-sm text-slate-500`}>該当するユーザーが見つかりません。</div>
          : visibleUsers.map(user => {
            const selectedId = drafts[user.auth_user_id] || user.planet?.planet_asset_id || 'planet-001';
            const changed = user.planet?.planet_asset_id !== selectedId;
            const currentOption = PLANET_OPTIONS.find(option => option.id === user.planet?.planet_asset_id);
            const displayName = user.student_name || '氏名未登録';
            return (
              <article key={user.auth_user_id} className={`${panel} grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(260px,.9fr)] sm:items-center sm:p-4`}>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
                    {user.planet?.planet_asset_id
                      ? <img src={getPlanetSurfaceTextureUrl(user.planet.planet_asset_id)} alt="" className="h-full w-full object-cover"/>
                      : <Orbit size={22} className="text-cyan-300"/>}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-white">{displayName}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{user.student_id || '学籍番号なし'}{user.user_class ? ` · ${user.user_class}` : ''}</p>
                    <p className="mt-1 text-[10px] text-slate-500">現在：{currentOption?.spec.name || (user.planet ? user.planet.planet_asset_id : '未割り当て')}</p>
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-900">
                    <img src={getPlanetSurfaceTextureUrl(selectedId)} alt="" className="h-full w-full object-cover"/>
                  </div>
                  <select value={selectedId} onChange={event => setDrafts(previous => ({ ...previous, [user.auth_user_id]: event.target.value }))} className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-cyan-500">
                    {PLANET_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.id.slice(-3)} · {option.spec.name}</option>)}
                  </select>
                  <button type="button" onClick={() => void savePlanet(user)} disabled={!changed || savingId !== null} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-cyan-700 px-3 py-2.5 text-xs font-black text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-40">
                    {savingId === user.auth_user_id ? <RefreshCw size={13} className="animate-spin"/> : <Save size={13}/>}
                    保存
                  </button>
                </div>
              </article>
            );
          })}
      </section>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2">
        <p className="text-[10px] text-slate-500">表示 {filtered.length ? page * pageSize + 1 : 0}〜{Math.min(filtered.length, (page + 1) * pageSize)} / {filtered.length} 件</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPage(value => Math.max(0, value - 1))} disabled={page <= 0} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-300 disabled:opacity-30">前へ</button>
          <span className="text-[10px] tabular-nums text-slate-500">{page + 1} / {pageCount}</span>
          <button type="button" onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))} disabled={page >= pageCount - 1} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-300 disabled:opacity-30">次へ</button>
        </div>
      </div>

      <p className="text-[10px] leading-5 text-slate-500">惑星の変更では学習XP・貢献XP・知識XP・文明段階・MP・技術ツリーを初期化しません。惑星IDの表示アセットだけを切り替えます。</p>
    </div>
  );
}
