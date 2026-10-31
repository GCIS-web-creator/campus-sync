'use client';

import React, { useEffect, useState } from 'react';
import { Activity, AlertCircle, ArrowLeft, ArrowRight, BookOpen, FileClock, KeyRound, LockKeyhole, LogOut, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Access = 'checking' | 'login' | 'denied' | 'misconfigured' | 'gate' | 'ready';
type Profile = { student_id: string; student_name: string; user_class: string; setup_completed_at: string | null; created_at?: string | null };
type Account = { id: string; email: string | null; created_at: string | null; last_sign_in_at: string | null; email_confirmed_at: string | null; profile: Profile | null };
type Detail = { user: Omit<Account, 'profile'>; profile: Profile | null; counts: { todos: number; assignmentCompletions: number; contributionHistory: number; classMessages: number; schoolMessages: number; lostItems: number } };
type Audit = { id: string; actor_email: string; action: string; target_user_id: string | null; created_at: string };
type Overview = { profiles: number; todos: number; assignments: number; classMessages: number; schoolMessages: number; lostItems: number };

const dateText = (value?: string | null) => value ? new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '記録なし';

export default function HiAdminPage() {
  const [token, setToken] = useState('');
  const [access, setAccess] = useState<Access>('checking');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [hiadminPassword2, setHiadminPassword2] = useState('');
  const [hiadminPassword3, setHiadminPassword3] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'overview' | 'users' | 'audit'>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<Account[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [logs, setLogs] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token || '');
      setEmail(session?.user?.email || '');
    });
    void supabase.auth.getSession().then(({ data: result }) => {
      setToken(result.session?.access_token || '');
      setEmail(result.session?.user?.email || '');
      if (!result.session) setAccess('login');
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const api = async (path: string) => {
    const response = await fetch('/api/hiadmin?' + path, {
      headers: {
        Authorization: 'Bearer ' + token,
        'Cache-Control': 'no-store',
        'X-HiAdmin-Password-2': hiadminPassword2,
        'X-HiAdmin-Password-3': hiadminPassword3,
      },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || 'データを取得できませんでした。') as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return data;
  };

  const checkAccess = async () => {
    try {
      const data = await api('view=overview');
      setOverview(data.summary);
      setAccess('ready');
      setMessage('');
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (status === 401) setAccess('login');
      else if (status === 403) setAccess('denied');
      else if (status === 503) setAccess('misconfigured');
      else if (status === 428 || status === 409 || status === 423) {
        setAccess('gate');
        setMessage(error instanceof Error ? error.message : '追加パスワードを入力してください。');
      } else setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    if (token) void checkAccess();
    else if (access !== 'checking') setAccess('login');
    // checkAccess is intentionally re-evaluated when the signed-in access token changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const signIn = async () => {
    const value = loginEmail.trim().toLowerCase();
    if (!/^[^\s@]+@tokyo\.soka\.ed\.jp$/.test(value)) {
      setMessage('学校のメールアドレスを入力してください。');
      return;
    }
    if (!loginPassword) {
      setMessage('CampusSyncアカウントのパスワードを入力してください。');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: value, password: loginPassword });
      if (error) throw error;
      setLoginEmail(value);
      setLoginPassword('');
      setMessage('アカウント認証済みです。続けて最高管理者専用パスワードを入力してください。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ログインできませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const submitHiAdminGate = async () => {
    if (hiadminPassword2.length < 16 || hiadminPassword3.length < 16) {
      setMessage('追加パスワードはそれぞれ16文字以上にしてください。');
      return;
    }
    if (hiadminPassword2 === hiadminPassword3) {
      setMessage('2つの追加パスワードは別々の文字列にしてください。');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const data = await api('view=overview');
      setOverview(data.summary);
      setAccess('ready');
      setMessage('');
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (status === 401) setAccess('login');
      else if (status === 403) setAccess('denied');
      else if (status === 503) setAccess('misconfigured');
      else setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const loadUsers = async (nextPage = 1, query = search) => {
    setLoading(true); setMessage('');
    try {
      const params = new URLSearchParams({ view: 'users', page: String(nextPage), q: query.trim() });
      const data = await api(params.toString());
      setUsers(data.users || []); setPage(nextPage); setHasMore(Boolean(data.hasMore)); setDetail(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  };

  const loadDetail = async (id: string) => {
    setLoading(true); setMessage('');
    try { const data = await api('view=user&userId=' + encodeURIComponent(id)); setDetail(data.detail); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  };

  const loadLogs = async () => {
    setLoading(true); setMessage('');
    try { const data = await api('view=audit'); setLogs(data.logs || []); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  };

  const changeTab = (next: 'overview' | 'users' | 'audit') => {
    setTab(next);
    if (next === 'users') void loadUsers(1, '');
    if (next === 'audit') void loadLogs();
    if (next === 'overview') void checkAccess();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setToken(''); setAccess('login'); setUsers([]); setDetail(null); setOverview(null);
    setHiadminPassword2(''); setHiadminPassword3(''); setLoginPassword(''); setMessage('ログアウトしました。');
  };

  const summaryCards = [
    ['プロフィール登録', overview?.profiles ?? 0, Users],
    ['登録された提出物', overview?.todos ?? 0, BookOpen],
    ['共通課題', overview?.assignments ?? 0, FileClock],
    ['クラスチャット投稿', overview?.classMessages ?? 0, Activity],
    ['全校チャット投稿', overview?.schoolMessages ?? 0, Activity],
    ['落とし物登録', overview?.lostItems ?? 0, BookOpen],
  ] as const;

  return <main className="min-h-screen bg-slate-950 text-slate-100">
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><ShieldCheck size={25}/></div><div><p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300">CampusSync / Root Console</p><h1 className="text-2xl font-black">最高管理者コンソール</h1><p className="mt-1 text-xs text-slate-400">ユーザーアカウント・登録データ・監査記録</p></div></div>
        {access === 'ready' && <div className="flex items-center gap-3"><span className="hidden text-right text-xs text-slate-300 sm:block">{email}<br/><span className="text-emerald-300">3段階認証済み</span></span><button onClick={() => void signOut()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold"><LogOut size={14}/>ログアウト</button></div>}
      </header>

      {message && <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100"><AlertCircle size={17} className="mt-0.5 shrink-0"/><p>{message}</p></div>}

      {access === 'checking' && <div className="rounded-3xl border border-white/10 p-8 text-center"><RefreshCw className="mx-auto mb-3 animate-spin text-cyan-300"/><p className="font-bold">権限を確認しています…</p></div>}

      {access === 'login' && <section className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div className="mb-5 flex items-center gap-3"><KeyRound className="text-cyan-200"/><div><h2 className="font-black">第1段階：CampusSyncアカウント</h2><p className="text-xs text-slate-400">登録済みの学校メールとパスワードでログインします</p></div></div>
        <label className="mb-1 block text-xs font-bold">学校メールアドレス</label>
        <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} type="email" autoComplete="username" placeholder="学籍番号@tokyo.soka.ed.jp" className="mb-3 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-sm"/>
        <label className="mb-1 block text-xs font-bold">CampusSyncパスワード</label>
        <input value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} type="password" autoComplete="current-password" className="mb-3 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-sm"/>
        <button disabled={busy || !loginEmail || !loginPassword} onClick={() => void signIn()} className="w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-50">{busy ? '確認中…' : '第1段階を認証する'}</button>
        <p className="mt-4 text-[11px] leading-5 text-slate-500">メールOTPだけでは入室できません。既存のアカウントパスワードで認証します。最高管理者として登録されたメールアドレスもサーバー側で照合します。</p>
      </section>}

      {access === 'denied' && <section className="mx-auto max-w-lg rounded-3xl border border-rose-300/20 bg-rose-300/5 p-7 text-center"><LockKeyhole className="mx-auto mb-3 text-rose-300" size={32}/><h2 className="text-lg font-black">アクセスが許可されていません</h2><p className="mt-2 text-sm text-slate-400">このアカウントは最高管理者として登録されていません。</p><button onClick={() => void signOut()} className="mt-5 rounded-xl border border-white/10 px-4 py-2 text-xs">別のアカウントでログイン</button></section>}

      {access === 'misconfigured' && <section className="mx-auto max-w-xl rounded-3xl border border-amber-300/20 bg-amber-300/5 p-7"><h2 className="font-black text-amber-100">最高管理者の初期設定が必要です</h2><p className="mt-2 text-sm leading-6 text-slate-300">VercelのProduction環境変数に <code className="rounded bg-black/30 px-1">CAMPUS_SYNC_HIADMIN_EMAILS</code>、<code className="rounded bg-black/30 px-1">CAMPUS_SYNC_HIADMIN_PASSWORD_2</code>、<code className="rounded bg-black/30 px-1">CAMPUS_SYNC_HIADMIN_PASSWORD_3</code>、<code className="rounded bg-black/30 px-1">SUPABASE_SERVICE_ROLE_KEY</code> を設定してください。2つの追加パスワードは異なる16文字以上の秘密文字列にします。値はチャットに貼らず、Vercelだけに登録してください。</p></section>}

      {access === 'gate' && <section className="mx-auto max-w-md rounded-3xl border border-cyan-300/20 bg-white/[0.04] p-6">
        <div className="mb-5 flex items-center gap-3"><LockKeyhole className="text-cyan-200" size={24}/><div><h2 className="font-black">第2・第3段階：最高管理者専用パスワード</h2><p className="text-xs text-slate-400">{email}</p></div></div>
        <label className="mb-1 block text-xs font-bold">第2パスワード</label>
        <input value={hiadminPassword2} onChange={(e) => setHiadminPassword2(e.target.value)} type="password" autoComplete="off" className="mb-3 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-sm" placeholder="16文字以上"/>
        <label className="mb-1 block text-xs font-bold">第3パスワード</label>
        <input value={hiadminPassword3} onChange={(e) => setHiadminPassword3(e.target.value)} type="password" autoComplete="off" className="mb-3 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-sm" placeholder="16文字以上"/>
        <button disabled={busy || hiadminPassword2.length < 16 || hiadminPassword3.length < 16} onClick={() => void submitHiAdminGate()} className="w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-50">{busy ? '照合中…' : '3段階の認証を完了する'}</button>
        <p className="mt-4 text-[11px] leading-5 text-slate-500">2つの追加パスワードは互いに異なる16文字以上の文字列です。照合はサーバー側で行われ、データベースやブラウザの保存領域には記録しません。5回失敗すると15分間ロックされます。</p>
      </section>}

      {access === 'ready' && <>
        <nav className="mb-6 flex flex-wrap gap-2">{([{id:'overview',label:'概要'},{id:'users',label:'ユーザー管理'},{id:'audit',label:'監査ログ'}] as const).map((item) => <button key={item.id} onClick={() => changeTab(item.id)} className={'rounded-xl border px-4 py-2.5 text-xs font-black ' + (tab === item.id ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100' : 'border-white/10 text-slate-400')}>{item.label}</button>)}</nav>

        {tab === 'overview' && <section><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-black">システムデータ概要</h2><p className="text-xs text-slate-400">個別本文ではなく、管理対象の件数のみ表示します。</p></div><button onClick={() => void checkAccess()} className="rounded-xl border border-white/10 p-2"><RefreshCw size={16}/></button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{summaryCards.map(([label,value,Icon]) => <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><div className="flex justify-between text-xs font-bold text-slate-400"><span>{label}</span><Icon size={18} className="text-cyan-300"/></div><p className="mt-3 text-3xl font-black tabular-nums">{value.toLocaleString('ja-JP')}</p></article>)}</div><div className="mt-5 rounded-2xl border border-emerald-300/15 bg-emerald-300/5 p-4"><div className="flex items-center gap-2 text-emerald-200"><ShieldCheck size={17}/><b className="text-sm">保護状態</b></div><p className="mt-2 text-xs leading-5 text-slate-300">学校メール許可リストと3段階の認証をサーバー側で確認しています。パスワード・ハッシュ・チャット本文は画面に出力しません。</p></div></section>}

        {tab === 'users' && <section><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-black">ユーザーアカウント</h2><p className="text-xs text-slate-400">プロフィール未登録の認証アカウントも含まれます。</p></div><form onSubmit={(e) => {e.preventDefault();void loadUsers(1,search);}} className="flex w-full gap-2 sm:w-auto"><div className="relative min-w-0 flex-1 sm:w-72"><Search size={15} className="absolute left-3 top-3 text-slate-500"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="氏名・学籍番号・メールで検索" className="w-full rounded-xl border border-white/10 bg-slate-900 py-2.5 pl-9 pr-3 text-xs"/></div><button className="rounded-xl bg-cyan-300 px-4 text-xs font-black text-slate-950">検索</button></form></div>
          {detail ? <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><button onClick={() => setDetail(null)} className="mb-5 inline-flex items-center gap-2 text-xs font-bold text-cyan-200"><ArrowLeft size={14}/>一覧に戻る</button><div className="border-b border-white/10 pb-4"><p className="text-[10px] font-black tracking-widest text-cyan-300">USER PROFILE</p><h3 className="mt-1 text-xl font-black">{detail.profile?.student_name || 'プロフィール未登録'}</h3><p className="mt-1 text-xs text-slate-400">{detail.user.email || 'メール未登録'}</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[['学籍番号',detail.profile?.student_id || '未登録'],['クラス',detail.profile?.user_class || '未登録'],['プロフィール登録',dateText(detail.profile?.setup_completed_at)],['アカウント作成',dateText(detail.user.created_at)],['最終ログイン',dateText(detail.user.last_sign_in_at)],['メール確認',detail.user.email_confirmed_at ? '確認済み' : '未確認']].map(([label,value]) => <div key={label} className="rounded-xl bg-slate-900/70 p-3"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-1 text-sm font-bold">{value}</p></div>)}</div><h4 className="mb-3 mt-6 text-sm font-black">登録データ件数</h4><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{[['個人提出物',detail.counts.todos],['共通課題完了記録',detail.counts.assignmentCompletions],['貢献履歴',detail.counts.contributionHistory],['クラスチャット投稿',detail.counts.classMessages],['全校チャット投稿',detail.counts.schoolMessages],['落とし物登録',detail.counts.lostItems]].map(([label,count]) => <div key={String(label)} className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-3"><span className="text-xs text-slate-400">{label}</span><b className="text-sm tabular-nums">{Number(count).toLocaleString('ja-JP')}</b></div>)}</div><p className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-[11px] leading-5 text-amber-100">この初版ではチャット本文・添付ファイル・認証秘密情報を開きません。詳細表示は監査ログに記録されます。</p></div> : <div className="overflow-hidden rounded-2xl border border-white/10"><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-white/[0.04] text-slate-400"><tr><th className="px-4 py-3">ユーザー</th><th className="px-4 py-3">学籍番号</th><th className="px-4 py-3">クラス</th><th className="px-4 py-3">登録日</th><th/></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-t border-white/5"><td className="px-4 py-3"><b>{user.profile?.student_name || 'プロフィール未登録'}</b><p className="mt-1 text-[10px] text-slate-500">{user.email || 'メール未登録'}</p></td><td className="px-4 py-3">{user.profile?.student_id || '—'}</td><td className="px-4 py-3">{user.profile?.user_class || '—'}</td><td className="px-4 py-3 text-slate-400">{dateText(user.created_at)}</td><td className="px-4 py-3"><button onClick={() => void loadDetail(user.id)} className="rounded-lg border border-cyan-300/20 px-3 py-2 font-bold text-cyan-200">詳細</button></td></tr>)}{users.length===0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">該当するユーザーがいません。</td></tr>}</tbody></table></div><div className="flex items-center justify-between border-t border-white/10 p-3"><span className="text-[10px] text-slate-500">ページ {page}</span><div className="flex gap-2"><button disabled={page<=1 || loading} onClick={() => void loadUsers(page-1)} className="rounded-lg border border-white/10 p-2 disabled:opacity-30"><ArrowLeft size={14}/></button><button disabled={!hasMore || loading} onClick={() => void loadUsers(page+1)} className="rounded-lg border border-white/10 p-2 disabled:opacity-30"><ArrowRight size={14}/></button></div></div></div>}
        </section>}

        {tab === 'audit' && <section><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-black">最高管理者の監査ログ</h2><p className="text-xs text-slate-400">個別ユーザー詳細を開いた記録です。</p></div><button onClick={() => void loadLogs()} className="rounded-xl border border-white/10 p-2"><RefreshCw size={16}/></button></div><div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full min-w-[600px] text-left text-xs"><thead className="bg-white/[0.04] text-slate-400"><tr><th className="px-4 py-3">日時</th><th className="px-4 py-3">実行者</th><th className="px-4 py-3">操作</th><th className="px-4 py-3">対象アカウントID</th></tr></thead><tbody>{logs.map((row) => <tr key={row.id} className="border-t border-white/5"><td className="px-4 py-3 text-slate-400">{dateText(row.created_at)}</td><td className="px-4 py-3">{row.actor_email}</td><td className="px-4 py-3 text-cyan-200">{row.action}</td><td className="px-4 py-3 font-mono text-[10px] text-slate-500">{row.target_user_id || '—'}</td></tr>)}{logs.length===0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">監査ログはまだありません。</td></tr>}</tbody></table></div></section>}
        {loading && <p className="mt-4 flex items-center gap-2 text-xs text-cyan-200"><RefreshCw size={14} className="animate-spin"/>読み込み中…</p>}
      </>}
      <footer className="mt-10 border-t border-white/10 pt-4 text-[10px] leading-5 text-slate-600">CampusSync最高管理者専用。権限はサーバー側で検証されます。パスワード・ハッシュ・OTP・TOTPシークレットは管理画面に表示しません。</footer>
    </div>
  </main>;
}
