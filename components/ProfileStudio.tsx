'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ContributionRankBadge } from '@/components/ContributionRanks';
import { BadgeCheck, BookOpen, Check, ChevronLeft, Compass, Eye, EyeOff, Lock, Medal, Palette, RefreshCw, Search, ShieldCheck, Sparkles, Star, UserRound, Users } from 'lucide-react';

type ProfileDraft = {
  display_name: string;
  bio: string;
  avatar_emoji: string;
  avatar_url: string;
  banner_theme: string;
  banner_url: string;
  name_style: string;
  name_font: string;
  frame_style: string;
  avatar_effect: string;
  is_public: boolean;
  show_class: boolean;
  class_label: string;
  equipped_badges: string[];
  contribution_points: number;
};

type PublicProfile = ProfileDraft & {
  user_id: string;
  updated_at?: string;
};

type Metrics = {
  study_sessions: number;
  focus_minutes: number;
  approved_contributions: number;
};

const DEFAULT_PROFILE: ProfileDraft = {
  display_name: 'CampusSyncユーザー',
  bio: '',
  avatar_emoji: '🌸',
  avatar_url: '',
  banner_theme: 'aurora',
  banner_url: '',
  name_style: 'gradient',
  name_font: 'rounded',
  frame_style: 'basic',
  avatar_effect: 'none',
  is_public: false,
  show_class: false,
  class_label: '',
  equipped_badges: [],
  contribution_points: 0,
};

const AVATARS = ['🌸', '🌙', '⭐', '🪐', '🐈', '🦊', '🐬', '🐧', '🦋', '🌻', '🎧', '📚', '🎮', '🍀', '☁️', '💎'];
const BANNERS = [
  { id: 'aurora', label: 'オーロラ' },
  { id: 'ocean', label: 'オーシャン' },
  { id: 'sunset', label: 'サンセット' },
  { id: 'midnight', label: 'ミッドナイト' },
  { id: 'sakura', label: 'さくら' },
];
const NAME_STYLES = [
  { id: 'solid', label: 'Solid', description: '単色' },
  { id: 'gradient', label: 'Gradient', description: 'グラデーション' },
  { id: 'neon', label: 'Neon', description: '発光' },
  { id: 'toon', label: 'Toon', description: 'ポップな縁取り' },
  { id: 'pop', label: 'Pop', description: 'カラフル' },
];
const NAME_FONTS = [
  { id: 'rounded', label: 'Rounded', sample: 'やわらか' },
  { id: 'sans', label: 'Sans', sample: 'すっきり' },
  { id: 'serif', label: 'Serif', sample: 'クラシック' },
  { id: 'mono', label: 'Mono', sample: 'テック' },
];

const COSMETICS = [
  { id: 'badge_first_study', category: 'badge', name: 'はじめの一歩', icon: '📚', detail: '学習セッションを1回完了', target: 1, metric: 'study_sessions' },
  { id: 'frame_aurora', category: 'frame', name: 'オーロラフレーム', icon: '🌌', detail: '学習セッションを5回完了', target: 5, metric: 'study_sessions' },
  { id: 'badge_study_10', category: 'badge', name: '学びの継続者', icon: '🔥', detail: '学習セッションを10回完了', target: 10, metric: 'study_sessions' },
  { id: 'effect_sparkle', category: 'effect', name: 'スターライト', icon: '✨', detail: '学習時間が合計120分に到達', target: 120, metric: 'focus_minutes' },
  { id: 'badge_contribution_3', category: 'badge', name: 'キャンパスサポーター', icon: '🌟', detail: '貢献ポイント獲得の記録が3件', target: 3, metric: 'approved_contributions' },
  { id: 'frame_prism', category: 'frame', name: 'プリズムフレーム', icon: '💎', detail: '貢献ポイント獲得の記録が3件', target: 3, metric: 'approved_contributions' },
] as const;

const PROFILE_CSS = [
  '.ps-card{position:relative;overflow:hidden;border-radius:26px;background:#09152d;color:#f8fafc;box-shadow:0 18px 48px rgba(15,23,42,.2)}',
  '.ps-banner{height:150px;position:relative;overflow:hidden;background-size:cover;background-position:center}',
  '.ps-banner-aurora{background-image:radial-gradient(ellipse at 18% 20%,rgba(80,230,255,.9),transparent 34%),radial-gradient(ellipse at 82% 8%,rgba(220,120,255,.75),transparent 40%),linear-gradient(125deg,#102c65,#254b91 48%,#251b5e)}',
  '.ps-banner-ocean{background-image:radial-gradient(ellipse at 20% 10%,rgba(90,220,255,.75),transparent 36%),linear-gradient(125deg,#073763,#0f78a6 55%,#082f49)}',
  '.ps-banner-sunset{background-image:radial-gradient(ellipse at 80% 10%,rgba(255,231,153,.85),transparent 34%),linear-gradient(125deg,#7c2d5a,#c65b75 48%,#f59e0b)}',
  '.ps-banner-midnight{background-image:radial-gradient(ellipse at 48% 4%,rgba(129,140,248,.65),transparent 38%),linear-gradient(125deg,#111827,#20285b 55%,#090c20)}',
  '.ps-banner-sakura{background-image:radial-gradient(ellipse at 25% 10%,rgba(255,205,231,.9),transparent 34%),linear-gradient(125deg,#743d70,#c06b9a 52%,#56357c)}',
  '.ps-banner:after{content:"✦  ·  ✧       ✦       ·  ✧";position:absolute;inset:18px 22px auto auto;color:rgba(255,255,255,.75);font-size:22px;letter-spacing:12px;pointer-events:none}',
  '.ps-profile-body{position:relative;padding:0 20px 20px;background:linear-gradient(180deg,#102344,#101936 65%,#0d1730)}',
  '.ps-avatar-wrap{position:relative;width:98px;height:98px;margin-top:-48px;border-radius:50%;padding:4px;background:linear-gradient(135deg,#67e8f9,#818cf8,#f0abfc);box-shadow:0 8px 30px rgba(0,0,0,.3)}',
  '.ps-avatar-wrap.ps-frame-aurora{background:linear-gradient(135deg,#67e8f9,#a78bfa,#f0abfc,#67e8f9);background-size:250% 250%;animation:ps-frame-flow 5s ease infinite}',
  '.ps-avatar-wrap.ps-frame-prism{background:conic-gradient(from 0deg,#f0abfc,#67e8f9,#fcd34d,#a78bfa,#f0abfc);animation:ps-spin 9s linear infinite}',
  '.ps-avatar-inner{display:flex;width:100%;height:100%;align-items:center;justify-content:center;overflow:hidden;border:3px solid rgba(255,255,255,.8);border-radius:50%;background:linear-gradient(145deg,#243b66,#172343);font-size:42px}',
  '.ps-avatar-inner img{width:100%;height:100%;object-fit:cover}',
  '.ps-avatar-sparkle:after{content:"✦";position:absolute;right:-5px;top:0;color:#bae6fd;font-size:28px;text-shadow:0 0 14px #67e8f9;animation:ps-twinkle 1.8s ease-in-out infinite}',
  '.ps-name-solid{color:#fff}.ps-name-gradient{background:linear-gradient(90deg,#a5f3fc,#c4b5fd,#f9a8d4);-webkit-background-clip:text;background-clip:text;color:transparent}.ps-name-neon{color:#cffafe;text-shadow:0 0 6px #22d3ee,0 0 18px #818cf8}.ps-name-toon{color:#fff;text-shadow:2px 2px 0 #7c3aed,-1px -1px 0 #0891b2}.ps-name-pop{color:#fde68a;text-shadow:0 0 12px rgba(251,191,36,.35);letter-spacing:.04em}',
  '.ps-font-rounded{font-family:ui-rounded,"Hiragino Maru Gothic ProN",sans-serif}.ps-font-sans{font-family:ui-sans-serif,system-ui,sans-serif}.ps-font-serif{font-family:ui-serif,Georgia,serif}.ps-font-mono{font-family:ui-monospace,SFMono-Regular,monospace}',
  '.ps-badge{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(191,219,254,.22);border-radius:999px;background:rgba(255,255,255,.08);padding:6px 10px;font-size:11px;font-weight:800;color:#e0f2fe}',
  '.ps-frame-flow{animation:ps-frame-flow 5s ease infinite}.ps-twinkle{animation:ps-twinkle 1.8s ease-in-out infinite}',
  '@keyframes ps-frame-flow{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}@keyframes ps-spin{to{transform:rotate(360deg)}}@keyframes ps-twinkle{0%,100%{opacity:.45;transform:scale(.8)}50%{opacity:1;transform:scale(1.12)}}',
  '@media(prefers-reduced-motion:reduce){.ps-frame-flow,.ps-twinkle,.ps-avatar-wrap.ps-frame-aurora,.ps-avatar-wrap.ps-frame-prism{animation:none!important}}',
].join('\n');

function safeHttpsUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function fromRow(row: any, fallbackClass: string): ProfileDraft {
  return {
    display_name: String(row?.display_name || 'CampusSyncユーザー'),
    bio: String(row?.bio || ''),
    avatar_emoji: String(row?.avatar_emoji || '🌸'),
    avatar_url: String(row?.avatar_url || ''),
    banner_theme: String(row?.banner_theme || 'aurora'),
    banner_url: String(row?.banner_url || ''),
    name_style: String(row?.name_style || 'gradient'),
    name_font: String(row?.name_font || 'rounded'),
    frame_style: String(row?.frame_style || 'basic'),
    avatar_effect: String(row?.avatar_effect || 'none'),
    is_public: Boolean(row?.is_public),
    show_class: Boolean(row?.show_class),
    class_label: String(row?.class_label || fallbackClass || ''),
    equipped_badges: Array.isArray(row?.equipped_badges) ? row.equipped_badges : [],
    contribution_points: Math.max(0, Number(row?.contribution_points) || 0),
  };
}

function ProfileCard({ profile, compact = false }: { profile: ProfileDraft; compact?: boolean }) {
  const avatarUrl = safeHttpsUrl(profile.avatar_url);
  const bannerUrl = safeHttpsUrl(profile.banner_url);
  const bannerStyle = bannerUrl ? { backgroundImage: 'linear-gradient(135deg,rgba(8,18,44,.12),rgba(8,18,44,.5)),url("' + bannerUrl.replace(/"/g, '%22') + '")' } : undefined;
  const nameStyleClass = 'ps-name-' + profile.name_style;
  const fontClass = 'ps-font-' + profile.name_font;
  const frameClass = profile.frame_style === 'aurora' ? 'ps-frame-aurora' : profile.frame_style === 'prism' ? 'ps-frame-prism' : '';
  const badges = COSMETICS.filter(item => item.category === 'badge' && profile.equipped_badges.includes(item.id));
  return (
    <div className="ps-card">
      <div className={'ps-banner ps-banner-' + profile.banner_theme} style={bannerStyle}>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0e1a35]/75" />
        {!compact && <span className="absolute bottom-3 right-4 rounded-full border border-white/20 bg-slate-950/25 px-3 py-1 text-[9px] font-black tracking-[.2em] text-white/80">CAMPUSSYNC PROFILE</span>}
      </div>
      <div className="ps-profile-body">
        <div className="flex items-end justify-between gap-3">
          <div className={'ps-avatar-wrap ' + frameClass + (profile.avatar_effect === 'sparkle' ? ' ps-avatar-sparkle' : '')}>
            <div className="ps-avatar-inner">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{profile.avatar_emoji || '🌸'}</span>}
            </div>
          </div>
          {profile.is_public && <span className="mb-2 inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-200"><Eye size={12} /> 公開中</span>}
        </div>
        <div className="mt-3 min-w-0">
          <h3 className={'break-words text-2xl font-black tracking-tight ' + nameStyleClass + ' ' + fontClass}>{profile.display_name || '名前未設定'}</h3>
          {profile.show_class && profile.class_label && <p className="mt-1 text-[11px] font-bold text-slate-300/75">{profile.class_label}組</p>}
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200/85">{profile.bio || '自己紹介はまだ設定されていません。'}</p>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.04] p-2.5">
          <ContributionRankBadge points={profile.contribution_points} compact />
        </div>
        {badges.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {badges.map(badge => <span key={badge.id} className="ps-badge"><span>{badge.icon}</span>{badge.name}</span>)}
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3 text-[10px] font-semibold text-slate-300/65">
          <span>CampusSync</span><span>・</span><span>学びと活動の記録</span>
        </div>
      </div>
    </div>
  );
}

export default function ProfileStudio({
  userId,
  studentName,
  userClass,
  studentId,
  contributionPoints = 0,
  isDarkMode = false,
}: {
  userId: string;
  studentName: string;
  userClass: string;
  studentId: string;
  contributionPoints?: number;
  isDarkMode?: boolean;
}) {
  const [profile, setProfile] = useState<ProfileDraft>(DEFAULT_PROFILE);
  const [metrics, setMetrics] = useState<Metrics>({ study_sessions: 0, focus_minutes: 0, approved_contributions: 0 });
  const [unlockedIds, setUnlockedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [activeView, setActiveView] = useState<'edit' | 'discover'>('edit');
  const [directory, setDirectory] = useState<PublicProfile[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<PublicProfile | null>(null);

  const darkCard = isDarkMode ? 'border-slate-700 bg-slate-800 text-slate-100' : 'border-slate-200 bg-white text-slate-800';
  const muted = isDarkMode ? 'text-slate-400' : 'text-slate-500';

  const loadOwnProfile = useCallback(async () => {
    setLoading(true);
    setMessage('');
    const [profileResult, studyResult, contributionResult] = await Promise.all([
      supabase.from('student_profile_customizations').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('student_study_sessions').select('focus_seconds,ended_at').eq('user_id', userId),
      supabase.from('contribution_history').select('delta').eq('student_id', studentId),
    ]);

    if (profileResult.error) {
      console.error('プロフィール設定の読み込みに失敗:', profileResult.error);
      setMessage('プロフィール機能のデータベース設定を確認してください。');
    } else if (profileResult.data) {
      setProfile(fromRow(profileResult.data, userClass));
    } else {
      setProfile({ ...DEFAULT_PROFILE, display_name: 'CampusSyncユーザー', class_label: userClass, contribution_points: contributionPoints });
    }

    if (studyResult.error || contributionResult.error) {
      console.warn('プロフィール実績の読み込みに失敗:', studyResult.error || contributionResult.error);
    } else {
      const studyRows = studyResult.data || [];
      const contributionRows = contributionResult.data || [];
      setMetrics({
        study_sessions: studyRows.filter((row: any) => row.ended_at && Number(row.focus_seconds) > 0).length,
        focus_minutes: Math.floor(studyRows.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.focus_seconds) || 0), 0) / 60),
        approved_contributions: contributionRows.filter((row: any) => Number(row.delta) > 0).length,
      });
    }

    const unlockResult = await supabase.from('student_profile_unlocks').select('cosmetic_id').eq('user_id', userId);
    if (unlockResult.error) {
      console.warn('プロフィール装飾の読み込みに失敗:', unlockResult.error);
    } else {
      setUnlockedIds((unlockResult.data || []).map((row: any) => String(row.cosmetic_id)));
    }
    setLoading(false);
  }, [userId, userClass, studentId, contributionPoints]);

  useEffect(() => {
    void loadOwnProfile();
  }, [loadOwnProfile]);

  const loadDirectory = useCallback(async () => {
    setDirectoryLoading(true);
    setSelectedProfile(null);
    let query = supabase
      .from('student_profile_customizations')
      .select('user_id,display_name,bio,avatar_emoji,avatar_url,banner_theme,banner_url,name_style,name_font,frame_style,avatar_effect,is_public,show_class,class_label,equipped_badges,contribution_points,updated_at')
      .eq('is_public', true)
      .order('updated_at', { ascending: false })
      .limit(60);
    if (searchText.trim()) query = query.ilike('display_name', '%' + searchText.trim().replace(/[%_,]/g, ' ') + '%');
    const { data, error } = await query;
    if (error) {
      console.error('公開プロフィールの検索に失敗:', error);
      setMessage('公開プロフィールを読み込めませんでした。');
      setDirectory([]);
    } else {
      setDirectory((data || []).map((row: any) => ({ ...fromRow(row, ''), user_id: String(row.user_id), updated_at: row.updated_at })));
    }
    setDirectoryLoading(false);
  }, [searchText]);

  useEffect(() => {
    if (activeView === 'discover') void loadDirectory();
  }, [activeView, loadDirectory]);

  const unlockedCosmetics = useMemo(
    () => COSMETICS.filter(item => unlockedIds.includes(item.id)),
    [unlockedIds],
  );

  const saveProfile = async () => {
    const cleanName = profile.display_name.trim().slice(0, 32);
    const cleanBio = profile.bio.trim().slice(0, 160);
    const avatarUrl = safeHttpsUrl(profile.avatar_url);
    const bannerUrl = safeHttpsUrl(profile.banner_url);
    if (!cleanName) {
      setMessage('プロフィール名を入力してください。');
      return;
    }
    if (profile.avatar_url.trim() && !avatarUrl) {
      setMessage('アイコン画像URLはHTTPSのURLを入力してください。');
      return;
    }
    if (profile.banner_url.trim() && !bannerUrl) {
      setMessage('バナー画像URLはHTTPSのURLを入力してください。');
      return;
    }
    setSaving(true);
    setMessage('');
    const payload = {
      user_id: userId,
      display_name: cleanName,
      bio: cleanBio,
      avatar_emoji: AVATARS.includes(profile.avatar_emoji) ? profile.avatar_emoji : '🌸',
      avatar_url: avatarUrl || null,
      banner_theme: BANNERS.some(item => item.id === profile.banner_theme) ? profile.banner_theme : 'aurora',
      banner_url: bannerUrl || null,
      name_style: NAME_STYLES.some(item => item.id === profile.name_style) ? profile.name_style : 'gradient',
      name_font: NAME_FONTS.some(item => item.id === profile.name_font) ? profile.name_font : 'rounded',
      frame_style: ['basic', 'aurora', 'prism'].includes(profile.frame_style) ? profile.frame_style : 'basic',
      avatar_effect: ['none', 'sparkle'].includes(profile.avatar_effect) ? profile.avatar_effect : 'none',
      is_public: Boolean(profile.is_public),
      show_class: Boolean(profile.is_public && profile.show_class),
      class_label: profile.is_public && profile.show_class ? userClass : null,
      equipped_badges: profile.equipped_badges.filter(id => unlockedIds.includes(id) && COSMETICS.some(item => item.id === id && item.category === 'badge')),
      contribution_points: profile.contribution_points,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('student_profile_customizations').upsert(payload, { onConflict: 'user_id' });
    if (error) {
      console.error('プロフィール保存に失敗:', error);
      setMessage(error.message.includes('まだ解放') ? error.message : '保存できませんでした。時間をおいて再度お試しください。');
    } else {
      setProfile(fromRow(payload, userClass));
      setMessage('プロフィールを保存しました。');
    }
    setSaving(false);
  };

  const toggleBadge = (id: string) => {
    setProfile(prev => ({
      ...prev,
      equipped_badges: prev.equipped_badges.includes(id)
        ? prev.equipped_badges.filter(item => item !== id)
        : prev.equipped_badges.concat(id).slice(0, 5),
    }));
  };

  const metricValue = (metric: string) => {
    if (metric === 'study_sessions') return metrics.study_sessions;
    if (metric === 'focus_minutes') return metrics.focus_minutes;
    return metrics.approved_contributions;
  };

  const sectionTitle = activeView === 'edit' ? 'プロフィールカスタマイズ' : 'みんなのプロフィール';
  return (
    <div className="space-y-5">
      <style>{PROFILE_CSS}</style>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-500">CampusSync / Identity</p>
          <h2 className={'mt-1 text-2xl font-black tracking-tight ' + (isDarkMode ? 'text-white' : 'text-slate-900')}>{sectionTitle}</h2>
          <p className={'mt-1 text-xs ' + muted}>プロフィールを自分らしく整えて、達成した実績で装飾を増やそう。</p>
        </div>
        <button type="button" onClick={() => { setActiveView(activeView === 'edit' ? 'discover' : 'edit'); setMessage(''); }} className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-500/10 px-3 py-2.5 text-xs font-black text-cyan-600 transition hover:bg-cyan-500/15">
          {activeView === 'edit' ? <><Users size={15} /> 他のプロフィールを見る</> : <><Palette size={15} /> 自分のプロフィールを編集</>}
        </button>
      </div>

      {message && <div role="status" className={'rounded-xl border px-3 py-2.5 text-xs font-bold ' + (message.includes('保存しました') ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-900')}>{message}</div>}

      {activeView === 'edit' ? (
        loading ? (
          <div className={'rounded-2xl border p-8 text-center text-sm ' + darkCard}><RefreshCw size={20} className="mx-auto mb-2 animate-spin" />プロフィールを読み込み中…</div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(330px,.9fr)]">
            <div className="space-y-4">
              <section className={'rounded-2xl border p-4 sm:p-5 ' + darkCard}>
                <div className="mb-4 flex items-center gap-2"><UserRound size={18} className="text-cyan-500" /><h3 className="text-sm font-black">基本プロフィール</h3></div>
                <label className={'mb-1 block text-[11px] font-bold ' + muted}>表示名（本名ではなくニックネーム推奨）</label>
                <input value={profile.display_name} maxLength={32} onChange={event => setProfile(prev => ({ ...prev, display_name: event.target.value }))} className="w-full rounded-xl border border-slate-300/40 bg-slate-500/5 px-3 py-2.5 text-sm font-bold outline-none focus:border-cyan-400" placeholder="例：saku" />
                <div className="mt-4">
                  <label className={'mb-1 block text-[11px] font-bold ' + muted}>自己紹介（160文字まで）</label>
                  <textarea value={profile.bio} maxLength={160} rows={3} onChange={event => setProfile(prev => ({ ...prev, bio: event.target.value }))} className="w-full resize-y rounded-xl border border-slate-300/40 bg-slate-500/5 px-3 py-2.5 text-sm outline-none focus:border-cyan-400" placeholder="好きなこと、CampusSyncで取り組んでいることなど" />
                  <p className={'mt-1 text-right text-[10px] ' + muted}>{profile.bio.length}/160</p>
                </div>
                <div className="mt-4">
                  <p className={'mb-2 text-[11px] font-bold ' + muted}>アイコン</p>
                  <div className="flex flex-wrap gap-2">
                    {AVATARS.map(avatar => <button type="button" key={avatar} onClick={() => setProfile(prev => ({ ...prev, avatar_emoji: avatar, avatar_url: '' }))} aria-pressed={profile.avatar_emoji === avatar && !profile.avatar_url} className={'flex h-10 w-10 items-center justify-center rounded-xl border text-xl transition ' + (profile.avatar_emoji === avatar && !profile.avatar_url ? 'border-cyan-400 bg-cyan-500/15 ring-2 ring-cyan-400/20' : 'border-slate-300/30 bg-slate-500/5 hover:bg-slate-500/10')}>{avatar}</button>)}
                  </div>
                  <label className={'mt-3 block text-[10px] font-bold ' + muted}>画像URL（任意・HTTPSのみ）</label>
                  <input value={profile.avatar_url} onChange={event => setProfile(prev => ({ ...prev, avatar_url: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300/40 bg-slate-500/5 px-3 py-2 text-xs outline-none focus:border-cyan-400" placeholder="https://example.com/avatar.png" />
                </div>
              </section>

              <section className={'rounded-2xl border p-4 sm:p-5 ' + darkCard}>
                <div className="mb-4 flex items-center gap-2"><Palette size={18} className="text-violet-500" /><h3 className="text-sm font-black">名前のフォント・デコ</h3></div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {NAME_STYLES.map(style => <button key={style.id} type="button" onClick={() => setProfile(prev => ({ ...prev, name_style: style.id }))} className={'rounded-xl border p-3 text-left transition ' + (profile.name_style === style.id ? 'border-cyan-400 bg-cyan-500/10 ring-1 ring-cyan-400/20' : 'border-slate-300/30 bg-slate-500/5 hover:bg-slate-500/10')}><span className={'block text-sm font-black ' + (style.id === 'gradient' ? 'bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400 bg-clip-text text-transparent' : style.id === 'neon' ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,.9)]' : style.id === 'toon' ? 'text-white [text-shadow:1px_1px_0_#8b5cf6]' : style.id === 'pop' ? 'text-amber-400' : 'text-slate-500')}>{style.label}</span><span className={'mt-1 block text-[10px] ' + muted}>{style.description}</span></button>)}
                </div>
                <div className="mt-4">
                  <p className={'mb-2 text-[11px] font-bold ' + muted}>フォント</p>
                  <div className="grid grid-cols-2 gap-2">
                    {NAME_FONTS.map(font => <button key={font.id} type="button" onClick={() => setProfile(prev => ({ ...prev, name_font: font.id }))} className={'rounded-xl border px-3 py-2 text-left ' + (profile.name_font === font.id ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-300/30 bg-slate-500/5')}><span className="block text-xs font-black">{font.label}</span><span className={'text-[10px] ' + muted}>{font.sample}</span></button>)}
                  </div>
                </div>
              </section>

              <section className={'rounded-2xl border p-4 sm:p-5 ' + darkCard}>
                <div className="mb-4 flex items-center gap-2"><Sparkles size={18} className="text-pink-500" /><h3 className="text-sm font-black">バナー・アニメーション</h3></div>
                <p className={'mb-2 text-[11px] font-bold ' + muted}>プロフィールのバナー</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {BANNERS.map(banner => <button key={banner.id} type="button" onClick={() => setProfile(prev => ({ ...prev, banner_theme: banner.id }))} className={'rounded-xl border p-2 text-xs font-black ' + (profile.banner_theme === banner.id ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-300/30 bg-slate-500/5')}>{banner.label}</button>)}
                </div>
                <label className={'mt-3 block text-[10px] font-bold ' + muted}>バナー画像URL（任意・HTTPSのみ）</label>
                <input value={profile.banner_url} onChange={event => setProfile(prev => ({ ...prev, banner_url: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300/40 bg-slate-500/5 px-3 py-2 text-xs outline-none focus:border-cyan-400" placeholder="https://example.com/banner.jpg" />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className={'mb-2 text-[11px] font-bold ' + muted}>プロフィール枠</p>
                    <select value={profile.frame_style} onChange={event => setProfile(prev => ({ ...prev, frame_style: event.target.value }))} className="w-full rounded-xl border border-slate-300/40 bg-slate-500/5 px-3 py-2.5 text-xs font-bold">
                      <option value="basic">ベーシック（初期）</option>
                      {unlockedIds.includes('frame_aurora') && <option value="aurora">オーロラ（学習5回）</option>}
                      {unlockedIds.includes('frame_prism') && <option value="prism">プリズム（貢献3件）</option>}
                    </select>
                  </div>
                  <div>
                    <p className={'mb-2 text-[11px] font-bold ' + muted}>アイコン演出</p>
                    <select value={profile.avatar_effect} onChange={event => setProfile(prev => ({ ...prev, avatar_effect: event.target.value }))} className="w-full rounded-xl border border-slate-300/40 bg-slate-500/5 px-3 py-2.5 text-xs font-bold">
                      <option value="none">なし</option>
                      {unlockedIds.includes('effect_sparkle') && <option value="sparkle">スターライト（120分）</option>}
                    </select>
                  </div>
                </div>
              </section>

              <section className={'rounded-2xl border p-4 sm:p-5 ' + darkCard}>
                <div className="mb-3 flex items-center gap-2"><Medal size={18} className="text-amber-500" /><h3 className="text-sm font-black">解放済みミニバッジ</h3></div>
                <p className={'mb-3 text-[10px] ' + muted}>プロフィールに表示するバッジを最大5個まで選べる。</p>
                {unlockedCosmetics.filter(item => item.category === 'badge').length ? (
                  <div className="flex flex-wrap gap-2">
                    {unlockedCosmetics.filter(item => item.category === 'badge').map(item => <button key={item.id} type="button" onClick={() => toggleBadge(item.id)} aria-pressed={profile.equipped_badges.includes(item.id)} className={'rounded-full border px-3 py-2 text-[11px] font-black transition ' + (profile.equipped_badges.includes(item.id) ? 'border-amber-400 bg-amber-400/15 text-amber-600' : 'border-slate-300/30 bg-slate-500/5')}><span className="mr-1.5">{item.icon}</span>{item.name}{profile.equipped_badges.includes(item.id) ? ' ✓' : ' ＋'}</button>)}
                  </div>
                ) : <p className={'rounded-xl border border-dashed border-slate-300/30 p-4 text-center text-xs ' + muted}>まだバッジはありません。下の実績を達成すると解放されるよ。</p>}
              </section>

              <section className={'rounded-2xl border p-4 sm:p-5 ' + darkCard}>
                <div className="mb-3 flex items-center gap-2"><ShieldCheck size={18} className="text-emerald-500" /><h3 className="text-sm font-black">公開範囲・プライバシー</h3></div>
                <label className="flex items-start gap-3 rounded-xl border border-slate-300/30 bg-slate-500/5 p-3">
                  <input type="checkbox" checked={profile.is_public} onChange={event => setProfile(prev => ({ ...prev, is_public: event.target.checked, show_class: event.target.checked ? prev.show_class : false }))} className="mt-0.5 h-4 w-4 accent-cyan-500" />
                  <span><span className="block text-xs font-black">他のCampusSync利用者にプロフィールを公開する</span><span className={'mt-1 block text-[10px] leading-5 ' + muted}>初期設定は非公開。公開すると、表示名・自己紹介・アイコン・装飾がログイン済みの利用者に表示される。</span></span>
                </label>
                {profile.is_public && <label className="mt-2 flex items-center gap-2 rounded-xl border border-slate-300/30 p-3 text-xs font-bold"><input type="checkbox" checked={profile.show_class} onChange={event => setProfile(prev => ({ ...prev, show_class: event.target.checked }))} className="h-4 w-4 accent-cyan-500" />クラス表示も公開する（任意）</label>}
                <p className={'mt-3 text-[10px] leading-5 ' + muted}>学校メール・学籍番号は公開しない設計。自己紹介には電話番号、住所、メールアドレスなどの個人情報を書かず、ニックネームの使用をおすすめします。</p>
              </section>

              <button type="button" onClick={() => void saveProfile()} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-600 to-violet-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-cyan-900/15 transition hover:brightness-110 disabled:opacity-60">{saving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}{saving ? '保存中…' : 'プロフィールを保存'}</button>
            </div>

            <div className="space-y-4">
              <section className={'rounded-2xl border p-3 sm:p-4 ' + darkCard}>
                <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-black">リアルタイムプレビュー</h3><span className="rounded-full bg-cyan-500/10 px-2 py-1 text-[9px] font-black text-cyan-500">LIVE PREVIEW</span></div>
                <ProfileCard profile={profile} />
                <p className={'mt-3 text-[10px] leading-5 ' + muted}>装飾を変更すると、保存前でもここに反映されるよ。</p>
              </section>

              <section className={'rounded-2xl border p-4 ' + darkCard}>
                <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Star size={17} className="text-amber-500" /><h3 className="text-sm font-black">実績と解放状況</h3></div><button type="button" onClick={() => void loadOwnProfile()} className={'rounded-lg p-2 ' + muted} aria-label="実績を再読み込み"><RefreshCw size={14} /></button></div>
                <div className="mb-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-cyan-500/10 p-2 text-center"><p className="text-xl font-black text-cyan-500">{metrics.study_sessions}</p><p className={'text-[9px] font-bold ' + muted}>学習回数</p></div>
                  <div className="rounded-xl bg-violet-500/10 p-2 text-center"><p className="text-xl font-black text-violet-500">{metrics.focus_minutes}</p><p className={'text-[9px] font-bold ' + muted}>学習分数</p></div>
                  <div className="rounded-xl bg-amber-500/10 p-2 text-center"><p className="text-xl font-black text-amber-500">{metrics.approved_contributions}</p><p className={'text-[9px] font-bold ' + muted}>貢献記録</p></div>
                </div>
                <div className="space-y-3">
                  {COSMETICS.map(item => {
                    const current = metricValue(item.metric);
                    const achieved = unlockedIds.includes(item.id);
                    const progress = Math.min(100, Math.round((current / item.target) * 100));
                    return <div key={item.id} className="rounded-xl border border-slate-300/20 p-3"><div className="flex items-center gap-2"><span className="text-lg">{achieved ? item.icon : '🔒'}</span><div className="min-w-0 flex-1"><p className="text-xs font-black">{item.name}</p><p className={'mt-0.5 text-[10px] ' + muted}>{item.detail}</p></div><span className={'text-[9px] font-black ' + (achieved ? 'text-emerald-500' : muted)}>{achieved ? '解放済み' : current + '/' + item.target}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-500/15"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all" style={{ width: progress + '%' }} /></div></div>;
                  })}
                </div>
                <p className={'mt-3 text-[10px] leading-5 ' + muted}>条件達成後に再読み込みすると装飾が解放される。今後、イベントやCampusSync内の活動も追加していける。</p>
              </section>
            </div>
          </div>
        )
      ) : (
        selectedProfile ? (
          <div className="mx-auto max-w-2xl space-y-3">
            <button type="button" onClick={() => setSelectedProfile(null)} className={'inline-flex items-center gap-1 text-xs font-black ' + muted}><ChevronLeft size={16} />プロフィール一覧へ戻る</button>
            <ProfileCard profile={selectedProfile} />
          </div>
        ) : (
          <section className={'rounded-2xl border p-4 sm:p-5 ' + darkCard}>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <label className="relative min-w-0 flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={searchText} onChange={event => setSearchText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void loadDirectory(); }} placeholder="表示名で検索…" className="w-full rounded-xl border border-slate-300/40 bg-slate-500/5 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-cyan-400" /></label>
              <button type="button" onClick={() => void loadDirectory()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-black text-white"><Search size={14} />検索</button>
            </div>
            {directoryLoading ? <div className="p-8 text-center text-sm"><RefreshCw size={18} className="mx-auto mb-2 animate-spin" />プロフィールを検索中…</div> : directory.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300/30 px-4 py-10 text-center"><Compass size={28} className="mx-auto text-cyan-500" /><p className="mt-3 text-sm font-black">公開プロフィールはまだ見つかりません</p><p className={'mt-1 text-xs ' + muted}>自分のプロフィールを公開すると、ここに表示されるよ。</p></div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {directory.map(item => <button key={item.user_id} type="button" onClick={() => setSelectedProfile(item)} className="overflow-hidden rounded-2xl border border-slate-300/25 text-left transition hover:-translate-y-0.5 hover:border-cyan-400/60 hover:shadow-lg">
                  <div className={'h-16 ps-banner-' + item.banner_theme} />
                  <div className="relative px-3 pb-3 pt-0">
                    <div className="relative -mt-7 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-4 border-slate-800 bg-gradient-to-br from-cyan-400 to-violet-500 text-2xl">{safeHttpsUrl(item.avatar_url) ? <img src={safeHttpsUrl(item.avatar_url)} alt="" className="h-full w-full object-cover" /> : item.avatar_emoji}</div>
                    <p className="mt-2 truncate text-sm font-black">{item.display_name}</p>
                    {item.show_class && item.class_label && <p className={'mt-0.5 text-[10px] ' + muted}>{item.class_label}組</p>}
                    <p className={'mt-2 line-clamp-2 min-h-9 text-[11px] leading-5 ' + muted}>{item.bio || '自己紹介はありません。'}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">{COSMETICS.filter(badge => badge.category === 'badge' && item.equipped_badges.includes(badge.id)).slice(0, 3).map(badge => <span key={badge.id} className="rounded-full bg-cyan-500/10 px-2 py-1 text-[9px] font-black">{badge.icon} {badge.name}</span>)}</div>
                    <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-black text-cyan-500">プロフィールを見る <ChevronLeft size={12} className="rotate-180" /></span>
                  </div>
                </button>)}
              </div>
            )}
          </section>
        )
      )}

      <div className={'flex items-center justify-center gap-2 pb-1 text-[10px] ' + muted}><BadgeCheck size={13} />公開プロフィールはログイン済みのCampusSync利用者だけが閲覧できます。</div>
    </div>
  );
}
