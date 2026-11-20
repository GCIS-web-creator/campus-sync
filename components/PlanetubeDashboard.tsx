'use client';

import React, { useCallback, useEffect, useState } from 'react';
import PlanetubeAchievementBoard from '@/components/PlanetubeAchievementBoard';
import { createClient, type User } from '@supabase/supabase-js';
import {
  Award, BookOpen, Building2, CalendarDays, CheckCircle2, CircleHelp,
  Clock3, Globe2, LockKeyhole, LogOut, RefreshCw, ShieldCheck, Sparkles,
  Sprout, Timer, Orbit,
} from 'lucide-react';

const PLANETUBE_URL = 'https://htpjpdagmbkkoqotdgzt.supabase.co';
// Publishable key only. All table access is still restricted by Planetube RLS.
const PLANETUBE_PUBLISHABLE_KEY = 'sb_publishable_ov9YvLEofcISee8BcKoc5g_EqZSOxvm';
const planetube = createClient(PLANETUBE_URL, PLANETUBE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'sb-htpjpdagmbkkoqotdgzt-auth-token',
  },
});

type Profile = { display_name: string | null } | null;
type Planet = { growth_points: number; level: number; updated_at: string } | null;
type SealSession = {
  id: string;
  started_at: string;
  ended_at: string | null;
  planned_duration_minutes: number;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  is_test: boolean;
};

type CampusStudyStats = {
  focusSeconds: number;
  sessionCount: number;
  studyDays: number;
  subjectCount: number;
  reviewedRanges: number;
};

const EMPTY_CAMPUS_STUDY_STATS: CampusStudyStats = {
  focusSeconds: 0,
  sessionCount: 0,
  studyDays: 0,
  subjectCount: 0,
  reviewedRanges: 0,
};

const normalizeEmail = (value: string | null | undefined) => (value || '').trim().toLowerCase();
const dateTime = (value: string) => new Date(value).toLocaleString('ja-JP', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
});
const statusLabel: Record<SealSession['status'], string> = {
  active: '封印中',
  paused: '一時停止',
  completed: '完了',
  cancelled: 'キャンセル',
};

export default function PlanetubeDashboard({
  campusEmail,
  isDarkMode = false,
  studyStats = EMPTY_CAMPUS_STUDY_STATS,
}: {
  campusEmail: string;
  isDarkMode?: boolean;
  studyStats?: CampusStudyStats;
}) {
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<Profile>(null);
  const [planetData, setPlanetData] = useState<Planet>(null);
  const [recentSessions, setRecentSessions] = useState<SealSession[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [testCount, setTestCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [showAchievements, setShowAchievements] = useState(false);

  const dark = isDarkMode;
  const muted = dark ? 'text-slate-400' : 'text-slate-500';

  const loadPlanetData = useCallback(async (userId: string) => {
    setBusy(true);
    setError('');
    try {
      const [profileResult, planetResult, sessionsResult, completedResult, activeResult, testResult] = await Promise.all([
        planetube.from('ys_profiles').select('display_name').eq('user_id', userId).maybeSingle(),
        planetube.from('ys_planets').select('growth_points,level,updated_at').eq('user_id', userId).maybeSingle(),
        planetube.from('ys_seal_sessions')
          .select('id,started_at,ended_at,planned_duration_minutes,status,is_test', { count: 'exact' })
          .eq('user_id', userId).order('started_at', { ascending: false }).limit(8),
        planetube.from('ys_seal_sessions').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('is_test', false).eq('status', 'completed'),
        planetube.from('ys_seal_sessions').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('is_test', false).in('status', ['active', 'paused']),
        planetube.from('ys_seal_sessions').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('is_test', true),
      ]);
      const issue = profileResult.error || planetResult.error || sessionsResult.error ||
        completedResult.error || activeResult.error || testResult.error;
      if (issue) throw issue;

      setProfile((profileResult.data as Profile) || null);
      setPlanetData((planetResult.data as Planet) || null);
      setRecentSessions((sessionsResult.data || []) as SealSession[]);
      setCompletedCount(completedResult.count || 0);
      setActiveCount(activeResult.count || 0);
      setTestCount(testResult.count || 0);
      setTotalCount(sessionsResult.count || 0);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Planetubeのデータを読み込めませんでした。';
      setError(message);
      throw cause;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      setChecking(true);
      setConnected(false);
      setError('');
      const { data, error: authError } = await planetube.auth.getUser();
      if (!mounted) return;
      if (authError || !data.user) {
        setChecking(false);
        return;
      }

      const expected = normalizeEmail(campusEmail);
      const actual = normalizeEmail(data.user.email);
      if (!expected || !actual || expected !== actual) {
        await planetube.auth.signOut();
        if (mounted) {
          setError('PlanetubeとCampusSyncのメールアドレスが一致しないため、接続を解除しました。');
          setChecking(false);
        }
        return;
      }

      try {
        await loadPlanetData(data.user.id);
        if (mounted) setConnected(true);
      } catch {
        if (mounted) setConnected(false);
      } finally {
        if (mounted) setChecking(false);
      }
    };
    void restore();
    return () => { mounted = false; };
  }, [campusEmail, loadPlanetData]);

  const connect = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = normalizeEmail(campusEmail);
    if (!email) {
      setError('CampusSyncのログインメールアドレスを確認できません。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data, error: signInError } = await planetube.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      const verifiedEmail = normalizeEmail(data.user?.email);
      if (!data.user || verifiedEmail !== email) {
        await planetube.auth.signOut();
        throw new Error('PlanetubeとCampusSyncのメールアドレスが一致しません。');
      }
      await loadPlanetData(data.user.id);
      setPassword('');
      setConnected(true);
    } catch (cause) {
      setConnected(false);
      setError(cause instanceof Error ? cause.message : 'Planetubeに接続できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    await planetube.auth.signOut();
    setConnected(false);
    setProfile(null);
    setPlanetData(null);
    setRecentSessions([]);
    setCompletedCount(0);
    setActiveCount(0);
    setTestCount(0);
    setTotalCount(0);
    setPassword('');
    setError('');
    setBusy(false);
  };

  const refresh = async () => {
    const { data } = await planetube.auth.getUser();
    if (!data.user || normalizeEmail(data.user.email) !== normalizeEmail(campusEmail)) {
      await disconnect();
      setError('アカウントを再確認してください。');
      return;
    }
    try {
      await loadPlanetData(data.user.id);
    } catch {
      // The detailed read error is displayed by loadPlanetData.
    }
  };

  const shell = 'overflow-hidden rounded-[28px] border shadow-2xl ' +
    (dark ? 'border-slate-700 bg-[#08172f]' : 'border-slate-700 bg-[#08172f]');

  return (
    <section className={shell + ' p-3 text-white sm:p-5'}>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#172b4c] px-4 py-3">
        <div>
          <p className="text-sm font-black tracking-[.09em] sm:text-base">CAMPUSSYNC <span className="text-cyan-300">×</span> PLANETUBE</p>
          <p className="text-[8px] tracking-[.2em] text-slate-400">MY LEARNING UNIVERSE / PERSONAL DASHBOARD</p>
        </div>
        {connected ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAchievements(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-200/30 bg-violet-400/15 px-3 py-2 text-[10px] font-black text-violet-100 shadow-[0_0_18px_rgba(192,132,252,.12)] transition hover:bg-violet-300/25"
            >
              <Award size={14}/> Achievements
            </button>
            <div className="flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-[10px] font-bold text-emerald-200">
              <ShieldCheck size={13} /> 同一メール確認済み
              <button type="button" onClick={disconnect} disabled={busy} className="ml-1 rounded-full p-1 hover:bg-white/10" aria-label="Planetubeからログアウト"><LogOut size={13}/></button>
            </div>
          </div>
        ) : (
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold text-slate-300">連携アカウント</span>
        )}
      </header>

      {checking ? (
        <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-300">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
          Planetubeアカウントを確認しています…
        </div>
      ) : !connected ? (
        <div className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
          <div className="relative flex min-h-[300px] flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(ellipse_at_48%_45%,#174a69_0%,#102b4c_38%,#08172f_78%)] p-5">
            <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="relative">
              <p className="text-[9px] font-black tracking-[.2em] text-cyan-200">YOUR LITTLE UNIVERSE</p>
              <h2 className="mt-2 text-2xl font-black">学校生活の成長を、<br/>ひとつの惑星に。</h2>
              <p className="mt-3 max-w-sm text-xs leading-6 text-slate-300">Planetubeアカウントを接続すると、自分の惑星と封印セッションをCampusSync内で確認できます。</p>
            </div>
            <div className="relative flex items-center gap-3 text-cyan-100/80">
              <Globe2 size={42} strokeWidth={1.2}/>
              <div><p className="text-xs font-bold">Your planet, your pace.</p><p className="text-[10px] text-slate-400">自分の記録だけを読み込みます。</p></div>
            </div>
          </div>
          <form onSubmit={connect} className="rounded-2xl border border-white/10 bg-[#102443] p-5">
            <div className="flex items-center gap-2 text-cyan-200"><LockKeyhole size={18}/><span className="text-[10px] font-black tracking-[.16em]">SECURE ACCOUNT LINK</span></div>
            <h2 className="mt-3 text-lg font-black">Planetubeにログイン</h2>
            <p className="mt-2 text-xs leading-5 text-slate-300">CampusSyncと同じメールアドレスのPlanetubeアカウントで認証してください。メールアドレスはCampusSyncのログイン情報から固定して照合します。</p>
            <label className="mt-5 block text-[10px] font-bold text-slate-300">メールアドレス</label>
            <div className="mt-1 rounded-xl border border-white/10 bg-[#091a33] px-3 py-3 text-sm text-slate-200">{campusEmail || 'CampusSyncのメールを取得できません'}</div>
            <label htmlFor="planetube-password" className="mt-4 block text-[10px] font-bold text-slate-300">Planetubeパスワード</label>
            <input id="planetube-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required className="mt-1 w-full rounded-xl border border-slate-600 bg-[#091a33] px-3 py-3 text-sm text-white outline-none focus:border-cyan-300" placeholder="Planetubeのパスワード"/>
            {error && <p role="alert" className="mt-3 rounded-lg border border-rose-300/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">{error}</p>}
            <button type="submit" disabled={busy || !campusEmail} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-[#06172f] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900 border-t-transparent"/> : <ShieldCheck size={16}/>}
              {busy ? '接続しています…' : '本人確認して接続'}
            </button>
            <p className="mt-3 text-[10px] leading-5 text-slate-400">パスワードはCampusSyncには保存されません。Planetubeの本人用RLS権限で読み取ります。Planetubeアカウントが未作成の場合は、先に拡張機能側で登録してください。</p>
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.04fr_1fr]">
            <div className="relative flex min-h-[340px] flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(ellipse_at_50%_44%,#1b4a66_0%,#102b4c_44%,#08172f_78%)] p-4 sm:p-5">
              <div className="absolute inset-0 opacity-40" style={{backgroundImage:'radial-gradient(1px 1px at 12% 18%,#fff 99%,transparent),radial-gradient(1px 1px at 78% 24%,#fff 99%,transparent),radial-gradient(1px 1px at 88% 68%,#fff 99%,transparent),radial-gradient(1px 1px at 24% 74%,#fff 99%,transparent),radial-gradient(2px 2px at 54% 12%,#a5f3fc 99%,transparent)'}}/>
              <div className="absolute left-1/2 top-[47%] h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/20 shadow-[0_0_55px_rgba(45,212,191,.22)] sm:h-64 sm:w-64">
                <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_23%,#d5f7ff_0%,#69b7f4_15%,#3d72df_34%,#3445bd_57%,#25226f_78%,#101638_100%)]"/>
                <div className="absolute inset-[7%] rotate-[-18deg] rounded-full opacity-80" style={{backgroundImage:'radial-gradient(ellipse at 24% 30%,rgba(155,232,255,.75) 0 11%,transparent 12%),radial-gradient(ellipse at 63% 22%,rgba(164,180,255,.55) 0 12%,transparent 13%),radial-gradient(ellipse at 72% 62%,rgba(103,137,255,.45) 0 16%,transparent 17%),radial-gradient(ellipse at 37% 72%,rgba(80,207,255,.35) 0 12%,transparent 13%),radial-gradient(1.5px 1.5px at 49% 24%,#fff 99%,transparent),radial-gradient(1.5px 1.5px at 69% 47%,#d9faff 99%,transparent),radial-gradient(1.5px 1.5px at 32% 59%,#d9faff 99%,transparent)'}}/>
                <div className="absolute -bottom-2 left-[18%] right-[16%] h-12 rounded-[50%] bg-cyan-300/20 blur-xl"/>
              </div>
              <div className="absolute left-[12%] top-[25%] rounded-full border border-amber-200/30 bg-[#122e50]/80 p-2 text-amber-200 shadow-lg"><BookOpen size={20}/></div>
              <div className="absolute right-[14%] top-[22%] rounded-full border border-cyan-200/30 bg-[#122e50]/80 p-2 text-cyan-200 shadow-lg"><CalendarDays size={19}/></div>
              <div className="absolute bottom-[25%] right-[13%] rounded-full border border-emerald-200/30 bg-[#122e50]/80 p-2 text-emerald-200 shadow-lg"><Sprout size={19}/></div>
              <div className="absolute left-[16%] top-[44%] h-28 w-[68%] rotate-[-15deg] rounded-[50%] border border-cyan-200/35"/>
              <div className="relative flex items-start justify-between">
                <div><p className="text-[9px] font-black tracking-[.2em] text-cyan-200">YOUR WORLD</p><h2 className="mt-1 text-lg font-black">{profile?.display_name || 'あなたの惑星'}</h2></div>
                <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[9px] font-bold text-cyan-100"><Sparkles size={11} className="mr-1 inline"/>LIVE DATA</span>
              </div>
              <div className="relative rounded-xl border border-white/15 bg-[#0b1d37]/85 p-3 backdrop-blur-sm">
                <p className="text-sm font-black">あなたの惑星</p>
                <p className="mt-1 text-[10px] leading-5 text-slate-300">学習や日々の小さな積み重ねが、あなたの世界を育てます。</p>
              </div>
            </div>

            <div className="space-y-3">
              <section className="rounded-2xl border border-sky-200/15 bg-[#142c4d] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div><p className="text-[9px] font-black tracking-[.16em] text-cyan-200">PLANET STATUS</p><h2 className="mt-1 text-xl font-black">惑星レベル {planetData?.level ?? '—'}</h2></div>
                  <span className="rounded-full border border-cyan-200/20 bg-cyan-300/10 p-2 text-cyan-200"><Globe2 size={20}/></span>
                </div>
                <p className="mt-2 text-[10px] text-slate-400">成長ポイント</p>
                <p className="text-lg font-black text-amber-200">{planetData ? planetData.growth_points.toLocaleString('ja-JP') : '惑星データ未作成'}</p>
                {planetData && <p className="mt-1 text-[9px] text-slate-400">最終更新：{dateTime(planetData.updated_at)}</p>}
              </section>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/10 bg-[#142c4d] p-2.5"><span className="mb-2 block h-3 w-3 rounded-full bg-blue-400"/><p className="text-[10px] font-black">学習XP</p><p className="mt-2 text-[9px] font-bold text-slate-400">連携準備中</p></div>
                <div className="rounded-xl border border-white/10 bg-[#142c4d] p-2.5"><span className="mb-2 block h-3 w-3 rounded-full bg-amber-400"/><p className="text-[10px] font-black">学校貢献PT</p><p className="mt-2 text-[9px] font-bold text-slate-400">承認機能待ち</p></div>
                <div className="rounded-xl border border-white/10 bg-[#142c4d] p-2.5"><span className="mb-2 block h-3 w-3 rounded-full bg-emerald-400"/><p className="text-[10px] font-black">知識XP</p><p className="mt-2 text-[9px] font-bold text-slate-400">連携準備中</p></div>
              </div>

              <section className="rounded-2xl border border-white/10 bg-[#142c4d] p-3">
                <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-xs font-black">封印セッションの統計</h3><button type="button" onClick={refresh} disabled={busy} className="rounded-lg p-1.5 text-cyan-200 hover:bg-white/10" aria-label="Planetubeデータを更新"><RefreshCw size={14} className={busy?'animate-spin':''}/></button></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-[#0b1d37]/80 p-2"><p className="text-[9px] text-slate-400">完了した封印</p><p className="mt-1 text-lg font-black">{completedCount}</p></div>
                  <div className="rounded-lg bg-[#0b1d37]/80 p-2"><p className="text-[9px] text-slate-400">現在進行中</p><p className="mt-1 text-lg font-black">{activeCount}</p></div>
                  <div className="rounded-lg bg-[#0b1d37]/80 p-2"><p className="text-[9px] text-slate-400">TEST記録</p><p className="mt-1 text-lg font-black">{testCount}</p></div>
                  <div className="rounded-lg bg-[#0b1d37]/80 p-2"><p className="text-[9px] text-slate-400">全記録</p><p className="mt-1 text-lg font-black">{totalCount}</p></div>
                </div>
              </section>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.04fr_.96fr]">
            <section className="rounded-2xl border border-white/10 bg-[#142c4d] p-4">
              <div className="mb-3 flex items-center gap-2"><Clock3 size={16} className="text-cyan-200"/><h3 className="text-sm font-black">最近の活動</h3></div>
              {recentSessions.length ? <div className="space-y-2">{recentSessions.map(session => (
                <article key={session.id} className="flex items-start justify-between gap-3 rounded-xl bg-[#0b1d37]/75 p-3">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={'h-2 w-2 rounded-full '+(session.is_test?'bg-amber-400':session.status==='completed'?'bg-cyan-400':'bg-emerald-400')}/><p className="text-xs font-bold">{statusLabel[session.status]}</p>{session.is_test&&<span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[8px] font-black text-amber-200">TEST</span>}</div><p className="mt-1 text-[10px] text-slate-400">{dateTime(session.started_at)}</p></div>
                  <p className="shrink-0 text-xs font-black text-cyan-100">{session.planned_duration_minutes}分</p>
                </article>
              ))}</div> : <div className="rounded-xl border border-dashed border-white/15 p-4 text-center text-xs text-slate-400">封印セッションの記録はまだありません。</div>}
              <p className="mt-3 text-[9px] leading-4 text-slate-500">直近8件を表示しています。TEST記録は通常の実績と区別しています。</p>
            </section>
            <section className="rounded-2xl border border-white/10 bg-[#142c4d] p-4">
              <div className="mb-3 flex items-center gap-2"><Orbit size={17} className="text-amber-200"/><h3 className="text-sm font-black">共同ミッション</h3></div>
              <div className="flex min-h-[150px] flex-col items-center justify-center rounded-xl bg-[#0b1d37]/75 p-4 text-center">
                <CircleHelp size={28} className="text-slate-500"/>
                <p className="mt-3 text-sm font-black">共同ミッションは準備中</p>
                <p className="mt-2 max-w-xs text-[10px] leading-5 text-slate-400">現在確認できるPlanetubeのデータには、クラス・学校全体のミッション情報がありません。対応テーブルが用意された段階で表示します。</p>
              </div>
            </section>
          </div>
          {error && <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[9px] text-slate-500"><span>CONNECTED TO PLANETUBE · TOKYO</span><span>読み取り専用 · YouTube閲覧履歴は取得しません</span></div>
        </div>
      )}
      {!connected && error && !checking && <p role="alert" className="mt-3 rounded-xl border border-rose-300/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">{error}</p>}
      {!connected && <p className="mt-4 text-center text-[9px] text-slate-500">Planetubeのアカウント情報と封印セッションのみ読み込みます。CampusSyncやPlanetubeの学習・活動データは変更しません。</p>}
      {showAchievements && connected && (
        <PlanetubeAchievementBoard
          onClose={() => setShowAchievements(false)}
          planetLevel={planetData?.level ?? null}
          growthPoints={planetData?.growth_points ?? 0}
          completedSeals={completedCount}
          sealRecords={Math.max(0, totalCount - testCount)}
          studyStats={studyStats}
        />
      )}
    </section>
  );
}
