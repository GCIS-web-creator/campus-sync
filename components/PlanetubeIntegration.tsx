'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeftRight, CheckCircle2, Clock3, Copy, Globe2, Link2, LockKeyhole, Plug, PlayCircle, RefreshCw, ShieldCheck, Unlink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { postPlanetubePing, subscribePlanetubeExtension } from '@/lib/planetube-bridge';

type Connection = {
  id: string;
  status: 'pending' | 'linked' | 'revoked';
  planetube_user_id: string | null;
  approved_scopes: string[];
  planet_level: number | null;
  planet_growth_points: number | null;
  planet_synced_at: string | null;
  last_extension_seen_at: string | null;
  linked_at: string | null;
  updated_at: string;
};
type Scope = 'planet:read' | 'focus:sync' | 'extension:control' | 'contribution:sync';

const SCOPE_OPTIONS: Array<{ id: Scope; title: string; description: string }> = [
  { id: 'planet:read', title: '惑星データの表示', description: 'Planetubeの惑星レベルと成長ポイントをCampusSyncに表示します。' },
  { id: 'focus:sync', title: '集中セッションの同期', description: 'ポモドーロの開始・一時停止・終了時刻だけを共有します。教科名・課題名は送信しません。' },
  { id: 'extension:control', title: 'YouTube制限の自動制御', description: 'ポモドーロ開始時に拡張機能へ制限開始、一時停止・終了時に状態変更を通知します。' },
  { id: 'contribution:sync', title: '学校貢献ポイントの連携（将来機能）', description: '学校貢献ポイントを共有するための予約枠です。現在はまだ送信されません。' },
];

const dateText = (value?: string | null) => value
  ? new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
  : '未取得';

export default function PlanetubeIntegration({ isDarkMode = false }: { isDarkMode?: boolean }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [pairingCode, setPairingCode] = useState('');
  const [pairingExpiresAt, setPairingExpiresAt] = useState('');
  const [extensionStatus, setExtensionStatus] = useState<'checking' | 'ready' | 'missing' | 'disconnected'>('checking');
  const [extensionVersion, setExtensionVersion] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const dark = isDarkMode;

  const panel = dark
    ? 'rounded-2xl border border-slate-700 bg-slate-900/80 p-4 text-slate-100'
    : 'rounded-2xl border border-slate-200 bg-white p-4 text-slate-900';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const button = 'inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50';
  const secondary = 'inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold ' +
    (dark ? 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50');

  const requestApi = useCallback(async (path: string, method = 'GET', body?: unknown) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('CampusSyncにログインし直してください。');
    const response = await fetch(path, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Planetubeとの通信に失敗しました。');
    return result;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await requestApi('/api/planetube/link');
      const next = (data.connection || null) as Connection | null;
      setConnection(next);
      setScopes(((next?.approved_scopes || []) as Scope[]).filter(scope => scope !== 'contribution:sync'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '連携状態を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, [requestApi]);

  useEffect(() => { void load(); }, [load]);

  const sendExtensionHandshakeEvent = useCallback(async (eventType: 'extension_ready' | 'extension_disconnected', version?: string) => {
    try {
      await requestApi('/api/planetube/extension', 'POST', {
        eventType,
        extensionVersion: version || null,
        details: {},
      });
    } catch {
      // 拡張機能が未連携・未許可の状態でも、ページ自体の操作を妨げない。
    }
  }, [requestApi]);

  const pingExtension = useCallback(() => {
    setExtensionStatus('checking');
    postPlanetubePing();
    window.setTimeout(() => {
      setExtensionStatus(current => current === 'checking' ? 'missing' : current);
    }, 1200);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribePlanetubeExtension((event) => {
      if (event.type === 'READY') {
        setExtensionStatus('ready');
        setExtensionVersion(event.extensionVersion || '');
        void sendExtensionHandshakeEvent('extension_ready', event.extensionVersion);
      } else if (event.type === 'DISCONNECTED') {
        setExtensionStatus('disconnected');
        void sendExtensionHandshakeEvent('extension_disconnected');
      }
    });
    pingExtension();
    return unsubscribe;
  }, [pingExtension, sendExtensionHandshakeEvent]);

  const issueCode = async () => {
    setSaving(true); setError(''); setMessage(''); setPairingCode('');
    try {
      const data = await requestApi('/api/planetube/link', 'POST', {});
      setPairingCode(data.pairingCode || '');
      setPairingExpiresAt(data.expiresAt || '');
      await load();
      setMessage('連携コードを発行しました。Planetube側でこのコードを入力してください。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '連携コードを発行できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const saveScopes = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      await requestApi('/api/planetube/link', 'PATCH', { approvedScopes: scopes });
      await load();
      setMessage('データ利用範囲を保存しました。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '権限を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Planetubeとの連携を解除しますか？共有設定と保存済み惑星サマリーを削除します。')) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await requestApi('/api/planetube/link', 'DELETE', {});
      setConnection(null);
      setScopes([]);
      setPairingCode('');
      setPairingExpiresAt('');
      setMessage('Planetubeとの連携を解除しました。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '連携を解除できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(pairingCode);
      setMessage('連携コードをコピーしました。');
    } catch {
      setError('コピーできませんでした。コードを選択してコピーしてください。');
    }
  };

  const isLinked = connection?.status === 'linked';
  const canIssueCode = !isLinked;
  const activeScopeCount = scopes.length;
  const statusText = useMemo(() => {
    if (connection?.status === 'linked') return 'アカウント連携済み';
    if (connection?.status === 'pending') return 'Planetube側の認証待ち';
    if (connection?.status === 'revoked') return '連携解除済み';
    return '未連携';
  }, [connection?.status]);

  return <div className="mx-auto w-full max-w-5xl space-y-5">
    <header className="overflow-hidden rounded-3xl border border-violet-300/20 bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[10px] font-black tracking-[0.28em] text-violet-200">CAMPUSSYNC × PLANETUBE</p>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">Planetube連携センター</h1>
          <p className="mt-2 text-sm leading-6 text-slate-200">集中タイマーとYouTube制限をつなぎ、勉強を続けるほど惑星が育つ体験を目指します。</p>
        </div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10">
          <Globe2 size={30} className="text-violet-100"/>
        </div>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[10px] text-violet-200">ACCOUNT</p><p className="mt-1 text-sm font-black">{statusText}</p></div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[10px] text-violet-200">EXTENSION</p><p className="mt-1 text-sm font-black">{extensionStatus === 'ready' ? '検出済み' : extensionStatus === 'checking' ? '確認中' : '未検出'}</p></div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[10px] text-violet-200">PERMISSIONS</p><p className="mt-1 text-sm font-black">{activeScopeCount} / 4 許可</p></div>
      </div>
    </header>

    {error && <div role="alert" className="rounded-xl border border-rose-300/40 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">{error}</div>}
    {message && <div role="status" className="rounded-xl border border-emerald-300/40 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{message}</div>}

    <div className="grid gap-4 lg:grid-cols-2">
      <section className={panel}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><Link2 size={19} className="text-violet-500"/><h2 className="font-black">① アカウント紐付け</h2></div>
          <button type="button" className={secondary} onClick={() => void load()} disabled={loading || saving}><RefreshCw size={15}/>更新</button>
        </div>
        <p className={'mt-2 text-sm leading-6 ' + muted}>CampusSyncの学校アカウントとPlanetubeのアカウントを、期限付きの一回限りコードで紐付けます。</p>
        <div className={'mt-4 rounded-xl p-4 ' + (dark ? 'bg-slate-800' : 'bg-slate-50')}>
          <p className="text-xs font-bold">現在の状態</p>
          <p className="mt-1 text-lg font-black">{statusText}</p>
          {connection?.linked_at && <p className={'mt-1 text-xs ' + muted}>連携日時：{dateText(connection.linked_at)}</p>}
          {connection?.status === 'pending' && <p className="mt-2 text-xs text-amber-600">Planetube側でコードを確認すると連携が完了します。</p>}
        </div>
        {pairingCode && <div className="mt-4 rounded-xl border border-violet-400/40 bg-violet-50 p-4 text-slate-950">
          <p className="text-xs font-black text-violet-800">今回だけ表示される連携コード</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <code className="break-all text-xl font-black tracking-[0.12em]">{pairingCode}</code>
            <button type="button" onClick={() => void copyCode()} className="rounded-lg border border-violet-200 bg-white p-2 text-violet-900" aria-label="連携コードをコピー"><Copy size={17}/></button>
          </div>
          <p className="mt-2 text-xs text-violet-900">有効期限：{dateText(pairingExpiresAt)}（15分）</p>
        </div>}
        <div className="mt-4 flex flex-wrap gap-2">
          {canIssueCode && <button type="button" className={button} onClick={() => void issueCode()} disabled={saving || loading}><Link2 size={16}/>{connection?.status === 'pending' ? 'コードを再発行' : '連携コードを発行'}</button>}
          {isLinked && <button type="button" className={secondary + ' text-rose-600'} onClick={() => void disconnect()} disabled={saving}><Unlink size={16}/>連携を解除</button>}
        </div>
        {isLinked && scopes.includes('planet:read') && <div className={'mt-4 grid grid-cols-2 gap-2'}>
          <div className={'rounded-xl p-3 ' + (dark ? 'bg-slate-800' : 'bg-slate-50')}><p className={'text-[10px] ' + muted}>Planetube 惑星レベル</p><p className="mt-1 text-2xl font-black">{connection?.planet_level == null ? '—' : 'Lv.' + connection.planet_level}</p></div>
          <div className={'rounded-xl p-3 ' + (dark ? 'bg-slate-800' : 'bg-slate-50')}><p className={'text-[10px] ' + muted}>成長ポイント</p><p className="mt-1 text-2xl font-black">{connection?.planet_growth_points == null ? '—' : connection.planet_growth_points.toLocaleString('ja-JP')}</p></div>
        </div>}
        {connection?.planetube_user_id && <p className={'mt-3 break-all text-[11px] ' + muted}>PlanetubeアカウントID：{connection.planetube_user_id}</p>}
        {loading && <p className={'mt-3 text-xs ' + muted}>連携状態を確認しています…</p>}
      </section>

      <section className={panel}>
        <div className="flex items-center gap-2"><Plug size={19} className="text-cyan-500"/><h2 className="font-black">② 拡張機能・タイマー接続</h2></div>
        <div className={'mt-4 flex items-center gap-3 rounded-xl p-4 ' + (dark ? 'bg-slate-800' : 'bg-slate-50')}>
          <div className={'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ' + (extensionStatus === 'ready' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600')}>
            {extensionStatus === 'ready' ? <CheckCircle2 size={22}/> : <Activity size={22}/>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-black">{extensionStatus === 'ready' ? 'Planetube拡張機能を検出' : extensionStatus === 'checking' ? '拡張機能を確認中' : '拡張機能を検出できません'}</p>
            <p className={'mt-1 text-xs ' + muted}>{extensionStatus === 'ready' ? 'ブラウザ拡張機能とのメッセージ接続ができています。' : '拡張機能のID・配布URLが届いたら接続テストを行います。'}</p>
            {extensionVersion && <p className={'mt-1 text-[10px] ' + muted}>バージョン {extensionVersion}</p>}
          </div>
        </div>
        <button type="button" className={secondary + ' mt-3'} onClick={pingExtension}><RefreshCw size={15}/>拡張機能を再確認</button>
        <div className={'mt-4 rounded-xl border p-3 ' + (dark ? 'border-slate-700' : 'border-slate-200')}>
          <div className="flex items-center gap-2"><PlayCircle size={18} className="text-red-500"/><p className="text-sm font-black">ポモドーロ連動の動作予定</p></div>
          <ol className={'mt-2 space-y-1.5 pl-5 text-xs leading-5 ' + muted}>
            <li>CampusSyncの集中タイマーを開始</li>
            <li>拡張機能へ制限開始コマンドを通知</li>
            <li>一時停止・休憩・再開に合わせて状態を同期</li>
            <li>タイマー終了時に制限解除を通知</li>
          </ol>
        </div>
        <p className={'mt-3 text-[11px] leading-5 ' + muted}>拡張機能はWebページから自動インストールできません。配布ページからのインストール許可と、Planetube拡張機能側の対応が必要です。</p>
      </section>
    </div>

    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><div className="flex items-center gap-2"><LockKeyhole size={19} className="text-emerald-500"/><h2 className="font-black">③ データ利用範囲と権限</h2></div><p className={'mt-1 text-xs ' + muted}>共有する情報を個別に選択できます。初期状態はすべてOFFです。</p></div>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black text-emerald-800"><ShieldCheck size={12} className="mr-1 inline"/>本人の許可が必要</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {SCOPE_OPTIONS.map((item) => {
          const unavailable = item.id === 'contribution:sync';
          const checked = !unavailable && scopes.includes(item.id);
          return <label key={item.id} className={'flex cursor-pointer gap-3 rounded-xl border p-4 ' + (checked ? 'border-cyan-400 bg-cyan-50/70 text-slate-950' : dark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white')}>
            <input type="checkbox" className="mt-1 h-4 w-4 accent-cyan-600" checked={checked} disabled={unavailable} onChange={(event) => setScopes(current => event.target.checked ? [...current, item.id] : current.filter(scope => scope !== item.id))}/>
            <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-black">{item.title}{unavailable && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] text-amber-800">準備中</span>}</span><span className="mt-1 block text-xs leading-5 opacity-75">{item.description}</span></span>
          </label>;
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className={'text-[11px] ' + muted}>許可をOFFにすると、以降の同期・制御リクエストは拒否されます。</p>
        <button type="button" className={button} onClick={() => void saveScopes()} disabled={saving || loading || !connection || connection.status === 'revoked'}>権限を保存</button>
      </div>
    </section>

    <section className={panel}>
      <div className="flex items-center gap-2"><ArrowLeftRight size={19} className="text-violet-500"/><h2 className="font-black">④ データの流れとプライバシー</h2></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className={'rounded-xl p-4 ' + (dark ? 'bg-slate-800' : 'bg-slate-50')}>
          <p className="text-sm font-black">Planetube → CampusSync</p>
          <ul className={'mt-2 space-y-1 text-xs leading-5 ' + muted}><li>・惑星レベル</li><li>・成長ポイント</li><li>・最終同期日時</li></ul>
        </div>
        <div className={'rounded-xl p-4 ' + (dark ? 'bg-slate-800' : 'bg-slate-50')}>
          <p className="text-sm font-black">CampusSync → Planetube</p>
          <ul className={'mt-2 space-y-1 text-xs leading-5 ' + muted}><li>・タイマー状態（開始／一時停止／終了）</li><li>・集中時間の秒数</li><li>・連携用の一時コード</li></ul>
        </div>
      </div>
      <p className={'mt-3 text-xs leading-5 ' + muted}>学校メールアドレス、パスワード、学籍番号、氏名、クラス、課題名、教科名、YouTube視聴履歴やURLは連携APIの送信対象にしません。連携解除はいつでも可能です。</p>
      <div className={'mt-4 flex flex-wrap items-center gap-2 text-[11px] ' + muted}><Clock3 size={14}/>最終拡張機能検出：{dateText(connection?.last_extension_seen_at)}<span className="mx-1">・</span>惑星データ同期：{dateText(connection?.planet_synced_at)}</div>
    </section>
  </div>;
}
