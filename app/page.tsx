'use client';


import { ContributionRankWidget } from '@/components/ContributionRanks';
import { CampusSyncLogo } from '@/components/CampusSyncLogo';
import CampusSyncIntro from '@/components/CampusSyncIntro';
import ClassChat from '@/components/ClassChat';
import CampusAIChat from '@/components/CampusAIChat';
import CampusGlobalSearch, { type CampusSearchItem } from '@/components/CampusGlobalSearch';
import CampusFacilityMap, { type CampusFacility } from '@/components/CampusFacilityMap';
import WeeklySchoolSchedule from '@/components/WeeklySchoolSchedule';
import CountdownEventWidget from '@/components/CountdownEventWidget';
import React, { useState, useEffect, useRef } from 'react';
import {
  supabase } from '@/lib/supabase';
import { LEGACY_SAMPLE_NOTIFICATION_TITLES } from '@/lib/school-notification-utils';
import { CLASS_TIMETABLE_DATA, type ClassTimetableData, type ClassTimetableDayKey, type ClassTimetableGroup } from '@/lib/class-timetable';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Home, CheckCircle, Clock, Monitor, Wind, MessageCircle,
  ThermometerSun, Info, Users, Check, X,
  Plus, ChevronRight, AlertTriangle, Sparkles, Star, Menu, Search as GlobalSearchIcon,
  MapPin, User, Palette, BellRing, Sparkle,
  Heart, ThumbsUp, ChevronLeft, BookOpenCheck, ShieldAlert,
  Volume2, Coffee, Moon, Sun, HelpCircle
} from 'lucide-react';
import {
  AnimatedAsset,
  ScoreRankBadge,
  EmptyStateIllustration,
  CrowdStatusIcon,
  AirconColdIcon,
  AirconComfortableIcon,
  AirconHotIcon,
} from '@/components/CampusAssetWidgets';
import {
  CafeteriaIcon as Utensils,
  CampusIcon as BookOpen,
  SettingsIcon as Settings,
  NotificationIcon as Bell,
  HomeworkIcon as FileText,
  AirconIcon as ThermometerSnowflake,
  LostFoundIcon as Search,
  QrLoginIcon as QrCode,
  SchoolMailIcon as Lock,
  TimetableIcon as Calendar,
  TrainIcon as Train,
  ClubNoteIcon as MessageSquare,
  ContributionIcon as Award,
  CampussyncLogoIcon as GraduationCap,
} from '@/components/CampusIcons';

// 学校固有のクラス選択肢（1-1〜1-8、2-1〜2-8、3-1〜3-8）
const SCHOOL_CLASS_OPTIONS = Array.from({ length: 3 }, (_, gradeIndex) =>
  Array.from({ length: 8 }, (_, classIndex) => `${gradeIndex + 1}-${classIndex + 1}`)
).flat();

function normalizeSchoolClass(value: string | null | undefined): string {
  if (value && SCHOOL_CLASS_OPTIONS.includes(value)) return value;
  // 以前の「1-A」形式で保存されたプロフィールを、新しいクラス表記に変換する
  const legacyMatch = value?.match(/^([1-3])[- ]([A-H])$/i);
  if (legacyMatch) {
    const classNumber = legacyMatch[2].toUpperCase().charCodeAt(0) - 64;
    return `${legacyMatch[1]}-${classNumber}`;
  }
  return '1-1';
}

// 学校メールだけを認証対象にし、@の前の6桁を学籍番号として使う。
const SCHOOL_EMAIL_PATTERN = /^[0-9]{6}@tokyo\.soka\.ed\.jp$/i;
const getStudentIdFromSchoolEmail = (email: string | null | undefined): string => {
  const normalized = (email || '').trim().toLowerCase();
  return SCHOOL_EMAIL_PATTERN.test(normalized) ? normalized.split('@')[0] : '';
};


function toLocalDateTimeInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) output[i] = rawData.charCodeAt(i);
  return output;
}

function getSchoolRoomDisplay(room: string, className: string): string {
  const roomName = (room || '').trim();
  if (/化学実験室/.test(roomName)) return '化学実験室';
  if (/生物実験室|生物室/.test(roomName)) return '生物実験室';
  if (/家庭科室|被服室|調理室/.test(roomName)) return '家庭科室';
  if (/Call教室|LL教室/.test(roomName)) return 'Call教室';
  if (/PC教室|情報処理室/.test(roomName)) return 'PC教室';
  if (/図書館|図書室/.test(roomName)) return '図書館';
  if (/グローバルステーション|大教室/.test(roomName)) return 'グローバルステーション';
  if (/ミーティングルーム2/.test(roomName)) return 'ミーティングルーム2';
  if (/ミーティングルーム1/.test(roomName)) return 'ミーティングルーム1';
  if (/栄冠ホール/.test(roomName)) return '栄冠ホール';
  if (/グローリーホール|第一体育館|グラウンド/.test(roomName)) return 'グローリーホール';
  // 「各教室」や、学校に存在しない旧サンプル教室名は所属クラスの教室として表示
  return `${normalizeSchoolClass(className)}教室`;
}

// --- 🎨 テーマカラー別の Tailwind クラス定義（バリエーション拡張） ---
const THEMES = {
  blue: {
    bg: 'bg-blue-500',
    bgHover: 'hover:bg-blue-600',
    text: 'text-blue-600',
    textLight: 'text-blue-500',
    border: 'border-blue-500',
    lightBg: 'bg-blue-50',
    lightBgHover: 'hover:bg-blue-100',
    shadow: 'shadow-blue-200',
    gradient: 'from-blue-500 to-cyan-400',
    borderLight: 'border-blue-100',
    ring: 'focus:ring-blue-500/20',
  },
  pink: {
    bg: 'bg-pink-500',
    bgHover: 'hover:bg-pink-600',
    text: 'text-pink-600',
    textLight: 'text-pink-500',
    border: 'border-pink-500',
    lightBg: 'bg-pink-50',
    lightBgHover: 'hover:bg-pink-100',
    shadow: 'shadow-pink-200',
    gradient: 'from-pink-500 to-rose-400',
    borderLight: 'border-pink-100',
    ring: 'focus:ring-pink-500/20',
  },
  purple: {
    bg: 'bg-purple-500',
    bgHover: 'hover:bg-purple-600',
    text: 'text-purple-600',
    textLight: 'text-purple-500',
    border: 'border-purple-500',
    lightBg: 'bg-purple-50',
    lightBgHover: 'hover:bg-purple-100',
    shadow: 'shadow-purple-200',
    gradient: 'from-purple-500 to-indigo-400',
    borderLight: 'border-purple-100',
    ring: 'focus:ring-purple-500/20',
  },
  emerald: {
    bg: 'bg-emerald-500',
    bgHover: 'hover:bg-emerald-600',
    text: 'text-emerald-600',
    textLight: 'text-emerald-500',
    border: 'border-emerald-500',
    lightBg: 'bg-emerald-50',
    lightBgHover: 'hover:bg-emerald-100',
    shadow: 'shadow-emerald-200',
    gradient: 'from-emerald-500 to-teal-400',
    borderLight: 'border-emerald-100',
    ring: 'focus:ring-emerald-500/20',
  },
  orange: {
    bg: 'bg-orange-500',
    bgHover: 'hover:bg-orange-600',
    text: 'text-orange-600',
    textLight: 'text-orange-500',
    border: 'border-orange-500',
    lightBg: 'bg-orange-50',
    lightBgHover: 'hover:bg-orange-100',
    shadow: 'shadow-orange-200',
    gradient: 'from-orange-500 to-amber-400',
    borderLight: 'border-orange-100',
    ring: 'focus:ring-orange-500/20',
  },
  indigo: {
    bg: 'bg-indigo-500',
    bgHover: 'hover:bg-indigo-600',
    text: 'text-indigo-600',
    textLight: 'text-indigo-500',
    border: 'border-indigo-500',
    lightBg: 'bg-indigo-50',
    lightBgHover: 'hover:bg-indigo-100',
    shadow: 'shadow-indigo-200',
    gradient: 'from-indigo-500 to-purple-500',
    borderLight: 'border-indigo-100',
    ring: 'focus:ring-indigo-500/20',
  },
  neon: {
    bg: 'bg-cyan-400', bgHover: 'hover:bg-cyan-300', text: 'text-cyan-300',
    textLight: 'text-cyan-200', border: 'border-cyan-400', lightBg: 'bg-cyan-950',
    lightBgHover: 'hover:bg-cyan-900', shadow: 'shadow-cyan-400',
    gradient: 'from-cyan-300 to-fuchsia-500', borderLight: 'border-cyan-900',
    ring: 'focus:ring-cyan-400/30',
  },
  cyber: {
    bg: 'bg-lime-400', bgHover: 'hover:bg-lime-300', text: 'text-cyan-300',
    textLight: 'text-lime-300', border: 'border-cyan-400', lightBg: 'bg-slate-900',
    lightBgHover: 'hover:bg-slate-800', shadow: 'shadow-cyan-400',
    gradient: 'from-cyan-400 to-lime-400', borderLight: 'border-cyan-900',
    ring: 'focus:ring-cyan-400/30',
  },
  fairytale: {
    bg: 'bg-pink-400', bgHover: 'hover:bg-pink-500', text: 'text-purple-600',
    textLight: 'text-pink-500', border: 'border-pink-300', lightBg: 'bg-pink-50',
    lightBgHover: 'hover:bg-purple-50', shadow: 'shadow-pink-200',
    gradient: 'from-pink-300 to-violet-300', borderLight: 'border-pink-100',
    ring: 'focus:ring-pink-300/30',
  },
  custom: {
    bg: 'bg-[var(--campus-theme-primary)]',
    bgHover: 'hover:bg-[var(--campus-theme-primary-hover)]',
    text: 'text-[var(--campus-theme-primary)]',
    textLight: 'text-[var(--campus-theme-primary)]',
    border: 'border-[var(--campus-theme-primary)]',
    lightBg: 'bg-[var(--campus-theme-soft)]',
    lightBgHover: 'hover:bg-[var(--campus-theme-soft-hover)]',
    shadow: 'shadow-[0_0_12px_var(--campus-theme-shadow)]',
    gradient: 'from-[var(--campus-theme-primary)] to-[var(--campus-theme-secondary)]',
    borderLight: 'border-[var(--campus-theme-soft-hover)]',
    ring: 'focus:ring-[var(--campus-theme-ring)]',
  }
};

type ThemeKey = keyof typeof THEMES;
const THEME_LABELS: Record<ThemeKey, string> = {
  blue: '青', pink: 'ピンク', purple: '紫', emerald: '緑', orange: 'オレンジ',
  indigo: '藍色', neon: 'ネオン', cyber: 'サイバー', fairytale: 'メルヘン', custom: '自由設定',
};
const THEME_COLOR_VALUES: Record<ThemeKey, { primary: string; secondary: string }> = {
  blue: { primary: '#3B82F6', secondary: '#22D3EE' },
  pink: { primary: '#EC4899', secondary: '#FB7185' },
  purple: { primary: '#A855F7', secondary: '#818CF8' },
  emerald: { primary: '#10B981', secondary: '#2DD4BF' },
  orange: { primary: '#F97316', secondary: '#FBBF24' },
  indigo: { primary: '#6366F1', secondary: '#A855F7' },
  neon: { primary: '#00FFFF', secondary: '#FF00E5' },
  cyber: { primary: '#00E5FF', secondary: '#B6FF00' },
  fairytale: { primary: '#F472B6', secondary: '#A78BFA' },
  custom: { primary: '#00A9FF', secondary: '#A855F7' },
};
const COLOR_DIC_PRESETS = [
  { name: '赤', hex: '#FF0000' }, { name: 'コーラル', hex: '#FF7F50' },
  { name: 'トマト', hex: '#FF6347' }, { name: 'ディープピンク', hex: '#FF1493' },
  { name: 'ホットピンク', hex: '#FF69B4' }, { name: 'ピンク', hex: '#FFC0CB' },
  { name: 'ラベンダー', hex: '#E6E6FA' }, { name: 'マゼンタ', hex: '#FF00FF' },
  { name: '紫', hex: '#800080' }, { name: '藍', hex: '#4B0082' },
  { name: '青', hex: '#0095D9' }, { name: '群青色', hex: '#4C6CB3' },
  { name: '青藍', hex: '#274A78' }, { name: '青緑', hex: '#00A497' },
  { name: 'ドジャーブルー', hex: '#1E90FF' }, { name: 'スカイブルー', hex: '#00BFFF' },
  { name: 'シアン', hex: '#00FFFF' }, { name: 'ターコイズ', hex: '#40E0D0' },
  { name: 'ティール', hex: '#008080' }, { name: 'ライム', hex: '#00FF00' },
  { name: '春緑', hex: '#00FF7F' }, { name: 'ゴールド', hex: '#FFD700' },
  { name: 'オレンジ', hex: '#FFA500' }, { name: 'チョコレート', hex: '#D2691E' },
  { name: 'サーモン', hex: '#FA8072' },
] as const;
const COLOR_INPUT_ALIASES: Record<string, string> = {
  // Japanese / English names accepted by the custom theme picker and AI command.
  赤: '#FF0000', あか: '#FF0000', red: '#FF0000',
  青: '#0095D9', あお: '#0095D9', blue: '#0000FF', ブルー: '#0000FF',
  青藍: '#274A78', 群青色: '#4C6CB3', 青緑: '#00A497',
  水色: '#00BFFF', スカイブルー: '#00BFFF', skyblue: '#87CEEB',
  ドジャーブルー: '#1E90FF', dodgerblue: '#1E90FF',
  シアン: '#00FFFF', cyan: '#00FFFF', deepskyblue: '#00BFFF',
  ターコイズ: '#40E0D0', turquoise: '#40E0D0', teal: '#008080',
  緑: '#008000', みどり: '#008000', green: '#008000', グリーン: '#008000',
  ライム: '#00FF00', lime: '#00FF00', 春緑: '#00FF7F', springgreen: '#00FF7F',
  黄: '#FFFF00', 黄色: '#FFFF00', yellow: '#FFFF00',
  金: '#FFD700', ゴールド: '#FFD700', gold: '#FFD700',
  オレンジ: '#FFA500', orange: '#FFA500',
  トマト: '#FF6347', tomato: '#FF6347', 朱色: '#FF6347',
  コーラル: '#FF7F50', coral: '#FF7F50',
  ピンク: '#FFC0CB', pink: '#FFC0CB', 桜色: '#FFB7C5', 'さくら色': '#FFB7C5',
  ホットピンク: '#FF69B4', hotpink: '#FF69B4',
  ディープピンク: '#FF1493', deeppink: '#FF1493',
  紫: '#800080', むらさき: '#800080', パープル: '#800080', purple: '#800080',
  藤色: '#C8A2C8', violet: '#EE82EE',
  ラベンダー: '#E6E6FA', lavender: '#E6E6FA',
  マゼンタ: '#FF00FF', magenta: '#FF00FF', fuchsia: '#FF00FF',
  藍: '#4B0082', 藍色: '#4B0082', indigo: '#4B0082', インディゴ: '#4B0082',
  ネイビー: '#000080', navy: '#000080',
  白: '#FFFFFF', しろ: '#FFFFFF', white: '#FFFFFF',
  黒: '#000000', くろ: '#000000', black: '#000000',
  灰色: '#808080', グレー: '#808080', gray: '#808080', grey: '#808080',
  茶色: '#A52A2A', brown: '#A52A2A',
  サーモン: '#FA8072', salmon: '#FA8072',
  チョコレート: '#D2691E', chocolate: '#D2691E',
  crimson: '#DC143C', olive: '#808000', aqua: '#00FFFF',
  sienna: '#A0522D', tan: '#D2B48C',
  rebeccapurple: '#663399', darkcyan: '#008B8B',
  darkblue: '#00008B', lightblue: '#ADD8E6', lightpink: '#FFB6C1',
};
function normalizeThemeColorInput(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const alias = COLOR_INPUT_ALIASES[raw.toLowerCase()] ?? COLOR_INPUT_ALIASES[raw];
  const candidate = alias || raw;
  const hexMatch = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(candidate);
  if (hexMatch) {
    const hex = hexMatch[1].length === 3
      ? hexMatch[1].split('').map((char) => char + char).join('')
      : hexMatch[1];
    return '#' + hex.toUpperCase();
  }
  if (typeof document !== 'undefined') {
    const context = document.createElement('canvas').getContext('2d');
    if (context) {
      context.fillStyle = '#010203';
      const sentinel = context.fillStyle;
      context.fillStyle = candidate;
      const resolved = String(context.fillStyle);
      if (resolved !== sentinel) {
        if (/^#[0-9a-f]{6}$/i.test(resolved)) return resolved.toUpperCase();
        const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(resolved);
        if (rgb) return '#' + rgb.slice(1, 4).map(part =>
          Number(part).toString(16).padStart(2, '0')
        ).join('').toUpperCase();
      }
    }
  }
  return null;
}

// --- 📋 初期モックデータ群の超拡充 ---

const INITIAL_TODOS = [
  { id: '1', title: '数学演習プリント P20-21', source: '紙プリント', type: 'paper', due: '本日中', color: 'bg-red-100 text-red-700', icon: FileText, details: '授業で配布されたプリントのP20〜21です。途中式も必ず書くこと。明日の朝のSHRで回収します。', completed: false, due_at: null },
  { id: '2', title: '英語エッセイ ドラフト提出', source: 'Classroom', type: 'classroom', due: '明日まで', color: 'bg-orange-100 text-orange-700', icon: Monitor, details: 'テーマ「My Future Goal」についてのドラフト（下書き）をGoogle Docsで作成し、Classroomの課題から提出してください。最低300語。', completed: false, due_at: null },
  { id: '3', title: '文化祭 参加希望アンケート', source: '生徒会', type: 'other', due: '金曜まで', color: 'bg-blue-100 text-blue-700', icon: Info, details: '文化祭の有志発表（バンド、ダンス等）に参加を希望する団体は、代表者がこのアンケートに回答してください。', completed: false, due_at: null },
  { id: '4', title: '現代文 短歌創作課題', source: '授業内指示', type: 'paper', due: '来週月曜', color: 'bg-purple-100 text-purple-700', icon: FileText, details: 'テーマは「青春」または「日常の発見」。原稿用紙1枚に短歌3首とそれぞれの解説文を記述。', completed: false, due_at: null },
  { id: '5', title: '物理基礎 実験レポート', source: 'Classroom', type: 'classroom', due: '金曜まで', color: 'bg-amber-100 text-amber-700', icon: Monitor, details: '先週行った「自由落下運動」の実験結果をスプレッドシートにまとめ、グラフを添付して提出。', completed: false, due_at: null },
];

const getTodoPresentation = (type: string) => {
  switch (type) {
    case 'paper':
      return { color: 'bg-red-100 text-red-700', icon: FileText };
    case 'classroom':
      return { color: 'bg-orange-100 text-orange-700', icon: Monitor };
    case 'other':
      return { color: 'bg-blue-100 text-blue-700', icon: Info };
    default:
      return { color: 'bg-gray-100 text-gray-700', icon: FileText };
  }
};

const INITIAL_ROOMS = [
  { id: 101, name: '栄冠ホール', status: '快適', temp: '25℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 102, name: '化学実験室', status: '快適', temp: '24℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 103, name: '生物実験室', status: '快適', temp: '26℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 104, name: 'グローリーホール', status: '快適', temp: '27℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 105, name: 'ミーティングルーム1', status: '快適', temp: '23℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 106, name: 'ミーティングルーム2', status: '快適', temp: '28℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 107, name: '図書館', status: '快適', temp: '24℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 108, name: 'グローバルステーション', status: '快適', temp: '26℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 109, name: 'Call教室', status: '快適', temp: '23℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 110, name: 'PC教室', status: '快適', temp: '27℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 111, name: '家庭科室', status: '快適', temp: '29℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 112, name: '普通教室（1-1）', status: '快適', temp: '30℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
];

type AppSchoolNotification = {
  id: string | number;
  title: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  time: string;
  isRead: boolean;
  category: string;
  priority: 'normal' | 'important' | 'emergency';
  isPinned: boolean;
  expiresAt: string | null;
};

type LostFoundWatch = {
  id: string;
  keyword: string;
  is_active: boolean;
  created_at: string;
};
type SearchableCountdownEvent = { id: string; title: string; summary: string; event_date: string; is_active: boolean };
type SearchableScheduleItem = { id: string; date: string; dayLabel: string; time: string; title: string; location: string; details: string };

type CafeteriaMenuItem = {
  id: string;
  name: string;
  price: string;
  calorie: string;
  allergy: string;
};

const getTokyoDateKey = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const getTokyoDayRange = (dateKey = getTokyoDateKey()) => {
  const start = new Date(`${dateKey}T00:00:00+09:00`);
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
};

const INITIAL_LOST_AND_FOUND: LostAndFoundItem[] = [];


const FAVORITE_DASHBOARD_OPTIONS = [
  { id: 'timetable', label: '時間割', icon: Calendar },
  { id: 'cafeteria', label: '学食', icon: Utensils },
  { id: 'ai', label: 'CampusSync AI', icon: Sparkles },
  { id: 'tasks', label: '課題・提出物', icon: FileText },
  { id: 'bus', label: '電車・バス', icon: Train },
  { id: 'chat', label: 'クラスチャット', icon: MessageCircle },
  { id: 'campus-map', label: '校内マップ', icon: MapPin },
  { id: 'notifications', label: 'お知らせ', icon: BellRing },
] as const;

// --- 🚃 鷹の台駅：平日ダイヤ（ユーザー提供の時刻表） ---
const createWeekdayTrains = (times: string, destination: string) =>
  times.trim().split(/\s+/).filter(Boolean).map(time => ({
    time,
    service: `各駅停車${destination}行き`,
  }));

const TAKANODAI_TIMETABLE = {
  kokubunji: {
    id: 'kokubunji',
    name: '国分寺方面',
    destination: '国分寺行き',
    trains: createWeekdayTrains(`
05:10 05:31 05:47
06:02 06:17 06:27 06:38 06:48 06:56
07:05 07:12 07:20 07:27 07:35 07:42 07:51 07:59
08:06 08:14 08:21 08:29 08:36 08:46 08:54
09:02 09:13 09:23 09:33 09:43 09:53
10:03 10:13 10:23 10:33 10:43 10:53
11:03 11:13 11:23 11:33 11:43 11:53
12:03 12:13 12:23 12:33 12:43 12:53
13:03 13:13 13:23 13:33 13:43 13:53
14:03 14:13 14:23 14:33 14:43 14:53
15:03 15:13 15:23 15:33 15:43 15:53
16:04 16:14 16:25 16:34 16:45 16:55
17:05 17:15 17:25 17:35 17:45 17:55
18:05 18:15 18:25 18:35 18:45 18:55
19:05 19:15 19:25 19:35 19:45 19:55
20:05 20:15 20:25 20:35 20:45 20:55
21:05 21:15 21:25 21:36 21:48
22:06 22:21 22:37 22:51
23:07 23:21 23:36 23:52
00:10
    `, '国分寺'),
  },
  higashimurayama: {
    id: 'higashimurayama',
    name: '東村山方面',
    destination: '東村山行き',
    trains: createWeekdayTrains(`
05:25 05:47
06:02 06:17 06:33 06:43 06:56
07:07 07:12 07:20 07:27 07:37 07:44 07:51 07:59
08:07 08:14 08:23 08:29 08:37 08:45 08:55
09:01 09:08 09:18 09:28 09:38 09:48 09:58
10:08 10:18 10:28 10:38 10:48 10:58
11:08 11:18 11:28 11:38 11:48 11:58
12:08 12:18 12:28 12:38 12:48 12:58
13:08 13:18 13:28 13:38 13:48 13:58
14:08 14:18 14:28 14:38 14:48 14:58
15:08 15:18 15:28 15:38 15:48 15:58
16:09 16:19 16:29 16:39 16:50
17:00 17:10 17:20 17:30 17:40 17:50
18:00 18:10 18:20 18:30 18:40 18:50
19:00 19:10 19:20 19:30 19:40 19:50
20:00 20:10 20:20 20:30 20:40 20:50
21:00 21:10 21:20 21:30 21:42 21:53
22:06 22:21 22:36 22:51
23:06 23:21 23:36 23:52
00:10 00:27
    `, '東村山'),
  },
};

// 旧バス状況報告の互換データ（現在の生徒画面では表示せず、電車発車案内を使用）
const MOCK_BUS_STATIONS: {
  id: string;
  name: string;
  departures: string[];
}[] = [
  { id: 'hachioji', name: '八王子駅直行便', departures: ['15:45', '16:00', '16:20', '16:40', '17:00', '17:30', '18:00', '18:30'] },
  { id: 'haijima', name: '拝島駅巡回便', departures: ['15:50', '16:15', '16:35', '16:55', '17:15', '17:45', '18:15', '18:45'] },
  { id: 'akitsu', name: '新秋津駅シャトル', departures: ['16:05', '16:30', '17:00', '17:30', '18:10'] },
];

// Club notes are loaded only from the live database; no demo posts are seeded.

type SchoolClub = { id: string; name: string; category: '文化クラブ' | '運動クラブ' | '同好会' | '研究会'; sprite: 1 | 2 | 3 | 4 };

function formatClubAuthorLabel(value: unknown): string {
  const label = String(value || '').trim();
  if (!label || label.includes('@') || /^[0-9]{6}(?:\s*より)?$/.test(label)) {
    return '学校からのお知らせ';
  }
  return label;
}


// 学校の正式な部活・同好会・研究会一覧と、club-icons.zip に入っていたアイコンの対応表。
const SCHOOL_CLUBS: SchoolClub[] = [
  { id: 'drama', name: '演劇部', category: '文化クラブ', sprite: 1 },
  { id: 'physics', name: '物理技工部', category: '文化クラブ', sprite: 1 },
  { id: 'calligraphy', name: '書道部', category: '文化クラブ', sprite: 1 },
  { id: 'biology', name: '生物部', category: '文化クラブ', sprite: 1 },
  { id: 'art', name: '美術部', category: '文化クラブ', sprite: 1 },
  { id: 'brass-band', name: '吹奏楽部', category: '文化クラブ', sprite: 1 },
  { id: 'broadcast', name: '放送部', category: '文化クラブ', sprite: 1 },
  { id: 'koto', name: '箏曲部', category: '文化クラブ', sprite: 1 },
  { id: 'tsubasa-chorus', name: '翼コーラス部', category: '文化クラブ', sprite: 1 },
  { id: 'ic-english-debate', name: 'IC・英語ディベート部', category: '文化クラブ', sprite: 2 },
  { id: 'soka-oratory', name: '創価雄弁会', category: '文化クラブ', sprite: 2 },
  { id: 'manga', name: '漫画研究会', category: '文化クラブ', sprite: 2 },
  { id: 'string-ensemble', name: '弦楽アンサンブル部', category: '文化クラブ', sprite: 2 },
  { id: 'track-and-field', name: '陸上部', category: '運動クラブ', sprite: 2 },
  { id: 'soccer', name: 'サッカー部（男子）', category: '運動クラブ', sprite: 2 },
  { id: 'basketball', name: 'バスケットボール部', category: '運動クラブ', sprite: 2 },
  { id: 'volleyball', name: 'バレーボール部', category: '運動クラブ', sprite: 2 },
  { id: 'badminton', name: 'バドミントン部', category: '運動クラブ', sprite: 2 },
  { id: 'dance', name: 'ダンス部', category: '運動クラブ', sprite: 3 },
  { id: 'baseball-hard', name: '硬式野球部（男子）', category: '運動クラブ', sprite: 3 },
  { id: 'baseball-soft', name: '軟式野球部（男子）', category: '運動クラブ', sprite: 3 },
  { id: 'tennis', name: '硬式テニス部', category: '運動クラブ', sprite: 3 },
  { id: 'soft-tennis', name: 'ソフトテニス部（女子）', category: '運動クラブ', sprite: 3 },
  { id: 'swimming', name: '水泳部（男子）', category: '運動クラブ', sprite: 3 },
  { id: 'handball', name: 'ハンドボール部', category: '運動クラブ', sprite: 3 },
  { id: 'kendo', name: '剣道部', category: '運動クラブ', sprite: 3 },
  { id: 'table-tennis', name: '卓球部（男子）', category: '運動クラブ', sprite: 3 },
  { id: 'chemistry', name: '化学同好会', category: '同好会', sprite: 4 },
  { id: 'math', name: '数学同好会', category: '同好会', sprite: 4 },
  { id: 'astronomy', name: '天文同好会', category: '同好会', sprite: 4 },
  { id: 'hangul', name: 'ハングル研究会', category: '研究会', sprite: 4 },
  { id: 'russian', name: 'ロシア語研究会', category: '研究会', sprite: 4 },
  { id: 'spanish', name: 'スペイン語研究会', category: '研究会', sprite: 4 },
  { id: 'german', name: 'ドイツ語研究会', category: '研究会', sprite: 4 },
  { id: 'chinese', name: '中国語研究会', category: '研究会', sprite: 4 },
  { id: 'french', name: 'フランス語研究会', category: '研究会', sprite: 4 },
];

const getSchoolClub = (clubName: string): SchoolClub | undefined =>
  SCHOOL_CLUBS.find(club => club.name === String(clubName || '').trim());

function ClubNoteIcon({ clubName, size = 32 }: { clubName: string; size?: number }) {
  const club = getSchoolClub(clubName);
  if (!club) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-xl border border-purple-100 bg-purple-50 text-purple-600"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <MessageSquare size={Math.max(14, Math.round(size * 0.55))} />
      </span>
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50"
      style={{ width: size, height: size }}
      title={club.name}
    >
      <svg viewBox="0 0 64 64" width={size - 2} height={size - 2} role="img" aria-label={club.name}>
        <use href={`/club-icons/sprite-${club.sprite}.svg#${club.id}`} />
      </svg>
    </span>
  );
}

type LibraryBook = {
  id: string;
  title: string;
  author: string;
  code: string;
  status: string;
  cover_url?: string | null;
  created_at?: string;
};


type LostAndFoundItem = {
  id: string | number;
  title: string;
  location: string;
  date: string;
  description: string;
  finder: string;
  created_at?: string;
};

type StudyRoomStatus = {
  room_key: string;
  room_name: string;
  occupied_seats: number;
  total_seats: number;
  updated_at?: string;
};

const formatLostItemDate = (value?: string | null): string => {
  if (!value) return '日時不明';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const time = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `今日 ${time}`;
  return `${date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} ${time}`;
};

const normalizeLostAndFoundRow = (row: any): LostAndFoundItem => ({
  id: row.id ?? `${row.title ?? 'lost'}-${row.created_at ?? Date.now()}`,
  title: row.title ?? row.item_name ?? '品名未登録',
  location: row.location ?? row.found_location ?? '',
  date: row.created_at ? formatLostItemDate(row.created_at) : (row.date ? formatLostItemDate(row.date) : '日時不明'),
  description: row.description ?? row.details ?? '詳細情報なし',
  finder: row.finder ?? row.storage_location ?? row.storage ?? row.found_by ?? '',
  created_at: row.created_at,
});

type CafeteriaReview = {
  id: string | number;
  menuId: string;
  userName: string;
  rating: number;
  comment: string;
  date: string;
};

// 学食堂メニューの口コミ初期値
const INITIAL_CAFETERIA_REVIEWS: CafeteriaReview[] = [
  { id: 1, menuId: 'soka', userName: '2年スキッパー', rating: 5, comment: '今日の創価ランチのチキン南蛮、タルタルソースが濃厚で最高に美味しかった！ボリュームも満点。', date: '今日 12:40' },
  { id: 2, menuId: 'noodles', userName: 'ラーメン大好き3回生', rating: 4, comment: '情熱ラーメンは安定の醤油ベース。トッピングのチャーシューがいつもより少し厚くて嬉しかった！', date: '今日 12:15' },
  { id: 3, menuId: 'snack', userName: '部活終わりの胃袋', rating: 5, comment: 'ポテトと唐揚げのセットは、昼休みだけでなく放課後の部活前の小腹満たしにも神。売り切れるのが早いのが玉にキズ。', date: '昨日' },
];

// 同じブラウザ・同じ学籍番号では同じ投票IDを使い、何度押しても投票行を増やさない
const getOrCreateVoteId = (studentId: string): string => {
  if (typeof window === 'undefined') return '';

  const key = `campus-sync-voter-id:${studentId || 'anonymous'}`;
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const newId =
    typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `vote-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  window.localStorage.setItem(key, newId);
  return newId;
};

type GuestPreviewTab = 'home' | 'timetable' | 'cafeteria' | 'facilities' | 'transport' | 'chat' | 'club' | 'notifications' | 'settings';

const GUEST_PREVIEW_NAV: Array<{ id: GuestPreviewTab; label: string; icon: React.ElementType }> = [
  { id: 'home', label: 'ホーム', icon: Home },
  { id: 'timetable', label: '時間割', icon: Calendar },
  { id: 'cafeteria', label: '学食', icon: Utensils },
  { id: 'facilities', label: '校内施設', icon: BookOpen },
  { id: 'transport', label: '電車案内', icon: Train },
  { id: 'chat', label: 'チャット', icon: MessageCircle },
  { id: 'club', label: '部活ノート', icon: MessageSquare },
  { id: 'notifications', label: '通知', icon: Bell },
  { id: 'settings', label: '設定', icon: Settings },
];

const GUEST_PREVIEW_TIMETABLE = [
  { period: '1限', time: '08:50–09:40', subject: '数学演習', teacher: '山田先生', room: '1-1教室' },
  { period: '2限', time: '09:50–10:40', subject: '英語コミュニケーション', teacher: '佐藤先生', room: '1-1教室' },
  { period: '3限', time: '10:50–11:40', subject: '現代の国語', teacher: '鈴木先生', room: '1-1教室' },
  { period: '4限', time: '11:50–12:40', subject: '化学基礎', teacher: '田中先生', room: '化学実験室' },
  { period: '5限', time: '13:25–14:15', subject: '体育', teacher: '高橋先生', room: '体育館' },
];
const GUEST_PREVIEW_MESSAGES = [
  { name: '青空さん（サンプル）', className: '1-1', time: '10:02', body: '明日の数学演習、プリントP20〜21を忘れないように！' },
  { name: 'CampusSync運営（サンプル）', className: 'お知らせ', time: '09:45', body: 'これはデモ用のメッセージです。実際の生徒の投稿は表示されません。' },
  { name: 'みどりさん（サンプル）', className: '1-1', time: '昨日', body: '時間割や提出物をまとめて確認できるのは便利ですね。' },
];

function GuestPreviewApp({ onExit }: { onExit: () => void }) {
  const [activeTab, setActiveTab] = useState<GuestPreviewTab>('home');
  const activeNav = GUEST_PREVIEW_NAV.find(item => item.id === activeTab) || GUEST_PREVIEW_NAV[0];
  const sampleTag = <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[10px] font-black tracking-wide text-cyan-800">SAMPLE / サンプル</span>;
  const cardClass = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';
  const mutedClass = 'text-xs leading-5 text-slate-500';

  const renderView = () => {
    switch (activeTab) {
      case 'home':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                { label: '提出物', value: '3件', note: '未完了（サンプル）', icon: FileText },
                { label: '今日の授業', value: '5限', note: '時間割の例', icon: Calendar },
                { label: '学食の混雑', value: 'やや混雑', note: '架空の集計', icon: Utensils },
                { label: 'お知らせ', value: '2件', note: 'デモ通知', icon: Bell },
              ].map(item => {
                const Icon = item.icon;
                return <div key={item.label} className={cardClass}><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-500">{item.label}</span><Icon size={17} className="text-cyan-700" /></div><p className="mt-3 text-2xl font-black text-slate-900">{item.value}</p><p className="mt-1 text-[10px] text-slate-500">{item.note}</p></div>;
              })}
            </div>
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <section className={cardClass}>
                <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-black text-slate-900">今日の時間割</h3>{sampleTag}</div>
                <div className="space-y-2">{GUEST_PREVIEW_TIMETABLE.slice(0, 3).map(row => <div key={row.period} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><div className="w-12 shrink-0 text-center"><p className="text-xs font-black text-cyan-800">{row.period}</p><p className="mt-1 text-[9px] text-slate-500">{row.time.split('–')[0]}</p></div><div className="min-w-0 flex-1 border-l border-slate-200 pl-3"><p className="text-sm font-black text-slate-800">{row.subject}</p><p className="mt-1 text-[10px] text-slate-500">{row.teacher} ・ {row.room}</p></div></div>)}</div>
                <button type="button" onClick={() => setActiveTab('timetable')} className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl border border-slate-200 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50">時間割を確認 <ChevronRight size={15} /></button>
              </section>
              <section className={cardClass}>
                <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-black text-slate-900">提出物リマインダー</h3>{sampleTag}</div>
                {[
                  { title: '数学演習プリント P20-21', due: '明日 08:30', tone: 'text-rose-600 bg-rose-50' },
                  { title: '英語 Unit 4 ワーク', due: '金曜日', tone: 'text-amber-700 bg-amber-50' },
                  { title: '化学基礎 レポート', due: '期限未設定', tone: 'text-slate-600 bg-slate-100' },
                ].map(item => <div key={item.title} className="border-b border-slate-100 py-3 last:border-0"><p className="text-sm font-bold text-slate-800">{item.title}</p><span className={'mt-1 inline-flex rounded-md px-2 py-1 text-[10px] font-black ' + item.tone}>{item.due}</span></div>)}
                <p className="mt-2 text-[10px] leading-4 text-slate-400">デモ画面のため、完了操作や期限変更はできません。</p>
              </section>
            </div>
            <section className={cardClass}><div className="mb-3 flex items-center gap-2"><Info size={17} className="text-cyan-700" /><h3 className="font-black text-slate-900">CampusSyncでできること</h3></div><div className="grid gap-3 sm:grid-cols-3">{[{title:'学校生活を一覧',body:'時間割、提出物、通知をひとつの画面で確認。'},{title:'キャンパス情報',body:'学食メニュー、校内施設、交通案内をチェック。'},{title:'学校内の連絡',body:'クラスや部活の連絡機能の画面をプレビュー。'}].map(item=><div key={item.title} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-800">{item.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{item.body}</p></div>)}</div></section>
          </div>
        );
      case 'timetable':
        return <section className={cardClass}><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-lg font-black text-slate-900">時間割表</h3><p className={mutedClass}>月曜日の例・授業名と教室はすべてサンプル</p></div>{sampleTag}</div><div className="space-y-2">{GUEST_PREVIEW_TIMETABLE.map(row=><div key={row.period} className="grid grid-cols-[48px_1fr] gap-3 rounded-xl border border-slate-100 p-3 sm:grid-cols-[55px_110px_1fr] sm:items-center"><div className="text-sm font-black text-cyan-800">{row.period}</div><div className="text-[10px] text-slate-500">{row.time}</div><div className="sm:border-l sm:border-slate-100 sm:pl-3"><p className="text-sm font-black text-slate-800">{row.subject}</p><p className="mt-1 text-xs text-slate-500">{row.teacher} ・ {row.room}</p></div></div>)}</div><p className="mt-4 text-xs text-slate-400">時間割の切り替えや変更内容の保存は無効化されています。</p></section>;
      case 'cafeteria':
        return <div className="space-y-4"><section className={cardClass}><div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-lg font-black text-slate-900">学食メニュー・混雑状況</h3>{sampleTag}</div><div className="grid gap-3 sm:grid-cols-3">{[{name:'Sokaランチ',price:'550円',desc:'主菜・ご飯・スープ'},{name:'情熱ラーメン',price:'480円',desc:'醤油ベース'},{name:'カレーライス',price:'450円',desc:'定番メニュー'}].map((item,i)=><div key={item.name} className="overflow-hidden rounded-xl border border-slate-200"><div className={'flex h-24 items-center justify-center ' + (i===0?'bg-amber-50':i===1?'bg-rose-50':'bg-yellow-50')}><Utensils size={30} className="text-slate-500" /></div><div className="p-3"><p className="text-sm font-black text-slate-800">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.desc}</p><p className="mt-2 text-sm font-black text-cyan-800">{item.price}</p><p className="mt-1 text-[10px] font-bold text-emerald-700">サンプル：販売中</p></div></div>)}</div></section><section className={cardClass}><h3 className="mb-3 font-black text-slate-900">学食の混雑（サンプル集計）</h3><div className="grid grid-cols-3 gap-2 text-center">{[{label:'空いている',num:24,color:'bg-emerald-500'},{label:'普通',num:85,color:'bg-amber-500'},{label:'混雑',num:42,color:'bg-rose-500'}].map(item=><div key={item.label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{item.label}</p><p className="my-2 text-xl font-black text-slate-900">{item.num}</p><div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={'h-full rounded-full ' + item.color} style={{width:(item.num/85*100)+'%'}} /></div></div>)}</div><p className="mt-3 text-xs text-slate-400">投票・レビュー投稿は利用できません。</p></section></div>;
      case 'facilities':
        return <div className="space-y-4"><section className={cardClass}><div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-lg font-black text-slate-900">校内施設の状況</h3>{sampleTag}</div><div className="grid gap-3 sm:grid-cols-2">{[{name:'キャリアセンター自習室',sub:'利用中 22 / 35席',label:'余裕あり',tone:'text-emerald-700 bg-emerald-50'},{name:'図書室',sub:'開館中（サンプル）',label:'閲覧可',tone:'text-cyan-800 bg-cyan-50'},{name:'普通教室（1-1）',sub:'空調 25℃（サンプル）',label:'快適',tone:'text-emerald-700 bg-emerald-50'},{name:'グローリーホール',sub:'現在の利用状況は架空',label:'確認用',tone:'text-slate-600 bg-slate-100'}].map(item=><div key={item.name} className="rounded-xl border border-slate-100 p-3"><p className="text-sm font-black text-slate-800">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.sub}</p><span className={'mt-2 inline-block rounded-full px-2.5 py-1 text-[10px] font-black '+item.tone}>{item.label}</span></div>)}</div></section></div>;
      case 'transport':
        return <div className="space-y-4"><section className={cardClass}><div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-lg font-black text-slate-900">電車発車案内</h3>{sampleTag}</div><div className="rounded-2xl bg-gradient-to-r from-cyan-700 to-blue-700 p-5 text-white"><p className="text-xs font-bold text-cyan-100">鷹の台駅 ・ サンプル時刻表</p><p className="mt-2 text-3xl font-black">16:12</p><p className="mt-1 text-sm font-bold">国分寺方面（デモ表示）</p><p className="mt-3 rounded-lg bg-white/10 p-2 text-xs">次発の時刻・カウントダウンは実際の運行情報ではありません。</p></div><div className="mt-3 grid gap-3 sm:grid-cols-2">{[{destination:'国分寺方面',times:'16:12 / 16:24 / 16:36'},{destination:'東村山方面',times:'16:18 / 16:30 / 16:42'}].map(item=><div key={item.destination} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-800">{item.destination}</p><p className="mt-2 font-mono text-sm text-slate-600">{item.times}</p></div>)}</div></section></div>;
      case 'chat':
        return <section className={cardClass}><div className="mb-3 flex items-center justify-between gap-2"><div><h3 className="text-lg font-black text-slate-900">クラスチャット</h3><p className={mutedClass}>デモ用の架空メッセージのみ表示しています。</p></div>{sampleTag}</div><div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">ゲストモードでは実際のクラス・学年・全校チャットに接続しません。投稿、返信、リアクション、通報、添付ファイルも利用できません。</div><div className="space-y-3">{GUEST_PREVIEW_MESSAGES.map((message,i)=><div key={message.name+message.time} className={'flex gap-2 ' +(i===1?'flex-row-reverse':'')}><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-black text-cyan-900">{message.name.slice(0,1)}</div><div className={'max-w-[85%] rounded-2xl p-3 '+(i===1?'bg-cyan-50':'bg-slate-100')}><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-black text-slate-700">{message.name}</span><span className="text-[10px] text-slate-400">{message.className} ・ {message.time}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{message.body}</p></div></div>)}</div><div className="mt-4 flex gap-2 border-t border-slate-100 pt-4"><input disabled value="" placeholder="ゲストはメッセージを送信できません" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-100 px-3 py-3 text-xs text-slate-400" /><button type="button" disabled className="rounded-xl bg-slate-200 px-4 text-xs font-black text-slate-400">送信</button></div></section>;
      case 'club':
        return <section className={cardClass}><div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-lg font-black text-slate-900">部活動・委員会ノート</h3>{sampleTag}</div><p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">表示できる投稿はありません。これはゲスト用プレビューのため、実際の投稿データは表示しません。</p></section>;
      case 'notifications':
        return <section className={cardClass}><div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-lg font-black text-slate-900">通知・連絡</h3>{sampleTag}</div><div className="space-y-2">{[{title:'提出物リマインダー',body:'数学演習プリントの期限が近づいています（デモ通知）。',time:'今日 07:00'},{title:'学食メニューのお知らせ',body:'本日のメニューを更新しました（サンプル）。',time:'昨日 12:00'},{title:'CampusSyncからのお知らせ',body:'これは通知画面のプレビューです。',time:'10/20 09:00'}].map(item=><article key={item.title} className="flex gap-3 rounded-xl border border-slate-100 p-3"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-600" /><div><h4 className="text-sm font-black text-slate-800">{item.title}</h4><p className="mt-1 text-xs leading-5 text-slate-600">{item.body}</p><p className="mt-2 text-[10px] text-slate-400">{item.time}</p></div></article>)}</div></section>;
      case 'settings':
        return <div className="space-y-4"><section className={cardClass}><div className="mb-3 flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-800"><User size={22}/></div><div><h3 className="font-black text-slate-900">ゲストプロフィール</h3><p className="text-xs text-slate-500">サンプル情報・保存されません</p></div>{sampleTag}</div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold text-slate-500">表示名</p><p className="mt-1 text-sm font-black text-slate-800">ゲスト見学者</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold text-slate-500">クラス</p><p className="mt-1 text-sm font-black text-slate-800">1-1（サンプル）</p></div><div className="rounded-xl bg-slate-50 p-3 sm:col-span-2"><p className="text-[10px] font-bold text-slate-500">ログイン状態</p><p className="mt-1 text-sm font-black text-cyan-800">ゲスト閲覧専用 ・ メール認証なし</p></div></div></section><section className={cardClass}><h3 className="mb-2 font-black text-slate-900">利用できない機能</h3><div className="grid gap-2 sm:grid-cols-2">{['投稿・編集・削除','投票・レビュー','課題の完了・期限変更','プロフィール保存','通知設定・送信','生徒間のチャット'].map(item=><div key={item} className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-xs font-bold text-slate-600"><Lock size={14} className="text-slate-400"/>{item}</div>)}</div></section></div>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-3 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-600 to-blue-700 text-lg font-black text-white">C</div><div className="min-w-0"><div className="text-lg font-black tracking-tight">Campus<span className="text-cyan-700">Sync</span></div><p className="text-[10px] font-bold tracking-widest text-slate-500">GUEST PREVIEW</p></div></div>
          <div className="flex items-center gap-2"><span className="hidden rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[10px] font-black text-cyan-800 sm:inline-flex">閲覧専用デモ</span><button type="button" onClick={onExit} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">ログイン画面へ戻る</button></div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1500px] gap-0 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-200 bg-white p-4 lg:block">
          <p className="mb-3 px-3 text-[10px] font-black tracking-widest text-slate-400">DEMO NAVIGATION</p>
          <nav className="space-y-1">{GUEST_PREVIEW_NAV.map(item=>{const Icon=item.icon;const isActive=activeTab===item.id;return <button key={item.id} type="button" onClick={()=>setActiveTab(item.id)} className={'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-xs font-black transition '+(isActive?'bg-cyan-50 text-cyan-800':'text-slate-600 hover:bg-slate-50')}><Icon size={17}/>{item.label}{isActive&&<ChevronRight size={14} className="ml-auto"/>}</button>;})}</nav>
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-[10px] font-black text-amber-900">サンプル環境</p><p className="mt-1 text-[10px] leading-4 text-amber-800">この画面から実データへアクセスすることはありません。</p></div>
        </aside>
        <main className="min-w-0 p-3 sm:p-5 lg:p-7">
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"><div className="flex items-start gap-2.5"><Info size={18} className="mt-0.5 shrink-0 text-amber-700"/><div><p className="text-xs font-black text-amber-950">ゲスト閲覧モード：すべてサンプルデータです</p><p className="mt-1 text-[11px] leading-5 text-amber-900">実際の生徒データやチャットには接続していません。投稿・保存・投票・通知送信はできず、この画面での操作によって実データが変わることもありません。</p></div></div></div>
          <div className="mb-5 lg:hidden"><nav className="flex gap-1.5 overflow-x-auto pb-1">{GUEST_PREVIEW_NAV.map(item=>{const Icon=item.icon;return <button key={item.id} type="button" onClick={()=>setActiveTab(item.id)} className={'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-black '+(activeTab===item.id?'border-cyan-700 bg-cyan-700 text-white':'border-slate-200 bg-white text-slate-600')}><Icon size={14}/>{item.label}</button>;})}</nav></div>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-800">CampusSync / Sample</p><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{activeNav.label}</h1><p className="mt-1 text-xs text-slate-500">実際のデータとは分離された操作不可のプレビュー</p></div>{sampleTag}</div>
          {renderView()}
        </main>
      </div>
    </div>
  );
}

export default function CampusSyncApp() {
  // オープニング演出は、このページを開いた後の認証完了時に1回だけ再生する。
  // 認証ユーザーのオブジェクト更新やタブ切替では再生し直さない。
  const [showCampusIntro, setShowCampusIntro] = useState(false);
  const introStartedAtRef = useRef<number | null>(null);

  const [activeTab, setActiveTab] = useState('home');
  const [hashScrollTarget, setHashScrollTarget] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [favoriteDashboardTabs, setFavoriteDashboardTabs] = useState<string[]>(['timetable', 'cafeteria', 'ai', 'chat']);
  const [showFavoriteEditor, setShowFavoriteEditor] = useState(false);
  const activeTabHashSyncRef = useRef(false);
  const [classChatUnreadCount, setClassChatUnreadCount] = useState(0);
  const [selectedTodo, setSelectedTodo] = useState<any>(null);
  const [showTempModal, setShowTempModal] = useState(false);
  const [score, setScore] = useState(0); // 初期ポイントは0。実績はSupabaseから取得
  const [lifetimeContributionPoints, setLifetimeContributionPoints] = useState(0);
  const [contributionToast, setContributionToast] = useState<{ points: number; reason: string } | null>(null);
  const contributionToastTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (contributionToastTimer.current !== null) {
        window.clearTimeout(contributionToastTimer.current);
      }
    };
  }, []);

  const showContributionToast = (points: number, reason: string) => {
    if (points <= 0) return;
    setContributionToast({ points, reason });
    if (contributionToastTimer.current !== null) {
      window.clearTimeout(contributionToastTimer.current);
    }
    contributionToastTimer.current = window.setTimeout(() => {
      setContributionToast(null);
      contributionToastTimer.current = null;
    }, 2800);
  };

  // --- 🎨 テーマカラー＆モード管理 ---
  const [theme, setTheme] = useState<ThemeKey>('blue');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [customPrimaryColor, setCustomPrimaryColor] = useState('#00A9FF');
  const [customSecondaryColor, setCustomSecondaryColor] = useState('#A855F7');
  const [customGradientEnabled, setCustomGradientEnabled] = useState(true);
  const [themeColorInput, setThemeColorInput] = useState('');
  const [themeColorMessage, setThemeColorMessage] = useState('');
  const [themeSettingsReady, setThemeSettingsReady] = useState(false);
  const themeCls = theme === 'custom'
    ? {
        ...THEMES.custom,
        bg: customGradientEnabled
          ? 'bg-gradient-to-r from-[var(--campus-theme-primary)] to-[var(--campus-theme-secondary)]'
          : 'bg-[var(--campus-theme-primary)]',
        bgHover: customGradientEnabled ? 'hover:brightness-110' : 'hover:bg-[var(--campus-theme-primary-hover)]',
        gradient: customGradientEnabled
          ? 'from-[var(--campus-theme-primary)] to-[var(--campus-theme-secondary)]'
          : 'from-[var(--campus-theme-primary)] to-[var(--campus-theme-primary)]',
      }
    : THEMES[theme];

  const selectTheme = (nextTheme: ThemeKey) => {
    // テーマ色と表示モードは独立。色を変えてもライト／ダーク設定は維持する。
    setTheme(nextTheme);
    try { window.localStorage.setItem('campus-sync-theme', nextTheme); } catch {}
  };

  useEffect(() => {
    if (!themeSettingsReady) return;
    const colors = theme === 'custom'
      ? { primary: customPrimaryColor, secondary: customGradientEnabled ? customSecondaryColor : customPrimaryColor }
      : THEME_COLOR_VALUES[theme];
    const root = document.documentElement;
    root.style.setProperty('--campus-theme-primary', colors.primary);
    root.style.setProperty('--campus-theme-primary-hover', colors.primary);
    root.style.setProperty('--campus-theme-secondary', colors.secondary);
    root.style.setProperty('--campus-theme-soft', `color-mix(in srgb, ${colors.primary} 12%, white)`);
    root.style.setProperty('--campus-theme-soft-hover', `color-mix(in srgb, ${colors.primary} 20%, white)`);
    root.style.setProperty('--campus-theme-shadow', `${colors.primary}77`);
    root.style.setProperty('--campus-theme-ring', `color-mix(in srgb, ${colors.primary} 30%, transparent)`);
  }, [theme, customPrimaryColor, customSecondaryColor, customGradientEnabled, themeSettingsReady]);

  useEffect(() => {
    if (!themeSettingsReady) return;
    try {
      window.localStorage.setItem('campus-sync-theme', theme);
      window.localStorage.setItem('campus-sync-theme-settings', JSON.stringify({
        primary: customPrimaryColor, secondary: customSecondaryColor, gradient: customGradientEnabled,
      }));
      window.localStorage.setItem('campus-sync-dark-mode', String(isDarkMode));
      window.localStorage.setItem('campus-sync-display-mode-v2', isDarkMode ? 'dark' : 'light');
    } catch {}
  }, [theme, customPrimaryColor, customSecondaryColor, customGradientEnabled, isDarkMode, themeSettingsReady]);

  // --- 🔐 学校メール認証・プロフィール ---
  const [authUser, setAuthUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginOtp, setLoginOtp] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authStep, setAuthStep] = useState<'email' | 'otp'>('email');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [guestCode, setGuestCode] = useState('');
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [profileSetupStatus, setProfileSetupStatus] = useState<'checking' | 'required' | 'complete' | 'error'>('checking');
  const authUserIdRef = useRef<string | null>(null);
  const [profileSetupGrade, setProfileSetupGrade] = useState('1');
  const [profileSetupClass, setProfileSetupClass] = useState('1');
  const [profileSetupPassword, setProfileSetupPassword] = useState('');
  const [profileSetupPasswordConfirm, setProfileSetupPasswordConfirm] = useState('');
  const [profileSetupMessage, setProfileSetupMessage] = useState('');
  const [profileSetupBusy, setProfileSetupBusy] = useState(false);


  // LINEリッチメニューのURLハッシュから、対応するアプリ内タブを直接開く。
  useEffect(() => {
    const hashRoutes: Record<string, { tab: string; scrollTarget?: string }> = {
      food: { tab: 'cafeteria' },
      tasks: { tab: 'home', scrollTarget: 'tasks' },
      transit: { tab: 'bus' },
      chat: { tab: 'chat' },
      campus: { tab: 'facilities' },
      timetable: { tab: 'timetable' },
      schedule: { tab: 'school-schedule' },
      notices: { tab: 'notifications' },
    };

    const applyHashRoute = () => {
      const hash = window.location.hash.replace(/^#/, '').toLowerCase();
      if (!hash) return;

      if (hash === 'ai') {
        setActiveTab('ai');
        setHashScrollTarget('');
        return;
      }

      const route = hashRoutes[hash];
      if (!route) return;
      if (hash === 'campus') setFacilitiesSubTab('map');
      setActiveTab(route.tab);
      setHashScrollTarget(route.scrollTarget || '');
    };

    applyHashRoute();
    window.addEventListener('hashchange', applyHashRoute);
    return () => window.removeEventListener('hashchange', applyHashRoute);
  }, []);

  // アプリ内でタブを切り替えた場合もURLを同期し、LINE共有リンクを正しい画面に保つ。
  useEffect(() => {
    if (!activeTabHashSyncRef.current) {
      activeTabHashSyncRef.current = true;
      return;
    }
    const hashes: Record<string, string> = {
      home: 'home',
      cafeteria: 'food',
      ai: 'ai',
      bus: 'transit',
      chat: 'chat',
      facilities: 'campus',
      timetable: 'timetable',
      'school-schedule': 'schedule',
      notifications: 'notices',
    };
    const nextHash = hashes[activeTab] || '';
    const currentHash = window.location.hash.replace(/^#/, '').toLowerCase();
    if (currentHash === nextHash) return;

    const nextUrl = window.location.pathname + window.location.search + (nextHash ? '#' + nextHash : '');
    window.history.replaceState(null, '', nextUrl);
    window.dispatchEvent(new Event('campus-sync-ai-route'));
  }, [activeTab]);

  // 課題はホーム内の提出物セクションにあるため、ホーム描画後に該当位置まで移動する。
  useEffect(() => {
    if (hashScrollTarget !== 'tasks' || activeTab !== 'home') return;
    let frame = 0;
    let attempts = 0;
    let cancelled = false;

    const scrollToTasks = () => {
      if (cancelled) return;
      const target = document.getElementById('tasks');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setHashScrollTarget('');
        return;
      }
      attempts += 1;
      if (attempts < 30) frame = window.requestAnimationFrame(scrollToTasks);
      else setHashScrollTarget('');
    };

    frame = window.requestAnimationFrame(scrollToTasks);
    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [hashScrollTarget, activeTab, authUser?.id, profileSetupStatus, isGuestMode]);
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [chatDisplayName, setChatDisplayName] = useState('');
  const [showIdCardModal, setShowIdCardModal] = useState(false);
  const [showCardScanner, setShowCardScanner] = useState(false);
  const [cardScanDone, setCardScanDone] = useState(false);
  const [cardScanStatus, setCardScanStatus] = useState('カメラを準備しています…');
  const [scannedStudent, setScannedStudent] = useState<{ student_name: string; user_class: string } | null>(null);
  const [userClass, setUserClass] = useState('1-1'); // 1-1〜3-8から選択
  const [loginHandoffId, setLoginHandoffId] = useState('');
  const [loginHandoffSecret, setLoginHandoffSecret] = useState('');
  const [loginHandoffExpiresAt, setLoginHandoffExpiresAt] = useState('');
  const [loginHandoffStatus, setLoginHandoffStatus] = useState<'idle' | 'waiting' | 'requested' | 'approved' | 'denied' | 'expired' | 'used'>('idle');
  const [loginHandoffMessage, setLoginHandoffMessage] = useState('');
  const [loginHandoffBusy, setLoginHandoffBusy] = useState(false);

  // 最初は必ずSupabase Authのセッションを確認し、認証済みメールから学籍番号を決める。
  useEffect(() => {
    let alive = true;
    const acceptSessionUser = (user: any | null) => {
      if (!alive) return;
      const email = String(user?.email || '').trim().toLowerCase();
      const derivedStudentId = getStudentIdFromSchoolEmail(email);
      if (user && derivedStudentId) {
        const nextAuthUserId = String(user.id || '');
        if (authUserIdRef.current !== nextAuthUserId) {
          authUserIdRef.current = nextAuthUserId;
          setProfileSetupStatus('checking');
        }
        setAuthUser(user);
        setStudentId(derivedStudentId);
        setLoginEmail(email);
      } else {
        authUserIdRef.current = null;
        setAuthUser(null);
        setStudentId('');
        setProfileSetupStatus('complete');
      }
    };

    void (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!alive) return;
      if (error) console.error('ログイン状態の取得に失敗:', error);
      const user = data.session?.user ?? null;
      if (user && !getStudentIdFromSchoolEmail(user.email)) {
        await supabase.auth.signOut({ scope: 'local' });
        acceptSessionUser(null);
      } else {
        acceptSessionUser(user);
      }
      setAuthChecking(false);
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      acceptSessionUser(session?.user ?? null);
    });
    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authUser || typeof window === 'undefined') {
      setShowCampusIntro(false);
      return;
    }

    // 認証完了時に一度だけ表示する。終了アニメーションはCampusSyncIntro側で完了させる。
    // ページ切替や認証状態オブジェクトの更新でイントロを再生し直さない。
    if (introStartedAtRef.current !== null) return;
    introStartedAtRef.current = Date.now();
    setShowCampusIntro(true);
  }, [authUser]);

  // ログインした本人のプロフィールのみ読み込み、メールの@前6桁を固定の学籍番号として使う。
  useEffect(() => {
    if (!authUser) return;
    const email = String(authUser.email || '').trim().toLowerCase();
    const derivedStudentId = getStudentIdFromSchoolEmail(email);
    if (!derivedStudentId) return;
    setStudentId(derivedStudentId);
    let cancelled = false;
    void (async () => {
      let { data, error } = await supabase
        .from('profiles')
        .select('student_id, student_name, user_class, setup_completed_at, chat_display_name')
        .eq('student_id', derivedStudentId)
        .maybeSingle();
      // 新しい列のSQL未適用時も、プロフィール全体の読み込みを壊さない。
      if (error && /chat_display_name|schema cache|column .* does not exist/i.test(error.message)) {
        const fallback = await supabase
          .from('profiles')
          .select('student_id, student_name, user_class, setup_completed_at')
          .eq('student_id', derivedStudentId)
          .maybeSingle();
        data = fallback.data as typeof data;
        error = fallback.error;
      }
      if (cancelled) return;
      if (error) {
        console.error('ログインプロフィールの取得に失敗:', error);
        setAuthMessage('プロフィール登録の準備に失敗しました。Supabaseで student-profile-setup.sql を実行し、profiles のRLSを確認してください。');
        setProfileSetupStatus('error');
        return;
      }
      if (data) {
        const savedName = String(data.student_name || '');
        const savedClass = String(data.user_class || '');
        const normalizedClass = normalizeSchoolClass(savedClass);
        const [savedGrade, savedClassNumber] = normalizedClass.split('-');
        setStudentName(savedName);
        setChatDisplayName(String((data as { chat_display_name?: string | null } | null)?.chat_display_name || ''));
        setUserClass(normalizedClass);
        setProfileSetupGrade(savedGrade || '1');
        setProfileSetupClass(savedClassNumber || '1');
        setProfileSetupStatus(data.setup_completed_at && savedName.trim() && /^[1-3]-[1-8]$/.test(savedClass) ? 'complete' : 'required');
      } else {
        setStudentName('');
        setChatDisplayName('');
        setUserClass('1-1');
        setProfileSetupGrade('1');
        setProfileSetupClass('1');
        setProfileSetupStatus('required');
      }
    })();
    return () => { cancelled = true; };
  }, [authUser?.id]);

  // クラスチャットの未読件数.最終閲覧時刻を端末内に保存し、別クラスの行はRLSで取得できない。
  useEffect(() => {
    if (!authUser?.id || !/^\d{6}$/.test(studentId) || !studentName.trim() || !/^[1-3]-[1-8]$/.test(userClass)) {
      setClassChatUnreadCount(0);
      return;
    }

    const storageKey = 'campus-sync-class-chat-last-seen:' + studentId + ':' + userClass;
    const now = new Date().toISOString();
    if (activeTab === 'chat') {
      try { window.localStorage.setItem(storageKey, now); } catch {}
      setClassChatUnreadCount(0);
      return;
    }

    let active = true;
    let lastSeen = '';
    try { lastSeen = window.localStorage.getItem(storageKey) || ''; } catch {}
    if (!lastSeen) {
      lastSeen = now;
      try { window.localStorage.setItem(storageKey, lastSeen); } catch {}
    } else {
      void supabase
        .from('class_chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('class_name', userClass)
        .gt('created_at', lastSeen)
        .neq('user_id', authUser.id)
        .then(({ count, error }) => {
          if (!active) return;
          if (!error) setClassChatUnreadCount(count ?? 0);
        });
    }

    const channel = supabase
      .channel('class-chat-unread:' + studentId + ':' + userClass)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'class_chat_messages',
        filter: 'class_name=eq.' + userClass,
      }, payload => {
        const row = payload.new as { user_id?: string; class_name?: string };
        if (active && row.class_name === userClass && row.user_id !== authUser.id) {
          setClassChatUnreadCount(current => Math.min(999, current + 1));
        }
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [authUser?.id, studentId, studentName, userClass, activeTab]);

  // 既にこのブラウザーで通知登録済みなら、設定画面に状態を表示する。
  useEffect(() => {
    if (!authUser || !studentId || typeof window === 'undefined') {
      setPushReady(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
          if (!cancelled) setPushStatus('このブラウザーはWeb Push通知に対応していません。');
          return;
        }
        const registration = await navigator.serviceWorker.getRegistration('/sw.js');
        const subscription = await registration?.pushManager.getSubscription();
        if (!subscription || Notification.permission !== 'granted') {
          if (!cancelled) setPushReady(false);
          return;
        }
        const { data: row, error } = await supabase
          .from('push_subscriptions')
          .select('endpoint')
          .eq('user_id', authUser.id)
          .eq('endpoint', subscription.endpoint)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.warn('通知登録状態の確認に失敗:', error.message);
          setPushReady(false);
          return;
        }
        setPushReady(Boolean(row));
        if (row) setPushStatus('この端末のプッシュ通知は有効です。');
      } catch (error) {
        if (!cancelled) console.warn('通知登録状態の確認に失敗:', error);
      }
    })();
    return () => { cancelled = true; };
  }, [authUser, studentId]);

  const enterGuestMode = () => {
    const code = guestCode.trim();
    if (!/^90\d{4}$/.test(code)) {
      setAuthMessage('ゲストコードは「90」から始まる6桁の数字を入力してください。');
      return;
    }
    // This is only a client-side demo selector, not an authenticated account.
    // The guest preview is isolated from real student data and all backend writes.
    setAuthMessage('');
    setIsGuestMode(true);
  };

  const exitGuestMode = () => {
    setIsGuestMode(false);
    setGuestCode('');
    setAuthMessage('');
    setAuthStep('email');
  };

  const signInWithSchoolPassword = async () => {
    const email = loginEmail.trim().toLowerCase();
    if (!SCHOOL_EMAIL_PATTERN.test(email)) {
      setAuthMessage('6桁の学籍番号@tokyo.soka.ed.jp の学校メールアドレスを入力してください。');
      return;
    }
    if (!loginPassword) {
      setAuthMessage('パスワードを入力してください。');
      return;
    }
    setAuthBusy(true);
    setAuthMessage('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: loginPassword });
      if (error) throw error;
      const user = data.user ?? data.session?.user;
      const derivedStudentId = getStudentIdFromSchoolEmail(user?.email || email);
      if (!user || !derivedStudentId) throw new Error('学校メールのアカウントを確認できませんでした。');
      setAuthUser(user);
      setStudentId(derivedStudentId);
      setLoginEmail(email);
      setLoginPassword('');
      setAuthMessage('ログインしました。プロフィールを確認しています。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String((error as any)?.message || '不明なエラー');
      setAuthMessage(`ログインできませんでした: ${message}`);
    } finally {
      setAuthBusy(false);
    }
  };

  const requestSchoolEmailCode = async () => {
    const email = loginEmail.trim().toLowerCase();
    if (!SCHOOL_EMAIL_PATTERN.test(email)) {
      setAuthMessage('6桁の学籍番号@tokyo.soka.ed.jp の学校メールアドレスを入力してください。');
      return;
    }
    setAuthBusy(true);
    setAuthMessage('');
    try {
      // 現在開いているサイトのURLを明示することで、認証メールが
      // Supabaseの古い Site URL（localhost など）へ戻るのを防ぐ。
      // Supabase Dashboard の URL Configuration にこのURLを許可リスト登録すること。
      const emailRedirectTo = new URL('/', window.location.origin).toString();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo,
        },
      });
      if (error) throw error;
      setLoginEmail(email);
      setAuthStep('otp');
      setAuthMessage('学校メールにログイン確認コードを送信しました。日本語メールに記載された6桁コードを入力してください。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String((error as any)?.message || '不明なエラー');
      setAuthMessage(`確認コードを送信できませんでした: ${message}`);
    } finally {
      setAuthBusy(false);
    }
  };

  const verifySchoolEmailCode = async () => {
    const email = loginEmail.trim().toLowerCase();
    const token = loginOtp.trim();
    if (!SCHOOL_EMAIL_PATTERN.test(email)) {
      setAuthMessage('学校メールアドレスを確認してください。');
      setAuthStep('email');
      return;
    }
    if (!/^\d{6}$/.test(token)) {
      setAuthMessage('メールに届いた6桁の確認コードを入力してください。');
      return;
    }
    setAuthBusy(true);
    setAuthMessage('');
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      if (error) throw error;
      const user = data.user ?? data.session?.user;
      const derivedStudentId = getStudentIdFromSchoolEmail(user?.email || email);
      if (!user || !derivedStudentId) throw new Error('学校メールの認証を確認できませんでした。');
      setAuthUser(user);
      setStudentId(derivedStudentId);
      setLoginOtp('');
      setLoginPassword('');
      setAuthMessage('メール認証が完了しました。プロフィールを確認してください。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String((error as any)?.message || '不明なエラー');
      setAuthMessage(`ログインできませんでした: ${message}`);
    } finally {
      setAuthBusy(false);
    }
  };

  const completeInitialProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authUser || !/^\d{6}$/.test(studentId)) {
      setProfileSetupMessage('認証セッションを確認できません。ログインし直してください。');
      return;
    }
    const cleanName = studentName.trim();
    const nextClass = `${profileSetupGrade}-${profileSetupClass}`;
    if (!cleanName || cleanName.length > 80) {
      setProfileSetupMessage('氏名を入力してください（80文字以内）。');
      return;
    }
    if (!/^[1-3]-[1-8]$/.test(nextClass)) {
      setProfileSetupMessage('学年とクラスを選択してください。');
      return;
    }
    if (profileSetupPassword.length < 12) {
      setProfileSetupMessage('パスワードは12文字以上にしてください。');
      return;
    }
    if (profileSetupPassword !== profileSetupPasswordConfirm) {
      setProfileSetupMessage('確認用パスワードが一致しません。');
      return;
    }

    setProfileSetupBusy(true);
    setProfileSetupMessage('');
    try {
      // Password credentials are managed by Supabase Auth; never save them in profiles.
      const { error: passwordError } = await supabase.auth.updateUser({ password: profileSetupPassword });
      if (passwordError) throw passwordError;

      const email = String(authUser.email || '').trim().toLowerCase();
      const { error: profileError } = await supabase.from('profiles').upsert({
        student_id: studentId,
        student_name: cleanName,
        user_class: nextClass,
        email,
        auth_user_id: authUser.id,
        setup_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'student_id' });
      if (profileError) throw profileError;

      setStudentName(cleanName);
      setUserClass(nextClass);
      setProfileSetupPassword('');
      setProfileSetupPasswordConfirm('');
      setProfileSetupStatus('complete');
      setProfileSetupMessage('');
      setAuthMessage('');
    } catch (error) {
      const message = error instanceof Error ? error.message : String((error as any)?.message || '不明なエラー');
      setProfileSetupStatus('required');
      setProfileSetupMessage('登録を完了できませんでした: ' + message + '。入力内容を確認してもう一度お試しください。');
    } finally {
      setProfileSetupBusy(false);
    }
  };

  const signOutStudent = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    setAuthUser(null);
    setStudentId('');
    setStudentName('');
    setLoginPassword('');
    setProfileSetupPassword('');
    setProfileSetupPasswordConfirm('');
    setProfileSetupStatus('complete');
    setNewClubAuthorName('');
    setNewClubPermissionCode('');
    setLoginHandoffId('');
    setLoginHandoffSecret('');
    setLoginHandoffStatus('idle');
    setShowIdCardModal(false);
    setAuthStep('email');
    setAuthMessage('ログアウトしました。');
  };

  // --- 通知設定：カテゴリ別ON/OFF・リマインダー時刻・曜日・おやすみ時間 ---
  type NotificationCategory =
    | 'todo_reminders'
    | 'chat_messages'
    | 'school_announcements'
    | 'transport_alerts'
    | 'cafeteria_updates'
    | 'activity_updates';
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderTimes, setReminderTimes] = useState<string[]>(['dayBefore', 'morningOf']);
  const [allowedNotificationDays, setAllowedNotificationDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [notificationSettings, setNotificationSettings] = useState<Record<NotificationCategory, boolean>>({
    todo_reminders: true,
    chat_messages: true,
    school_announcements: true,
    transport_alerts: true,
    cafeteria_updates: false,
    activity_updates: true,
  });
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState('21:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('07:00');
  const [notificationSettingsLoaded, setNotificationSettingsLoaded] = useState(false);
  const [notificationSaveStatus, setNotificationSaveStatus] = useState('');
  const [pushReady, setPushReady] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState('');
  const [todoDueAtInput, setTodoDueAtInput] = useState('');
  const [showAddTodoModal, setShowAddTodoModal] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoDetails, setNewTodoDetails] = useState('');
  const [newTodoDueAt, setNewTodoDueAt] = useState('');
  const [isAddingTodo, setIsAddingTodo] = useState(false);

  // --- 各種動的ステート管理 ---
  const [todos, setTodos] = useState<any[]>([]);
  const [adminAssignedTodos, setAdminAssignedTodos] = useState<any[]>([]);
  const sharedAssignmentTitles = new Set(adminAssignedTodos.map(todo => String(todo.title || '').trim().toLocaleLowerCase()));
  const visibleTodos = [...todos.filter(todo => !sharedAssignmentTitles.has(String(todo.title || '').trim().toLocaleLowerCase())), ...adminAssignedTodos];
  type RoomWithFlexibleIcon = Omit<(typeof INITIAL_ROOMS)[number], 'icon'> & {
    icon: React.ElementType;
  };
  const [rooms, setRooms] = useState<RoomWithFlexibleIcon[]>(INITIAL_ROOMS);
  const [favoriteRoomId, setFavoriteRoomId] = useState<number>(112);
  const [selectedRoomId, setSelectedRoomId] = useState<number>(101);
  const [selectedStatus, setSelectedStatus] = useState<string>('快適');
  const [selectedAcTemp, setSelectedAcTemp] = useState<number>(25);

  // サブタブ管理
  const [cafeteriaSubTab, setCafeteriaSubTab] = useState<'overall' | 'menu' | 'reviews'>('overall');
  const [cafeteriaAnnouncement, setCafeteriaAnnouncement] = useState<{ message: string; show_popup: boolean; show_banner: boolean; updated_at?: string | null } | null>(null);
  const [showCafeteriaAnnouncementPopup, setShowCafeteriaAnnouncementPopup] = useState(false);
  const [facilitiesSubTab, setFacilitiesSubTab] = useState<'status' | 'lost' | 'map'>('status');
  const [busSubTab] = useState<'countdown' | 'report'>('countdown');

// 学校イベント・カウントダウンを全体検索用に取得する。
useEffect(() => {
  let cancelled = false;
  fetch('/api/school-countdowns', { cache: 'no-store' })
    .then(async response => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'イベントを取得できませんでした。');
      return result;
    })
    .then(result => {
      if (cancelled) return;
      const rows = Array.isArray(result.events) ? result.events as SearchableCountdownEvent[] : [];
      setSearchableCountdownEvents(rows.filter(event => event.is_active));
    })
    .catch(error => {
      if (!cancelled) console.warn('全体検索用イベントを取得できません:', error);
    });
  return () => { cancelled = true; };
}, []);

// 今週の学校予定表を全体検索に加える。前後の週は学校予定表タブから確認できる。
useEffect(() => {
  let cancelled = false;
  const loadCurrentWeek = async () => {
    const today = getTokyoDateKey();
    const [year, month, day] = today.split('-').map(Number);
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    const mondayOffset = (utcDate.getUTCDay() + 6) % 7;
    utcDate.setUTCDate(utcDate.getUTCDate() - mondayOffset);
    const weekStart = utcDate.toISOString().slice(0, 10);
    try {
      const response = await fetch('/api/school-schedule?weekStart=' + encodeURIComponent(weekStart), { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || '学校予定表を取得できませんでした。');
      const days = Array.isArray(result.schedule?.days) ? result.schedule.days : [];
      const items = days.flatMap((day: any) => Array.isArray(day.items) ? day.items.map((item: any, index: number) => ({
        id: String(item.id || day.date + '-' + index),
        date: String(day.date || ''),
        dayLabel: String(day.dayLabel || ''),
        time: String(item.time || ''),
        title: String(item.title || ''),
        location: String(item.location || ''),
        details: String(item.details || ''),
      })) : []);
      if (!cancelled) setSearchableScheduleItems(items);
    } catch (error) {
      if (!cancelled) console.warn('全体検索用学校予定を取得できません:', error);
    }
  };
  void loadCurrentWeek();
  return () => { cancelled = true; };
}, []);

// 校内施設マップ：認証済みの生徒に、管理者が公開した施設情報だけを取得する。
useEffect(() => {
  let cancelled = false;
  const loadFacilities = async () => {
    if (!authUser?.id) {
      setCampusFacilities([]);
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return;
      const response = await fetch('/api/campus-facilities', {
        headers: { Authorization: 'Bearer ' + accessToken },
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(result?.facilities)) {
        throw new Error(result?.message || '校内施設を読み込めませんでした。');
      }
      if (!cancelled) {
        setCampusFacilities(result.facilities as CampusFacility[]);
        setCampusFacilitiesMessage('');
      }
    } catch (error) {
      if (!cancelled) {
        setCampusFacilities([]);
        setCampusFacilitiesMessage(error instanceof Error ? error.message : '校内施設を読み込めませんでした。');
      }
    }
  };
  void loadFacilities();
  return () => { cancelled = true; };
}, [authUser?.id]);

// 落とし物通知キーワードは本人のアカウントに紐づく設定だけを取得する。
useEffect(() => {
  let cancelled = false;
  const loadWatches = async () => {
    if (!authUser?.id) {
      setLostFoundWatches([]);
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return;
      const response = await fetch('/api/lost-found-watches', {
        headers: { Authorization: 'Bearer ' + accessToken },
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(result?.watches)) {
        throw new Error(result?.message || '落とし物通知設定を読み込めませんでした。');
      }
      if (!cancelled) {
        setLostFoundWatches(result.watches as LostFoundWatch[]);
        setLostWatchMessage('');
      }
    } catch (error) {
      if (!cancelled) setLostWatchMessage(error instanceof Error ? error.message : '落とし物通知設定を読み込めませんでした。');
    }
  };
  void loadWatches();
  return () => { cancelled = true; };
}, [authUser?.id]);

const handleAddLostWatch = async (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  const keyword = lostWatchKeyword.trim();
  if (lostWatchSaving || keyword.length < 2) return;
  setLostWatchSaving(true);
  setLostWatchMessage('');
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('学校アカウントでログインしてください。');
    const response = await fetch('/api/lost-found-watches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
      body: JSON.stringify({ keyword }),
      cache: 'no-store',
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.watch) throw new Error(result?.message || '通知キーワードを登録できませんでした。');
    setLostFoundWatches(current => [result.watch as LostFoundWatch, ...current.filter(item => item.id !== result.watch.id)]);
    setLostWatchKeyword('');
    setLostWatchMessage('登録しました。一致する落とし物が事務室で確認・公開されたときに個別通知します。');
  } catch (error) {
    setLostWatchMessage(error instanceof Error ? error.message : '通知キーワードを登録できませんでした。');
  } finally {
    setLostWatchSaving(false);
  }
};

const handleDeleteLostWatch = async (id: string) => {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('学校アカウントでログインしてください。');
    const response = await fetch('/api/lost-found-watches', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
      body: JSON.stringify({ id }),
      cache: 'no-store',
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.message || '通知キーワードを削除できませんでした。');
    setLostFoundWatches(current => current.filter(item => item.id !== id));
    setLostWatchMessage('通知キーワードを削除しました。');
  } catch (error) {
    setLostWatchMessage(error instanceof Error ? error.message : '通知キーワードを削除できませんでした。');
  }
};


  // 添付された7組・8組の時間割。プロフィールが7組・8組なら対応する表示を初期選択する。
  const [selectedTimetableGroup, setSelectedTimetableGroup] = useState<ClassTimetableGroup>('7組');
  const [selectedDay, setSelectedDay] = useState<ClassTimetableDayKey>('Mon');
  const [timetableData, setTimetableData] = useState<ClassTimetableData>(CLASS_TIMETABLE_DATA);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/class-timetable', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(result => { if (!cancelled && result?.success && result?.timetable) setTimetableData(result.timetable as ClassTimetableData); })
      .catch(error => console.error('時間割データの取得に失敗:', error));
    return () => { cancelled = true; };
  }, []);
  const [menuItems, setMenuItems] = useState<CafeteriaMenuItem[]>([]);
  const [cafeteriaMenuLoading, setCafeteriaMenuLoading] = useState(true);
  const [cafeteriaMenuLoadMessage, setCafeteriaMenuLoadMessage] = useState('本日の献立を読み込んでいます…');
  const [reportingSoldOutMenuId, setReportingSoldOutMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (userClass.endsWith('-8')) setSelectedTimetableGroup('8組');
    else if (userClass.endsWith('-7')) setSelectedTimetableGroup('7組');
  }, [userClass]);

  // バス用状態
  const [selectedBusStation, setSelectedBusStation] = useState<string>('hachioji');
  const [selectedTrainDirection, setSelectedTrainDirection] = useState<'kokubunji' | 'higashimurayama'>('kokubunji');
  const [trainTimetable, setTrainTimetable] = useState(TAKANODAI_TIMETABLE);
  const [trainClockNow, setTrainClockNow] = useState<number>(() => Date.now());
  const [busCongestionVote, setBusCongestionVote] = useState<Record<string, string>>({ hachioji: '普通', haijima: '空いている', akitsu: '混雑' });
  const [busDelayMinutes, setBusDelayMinutes] = useState<Record<string, number>>({ hachioji: 0, haijima: 5, akitsu: 0 });

  // 部活・委員会ノート：サンプル投稿は使用せず、DBからのみ表示する。
  const [clubNotes, setClubNotes] = useState<any[]>([]);
  const [newClubName, setNewClubName] = useState('');
  const [newClubTitle, setNewClubTitle] = useState('');
  const [newClubContent, setNewClubContent] = useState('');
  const [newClubAuthorName, setNewClubAuthorName] = useState('');
  const [newClubPermissionCode, setNewClubPermissionCode] = useState('');
  const [isAddingClubNote, setIsAddingClubNote] = useState(false);

  // Adminが登録した既定表示名を初期値にする（投稿者は投稿前に編集可能）。
  useEffect(() => {
    if (!authUser?.id || activeTab !== 'club') return;
    let cancelled = false;
    void (async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) return;
      const response = await fetch('/api/club-notes', {
        method: 'GET',
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        cache: 'no-store',
      });
      if (!response.ok) return;
      const result = await response.json().catch(() => ({}));
      const suggestedName = typeof result.defaultDisplayName === 'string' ? result.defaultDisplayName.trim() : '';
      if (!cancelled && suggestedName) {
        setNewClubAuthorName(current => current.trim() ? current : suggestedName);
      }
      if (!cancelled && Array.isArray(result.notes)) {
        setClubNotes(result.notes.map((note: any) => ({
          id: note.id,
          clubName: String(note.club_name || ''),
          title: String(note.title || ''),
          date: new Date(note.created_at).toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'Asia/Tokyo',
          }),
          createdAt: note.created_at,
          content: String(note.content || ''),
          author: formatClubAuthorLabel(note.author_name || note.author),
        })));
      }
    })().catch(error => console.error('部活投稿者設定の取得に失敗:', error));
    return () => { cancelled = true; };
  }, [authUser?.id, activeTab]);

  // 学食レビュー用状態
  const [cafeteriaReviews, setCafeteriaReviews] = useState<CafeteriaReview[]>(INITIAL_CAFETERIA_REVIEWS);
  const [selectedMenuForReview, setSelectedMenuForReview] = useState<string>('soka');
  const [newReviewRating, setNewReviewRating] = useState<number>(5);
  const [newReviewComment, setNewReviewComment] = useState('');
  const [newReviewUser, setNewReviewUser] = useState('');

  // 学食投票関係
  const [crowdVotes, setCrowdVotes] = useState({ empty: 0, normal: 0, crowded: 0 });
  const [userVote, setUserVote] = useState<'empty' | 'normal' | 'crowded' | null>(null);
  const [isVoting, setIsVoting] = useState(false);

  const [menuVotes, setMenuVotes] = useState<Record<string, { empty: number, normal: number, crowded: number }>>({
    snack: { empty: 0, normal: 0, crowded: 0 },
    soka: { empty: 0, normal: 0, crowded: 0 },
    noodles: { empty: 0, normal: 0, crowded: 0 },
    curry: { empty: 0, normal: 0, crowded: 0 },
    healthy: { empty: 0, normal: 0, crowded: 0 },
  });
  const [userMenuVotes, setUserMenuVotes] = useState<Record<string, 'empty' | 'normal' | 'crowded' | null>>({
    snack: null, soka: null, noodles: null, curry: null, healthy: null,
  });
  const [soldOutItems, setSoldOutItems] = useState<Record<string, boolean>>({});
  const [userSoldOutReports, setUserSoldOutReports] = useState<Record<string, boolean>>({});

  // 落とし物関係（Supabaseに保存し、再読み込み後も共有）
  const [lostAndFoundList, setLostAndFoundList] = useState<LostAndFoundItem[]>(INITIAL_LOST_AND_FOUND);
  const [newLostTitle, setNewLostTitle] = useState('');
  const [newLostLocation, setNewLostLocation] = useState('');
  const [newLostDescription, setNewLostDescription] = useState('');
  const [newLostFinder, setNewLostFinder] = useState('');
  const [lostAndFoundError, setLostAndFoundError] = useState('');
  const [lostSubmitting, setLostSubmitting] = useState(false);
  const [lostFoundWatches, setLostFoundWatches] = useState<LostFoundWatch[]>([]);
  const [lostWatchKeyword, setLostWatchKeyword] = useState('');
  const [lostWatchSaving, setLostWatchSaving] = useState(false);
  const [lostWatchMessage, setLostWatchMessage] = useState('');
  const [campusFacilities, setCampusFacilities] = useState<CampusFacility[]>([]);
  const [campusFacilitiesMessage, setCampusFacilitiesMessage] = useState('');
  const [searchableCountdownEvents, setSearchableCountdownEvents] = useState<SearchableCountdownEvent[]>([]);
  const [searchableScheduleItems, setSearchableScheduleItems] = useState<SearchableScheduleItem[]>([]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [scoreSaving, setScoreSaving] = useState(false);
  const [notifications, setNotifications] = useState<AppSchoolNotification[]>([]);
  const [notificationLoadError, setNotificationLoadError] = useState('');
  const [selectedNotification, setSelectedNotification] = useState<AppSchoolNotification | null>(null);
  const [libraryBooks, setLibraryBooks] = useState<LibraryBook[]>([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryBooksLoading, setLibraryBooksLoading] = useState(true);
  const [libraryBooksError, setLibraryBooksError] = useState('');
  const [selectedLibraryBook, setSelectedLibraryBook] = useState<LibraryBook | null>(null);
  const [studyRoomStatus, setStudyRoomStatus] = useState<StudyRoomStatus>({
    room_key: 'career_center',
    room_name: 'キャリアセンター自習室',
    occupied_seats: 22,
    total_seats: 35,
  });


// お気に入りダッシュボードは端末内に保存し、学校の個人情報は保存しない。
useEffect(() => {
  try {
    const saved = window.localStorage.getItem('campus-sync-dashboard-favorites-v1');
    if (saved) {
      const parsed = JSON.parse(saved) as unknown;
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((value): value is string =>
          typeof value === 'string' && FAVORITE_DASHBOARD_OPTIONS.some(option => option.id === value)
        ).slice(0, 6);
        setFavoriteDashboardTabs(valid);
      }
    }
  } catch (error) {
    console.warn('お気に入りダッシュボードを読み込めませんでした。', error);
  }
}, []);

useEffect(() => {
  try {
    window.localStorage.setItem('campus-sync-dashboard-favorites-v1', JSON.stringify(favoriteDashboardTabs.slice(0, 6)));
  } catch (error) {
    console.warn('お気に入りダッシュボードを保存できませんでした。', error);
  }
}, [favoriteDashboardTabs]);

useEffect(() => {
  const onShortcut = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      setShowGlobalSearch(true);
    }
  };
  window.addEventListener('keydown', onShortcut);
  return () => window.removeEventListener('keydown', onShortcut);
}, []);

// 保存されたテーマ・自由色・ダークモード・お気に入り教室を復元する。
useEffect(() => {
  try {
    const savedTheme = window.localStorage.getItem('campus-sync-theme');
    let restoredTheme: ThemeKey = 'blue';
    if (savedTheme && Object.prototype.hasOwnProperty.call(THEMES, savedTheme)) {
      restoredTheme = savedTheme as ThemeKey;
      setTheme(restoredTheme);
    }

    const savedSettings = window.localStorage.getItem('campus-sync-theme-settings');
    if (savedSettings) {
      const saved = JSON.parse(savedSettings) as { primary?: unknown; secondary?: unknown; gradient?: unknown };
      if (typeof saved.primary === 'string' && /^#[0-9a-f]{6}$/i.test(saved.primary)) setCustomPrimaryColor(saved.primary.toUpperCase());
      if (typeof saved.secondary === 'string' && /^#[0-9a-f]{6}$/i.test(saved.secondary)) setCustomSecondaryColor(saved.secondary.toUpperCase());
      if (typeof saved.gradient === 'boolean') setCustomGradientEnabled(saved.gradient);
    }

    const savedDisplayMode = window.localStorage.getItem('campus-sync-display-mode-v2');
    // 初回はダークを標準にし、以後の選択はこのブラウザーに保存する。
    if (savedDisplayMode === 'light') setIsDarkMode(false);
    else setIsDarkMode(true);

    const savedRoomId = Number(window.localStorage.getItem('campus-sync-favorite-room-id'));
    if (Number.isInteger(savedRoomId) && INITIAL_ROOMS.some(room => room.id === savedRoomId)) setFavoriteRoomId(savedRoomId);
  } catch {
    // ストレージが使用できなくても画面は初期設定で動かす。
  } finally {
    setThemeSettingsReady(true);
  }
}, []);

// 剣ランク用：本人の貢献履歴を合計して累計ポイントを復元する。
useEffect(() => {
  const currentStudentId = String(studentId || '').trim();

  if (!authUser || !/^\d{6}$/.test(currentStudentId)) {
    setLifetimeContributionPoints(0);
    return;
  }

  let cancelled = false;

  const loadLifetimeContribution = async () => {
    let offset = 0;
    let total = 0;
    const pageSize = 1000;

    while (!cancelled) {
      const { data, error } = await supabase
        .from('contribution_history')
        .select('delta')
        .eq('student_id', currentStudentId)
        .order('created_at', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error('累計貢献度履歴の取得に失敗:', error);
        return;
      }

      const rows = data ?? [];
      total += rows.reduce((sum, row) => sum + (Number(row.delta) || 0), 0);

      if (rows.length < pageSize) break;
      offset += rows.length;
    }

    if (!cancelled) {
      setLifetimeContributionPoints(Math.max(0, total));
    }
  };

  void loadLifetimeContribution();

  return () => {
    cancelled = true;
  };
}, [authUser?.id, studentId]);

// ホーム表示用の普通教室は、プロフィールから取得した在籍クラスに合わせる。
useEffect(() => {
  setRooms(prevRooms => prevRooms.map(room =>
    room.id === 112 ? { ...room, name: `普通教室（${userClass}）` } : room
  ));
}, [userClass]);

// 発車カウントダウンはバス・電車画面を開いている間だけ秒単位で更新する。
useEffect(() => {
  if (activeTab !== 'bus') return;
  setTrainClockNow(Date.now());
  const intervalId = window.setInterval(() => setTrainClockNow(Date.now()), 1000);
  return () => window.clearInterval(intervalId);
}, [activeTab]);

// Adminと共有する図書室蔵書を読み込む
useEffect(() => {
  if (!authUser) { setLibraryBooksLoading(false); return; }
  let cancelled = false;

  const fetchLibraryBooks = async () => {
    setLibraryBooksLoading(true);
    setLibraryBooksError('');

    const { data, error } = await supabase
      .from('library_books')
      .select('id, title, author, code, status, cover_url, created_at')
      .order('created_at', { ascending: false });

    if (cancelled) return;

    if (error) {
      console.error('図書室蔵書の取得に失敗:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      setLibraryBooksError('蔵書を読み込めませんでした。時間をおいて再読み込みしてください。');
      setLibraryBooks([]);
    } else {
      setLibraryBooks(data ?? []);
    }

    setLibraryBooksLoading(false);
  };

  void fetchLibraryBooks();

  return () => {
    cancelled = true;
  };
}, [authUser]);

// Adminサイトで設定したキャリアセンター自習室の座席状況を読み込む
useEffect(() => {
  if (!authUser) return;
  let cancelled = false;
  const loadStudyRoomStatus = async () => {
    const { data, error } = await supabase
      .from('study_room_status')
      .select('room_key, room_name, occupied_seats, total_seats, updated_at')
      .eq('room_key', 'career_center')
      .maybeSingle();

    if (cancelled) return;
    if (error) {
      console.error('キャリアセンター自習室の状況取得に失敗:', error);
      return;
    }
    if (data) {
      setStudyRoomStatus({
        room_key: data.room_key,
        room_name: data.room_name || 'キャリアセンター自習室',
        occupied_seats: Number(data.occupied_seats),
        total_seats: Number(data.total_seats),
        updated_at: data.updated_at,
      });
    }
  };

  void loadStudyRoomStatus();
  return () => { cancelled = true; };
}, [authUser]);

// 学食からのお知らせをSupabaseから取得し、ポップアップと学食タブのバナーに反映する。
useEffect(() => {
  if (!authUser) {
    setCafeteriaAnnouncement(null);
    setShowCafeteriaAnnouncementPopup(false);
    return;
  }

  let cancelled = false;
  const loadCafeteriaAnnouncement = async () => {
    const { data, error } = await supabase
      .from('cafeteria_announcements')
      .select('id, message, show_popup, show_banner, updated_at')
      .eq('id', 1)
      .maybeSingle();

    if (cancelled) return;
    if (error) {
      console.error('学食からのお知らせ取得に失敗:', error);
      return;
    }

    const message = String(data?.message || '').trim();
    if (!data || !message) {
      setCafeteriaAnnouncement(null);
      setShowCafeteriaAnnouncementPopup(false);
      return;
    }

    const announcement = {
      message,
      show_popup: data.show_popup === true,
      show_banner: data.show_banner === true,
      updated_at: data.updated_at || null,
    };
    setCafeteriaAnnouncement(announcement);
    setShowCafeteriaAnnouncementPopup(announcement.show_popup);
  };

  void loadCafeteriaAnnouncement();
  return () => { cancelled = true; };
}, [authUser?.id]);

// Supabaseから落とし物・教室状況データを取得
useEffect(() => {
  if (!authUser) return;
  const fetchSharedData = async () => {
    let fetchStep = '投票IDの準備';
    try {
      const currentVoterId = getOrCreateVoteId(studentId.trim());
      fetchStep = '落とし物データ取得（lost_and_found）';
      const { data: lostData, error: lostError } = await supabase
      .from('lost_and_found')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (lostError) {
      console.error('落とし物データの取得に失敗:', lostError);
      setLostAndFoundError('落とし物を読み込めません。Supabaseの lost_and_found テーブルとRLS設定を確認してください。');
      setLostAndFoundList([]);
    } else {
      setLostAndFoundList((lostData ?? []).map(normalizeLostAndFoundRow));
      setLostAndFoundError('');
    }

    fetchStep = '教室状況取得（room_status）';
    const { data: roomData, error: roomError } = await supabase
      .from('room_status')
      .select('*');

    if (roomError) {
      console.error('教室状況データの取得に失敗:', roomError);
      return;
    }

    if (roomData) {
      setRooms(prevRooms =>
        prevRooms.map(room => {
          const sharedRoom = roomData.find(item => String(item.room_id) === String(room.id));
          if (!sharedRoom) return room;

          let color = 'text-green-500';
          let bg = 'bg-green-50';
          let icon: React.ElementType = ThermometerSnowflake;

          if (sharedRoom.status === '寒い' || sharedRoom.status === 'やや寒い') {
            color = 'text-cyan-500';
            bg = 'bg-cyan-50';
            icon = AirconColdIcon;
          } else if (sharedRoom.status === '暑い' || sharedRoom.status === '激暑') {
            color = 'text-red-500';
            bg = 'bg-red-50';
            icon = AirconHotIcon;
          }

          return {
            ...room,
            name: sharedRoom.room_name,
            status: sharedRoom.status,
            temp: sharedRoom.temp,
            icon,
            color,
            bg,
          };
        })
      );
    }

    fetchStep = '学食全体投票取得（cafeteria_votes）';
    const { data: cafeteriaVoteData, error: cafeteriaVoteError } = await supabase
      .from('cafeteria_votes')
      .select('status, voter_id')
      .eq('scope_key', 'overall');

    if (cafeteriaVoteError) {
      console.error('学食混雑投票データの取得に失敗:', cafeteriaVoteError);
    } else if (cafeteriaVoteData) {
      const counts = cafeteriaVoteData.reduce(
        (acc, vote) => {
          if (vote.status === 'empty') acc.empty += 1;
          if (vote.status === 'normal') acc.normal += 1;
          if (vote.status === 'crowded') acc.crowded += 1;
          return acc;
        },
        { empty: 0, normal: 0, crowded: 0 }
      );
      setCrowdVotes(counts);
      const myOverallVote = cafeteriaVoteData.find(
        vote => vote.voter_id === currentVoterId
      );
      setUserVote(
        myOverallVote?.status === 'empty' ||
        myOverallVote?.status === 'normal' ||
        myOverallVote?.status === 'crowded'
          ? myOverallVote.status
          : null
      );
    }

    fetchStep = '学食レビュー取得（cafeteria_reviews）';
    const { data: reviewData, error: reviewError } = await supabase
      .from('cafeteria_reviews')
      .select('*')
      .order('created_at', { ascending: false });

    if (reviewError) {
      console.error('学食レビューの取得に失敗:', reviewError);
    } else if (reviewData) {
      setCafeteriaReviews(
        reviewData.map(review => ({
          id: review.id,
          menuId: review.menu_id,
          userName: review.user_name || '匿名の創価生',
          rating: review.rating,
          comment: review.comment,
          date: new Date(review.created_at).toLocaleString('ja-JP', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        }))
      );
    }

    fetchStep = 'バス状況取得（bus_status）';
    const { data: busData, error: busError } = await supabase
      .from('bus_status')
      .select('*');

    if (busError) {
      console.error('バス状況データの取得に失敗:', busError);
    } else if (busData) {
      const nextCongestion: Record<string, string> = {};
      const nextDelay: Record<string, number> = {};

      busData.forEach(row => {
        nextCongestion[row.station_id] = row.congestion_status;
        nextDelay[row.station_id] = Number(row.delay_minutes) || 0;
      });

      if (Object.keys(nextCongestion).length > 0) {
        setBusCongestionVote(prev => ({ ...prev, ...nextCongestion }));
      }
      if (Object.keys(nextDelay).length > 0) {
        setBusDelayMinutes(prev => ({ ...prev, ...nextDelay }));
      }
    }

    fetchStep = '部活ノート取得（club_notes）';
    const { data: clubData, error: clubError } = await supabase
      .from('club_notes')
      .select('*')
      .order('created_at', { ascending: false });

    if (clubError) {
      console.error('部活・委員会ノートの取得に失敗:', clubError);
    } else if (clubData) {
      setClubNotes(
        clubData.map(note => ({
          id: note.id,
          clubName: note.club_name,
          title: note.title,
          date: new Date(note.created_at).toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'Asia/Tokyo',
          }),
          createdAt: note.created_at,
          content: note.content,
          author: formatClubAuthorLabel(note.author_name || note.author),
        }))
      );
    }

    fetchStep = '本日の献立取得（cafeteria_daily_menus）';
    setCafeteriaMenuLoading(true);
    const today = getTokyoDateKey();
    const { data: dailyMenu, error: dailyMenuError } = await supabase
      .from('cafeteria_daily_menus')
      .select('*')
      .eq('service_date', today)
      .maybeSingle();

    const activeMenuItems: CafeteriaMenuItem[] = (!dailyMenuError && dailyMenu && !dailyMenu.is_closed)
      ? [
          { id: 'soka', name: String(dailyMenu.soka_lunch || '').trim(), price: String(dailyMenu.soka_lunch_price || '').trim(), calorie: String(dailyMenu.soka_lunch_calorie || '').trim(), allergy: String(dailyMenu.soka_lunch_allergy || '').trim() },
          { id: 'healthy', name: String(dailyMenu.healthy_lunch || '').trim(), price: String(dailyMenu.healthy_lunch_price || '').trim(), calorie: String(dailyMenu.healthy_lunch_calorie || '').trim(), allergy: String(dailyMenu.healthy_lunch_allergy || '').trim() },
          { id: 'snack', name: String(dailyMenu.snack_lunch || '').trim(), price: String(dailyMenu.snack_lunch_price || '').trim(), calorie: String(dailyMenu.snack_lunch_calorie || '').trim(), allergy: String(dailyMenu.snack_lunch_allergy || '').trim() },
          { id: 'curry', name: String(dailyMenu.curry || '').trim(), price: String(dailyMenu.curry_price || '').trim(), calorie: String(dailyMenu.curry_calorie || '').trim(), allergy: String(dailyMenu.curry_allergy || '').trim() },
          { id: 'noodles', name: String(dailyMenu.noodles || '').trim(), price: String(dailyMenu.noodles_price || '').trim(), calorie: String(dailyMenu.noodles_calorie || '').trim(), allergy: String(dailyMenu.noodles_allergy || '').trim() },
        ].filter(item => item.name.length > 0)
      : [];

    if (dailyMenuError) {
      console.error('本日の献立の取得に失敗:', dailyMenuError);
      setCafeteriaMenuLoadMessage('本日の献立を読み込めません。Supabaseの cafeteria_daily_menus と権限設定を確認してください。');
    } else if (!dailyMenu) {
      setCafeteriaMenuLoadMessage('本日の献立は未登録です。管理画面の「月間献立表の管理」で今日の日付に献立を入力してください。');
    } else if (dailyMenu.is_closed) {
      setCafeteriaMenuLoadMessage('本日は学食の営業がありません。');
    } else if (activeMenuItems.length === 0) {
      setCafeteriaMenuLoadMessage('本日の献立はまだ入力されていません。管理画面の月間献立表を確認してください。');
    } else {
      setCafeteriaMenuLoadMessage('');
    }

    setMenuItems(activeMenuItems);
    setCafeteriaMenuLoading(false);

    fetchStep = 'メニュー別投票取得（cafeteria_votes）';
    const { data: menuVoteData, error: menuVoteError } = await supabase
      .from('cafeteria_votes')
      .select('menu_id, status, voter_id, scope_key')
      .not('menu_id', 'is', null);

    if (menuVoteError) {
      console.error('メニュー別混雑投票の取得に失敗:', menuVoteError);
    } else if (menuVoteData) {
      const counts: Record<string, { empty: number, normal: number, crowded: number }> = {};
      activeMenuItems.forEach(item => {
        counts[item.id] = { empty: 0, normal: 0, crowded: 0 };
      });

      const myMenuVotes: Record<string, 'empty' | 'normal' | 'crowded' | null> = {};
      activeMenuItems.forEach(item => {
        myMenuVotes[item.id] = null;
      });

      menuVoteData.forEach(vote => {
        if (!vote.menu_id || !counts[vote.menu_id]) return;
        if (vote.status === 'empty') counts[vote.menu_id].empty += 1;
        if (vote.status === 'normal') counts[vote.menu_id].normal += 1;
        if (vote.status === 'crowded') counts[vote.menu_id].crowded += 1;

        if (
          vote.voter_id === currentVoterId &&
          (vote.status === 'empty' || vote.status === 'normal' || vote.status === 'crowded')
        ) {
          myMenuVotes[vote.menu_id] = vote.status;
        }
      });

      setMenuVotes(counts);
      setUserMenuVotes(myMenuVotes);
    }

    fetchStep = '公式売切状態取得（cafeteria_sold_out）';
    const { data: soldOutData, error: soldOutError } = await supabase
      .from('cafeteria_sold_out')
      .select('menu_id, is_sold_out');

    if (soldOutError) {
      console.error('売り切れ情報の取得に失敗:', soldOutError);
    } else if (soldOutData) {
      const nextSoldOut: Record<string, boolean> = {};
      soldOutData.forEach(row => {
        nextSoldOut[String(row.menu_id)] = row.is_sold_out === true;
      });
      setSoldOutItems(nextSoldOut);
    }

    fetchStep = '本日の自分の売切報告取得（cafeteria_sold_out_reports）';
    const reportDate = getTokyoDateKey();
    const { data: reportData, error: reportError } = await supabase
      .from('cafeteria_sold_out_reports')
      .select('menu_id, reporter_id')
      .eq('service_date', reportDate);

    if (reportError) {
      console.error('売切報告の取得に失敗:', reportError);
      setUserSoldOutReports({});
    } else {
      const reportedByMe: Record<string, boolean> = {};
      for (const report of reportData || []) {
        if (report.reporter_id === authUser?.id) reportedByMe[String(report.menu_id)] = true;
      }
      setUserSoldOutReports(reportedByMe);
    }

    fetchStep = '学校通知取得（notifications）';
    const { data: notificationData, error: notificationError } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });

    if (notificationError) {
      console.error('学校通知の取得に失敗:', notificationError);
      setNotifications([]);
      setNotificationLoadError('学校通知を読み込めませんでした。通信状態とSupabaseの設定を確認してください。');
    } else {
      const rows = (Array.isArray(notificationData) ? notificationData : [])
        .filter(note => !LEGACY_SAMPLE_NOTIFICATION_TITLES.has(String(note.title || '').trim()))
        .filter(note => !note.expires_at || (Number.isFinite(new Date(note.expires_at).getTime()) && new Date(note.expires_at).getTime() > Date.now()))
        .sort((a, b) => {
          const priorityRank = (value: unknown) => value === 'emergency' ? 3 : value === 'important' ? 2 : 1;
          const priorityDifference = priorityRank(b.priority) - priorityRank(a.priority);
          return priorityDifference || String(b.created_at || '').localeCompare(String(a.created_at || ''));
        });
      let readIds = new Set<string>();
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (accessToken) {
          const readResponse = await fetch('/api/notifications/read', {
            method: 'GET',
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: 'no-store',
          });
          const readResult = await readResponse.json().catch(() => null) as { readIds?: unknown } | null;
          if (readResponse.ok && Array.isArray(readResult?.readIds)) {
            readIds = new Set(readResult.readIds.filter((id): id is string => typeof id === 'string'));
          }
        }
      } catch (readError) {
        console.warn('通知の既読状態を取得できませんでした。未読表示を続けます。', readError);
      }
      setNotifications(rows.map((note): AppSchoolNotification => {
        const bodyValue = [note.body, note.message, note.content, note.description]
          .find(value => typeof value === 'string' && value.trim());
        const createdAt = typeof note.created_at === 'string' ? note.created_at : '';
        const parsedDate = createdAt ? new Date(createdAt) : null;
        const time = parsedDate && !Number.isNaN(parsedDate.getTime())
          ? parsedDate.toLocaleString('ja-JP', {
              timeZone: 'Asia/Tokyo',
              year: 'numeric',
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '日時不明';
        return {
          id: note.id as string | number,
          title: typeof note.title === 'string' && note.title.trim() ? note.title : '学校からのお知らせ',
          body: typeof bodyValue === 'string' ? bodyValue : '',
          imageUrl: typeof note.image_url === 'string' && /^https:\/\//i.test(note.image_url) ? note.image_url : null,
          createdAt,
          time,
          isRead: readIds.has(String(note.id)),
          category: typeof note.category === 'string' ? note.category : 'general',
          priority: note.priority === 'emergency' || note.priority === 'important' ? note.priority : 'normal',
          isPinned: Boolean(note.is_pinned),
          expiresAt: typeof note.expires_at === 'string' ? note.expires_at : null,
        };
      }));
      setNotificationLoadError('');
    }

    fetchStep = '鷹の台駅時刻表取得（takanodai_timetable）';
    const { data: trainRows, error: trainError } = await supabase
      .from('takanodai_timetable')
      .select('*')
      .order('direction', { ascending: true })
      .order('departure_time', { ascending: true });

    if (trainError) {
      console.error('鷹の台駅の時刻表取得に失敗:', trainError);
    } else if (trainRows && trainRows.length > 0) {
      const nextTrainTimetable = {
        kokubunji: {
          ...TAKANODAI_TIMETABLE.kokubunji,
          trains: trainRows
            .filter(row => row.direction === 'kokubunji')
            .map(row => ({ time: row.departure_time, service: row.service })),
        },
        higashimurayama: {
          ...TAKANODAI_TIMETABLE.higashimurayama,
          trains: trainRows
            .filter(row => row.direction === 'higashimurayama')
            .map(row => ({ time: row.departure_time, service: row.service })),
        },
      };

      setTrainTimetable(nextTrainTimetable);
    }


    const initialStudentId = studentId.trim();
    if (/^\d{6}$/.test(initialStudentId)) {
      fetchStep = '本日の貢献度取得（contribution_scores）';
      const todayScoreDate = getTokyoDateKey();
      const todayRange = getTokyoDayRange(todayScoreDate);
      const { data: todayHistory, error: todayHistoryError } = await supabase
        .from('contribution_history')
        .select('delta')
        .eq('student_id', initialStudentId)
        .gte('created_at', todayRange.start)
        .lt('created_at', todayRange.end);
      const historyToday = todayHistoryError ? null : Math.min(100, Math.max(0,
        (todayHistory ?? []).reduce((total, row) => total + (Number(row.delta) || 0), 0)
      ));
      if (todayHistoryError) console.error('本日の貢献度履歴の取得に失敗:', todayHistoryError);

      const { data: scoreData, error: scoreError } = await supabase
        .from('contribution_scores')
        .select('*')
        .eq('student_id', initialStudentId)
        .maybeSingle();

      if (scoreError) {
        console.error('貢献度ポイントの取得に失敗:', scoreError);
      } else if (scoreData && scoreData.score_date === todayScoreDate) {
        setScore(Number(scoreData.score) || 0);
      } else {
        const initialTodayScore = historyToday ?? (scoreData ? Number(scoreData.score) || 0 : 0);
        setScore(initialTodayScore);

        if (scoreData) {
          const { error: resetError } = await supabase
            .from('contribution_scores')
            .update({ score: initialTodayScore, score_date: todayScoreDate, updated_at: new Date().toISOString() })
            .eq('student_id', initialStudentId);
          if (resetError) {
            // Old databases may not have score_date yet. Keep the display correct until the SQL migration is run.
            const { error: legacyResetError } = await supabase
              .from('contribution_scores')
              .update({ score: initialTodayScore, updated_at: new Date().toISOString() })
              .eq('student_id', initialStudentId);
            if (legacyResetError) console.error('本日の貢献度初期化に失敗:', legacyResetError);
          }
        } else {
          const { error: createScoreError } = await supabase
            .from('contribution_scores')
            .insert({ student_id: initialStudentId, score: initialTodayScore, score_date: todayScoreDate });
          if (createScoreError) {
            const { error: legacyCreateError } = await supabase
              .from('contribution_scores')
              .insert({ student_id: initialStudentId, score: initialTodayScore });
            if (legacyCreateError) console.error('貢献度ポイントの初期登録に失敗:', createScoreError, legacyCreateError);
          }
        }
      }
    }

    } catch (unexpectedError) {
      console.error('Supabase共有データ取得中に例外が発生しました:', {
        step: fetchStep,
        error: unexpectedError,
      });
    }
  };

  fetchSharedData();
}, [authUser?.id, studentId]);

// 認証完了後に本人の課題を読み込む。
// 共有データ取得用effectとは分け、ログイン前に実行されて終わる問題を防ぐ。
useEffect(() => {
  if (!authUser || !/^\d{6}$/.test(studentId.trim())) {
    setTodos([]);
    return;
  }

  let cancelled = false;
  const loadStudentTodos = async () => {
    const currentStudentId = studentId.trim();
    setTodos([]);

    const { data: todoRows, error: todoError } = await supabase
      .from('todos')
      .select('*')
      .eq('student_id', currentStudentId)
      .order('created_at', { ascending: true });

    if (cancelled) return;

    if (todoError) {
      console.error('課題・提出物の取得に失敗:', todoError);
      setTodos([]);
      return;
    }

    if (todoRows && todoRows.length > 0) {
      setTodos(todoRows.map(row => ({
        id: row.id,
        title: row.title,
        source: row.source,
        type: row.type,
        due: row.due,
        due_at: row.due_at || null,
        details: row.details,
        completed: row.completed,
        ...getTodoPresentation(row.type),
      })));
      return;
    }

    // 新しい生徒には現在のデモ課題を個人用として登録する。
    const initialRows = INITIAL_TODOS.map(todo => ({
      student_id: currentStudentId,
      title: todo.title,
      source: todo.source,
      type: todo.type,
      due: todo.due,
      due_at: todo.due_at || null,
      details: todo.details,
      completed: false,
    }));

    const { data: createdTodos, error: createTodoError } = await supabase
      .from('todos')
      .insert(initialRows)
      .select();

    if (cancelled) return;

    if (createTodoError) {
      console.error('初期課題の登録に失敗:', createTodoError);
      setTodos([]);
      return;
    }

    setTodos((createdTodos || []).map(row => ({
      id: row.id,
      title: row.title,
      source: row.source,
      type: row.type,
      due: row.due,
      due_at: row.due_at || null,
      details: row.details,
      completed: row.completed,
      ...getTodoPresentation(row.type),
    })));
  };

  void loadStudentTodos();
  return () => { cancelled = true; };
}, [authUser, studentId]);

// Adminが登録した全員共通の課題と、自分の完了状態を読み込む。
useEffect(() => {
  const currentStudentId = getStudentIdFromSchoolEmail(authUser?.email);
  if (!authUser || !currentStudentId) {
    setAdminAssignedTodos([]);
    return;
  }

  let cancelled = false;
  const loadAdminAssignments = async () => {
    const { data: assignmentRows, error: assignmentsError } = await supabase
      .from('assignments')
      .select('id, title, details, source, type, due, due_at, is_active, created_at, classroom_course_id, classroom_coursework_id')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (cancelled) return;
    if (assignmentsError) {
      // テーブル作成前でも従来の個人用課題は表示し続ける。
      console.error('Admin共通課題の取得に失敗:', assignmentsError);
      setAdminAssignedTodos([]);
      return;
    }

    const { data: completionRows, error: completionError } = await supabase
      .from('assignment_completions')
      .select('assignment_id, completed')
      .eq('student_id', currentStudentId);

    if (cancelled) return;
    if (completionError) {
      console.error('共通課題の完了状態取得に失敗:', completionError);
    }
    const completionByAssignmentId = new Map<string, boolean>(
      (completionRows || []).map((row: any) => [String(row.assignment_id), Boolean(row.completed)])
    );

    setAdminAssignedTodos((assignmentRows || []).map((row: any) => {
      const dueAt = row.due_at || null;
      const dueLabel = dueAt
        ? new Date(dueAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : (row.due || '期限未設定');
      return {
        id: `assignment:${row.id}`,
        assignmentId: row.id,
        isAdminAssigned: true,
        title: row.title,
        source: row.source || 'Admin／先生',
        type: row.type || 'other',
        due: dueLabel,
        due_at: dueAt,
        details: row.details || '',
        completed: completionByAssignmentId.get(String(row.id)) || false,
        classroom_course_id: row.classroom_course_id || null,
        classroom_coursework_id: row.classroom_coursework_id || null,
        ...getTodoPresentation(row.type || 'other'),
      };
    }));
  };

  void loadAdminAssignments();
  return () => { cancelled = true; };
}, [authUser]);

  // クラスはプロフィール設定で1-1〜3-8から選択して保存します。

  // 全体混雑パーセント計算
  const totalVotes = crowdVotes.empty + crowdVotes.normal + crowdVotes.crowded;
  const getPercent = (val: number) => {
    return Math.round((val / totalVotes) * 100) || 0;
  };

  const getCohortName = (id: string) => {
    const cleanId = id.trim();
    if (cleanId.length >= 2) {
      const cohortDigits = cleanId.substring(0, 2);
      if (/^\d+$/.test(cohortDigits)) {
        return `第 ${cohortDigits} 期生`;
      }
    }
    return '未設定期生';
  };

  // ハンドラー各種
  const handleVote = async (type: 'empty' | 'normal' | 'crowded') => {
    if (isVoting || userVote === type) return;

    const voterId = getOrCreateVoteId(studentId.trim());
    if (!voterId) return;

    setIsVoting(true);

    const { data: previousVote, error: previousVoteError } = await supabase
      .from('cafeteria_votes')
      .select('status')
      .eq('scope_key', 'overall')
      .eq('voter_id', voterId)
      .maybeSingle();

    if (previousVoteError) {
      console.error('自分の学食投票の確認に失敗:', previousVoteError);
      setIsVoting(false);
      alert('現在の投票を確認できませんでした。');
      return;
    }

    const { error: saveError } = await supabase
      .from('cafeteria_votes')
      .upsert(
        {
          menu_id: null,
          scope_key: 'overall',
          voter_id: voterId,
          status: type,
        },
        { onConflict: 'scope_key,voter_id' }
      );

    if (saveError) {
      console.error('学食混雑投票の保存に失敗:', saveError);
      setIsVoting(false);
      alert('投票の保存に失敗しました。SupabaseのSQL修正を先に実行してください。');
      return;
    }

    const { data: allVotes, error: countError } = await supabase
      .from('cafeteria_votes')
      .select('status')
      .eq('scope_key', 'overall');

    if (countError) {
      console.error('学食混雑投票の再集計に失敗:', countError);
    } else if (allVotes) {
      const counts = allVotes.reduce(
        (acc, vote) => {
          if (vote.status === 'empty') acc.empty += 1;
          if (vote.status === 'normal') acc.normal += 1;
          if (vote.status === 'crowded') acc.crowded += 1;
          return acc;
        },
        { empty: 0, normal: 0, crowded: 0 }
      );
      setCrowdVotes(counts);
    }

    setUserVote(type);

    // 初回投票のみ加点。選択肢を変更してもポイントを増やさない。
    if (!previousVote) {
      void updateContribution(5, '食堂全体の混雑状況を報告');
    }

    setIsVoting(false);
  };

  const handleMenuVote = async (menuId: string, type: 'empty' | 'normal' | 'crowded') => {
    if (soldOutItems[menuId]) return;

    const voterId = getOrCreateVoteId(studentId.trim());
    if (!voterId) return;

    const { data: previousVote, error: previousVoteError } = await supabase
      .from('cafeteria_votes')
      .select('status')
      .eq('scope_key', menuId)
      .eq('voter_id', voterId)
      .maybeSingle();

    if (previousVoteError) {
      console.error('メニュー別投票の確認に失敗:', previousVoteError);
      alert('現在のメニュー投票を確認できませんでした。');
      return;
    }

    if (previousVote?.status === type) return;

    const { error: saveError } = await supabase
      .from('cafeteria_votes')
      .upsert(
        {
          menu_id: menuId,
          scope_key: menuId,
          voter_id: voterId,
          status: type,
        },
        { onConflict: 'scope_key,voter_id' }
      );

    if (saveError) {
      console.error('メニュー別混雑投票の保存に失敗:', saveError);
      alert('メニュー別混雑投票の保存に失敗しました。SupabaseのSQL修正を先に実行してください。');
      return;
    }

    const { data: allMenuVotes, error: countError } = await supabase
      .from('cafeteria_votes')
      .select('status')
      .eq('scope_key', menuId);

    if (countError) {
      console.error('メニュー別投票の再集計に失敗:', countError);
    } else if (allMenuVotes) {
      const counts = allMenuVotes.reduce(
        (acc, vote) => {
          if (vote.status === 'empty') acc.empty += 1;
          if (vote.status === 'normal') acc.normal += 1;
          if (vote.status === 'crowded') acc.crowded += 1;
          return acc;
        },
        { empty: 0, normal: 0, crowded: 0 }
      );
      setMenuVotes(prev => ({ ...prev, [menuId]: counts }));
    }

    setUserMenuVotes(prev => ({ ...prev, [menuId]: type }));

    if (!previousVote) {
      void updateContribution(5, '学食メニューの混雑状況を報告');
    }
  };

  const reportSoldOut = async (menuId: string) => {
    if (!authUser) {
      alert('売り切れを報告するには学校メールでログインしてください。');
      return;
    }
    if (soldOutItems[menuId] || userSoldOutReports[menuId] || reportingSoldOutMenuId) return;

    setReportingSoldOutMenuId(menuId);
    const { error } = await supabase
      .from('cafeteria_sold_out_reports')
      .insert({ menu_id: menuId });

    setReportingSoldOutMenuId(null);
    if (error) {
      if (error.code === '23505') {
        setUserSoldOutReports(prev => ({ ...prev, [menuId]: true }));
        alert('このメニューは本日すでに報告済みです。');
        return;
      }
      console.error('売切報告の保存に失敗:', error);
      alert('売切報告を保存できませんでした。Supabaseで supabase/cafeteria-menu-metadata.sql を実行してください。');
      return;
    }

    setUserSoldOutReports(prev => ({ ...prev, [menuId]: true }));
    void updateContribution(5, '学食メニューの売り切れを報告');
    alert(`「${menuItems.find(i => i.id === menuId)?.name}」の売切報告を管理画面に送信しました。正式な売切状態は管理側で確認・更新されます。`);
  };

  const handleAddPersonalTodo = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!authUser) {
      alert('先にログインしてください。');
      return;
    }

    const currentStudentId = studentId.trim();
    const title = newTodoTitle.trim();

    if (!/^\d{6}$/.test(currentStudentId)) {
      alert('学籍番号を確認して、ログインし直してください。');
      return;
    }

    if (!title) {
      alert('課題名を入力してください。');
      return;
    }

    setIsAddingTodo(true);

    try {
      const dueAtIso = newTodoDueAt
        ? new Date(newTodoDueAt).toISOString()
        : null;

      const dueLabel = dueAtIso
        ? new Date(dueAtIso).toLocaleString('ja-JP', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '期限未設定';

      const { data: createdRow, error } = await supabase
        .from('todos')
        .insert({
          student_id: currentStudentId,
          title,
          details: newTodoDetails.trim(),
          source: '自分で追加',
          type: 'other',
          due: dueLabel,
          due_at: dueAtIso,
          completed: false,
        })
        .select('*')
        .single();

      if (error || !createdRow) {
        console.error('個人用課題の登録に失敗:', error);
        alert(
          '課題を保存できませんでした。Supabaseのテーブル設定やRLSポリシーを確認してください。'
        );
        return;
      }

      setTodos((prev) => [
        ...prev,
        {
          id: createdRow.id,
          title: createdRow.title,
          source: createdRow.source,
          type: createdRow.type,
          due: createdRow.due,
          due_at: createdRow.due_at || null,
          details: createdRow.details,
          completed: createdRow.completed,
          ...getTodoPresentation(createdRow.type),
        },
      ]);

      setNewTodoTitle('');
      setNewTodoDetails('');
      setNewTodoDueAt('');
      setShowAddTodoModal(false);
      alert('自分の課題を追加しました。');
    } catch (error) {
      console.error('個人用課題の登録中に例外が発生:', error);
      alert('課題の登録中にエラーが発生しました。');
    } finally {
      setIsAddingTodo(false);
    }
  };

  const toggleTodoComplete = async (todoId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const targetTodo = visibleTodos.find(todo => todo.id === todoId);
    if (!targetTodo) return;

    if (targetTodo.isAdminAssigned) {
      const currentStudentId = getStudentIdFromSchoolEmail(authUser?.email);
      if (!currentStudentId) {
        alert('学校メールでログインしてください。');
        return;
      }
      const nextState = !targetTodo.completed;
      const { error: completionSaveError } = await supabase
        .from('assignment_completions')
        .upsert({
          student_id: currentStudentId,
          assignment_id: targetTodo.assignmentId,
          completed: nextState,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'student_id,assignment_id' });
      if (completionSaveError) {
        console.error('共通課題の完了状態保存に失敗:', completionSaveError);
        alert('課題の状態を保存できませんでした。SQLとRLS設定を確認してください。');
        return;
      }
      setAdminAssignedTodos(prev => prev.map(todo => todo.id === todoId ? { ...todo, completed: nextState } : todo));
      void updateContribution(nextState ? 10 : -10, nextState ? '提出物を完了' : '提出物の完了を取り消し');
      return;
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(todoId)) {
      console.error('課題IDがDBのUUID形式ではありません。課題の再読み込みが必要です:', todoId);
      alert('課題データを正しく読み込めていません。ページを再読み込みしてください。');
      return;
    }
    if (!/^\d{6}$/.test(studentId.trim())) {
      alert('学籍番号を確認できません。いったんログインし直してください。');
      return;
    }

    const nextState = !targetTodo.completed;

    const { error } = await supabase
      .from('todos')
      .update({
        completed: nextState,
        updated_at: new Date().toISOString(),
      })
      .eq('id', todoId)
      .eq('student_id', studentId.trim());

    if (error) {
      console.error('課題の完了状態の保存に失敗:', error);
      alert('課題の状態保存に失敗しました。');
      return;
    }

    setTodos(prev => prev.map(todo =>
      todo.id === todoId
        ? { ...todo, completed: nextState }
        : todo
    ));

    void updateContribution(
      nextState ? 10 : -10,
      nextState ? '提出物を完了' : '提出物の完了を取り消し'
    );
  };

  const handleAddLostItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newLostTitle.trim();
    const location = newLostLocation.trim();
    const description = newLostDescription.trim() || '詳細情報なし';
    const finder = newLostFinder.trim() || '保管場所未入力';
    const cleanStudentId = studentId.trim();

    if (!/^\d{6}$/.test(cleanStudentId)) {
      alert('学校メールでログインし、6桁の学籍番号が認識されていることを確認してください。');
      return;
    }
    if (!title || !location) {
      alert('「品名」と「見つけた場所」を入力してください。');
      return;
    }
    if (lostSubmitting) return;

    setLostSubmitting(true);
    setLostAndFoundError('');
    try {
      const { data, error } = await supabase
        .from('lost_and_found')
        .insert({ title, location, description, finder, status: 'pending', student_id: cleanStudentId })
        .select('*')
        .single();

      if (error) throw error;
      if (!data) throw new Error('保存したデータが返されませんでした。');

      // 未承認の投稿は公開一覧へ追加せず、貢献度も加算しない。Admin承認時に処理する。
      setNewLostTitle('');
      setNewLostLocation('');
      setNewLostDescription('');
      setNewLostFinder('');
      alert('落とし物の報告を受け付けました。事務室で実物確認後に公開されます。公開までは貢献度は加算されません。');
    } catch (unexpectedError) {
      console.error('落とし物の保存に失敗:', unexpectedError);
      const detail = unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError);
      setLostAndFoundError('落とし物を保存できませんでした。lost_and_found テーブルとRLS設定を確認してください。');
      alert(`落とし物を保存できませんでした。
Supabaseの設定を確認してください。
詳細: ${detail}`);
    } finally {
      setLostSubmitting(false);
    }
  };

  const submitAcReport = async () => {
    const selectedRoom = rooms.find(room => room.id === selectedRoomId);
    if (!selectedRoom) return;

    if (!Number.isInteger(selectedAcTemp) || selectedAcTemp < 23 || selectedAcTemp > 30) {
      alert('エアコンの設定温度は23〜30℃で選択してください。');
      return;
    }

    // 体感（寒い／快適／暑い）と、報告されたエアコン設定温度を別々に扱う。
    const nextTemp = `${selectedAcTemp}℃`;
    let color = 'text-green-500';
    let bg = 'bg-green-50';
    let icon: React.ElementType = AirconComfortableIcon;

    if (selectedStatus === '寒い') {
      color = 'text-cyan-500';
      bg = 'bg-cyan-50';
      icon = AirconColdIcon;
    } else if (selectedStatus === '暑い') {
      color = 'text-red-500';
      bg = 'bg-red-50';
      icon = AirconHotIcon;
    }

    const { error } = await supabase
      .from('room_status')
      .upsert(
        {
          room_id: String(selectedRoom.id),
          room_name: selectedRoom.name,
          status: selectedStatus,
          temp: nextTemp,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'room_id' }
      );

    if (error) {
      console.error('教室状況の更新に失敗:', error);
      alert('教室状況の更新に失敗しました。Supabaseの設定を確認してください。');
      return;
    }

    setRooms(prev => prev.map(room =>
      room.id === selectedRoomId
        ? { ...room, status: selectedStatus, temp: nextTemp, icon, color, bg }
        : room
    ));
    setShowTempModal(false);
    void updateContribution(10, '教室のエアコン設定温度・体感を報告');
    alert(`報告ありがとうございます！${selectedRoom.name}の設定温度を${nextTemp}、体感を「${selectedStatus}」として保存しました。貢献度+10pt！`);
  };

  // --- 新機能用ハンドラー群 ---
  const handleVoteBusCongestion = async (status: string) => {
    const station = MOCK_BUS_STATIONS.find(s => s.id === selectedBusStation);
    if (!station) return;

    const { error } = await supabase
      .from('bus_status')
      .upsert(
        {
          station_id: selectedBusStation,
          station_name: station.name,
          congestion_status: status,
          delay_minutes: busDelayMinutes[selectedBusStation] ?? 0,
        },
        { onConflict: 'station_id' }
      );

    if (error) {
      console.error('バス混雑状況の保存に失敗:', error);
      alert('バス混雑状況の保存に失敗しました。');
      return;
    }

    setBusCongestionVote(prev => ({ ...prev, [selectedBusStation]: status }));
    void updateContribution(5, 'バスの混雑状況を報告');
    alert(`バス混雑状況を共有しました！`);
  };

  const handleReportBusDelay = async (minutes: number) => {
    const station = MOCK_BUS_STATIONS.find(s => s.id === selectedBusStation);
    if (!station) return;

    const { error } = await supabase
      .from('bus_status')
      .upsert(
        {
          station_id: selectedBusStation,
          station_name: station.name,
          congestion_status: busCongestionVote[selectedBusStation] ?? '普通',
          delay_minutes: minutes,
        },
        { onConflict: 'station_id' }
      );

    if (error) {
      console.error('バス遅延情報の保存に失敗:', error);
      alert('バス遅延情報の保存に失敗しました。');
      return;
    }

    setBusDelayMinutes(prev => ({ ...prev, [selectedBusStation]: minutes }));
    void updateContribution(10, 'バスの遅延情報を報告');
    alert(`バスの遅延情報を共有しました。周囲の生徒に反映されます！(+10pt)`);
  };

  const handleAddClubNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAddingClubNote) return;
    if (!authUser) {
      alert('学校メールでログインしてください。');
      return;
    }
    if (!newClubName.trim() || !newClubTitle.trim() || !newClubContent.trim() || !newClubAuthorName.trim()) {
      alert('部活・委員会名、件名、本文、発信者名をすべて入力してください。');
      return;
    }
    if (newClubAuthorName.includes('@') || /^[0-9]{6}(?:\s*より)?$/.test(newClubAuthorName.trim())) {
      alert('発信者名にメールアドレスや学籍番号は使えません。表示用の氏名・担当名を入力してください。');
      return;
    }
    if (newClubPermissionCode && !/^\d{8}$/.test(newClubPermissionCode.trim())) {
      alert('許可コードは8桁の数字で入力してください。');
      return;
    }

    setIsAddingClubNote(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('ログインの有効期限が切れています。再ログインしてください。');

      const response = await fetch('/api/club-notes', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clubName: newClubName.trim(),
          title: newClubTitle.trim(),
          content: newClubContent.trim(),
          authorName: newClubAuthorName.trim(),
          permissionCode: newClubPermissionCode.trim(),
        }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.note) {
        throw new Error(result?.message || `投稿できませんでした（HTTP ${response.status}）。`);
      }

      const note = result.note;
      const newNote = {
        id: note.id,
        clubName: note.club_name,
        title: note.title,
        date: new Date(note.created_at).toLocaleString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: 'Asia/Tokyo',
        }),
        createdAt: note.created_at,
        content: note.content,
        author: formatClubAuthorLabel(note.author_name || note.author || newClubAuthorName.trim()),
      };
      setClubNotes(prev => [newNote, ...prev]);
      void updateContribution(15, '部活・委員会ノートを投稿');
      setNewClubName('');
      setNewClubTitle('');
      setNewClubContent('');
      setNewClubPermissionCode('');
      // Keep the user-entered display name available for the next post.
      const lineMessage = typeof result.lineDelivery?.message === 'string' ? result.lineDelivery.message : '投稿しました。';
      alert(`${lineMessage}\n貢献度+15pt！`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '不明なエラー';
      alert(message);
    } finally {
      setIsAddingClubNote(false);
    }
  };

    const handleAddReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReviewComment.trim()) {
      alert("コメントを入力してください。");
      return;
    }

    const reviewToInsert = {
      menu_id: selectedMenuForReview,
      user_name: newReviewUser.trim() || '匿名の創価生',
      rating: newReviewRating,
      comment: newReviewComment.trim(),
    };

    const { data, error } = await supabase
      .from('cafeteria_reviews')
      .insert(reviewToInsert)
      .select('*')
      .single();

    if (error) {
      console.error('学食レビューの保存に失敗:', error);
      alert('レビューの保存に失敗しました。もう一度お試しください。');
      return;
    }

    if (data) {
      const newReview: CafeteriaReview = {
        id: data.id,
        menuId: data.menu_id,
        userName: data.user_name || '匿名の創価生',
        rating: data.rating,
        comment: data.comment,
        date: new Date(data.created_at).toLocaleString('ja-JP', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setCafeteriaReviews(prev => [newReview, ...prev]);
    }

    void updateContribution(8, '学食レビューを投稿');
    setNewReviewComment('');
    setNewReviewUser('');
    alert("学食レビューを投稿しました！役立つ情報をありがとう！(+8pt)🍲");
  };

  const savePushReminderPreferences = async (
    enabled: boolean = remindersEnabled,
    times: string[] = reminderTimes,
    days: string[] = allowedNotificationDays,
    categories: Record<NotificationCategory, boolean> = notificationSettings,
    quietEnabled: boolean = quietHoursEnabled,
    quietStart: string = quietHoursStart,
    quietEnd: string = quietHoursEnd,
  ) => {
    if (!authUser || !/^\d{6}$/.test(studentId)) throw new Error('学校メールでログインしてください。');
    const { error } = await supabase.from('push_reminder_preferences').upsert({
      user_id: authUser.id,
      student_id: studentId,
      reminders_enabled: enabled,
      reminder_times: times,
      allowed_days: days,
      notification_settings: categories,
      quiet_hours_enabled: quietEnabled,
      quiet_hours_start: quietStart,
      quiet_hours_end: quietEnd,
      timezone: 'Asia/Tokyo',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
  };

  // 設定は端末の状態ではなくSupabaseから読み込み、別端末でも同じ選択を復元する。
  useEffect(() => {
    if (!authUser?.id || !/^\d{6}$/.test(studentId)) {
      setRemindersEnabled(true);
      setReminderTimes(['dayBefore', 'morningOf']);
      setAllowedNotificationDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
      setNotificationSettings({
        todo_reminders: true,
        chat_messages: true,
        school_announcements: true,
        transport_alerts: true,
        cafeteria_updates: false,
        activity_updates: true,
      });
      setQuietHoursEnabled(false);
      setQuietHoursStart('21:00');
      setQuietHoursEnd('07:00');
      setNotificationSettingsLoaded(false);
      return;
    }
    let cancelled = false;
    // Reset immediately so settings from a previous signed-in account are not shown.
    setRemindersEnabled(true);
    setReminderTimes(['dayBefore', 'morningOf']);
    setAllowedNotificationDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    setNotificationSettings({
      todo_reminders: true,
      chat_messages: true,
      school_announcements: true,
      transport_alerts: true,
      cafeteria_updates: false,
      activity_updates: true,
    });
    setQuietHoursEnabled(false);
    setQuietHoursStart('21:00');
    setQuietHoursEnd('07:00');
    setNotificationSettingsLoaded(false);
    void (async () => {
      const { data, error } = await supabase
        .from('push_reminder_preferences')
        .select('reminders_enabled, reminder_times, allowed_days, notification_settings, quiet_hours_enabled, quiet_hours_start, quiet_hours_end')
        .eq('user_id', authUser.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error('通知設定の読み込みに失敗:', error);
        setNotificationSaveStatus('通知設定を読み込めません。Supabaseで supabase/notification-preferences.sql を実行し、RLSを確認してください。');
        setNotificationSettingsLoaded(true);
        return;
      }
      if (data) {
        setRemindersEnabled(data.reminders_enabled !== false);
        setReminderTimes(Array.isArray(data.reminder_times) ? data.reminder_times : ['dayBefore', 'morningOf']);
        setAllowedNotificationDays(Array.isArray(data.allowed_days) ? data.allowed_days : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
        const loaded = data.notification_settings && typeof data.notification_settings === 'object'
          ? data.notification_settings as Partial<Record<NotificationCategory, unknown>>
          : {};
        setNotificationSettings({
          todo_reminders: loaded.todo_reminders !== false,
          chat_messages: loaded.chat_messages !== false,
          school_announcements: loaded.school_announcements !== false,
          transport_alerts: loaded.transport_alerts !== false,
          cafeteria_updates: loaded.cafeteria_updates === true,
          activity_updates: loaded.activity_updates !== false,
        });
        setQuietHoursEnabled(data.quiet_hours_enabled === true);
        setQuietHoursStart(String(data.quiet_hours_start || '21:00').slice(0, 5));
        setQuietHoursEnd(String(data.quiet_hours_end || '07:00').slice(0, 5));
      }
      setNotificationSettingsLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [authUser?.id, studentId]);

  const enablePushNotifications = async () => {
    if (!authUser || !/^\d{6}$/.test(studentId)) {
      setPushStatus('通知を設定する前に学校メールでログインしてください。');
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushStatus('このブラウザーはプッシュ通知に対応していません。Chrome / Edge / Safariの最新版で試してください。');
      return;
    }
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setPushStatus('NEXT_PUBLIC_VAPID_PUBLIC_KEY が未設定です。セットアップ手順を確認してください。');
      return;
    }
    setPushBusy(true);
    setPushStatus('この端末の通知を設定しています…');
    try {
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('ブラウザーの通知を許可してください。ブラウザー設定でブロックされている場合はサイト設定も確認してください。');

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      }
      const subscriptionJson = subscription.toJSON();
      const { error: subscriptionError } = await supabase.from('push_subscriptions').upsert({
        endpoint: subscription.endpoint,
        user_id: authUser.id,
        student_id: studentId,
        subscription: subscriptionJson,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (subscriptionError) throw subscriptionError;
      await savePushReminderPreferences(remindersEnabled, reminderTimes, allowedNotificationDays, notificationSettings, quietHoursEnabled, quietHoursStart, quietHoursEnd);
      setPushReady(true);
      setPushStatus('通知を有効にしました。この端末で「テスト通知を送る」を押して確認してください。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String((error as any)?.message || '不明なエラー');
      setPushStatus(`通知設定に失敗しました: ${message}`);
    } finally {
      setPushBusy(false);
    }
  };

  const sendTestPushNotification = async (): Promise<{ success: boolean; message: string }> => {
    if (!authUser) {
      const message = '学校メールでログインしてください。';
      setPushStatus(message);
      return { success: false, message };
    }

    setPushBusy(true);
    setPushStatus('テスト通知を送信しています…');

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('ログインセッションがありません。再ログインしてください。');
      if (!('serviceWorker' in navigator)) {
        throw new Error('このブラウザーはプッシュ通知に対応していません。');
      }

      const registration = await navigator.serviceWorker.ready;
      const currentSubscription = await registration.pushManager.getSubscription();
      if (!currentSubscription?.endpoint) {
        throw new Error('この端末の通知登録がありません。「この端末の通知を有効化」を先に押してください。');
      }

      const response = await fetch('/api/push/test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ endpoint: currentSubscription.endpoint }),
        cache: 'no-store',
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || `通知送信に失敗しました（HTTP ${response.status}）。`);
      }

      setPushReady(true);
      const message = 'テスト通知を送信しました。端末の通知領域を確認してください。';
      setPushStatus(message);
      return { success: true, message };
    } catch (error) {
      const detail = error instanceof Error
        ? error.message
        : String((error as any)?.message || '不明なエラー');
      const message = `テスト通知に失敗しました: ${detail}`;
      setPushStatus(message);
      return { success: false, message };
    } finally {
      setPushBusy(false);
    }
  };

  // AIチャットからの画面操作要求を処理する。
  useEffect(() => {
    type ActionRequest = {
      type?: string;
      theme?: string;
      room?: string;
    };
    type ActionResult = { success: boolean; message: string };
    type ActionDetail = {
      action?: ActionRequest;
      resolve?: (result: ActionResult) => void;
    };

    const handleAction = (event: Event) => {
      const detail = (event as CustomEvent<ActionDetail>).detail;
      if (!detail?.action || typeof detail.resolve !== 'function') return;

      void (async () => {
        try {
          const action = detail.action!;

          if (action.type === 'set-theme') {
            const requestedTheme = typeof action.theme === 'string' ? action.theme.trim() : '';
            if (!requestedTheme) {
              detail.resolve!({ success: false, message: '色名またはHEXカラーコードを指定してください。' });
              return;
            }
            if (Object.prototype.hasOwnProperty.call(THEMES, requestedTheme)) {
              const selected = requestedTheme as ThemeKey;
              selectTheme(selected);
              detail.resolve!({ success: true, message: `テーマを「${THEME_LABELS[selected]}」に変更しました。` });
              return;
            }
            const customHex = normalizeThemeColorInput(requestedTheme);
            if (!customHex) {
              detail.resolve!({ success: false, message: '色を認識できませんでした。例：ネオン、メルヘン、#FF66AA、coral、青藍。' });
              return;
            }
            setCustomPrimaryColor(customHex);
            setTheme('custom');
            detail.resolve!({ success: true, message: `テーマカラーを${requestedTheme}（${customHex}）に変更しました。` });
            return;
          }

          if (action.type === 'get-favorite-room') {
            const favoriteRoom = rooms.find(room => room.id === favoriteRoomId);
            detail.resolve!({
              success: Boolean(favoriteRoom),
              message: favoriteRoom
                ? `現在のお気に入り教室は「${favoriteRoom.name}」です。`
                : 'お気に入り教室が設定されていません。教室名を指定して変更してください。',
            });
            return;
          }

          if (action.type === 'set-favorite-room') {
            const requested = String(action.room ?? '')
              .normalize('NFKC')
              .replace(/[\s　]/g, '')
              .replace(/[（(].*?[）)]/g, '')
              .replace(/教室$/, '')
              .toLocaleLowerCase();

            const normalizeRoom = (value: string) => value
              .normalize('NFKC')
              .replace(/[\s　]/g, '')
              .replace(/[（(].*?[）)]/g, '')
              .replace(/教室$/, '')
              .toLocaleLowerCase();

            const targetRoom = rooms.find(room => {
              const name = normalizeRoom(room.name);
              return name === requested ||
                (requested.length >= 4 && name.includes(requested));
            });

            if (!targetRoom) {
              detail.resolve!({
                success: false,
                message: `「${String(action.room ?? '')}」に一致する教室がありません。教室名を確認してください。`,
              });
              return;
            }

            setFavoriteRoomId(targetRoom.id);
            window.localStorage.setItem('campus-sync-favorite-room-id', String(targetRoom.id));

            detail.resolve!({
              success: true,
              message: `お気に入り教室を「${targetRoom.name}」に変更しました。`,
            });
            return;
          }

          if (action.type === 'test-push') {
            const result = await sendTestPushNotification();
            detail.resolve!(result);
            return;
          }

          detail.resolve!({
            success: false,
            message: 'この操作には対応していません。',
          });
        } catch (error) {
          detail.resolve!({
            success: false,
            message: `操作に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      })();
    };

    window.addEventListener('campus-sync-ai-action', handleAction);
    return () => window.removeEventListener('campus-sync-ai-action', handleAction);
  }, [rooms, sendTestPushNotification]);

  const saveCurrentNotificationPreferences = async (
    enabled: boolean = remindersEnabled,
    times: string[] = reminderTimes,
    days: string[] = allowedNotificationDays,
    categories: Record<NotificationCategory, boolean> = notificationSettings,
    quietEnabled: boolean = quietHoursEnabled,
    quietStart: string = quietHoursStart,
    quietEnd: string = quietHoursEnd,
  ) => {
    if (!authUser || !notificationSettingsLoaded) return;
    try {
      await savePushReminderPreferences(enabled, times, days, categories, quietEnabled, quietStart, quietEnd);
      setNotificationSaveStatus('通知設定をSupabaseに保存しました。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotificationSaveStatus('通知設定を保存できませんでした: ' + message);
    }
  };

  const toggleRemindersEnabled = () => {
    const next = !remindersEnabled;
    setRemindersEnabled(next);
    void saveCurrentNotificationPreferences(next);
  };

  const toggleReminderTime = (timeKey: string) => {
    const next = reminderTimes.includes(timeKey)
      ? reminderTimes.filter(t => t !== timeKey)
      : [...reminderTimes, timeKey];
    setReminderTimes(next);
    void saveCurrentNotificationPreferences(remindersEnabled, next);
  };

  const toggleNotificationDay = (dayKey: string) => {
    const next = allowedNotificationDays.includes(dayKey)
      ? allowedNotificationDays.filter(d => d !== dayKey)
      : [...allowedNotificationDays, dayKey];
    setAllowedNotificationDays(next);
    void saveCurrentNotificationPreferences(remindersEnabled, reminderTimes, next);
  };

  const toggleNotificationCategory = (key: NotificationCategory) => {
    const next = { ...notificationSettings, [key]: !notificationSettings[key] };
    setNotificationSettings(next);
    void saveCurrentNotificationPreferences(remindersEnabled, reminderTimes, allowedNotificationDays, next);
  };

  const toggleQuietHours = () => {
    const next = !quietHoursEnabled;
    setQuietHoursEnabled(next);
    void saveCurrentNotificationPreferences(remindersEnabled, reminderTimes, allowedNotificationDays, notificationSettings, next);
  };

  const saveQuietHoursTime = () => {
    void saveCurrentNotificationPreferences();
  };

  const saveTodoDeadline = async () => {
    if (!selectedTodo || !studentId) return;
    if (selectedTodo.isAdminAssigned) {
      alert('この課題の提出期限はAdmin／先生が管理しています。変更が必要な場合は先生に確認してください。');
      return;
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(selectedTodo.id))) {
      alert('課題データを正しく読み込めていません。ページを再読み込みしてください。');
      return;
    }
    const dueAt = todoDueAtInput ? new Date(todoDueAtInput) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) {
      alert('期限の日付と時刻を確認してください。');
      return;
    }
    const dueAtIso = dueAt ? dueAt.toISOString() : null;
    const { error } = await supabase.from('todos').update({
      due_at: dueAtIso,
      updated_at: new Date().toISOString(),
    }).eq('id', selectedTodo.id).eq('student_id', studentId);
    if (error) {
      console.error('課題期限の保存に失敗:', error);
      alert(`課題期限を保存できませんでした: ${error.message}`);
      return;
    }
    setTodos(prev => prev.map(todo => todo.id === selectedTodo.id ? { ...todo, due_at: dueAtIso } : todo));
    setSelectedTodo((prev: any) => prev ? { ...prev, due_at: dueAtIso } : prev);
    alert(dueAtIso ? '提出期限を保存しました。自動リマインダーの対象になります。' : '提出期限を解除しました。自動リマインダーの対象外になります。');
  };

  const handleSaveProfile = async (): Promise<boolean> => {
    const email = String(authUser?.email || '').trim().toLowerCase();
    const cleanStudentId = getStudentIdFromSchoolEmail(email);
    const cleanStudentName = studentName.trim();
    const cleanChatDisplayName = chatDisplayName.trim().slice(0, 40);

    if (!authUser || !cleanStudentId) {
      alert('学校メールでログインしてください。学籍番号はメールアドレスから自動設定されます。');
      return false;
    }
    if (!cleanStudentName) {
      alert('氏名を入力してください。');
      return false;
    }

    setProfileSaving(true);
    try {
      const profileValues = {
        student_id: cleanStudentId,
        student_name: cleanStudentName,
        chat_display_name: cleanChatDisplayName || null,
        user_class: userClass,
        email,
        auth_user_id: authUser.id,
        updated_at: new Date().toISOString(),
      };
      let { error } = await supabase
        .from('profiles')
        .upsert(profileValues, { onConflict: 'student_id' });
      let chatNameColumnMissing = false;

      // SQL未適用なら既存プロフィールは保存し、チャット名列の未設定を明確に知らせる。
      if (error && /chat_display_name|schema cache|column .* does not exist/i.test(error.message)) {
        chatNameColumnMissing = true;
        const fallback = await supabase
          .from('profiles')
          .upsert({
            student_id: cleanStudentId,
            student_name: cleanStudentName,
            user_class: userClass,
            email,
            auth_user_id: authUser.id,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'student_id' });
        error = fallback.error;
      }

      if (error) throw error;
      setStudentId(cleanStudentId);
      setStudentName(cleanStudentName);
      setChatDisplayName(chatNameColumnMissing ? '' : cleanChatDisplayName);
      if (chatNameColumnMissing && cleanChatDisplayName) {
        alert('プロフィールは保存しましたが、クラスチャット表示名用のSQLがまだ適用されていません。Supabaseで supabase/class-chat-phase6-display-name.sql を実行してから、表示名をもう一度保存してください。');
      } else {
        alert('プロフィールを保存しました！');
      }
      return true;
    } catch (error) {
      console.error('プロフィールの保存に失敗:', error);
      const message = error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : '不明なエラー';
      alert(`プロフィールの保存に失敗しました: ${message}\nSupabaseの学校メール認証SQLとprofilesのRLSを確認してください。`);
      return false;
    } finally {
      setProfileSaving(false);
    }
  };

  // ログイン済み端末から90秒・一回限りのログイン引き継ぎQRを発行する。
  const createStudentLoginHandoff = async () => {
    if (!authUser) return;
    setLoginHandoffBusy(true);
    setLoginHandoffMessage('別の端末用QRを発行しています…');
    try {
      const postCreate = (token: string) => fetch('/api/student-login-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'create' }),
        cache: 'no-store',
      });

      const { data: sessionData } = await supabase.auth.getSession();
      let accessToken = sessionData.session?.access_token || '';

      if (!accessToken) {
        const { data: refreshedSession } = await supabase.auth.refreshSession();
        accessToken = refreshedSession.session?.access_token || '';
      }

      if (!accessToken) {
        throw new Error('ログインセッションが見つかりません。再ログインしてください。');
      }

      let response = await postCreate(accessToken);
      let result = await response.json().catch(() => null);

      // 認証に失敗した場合、セッションを更新して一度だけ再試行する。
      if (response.status === 401) {
        const { data: refreshedSession } = await supabase.auth.refreshSession();
        const refreshedToken = refreshedSession.session?.access_token;

        if (refreshedToken && refreshedToken !== accessToken) {
          response = await postCreate(refreshedToken);
          result = await response.json().catch(() => null);
        }
      }

      if (!response.ok || !result?.success) {
        const message = response.status === 401
          ? 'ログインセッションをサーバーで確認できません。ページを再読み込みして再ログインしてください。'
          : (result?.message || `QR発行に失敗しました（HTTP ${response.status}）。`);
        throw new Error(message);
      }
      setLoginHandoffId(result.id);
      setLoginHandoffSecret(result.secret);
      setLoginHandoffExpiresAt(result.expires_at);
      setLoginHandoffStatus('waiting');
      setLoginHandoffMessage('QRを別の端末で読み取ると、この画面にログイン承認が表示されます。90秒で失効します。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String((error as any)?.message || '不明なエラー');
      setLoginHandoffMessage(`QR発行に失敗しました: ${message}`);
    } finally {
      setLoginHandoffBusy(false);
    }
  };

  const handleActivateStudentCard = async () => {
    const saved = await handleSaveProfile();
    if (saved) {
      setShowIdCardModal(true);
      setLoginHandoffId('');
      setLoginHandoffSecret('');
      setLoginHandoffStatus('idle');
      setLoginHandoffMessage('別の端末にログインするための一回限りQRを発行してください。');
    }
  };

  const decideStudentLoginHandoff = async (decision: 'approve' | 'deny') => {
    if (!authUser || !loginHandoffId || loginHandoffBusy) return;
    setLoginHandoffBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('ログインセッションが見つかりません。');
      const response = await fetch('/api/student-login-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: decision, id: loginHandoffId }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.message || 'ログイン要求を処理できませんでした。');
      setLoginHandoffStatus(decision === 'approve' ? 'approved' : 'denied');
      setLoginHandoffMessage(decision === 'approve' ? '許可しました。別の端末でログイン処理が進みます。' : 'ログイン要求を拒否しました。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String((error as any)?.message || '不明なエラー');
      setLoginHandoffMessage(`処理に失敗しました: ${message}`);
    } finally {
      setLoginHandoffBusy(false);
    }
  };

  // QRを表示している元端末は、読み取り要求をポーリングし、本人が明示的に承認する。
  useEffect(() => {
    if (!showIdCardModal || !authUser || !loginHandoffId || !['waiting', 'requested'].includes(loginHandoffStatus)) return;
    let cancelled = false;
    let timer: number | undefined;
    const pollStatus = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) return;
        const response = await fetch('/api/student-login-handoff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: 'status', id: loginHandoffId }),
          cache: 'no-store',
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.success || cancelled) return;
        if (result.status === 'requested') {
          setLoginHandoffStatus('requested');
          setLoginHandoffMessage('別の端末からログイン要求が届きました。心当たりがある場合だけ許可してください。');
        } else if (result.status === 'expired') {
          setLoginHandoffStatus('expired');
          setLoginHandoffMessage('QRの有効期限が切れました。新しいQRを発行してください。');
        } else if (result.status === 'used') {
          setLoginHandoffStatus('used');
          setLoginHandoffMessage('別の端末でログインが完了しました。');
        }
      } catch (error) {
        console.error('ログイン引き継ぎ状態の確認に失敗:', error);
      }
      if (!cancelled && ['waiting', 'requested'].includes(loginHandoffStatus)) {
        timer = window.setTimeout(pollStatus, 1500);
      }
    };
    timer = window.setTimeout(pollStatus, 1200);
    return () => { cancelled = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [showIdCardModal, authUser, loginHandoffId, loginHandoffStatus]);

  useEffect(() => {
    if (!showCardScanner || cardScanDone) return;
    let cancelled = false;
    let alreadyDecoded = false;
    let scanner: any = null;
    let scannerStopped = false;
    let scannerStopPromise: Promise<void> | null = null;

    const stopScanner = async () => {
      if (!scanner || scannerStopped) return;
      if (scannerStopPromise) {
        await scannerStopPromise;
        return;
      }
      scannerStopPromise = (async () => {
        try {
          await scanner.stop();
        } catch {
          // すでに停止済みの場合は無視
        } finally {
          scannerStopped = true;
        }
      })();
      try {
        await scannerStopPromise;
      } finally {
        scannerStopPromise = null;
      }
    };

    const startScanner = async () => {
      setCardScanStatus('カメラを準備しています…');
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        const element = document.getElementById('campus-sync-qr-reader');
        if (!element) throw new Error('カメラ表示領域がありません。');
        scanner = new Html5Qrcode('campus-sync-qr-reader', { verbose: false });
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 230, height: 230 }, aspectRatio: 1 },
          async (decodedText: string) => {
            if (cancelled || alreadyDecoded) return;
            alreadyDecoded = true;
            setCardScanDone(false);
            setCardScanStatus('ログイン要求を送信しています…');
            await stopScanner();
            try {
              const match = /^CAMPUSSYNC-LOGIN:([0-9a-f-]{36}):([A-Za-z0-9_-]{32,})$/i.exec(decodedText.trim());
              if (!match) {
                setScannedStudent(null);
                setCardScanDone(true);
                setCardScanStatus('有効な一回限りのCampusSyncログインQRではありません。ログイン用QRを表示してください。');
                return;
              }
              const handoff = { id: match[1], secret: match[2] };
              const postHandoff = async (action: string) => {
                const response = await fetch('/api/student-login-handoff', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action, ...handoff }),
                  cache: 'no-store',
                });
                const result = await response.json().catch(() => null);
                if (!response.ok || !result?.success) throw new Error(result?.message || `ログイン連携エラー（HTTP ${response.status}）`);
                return result;
              };
              const requested = await postHandoff('request');
              if (requested.status === 'expired') throw new Error('QRの有効期限が切れています。元の端末で新しいQRを発行してください。');
              setCardScanStatus('QRを表示した端末で承認してください。知らない相手の要求は許可しないでください。');
              let completed = false;
              for (let attempt = 0; attempt < 55 && !cancelled; attempt++) {
                await new Promise(resolve => window.setTimeout(resolve, 1400));
                const pollResult = await postHandoff('poll');
                if (pollResult.status === 'denied') throw new Error('元の端末でログイン要求が拒否されました。');
                if (pollResult.status === 'expired') throw new Error('QRの有効期限が切れました。元の端末で新しいQRを発行してください。');
                if (pollResult.status === 'approved') {
                  setCardScanStatus('ログインを完了しています…');
                  const redemption = await postHandoff('redeem');
                  const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({ token_hash: redemption.token_hash, type: 'magiclink' });
                  if (verifyError) throw verifyError;

                  // ユーザー情報だけでなく、実際のログインセッションを確認する。
                  const verifiedSession = verified.session;
                  if (!verifiedSession?.access_token || !verifiedSession.refresh_token || !verifiedSession.user) {
                    throw new Error('ログインセッションを取得できませんでした。新しいQRでやり直してください。');
                  }

                  const { data: savedSession, error: saveSessionError } = await supabase.auth.setSession({
                    access_token: verifiedSession.access_token,
                    refresh_token: verifiedSession.refresh_token,
                  });
                  if (saveSessionError) throw saveSessionError;

                  const session = savedSession.session;
                  const user = session?.user ?? null;
                  const derivedStudentId = getStudentIdFromSchoolEmail(user?.email);
                  if (!session?.access_token || !session.refresh_token || !user || !derivedStudentId) {
                    throw new Error('ログインセッションまたは学校メールを確認できませんでした。新しいQRでやり直してください。');
                  }
                  setAuthUser(user);
                  setStudentId(derivedStudentId);
                  setAuthMessage('別の端末からログインしました。');
                  setCardScanStatus('ログインしました。画面を切り替えています…');
                  setCardScanDone(true);
                  setShowCardScanner(false);
                  completed = true;
                  break;
                }
              }
              if (!completed && !cancelled) {
                setCardScanDone(true);
                setCardScanStatus('ログイン要求がタイムアウトしました。もう一度QRを読み取ってください。');
              }
            } catch (error) {
              console.error('QRログインに失敗:', error);
              const message = error instanceof Error ? error.message : String((error as any)?.message || '不明なエラー');
              setScannedStudent(null);
              setCardScanDone(true);
              setCardScanStatus(`QRログインに失敗しました: ${message}`);
            }
          },
          () => undefined
        );
        if (!cancelled) setCardScanStatus('学生証のQRコードを枠内に合わせてください。');
      } catch (error) {
        console.error('QRカメラの起動に失敗:', error);
        if (!cancelled) {
          setCardScanDone(true);
          setCardScanStatus('カメラを起動できません。スマホのカメラ使用を許可し、HTTPSで開いてください。');
        }
      }
    };

    void startScanner();
    return () => {
      cancelled = true;
      if (scanner) {
        void stopScanner().finally(() => {
          try { scanner.clear(); } catch { /* scanner is already cleared */ }
        });
      }
    };
  }, [showCardScanner, cardScanDone]);

  const updateContribution = async (delta: number, reason: string) => {
    const cleanStudentId = studentId.trim();

    if (!/^\d{6}$/.test(cleanStudentId)) {
      setScore(prev => Math.max(0, Math.min(prev + delta, 100)));
      showContributionToast(delta, reason);
      return;
    }

    setScoreSaving(true);
    const todayScoreDate = getTokyoDateKey();
    const todayRange = getTokyoDayRange(todayScoreDate);

    const { data: current, error: fetchError } = await supabase
      .from('contribution_scores')
      .select('*')
      .eq('student_id', cleanStudentId)
      .maybeSingle();

    if (fetchError) {
      console.error('貢献度ポイントの取得に失敗:', fetchError);
      setScoreSaving(false);
      return;
    }

    let currentScore = current?.score_date === todayScoreDate ? Number(current.score) || 0 : 0;
    if (current?.score_date !== todayScoreDate) {
      const { data: todayHistory, error: todayHistoryError } = await supabase
        .from('contribution_history')
        .select('delta')
        .eq('student_id', cleanStudentId)
        .gte('created_at', todayRange.start)
        .lt('created_at', todayRange.end);
      if (!todayHistoryError) {
        currentScore = Math.min(100, Math.max(0,
          (todayHistory ?? []).reduce((total, row) => total + (Number(row.delta) || 0), 0)
        ));
      } else {
        console.error('本日の貢献度履歴の取得に失敗:', todayHistoryError);
      }
    }

    const nextScore = Math.max(0, Math.min(currentScore + delta, 100));
    const scoreValues = {
      student_id: cleanStudentId,
      score: nextScore,
      score_date: todayScoreDate,
      updated_at: new Date().toISOString(),
    };

    let { error: scoreError } = await supabase
      .from('contribution_scores')
      .upsert(scoreValues, { onConflict: 'student_id' });

    if (scoreError) {
      // Older databases may not have score_date yet; keep the point update working until migration.
      const legacyWrite = await supabase
        .from('contribution_scores')
        .upsert({
          student_id: cleanStudentId,
          score: nextScore,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'student_id' });
      scoreError = legacyWrite.error;
    }

    if (scoreError) {
      console.error('貢献度ポイントの保存に失敗:', scoreError);
      setScoreSaving(false);
      return;
    }

    const { error: historyError } = await supabase
      .from('contribution_history')
      .insert({
        student_id: cleanStudentId,
        delta,
        reason,
        score_after: nextScore,
      });

    if (historyError) {
      console.error('貢献度履歴の保存に失敗:', historyError);
    } else {
      setLifetimeContributionPoints(prev => Math.max(0, prev + delta));
    }

    showContributionToast(delta, reason);
    setScore(nextScore);
    setScoreSaving(false);
  };

  // --- タブ別メインコンテンツレンダリング ---
  const renderContent = () => {
    const activeTextClass = isDarkMode ? 'text-white' : 'text-gray-800';
    const cardBgClass = isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-100 text-gray-800';
    const subTextClass = isDarkMode ? 'text-slate-400' : 'text-gray-400';

    switch (activeTab) {
      case 'ai':
        return <CampusAIChat mode="full" />;

      case 'home':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {notifications.filter(note => note.priority === 'emergency' && (!note.expiresAt || new Date(note.expiresAt).getTime() > Date.now())).slice(0, 3).map(note => (
              <button key={note.id} type="button" onClick={() => setSelectedNotification(note)} className="flex w-full items-start gap-3 rounded-2xl border-2 border-rose-300 bg-rose-50 p-4 text-left shadow-sm transition hover:bg-rose-100">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white"><AlertTriangle size={21}/></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-black tracking-widest text-rose-700">緊急連絡 / EMERGENCY</span>
                  <span className="mt-1 block break-words text-sm font-black text-rose-950">{note.title}</span>
                  <span className="mt-1 block line-clamp-2 text-xs leading-5 text-rose-800">{note.body}</span>
                  <span className="mt-2 block text-[10px] font-bold text-rose-700">{note.time} ・ 詳細を確認する</span>
                </span>
                <ChevronRight size={18} className="mt-1 shrink-0 text-rose-500"/>
              </button>
            ))}
            <section className="campus-school-hero relative isolate min-h-[190px] overflow-hidden rounded-[28px] border border-white/15 shadow-xl sm:min-h-[230px]" aria-label="創価高等学校の校舎">
              <img
                src="https://www.minkou.jp/images/school_img/2493/6d5cb19fe35a03f7815f5f57a3ddfaf46a1e2223.jpg"
                alt="創価高等学校の校舎"
                className="campus-school-hero__image absolute inset-0 h-full w-full object-cover"
                loading="eager"
                referrerPolicy="strict-origin-when-cross-origin"
                draggable={false}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/55 to-slate-900/10" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-transparent to-slate-950/10" />
              <div className="relative z-10 flex min-h-[190px] flex-col justify-end p-5 sm:min-h-[230px] sm:p-7">
                <p className="mb-2 flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-cyan-100 sm:text-xs">
                  <span className="rounded-full border border-cyan-200/40 bg-cyan-300/15 px-2.5 py-1">CAMPUSSYNC</span>
                  SOKA HIGH SCHOOL
                </p>
                <h1 className="text-2xl font-black leading-tight tracking-tight text-white drop-shadow-lg sm:text-3xl">学校生活を、ひとつにつなぐ。</h1>
                <p className="mt-2 max-w-xl text-xs font-semibold leading-5 text-white/85 sm:text-sm">時間割も、学校予定も、移動も。毎日のキャンパスライフをCampusSyncで。</p>
              </div>
            </section>

            {/* ダッシュボード上部・スコアシステム */}
            <div className={`bg-gradient-to-br ${themeCls.gradient} rounded-3xl p-6 shadow-xl text-white relative overflow-hidden transition-all duration-300`}>
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
              <div className="flex justify-between items-end mb-3 relative z-10">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-2.5 py-0.5 rounded-full">
                      {getCohortName(studentId)}
                    </span>
                    <span className="text-xs font-bold text-white/90">{userClass}クラス {studentName} さん</span>
                  </div>
                  <h2 className="text-xs font-semibold text-white/80 mb-0.5">本日のリアルタイム学校貢献度</h2>
                  <p className="text-4xl font-black tracking-tight">{score} <span className="text-base font-medium text-white/70">/ 100 pt</span></p>
                <ScoreRankBadge points={Number(score ?? 0)} />
                </div>
                <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm flex flex-col items-center gap-0.5">
                  <Sparkles size={22} className="text-yellow-200 animate-bounce" />
                  <span className="text-[10px] font-black tracking-wider">アクティブ</span>
                </div>
              </div>
              <div className="h-2.5 bg-black/15 rounded-full overflow-hidden mt-4 relative z-10">
                <div className="h-full bg-white rounded-full transition-all duration-1000 ease-out" style={{ width: `${score}%` }}></div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2.5">
                <span className="text-xs font-semibold text-white/75">累計獲得ポイント</span>
                <span className="text-sm font-black tabular-nums text-white">{lifetimeContributionPoints.toLocaleString('ja-JP')} pt</span>
              </div>
              <p className="text-[10px] text-white/70 mt-2 text-right">※情報を報告したりタスクを完了するとポイントが貯まります</p>
            </div>

            <section className={`${cardBgClass} rounded-2xl border p-4 shadow-sm`}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className={`flex items-center gap-2 text-sm font-black ${activeTextClass}`}><Star size={17} className="text-amber-500"/> お気に入り</h3>
                <button type="button" onClick={() => setShowFavoriteEditor(value => !value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[10px] font-bold text-gray-500 hover:bg-gray-50">
                  {showFavoriteEditor ? '閉じる' : '編集'}
                </button>
              </div>
              {favoriteDashboardTabs.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {favoriteDashboardTabs.map(id => {
                    const item = FAVORITE_DASHBOARD_OPTIONS.find(option => option.id === id);
                    if (!item) return null;
                    const Icon = item.icon;
                    return (
                      <button key={id} type="button" onClick={() => {
                        if (id === 'tasks') { setActiveTab('home'); setHashScrollTarget('tasks'); }
                        else if (id === 'campus-map') { setFacilitiesSubTab('map'); setActiveTab('facilities'); }
                        else setActiveTab(id);
                      }} className="flex min-w-0 items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 text-left transition hover:border-cyan-200 hover:bg-cyan-50">
                        <Icon size={19} className="shrink-0 text-cyan-700"/>
                        <span className="min-w-0 truncate text-[11px] font-black text-gray-700">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl bg-gray-50 p-3 text-center text-xs text-gray-500">お気に入りがまだありません。「編集」から追加できます。</p>
              )}
              {showFavoriteEditor && (
                <div className="mt-3 rounded-xl border border-dashed border-gray-200 p-3">
                  <p className="mb-2 text-[10px] font-bold text-gray-500">ホームに表示する機能（最大6件）</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {FAVORITE_DASHBOARD_OPTIONS.map(item => (
                      <label key={item.id} className="flex min-w-0 items-center gap-2 rounded-lg bg-gray-50 p-2 text-[10px] font-bold text-gray-700">
                        <input
                          type="checkbox"
                          checked={favoriteDashboardTabs.includes(item.id)}
                          onChange={event => setFavoriteDashboardTabs(current => {
                            if (event.target.checked) return current.length >= 6 ? current : [...current, item.id];
                            return current.filter(value => value !== item.id);
                          })}
                        />
                        <span className="truncate">{item.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-[9px] text-gray-400">この設定は現在のブラウザーに保存されます。</p>
                </div>
              )}
            </section>

            {/* クイックリンク・本日のショートカット */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div onClick={() => setActiveTab('timetable')} className={`${cardBgClass} p-3.5 rounded-2xl border text-center cursor-pointer hover:scale-[1.02] transition-transform`}>
                <Calendar className={`mx-auto mb-1.5 ${themeCls.text}`} size={22} />
                <span className="text-xs font-black block">時間割</span>
              </div>
              <div onClick={() => setActiveTab('bus')} className={`${cardBgClass} p-3.5 rounded-2xl border text-center cursor-pointer hover:scale-[1.02] transition-transform`}>
                <Train className="mx-auto mb-1.5 text-amber-500" size={22} />
                <span className="text-xs font-black block">電車発車案内</span>
              </div>
              <div onClick={() => setActiveTab('club')} className={`${cardBgClass} p-3.5 rounded-2xl border text-center cursor-pointer hover:scale-[1.02] transition-transform`}>
                <MessageSquare className="mx-auto mb-1.5 text-purple-500" size={22} />
                <span className="text-xs font-black block">部活連絡</span>
              </div>
              <div onClick={() => setActiveTab('school-schedule')} className={`${cardBgClass} p-3.5 rounded-2xl border text-center cursor-pointer hover:scale-[1.02] transition-transform`}>
                <Calendar className="mx-auto mb-1.5 text-cyan-600" size={22} />
                <span className="text-xs font-black block">学校予定表</span>
              </div>
            </div>

            <CountdownEventWidget mode="dashboard" onViewAll={() => setActiveTab('countdowns')} />

            {/* TODOセクション */}
            <section id="tasks" className="scroll-mt-24">
              <h3 className={`text-[17px] font-black mb-3 flex items-center ${activeTextClass}`}>
                <Clock size={20} className={`mr-2 ${themeCls.text}`}/> マイ提出物・連絡リマインダー
              </h3>
              <div className="flex justify-end mb-3">
                <button
                  type="button"
                  onClick={() => setShowAddTodoModal(true)}
                  className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
                >
                  <Plus size={16} /> 自分の課題を追加
                </button>
              </div>
              <div className="space-y-2.5">
                {visibleTodos.length === 0 && <EmptyStateIllustration kind="empty-todo-done" caption="課題はすべて完了！おつかれさま" />}
          {visibleTodos.map(todo => (
                  <div 
                    key={todo.id} 
                    onClick={() => { setSelectedTodo(todo); setTodoDueAtInput(toLocalDateTimeInput(todo.due_at)); }}
                    className={`w-full p-4 rounded-2xl shadow-sm border flex items-center gap-3 text-left hover:shadow-md transition-all cursor-pointer ${
                      todo.completed 
                        ? 'bg-green-50/40 border-green-200/50 opacity-60' 
                        : cardBgClass
                    }`}
                  >
                    <button
                      onClick={(e) => toggleTodoComplete(todo.id, e)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all flex-shrink-0 ${
                        todo.completed 
                          ? 'bg-green-500 border-green-500 text-white' 
                          : `border-gray-300 hover:${themeCls.border} bg-white`
                      }`}
                    >
                      {todo.completed && <Check size={16} strokeWidth={3} />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-0.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          todo.completed ? 'bg-green-100 text-green-700' : todo.color
                        }`}>
                          {todo.completed ? '提出完了' : todo.due}
                        </span>
                        <span className={`text-[10px] font-medium ${subTextClass}`}>{todo.source}</span>
                      </div>
                      <h4 className={`text-sm font-black truncate ${todo.completed ? 'line-through text-gray-400' : ''}`}>
                        {todo.title}
                      </h4>
                    </div>
                    <ChevronRight size={16} className={subTextClass} />
                  </div>
                ))}
              </div>
            </section>

            {/* 校内環境・エアコン快適度状況 */}
            <section>
              <div className="flex justify-between items-center mb-3">
                <h3 className={`text-[17px] font-black flex items-center ${activeTextClass}`}>
                  <AnimatedAsset name="aircon-wind" className="mr-2 h-8 w-8" /> リアルタイム教室エアコン状況
                </h3>
                <button 
                  onClick={() => setShowTempModal(true)}
                  className="text-xs font-bold bg-teal-50 text-teal-600 px-3 py-1.5 rounded-full hover:bg-teal-100 transition-colors flex items-center shadow-sm"
                >
                  <Plus size={14} className="mr-1" /> 報告・更新
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {rooms.map(room => (
                  <div key={room.id} className={`${cardBgClass} p-3.5 rounded-2xl shadow-sm border relative`}>
                    {favoriteRoomId === room.id && (
                      <span className="absolute top-2.5 right-2.5 text-yellow-400">
                        <Star size={13} fill="currentColor" />
                      </span>
                    )}
                    <div className="flex justify-between items-start mb-1.5">
                      <room.icon size={18} className={room.color} />
                      <span className={`text-xs font-black ${subTextClass}`}>{room.temp}</span>
                    </div>
                    <h4 className={`text-xs ${subTextClass} mb-0.5`}>{room.name}</h4>
                    <p className={`text-xs font-black ${room.color}`}>{room.status}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        );

      case 'school-schedule':
        return <WeeklySchoolSchedule />;

      case 'countdowns':
        return <CountdownEventWidget mode="list" />;

      case 'timetable':
        return (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
              <h2 className={`text-xl font-black ${activeTextClass}`}>時間割スケジュール</h2>
              {/* 7組・8組セレクター */}
              <div className="bg-gray-200/80 p-1 rounded-xl flex gap-1 text-xs font-bold">
                {(['7組', '8組'] as const).map(group => (
                  <button
                    key={group}
                    onClick={() => setSelectedTimetableGroup(group)}
                    className={`px-3 py-1.5 rounded-lg transition-all ${selectedTimetableGroup === group ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
                  >
                    {group}時間割
                  </button>
                ))}
              </div>
            </div>

            {/* 曜日選択バー */}
            <div className="grid grid-cols-5 gap-1 bg-gray-100 p-1 rounded-xl">
              {([
                { key: 'Mon', label: '月' },
                { key: 'Tue', label: '火' },
                { key: 'Wed', label: '水' },
                { key: 'Thu', label: '木' },
                { key: 'Fri', label: '金' },
              ] as const).map(d => (
                <button
                  key={d.key}
                  onClick={() => setSelectedDay(d.key)}
                  className={`py-2 text-xs font-black rounded-lg transition-all ${
                    selectedDay === d.key 
                      ? `${themeCls.bg} text-white shadow-sm` 
                      : 'text-gray-600 hover:bg-gray-200/50'
                  }`}
                >
                  {d.label}曜
                </button>
              ))}
            </div>

            {/* 時間割リスト表示 */}
            <div className="space-y-2">
              {timetableData[selectedTimetableGroup][selectedDay].length === 0 ? (
                <EmptyStateIllustration kind="empty-no-class" caption="選択した曜日の授業はありません。" />
              ) : timetableData[selectedTimetableGroup][selectedDay].map((slot) => (
                <div key={slot.period} className={`${cardBgClass} p-4 rounded-2xl border shadow-sm flex items-center gap-4`}>
                  <div className={`w-9 h-9 rounded-xl ${themeCls.lightBg} flex flex-col items-center justify-center font-black ${themeCls.text} text-sm flex-shrink-0`}>
                    {slot.period}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-black text-gray-800 tracking-wide">{slot.subject}</h4>
                    <div className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${subTextClass}`}>
                      <BookOpenCheck size={12} /> 担当: {slot.teacher}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-blue-50/60 p-3.5 rounded-2xl border border-blue-100/50 text-blue-800 text-xs flex gap-2">
              <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed">添付された7組・8組の時間割を表示しています。特別授業や変更がある場合は、学校からの最新連絡を確認してください。</p>
            </div>
          </div>
        );

      case 'cafeteria':
        return (
          <div className="space-y-4 animate-in fade-in duration-300">
            {cafeteriaAnnouncement?.show_banner && (
              <section
                aria-label="学食からのお知らせ"
                className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                    <BellRing size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-amber-800">学食からのお知らせ</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm font-bold leading-relaxed text-amber-950">{cafeteriaAnnouncement.message}</p>
                    {cafeteriaAnnouncement.updated_at && (
                      <p className="mt-2 text-[10px] font-medium text-amber-700">
                        更新：{new Date(cafeteriaAnnouncement.updated_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}
            {/* サブタブ切り替え */}
            <div className="flex bg-gray-100 p-1 rounded-2xl">
              <button 
                onClick={() => setCafeteriaSubTab('overall')}
                className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${cafeteriaSubTab === 'overall' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
              >
                全体の混雑度
              </button>
              <button 
                onClick={() => setCafeteriaSubTab('menu')}
                className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${cafeteriaSubTab === 'menu' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
              >
                メニュー別の並び
              </button>
              <button 
                onClick={() => setCafeteriaSubTab('reviews')}
                className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${cafeteriaSubTab === 'reviews' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
              >
                口コミレビュー 💬
              </button>
            </div>

            {cafeteriaSubTab === 'overall' && (
              <section className={`${cardBgClass} rounded-2xl p-5 shadow-sm border`}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-base font-black flex items-center">
                    <AnimatedAsset name="cafeteria-steam" className="mr-2 h-8 w-8" /> 現在の食堂全体の混雑状況
                  </h3>
                  <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">リアルタイム集計</span>
                </div>
                
                <div className="space-y-3.5 mb-6">
                  <VoteBar label="空いていて快適" count={crowdVotes.empty} type="empty" userVote={userVote} percent={getPercent(crowdVotes.empty)} color="bg-green-500" />
                  <VoteBar label="通常の混み具合" count={crowdVotes.normal} type="normal" userVote={userVote} percent={getPercent(crowdVotes.normal)} color="bg-orange-400" />
                  <VoteBar label="大変混雑している" count={crowdVotes.crowded} type="crowded" userVote={userVote} percent={getPercent(crowdVotes.crowded)} color="bg-red-500" />
                </div>

                <p className="text-center text-xs font-black text-gray-500 mb-2.5">現在の混雑シチュエーションをワンタップ報告</p>
                <div className="grid grid-cols-3 gap-2">
                  <button disabled={isVoting} onClick={() => handleVote('empty')} className={`py-2.5 text-xs font-black rounded-xl border transition-all disabled:opacity-50 ${userVote === 'empty' ? 'border-green-500 bg-green-50 text-green-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>空き</button>
                  <button disabled={isVoting} onClick={() => handleVote('normal')} className={`py-2.5 text-xs font-black rounded-xl border transition-all disabled:opacity-50 ${userVote === 'normal' ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>普通</button>
                  <button disabled={isVoting} onClick={() => handleVote('crowded')} className={`py-2.5 text-xs font-black rounded-xl border transition-all disabled:opacity-50 ${userVote === 'crowded' ? 'border-red-500 bg-red-50 text-red-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>激混み</button>
                </div>
              </section>
            )}

            {cafeteriaSubTab === 'menu' && (
              <div className="space-y-3">
                {menuItems.length === 0 && (
                  <div className={`${cardBgClass} rounded-2xl border p-5 text-sm leading-relaxed text-gray-500`}>
                    {cafeteriaMenuLoading ? '本日の献立を読み込んでいます…' : cafeteriaMenuLoadMessage || '本日の献立は未登録です。管理画面の月間献立表に入力してください。'}
                  </div>
                )}
                {menuItems.map(item => {
                  const isSoldOut = soldOutItems[item.id];
                  const votes = menuVotes[item.id] ?? { empty: 0, normal: 0, crowded: 0 };
                  const userVoteItem = userMenuVotes[item.id];
                  const total = votes.empty + votes.normal + votes.crowded;
                  const getMenuPercent = (val: number, _key: string) => {
                    if (isSoldOut || total === 0) return 0;
                    return Math.round((val / total) * 100) || 0;
                  };

                  return (
                    <div key={item.id} className={`${cardBgClass} rounded-2xl p-4 border relative overflow-hidden`}>
                      {isSoldOut && (
                        <div className="absolute inset-0 bg-red-500/5 backdrop-blur-[1px] flex items-center justify-center pointer-events-none z-10">
                          <div className="bg-red-600 text-white font-black text-xs px-3.5 py-1.5 rounded-full shadow-md transform -rotate-2">
                            完売 / SOLD OUT
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="text-sm font-black text-gray-800">{item.name}</h4>
                          <p className="text-[10px] text-gray-400 font-bold">
                            {item.price && `価格: ${item.price} ・ `}{item.calorie ? `カロリー: ${item.calorie}` : 'カロリー未登録'} ・ {item.allergy ? `アレルギー: ${item.allergy}` : 'アレルギー情報未登録'}
                          </p>
                        </div>
                        <button
                          disabled={isSoldOut || Boolean(userSoldOutReports[item.id]) || reportingSoldOutMenuId === item.id}
                          onClick={() => void reportSoldOut(item.id)}
                          className={`text-[10px] font-black px-2.5 py-1.5 rounded-xl border transition-all z-20 disabled:cursor-not-allowed disabled:opacity-60 ${
                            isSoldOut ? 'bg-red-100 border-red-200 text-red-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-red-50'
                          }`}
                        >
                          {isSoldOut ? '売切確定' : reportingSoldOutMenuId === item.id ? '送信中…' : userSoldOutReports[item.id] ? '報告済み' : '売り切れを報告'}
                        </button>
                      </div>

                      <div className={`grid grid-cols-3 gap-1.5 text-[10px] font-bold mb-2.5 ${isSoldOut ? 'opacity-20' : ''}`}>
                        <div className="bg-green-50/70 p-1.5 rounded-lg border text-center text-green-700">
                          <span>並びなし: {getMenuPercent(votes.empty, 'empty')}%</span>
                        </div>
                        <div className="bg-orange-50/70 p-1.5 rounded-lg border text-center text-orange-700">
                          <span>普通: {getMenuPercent(votes.normal, 'normal')}%</span>
                        </div>
                        <div className="bg-red-50/70 p-1.5 rounded-lg border text-center text-red-700">
                          <span>行列大: {getMenuPercent(votes.crowded, 'crowded')}%</span>
                        </div>
                      </div>

                      <div className={`flex gap-1.5 ${isSoldOut ? 'opacity-10 pointer-events-none' : ''}`}>
                        <button disabled={isSoldOut} onClick={() => handleMenuVote(item.id, 'empty')} className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg border ${userVoteItem === 'empty' ? 'border-green-500 bg-green-50 text-green-600' : 'border-gray-200 text-gray-500'}`}>快適</button>
                        <button disabled={isSoldOut} onClick={() => handleMenuVote(item.id, 'normal')} className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg border ${userVoteItem === 'normal' ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500'}`}>普通</button>
                        <button disabled={isSoldOut} onClick={() => handleMenuVote(item.id, 'crowded')} className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg border ${userVoteItem === 'crowded' ? 'border-red-500 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500'}`}>大行列</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {cafeteriaSubTab === 'reviews' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* 新規口コミ投稿フォーム */}
                <form onSubmit={handleAddReview} className={`${cardBgClass} rounded-2xl p-4 border shadow-sm space-y-3`}>
                  <h4 className="text-xs font-black flex items-center gap-1"><Plus size={15}/> メニューの口コミを投稿</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={selectedMenuForReview}
                      onChange={e => setSelectedMenuForReview(e.target.value)}
                      className="bg-gray-50 border border-gray-200 rounded-xl p-2 text-xs font-bold outline-none"
                    >
                      {menuItems.map(m => <option key={m.id} value={m.id}>{m.name.split('（')[0]}</option>)}
                    </select>
                    <div className="flex items-center justify-around bg-gray-50 border border-gray-200 rounded-xl px-2">
                      {[1, 2, 3, 4, 5].map(num => (
                        <button key={num} type="button" onClick={() => setNewReviewRating(num)} className="p-0.5">
                          <Star size={14} fill={num <= newReviewRating ? '#FBBF24' : 'none'} stroke={num <= newReviewRating ? '#FBBF24' : '#9CA3AF'} />
                        </button>
                      ))}
                    </div>
                    <input 
                      type="text" 
                      placeholder="ハンドルネーム (空欄で匿名)" 
                      value={newReviewUser} 
                      onChange={e => setNewReviewUser(e.target.value)}
                      className="col-span-2 bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-medium outline-none" 
                    />
                    <textarea
                      placeholder="味の感想やボリューム、おすすめのトッピングなど..."
                      value={newReviewComment}
                      onChange={e => setNewReviewComment(e.target.value)}
                      className="col-span-2 bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-medium outline-none h-16 resize-none"
                    />
                  </div>
                  <button type="submit" className={`w-full py-2.5 text-white text-xs font-black rounded-xl ${themeCls.bg} ${themeCls.bgHover}`}>
                    レビューを送信して貢献度ポイント獲得
                  </button>
                </form>

                {/* 口コミタイムライン */}
                <div className="space-y-2">
                  {cafeteriaReviews.length === 0 && <EmptyStateIllustration kind="empty-reviews" caption="まだ口コミがありません。" />}
          {cafeteriaReviews.map(rev => (
                    <div key={rev.id} className={`${cardBgClass} p-4 rounded-2xl border shadow-xs space-y-1.5`}>
                      <div className="flex justify-between items-center">
                        <span className={`text-xs font-black bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md`}>
                          {(menuItems.find(m => m.id === rev.menuId)?.name || ({ soka: '創価ランチ', healthy: 'ヘルシーランチ', snack: 'スナックランチ', curry: 'カレー', noodles: '麺類' } as Record<string, string>)[rev.menuId] || '学食メニュー').split('（')[0]}
                        </span>
                        <span className={`text-[10px] ${subTextClass}`}>{rev.date}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map(n => <Star key={n} size={11} fill={n <= rev.rating ? '#FBBF24' : 'none'} stroke={n <= rev.rating ? '#FBBF24' : '#D1D5DB'} />)}
                        </div>
                        <span className="text-xs font-bold text-gray-600">by {rev.userName}</span>
                      </div>
                      <p className="text-xs text-gray-700 leading-relaxed font-medium">{rev.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'facilities':
        return (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex bg-gray-100 p-1 rounded-2xl">
              <button 
                onClick={() => setFacilitiesSubTab('status')}
                className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${facilitiesSubTab === 'status' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
              >
                図書室・自習室状況
              </button>
              <button 
                onClick={() => setFacilitiesSubTab('lost')}
                className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${facilitiesSubTab === 'lost' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
              >
                落とし物共有掲示板 🔍
              </button>
              <button
                onClick={() => setFacilitiesSubTab('map')}
                className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${facilitiesSubTab === 'map' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
              >
                校内マップ
              </button>
            </div>

            {facilitiesSubTab === 'status' ? (
              <div className="space-y-4">
                <section className={`${cardBgClass} rounded-2xl p-4 border shadow-sm`}>
                  <h3 className="text-sm font-black text-indigo-600 mb-2.5 flex items-center"><BookOpen size={18} className="mr-1.5"/> 図書室蔵書・予約検索</h3>
                  <div className="relative mb-3">
                    <input
                      type="search"
                      value={librarySearch}
                      onChange={e => setLibrarySearch(e.target.value)}
                      placeholder="タイトル・著者名・管理番号で検索..."
                      aria-label="蔵書をタイトルや著者名で検索"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
                  </div>

                  {libraryBooksLoading ? (
                    <p className="py-5 text-center text-xs text-gray-400">蔵書を読み込み中...</p>
                  ) : libraryBooksError ? (
                    <EmptyStateIllustration kind="error-offline" caption={libraryBooksError} className="py-2" />
                  ) : (
                    <>
                      <p className="text-[10px] text-gray-400 font-bold mb-2">
                        {librarySearch.trim()
                          ? `検索結果：${libraryBooks.filter(book => `${book.title} ${book.author} ${book.code}`.toLocaleLowerCase().includes(librarySearch.trim().toLocaleLowerCase())).length}冊`
                          : `登録蔵書：${libraryBooks.length}冊`}
                      </p>
                      {libraryBooks.filter(book =>
                        `${book.title} ${book.author} ${book.code}`
                          .toLocaleLowerCase()
                          .includes(librarySearch.trim().toLocaleLowerCase())
                      ).length === 0 ? (
                        <EmptyStateIllustration
                          kind="empty-library-search"
                          caption={librarySearch.trim()
                            ? '一致する蔵書が見つかりません。検索語を変えてください。'
                            : '蔵書はまだ登録されていません。'}
                          className="py-2"
                        />
                      ) : (
                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                          {libraryBooks
                            .filter(book =>
                              `${book.title} ${book.author} ${book.code}`
                                .toLocaleLowerCase()
                                .includes(librarySearch.trim().toLocaleLowerCase())
                            )
                            .map(book => (
                              <button
                                type="button"
                                key={book.id}
                                onClick={() => setSelectedLibraryBook(book)}
                                aria-label={`${book.title}の詳細を開く`}
                                className="min-w-[112px] max-w-[140px] shrink-0 text-center group rounded-xl p-1 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
                              >
                                <div className="h-28 overflow-hidden bg-gradient-to-br from-indigo-50 to-slate-100 border border-indigo-100 rounded-xl mb-1.5 flex items-center justify-center text-indigo-300">
                                  {book.cover_url ? (
                                    <img src={book.cover_url} alt={`${book.title}の表紙`} loading="lazy" className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="flex flex-col items-center justify-center px-2">
                                      <BookOpen size={24} />
                                      <span className="text-[9px] font-bold mt-2">BOOK COVER</span>
                                    </div>
                                  )}
                                </div>
                                <h5 className="text-[10px] font-black line-clamp-3 text-gray-700 group-hover:text-indigo-600">
                                  {book.title}
                                </h5>
                                <p className="text-[9px] text-gray-500 line-clamp-2 mt-1">{book.author}</p>
                                <p className={`text-[9px] font-bold mt-1 ${book.status === '貸出可能' ? 'text-emerald-600' : 'text-orange-600'}`}>
                                  {book.status}
                                </p>
                                <p className="text-[8px] text-gray-400 mt-0.5">管理番号: {book.code}</p>
                                <p className="text-[8px] text-indigo-500 font-bold mt-1">タップして詳細</p>
                              </button>
                            ))}
                        </div>
                      )}
                    </>
                  )}
                </section>

                <section className={`${cardBgClass} rounded-2xl p-4 border shadow-sm`}>
                  <h3 className="text-sm font-black text-teal-600 mb-2 flex items-center"><Monitor size={18} className="mr-1.5"/> {studyRoomStatus.room_name} 空席状況</h3>
                  <div className="flex items-end justify-between mb-1.5 gap-3">
                    <span className="text-xs font-bold text-gray-500">現在の利用状況</span>
                    <span className="text-xl font-black text-gray-800">{studyRoomStatus.occupied_seats} <span className="text-xs font-bold text-gray-400">/ {studyRoomStatus.total_seats}席 利用中</span></span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${studyRoomStatus.total_seats > 0 ? Math.min(100, (studyRoomStatus.occupied_seats / studyRoomStatus.total_seats) * 100) : 0}%` }}></div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-600">空席 {Math.max(0, studyRoomStatus.total_seats - studyRoomStatus.occupied_seats)}席</span>
                    {studyRoomStatus.updated_at && <span className="text-[9px] text-gray-400">更新: {new Date(studyRoomStatus.updated_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                </section>
              </div>
            ) : facilitiesSubTab === 'lost' ? (
              <div className="space-y-4 animate-in fade-in duration-200">
                <section className={`${cardBgClass} rounded-2xl border p-4 shadow-sm space-y-3`}>
                  <div>
                    <h3 className="text-sm font-black text-amber-700">探している物の通知</h3>
                    <p className="mt-1 text-[10px] leading-5 text-gray-500">キーワードを登録すると、事務室で確認・公開された落とし物に一致した場合、このアカウントだけに通知します。</p>
                  </div>
                  <form onSubmit={handleAddLostWatch} className="flex gap-2">
                    <input value={lostWatchKeyword} onChange={event => setLostWatchKeyword(event.target.value)} maxLength={40} minLength={2} placeholder="例：黒い折りたたみ傘" className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-medium outline-none focus:border-amber-400" />
                    <button type="submit" disabled={lostWatchSaving || lostWatchKeyword.trim().length < 2} className="shrink-0 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{lostWatchSaving ? '登録中…' : '登録'}</button>
                  </form>
                  {lostWatchMessage && <p role="status" className="text-[10px] leading-4 text-gray-500">{lostWatchMessage}</p>}
                  {lostFoundWatches.length > 0 && <div className="space-y-1.5">{lostFoundWatches.map(watch => (
                    <div key={watch.id} className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-bold text-amber-900">{watch.keyword}</span>
                      <button type="button" onClick={() => void handleDeleteLostWatch(watch.id)} className="rounded-md px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-100">削除</button>
                    </div>
                  ))}</div>}
                </section>
                {/* 落とし物新規報告 */}
                <form onSubmit={handleAddLostItem} className={`${cardBgClass} rounded-2xl p-4 border shadow-sm space-y-3`}>
                  <h4 className="text-xs font-black flex items-center gap-2 text-amber-600"><AnimatedAsset name="lost-found-search" className="h-8 w-8" /> 落とし物発見の共有報告</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="品名・特徴 (例: 赤いペンケース)" value={newLostTitle} onChange={e => setNewLostTitle(e.target.value)} className="col-span-2 bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-medium outline-none" />
                    <input type="text" placeholder="拾った場所" value={newLostLocation} onChange={e => setNewLostLocation(e.target.value)} className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-medium outline-none" />
                    <input type="text" placeholder="現在の保管・預け先" value={newLostFinder} onChange={e => setNewLostFinder(e.target.value)} className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-medium outline-none" />
                    <textarea placeholder="その他詳細な特徴があれば記入してください..." value={newLostDescription} onChange={e => setNewLostDescription(e.target.value)} className="col-span-2 bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-medium outline-none h-14 resize-none" />
                  </div>
                  <button type="submit" disabled={lostSubmitting} className={`w-full py-2.5 text-white font-black text-xs rounded-xl shadow-xs disabled:opacity-60 ${themeCls.bg} ${themeCls.bgHover}`}>
                    {lostSubmitting ? 'Supabaseに保存中...' : '事務室に確認を依頼する'}
                  </button>
                </form>

                {/* リスト表示 */}
                {lostAndFoundError && (
                  <div role="alert" className="rounded-xl border border-red-200 bg-red-50"><EmptyStateIllustration kind="error-offline" caption={lostAndFoundError} className="py-2" /></div>
                )}
                <div className="space-y-2.5">
                  {lostAndFoundList.length === 0 && <EmptyStateIllustration kind="empty-lost-found" caption="共有された落とし物はまだありません。" />}
          {lostAndFoundList.map(item => (
                    <div key={item.id} className={`${cardBgClass} p-4 rounded-2xl border shadow-xs space-y-2`}>
                      <div className="flex justify-between items-start">
                        <h5 className="font-black text-sm text-gray-800">{item.title}</h5>
                        <span className={`text-[10px] ${subTextClass}`}>{item.date}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="flex items-center gap-1 bg-gray-50 p-1.5 rounded-lg text-gray-600 font-bold truncate">
                          <MapPin size={12} className="text-red-400 flex-shrink-0" />
                          <span>場所: {item.location}</span>
                        </div>
                        <div className="flex items-center gap-1 bg-blue-50 text-blue-700 p-1.5 rounded-lg font-bold truncate">
                          <CheckCircle size={12} className="flex-shrink-0" />
                          <span>保管: {item.finder}</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed pt-1.5 border-t border-gray-50">{item.description}</p>
                    </div>
                  ))}
                  {lostAndFoundList.length === 0 && !lostAndFoundError && (
                    <div className={`${cardBgClass} rounded-xl border p-4 text-center text-xs text-gray-500`}>共有された落とし物はまだありません。</div>
                  )}
                </div>
              </div>
            ) : (
              <CampusFacilityMap facilities={campusFacilities} loadMessage={campusFacilitiesMessage} />
            )}
          </div>
        );

      case 'bus':
        return (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
              <h2 className={`text-xl font-black ${activeTextClass} flex items-center gap-2`}><AnimatedAsset name="train-move" className="h-9 w-12" /> 鷹の台駅 発車案内</h2>
              <span className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-black">平日ダイヤ</span>
            </div>

            {busSubTab === 'countdown' ? (
              (() => {
                const direction = trainTimetable[selectedTrainDirection];
                const now = new Date(trainClockNow);
                const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
                let previousSeconds = -1;
                const parsed = direction.trains.map(train => {
                  let seconds = Number(train.time.slice(0, 2)) * 3600 + Number(train.time.slice(3)) * 60;
                  if (seconds < previousSeconds) seconds += 24 * 3600;
                  previousSeconds = seconds;
                  return { ...train, seconds };
                });
                const adjustedNowSeconds = nowSeconds < 5 * 3600 ? nowSeconds + 24 * 3600 : nowSeconds;
                const nextIndex = parsed.findIndex(train => train.seconds >= adjustedNowSeconds);
                const effectiveIndex = nextIndex >= 0 ? nextIndex : 0;
                const nextTrain = parsed[effectiveIndex];
                const nextTrainSeconds = nextIndex >= 0 ? nextTrain.seconds : nextTrain.seconds + 24 * 3600;
                const rawDiff = Math.max(0, nextTrainSeconds - adjustedNowSeconds);
                const hoursUntil = Math.floor(rawDiff / 3600);
                const minsUntil = Math.floor((rawDiff % 3600) / 60);
                const secondsUntil = rawDiff % 60;
                const countdownParts: string[] = [];
                if (hoursUntil > 0) countdownParts.push(`${hoursUntil}時間`);
                if (minsUntil > 0 || hoursUntil > 0) countdownParts.push(`${minsUntil}分`);
                countdownParts.push(`${secondsUntil}秒`);
                const countdownText = rawDiff <= 0
                  ? 'まもなく発車'
                  : `あと ${countdownParts.join(' ')}で発車`;
                const laterTrains = [
                  direction.trains[(effectiveIndex + 1) % direction.trains.length]?.time,
                  direction.trains[(effectiveIndex + 2) % direction.trains.length]?.time
                ];

                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-1.5 bg-gray-100 p-1 rounded-xl">
                      {(Object.values(trainTimetable) as Array<typeof TAKANODAI_TIMETABLE[keyof typeof TAKANODAI_TIMETABLE]>).map(item => (
                        <button
                          key={item.id}
                          onClick={() => setSelectedTrainDirection(item.id as 'kokubunji' | 'higashimurayama')}
                          className={`py-2.5 text-xs font-black rounded-lg transition-all ${
                            selectedTrainDirection === item.id
                              ? `${themeCls.bg} text-white shadow-sm`
                              : 'text-gray-600 hover:bg-gray-200/50'
                          }`}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>

                    <div className={`${cardBgClass} rounded-2xl p-5 border shadow-sm space-y-3.5`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="text-base font-black text-gray-800">鷹の台駅</h3>
                          <p className="text-[11px] text-gray-500 font-bold mt-0.5">{direction.destination}</p>
                        </div>
                        <span className="text-[10px] bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full font-black">
                          {nextTrain.service}
                        </span>
                      </div>

                      <div className="bg-gray-50 rounded-2xl p-4 text-center border">
                        <span className="text-xs font-bold text-gray-400 block mb-0.5">次発電車</span>
                        <span className="text-3xl font-black text-gray-900 tracking-wide">{nextTrain.time}</span>
                        <span className="text-xs font-black text-blue-600 block mt-1">🚃 {countdownText}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-center text-xs font-bold">
                        <div className="bg-gray-50 p-2 rounded-xl border">
                          <span className="text-gray-400 text-[10px] block">行き先</span>
                          <span className="text-gray-700 font-black">{direction.destination}</span>
                        </div>
                        <div className="bg-gray-50 p-2 rounded-xl border">
                          <span className="text-gray-400 text-[10px] block">次々発</span>
                          <span className="text-gray-700 font-black">{laterTrains.filter(Boolean).join(' / ')}</span>
                        </div>
                      </div>
                    </div>

                    <div className={`${cardBgClass} rounded-2xl p-4 border shadow-sm`}>
                      <h4 className="text-xs font-black text-gray-400 mb-2.5">鷹の台駅 本日の全発車時刻</h4>
                      <div className="grid grid-cols-4 gap-2">
                        {direction.trains.map(train => (
                          <div key={train.time} className="bg-gray-50 py-1.5 rounded-lg text-center border text-xs font-mono font-bold text-gray-700">
                            {train.time}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <>
                {/* 電車発車案内のみ表示。旧バス状況報告は画面から外しています。 */}
                <div className="grid grid-cols-3 gap-1.5 bg-gray-100 p-1 rounded-xl">
                  {MOCK_BUS_STATIONS.map(station => (
                    <button
                      key={station.id}
                      onClick={() => setSelectedBusStation(station.id)}
                      className={`py-2 text-xs font-black rounded-lg transition-all text-center ${
                        selectedBusStation === station.id ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-600'
                      }`}
                    >
                      {station.name.split('駅')[0]}駅便
                    </button>
                  ))}
                </div>

                <div className={`${cardBgClass} rounded-2xl p-5 border shadow-sm space-y-4 animate-in fade-in duration-200`}>
                  <h3 className="text-sm font-black flex items-center gap-1.5 text-amber-600"><AlertTriangle size={17}/> 旧交通状況のリアルタイム共有報告</h3>
                  <p className="text-xs text-gray-500 font-medium">現在この機能は停止中です。電車の発車案内は上の時刻表を確認してください。</p>

                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="text-xs font-black text-gray-400 block mb-1.5">① 現在の並び列・混雑ボリューム</label>
                      <div className="grid grid-cols-3 gap-2">
                        {['ガラ空き', '普通', '大行列・満員'].map(status => (
                          <button key={status} type="button" onClick={() => handleVoteBusCongestion(status)} className="py-2 text-xs font-bold border rounded-xl hover:bg-gray-50 transition-colors">
                            {status}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2">
                      <label className="text-xs font-black text-gray-400 block mb-1.5">② 道路渋滞等による想定遅延報告</label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[0, 5, 10, 20].map(mins => (
                          <button key={mins} type="button" onClick={() => handleReportBusDelay(mins)} className="py-2 text-xs font-mono font-bold border rounded-xl hover:bg-gray-50 transition-colors">
                            {mins === 0 ? 'オンタイム' : `+${mins}分遅れ`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        );


      case 'chat':
        return (
          <ClassChat
            authUser={authUser ? { id: authUser.id, email: authUser.email } : null}
            studentId={studentId}
            studentName={chatDisplayName.trim() || studentName}
            userClass={userClass}
            unreadCount={classChatUnreadCount}
          />
        );

      case 'club':
        return (
          <div className="space-y-4 animate-in fade-in duration-300">
            <h2 className={`text-xl font-black ${activeTextClass}`}>部活動・委員会 連絡ノート</h2>
            
            {/* 新規投稿インプットフォーム */}
            <form onSubmit={handleAddClubNote} className={`${cardBgClass} rounded-2xl p-4 border shadow-sm space-y-3`}>
              <h4 className="text-xs font-black text-purple-600 flex items-center gap-1"><Plus size={16}/> クラブ内・委員会内への新規業務・連絡投稿</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <input
                    type="text"
                    list="school-club-name-options"
                    required
                    placeholder="部活・委員会名（候補から選択）"
                    value={newClubName}
                    onChange={e => setNewClubName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2 text-xs font-bold outline-none"
                  />
                  <datalist id="school-club-name-options">
                    {SCHOOL_CLUBS.map(club => <option key={club.id} value={club.name} label={club.category} />)}
                    <option value="生徒会執行部" />
                    <option value="その他の委員会" />
                  </datalist>
                </div>
                <input type="text" required maxLength={160} placeholder="件名・タイトル" value={newClubTitle} onChange={e => setNewClubTitle(e.target.value)} className="bg-gray-50 border border-gray-200 rounded-xl p-2 text-xs font-bold outline-none" />
                <textarea required maxLength={3000} placeholder="部員へ共有する詳細スケジュールや持参物、重要連絡事項を記載..." value={newClubContent} onChange={e => setNewClubContent(e.target.value)} className="col-span-2 bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-medium outline-none h-20 resize-y" />
                <input type="text" required maxLength={50} autoComplete="nickname" placeholder="タイムラインに表示する発信者名（メールアドレスは表示されません）" value={newClubAuthorName} onChange={e => setNewClubAuthorName(e.target.value)} className="col-span-2 bg-gray-50 border border-gray-200 rounded-xl p-2 text-xs font-bold outline-none" />
                <div className="col-span-2 space-y-1">
                  <input type="password" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} autoComplete="off" placeholder="Adminから発行された8桁コード（投稿許可済みの場合は空欄）" value={newClubPermissionCode} onChange={e => setNewClubPermissionCode(e.target.value.replace(/\D/g, '').slice(0, 8))} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2 text-xs font-bold outline-none" />
                  <p className="text-[10px] leading-4 text-gray-500">Adminが投稿を許可したアカウントはコード不要です。許可されていない場合は、自分の学籍番号に対して発行された未使用コードが必要です。コードは1回のみ使用できます。</p>
                </div>
              </div>
              <button type="submit" disabled={isAddingClubNote || !authUser} className={`w-full py-2 text-white text-xs font-black rounded-xl ${themeCls.bg} ${themeCls.bgHover} shadow-xs disabled:opacity-50`}>
                {isAddingClubNote ? '投稿中…' : '連絡事項をタイムラインに掲示 (+15pt)'}
              </button>
            </form>

            {/* 連絡用タイムライン */}
            <div className="space-y-2.5">
              {clubNotes.length === 0 && <EmptyStateIllustration kind="empty-club-note" caption="部活・委員会の連絡はまだありません。" />}
          {clubNotes.map(note => (
                <div key={note.id} className={`${cardBgClass} p-4 rounded-2xl border shadow-xs space-y-2`}>
                  <div className="flex justify-between items-start">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <ClubNoteIcon clubName={note.clubName} size={40} />
                      <div className="min-w-0">
                        <span className="text-[10px] font-black bg-purple-50 text-purple-700 px-2.5 py-0.5 rounded-full inline-block mb-1">
                          {note.clubName}
                        </span>
                        <h4 className="text-sm font-black text-gray-800 leading-tight">{note.title}</h4>
                      </div>
                    </div>
                    <span className={`text-[10px] ${subTextClass}`}>{note.date}</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed bg-gray-50/50 p-2.5 rounded-xl border border-gray-100 font-medium whitespace-pre-wrap break-words">
                    {note.content}
                  </p>
                  <div className="text-right">
                    <span className="text-[10px] text-gray-400 font-bold">発信者: {note.author}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className={`text-xl font-black ${activeTextClass} px-1`}>学園総合通知</h2>
            {notificationLoadError && (
              <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold leading-5 text-rose-700">
                {notificationLoadError}
              </p>
            )}
            {notifications.length === 0 && !notificationLoadError && (
              <EmptyStateIllustration kind="empty-notifications" caption="現在、公開中のお知らせはありません。" />
            )}
            {notifications.map(note => (
              <button
                type="button"
                key={note.id}
                onClick={() => {
                  setSelectedNotification(note);
                  if (note.isRead) return;
                  setNotifications(current => current.map(item => String(item.id) === String(note.id) ? { ...item, isRead: true } : item));
                  void (async () => {
                    try {
                      const { data: sessionData } = await supabase.auth.getSession();
                      const accessToken = sessionData.session?.access_token;
                      if (!accessToken) return;
                      await fetch('/api/notifications/read', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                        body: JSON.stringify({ notificationId: String(note.id) }),
                        cache: 'no-store',
                      });
                    } catch (readError) {
                      console.warn('通知の既読状態を保存できませんでした。', readError);
                    }
                  })();
                }}
                aria-label={`通知の詳細を開く：${note.title}`}
                className={`flex w-full items-start gap-3.5 rounded-2xl border p-4 text-left transition-colors ${note.priority === 'emergency' ? 'border-rose-300 bg-rose-50 shadow-sm' : note.priority === 'important' ? 'border-amber-200 bg-amber-50/70 shadow-sm' : note.isRead ? 'border-gray-200 bg-gray-50/80 opacity-80' : 'border-blue-200 bg-white shadow-sm'} hover:border-blue-300 hover:bg-blue-50/40`}
              >
                <div className="mt-1 shrink-0">
                  {note.isRead ? (
                    <Bell size={18} className="text-gray-300" />
                  ) : (
                    <div className={`mt-1.5 h-2.5 w-2.5 rounded-full shadow-xs ${themeCls.bg} ${themeCls.shadow}`} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    {note.priority === 'emergency' && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[9px] font-black text-white">緊急</span>}
                    {note.priority === 'important' && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-black text-white">重要</span>}
                    <h4 className={`break-words text-xs leading-normal ${note.isRead ? 'font-medium text-gray-500' : 'font-black text-gray-800'}`}>{note.title}</h4>
                  </div>
                  {note.imageUrl && <img src={note.imageUrl} alt="" loading="lazy" className="mb-2 max-h-32 max-w-36 rounded-lg object-cover" />}
                  {note.body && (
                    <p className={`mb-2 whitespace-pre-wrap break-words text-[11px] leading-5 ${note.isRead ? 'text-gray-500' : 'text-gray-600'}`}>
                      {note.body.length > 120 ? `${note.body.slice(0, 120)}…` : note.body}
                    </p>
                  )}
                  <p className="text-[10px] font-medium text-gray-400">{note.time}</p>
                </div>
                <ChevronRight size={16} className="mt-1 shrink-0 text-gray-400" />
              </button>
            ))}
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className={`text-xl font-black ${activeTextClass} px-1`}>アプリケーション設定</h2>
            
            {/* プロフィール設定 */}
            <div className={`${cardBgClass} rounded-3xl p-5 border shadow-sm space-y-4`}>
              <div className="flex items-center gap-3 border-b border-gray-50 pb-3">
                <div className={`p-2 rounded-xl ${themeCls.lightBg}`}>
                  <User size={20} className={themeCls.text} />
                </div>
                <div>
                  <h3 className="text-xs font-black">生徒個人ログイン認証連携</h3>
                  <p className="text-[10px] text-gray-400 font-medium">所属クラスは1-1〜3-8から選択して保存できます</p>
                  <p className="mt-1 text-[10px] font-bold text-emerald-600">認証済み：{authUser?.email}（学籍番号 {studentId}）</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 block mb-1">氏名設定</label>
                    <input type="text" value={studentName} onChange={e => setStudentName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-black outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 block mb-1">所属クラス</label>
                    <select value={userClass} onChange={e => setUserClass(normalizeSchoolClass(e.target.value))} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-black outline-none focus:ring-2 focus:ring-blue-500/20">
                      {SCHOOL_CLASS_OPTIONS.map(classOption => (
                        <option key={classOption} value={classOption}>{classOption}組</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 block mb-1">クラスチャット表示名（任意）</label>
                  <input
                    type="text"
                    value={chatDisplayName}
                    onChange={e => setChatDisplayName(e.target.value.slice(0, 40))}
                    maxLength={40}
                    autoComplete="nickname"
                    placeholder={studentName.trim() ? '未設定なら「' + studentName.trim() + '」を使用' : 'チャットに表示する名前'}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-black outline-none"
                  />
                  <p className="mt-1 text-[10px] leading-4 text-gray-400">ここで設定した名前はクラスチャットに表示されます。空欄なら氏名設定を使用します。</p>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 block mb-1">6桁学籍番号</label>
                  <div className="relative">
                    <input type="text" inputMode="numeric" autoComplete="off" maxLength={6} value={studentId} readOnly aria-readonly="true" placeholder="学校メール認証後に自動設定" className="w-full bg-gray-100 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs font-mono font-black outline-none text-gray-600" />
                    <Lock size={13} className="absolute left-3 top-2.5 text-gray-400" />
                  </div>
                </div>

                <button
                  onClick={handleSaveProfile}
                  disabled={profileSaving || studentId.trim().length !== 6 || !studentName.trim()}
                  className={`w-full py-2.5 rounded-xl font-black text-xs border transition-colors ${
                    !profileSaving && studentId.trim().length === 6 && studentName.trim()
                      ? 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {profileSaving ? 'プロフィールを保存中...' : 'プロフィールをSupabaseに保存'}
                </button>

                <button
                  onClick={handleActivateStudentCard}
                  disabled={!authUser || profileSaving || !/^\d{6}$/.test(studentId.trim()) || !studentName.trim()}
                  className={`w-full py-3 mt-1 rounded-xl text-white font-black text-xs shadow-xs flex items-center justify-center gap-1.5 ${
                    /^\d{6}$/.test(studentId.trim()) && studentName.trim() ? `${themeCls.bg} ${themeCls.bgHover}` : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <QrCode size={15} /> デジタル生徒身分証を保存して表示 🪪
                </button>
                <button
                  type="button"
                  onClick={() => { setCardScanDone(false); setScannedStudent(null); setCardScanStatus('カメラを準備しています…'); setShowCardScanner(true); }}
                  className="w-full py-2.5 rounded-xl font-black text-xs border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
                >
                  <QrCode size={14} /> 別端末ログインQRを読み取る
                </button>
              </div>
            </div>

            {/* テーマカラーカスタム */}
            <div className={`campus-theme-settings-card ${cardBgClass} rounded-3xl p-5 border shadow-sm space-y-3`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${themeCls.lightBg}`}>
                  <Palette size={20} className={themeCls.text} />
                </div>
                <div>
                  <h3 className="text-xs font-black">推し色カラーカスタムテーマ</h3>
                  <p className="text-[10px] text-gray-400 font-medium">UIのアクセントカラーを瞬時に切り替えます</p>
                </div>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 pt-1">
                {(Object.keys(THEMES) as ThemeKey[]).map(key => {
                  const item = THEMES[key];
                  const isActive = theme === key;
                  return (
                    <button
                      key={key}
                      onClick={() => selectTheme(key)}
                      className={`flex flex-col items-center py-2 rounded-xl border transition-all ${isActive ? 'border-gray-800 bg-gray-50' : 'border-gray-100 bg-white'}`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full block mb-1 flex items-center justify-center ${item.bg} text-white`}
                        style={key === 'custom' ? { backgroundColor: customPrimaryColor } : undefined}
                      >
                        {isActive && <Check size={10} strokeWidth={3} />}
                      </span>
                      <span className="text-[8px] font-bold text-gray-500">{THEME_LABELS[key]}</span>
                    </button>
                  );
                })}
              </div>

              <div className="campus-theme-color-editor rounded-2xl border border-gray-100 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70 p-3 space-y-3">
                <div>
                  <h4 className="text-xs font-black text-gray-800 dark:text-slate-100">自由なカラー・グラデーション</h4>
                  <p className="mt-1 text-[10px] text-gray-500 dark:text-slate-400">カラーピッカーは約1,600万色を選べます。HEXコードや色名でも指定できます。</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block text-[10px] font-bold text-gray-600 dark:text-slate-300">
                    メインカラー
                    <div className="mt-1 flex gap-2">
                      <input aria-label="メインカラーを選ぶ" type="color" value={customPrimaryColor} onChange={event => { setCustomPrimaryColor(event.target.value.toUpperCase()); setTheme('custom'); }} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-gray-200 bg-white p-1" />
                      <input aria-label="色名またはHEXコード" value={themeColorInput} onChange={event => setThemeColorInput(event.target.value)} placeholder="#FF66AA / coral / 青藍" className="min-w-0 flex-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2 text-xs text-gray-800 dark:text-white" />
                    </div>
                  </label>
                  <label className="block text-[10px] font-bold text-gray-600 dark:text-slate-300">
                    グラデーションの終点
                    <input aria-label="グラデーションの終点カラー" type="color" value={customSecondaryColor} onChange={event => { setCustomSecondaryColor(event.target.value.toUpperCase()); setTheme('custom'); }} className="mt-1 block h-10 w-full cursor-pointer rounded-lg border border-gray-200 bg-white p-1" />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => {
                    const color = normalizeThemeColorInput(themeColorInput);
                    if (!color) { setThemeColorMessage('色名またはHEXコードを確認してね。例：#FF66AA、coral、青藍。'); return; }
                    setCustomPrimaryColor(color);
                    setTheme('custom');
                    setThemeColorMessage(`カラーを ${color} に変更しました。`);
                  }} className="rounded-lg px-3 py-2 text-[10px] font-black text-white bg-blue-600 hover:bg-blue-700">
                    色名・HEXを適用
                  </button>
                  <label className="flex items-center gap-2 text-[10px] font-bold text-gray-600 dark:text-slate-300">
                    <input type="checkbox" checked={customGradientEnabled} onChange={event => { setCustomGradientEnabled(event.target.checked); setTheme('custom'); }} />
                    グラデーションを有効にする
                  </label>
                </div>
                <div aria-label="カラー設定プレビュー" className="h-10 rounded-xl border border-black/10" style={{ background: customGradientEnabled ? `linear-gradient(110deg, ${customPrimaryColor}, ${customSecondaryColor})` : customPrimaryColor }} />
                {themeColorMessage && <p role="status" className="text-[10px] text-emerald-600">{themeColorMessage}</p>}
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h5 className="text-[10px] font-black text-gray-700 dark:text-slate-300">原色大辞典から選んだ色見本</h5>
                    <a href="https://www.colordic.org/colorsample" target="_blank" rel="noreferrer" className="text-[10px] font-bold underline text-blue-600">色見本一覧</a>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                    {COLOR_DIC_PRESETS.map(color => (
                      <button key={color.hex} type="button" onClick={() => {
                        setCustomPrimaryColor(color.hex);
                        setTheme('custom');
                        setThemeColorInput(color.name);
                        setThemeColorMessage(`${color.name}（${color.hex}）を適用しました。`);
                      }} title={`${color.name} ${color.hex}`} className="min-w-0 rounded-lg border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-950 p-1.5 text-left hover:scale-[1.02] transition-transform">
                        <span className="mb-1 block h-5 rounded-md border border-black/5" style={{ backgroundColor: color.hex }} />
                        <span className="block truncate text-[9px] font-bold text-gray-700 dark:text-slate-200">{color.name}</span>
                        <span className="block text-[8px] text-gray-400">{color.hex}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[9px] leading-4 text-gray-400">色名・HEX値の参考：原色大辞典（colordic.org）。サイト掲載色の一部を見本として収録しています。</p>
                </div>
              </div>

              {/* 新機能：ダークモード風切り替え */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                <span className="text-xs font-black text-gray-700">表示モード</span>
                <button
                  type="button"
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className={`p-1.5 rounded-lg border ${isDarkMode ? 'bg-slate-700 text-yellow-400 border-slate-600' : 'bg-gray-50 text-gray-500'}`}
                >
                  {isDarkMode ? <Sun size={16}/> : <Moon size={16}/>}
                </button>
              </div>
            </div>

            {/* おせっかい自動アラーム設定 */}
            <div className={`${cardBgClass} rounded-3xl p-5 border shadow-sm space-y-4`}>
              <div className="flex items-center justify-between border-b border-gray-50 pb-2.5">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${themeCls.lightBg}`}><BellRing size={20} className={themeCls.text} /></div>
                  <div>
                    <h3 className="text-xs font-black">おせっかい提出警告リマインダー</h3>
                    <p className="text-[10px] text-gray-400 font-medium">出し忘れによる減点を死守するアラートシステム</p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={remindersEnabled ? '提出期限リマインダーをオフにする' : '提出期限リマインダーをオンにする'}
                  aria-pressed={remindersEnabled}
                  disabled={!notificationSettingsLoaded}
                  onClick={toggleRemindersEnabled}
                  className={`w-10 h-6 rounded-full p-0.5 transition-colors ${remindersEnabled ? themeCls.bg : 'bg-gray-200'} disabled:opacity-50`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform shadow-xs ${remindersEnabled ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
              </div>

              {remindersEnabled && (
                <div className="space-y-3 pt-1 animate-in fade-in duration-200">
                  <div>
                    <span className="text-[10px] font-black text-gray-400 block mb-1">警告アラートのタイミング</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { key: 'twoDaysBefore', label: '2日前の 20:00' },
                        { key: 'dayBefore', label: '前日の 20:00' },
                        { key: 'morningOf', label: '当日の朝 07:00' },
                        { key: 'threeHoursBefore', label: '期限の3時間前' },
                      ].map(item => {
                        const isSelected = reminderTimes.includes(item.key);
                        return (
                          <button
                            key={item.key}
                            type="button"
                            aria-pressed={isSelected}
                            disabled={!notificationSettingsLoaded}
                            onClick={() => toggleReminderTime(item.key)}
                            className={`p-2 rounded-xl text-left border text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50 ${
                              isSelected ? `border-${theme}-300 ${themeCls.lightBg} ${themeCls.text}` : 'border-gray-100 bg-gray-50'
                            }`}
                          >
                            <span className={`w-3.5 h-3.5 rounded-sm flex items-center justify-center border text-white ${isSelected ? themeCls.bg : 'bg-white'}`}>
                              {isSelected && <Check size={9} strokeWidth={3} />}
                            </span>
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 新機能：通知除外曜日設定 */}
                  <div className="pt-1">
                    <span className="text-[10px] font-black text-gray-400 block mb-1">通知を許可する曜日フィルター</span>
                    <div className="grid grid-cols-5 gap-1">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => {
                        const isAllowed = allowedNotificationDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            aria-pressed={isAllowed}
                            disabled={!notificationSettingsLoaded}
                            onClick={() => toggleNotificationDay(day)}
                            className={`py-1 text-[10px] font-bold border rounded-lg transition-all disabled:opacity-50 ${
                              isAllowed ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-400 border-gray-200'
                            }`}
                          >
                            {day === 'Mon' ? '月' : day === 'Tue' ? '火' : day === 'Wed' ? '水' : day === 'Thu' ? '木' : '金'}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-100 space-y-3">
                    <div>
                      <span className="text-[10px] font-black text-gray-400 block mb-1">通知カテゴリごとの設定</span>
                      <p className="text-[10px] text-gray-500 mb-2">設定はSupabaseに保存されます。現時点で実際の送信に反映されるのは課題リマインダーです。他カテゴリは送信元との連携を順次追加します。</p>
                      {[
                        { key: 'todo_reminders' as NotificationCategory, label: '課題・提出期限リマインダー', description: '期限の前日・当日などの通知' },
                        { key: 'chat_messages' as NotificationCategory, label: 'クラス・学年・学校チャット', description: '新しいメッセージの通知（送信側との連携は段階的に対応）' },
                        { key: 'school_announcements' as NotificationCategory, label: '学校・先生からのお知らせ', description: '重要連絡や課題更新' },
                        { key: 'transport_alerts' as NotificationCategory, label: 'バス・電車の運行情報', description: '遅延や運行関連の通知' },
                        { key: 'cafeteria_updates' as NotificationCategory, label: '学食の更新', description: '売り切れ・メニューの更新（初期設定OFF）' },
                        { key: 'activity_updates' as NotificationCategory, label: '部活動・校内活動', description: '部活動ノートなどの更新' },
                      ].map(item => (
                        <label key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2 mb-1.5 cursor-pointer">
                          <span className="min-w-0">
                            <span className="block text-[11px] font-bold text-gray-700">{item.label}</span>
                            <span className="block text-[10px] text-gray-400">{item.description}</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={notificationSettings[item.key]}
                            disabled={!notificationSettingsLoaded}
                            onChange={() => toggleNotificationCategory(item.key)}
                            className="h-4 w-4 shrink-0 accent-blue-600"
                          />
                        </label>
                      ))}
                    </div>

                    <div className="rounded-xl border border-gray-100 p-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <span>
                          <span className="block text-[11px] font-black text-gray-700">おやすみ時間</span>
                          <span className="block text-[10px] text-gray-500">この時間内に予定された課題リマインダーは、終了時刻にずらして送ります。</span>
                        </span>
                        <input
                          aria-label="おやすみ時間を有効にする"
                          type="checkbox"
                          checked={quietHoursEnabled}
                          disabled={!notificationSettingsLoaded}
                          onChange={toggleQuietHours}
                          className="h-4 w-4 shrink-0 accent-blue-600"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="text-[10px] font-bold text-gray-600">
                          開始時刻
                          <input type="time" value={quietHoursStart} disabled={!notificationSettingsLoaded || !quietHoursEnabled} onChange={event => setQuietHoursStart(event.target.value)} onBlur={saveQuietHoursTime} className="mt-1 block w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs text-gray-800 disabled:opacity-50" />
                        </label>
                        <label className="text-[10px] font-bold text-gray-600">
                          終了時刻
                          <input type="time" value={quietHoursEnd} disabled={!notificationSettingsLoaded || !quietHoursEnabled} onChange={event => setQuietHoursEnd(event.target.value)} onBlur={saveQuietHoursTime} className="mt-1 block w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs text-gray-800 disabled:opacity-50" />
                        </label>
                      </div>
                    </div>
                    {notificationSaveStatus && <p role="status" className="text-[10px] leading-relaxed font-bold text-blue-700 bg-blue-50 rounded-xl p-2.5">{notificationSaveStatus}</p>}
                    {!notificationSettingsLoaded && <p className="text-[10px] text-gray-400">通知設定を読み込んでいます…</p>}
                  </div>

                  <div className="pt-3 border-t border-gray-100 space-y-2.5">
                    <div>
                      <h4 className="text-[11px] font-black text-gray-700">スマホ・PCへのプッシュ通知</h4>
                      <p className="text-[10px] text-gray-500 leading-relaxed mt-1">ブラウザーを閉じていても通知を受け取れるよう、この端末の通知を許可します。HTTPSとブラウザーの通知許可が必要です。</p>
                    </div>
                    {pushStatus && <p role="status" className="text-[10px] leading-relaxed font-bold text-blue-700 bg-blue-50 rounded-xl p-2.5">{pushStatus}</p>}
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => void enablePushNotifications()} disabled={pushBusy} className={`rounded-xl px-3 py-2.5 text-[10px] font-black text-white ${themeCls.bg} ${themeCls.bgHover} disabled:opacity-50`}>
                        {pushBusy ? '設定中…' : pushReady ? 'この端末の通知を再設定' : 'この端末の通知を有効化'}
                      </button>
                      <button type="button" onClick={() => void sendTestPushNotification()} disabled={!pushReady || pushBusy} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[10px] font-black text-gray-700 disabled:opacity-40">
                        テスト通知を送る
                      </button>
                    </div>
                    {!authUser && <p className="text-[10px] text-amber-700">通知を設定するには学校メールでログインしてください。</p>}
                  </div>
                </div>
              )}
            </div>

            {/* お気に入り教室のクイック設定 */}
            <div className={`${cardBgClass} rounded-3xl p-5 border shadow-sm space-y-2.5`}>
              <span className="text-xs font-black text-gray-700 block">ホーム表示用お気に入り教室設定</span>
              <div className="flex flex-wrap gap-1.5">
                {rooms.map(r => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setFavoriteRoomId(r.id);
                      try { window.localStorage.setItem('campus-sync-favorite-room-id', String(r.id)); } catch {}
                    }}
                    className={`text-[11px] px-2.5 py-1.5 rounded-xl border font-black flex items-center gap-1 transition-all ${
                      favoriteRoomId === r.id 
                        ? 'bg-yellow-500 text-white border-yellow-500' 
                        : 'bg-white text-gray-600 border-gray-200'
                    }`}
                  >
                    <Star size={11} fill={favoriteRoomId === r.id ? 'currentColor' : 'none'} />
                    {r.id === 112 ? r.name : r.name.replace('教室', '')}
                  </button>
                ))}
              </div>
            </div>

            <button type="button" onClick={() => void signOutStudent()} className="w-full py-3.5 text-xs font-black text-red-500 bg-red-50 rounded-2xl hover:bg-red-100 transition-colors">
              ログアウト
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  if (isGuestMode) {
    return <GuestPreviewApp onExit={exitGuestMode} />;
  }

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
        <div className="text-center space-y-3"><img src="/animated/loading-logo.svg" alt="" className="mx-auto h-20 w-16 max-w-full object-contain" /><p className="text-sm font-bold">CampusSyncのログイン状態を確認しています…</p></div>
      </div>
    );
  }

  if (authUser && profileSetupStatus === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6 text-white">
        <div className="space-y-3 text-center">
          <img src="/animated/loading-logo.svg" alt="" className="mx-auto h-20 w-16 max-w-full object-contain" />
          <p className="text-sm font-bold">初回プロフィールの登録状態を確認しています…</p>
        </div>
      </div>
    );
  }

  if (authUser && profileSetupStatus === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-white">
        <div className="w-full max-w-md space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-xl font-black">プロフィール登録を確認できません</h1>
          <p className="text-sm leading-6 text-slate-300">{authMessage || 'Supabaseの設定を確認してください。'}</p>
          <button type="button" onClick={() => void signOutStudent()} className="w-full rounded-xl bg-cyan-400 py-3 text-sm font-black text-slate-950">ログアウトして戻る</button>
        </div>
      </div>
    );
  }

  if (authUser && profileSetupStatus === 'required') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-4 text-white">
        <form onSubmit={completeInitialProfile} className="w-full max-w-lg space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-400/15"><CampusSyncLogo variant="mark" height={28} className="text-cyan-200" /></div>
            <h1 className="text-2xl font-black">初回プロフィール登録</h1>
            <p className="mt-2 text-xs leading-5 text-slate-300">学校メールの認証が完了しました。氏名・学年クラス・パスワードを設定してください。</p>
          </div>
          <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3">
            <p className="text-[10px] font-bold text-cyan-100">認証済み学校メール</p>
            <p className="mt-1 break-all text-sm font-black text-white">{authUser.email}</p>
            <p className="mt-1 text-[10px] text-cyan-100/80">学籍番号：{studentId}（メールアドレスから自動設定）</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="campus-sync-profile-name" className="block text-xs font-bold text-slate-200">氏名</label>
            <input id="campus-sync-profile-name" type="text" autoComplete="name" maxLength={80} required value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="学校で使用する氏名" className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-300" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="campus-sync-profile-grade" className="block text-xs font-bold text-slate-200">学年</label>
              <select id="campus-sync-profile-grade" value={profileSetupGrade} onChange={e => setProfileSetupGrade(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-300">
                <option value="1">1年</option><option value="2">2年</option><option value="3">3年</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="campus-sync-profile-class" className="block text-xs font-bold text-slate-200">クラス</label>
              <select id="campus-sync-profile-class" value={profileSetupClass} onChange={e => setProfileSetupClass(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-300">
                {Array.from({length:8},(_,index)=>String(index+1)).map(value=><option key={value} value={value}>{value}組</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="campus-sync-profile-password" className="block text-xs font-bold text-slate-200">パスワード（12文字以上）</label>
            <input id="campus-sync-profile-password" type="password" autoComplete="new-password" minLength={12} required value={profileSetupPassword} onChange={e => setProfileSetupPassword(e.target.value)} placeholder="他のサービスと異なるパスワード" className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-300" />
            <p className="text-[10px] leading-4 text-slate-400">パスワードはSupabase Authに設定します。プロフィール表や管理者向けエクスポートには保存・表示しません。</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="campus-sync-profile-password-confirm" className="block text-xs font-bold text-slate-200">パスワード（確認）</label>
            <input id="campus-sync-profile-password-confirm" type="password" autoComplete="new-password" minLength={12} required value={profileSetupPasswordConfirm} onChange={e => setProfileSetupPasswordConfirm(e.target.value)} placeholder="同じパスワードをもう一度入力" className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-300" />
          </div>
          {profileSetupMessage && <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-300/10 p-3 text-xs leading-5 text-rose-100">{profileSetupMessage}</p>}
          <button type="submit" disabled={profileSetupBusy || !studentName.trim() || profileSetupPassword.length<12 || profileSetupPassword!==profileSetupPasswordConfirm} className="w-full rounded-xl bg-cyan-400 py-3.5 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40">{profileSetupBusy ? '登録中…' : 'プロフィールとパスワードを保存する'}</button>
          <p className="text-center text-[10px] leading-4 text-slate-400">初回登録を完了するとCampusSyncを利用できます。管理者がパスワードを閲覧・書き出すことはできません。</p>
          <button type="button" onClick={() => void signOutStudent()} className="w-full py-2 text-xs font-bold text-slate-400 underline">ログアウトして後で登録する</button>
        </form>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 text-white flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-5">
          <div className="text-center space-y-2"><div className="mx-auto h-14 w-14 rounded-2xl bg-cyan-400/15 border border-cyan-300/30 flex items-center justify-center"><CampusSyncLogo variant="mark" height={28} className="text-cyan-200" /></div><h1 className="text-3xl font-black tracking-tight">Campus<span className="text-cyan-300">Sync</span></h1><p className="text-sm text-slate-300">学校メールで安全にログイン</p></div>
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl space-y-4">
            {authStep === 'email' ? (
              <>
                <div><h2 className="text-lg font-black">生徒ログイン</h2><p className="mt-1 text-xs leading-relaxed text-slate-300">@tokyo.soka.ed.jp の学校メールのみ利用できます。メールの@より前にある6桁を学籍番号として自動設定します。</p></div>
                <div className="space-y-2"><label className="block text-xs font-bold text-slate-300">学校メールアドレス</label><input type="email" autoComplete="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="123456@tokyo.soka.ed.jp" className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-300" /><p className="text-[11px] text-slate-400">例：123456@tokyo.soka.ed.jp → 学籍番号 123456</p></div>
                <button type="button" onClick={() => void requestSchoolEmailCode()} disabled={authBusy} className="w-full rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black py-3 text-sm disabled:opacity-50">{authBusy ? '送信中…' : 'メールにログインコードを送る'}</button>
                <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950/40 p-3">
                  <label htmlFor="campus-sync-login-password" className="block text-xs font-bold text-slate-300">パスワードでログイン（初回登録後）</label>
                  <input id="campus-sync-login-password" type="password" autoComplete="current-password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="設定済みのパスワード" className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-300" />
                  <button type="button" onClick={() => void signInWithSchoolPassword()} disabled={authBusy || !loginPassword} className="w-full rounded-xl border border-cyan-300/40 py-2.5 text-xs font-black text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-40">{authBusy ? 'ログイン中…' : '学校メール＋パスワードでログイン'}</button>
                </div>
                <button type="button" onClick={() => { setShowCardScanner(true); setCardScanDone(false); setScannedStudent(null); setCardScanStatus('カメラを準備しています…'); }} className="w-full rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 py-3 text-sm font-bold flex items-center justify-center gap-2"><QrCode size={17} /> 別の端末のログインQRを読み取る</button>
                <div className="space-y-3 border-t border-white/10 pt-4">
                  <div><h3 className="text-sm font-black text-white">アカウントなしでお試し</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-300">メール認証不要。CampusSyncの画面をサンプルデータで閲覧できます。</p></div>
                  <div className="space-y-1.5"><label htmlFor="campus-sync-guest-code" className="block text-xs font-bold text-slate-300">ゲストコード（90＋任意の数字4桁）</label><input id="campus-sync-guest-code" type="text" inputMode="numeric" autoComplete="off" maxLength={6} value={guestCode} onChange={e => { setGuestCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setAuthMessage(''); }} placeholder="例：901234" className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-center font-mono text-lg tracking-[0.25em] text-white outline-none focus:ring-2 focus:ring-cyan-300" /></div>
                  <button type="button" onClick={enterGuestMode} disabled={!/^90\d{4}$/.test(guestCode)} className="w-full rounded-xl border border-cyan-300/50 bg-cyan-300/10 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-40">ゲストとして閲覧する</button>
                  <p className="text-[10px] leading-relaxed text-slate-400">※これは本人確認用の認証ではありません。ゲスト画面は実データ・実際の生徒とのチャットから分離され、投稿や保存はできません。</p>
                </div>
              </>
            ) : (
              <>
                <div><h2 className="text-lg font-black">メール認証</h2><p className="mt-1 text-xs text-slate-300">{loginEmail} に届いた6桁コードを入力してください。</p></div>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={loginOtp} onChange={e => setLoginOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-center text-2xl tracking-[0.4em] font-mono text-white outline-none focus:ring-2 focus:ring-cyan-300" />
                <button type="button" onClick={() => void verifySchoolEmailCode()} disabled={authBusy} className="w-full rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black py-3 text-sm disabled:opacity-50">{authBusy ? '確認中…' : '認証してログイン'}</button>
                <button type="button" onClick={() => { setAuthStep('email'); setLoginOtp(''); setAuthMessage(''); }} className="w-full text-xs font-bold text-slate-300 underline">メールアドレスを変更する</button>
              </>
            )}
            {authMessage && <p role="status" className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-relaxed text-cyan-100">{authMessage}</p>}
          </div>
          <p className="text-center text-[11px] text-slate-400">ログイン用QRは、一回限り・短時間のみ有効です。QRを表示した端末で承認が必要です。</p>
        </div>
        {showCardScanner && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-white text-slate-900 p-5 shadow-2xl space-y-4">
              <div className="flex justify-between items-center gap-3"><div><h3 className="font-black text-base flex items-center gap-2"><AnimatedAsset name="qr-scan" className="h-9 w-9" />ログインQRを読み取る</h3><p className="text-xs text-slate-500 mt-1">QRを表示した端末で承認してもらいます。</p></div><button type="button" onClick={() => { setShowCardScanner(false); setCardScanDone(false); }} className="p-2 rounded-full bg-slate-100"><X size={18} /></button></div>
              {!cardScanDone && <div id="campus-sync-qr-reader" className="w-full overflow-hidden rounded-2xl" />}
              <p className="text-sm font-bold">{cardScanStatus}</p>
              {cardScanDone && <button type="button" onClick={() => { setCardScanDone(false); setCardScanStatus('カメラを準備しています…'); }} className="w-full rounded-xl bg-cyan-600 text-white py-3 text-sm font-black">もう一度読み取る</button>}
            </div>
          </div>
        )}
      </div>
    );
  }

  const globalSearchItems: CampusSearchItem[] = [
    ...searchableCountdownEvents.map(event => ({
      id: 'event-' + event.id,
      title: event.title,
      description: [event.event_date, event.summary].filter(Boolean).join(' ・ '),
      keywords: ['行事', 'イベント', 'カウントダウン', '学校予定'],
      tab: 'countdowns',
      kind: '学校イベント',
    })),
    ...searchableScheduleItems.map(item => ({
      id: 'schedule-' + item.id,
      title: item.title,
      description: [item.date, item.dayLabel, item.time, item.location, item.details].filter(Boolean).join(' ・ '),
      keywords: ['学校予定', '行事', '連絡', '時間', '場所'],
      tab: 'school-schedule',
      kind: '学校予定',
    })),
    ...Object.entries(timetableData).flatMap(([group, days]) =>
      Object.entries(days).flatMap(([day, slots]) =>
        slots.map(slot => ({
          id: 'timetable-' + group + '-' + day + '-' + slot.period,
          title: slot.subject,
          description: group + ' ・ ' + day + '曜日 ・ ' + slot.period + '限 ・ ' + slot.teacher,
          keywords: ['時間割', '授業', group, day, slot.teacher],
          tab: 'timetable',
          kind: '時間割',
        })),
      ),
    ),
    ...visibleTodos.map((todo: any) => ({
      id: 'todo-' + String(todo.id),
      title: String(todo.title || '課題・提出物'),
      description: [todo.details, todo.due, todo.source].filter(Boolean).join(' ・ '),
      keywords: ['課題', '提出物', '期限', '宿題'],
      tab: 'home',
      scrollTarget: 'tasks',
      kind: '課題',
    })),
    ...notifications.map(note => ({
      id: 'notice-' + String(note.id),
      title: note.title,
      description: note.body,
      keywords: ['お知らせ', '通知', note.category],
      tab: 'notifications',
      kind: note.priority === 'emergency' ? '緊急連絡' : 'お知らせ',
    })),
    ...lostAndFoundList.map(item => ({
      id: 'lost-' + String(item.id),
      title: item.title,
      description: [item.location, item.description].filter(Boolean).join(' ・ '),
      keywords: ['落とし物', '忘れ物', item.finder],
      tab: 'facilities',
      scrollTarget: 'lost',
      kind: '落とし物',
    })),
    ...campusFacilities.map(item => ({
      id: 'facility-' + item.id,
      title: item.name,
      description: [item.building, item.floor_label, item.location_description, item.description].filter(Boolean).join(' ・ '),
      keywords: item.keywords || [],
      tab: 'facilities',
      scrollTarget: 'map',
      kind: '校内施設',
    })),
    ...rooms.map(room => ({
      id: 'room-' + String(room.id),
      title: room.name,
      description: room.status + ' ・ ' + room.temp,
      keywords: ['教室', '空調', '室温'],
      tab: 'home',
      kind: '教室状況',
    })),
    ...libraryBooks.map(book => ({
      id: 'book-' + String(book.id),
      title: book.title,
      description: [book.author, book.code, book.status].filter(Boolean).join(' ・ '),
      keywords: ['図書館', '蔵書', '本'],
      tab: 'facilities',
      scrollTarget: 'status',
      kind: '蔵書',
    })),
    ...menuItems.map(item => ({
      id: 'menu-' + item.id,
      title: item.name,
      description: [item.price, item.calorie, item.allergy].filter(Boolean).join(' ・ '),
      keywords: ['学食', 'メニュー', '昼食'],
      tab: 'cafeteria',
      kind: '学食メニュー',
    })),
  ];

  const handleGlobalSearchSelect = (item: CampusSearchItem) => {
    setShowGlobalSearch(false);
    if (item.tab === 'facilities') {
      setFacilitiesSubTab(item.scrollTarget === 'lost' ? 'lost' : item.scrollTarget === 'map' ? 'map' : 'status');
    }
    if (item.scrollTarget === 'tasks') setHashScrollTarget('tasks');
    setActiveTab(item.tab);
  };

  return (
    <div data-campus-mode={isDarkMode ? 'dark' : 'light'} className={`campus-student-shell flex h-screen bg-gray-50 font-sans overflow-hidden ${isDarkMode ? 'dark bg-slate-900' : ''} ${theme === 'neon' ? 'campus-theme-neon' : theme === 'cyber' ? 'campus-theme-cyber' : ''}`}>
      
      {/* デスクトップ用 左側固定サイドバーレイアウト */}
      <aside className="campus-theme-sidebar sticky top-0 hidden h-dvh w-64 shrink-0 overflow-hidden border-r border-gray-100 bg-white shadow-xs z-30 md:flex md:flex-col">
        <div className="flex h-full min-h-0 flex-col p-5">
          <div className="mb-5 min-w-0 max-w-full shrink-0">
            <CampusSyncLogo variant="wordmark" height={30} theme="auto" />
          </div>
          <button
            type="button"
            aria-label={isDarkMode ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
            aria-pressed={isDarkMode}
            onClick={() => setIsDarkMode(current => !current)}
            className="campus-mode-switch mb-4 flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-xs font-black transition"
          >
            <span className="flex items-center gap-2">{isDarkMode ? <Sun size={16} /> : <Moon size={16} />}{isDarkMode ? 'ライトモード' : 'ダークモード'}</span>
            <span className="text-[10px] opacity-70">{isDarkMode ? 'ON' : 'OFF'}</span>
          </button>
          <nav aria-label="メインメニュー" className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1">
            <SidebarItem icon={<GlobalSearchIcon size={18} />} label="CampusSync全体検索" isActive={showGlobalSearch} onClick={() => setShowGlobalSearch(true)} themeCls={themeCls} />
            <SidebarItem icon={<Home size={18} />} label="ダッシュボード" isActive={activeTab === 'home'} onClick={() => setActiveTab('home')} themeCls={themeCls} />
            <SidebarItem icon={<Calendar size={18} />} label="時間割表" isActive={activeTab === 'timetable'} onClick={() => setActiveTab('timetable')} themeCls={themeCls} />
            <SidebarItem icon={<Calendar size={18} />} label="学校予定表" isActive={activeTab === 'school-schedule'} onClick={() => setActiveTab('school-schedule')} themeCls={themeCls} />
            <SidebarItem icon={<Clock size={18} />} label="カウントダウン" isActive={activeTab === 'countdowns'} onClick={() => setActiveTab('countdowns')} themeCls={themeCls} />
            <SidebarItem icon={<Utensils size={18} />} label="学食混雑＆レビュー" isActive={activeTab === 'cafeteria'} onClick={() => setActiveTab('cafeteria')} themeCls={themeCls} />
            <SidebarItem icon={<BookOpen size={18} />} label="校内施設＆落とし物" isActive={activeTab === 'facilities' && facilitiesSubTab !== 'map'} onClick={() => { setFacilitiesSubTab('status'); setActiveTab('facilities'); }} themeCls={themeCls} />
            <SidebarItem icon={<MapPin size={18} />} label="校内マップ" isActive={activeTab === 'facilities' && facilitiesSubTab === 'map'} onClick={() => { setFacilitiesSubTab('map'); setActiveTab('facilities'); }} themeCls={themeCls} />
            <SidebarItem icon={<Train size={18} />} label="電車発車案内" isActive={activeTab === 'bus'} onClick={() => setActiveTab('bus')} themeCls={themeCls} />
            <SidebarItem icon={<Sparkles size={18} />} label="CampusSync AI" isActive={activeTab === 'ai'} onClick={() => setActiveTab('ai')} themeCls={themeCls} />
            <SidebarItem icon={<MessageCircle size={18} />} label="クラスチャット" isActive={activeTab === 'chat'} onClick={() => { setActiveTab('chat'); setClassChatUnreadCount(0); }} badge={classChatUnreadCount > 0 ? classChatUnreadCount : undefined} themeCls={themeCls} />
            <SidebarItem icon={<MessageSquare size={18} />} label="部活・委員会ノート" isActive={activeTab === 'club'} onClick={() => setActiveTab('club')} themeCls={themeCls} />
            <SidebarItem icon={<img src="/animated/bell-ring.svg" alt="" />} label="通知・連絡" isActive={activeTab === 'notifications'} onClick={() => setActiveTab('notifications')} badge={notifications.filter(note => !note.isRead).length} themeCls={themeCls} />
            <SidebarItem icon={<Settings size={18} />} label="環境マイ設定" isActive={activeTab === 'settings'} onClick={() => setActiveTab('settings')} themeCls={themeCls} />
          </nav>
          <div className="mt-3 shrink-0 border-t pt-3 text-[10px] font-bold text-gray-400">
            <span>© 2026 CampusSync Pro</span>
          </div>
        </div>
      </aside>

      {/* メインビューポートエリア */}
      <div className={'flex-1 flex flex-col relative w-full ' + (activeTab === 'ai' ? 'max-w-none' : 'max-w-2xl mx-auto') + ' shadow-2xl md:shadow-none bg-gray-50 md:bg-transparent overflow-hidden'}>
        
        {/* モバイル用トップナビヘッダー */}
        <header className="campus-theme-mobile-header md:hidden sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-gray-100 bg-white/95 px-3 py-3 backdrop-blur-md">
          <div className="min-w-0 max-w-[68%] shrink">
            <CampusSyncLogo variant="wordmark" height={23} theme="auto" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className={`rounded-full px-2.5 py-1.5 text-[10px] font-black ${themeCls.lightBg} ${themeCls.text}`}>
              ★ {score} pt
            </div>
            <button
              type="button"
              aria-label={isDarkMode ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
              aria-pressed={isDarkMode}
              onClick={() => setIsDarkMode(current => !current)}
              className="campus-mode-switch flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition"
            >
              {isDarkMode ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button type="button" aria-label="CampusSync全体検索を開く" onClick={() => setShowGlobalSearch(true)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-700 shadow-xs transition hover:bg-slate-50">
              <GlobalSearchIcon size={20} className="h-5 w-5 shrink-0"/>
            </button>
            <button
              type="button"
              aria-label="メニューを開く"
              aria-expanded={mobileMenuOpen}
              aria-controls="campus-mobile-menu"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-95"
            >
              <Menu size={22} className="h-[22px] w-[22px] shrink-0" />
            </button>
          </div>
        </header>

        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-[80] md:hidden"
            role="presentation"
            onClick={() => setMobileMenuOpen(false)}
          >
            <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" />
            <section
              id="campus-mobile-menu"
              role="dialog"
              aria-modal="true"
              aria-label="CampusSync 全機能メニュー"
              className="absolute right-0 top-0 flex h-[100dvh] w-[min(88vw,370px)] flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl animate-in slide-in-from-right duration-200"
              onClick={event => event.stopPropagation()}
            >
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
                <div className="min-w-0">
                  <CampusSyncLogo variant="wordmark" height={26} theme="auto" />
                  <p className="mt-1 text-[9px] font-bold tracking-[0.16em] text-slate-400">ALL CAMPUS FEATURES</p>
                </div>
                <button
                  type="button"
                  aria-label="メニューを閉じる"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <X size={21} className="h-[21px] w-[21px] shrink-0" />
                </button>
              </header>
              <nav aria-label="全機能" className="campus-mobile-drawer-nav min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3">
                <SidebarItem icon={<GlobalSearchIcon size={18} />} label="CampusSync全体検索" isActive={showGlobalSearch} onClick={() => { setShowGlobalSearch(true); setMobileMenuOpen(false); }} themeCls={themeCls} />
                <SidebarItem icon={<Home size={18} />} label="ダッシュボード" isActive={activeTab === 'home'} onClick={() => { setActiveTab('home'); setMobileMenuOpen(false); }} themeCls={themeCls} />
                <SidebarItem icon={<Calendar size={18} />} label="時間割表" isActive={activeTab === 'timetable'} onClick={() => { setActiveTab('timetable'); setMobileMenuOpen(false); }} themeCls={themeCls} />
                <SidebarItem icon={<Calendar size={18} />} label="学校予定表" isActive={activeTab === 'school-schedule'} onClick={() => { setActiveTab('school-schedule'); setMobileMenuOpen(false); }} themeCls={themeCls} />
                <SidebarItem icon={<Clock size={18} />} label="カウントダウン" isActive={activeTab === 'countdowns'} onClick={() => { setActiveTab('countdowns'); setMobileMenuOpen(false); }} themeCls={themeCls} />
                <SidebarItem icon={<Utensils size={18} />} label="学食混雑＆レビュー" isActive={activeTab === 'cafeteria'} onClick={() => { setActiveTab('cafeteria'); setMobileMenuOpen(false); }} themeCls={themeCls} />
                <SidebarItem icon={<BookOpen size={18} />} label="校内施設＆落とし物" isActive={activeTab === 'facilities' && facilitiesSubTab !== 'map'} onClick={() => { setFacilitiesSubTab('status'); setActiveTab('facilities'); setMobileMenuOpen(false); }} themeCls={themeCls} />
                <SidebarItem icon={<MapPin size={18} />} label="校内マップ" isActive={activeTab === 'facilities' && facilitiesSubTab === 'map'} onClick={() => { setFacilitiesSubTab('map'); setActiveTab('facilities'); setMobileMenuOpen(false); }} themeCls={themeCls} />
                <SidebarItem icon={<Train size={18} />} label="電車発車案内" isActive={activeTab === 'bus'} onClick={() => { setActiveTab('bus'); setMobileMenuOpen(false); }} themeCls={themeCls} />
                <SidebarItem icon={<Sparkles size={18} />} label="CampusSync AI" isActive={activeTab === 'ai'} onClick={() => { setActiveTab('ai'); setMobileMenuOpen(false); }} themeCls={themeCls} />
                <SidebarItem icon={<MessageCircle size={18} />} label="クラスチャット" isActive={activeTab === 'chat'} onClick={() => { setActiveTab('chat'); setClassChatUnreadCount(0); setMobileMenuOpen(false); }} badge={classChatUnreadCount > 0 ? classChatUnreadCount : undefined} themeCls={themeCls} />
                <SidebarItem icon={<MessageSquare size={18} />} label="部活・委員会ノート" isActive={activeTab === 'club'} onClick={() => { setActiveTab('club'); setMobileMenuOpen(false); }} themeCls={themeCls} />
                <SidebarItem icon={<img src="/animated/bell-ring.svg" alt="" />} label="通知・連絡" isActive={activeTab === 'notifications'} onClick={() => { setActiveTab('notifications'); setMobileMenuOpen(false); }} badge={notifications.filter(note => !note.isRead).length} themeCls={themeCls} />
                <SidebarItem icon={<Settings size={18} />} label="環境マイ設定" isActive={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setMobileMenuOpen(false); }} themeCls={themeCls} />
              </nav>
              <footer className="shrink-0 border-t border-slate-100 px-4 py-3 text-[10px] font-bold text-slate-400">
                © 2026 CampusSync Pro
              </footer>
            </section>
          </div>
        )}


        {/* スクロールコンテンツコンテナ */}
        <main className={activeTab === 'chat' || activeTab === 'ai' ? "campus-student-main flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden pb-3 px-2 pt-2" : "campus-student-main flex-1 min-w-0 overflow-y-scroll pb-6 md:pb-8 px-3 pt-4 md:px-4 md:pt-6"}>
          <div
            key={activeTab}
            className={activeTab === 'chat' || activeTab === 'ai'
              ? 'campus-page-transition campus-page-transition--chat flex min-h-0 flex-1 flex-col'
              : 'campus-page-transition'}
          >
            {renderContent()}
          </div>
          {contributionToast && (
            <div
              role="status"
              aria-live="polite"
              className="fixed bottom-24 right-4 z-[95] flex w-80 max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-amber-200 bg-white/95 p-3 text-slate-900 shadow-xl backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-200"
            >
              <AnimatedAsset name="trophy-shine" className="h-12 w-12" />
              <div className="min-w-0">
                <p className="text-sm font-black">学校貢献度 +{contributionToast.points} pt</p>
                <p className="text-xs text-slate-600">{contributionToast.reason}</p>
              </div>
            </div>
          )}
          {authUser && activeTab === 'home' ? (
            <div className="mt-4 pb-2">
              <ContributionRankWidget points={Number(lifetimeContributionPoints ?? 0)} />
            </div>
          ) : null}
        </main>

      </div>

      {/* --- アプリケーションモーダルUIコンポーネント群 --- */}
      <CampusGlobalSearch
        open={showGlobalSearch}
        items={globalSearchItems}
        onClose={() => setShowGlobalSearch(false)}
        onSelect={handleGlobalSearchSelect}
      />

      {/* 図書室の蔵書詳細ポップアップ */}
      {selectedLibraryBook && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="library-book-modal-title"
          onClick={() => setSelectedLibraryBook(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        >
          <div onClick={e => e.stopPropagation()} className="relative w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <div>
                <p className="text-[10px] font-black tracking-wide text-indigo-500">LIBRARY BOOK DETAILS</p>
                <h3 id="library-book-modal-title" className="mt-1 text-sm font-black text-gray-800">蔵書の詳細</h3>
              </div>
              <button type="button" onClick={() => setSelectedLibraryBook(null)} aria-label="閉じる" className="rounded-full bg-gray-100 p-2 text-gray-500 hover:bg-gray-200">
                <X size={16} />
              </button>
            </div>
            <div className="p-5">
              <div className="mx-auto mb-4 h-52 w-36 overflow-hidden rounded-xl border border-gray-100 bg-gradient-to-br from-indigo-50 to-slate-100 shadow-sm flex items-center justify-center text-indigo-300">
                {selectedLibraryBook.cover_url ? (
                  <img src={selectedLibraryBook.cover_url} alt={`${selectedLibraryBook.title}の表紙`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center"><BookOpen size={36} /><span className="mt-2 text-[10px] font-bold">BOOK COVER</span></div>
                )}
              </div>
              <h4 className="text-center text-base font-black leading-relaxed text-gray-800">{selectedLibraryBook.title}</h4>
              <p className="mt-1 text-center text-xs font-bold text-gray-500">著者：{selectedLibraryBook.author || '未登録'}</p>
              <div className="mt-5 space-y-2 rounded-2xl bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-gray-400 font-bold">貸出状況</span>
                  <span className={`font-black ${selectedLibraryBook.status === '貸出可能' ? 'text-emerald-600' : 'text-orange-600'}`}>{selectedLibraryBook.status || '状況未登録'}</span>
                </div>
                <div className="flex items-start justify-between gap-3 text-xs">
                  <span className="shrink-0 text-gray-400 font-bold">管理番号</span>
                  <span className="break-all text-right font-mono font-bold text-gray-700">{selectedLibraryBook.code}</span>
                </div>
                {selectedLibraryBook.created_at && (
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-gray-400 font-bold">蔵書登録日</span>
                    <span className="font-bold text-gray-700">{new Date(selectedLibraryBook.created_at).toLocaleDateString('ja-JP')}</span>
                  </div>
                )}
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-gray-400">貸出状況や管理番号は、図書室の最新の登録情報です。</p>
              <button type="button" onClick={() => setSelectedLibraryBook(null)} className={`mt-4 w-full rounded-xl py-3 text-xs font-black text-white ${themeCls.bg} ${themeCls.bgHover}`}>詳細を閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* 📷 スマホカメラで別端末ログインQRを読み取り、本人承認後にSupabase Authへログイン */}
      {showCardScanner && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-gray-950/70 backdrop-blur-md">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-gray-900 flex items-center gap-2"><AnimatedAsset name="qr-scan" className="h-9 w-9" />別端末ログインQRを読み取る</h3>
                <p className="text-xs text-gray-500 mt-1">QRを表示した端末で承認するとログインできます。</p>
              </div>
              <button type="button" onClick={() => { setShowCardScanner(false); setCardScanDone(false); }} className="p-2 rounded-full bg-gray-100 text-gray-600" aria-label="閉じる"><X size={18} /></button>
            </div>
            {!cardScanDone && <div id="campus-sync-qr-reader" className="w-full overflow-hidden rounded-2xl" />}
            <p className="text-sm font-bold text-gray-700">{cardScanStatus}</p>
            {scannedStudent && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
                <p className="text-xs font-black text-emerald-700">有効な登録プロフィール</p>
                <p className="text-lg font-black text-gray-900">{scannedStudent.student_name}</p>
                <p className="text-sm font-bold text-gray-600">所属クラス：{scannedStudent.user_class}組</p>
              </div>
            )}
            {cardScanDone && (
              <div className="flex gap-2">
                <button type="button" onClick={() => { setScannedStudent(null); setCardScanStatus('カメラを準備しています…'); setCardScanDone(false); }} className="flex-1 rounded-xl bg-blue-600 text-white py-3 text-sm font-black">もう一度読み取る</button>
                <button type="button" onClick={() => { setShowCardScanner(false); setCardScanDone(false); }} className="flex-1 rounded-xl bg-gray-100 text-gray-800 py-3 text-sm font-black">閉じる</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🪪 デジタル学生証表示ポップアップモーダル */}
      {showIdCardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-gradient-to-tr from-gray-900 via-slate-800 to-gray-900 rounded-[28px] p-5 w-full max-w-sm border border-white/10 shadow-2xl relative overflow-hidden">
            <div className="absolute -top-32 -left-32 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex justify-between items-start mb-5 pb-3 border-b border-white/5">
              <div>
                <h3 className="text-white font-black text-base tracking-wider flex items-center gap-1.5">
                  <Sparkle size={16} className="text-yellow-400" /> 創価高等学校
                </h3>
                <p className="text-[8px] text-white/40 tracking-widest font-bold uppercase">Student Identification Card</p>
              </div>
              <button onClick={() => setShowIdCardModal(false)} className="p-1.5 bg-white/5 text-white/60 rounded-full hover:bg-white/10">
                <X size={14}/>
              </button>
            </div>

            <div className="space-y-4 relative z-10">
              <div className="flex gap-3.5">
                <div className="w-20 h-28 bg-slate-700 rounded-xl flex flex-col items-center justify-center border border-white/10 text-white/30 text-[10px] font-bold gap-1 relative overflow-hidden shadow-inner">
                  <User size={30} className="text-white/20" />
                  <span>PHOTO</span>
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-cyan-400/30 animate-pulse"></div>
                </div>

                <div className="flex-1 flex flex-col justify-between py-0.5">
                  <div>
                    <p className="text-[9px] text-white/40 font-bold uppercase mb-0.5">学年・期生所属</p>
                    <p className="text-xs font-black text-white tracking-wide">{getCohortName(studentId)} / {userClass}組</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-white/40 font-bold uppercase mb-0.5">氏名</p>
                    <p className="text-sm font-black text-white tracking-wide">{studentName}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-white/40 font-bold uppercase mb-0.5">認証管理番号</p>
                    <p className="text-xs font-mono font-bold text-white tracking-widest">{studentId}</p>
                  </div>
                </div>
              </div>

              {/* 一回限り・90秒有効の別端末ログインQR。読み取り後にこの端末で承認する */}
              <div className="bg-white rounded-xl p-4 flex flex-col items-center gap-3">
                {loginHandoffId && loginHandoffSecret && ['waiting', 'requested'].includes(loginHandoffStatus) ? (
                  <QRCodeSVG
                    value={`CAMPUSSYNC-LOGIN:${loginHandoffId}:${loginHandoffSecret}`}
                    size={188}
                    level="M"
                    includeMargin
                    bgColor="#FFFFFF"
                    fgColor="#0F172A"
                    title="CampusSync 別端末ログイン用ワンタイムQR"
                  />
                ) : (
                  <div className="py-8 text-center text-xs font-bold text-gray-500">別の端末にログインするための一回限りQRを発行します。</div>
                )}
                <p className="text-[10px] font-bold text-gray-600 text-center">QRは90秒で失効します。読み取り後、この端末で承認すると別端末にログインします。</p>
                {loginHandoffExpiresAt && ['waiting', 'requested'].includes(loginHandoffStatus) && <p className="text-[9px] text-gray-400">有効期限：{new Date(loginHandoffExpiresAt).toLocaleTimeString('ja-JP')}</p>}
                {loginHandoffMessage && <p className={`text-xs text-center font-bold ${loginHandoffStatus === 'requested' ? 'text-orange-600' : 'text-gray-600'}`}>{loginHandoffMessage}</p>}
                {loginHandoffStatus === 'requested' && (
                  <div className="w-full grid grid-cols-2 gap-2">
                    <button type="button" disabled={loginHandoffBusy} onClick={() => void decideStudentLoginHandoff('approve')} className="rounded-xl bg-emerald-600 text-white py-3 text-xs font-black disabled:opacity-50">この端末へのログインを許可</button>
                    <button type="button" disabled={loginHandoffBusy} onClick={() => void decideStudentLoginHandoff('deny')} className="rounded-xl bg-red-50 text-red-600 py-3 text-xs font-black disabled:opacity-50">拒否</button>
                  </div>
                )}
                {(!loginHandoffId || ['idle', 'expired', 'denied', 'used'].includes(loginHandoffStatus)) && (
                  <button type="button" onClick={() => void createStudentLoginHandoff()} disabled={loginHandoffBusy} className={`w-full rounded-xl py-3 text-xs font-black text-white ${themeCls.bg} ${themeCls.bgHover} disabled:opacity-50`}>
                    {loginHandoffBusy ? 'QRを発行中…' : '別の端末ログインQRを発行'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 提出物詳細ビューポップアップモーダル */}
      {showAddTodoModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            if (!isAddingTodo) setShowAddTodoModal(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-personal-todo-title"
            className="w-full max-w-lg rounded-2xl bg-white p-5 text-gray-900 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 id="add-personal-todo-title" className="text-lg font-black">
                自分の課題を追加
              </h3>
              <button
                type="button"
                disabled={isAddingTodo}
                onClick={() => setShowAddTodoModal(false)}
                className="rounded-lg px-3 py-1 text-xl text-gray-500 hover:bg-gray-100"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>

            <p className="mb-4 text-xs leading-relaxed text-gray-500">
              ここで追加した課題は自分用です。先生が登録した共通課題には影響しません。
            </p>

            <form onSubmit={handleAddPersonalTodo} className="space-y-4">
              <div>
                <label htmlFor="personal-todo-title" className="mb-1.5 block text-sm font-bold">
                  課題名 <span className="text-red-500">*</span>
                </label>
                <input
                  id="personal-todo-title"
                  type="text"
                  required
                  maxLength={150}
                  value={newTodoTitle}
                  onChange={(e) => setNewTodoTitle(e.target.value)}
                  placeholder="例：英語の単語を復習する"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label htmlFor="personal-todo-details" className="mb-1.5 block text-sm font-bold">
                  タスク詳細及び指示事項
                </label>
                <textarea
                  id="personal-todo-details"
                  rows={3}
                  maxLength={2000}
                  value={newTodoDetails}
                  onChange={(e) => setNewTodoDetails(e.target.value)}
                  placeholder="やること、準備するものなど"
                  className="w-full resize-y rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label htmlFor="personal-todo-due" className="mb-1.5 block text-sm font-bold">
                  提出期限（日付・時刻）
                </label>
                <input
                  id="personal-todo-due"
                  type="datetime-local"
                  value={newTodoDueAt}
                  onChange={(e) => setNewTodoDueAt(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <p className="mt-1.5 text-xs text-gray-500">
                  期限が決まっていなければ空欄で登録できます。
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={isAddingTodo}
                  onClick={() => setShowAddTodoModal(false)}
                  className="flex-1 rounded-xl bg-gray-100 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isAddingTodo || !newTodoTitle.trim()}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isAddingTodo ? '保存中...' : '課題を保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedTodo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-xs overflow-hidden shadow-xl">
            <div className={`p-4 ${selectedTodo.color.split(' ')[0]} bg-opacity-40 flex items-start gap-3`}>
              <div className="p-2.5 bg-white/60 rounded-xl"><selectedTodo.icon size={22} className={selectedTodo.color.split(' ')[1]} /></div>
              <div className="flex-1">
                <span className="text-[10px] font-black bg-white/80 px-2 py-0.5 rounded-md mb-1 inline-block text-gray-700">{selectedTodo.due_at ? new Date(selectedTodo.due_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : selectedTodo.due}</span>
                <h3 className="text-xs font-black text-gray-900 leading-normal">{selectedTodo.title}</h3>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <h4 className="text-[10px] font-black text-gray-400 mb-1">タスク詳細及び指示事項</h4>
                <p className="text-xs text-gray-600 leading-relaxed font-medium">{selectedTodo.details}</p>
              </div>
              {selectedTodo.isAdminAssigned ? (
                <div className="space-y-1 rounded-xl border border-blue-100 bg-blue-50 p-3">
                  <h4 className="text-[10px] font-black text-blue-700">提出期限はAdmin／先生が管理</h4>
                  <p className="text-xs leading-relaxed text-blue-700">この課題の期限は管理者が設定しています。期限の変更が必要な場合は先生に確認してください。</p>
                  {selectedTodo.classroom_coursework_id && <p className="text-[10px] text-blue-600">Google Classroom連携課題</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  <label htmlFor="todo-real-deadline" className="text-[10px] font-black text-gray-500 block">実際の提出期限（日付・時刻）</label>
                  <input id="todo-real-deadline" type="datetime-local" value={todoDueAtInput} onChange={e => setTodoDueAtInput(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-xs font-bold text-gray-800" />
                  <p className="text-[10px] leading-relaxed text-gray-400">自分で追加した個人用課題の期限を設定できます。共通課題の期限はAdmin／先生が管理します。</p>
                  <button type="button" onClick={() => void saveTodoDeadline()} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl">提出期限を保存</button>
                </div>
              )}
              <button onClick={() => setSelectedTodo(null)} className="w-full py-2.5 bg-gray-100 text-gray-700 text-xs font-black rounded-xl hover:bg-gray-200">
                詳細確認を閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* エアコン快適度状況のアップデート報告モーダル */}
      {showTempModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs">
          <div className="bg-white p-5 rounded-2xl w-full max-w-xs shadow-xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-800">エアコン室内体感の報告</h3>
              <button onClick={() => setShowTempModal(false)} className="p-1.5 bg-gray-50 rounded-full text-gray-400 hover:bg-gray-100"><X size={16}/></button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-black text-gray-400 block mb-1">報告対象の場所・教室</label>
                <select value={selectedRoomId} onChange={e => {
                  const roomId = Number(e.target.value);
                  setSelectedRoomId(roomId);
                  const room = rooms.find(r => r.id === roomId);
                  const parsedTemp = Number.parseInt(String(room?.temp ?? '25'), 10);
                  setSelectedAcTemp(Number.isFinite(parsedTemp) ? Math.max(23, Math.min(30, parsedTemp)) : 25);
                }} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold outline-none">
                  {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>

              <div>
                <label className="font-black text-gray-400 block mb-1.5">エアコンの設定温度（サイトに表示する温度）</label>
                <select value={selectedAcTemp} onChange={e => setSelectedAcTemp(Number(e.target.value))} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold outline-none">
                  {Array.from({ length: 8 }, (_, i) => i + 23).map(temp => (
                    <option key={temp} value={temp}>{temp}℃</option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] leading-relaxed text-gray-400">報告した設定温度が、教室一覧とAIの温度表示に反映されます。</p>
              </div>

              <div>
                <label className="font-black text-gray-400 block mb-1.5">現在のリアルな室内体感</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {['寒い', '快適', '暑い'].map(status => (
                    <button key={status} type="button" onClick={() => setSelectedStatus(status)} className={`py-2 text-xs font-black border rounded-xl transition-all ${selectedStatus === status ? 'border-teal-500 bg-teal-50 text-teal-600' : 'border-gray-200 text-gray-500'}`}>
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button onClick={submitAcReport} className="w-full py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-black text-xs rounded-xl shadow-md shadow-teal-100 transition-colors">
              設定温度と室内体感を報告
            </button>
          </div>
        </div>
      )}

      {selectedNotification && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="school-notification-detail-title"
          onClick={() => setSelectedNotification(null)}
        >
          <section
            className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl sm:p-6"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${themeCls.lightBg} ${themeCls.text}`}>
                <BellRing size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-[10px] font-black tracking-widest ${selectedNotification.priority === 'emergency' ? 'text-rose-700' : selectedNotification.priority === 'important' ? 'text-amber-700' : themeCls.text}`}>{selectedNotification.priority === 'emergency' ? 'CAMPUSSYNC / EMERGENCY' : 'CAMPUSSYNC / SCHOOL NOTICE'}</p>
                {selectedNotification.priority === 'emergency' && <span className="mt-1 inline-block rounded-full bg-rose-600 px-2 py-1 text-[9px] font-black text-white">緊急連絡</span>}
                {selectedNotification.priority === 'important' && <span className="mt-1 inline-block rounded-full bg-amber-500 px-2 py-1 text-[9px] font-black text-white">重要なお知らせ</span>}
                <h2 id="school-notification-detail-title" className="mt-1 break-words text-base font-black leading-6 text-gray-900">
                  {selectedNotification.title}
                </h2>
                <p className="mt-2 text-[10px] font-medium text-gray-400">{selectedNotification.time}</p>
              </div>
              <button type="button" onClick={() => setSelectedNotification(null)} aria-label="通知の詳細を閉じる" className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 max-h-[55vh] overflow-y-auto rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm leading-7 text-gray-700">
              {selectedNotification.imageUrl && <img src={selectedNotification.imageUrl} alt={selectedNotification.title} className="mb-4 max-h-72 w-full rounded-xl object-contain" />}
              <p className="whitespace-pre-wrap break-words">{selectedNotification.body || 'この通知には詳細本文が登録されていません。'}</p>
            </div>
            <button type="button" onClick={() => setSelectedNotification(null)} className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-black text-white transition ${themeCls.bg} ${themeCls.bgHover}`}>
              閉じる
            </button>
          </section>
        </div>
      )}

      {showCafeteriaAnnouncementPopup && cafeteriaAnnouncement?.show_popup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cafeteria-announcement-popup-title">
          <section className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <Utensils size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="cafeteria-announcement-popup-title" className="text-base font-black text-slate-900">学食からのお知らせ</h2>
                <p className="mt-1 text-xs text-slate-500">今日・明日のおすすめ</p>
              </div>
            </div>
            <p className="mt-4 whitespace-pre-wrap break-words rounded-2xl bg-amber-50 p-4 text-sm font-bold leading-relaxed text-amber-950">{cafeteriaAnnouncement.message}</p>
            <button type="button" onClick={() => setShowCafeteriaAnnouncementPopup(false)} className="mt-4 w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-amber-700">
              確認しました
            </button>
          </section>
        </div>
      )}

      {showCampusIntro && <CampusSyncIntro onSkip={() => setShowCampusIntro(false)} />}

    </div>
  );
}

// --- ⚙️ グローバル共通サブコンポーネントクラス群 ---

function VoteBar({ label, count, type, userVote, percent, color }: { label: string, count: number, type: string, userVote: string | null, percent: number, color: string }) {
  const isVoted = userVote === type;
  return (
    <div className="text-xs">
      <div className="flex justify-between font-bold mb-1">
        <span className="text-gray-700 flex items-center gap-1 font-black">
          <CrowdStatusIcon value={type} label={label} />{label} {isVoted && <Check size={12} className="text-blue-500 font-black"/>}
        </span>
        <span className="text-gray-400 font-bold">{count}人 <span className="text-gray-300">({percent}%)</span></span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${percent}%` }}></div>
      </div>
    </div>
  );
}

function NavItem({ icon, label, isActive, onClick, themeCls, badge }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, themeCls: any, badge?: number }) {
  return (
    <button onClick={onClick} className="relative flex flex-col items-center justify-center w-14 pt-1 gap-0.5 flex-shrink-0 [&_svg]:block [&_svg]:shrink-0 [&_img]:block [&_img]:shrink-0">
      <div className={`relative flex h-5 w-5 shrink-0 items-center justify-center transition-all [&_svg]:block [&_svg]:shrink-0 ${isActive ? `${themeCls.text} transform -translate-y-0.5` : 'text-gray-400'}`}>
        {icon}
        {badge ? <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-black text-white">{badge > 99 ? '99+' : badge}</span> : null}
      </div>
      <span className={`text-[9px] font-black transition-colors ${isActive ? themeCls.text : 'text-gray-400'}`}>
        {label}
      </span>
    </button>
  );
}

function SidebarItem({ icon, label, isActive, onClick, badge, themeCls }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, badge?: number, themeCls: any }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all text-left text-xs ${isActive ? `${themeCls.lightBg} ${themeCls.text} font-black shadow-xs` : 'text-gray-500 hover:bg-gray-50 font-bold'}`}>
      <span className="campus-nav-icon-motion flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden="true">
        {icon}
      </span>
      <span className="truncate">{label}</span>
      {badge && <span className="ml-auto bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{badge}</span>}
    </button>
  );
}