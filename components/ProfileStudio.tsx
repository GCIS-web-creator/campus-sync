'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ContributionRankBadge } from '@/components/ContributionRanks';
import { BadgeCheck, Check, ChevronLeft, Compass, Eye, Lock, Medal, Palette, RefreshCw, Search, ShieldCheck, Sparkles, Star, UserRound, Users, SlidersHorizontal } from 'lucide-react';
import { ProfileMediaEditor } from '@/components/profile-studio/ProfileMediaEditor';
import { GradientEditor } from '@/components/profile-studio/GradientEditor';
import { BadgeIcon } from '@/components/profile-studio/BadgeIcon';
import { AvatarGlyph } from '@/components/profile-studio/AvatarGlyph';
import { AvatarDeco, BannerEffect, type DecoKind } from '@/components/profile-studio/NatureEffects';
import { DECO_ITEMS, type DecoGroup } from '@/components/profile-studio/catalog';
import { DecoThumbnail } from '@/components/profile-studio/DecoThumbnail';
import { DEFAULT_PROFILE_STUDIO, normalizeProfileStudio, nameCss, type ProfileStudioSettings } from '@/components/profile-studio/nameStyle';

type ProfileDraft = {
  display_name: string;
  bio: string;
  avatar_emoji: string;
  avatar_url: string;
  avatar_path: string;
  banner_theme: string;
  banner_url: string;
  banner_path: string;
  studio: ProfileStudioSettings;
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
  avatar_path: '',
  banner_theme: 'aurora',
  banner_url: '',
  banner_path: '',
  studio: DEFAULT_PROFILE_STUDIO,
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
  { id: 'rounded', label: 'Rounded', sample: 'あいうえお / CampusSync 123' },
  { id: 'sans', label: 'Sans', sample: 'あいうえお / CampusSync 123' },
  { id: 'serif', label: 'Serif', sample: 'あいうえお / CampusSync 123' },
  { id: 'mono', label: 'Mono', sample: 'あいうえお / CampusSync 123' },
  { id: 'sakura-pop', label: 'Sakura Pop', sample: 'あいうえお / CampusSync 123' },
  { id: 'mainframe', label: 'MainFrame', sample: 'あいうえお / CampusSync 123' },
  { id: 'modern', label: 'Modern', sample: 'あいうえお / CampusSync 123' },
  { id: 'thunder-riot', label: 'Thunder Riot', sample: 'あいうえお / CampusSync 123' },
  { id: 'm-plus-rounded', label: 'M PLUS Rounded 1c', sample: 'あいうえお / CampusSync 123' },
  { id: 'zen-maru', label: 'Zen Maru Gothic', sample: 'あいうえお / CampusSync 123' },
  { id: 'kiwi-maru', label: 'Kiwi Maru', sample: 'あいうえお / CampusSync 123' },
  { id: 'zen-kaku', label: 'Zen Kaku Gothic New', sample: 'あいうえお / CampusSync 123' },
  { id: 'shippori-mincho', label: 'Shippori Mincho', sample: 'あいうえお / CampusSync 123' },
  { id: 'mochiy-pop', label: 'Mochiy Pop One', sample: 'あいうえお / CampusSync 123' },
  { id: 'dela-gothic', label: 'Dela Gothic One', sample: 'あいうえお / CampusSync 123' },
  { id: 'dotgothic16', label: 'DotGothic16', sample: 'あいうえお / CampusSync 123' },
  { id: 'yusei-magic', label: 'Yusei Magic', sample: 'あいうえお / CampusSync 123' },
];
const DB_NAME_FONT_IDS = ['rounded','sans','serif','mono','marshmallow','sakura-pop','mainframe','modern','thunder-riot'];

const COSMETICS = [
  { id: 'badge_first_study', category: 'badge', name: 'はじめの一歩', detail: '学習セッションを1回完了', target: 1, metric: 'study_sessions' },
  { id: 'frame_aurora', category: 'frame', name: 'オーロラフレーム', detail: '学習セッションを5回完了', target: 5, metric: 'study_sessions' },
  { id: 'badge_study_10', category: 'badge', name: '学びの継続者', detail: '学習セッションを10回完了', target: 10, metric: 'study_sessions' },
  { id: 'effect_sparkle', category: 'effect', name: 'スターライト', detail: '学習時間が合計120分に到達', target: 120, metric: 'focus_minutes' },
  { id: 'badge_contribution_3', category: 'badge', name: 'キャンパスサポーター', detail: '貢献ポイント獲得の記録が3件', target: 3, metric: 'approved_contributions' },
  { id: 'frame_prism', category: 'frame', name: 'プリズムフレーム', detail: '貢献ポイント獲得の記録が3件', target: 3, metric: 'approved_contributions' },
] as const;

const PROFILE_CSS = [
  '@import url("https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=DotGothic16&family=Kiwi+Maru:wght@400;500&family=M+PLUS+Rounded+1c:wght@400;700;800&family=Mochiy+Pop+One&family=Shippori+Mincho:wght@400;700&family=Yusei+Magic&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=Zen+Maru+Gothic:wght@400;500;700;900&display=swap")',
  '@font-face{font-family:"Sakura Pop";src:url("/fonts/sakura-pop-plump-v3.woff2") format("woff2");font-style:normal;font-weight:800;font-display:swap}',
  '@font-face{font-family:"MainFrame";src:url("/fonts/mainframe.woff2") format("woff2");font-style:normal;font-weight:500;font-display:swap}',
  '@font-face{font-family:"CampusSync Modern";src:url("/fonts/modern-campussync.woff2") format("woff2");font-style:normal;font-weight:400;font-display:swap}',
  '@font-face{font-family:"Thunder Riot";src:url("/fonts/thunder-riot.woff2") format("woff2");font-style:normal;font-weight:900;font-display:swap}',
  '.ps-card{position:relative;overflow:hidden;border-radius:26px;background:#09152d;color:#f8fafc;box-shadow:0 18px 48px rgba(15,23,42,.2)}',
  '.ps-banner{height:150px;position:relative;overflow:hidden;background-size:cover;background-position:center}',
  '.ps-banner-aurora{background-image:radial-gradient(ellipse at 18% 20%,rgba(80,230,255,.9),transparent 34%),radial-gradient(ellipse at 82% 8%,rgba(220,120,255,.75),transparent 40%),linear-gradient(125deg,#102c65,#254b91 48%,#251b5e)}',
  '.ps-banner-ocean{background-image:radial-gradient(ellipse at 20% 10%,rgba(90,220,255,.75),transparent 36%),linear-gradient(125deg,#073763,#0f78a6 55%,#082f49)}',
  '.ps-banner-sunset{background-image:radial-gradient(ellipse at 80% 10%,rgba(255,231,153,.85),transparent 34%),linear-gradient(125deg,#7c2d5a,#c65b75 48%,#f59e0b)}',
  '.ps-banner-midnight{background-image:radial-gradient(ellipse at 48% 4%,rgba(129,140,248,.65),transparent 38%),linear-gradient(125deg,#111827,#20285b 55%,#090c20)}',
  '.ps-banner-sakura{background-image:radial-gradient(ellipse at 25% 10%,rgba(255,205,231,.9),transparent 34%),linear-gradient(125deg,#743d70,#c06b9a 52%,#56357c)}',
  '.ps-banner:after{content:"";position:absolute;inset:0;pointer-events:none}.ps-banner:before{content:"";position:absolute;inset:auto 0 0 0;height:74px;z-index:1;pointer-events:none;background:linear-gradient(180deg,rgba(16,35,68,0),#102344)}',
  '.ps-banner-stars{position:absolute;inset:0;z-index:2;pointer-events:none}.ps-banner-stars i{position:absolute;display:block;width:var(--star-size);height:var(--star-size);background:linear-gradient(135deg,#fff,#b9eaff);clip-path:polygon(50% 0,62% 37%,100% 50%,62% 63%,50% 100%,38% 63%,0 50%,38% 37%);filter:drop-shadow(0 0 7px rgba(210,235,255,.85));animation:ps-star-drift var(--star-duration) ease-in-out var(--star-delay) infinite alternate}.ps-banner-stars i:nth-child(1){left:58%;top:24%;--star-size:13px;--star-duration:4.7s;--star-delay:-1.4s}.ps-banner-stars i:nth-child(2){left:67%;top:42%;--star-size:5px;--star-duration:3.4s;--star-delay:-.3s}.ps-banner-stars i:nth-child(3){left:76%;top:17%;--star-size:9px;--star-duration:5.2s;--star-delay:-2.2s}.ps-banner-stars i:nth-child(4){left:85%;top:37%;--star-size:15px;--star-duration:4.2s;--star-delay:-3.1s}.ps-banner-stars i:nth-child(5){left:92%;top:15%;--star-size:6px;--star-duration:6s;--star-delay:-.9s}.ps-banner-stars i:nth-child(6){left:48%;top:14%;--star-size:7px;--star-duration:3.8s;--star-delay:-2.6s}@keyframes ps-star-drift{0%{opacity:.35;transform:translateY(0) scale(.78) rotate(-8deg)}55%{opacity:1}100%{opacity:.62;transform:translateY(-5px) scale(1.06) rotate(9deg)}}',
  '.ps-profile-body{position:relative;padding:0 20px 20px;background:linear-gradient(180deg,#102344,#101936 65%,#0d1730)}',
  '.ps-avatar-wrap{position:relative;z-index:2;isolation:isolate;width:98px;height:98px;margin-top:-48px;border-radius:50%;padding:4px;background:linear-gradient(135deg,#67e8f9,#818cf8,#f0abfc);box-shadow:0 8px 30px rgba(0,0,0,.3)}.ps-avatar-wrap:before{content:"";position:absolute;inset:4px;border-radius:50%;background:#172343;z-index:0;pointer-events:none}.ps-avatar-wrap>*{position:relative;z-index:1}',
  '.ps-avatar-wrap.ps-frame-aurora{background:linear-gradient(135deg,#67e8f9,#a78bfa,#f0abfc,#67e8f9);background-size:250% 250%;animation:ps-frame-flow 5s ease infinite}',
  '.ps-avatar-wrap.ps-frame-prism{background:conic-gradient(from 0deg,#f0abfc,#67e8f9,#fcd34d,#a78bfa,#f0abfc);animation:ps-spin 9s linear infinite}',
  '.ps-avatar-inner{display:flex;width:100%;height:100%;align-items:center;justify-content:center;overflow:hidden;border:3px solid rgba(255,255,255,.8);border-radius:50%;background:linear-gradient(145deg,#243b66,#172343);font-size:42px}',
  '.ps-avatar-inner img{width:100%;height:100%;object-fit:cover}',
  '.ps-avatar-sparkle:after{content:"";position:absolute;right:-5px;top:0;width:22px;height:22px;background:#bae6fd;clip-path:polygon(50% 0,61% 38%,100% 50%,61% 62%,50% 100%,39% 62%,0 50%,39% 38%);filter:drop-shadow(0 0 8px #67e8f9);animation:ps-twinkle 1.8s ease-in-out infinite}',
  '.ps-name-solid{color:#fff}.ps-name-gradient{background:linear-gradient(90deg,#a5f3fc,#c4b5fd,#f9a8d4);-webkit-background-clip:text;background-clip:text;color:transparent}.ps-name-neon{color:#cffafe;text-shadow:0 0 6px #22d3ee,0 0 18px #818cf8,0 0 34px rgba(129,140,248,.55)}.ps-name-toon{color:#fff;text-shadow:2px 2px 0 #7c3aed,-1px -1px 0 #0891b2}.ps-name-pop{color:#fde68a;text-shadow:0 0 12px rgba(251,191,36,.35);letter-spacing:.04em}',
  '.ps-font-rounded{font-family:ui-rounded,"Hiragino Maru Gothic ProN",sans-serif}.ps-font-sans{font-family:ui-sans-serif,system-ui,sans-serif}.ps-font-serif{font-family:ui-serif,Georgia,serif}.ps-font-mono{font-family:ui-monospace,SFMono-Regular,monospace}.ps-font-sakura-pop,.ps-font-marshmallow{font-family:"Sakura Pop","Noto Sans JP","Noto Sans CJK JP",sans-serif;font-weight:800;letter-spacing:-.04em}.ps-font-sakura-pop-rainbow{background-image:linear-gradient(90deg,#f56fb1 0%,#faa36f 18%,#edcf5d 36%,#9cd865 54%,#57c3b3 72%,#718fe5 88%,#be74db 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}.ps-font-mainframe{font-family:"MainFrame","Noto Sans JP","Noto Sans CJK JP",ui-sans-serif,system-ui,sans-serif;font-weight:500;letter-spacing:.025em}.ps-font-modern{font-family:"CampusSync Modern","Noto Sans JP","Noto Sans CJK JP",ui-sans-serif,system-ui,sans-serif;font-weight:400;letter-spacing:.01em}.ps-font-modern-rainbow{background-image:linear-gradient(90deg,#8ee46b 0%,#f2d05b 22%,#ed82a6 44%,#a68ceb 62%,#6db8e8 80%,#75dcaa 100%);-webkit-background-clip:text;background-clip:text;color:transparent}.ps-font-thunder-riot{font-family:"Thunder Riot","Noto Sans JP","Noto Sans CJK JP",Impact,"Arial Black",sans-serif;font-weight:900;letter-spacing:.015em;-webkit-text-stroke:.45px #111827;text-shadow:1px 1px 0 #111827,2px 2px 0 #facc15,-1px -1px 0 #facc15,0 0 12px rgba(250,204,21,.38)}',
  '.ps-font-m-plus-rounded{font-family:"M PLUS Rounded 1c","Noto Sans JP",sans-serif}.ps-font-zen-maru{font-family:"Zen Maru Gothic","Noto Sans JP",sans-serif}.ps-font-kiwi-maru{font-family:"Kiwi Maru","Noto Serif JP",serif}.ps-font-zen-kaku{font-family:"Zen Kaku Gothic New","Noto Sans JP",sans-serif}.ps-font-shippori-mincho{font-family:"Shippori Mincho","Noto Serif JP",serif}.ps-font-mochiy-pop{font-family:"Mochiy Pop One","Noto Sans JP",sans-serif}.ps-font-dela-gothic{font-family:"Dela Gothic One","Noto Sans JP",sans-serif}.ps-font-dotgothic16{font-family:"DotGothic16","Noto Sans JP",monospace}.ps-font-yusei-magic{font-family:"Yusei Magic","Noto Sans JP",sans-serif}',
  '.ps-badge{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(191,219,254,.22);border-radius:999px;background:rgba(255,255,255,.08);padding:6px 10px;font-size:11px;font-weight:800;color:#e0f2fe}',
  '.ps-deco-thumb{display:inline-grid;flex:none;place-items:center;overflow:hidden;border:1px solid rgba(148,163,184,.28);border-radius:12px;background:linear-gradient(140deg,rgba(255,255,255,.08),rgba(15,23,42,.28));width:68px;height:46px}',
  '.ps-deco-thumb svg{display:block;width:100%;height:100%}.ps-deco-thumb-avatar{width:46px;height:46px;border-radius:50%}.ps-deco-thumb-small{width:42px;height:34px;border-radius:9px}.ps-deco-thumb-avatar.ps-deco-thumb-small{width:34px;height:34px;border-radius:50%}.ps-deco-thumb-banner{width:66px;height:40px}',
  '.ps-profile-category-nav{scrollbar-width:none}.ps-profile-category-nav::-webkit-scrollbar{display:none}',
  '.ps-achievement-unlocked{animation:ps-achievement-pop 1.2s ease-in-out 2;border-color:rgba(34,211,238,.65)!important;box-shadow:0 0 0 2px rgba(34,211,238,.12),0 0 22px rgba(34,211,238,.16)}@keyframes ps-achievement-pop{0%,100%{transform:scale(1)}45%{transform:scale(1.012);box-shadow:0 0 0 3px rgba(34,211,238,.22),0 0 28px rgba(139,92,246,.22)}}',
  '@media(prefers-reduced-motion:reduce){.ps-achievement-unlocked{animation:none!important}}',

  '.ps-banner-pattern{position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.26}',
  '.ps-banner-pattern-grid{background-image:linear-gradient(rgba(220,245,255,.55) 1px,transparent 1px),linear-gradient(90deg,rgba(220,245,255,.55) 1px,transparent 1px);background-size:24px 24px}',
  '.ps-banner-pattern-wave{background-image:repeating-radial-gradient(ellipse at 0 100%,transparent 0 16px,rgba(220,245,255,.6) 17px 18px,transparent 19px 34px)}',
  '.ps-banner-pattern-dots{background-image:radial-gradient(rgba(255,255,255,.8) 1px,transparent 1.8px);background-size:18px 18px}',
  '.ps-banner-pattern-stars{background-image:radial-gradient(circle at 18% 28%,rgba(255,255,255,.95) 0 1.3px,transparent 2px),radial-gradient(circle at 72% 16%,rgba(255,255,255,.8) 0 1.5px,transparent 2.2px),radial-gradient(circle at 90% 55%,rgba(255,255,255,.85) 0 1.1px,transparent 2px)}',
  '.ps-frame-flow{animation:ps-frame-flow 5s ease infinite}.ps-twinkle{animation:ps-twinkle 1.8s ease-in-out infinite}',
  '@keyframes ps-frame-flow{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}@keyframes ps-spin{to{transform:rotate(360deg)}}@keyframes ps-twinkle{0%,100%{opacity:.45;transform:scale(.8)}50%{opacity:1;transform:scale(1.12)}}',
  '@media(prefers-reduced-motion:reduce){.ps-frame-flow,.ps-twinkle,.ps-avatar-wrap.ps-frame-aurora,.ps-avatar-wrap.ps-frame-prism,.ps-banner:after{animation:none!important}}',
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

type ProfileImageRef = { userId: string; kind: 'avatar' | 'banner'; path: string };

async function resolveProfileImageUrls(items: ProfileImageRef[]): Promise<Map<string, string>> {
  if (!items.length) return new Map();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return new Map();
  const response = await fetch('/api/profile/images/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ items }),
    cache: 'no-store',
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(body?.items)) return new Map();
  const urls = new Map<string, string>();
  for (const item of body.items) {
    if (typeof item?.url === 'string' && typeof item?.userId === 'string' && (item?.kind === 'avatar' || item?.kind === 'banner')) {
      urls.set(item.userId + ':' + item.kind, item.url);
    }
  }
  return urls;
}

function fromRow(row: any, fallbackClass: string): ProfileDraft {
  return {
    display_name: String(row?.display_name || 'CampusSyncユーザー'),
    bio: String(row?.bio || ''),
    avatar_emoji: String(row?.avatar_emoji || '🌸'),
    avatar_url: String(row?.avatar_url || ''),
    avatar_path: String(row?.avatar_path || ''),
    banner_theme: String(row?.banner_theme || 'aurora'),
    banner_url: String(row?.banner_url || ''),
    banner_path: String(row?.banner_path || ''),
    studio: normalizeProfileStudio(row?.studio),
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

function ProfileCard({
  profile,
  compact = false,
  previewAvatarKind,
  previewBannerKind,
  onEditBio,
}: {
  profile: ProfileDraft;
  compact?: boolean;
  previewAvatarKind?: DecoKind | null;
  previewBannerKind?: DecoKind | null;
  onEditBio?: () => void;
}) {
  const avatarUrl = safeHttpsUrl(profile.avatar_url);
  const bannerUrl = safeHttpsUrl(profile.banner_url);
  const studio = normalizeProfileStudio(profile.studio);
  const bannerAppearance = studio.banner_appearance;
  const bannerGradient = 'linear-gradient(' + bannerAppearance.angle + 'deg,' + bannerAppearance.stops.map(color => bannerUrl ? color + '99' : color).join(',') + ')';
  const bannerLayers = bannerAppearance.enabled
    ? [bannerGradient, ...(bannerUrl ? ['url("' + bannerUrl.replace(/"/g, '%22') + '")'] : [])]
    : (bannerUrl ? ['linear-gradient(135deg,rgba(8,18,44,.12),rgba(8,18,44,.5))', 'url("' + bannerUrl.replace(/"/g, '%22') + '")'] : []);
  const bannerStyle: React.CSSProperties | undefined = bannerLayers.length ? {
    backgroundImage: bannerLayers.join(','),
    backgroundPosition: bannerUrl ? (bannerAppearance.positionX + '% ' + bannerAppearance.positionY + '%') : 'center',
    backgroundSize: bannerUrl ? (bannerAppearance.scale + '% auto') : 'cover',
  } : undefined;
  const nameStyleClass = 'ps-name-' + profile.name_style;
  const normalizedFont = studio.name_font_override || (profile.name_font === 'marshmallow' ? 'sakura-pop' : (profile.name_font || 'rounded'));
  const fontClass = 'ps-font-' + normalizedFont + (normalizedFont === 'modern' ? ' ps-font-modern-rainbow' : normalizedFont === 'sakura-pop' ? ' ps-font-sakura-pop-rainbow' : '');
  const frameClass = profile.frame_style === 'aurora' ? 'ps-frame-aurora' : profile.frame_style === 'prism' ? 'ps-frame-prism' : '';
  const badges = COSMETICS.filter(item => item.category === 'badge' && profile.equipped_badges.includes(item.id));
  const equippedAvatarItem = DECO_ITEMS.find(item => item.slot === 'avatar_deco' && (item.id === studio.equipped.avatar_deco || item.kind === studio.equipped.avatar_deco));
  const equippedBannerItem = DECO_ITEMS.find(item => item.slot === 'profile_effect' && (item.id === studio.equipped.profile_effect || item.kind === studio.equipped.profile_effect));
  const avatarKind = previewAvatarKind === undefined ? (equippedAvatarItem?.kind ?? null) : previewAvatarKind;
  const bannerKind = previewBannerKind === undefined ? (equippedBannerItem?.kind ?? null) : previewBannerKind;
  const customNameStyle = studio.name_appearance.enabled ? nameCss(studio.name_appearance) : undefined;
  return (
    <div className="ps-card">
      <div className={'ps-banner ps-banner-' + profile.banner_theme} style={bannerStyle}>
        <div className="ps-banner-stars" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
        {bannerAppearance.pattern !== 'none' && <span aria-hidden="true" className={'ps-banner-pattern ps-banner-pattern-' + bannerAppearance.pattern} />}
        {bannerKind && <BannerEffect kind={bannerKind} count={compact ? 8 : 18} paused={studio.motionPaused} intensity={0.16} />}
        <div className="absolute inset-0 z-[4] bg-gradient-to-b from-transparent via-transparent to-[#0e1a35]/65 pointer-events-none" />
        {!compact && <span className="absolute bottom-3 right-4 z-10 rounded-full border border-white/20 bg-slate-950/25 px-3 py-1 text-[9px] font-black tracking-[.2em] text-white/80">CAMPUSSYNC PROFILE</span>}
      </div>
      <div className="ps-profile-body">
        <div className="flex items-end justify-between gap-3">
          <div className={'ps-avatar-wrap ' + frameClass + (profile.avatar_effect === 'sparkle' ? ' ps-avatar-sparkle' : '')}>
            <div className="ps-avatar-inner">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : <AvatarGlyph value={profile.avatar_emoji || '🌸'} size={48} />}
            </div>
            {avatarKind && <AvatarDeco kind={avatarKind} count={compact ? 6 : 10} paused={studio.motionPaused} />}
          </div>
          {profile.is_public && <span className="mb-2 inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-200"><Eye size={12} /> 公開中</span>}
        </div>
        <div className="mt-4 min-w-0">
          <h3 style={customNameStyle} className={'break-words text-3xl font-black tracking-tight drop-shadow-[0_0_12px_rgba(94,234,212,.28)] ' + nameStyleClass + ' ' + fontClass}>{profile.display_name || '名前未設定'}</h3>
          {profile.show_class && profile.class_label && <p className="mt-1 text-[11px] font-bold text-slate-300/75">{profile.class_label}組</p>}
          {profile.bio ? (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200/90">{profile.bio}</p>
          ) : onEditBio ? (
            <button type="button" onClick={onEditBio} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-dashed border-cyan-200/35 bg-white/[.04] px-3 py-2 text-xs font-bold text-cyan-100/90 transition hover:bg-white/[.08]">
              <UserRound size={14} /> 自己紹介を書く
            </button>
          ) : null}
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.04] p-2.5">
          <ContributionRankBadge points={profile.contribution_points} compact tone="onDark" />
        </div>
        {badges.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {badges.map(badge => <span key={badge.id} className="ps-badge"><BadgeIcon id={badge.id} state="equipped" size={24} />{badge.name}</span>)}
          </div>
        ) : (
          <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[.035] px-3 py-2 text-xs font-semibold text-slate-300/85">
            <Medal size={16} className="text-cyan-200/80" /> バッジを装備しよう
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/15 pt-3 text-xs font-semibold text-slate-200/85">
          <span>CampusSync</span><span>・</span><span>学びと活動の記録</span>
        </div>
      </div>
    </div>
  );
}

export default function ProfileStudio({
  userId,
  userClass,
  studentId,
  contributionPoints = 0,
  isDarkMode = false,
}: {
  userId: string;
  userClass: string;
  studentId: string;
  contributionPoints?: number;
  isDarkMode?: boolean;
}) {
  const [profile, setProfile] = useState<ProfileDraft>(DEFAULT_PROFILE);
  const [metrics, setMetrics] = useState<Metrics>({ study_sessions: 0, focus_minutes: 0, approved_contributions: 0 });
  const [unlockedIds, setUnlockedIds] = useState<string[]>([]);
  const [recentlyUnlockedIds, setRecentlyUnlockedIds] = useState<string[]>([]);
  const previousUnlocksRef = useRef<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [activeView, setActiveView] = useState<'edit' | 'discover'>('edit');
  const [directory, setDirectory] = useState<PublicProfile[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<PublicProfile | null>(null);
  const [previewAvatarKind, setPreviewAvatarKind] = useState<DecoKind | null | undefined>(undefined);
  const [previewBannerKind, setPreviewBannerKind] = useState<DecoKind | null | undefined>(undefined);
  const [activeDecoGroup, setActiveDecoGroup] = useState<DecoGroup | 'all'>('all');

  const darkCard = isDarkMode ? 'border-slate-700 bg-slate-800 text-slate-100' : 'border-slate-200 bg-white text-slate-800';
  const muted = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const decoGroups: DecoGroup[] = ['自然', '宇宙・科学', '季節', '動物', 'アート・スイーツ'];

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
      const draft = fromRow(profileResult.data, userClass);
      const imageUrls = await resolveProfileImageUrls([
        ...(draft.avatar_path ? [{ userId, kind: 'avatar' as const, path: draft.avatar_path }] : []),
        ...(draft.banner_path ? [{ userId, kind: 'banner' as const, path: draft.banner_path }] : []),
      ]);
      draft.avatar_url = imageUrls.get(userId + ':avatar') || safeHttpsUrl(draft.avatar_url);
      draft.banner_url = imageUrls.get(userId + ':banner') || safeHttpsUrl(draft.banner_url);
      setProfile(draft);
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

  const refreshUnlockedIds = useCallback(async () => {
    const { data, error } = await supabase
      .from('student_profile_unlocks')
      .select('cosmetic_id')
      .eq('user_id', userId);
    if (!error) setUnlockedIds((data || []).map((row: any) => String(row.cosmetic_id)));
  }, [userId]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void refreshUnlockedIds();
    };
    const interval = window.setInterval(refresh, 12000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [refreshUnlockedIds]);

  useEffect(() => {
    const newlyUnlocked = unlockedIds.filter(id => previousUnlocksRef.current.length > 0 && !previousUnlocksRef.current.includes(id));
    previousUnlocksRef.current = unlockedIds;
    if (!newlyUnlocked.length) return;
    setRecentlyUnlockedIds(newlyUnlocked);
    const timeout = window.setTimeout(() => setRecentlyUnlockedIds([]), 4200);
    return () => window.clearTimeout(timeout);
  }, [unlockedIds]);

  const loadDirectory = useCallback(async () => {
    setDirectoryLoading(true);
    setSelectedProfile(null);
    let query = supabase
      .from('student_profile_customizations')
      .select('user_id,display_name,bio,avatar_emoji,avatar_url,avatar_path,banner_theme,banner_url,banner_path,studio,name_style,name_font,frame_style,avatar_effect,is_public,show_class,class_label,equipped_badges,contribution_points,updated_at')
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
      const rows = data || [];
      const refs = rows.flatMap((row: any) => [
        ...(row.avatar_path ? [{ userId: String(row.user_id), kind: 'avatar' as const, path: String(row.avatar_path) }] : []),
        ...(row.banner_path ? [{ userId: String(row.user_id), kind: 'banner' as const, path: String(row.banner_path) }] : []),
      ]);
      const imageUrls = await resolveProfileImageUrls(refs);
      setDirectory(rows.map((row: any) => {
        const id = String(row.user_id);
        const draft = fromRow(row, '');
        draft.avatar_url = imageUrls.get(id + ':avatar') || safeHttpsUrl(draft.avatar_url);
        draft.banner_url = imageUrls.get(id + ':banner') || safeHttpsUrl(draft.banner_url);
        return { ...draft, user_id: id, updated_at: row.updated_at };
      }));
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
  const visibleAvatarDecorations = useMemo(() => DECO_ITEMS.filter(item => item.slot === 'avatar_deco' && (activeDecoGroup === 'all' || item.group === activeDecoGroup)), [activeDecoGroup]);
  const visibleBannerDecorations = useMemo(() => DECO_ITEMS.filter(item => item.slot === 'profile_effect' && (activeDecoGroup === 'all' || item.group === activeDecoGroup)), [activeDecoGroup]);

  const saveProfile = async () => {
    const cleanName = profile.display_name.trim().slice(0, 32);
    const cleanBio = profile.bio.trim().slice(0, 160);
    const avatarUrl = safeHttpsUrl(profile.avatar_url);
    const bannerUrl = safeHttpsUrl(profile.banner_url);
    if (!cleanName) {
      setMessage('プロフィール名を入力してください。');
      return;
    }
    if (profile.avatar_url.trim().length > 2048 || profile.banner_url.trim().length > 2048) {
      setMessage('画像URLは2048文字以内で入力してください。');
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
      avatar_url: profile.avatar_path ? null : (avatarUrl || null),
      avatar_path: profile.avatar_path || null,
      banner_theme: BANNERS.some(item => item.id === profile.banner_theme) ? profile.banner_theme : 'aurora',
      banner_url: profile.banner_path ? null : (bannerUrl || null),
      banner_path: profile.banner_path || null,
      name_style: NAME_STYLES.some(item => item.id === profile.name_style) ? profile.name_style : 'gradient',
      name_font: DB_NAME_FONT_IDS.includes(profile.name_font) ? profile.name_font : 'rounded',
      studio: normalizeProfileStudio({
        ...profile.studio,
        name_font_override: DB_NAME_FONT_IDS.includes(profile.name_font) ? null : profile.name_font,
      }),
      frame_style: ['basic', 'aurora', 'prism'].includes(profile.frame_style) ? profile.frame_style : 'basic',
      avatar_effect: ['none', 'sparkle'].includes(profile.avatar_effect) ? profile.avatar_effect : 'none',
      is_public: Boolean(profile.is_public),
      show_class: Boolean(profile.is_public && profile.show_class),
      class_label: profile.is_public && profile.show_class ? userClass : null,
      equipped_badges: profile.equipped_badges.filter(id => unlockedIds.includes(id) && COSMETICS.some(item => item.id === id && item.category === 'badge')),
      contribution_points: contributionPoints,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('student_profile_customizations').upsert(payload, { onConflict: 'user_id' });
    if (error) {
      console.error('プロフィール保存に失敗:', error);
      setMessage(error.message.includes('まだ解放') ? error.message : '保存できませんでした。時間をおいて再度お試しください。');
    } else {
      const saved = fromRow(payload, userClass);
      saved.avatar_url = profile.avatar_url;
      saved.banner_url = profile.banner_url;
      setProfile(saved);
      setPreviewAvatarKind(undefined);
      setPreviewBannerKind(undefined);
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
          <nav aria-label="プロフィール編集カテゴリ" className="ps-profile-category-nav -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {[
              ['基本情報','profile-basic'],['アイコン','profile-basic'],['フォント','profile-name'],['名前','profile-name'],
              ['バナー','profile-banner'],['枠','profile-banner'],['アニメーション','profile-banner'],
              ['ミニバッジ','profile-badges'],['公開設定','profile-privacy'],['実績','profile-achievements'],
            ].map(([label,id]) => <button key={label} type="button" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })} className="shrink-0 rounded-full border border-slate-300/35 bg-slate-500/5 px-3 py-2 text-[10px] font-black">{label}</button>)}
          </nav>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(330px,.9fr)]">
            <div className="order-2 space-y-4 xl:order-1">
              <section id="profile-basic" className={'scroll-mt-3 rounded-2xl border p-4 sm:p-5 ' + darkCard}>
                <div className="mb-4 flex items-center gap-2"><UserRound size={18} className="text-cyan-500" /><h3 className="text-sm font-black">基本プロフィール</h3></div>
                <label className={'mb-1 block text-[11px] font-bold ' + muted}>表示名（本名ではなくニックネーム推奨）</label>
                <input value={profile.display_name} maxLength={32} onChange={event => setProfile(prev => ({ ...prev, display_name: event.target.value }))} className="w-full rounded-xl border border-slate-300/40 bg-slate-500/5 px-3 py-2.5 text-sm font-bold outline-none focus:border-cyan-400" placeholder="例：saku" />
                <div className="mt-4">
                  <label className={'mb-1 block text-[11px] font-bold ' + muted}>自己紹介（160文字まで）</label>
                  <textarea id="profile-bio-editor" value={profile.bio} maxLength={160} rows={3} onChange={event => setProfile(prev => ({ ...prev, bio: event.target.value }))} className="w-full resize-y rounded-xl border border-slate-300/40 bg-slate-500/5 px-3 py-2.5 text-sm outline-none focus:border-cyan-400" placeholder="好きなこと、CampusSyncで取り組んでいることなど" />
                  <p className={'mt-1 text-right text-[10px] ' + muted}>{profile.bio.length}/160</p>
                </div>
                <div className="mt-4">
                  <p className={'mb-2 text-[11px] font-bold ' + muted}>アイコン</p>
                  <div className="flex flex-wrap gap-2">
                    {AVATARS.map(avatar => <button type="button" key={avatar} onClick={() => setProfile(prev => ({ ...prev, avatar_emoji: avatar, avatar_url: '', avatar_path: '' }))} aria-pressed={profile.avatar_emoji === avatar && !profile.avatar_url} aria-label={'アイコン ' + avatar + ' を選択'} className={'flex h-10 w-10 items-center justify-center rounded-xl border transition ' + (profile.avatar_emoji === avatar && !profile.avatar_url ? 'border-cyan-400 bg-cyan-500/15 ring-2 ring-cyan-400/20' : 'border-slate-300/30 bg-slate-500/5 hover:bg-slate-500/10')}><AvatarGlyph value={avatar} size={22} /></button>)}
                  </div>
                  <label className={'mt-3 block text-[10px] font-bold ' + muted}>画像URL（任意・HTTPSのみ）</label>
                  <input maxLength={2048} value={profile.avatar_path ? '' : profile.avatar_url} onChange={event => setProfile(prev => ({ ...prev, avatar_url: event.target.value, avatar_path: '' }))} className="mt-1 w-full rounded-xl border border-slate-300/40 bg-slate-500/5 px-3 py-2 text-xs outline-none focus:border-cyan-400" placeholder="https://example.com/avatar.png" />
                   <ProfileMediaEditor
                     kind="avatar" userId={userId} currentUrl={profile.avatar_url}
                     hasImage={Boolean(profile.avatar_path || profile.avatar_url)} dark={isDarkMode}
                     onUploaded={({ path, url }) => setProfile(prev => ({ ...prev, avatar_path: path, avatar_url: url, avatar_emoji: '🌸' }))}
                     onRemove={() => setProfile(prev => ({ ...prev, avatar_path: '', avatar_url: '', avatar_emoji: '🌸' }))}
                   />
                </div>
              </section>

              <section id="profile-name" className={'scroll-mt-3 rounded-2xl border p-4 sm:p-5 ' + darkCard}>
                <div className="mb-4 flex items-center gap-2"><Palette size={18} className="text-violet-500" /><h3 className="text-sm font-black">名前のフォント・デコ</h3></div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {NAME_STYLES.map(style => <button key={style.id} type="button" onClick={() => setProfile(prev => ({ ...prev, name_style: style.id }))} className={'rounded-xl border p-3 text-left transition ' + (profile.name_style === style.id ? 'border-cyan-400 bg-cyan-500/10 ring-1 ring-cyan-400/20' : 'border-slate-300/30 bg-slate-500/5 hover:bg-slate-500/10')}><span className={'block text-sm font-black ' + (style.id === 'gradient' ? 'bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400 bg-clip-text text-transparent' : style.id === 'neon' ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,.9)]' : style.id === 'toon' ? 'text-white [text-shadow:1px_1px_0_#8b5cf6]' : style.id === 'pop' ? 'text-amber-400' : 'text-slate-500')}>{style.label}</span><span className={'mt-1 block text-[10px] ' + muted}>{style.description}</span></button>)}
                </div>
                <div className="mt-4">
                  <p className={'mb-2 text-[11px] font-bold ' + muted}>フォント</p>
                  <div className="grid grid-cols-2 gap-2">
                    {NAME_FONTS.map(font => {
                      const previewClass = ' ps-font-' + font.id
                        + (font.id === 'sakura-pop' ? ' ps-font-sakura-pop-rainbow' : '')
                        + (font.id === 'modern' ? ' ps-font-modern-rainbow' : '');
                      const selected = (profile.studio.name_font_override || profile.name_font) === font.id || (font.id === 'sakura-pop' && profile.name_font === 'marshmallow');
                      return <button key={font.id} type="button" onClick={() => setProfile(prev => ({ ...prev, name_font: font.id, studio: { ...prev.studio, name_font_override: DB_NAME_FONT_IDS.includes(font.id) ? null : font.id } }))} className={'rounded-xl border px-3 py-2 text-left ' + (selected ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-300/30 bg-slate-500/5')}>
                        <span className={'block text-xs font-black' + previewClass}>{font.label}</span>
                        <span className={'mt-1 block text-[10px] ' + muted + previewClass}>{font.sample}</span>
                      </button>;
                    })}
                  </div>
                </div>
                 <div className="mt-4 rounded-xl border border-slate-300/25 p-3">
                   <label className="flex items-center gap-2 text-xs font-black">
                     <input type="checkbox" checked={profile.studio.name_appearance.enabled} onChange={event => setProfile(prev => ({ ...prev, studio: { ...prev.studio, name_appearance: { ...prev.studio.name_appearance, enabled: event.target.checked } } }))} className="h-4 w-4 accent-violet-500" />
                     カスタムグラデーションを使う
                   </label>
                   {profile.studio.name_appearance.enabled && (
                     <div className="mt-3 space-y-3">
                       <GradientEditor stops={profile.studio.name_appearance.stops} angle={profile.studio.name_appearance.angle} onChange={(stops, angle) => setProfile(prev => ({ ...prev, studio: { ...prev.studio, name_appearance: { ...prev.studio.name_appearance, stops, angle } } }))} />
                       <div className="grid grid-cols-2 gap-3">
                         <label className="text-[10px] font-bold">縁取り色<input type="color" value={profile.studio.name_appearance.strokeColor} onChange={event => setProfile(prev => ({ ...prev, studio: { ...prev.studio, name_appearance: { ...prev.studio.name_appearance, strokeColor: event.target.value } } }))} className="mt-1 h-8 w-full rounded-lg border-0 bg-transparent" /></label>
                         <label className="text-[10px] font-bold">文字の太さ：{profile.studio.name_appearance.weight}<input type="range" min="300" max="900" step="50" value={profile.studio.name_appearance.weight} onChange={event => setProfile(prev => ({ ...prev, studio: { ...prev.studio, name_appearance: { ...prev.studio.name_appearance, weight: Number(event.target.value) } } }))} className="mt-2 w-full" /></label>
                         <label className="text-[10px] font-bold">縁取り：{profile.studio.name_appearance.stroke.toFixed(1)}px<input type="range" min="0" max="8" step=".5" value={profile.studio.name_appearance.stroke} onChange={event => setProfile(prev => ({ ...prev, studio: { ...prev.studio, name_appearance: { ...prev.studio.name_appearance, stroke: Number(event.target.value) } } }))} className="mt-2 w-full" /></label>
                         <label className="text-[10px] font-bold">影：{profile.studio.name_appearance.shadow}px<input type="range" min="0" max="24" value={profile.studio.name_appearance.shadow} onChange={event => setProfile(prev => ({ ...prev, studio: { ...prev.studio, name_appearance: { ...prev.studio.name_appearance, shadow: Number(event.target.value) } } }))} className="mt-2 w-full" /></label>
                         <label className="text-[10px] font-bold">発光：{profile.studio.name_appearance.glow}px<input type="range" min="0" max="24" value={profile.studio.name_appearance.glow} onChange={event => setProfile(prev => ({ ...prev, studio: { ...prev.studio, name_appearance: { ...prev.studio.name_appearance, glow: Number(event.target.value) } } }))} className="mt-2 w-full" /></label>
                         <label className="text-[10px] font-bold">文字間隔：{profile.studio.name_appearance.spacing}px<input type="range" min="-2" max="12" step=".5" value={profile.studio.name_appearance.spacing} onChange={event => setProfile(prev => ({ ...prev, studio: { ...prev.studio, name_appearance: { ...prev.studio.name_appearance, spacing: Number(event.target.value) } } }))} className="mt-2 w-full" /></label>
                       </div>
                     </div>
                   )}
                 </div>
              </section>

              <section id="profile-banner" className={'scroll-mt-3 rounded-2xl border p-4 sm:p-5 ' + darkCard}>
                <div className="mb-4 flex items-center gap-2"><Sparkles size={18} className="text-pink-500" /><h3 className="text-sm font-black">バナー・アニメーション</h3></div>
                <p className={'mb-2 text-[11px] font-bold ' + muted}>プロフィールのバナー</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {BANNERS.map(banner => <button key={banner.id} type="button" onClick={() => setProfile(prev => ({ ...prev, banner_theme: banner.id }))} className={'rounded-xl border p-2 text-xs font-black ' + (profile.banner_theme === banner.id ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-300/30 bg-slate-500/5')}>{banner.label}</button>)}
                </div>
                <label className={'mt-3 block text-[10px] font-bold ' + muted}>バナー画像URL（任意・HTTPSのみ）</label>
                <input maxLength={2048} value={profile.banner_path ? '' : profile.banner_url} onChange={event => setProfile(prev => ({ ...prev, banner_url: event.target.value, banner_path: '' }))} className="mt-1 w-full rounded-xl border border-slate-300/40 bg-slate-500/5 px-3 py-2 text-xs outline-none focus:border-cyan-400" placeholder="https://example.com/banner.jpg" />
                 <ProfileMediaEditor
                   kind="banner" userId={userId} currentUrl={profile.banner_url}
                   hasImage={Boolean(profile.banner_path || profile.banner_url)} dark={isDarkMode}
                   onUploaded={({ path, url }) => setProfile(prev => ({ ...prev, banner_path: path, banner_url: url }))}
                   onRemove={() => setProfile(prev => ({ ...prev, banner_path: '', banner_url: '' }))}
                 />
                <div className="mt-4 rounded-xl border border-slate-300/25 p-3">
                  <label className="flex items-center gap-2 text-xs font-black">
                    <input type="checkbox" checked={profile.studio.banner_appearance.enabled} onChange={event => setProfile(prev => ({ ...prev, studio: { ...prev.studio, banner_appearance: { ...prev.studio.banner_appearance, enabled: event.target.checked } } }))} className="h-4 w-4 accent-violet-500" />
                    カスタムグラデーションを使う
                  </label>
                  {profile.studio.banner_appearance.enabled && (
                    <div className="mt-3 space-y-3">
                      <GradientEditor stops={profile.studio.banner_appearance.stops} angle={profile.studio.banner_appearance.angle} onChange={(stops, angle) => setProfile(prev => ({ ...prev, studio: { ...prev.studio, banner_appearance: { ...prev.studio.banner_appearance, stops, angle } } }))} />
                    </div>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {([
                      ['none','なし'],['grid','グリッド'],['wave','ウェーブ'],['dots','ドット'],['stars','星空'],
                    ] as const).map(([value,label]) => <button key={value} type="button" onClick={() => setProfile(prev => ({ ...prev, studio: { ...prev.studio, banner_appearance: { ...prev.studio.banner_appearance, pattern: value } } }))} aria-pressed={profile.studio.banner_appearance.pattern === value} className={'rounded-lg border px-2 py-2 text-[10px] font-bold ' + (profile.studio.banner_appearance.pattern === value ? 'border-cyan-400 bg-cyan-500/10 text-cyan-600' : 'border-slate-300/30')}>{label}</button>)}
                  </div>
                  {Boolean(profile.banner_url) && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <label className="text-[10px] font-bold">画像の左右位置：{profile.studio.banner_appearance.positionX}%
                        <input type="range" min="0" max="100" value={profile.studio.banner_appearance.positionX} onChange={event => setProfile(prev => ({ ...prev, studio: { ...prev.studio, banner_appearance: { ...prev.studio.banner_appearance, positionX: Number(event.target.value) } } }))} className="mt-1 w-full" />
                      </label>
                      <label className="text-[10px] font-bold">画像の上下位置：{profile.studio.banner_appearance.positionY}%
                        <input type="range" min="0" max="100" value={profile.studio.banner_appearance.positionY} onChange={event => setProfile(prev => ({ ...prev, studio: { ...prev.studio, banner_appearance: { ...prev.studio.banner_appearance, positionY: Number(event.target.value) } } }))} className="mt-1 w-full" />
                      </label>
                      <label className="col-span-2 text-[10px] font-bold">画像の拡大率：{profile.studio.banner_appearance.scale}%
                        <input type="range" min="100" max="220" step="5" value={profile.studio.banner_appearance.scale} onChange={event => setProfile(prev => ({ ...prev, studio: { ...prev.studio, banner_appearance: { ...prev.studio.banner_appearance, scale: Number(event.target.value) } } }))} className="mt-1 w-full" />
                      </label>
                    </div>
                  )}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className={'mb-2 text-[11px] font-bold ' + muted}>プロフィール枠</p>
                    <select aria-label="プロフィール枠" value={profile.frame_style} onChange={event => setProfile(prev => ({ ...prev, frame_style: event.target.value }))} className="w-full rounded-xl border border-slate-300/40 bg-slate-500/5 px-3 py-2.5 text-xs font-bold">
                      <option value="basic">ベーシック（初期）</option>
                      <option value="aurora" disabled={!unlockedIds.includes('frame_aurora')}>オーロラフレーム（{unlockedIds.includes('frame_aurora') ? '解放済み' : '学習5回で解放'}）</option>
                      <option value="prism" disabled={!unlockedIds.includes('frame_prism')}>プリズムフレーム（{unlockedIds.includes('frame_prism') ? '解放済み' : '貢献3件で解放'}）</option>
                    </select>
                  </div>
                  <div>
                    <p className={'mb-2 text-[11px] font-bold ' + muted}>アイコン演出</p>
                    <select aria-label="アイコン演出" value={profile.avatar_effect} onChange={event => setProfile(prev => ({ ...prev, avatar_effect: event.target.value }))} className="w-full rounded-xl border border-slate-300/40 bg-slate-500/5 px-3 py-2.5 text-xs font-bold">
                      <option value="none">なし</option>
                      <option value="sparkle" disabled={!unlockedIds.includes('effect_sparkle')}>スターライト（{unlockedIds.includes('effect_sparkle') ? '解放済み' : '学習120分で解放'}）</option>
                    </select>
                  </div>
                </div>
                 <div className="mt-4 rounded-xl border border-slate-300/25 p-3">
                   <div className="mb-2 flex items-center gap-2"><SlidersHorizontal size={14} className="text-cyan-500" /><p className="text-xs font-black">新しい装飾テーマ</p></div>
                   <p className={'mb-3 text-[10px] leading-5 ' + muted}>全46アイテム・23テーマを静止サムネイルで確認できます。未解放の装飾もプレビューできますが、装備・保存はできません。新規12テーマは解放条件の承認待ちです。</p>
                   <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
                     <button type="button" onClick={() => setActiveDecoGroup('all')} className={'shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-black ' + (activeDecoGroup === 'all' ? 'border-cyan-400 bg-cyan-500/10 text-cyan-600' : 'border-slate-300/30')}>すべて</button>
                     {decoGroups.map(group => <button key={group} type="button" onClick={() => setActiveDecoGroup(group)} className={'shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-black ' + (activeDecoGroup === group ? 'border-cyan-400 bg-cyan-500/10 text-cyan-600' : 'border-slate-300/30')}>{group}</button>)}
                   </div>
                   <label className="mb-2 block text-[10px] font-black">アイコン装飾（プレビュー／装備）</label>
                   <div className="grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                     <button type="button" onClick={() => { setPreviewAvatarKind(undefined); setProfile(prev => ({ ...prev, studio: { ...prev.studio, equipped: { ...prev.studio.equipped, avatar_deco: null } } })); }} className={'rounded-xl border p-2 text-left text-[10px] font-bold ' + (!profile.studio.equipped.avatar_deco && previewAvatarKind === undefined ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-300/30')}>なし（初期状態）</button>
                     {visibleAvatarDecorations.map(item => {
                       const unlocked = !item.approvalPending && (unlockedIds.includes(item.id) || Boolean(item.unlockId && unlockedIds.includes(item.unlockId)));
                       const equipped = profile.studio.equipped.avatar_deco === item.id;
                       const selected = previewAvatarKind === item.kind || (previewAvatarKind === undefined && equipped);
                       return <button key={item.id} type="button" onClick={() => {
                         if (unlocked) {
                           setProfile(prev => ({ ...prev, studio: { ...prev.studio, equipped: { ...prev.studio.equipped, avatar_deco: equipped ? null : item.id } } }));
                           setPreviewAvatarKind(undefined);
                         } else {
                           setPreviewAvatarKind(selected ? undefined : item.kind);
                         }
                       }} className={'min-w-0 rounded-xl border p-2 text-left transition ' + (selected ? 'border-cyan-400 bg-cyan-500/10 ring-1 ring-cyan-400/20' : 'border-slate-300/30 bg-slate-500/5')}>
                         <div className="flex items-center gap-2"><DecoThumbnail kind={item.kind} slot="avatar_deco" size="small" /><span className="min-w-0 flex-1 truncate text-[10px] font-black">{item.name}</span></div>
                         <div className="mt-1 flex items-center justify-between gap-1"><span className="text-[9px] font-bold text-violet-500">{({ common: 'コモン', rare: 'レア', epic: 'エピック', legendary: 'レジェンダリー' } as Record<string,string>)[item.rarity]}</span><span className={'text-[9px] font-black ' + (equipped ? 'text-cyan-600' : unlocked ? 'text-emerald-600' : 'text-amber-600')}>{equipped ? '装備中' : unlocked ? '解放済み' : item.approvalPending ? '承認待ち' : '見本プレビュー'}</span></div>
                         <p className={'mt-1 line-clamp-2 text-[9px] leading-4 ' + muted}>{item.unlockCondition}</p>
                       </button>;
                     })}
                   </div>
                   <label className="mb-2 mt-4 block text-[10px] font-black">バナー効果（プレビュー／装備）</label>
                   <div className="grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                     <button type="button" onClick={() => { setPreviewBannerKind(undefined); setProfile(prev => ({ ...prev, studio: { ...prev.studio, equipped: { ...prev.studio.equipped, profile_effect: null } } })); }} className={'rounded-xl border p-2 text-left text-[10px] font-bold ' + (!profile.studio.equipped.profile_effect && previewBannerKind === undefined ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-300/30')}>なし（初期状態）</button>
                     {visibleBannerDecorations.map(item => {
                       const unlocked = !item.approvalPending && (unlockedIds.includes(item.id) || Boolean(item.unlockId && unlockedIds.includes(item.unlockId)));
                       const equipped = profile.studio.equipped.profile_effect === item.id;
                       const selected = previewBannerKind === item.kind || (previewBannerKind === undefined && equipped);
                       return <button key={item.id} type="button" onClick={() => {
                         if (unlocked) {
                           setProfile(prev => ({ ...prev, studio: { ...prev.studio, equipped: { ...prev.studio.equipped, profile_effect: equipped ? null : item.id } } }));
                           setPreviewBannerKind(undefined);
                         } else {
                           setPreviewBannerKind(selected ? undefined : item.kind);
                         }
                       }} className={'min-w-0 rounded-xl border p-2 text-left transition ' + (selected ? 'border-cyan-400 bg-cyan-500/10 ring-1 ring-cyan-400/20' : 'border-slate-300/30 bg-slate-500/5')}>
                         <div className="flex items-center gap-2"><DecoThumbnail kind={item.kind} slot="profile_effect" size="small" /><span className="min-w-0 flex-1 truncate text-[10px] font-black">{item.name}</span></div>
                         <div className="mt-1 flex items-center justify-between gap-1"><span className="text-[9px] font-bold text-violet-500">{({ common: 'コモン', rare: 'レア', epic: 'エピック', legendary: 'レジェンダリー' } as Record<string,string>)[item.rarity]}</span><span className={'text-[9px] font-black ' + (equipped ? 'text-cyan-600' : unlocked ? 'text-emerald-600' : 'text-amber-600')}>{equipped ? '装備中' : unlocked ? '解放済み' : item.approvalPending ? '承認待ち' : '見本プレビュー'}</span></div>
                         <p className={'mt-1 line-clamp-2 text-[9px] leading-4 ' + muted}>{item.unlockCondition}</p>
                       </button>;
                     })}
                   </div>
                   <label className="mt-4 flex items-center gap-2 text-[10px] font-bold"><input type="checkbox" checked={profile.studio.motionPaused} onChange={event => setProfile(prev => ({ ...prev, studio: { ...prev.studio, motionPaused: event.target.checked } }))} className="h-4 w-4 accent-cyan-500" />動きを止める</label>
                   <p className={'mt-2 text-[9px] leading-5 ' + muted}>端末の「視差効果を減らす」設定も優先されます。</p>
                 </div>
              </section>

              <section id="profile-badges" className={'scroll-mt-3 rounded-2xl border p-4 sm:p-5 ' + darkCard}>
                <div className="mb-3 flex items-center gap-2"><Medal size={18} className="text-amber-500" /><h3 className="text-sm font-black">解放済みミニバッジ</h3></div>
                <p className={'mb-3 text-[10px] ' + muted}>プロフィールに表示するバッジを最大5個まで選べる。</p>
                {unlockedCosmetics.filter(item => item.category === 'badge').length ? (
                  <div className="flex flex-wrap gap-2">
                    {unlockedCosmetics.filter(item => item.category === 'badge').map(item => <button key={item.id} type="button" onClick={() => toggleBadge(item.id)} aria-pressed={profile.equipped_badges.includes(item.id)} className={'flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-black transition ' + (profile.equipped_badges.includes(item.id) ? 'border-amber-400 bg-amber-400/15 text-amber-600' : 'border-slate-300/30 bg-slate-500/5')}><BadgeIcon id={item.id} state={profile.equipped_badges.includes(item.id) ? 'equipped' : 'unlocked'} size={22} />{item.name}{profile.equipped_badges.includes(item.id) ? ' ✓' : ' ＋'}</button>)}
                  </div>
                ) : <p className={'rounded-xl border border-dashed border-slate-300/30 p-4 text-center text-xs ' + muted}>まだバッジはありません。下の実績を達成すると解放されるよ。</p>}
              </section>

              <section id="profile-privacy" className={'scroll-mt-3 rounded-2xl border p-4 sm:p-5 ' + darkCard}>
                <div className="mb-3 flex items-center gap-2"><ShieldCheck size={18} className="text-emerald-500" /><h3 className="text-sm font-black">公開範囲・プライバシー</h3></div>
                <label className="flex items-start gap-3 rounded-xl border border-slate-300/30 bg-slate-500/5 p-3">
                  <input type="checkbox" checked={profile.is_public} onChange={event => setProfile(prev => ({ ...prev, is_public: event.target.checked, show_class: event.target.checked ? prev.show_class : false }))} className="mt-0.5 h-4 w-4 accent-cyan-500" />
                  <span><span className="block text-xs font-black">他のCampusSync利用者にプロフィールを公開する</span><span className={'mt-1 block text-[10px] leading-5 ' + muted}>初期設定は非公開。公開すると、表示名・自己紹介・アイコン・装飾がログイン済みの利用者に表示される。</span></span>
                </label>
                {profile.is_public && <label className="mt-2 flex items-center gap-2 rounded-xl border border-slate-300/30 p-3 text-xs font-bold"><input type="checkbox" checked={profile.show_class} onChange={event => setProfile(prev => ({ ...prev, show_class: event.target.checked }))} className="h-4 w-4 accent-cyan-500" />クラス表示も公開する（任意）</label>}
                <p className={'mt-3 text-[10px] leading-5 ' + muted}>学校メール・学籍番号は公開しない設計。自己紹介には電話番号、住所、メールアドレスなどの個人情報を書かず、ニックネームの使用をおすすめします。</p>
              </section>

              <button type="button" onClick={() => void saveProfile()} disabled={saving} className="hidden w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-600 to-violet-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-cyan-900/15 transition hover:brightness-110 disabled:opacity-60 md:flex">{saving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}{saving ? '保存中…' : 'プロフィールを保存'}</button>
            </div>

            <div className="order-1 sticky top-2 z-20 space-y-4 xl:order-2">
              <section id="profile-preview" className={'scroll-mt-3 rounded-2xl border p-3 sm:p-4 ' + darkCard}>
                <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-black">リアルタイムプレビュー</h3><span className="rounded-full border border-cyan-600/25 bg-cyan-500/10 px-2 py-1 text-[9px] font-black text-cyan-700 dark:text-cyan-300">LIVE PREVIEW</span></div>
                <ProfileCard profile={profile} previewAvatarKind={previewAvatarKind} previewBannerKind={previewBannerKind} onEditBio={() => document.getElementById('profile-bio-editor')?.focus()} />
                <p className={'mt-3 text-[10px] leading-5 ' + muted}>装飾の変更内容は、保存前でもプレビューに反映されます。</p>
              </section>

              <section id="profile-achievements" className={'scroll-mt-3 rounded-2xl border p-4 ' + darkCard}>
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
                    return <div key={item.id} className={'rounded-xl border border-slate-300/20 p-3 ' + (recentlyUnlockedIds.includes(item.id) ? 'ps-achievement-unlocked' : '')}><div className="flex items-center gap-2"><BadgeIcon id={item.id} state={achieved ? 'unlocked' : 'locked'} size={26} /><div className="min-w-0 flex-1"><p className="text-xs font-black">{item.name}</p><p className={'mt-0.5 text-[10px] ' + muted}>{item.detail}</p></div><span className={'text-[9px] font-black ' + (achieved ? 'text-emerald-500' : muted)}>{achieved ? '解放済み' : current + '/' + item.target}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-500/15"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all" style={{ width: progress + '%' }} /></div></div>;
                  })}
                </div>
                <p className={'mt-3 text-[10px] leading-5 ' + muted}>条件を満たした報酬は自動で解放状況に反映されます。解放条件そのものは既存の実績設定に従います。</p>
              </section>
            </div>
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-300/30 bg-white/95 px-4 pt-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(15,23,42,.12)] backdrop-blur dark:border-slate-700 dark:bg-slate-950/95 md:hidden">
              <button type="button" onClick={() => void saveProfile()} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-600 to-violet-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60">
                {saving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}{saving ? '保存中…' : 'プロフィールを保存'}
              </button>
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
                    <div className="relative -mt-7 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-4 border-slate-800 bg-gradient-to-br from-cyan-400 to-violet-500 text-2xl">{safeHttpsUrl(item.avatar_url) ? <img src={safeHttpsUrl(item.avatar_url)} alt="" className="h-full w-full object-cover" /> : <AvatarGlyph value={item.avatar_emoji} size={26} />}</div>
                    <p className="mt-2 truncate text-sm font-black">{item.display_name}</p>
                    {item.show_class && item.class_label && <p className={'mt-0.5 text-[10px] ' + muted}>{item.class_label}組</p>}
                    {item.bio ? <p className={'mt-2 line-clamp-2 text-[11px] leading-5 ' + muted}>{item.bio}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-1.5">{COSMETICS.filter(badge => badge.category === 'badge' && item.equipped_badges.includes(badge.id)).slice(0, 3).map(badge => <span key={badge.id} className="rounded-full bg-cyan-500/10 px-2 py-1 text-[9px] font-black"><BadgeIcon id={badge.id} size={16} /> {badge.name}</span>)}</div>
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
