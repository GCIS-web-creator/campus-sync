'use client';


import { ContributionRankWidget } from '@/components/ContributionRanks';
import { CampusSyncLogo } from '@/components/CampusSyncLogo';
import React, { useState, useEffect, useRef } from 'react';
import {
  supabase } from '@/lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Home, CheckCircle, Clock, Monitor, Wind,
  ThermometerSun, Info, Users, Check, X,
  Plus, ChevronRight, AlertTriangle, Sparkles, Star,
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
  トマト: '#FF6347', tomato: '#FF6347',
  ディープピンク: '#FF1493', deeppink: '#FF1493',
  ホットピンク: '#FF69B4', hotpink: '#FF69B4',
  コーラル: '#FF7F50', coral: '#FF7F50',
  ラベンダー: '#E6E6FA', lavender: '#E6E6FA',
  マゼンタ: '#FF00FF', magenta: '#FF00FF',
  ドジャーブルー: '#1E90FF', dodgerblue: '#1E90FF',
  スカイブルー: '#00BFFF', skyblue: '#87CEEB',
  春緑: '#00FF7F', springgreen: '#00FF7F',
  藤色: '#C8A2C8', violet: '#EE82EE',
  サーモン: '#FA8072', salmon: '#FA8072',
  チョコレート: '#D2691E', chocolate: '#D2691E',
  ターコイズ: '#40E0D0', turquoise: '#40E0D0',
  シアン: '#00FFFF', cyan: '#00FFFF',
  ライム: '#00FF00', lime: '#00FF00',
  ゴールド: '#FFD700', gold: '#FFD700',
  青緑: '#00A497', teal: '#008080',
  群青色: '#4C6CB3',
  赤: '#FF0000', あか: '#FF0000', red: '#FF0000',
  青: '#0095D9', あお: '#0095D9', blue: '#0000FF',
  青藍: '#274A78', 群青色: '#4C6CB3', 青緑: '#00A497',
  水色: '#00BFFF', シアン: '#00FFFF', cyan: '#00FFFF',
  緑: '#008000', みどり: '#008000', green: '#008000',
  黄: '#FFFF00', 黄色: '#FFFF00', yellow: '#FFFF00',
  金: '#FFD700', ゴールド: '#FFD700', gold: '#FFD700',
  オレンジ: '#FFA500', orange: '#FFA500',
  朱色: '#FF6347', コーラル: '#FF7F50', coral: '#FF7F50',
  ピンク: '#FFC0CB', pink: '#FFC0CB',
  桜色: '#FFB7C5', 'さくら色': '#FFB7C5',
  紫: '#800080', むらさき: '#800080', purple: '#800080',
  藍色: '#4B0082', indigo: '#4B0082', ネイビー: '#000080', navy: '#000080',
  白: '#FFFFFF', しろ: '#FFFFFF', white: '#FFFFFF',
  黒: '#000000', くろ: '#000000', black: '#000000',
  灰色: '#808080', グレー: '#808080', gray: '#808080', grey: '#808080',
  茶色: '#A52A2A', brown: '#A52A2A',
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

const MOCK_NOTIFICATIONS = [
  { id: 1, title: '明日の体育はグラウンドです（熱中症対策を万全に）', time: '10分前', isRead: false },
  { id: 2, title: '図書室の新着おすすめ本が入荷しました！', time: '1時間前', isRead: false },
  { id: 3, title: '【重要】鷹の台駅の電車発車時刻について', time: '昨日', isRead: true },
  { id: 4, title: '食堂の期間限定「栄光フェス丼」メニュー開始のお知らせ', time: '昨日', isRead: true },
  { id: 5, title: '定期考査の範囲表がClassroomにアップロードされました', time: '3日前', isRead: true },
];

const MENU_ITEMS = [
  { id: 'snack', name: 'スナック（唐揚げポテト）', calorie: '450kcal', allergy: '小麦・鶏肉' },
  { id: 'soka', name: '創価ランチ（日替わりA）', calorie: '680kcal', allergy: '小麦・卵・乳' },
  { id: 'noodles', name: '情熱ラーメン / うどん', calorie: '520kcal', allergy: '小麦・大豆' },
  { id: 'curry', name: '栄光カレーライス', calorie: '710kcal', allergy: '小麦・豚肉・リンゴ' },
  { id: 'healthy', name: 'ヘルシーバリューランチ', calorie: '540kcal', allergy: 'さば・大豆・ごま' },
];

const INITIAL_LOST_AND_FOUND = [
  { id: 1, title: '青いシャープペンシル', location: '図書室', date: '今日 12:30頃', description: 'パイロット製のドクターグリップ（青）です。消しゴムのキャップがありません。', finder: '図書室カウンターに預けました' },
  { id: 2, title: '黒い折りたたみ傘', location: '食堂入口の傘立て', date: '昨日', description: '無印良品の黒い傘。持ち手に星型のシールが貼ってあります。', finder: 'まだその場に置いてあります' },
  { id: 3, title: '電子辞書 (CASIO)', location: '本館3階の渡り廊下', date: '3日前', description: '白いケースに入ったEX-wordです。起動画面に名前シールが貼ってあります。', finder: '職員室の学年主任の先生に届けました' },
];

// --- 📅 新機能：時間割データ定義 ---
const MOCK_TIMETABLE_DATA = {
  A: {
    Mon: [
      { period: 1, subject: '現代文', teacher: '佐藤 先生', room: '各教室', materials: '教科書, ノート' },
      { period: 2, subject: '数学Ⅰ', teacher: '高橋 先生', room: '各教室', materials: 'クリアー数学, 演習ノート' },
      { period: 3, subject: '英語コミュニケーション', teacher: 'Smith 先生', room: 'LL教室', materials: 'VisionQuest, 辞書' },
      { period: 4, subject: '化学基礎', teacher: '鈴木 先生', room: '化学実験室', materials: 'プリント, 実験用眼鏡' },
      { period: 5, subject: '体育', teacher: '渡辺 先生', room: '第一体育館', materials: '体操服, 体育館シューズ' },
      { period: 6, subject: '総合的な探究', teacher: '学年主任', room: '大教室', materials: 'タブレット端末' },
    ],
    Tue: [
      { period: 1, subject: '歴史総合', teacher: '田中 先生', room: '各教室', materials: '図説, ノート' },
      { period: 2, subject: '物理基礎', teacher: '小林 先生', room: '物理室', materials: '教科書, 電卓' },
      { period: 3, subject: '数学Ⅰ', teacher: '高橋 先生', room: '各教室', materials: '演習プリント' },
      { period: 4, subject: '現代文', teacher: '佐藤 先生', room: '各教室', materials: '便覧' },
      { period: 5, subject: '論理・表現', teacher: 'Brown 先生', room: '各教室', materials: 'ワークブック' },
      { period: 6, subject: '家庭基礎', teacher: '伊東 先生', room: '被服室', materials: '裁縫セット' },
    ],
    Wed: [
      { period: 1, subject: '英語コミュニケーション', teacher: 'Smith 先生', room: '各教室', materials: '教科書' },
      { period: 2, subject: '歴史総合', teacher: '田中 先生', room: '各教室', materials: 'プリント' },
      { period: 3, subject: '地理総合', teacher: '中村 先生', room: '各教室', materials: '地図帳' },
      { period: 4, subject: '生物基礎', teacher: '山本 先生', room: '生物室', materials: '教科書, ノート' },
      { period: 5, subject: '数学A', teacher: '加藤 先生', room: '各教室', materials: '青チャート' },
      { period: 6, subject: 'LHR', teacher: '担任 先生', room: '各教室', materials: '筆記用具' },
    ],
    Thu: [
      { period: 1, subject: '化学基礎', teacher: '鈴木 先生', room: '各教室', materials: '教科書' },
      { period: 2, subject: '論理・表現', teacher: 'Brown 先生', room: '各教室', materials: 'プリント' },
      { period: 3, subject: '体育', teacher: '渡辺 先生', room: 'グラウンド', materials: '体操服, 帽子' },
      { period: 4, subject: '数学A', teacher: '加藤 先生', room: '各教室', materials: 'ノート' },
      { period: 5, subject: '古典探究', teacher: '木村 先生', room: '各教室', materials: '古語辞典' },
      { period: 6, subject: '情報Ⅰ', teacher: '斉藤 先生', room: '情報処理室', materials: 'イヤホン' },
    ],
    Fri: [
      { period: 1, subject: '数学Ⅰ', teacher: '高橋 先生', room: '各教室', materials: '問題集' },
      { period: 2, subject: '古典探究', teacher: '木村 先生', room: '各教室', materials: 'ワーク' },
      { period: 3, subject: '現代文', teacher: '佐藤 先生', room: '各教室', materials: '教科書' },
      { period: 4, subject: '英語コミュニケーション', teacher: 'Smith 先生', room: '各教室', materials: '単語帳' },
      { period: 5, subject: '公共', teacher: '吉田 先生', room: '各教室', materials: '資料集' },
      { period: 6, subject: '音楽Ⅰ', teacher: '山田 先生', room: '音楽室', materials: '歌集, ファイル' },
    ]
  },
  B: {
    Mon: [
      { period: 1, subject: '数学Ⅰ', teacher: '高橋 先生', room: '各教室', materials: 'ノート' },
      { period: 2, subject: '現代文', teacher: '佐藤 先生', room: '各教室', materials: '教科書' },
      { period: 3, subject: '化学基礎', teacher: '鈴木 先生', room: '各教室', materials: 'プリント' },
      { period: 4, subject: '英語コミュニケーション', teacher: 'Smith 先生', room: '各教室', materials: '教科書' },
      { period: 5, subject: '公共', teacher: '吉田 先生', room: '各教室', materials: 'ノート' },
      { period: 6, subject: '総合的な探究', teacher: '学年主任', room: '大教室', materials: '端末' },
    ],
    // 省略のない完全コードのため各曜日を構造化して定義
    Tue: [
      { period: 1, subject: '物理基礎', teacher: '小林 先生', room: '物理室', materials: '教科書' },
      { period: 2, subject: '歴史総合', teacher: '田中 先生', room: '各教室', materials: 'ノート' },
      { period: 3, subject: '論理・表現', teacher: 'Brown 先生', room: '各教室', materials: 'ワーク' },
      { period: 4, subject: '数学Ⅰ', teacher: '高橋 先生', room: '各教室', materials: 'プリント' },
      { period: 5, subject: '家庭基礎', teacher: '伊東 先生', room: '調理室', materials: 'エプロン, 三角巾' },
      { period: 6, subject: '古典探究', teacher: '木村 先生', room: '各教室', materials: '教科書' },
    ],
    Wed: [
      { period: 1, subject: '地理総合', teacher: '中村 先生', room: '各教室', materials: '地図帳' },
      { period: 2, subject: '英語コミュニケーション', teacher: 'Smith 先生', room: '各教室', materials: 'ノート' },
      { period: 3, subject: '生物基礎', teacher: '山本 先生', room: '生物室', materials: 'プリント' },
      { period: 4, subject: '数学A', teacher: '加藤 先生', room: '各教室', materials: '教科書' },
      { period: 5, subject: '歴史総合', teacher: '田中 先生', room: '各教室', materials: '図説' },
      { period: 6, subject: 'LHR', teacher: '担任 先生', room: '各教室', materials: 'なし' },
    ],
    Thu: [
      { period: 1, subject: '体育', teacher: '渡辺 先生', room: 'グラウンド', materials: '体操服' },
      { period: 2, subject: '化学基礎', teacher: '鈴木 先生', room: '各教室', materials: 'ノート' },
      { period: 3, subject: '数学A', teacher: '加藤 先生', room: '各教室', materials: '青チャート' },
      { period: 4, subject: '論理・表現', teacher: 'Brown 先生', room: '各教室', materials: '教科書' },
      { period: 5, subject: '情報Ⅰ', teacher: '斉藤 先生', room: '情報処理室', materials: '筆記用具' },
      { period: 6, subject: '現代文', teacher: '佐藤 先生', room: '各教室', materials: 'ノート' },
    ],
    Fri: [
      { period: 1, subject: '古典探究', teacher: '木村 先生', room: '各教室', materials: '便覧' },
      { period: 2, subject: '数学Ⅰ', teacher: '高橋 先生', room: '各教室', materials: '演習プリント' },
      { period: 3, subject: '英語コミュニケーション', teacher: 'Smith 先生', room: '各教室', materials: 'ワーク' },
      { period: 4, subject: '現代文', teacher: '佐藤 先生', room: '各教室', materials: '教科書' },
      { period: 5, subject: '音楽Ⅰ', teacher: '山田 先生', room: '音楽室', materials: 'ファイル' },
      { period: 6, subject: '公共', teacher: '吉田 先生', room: '各教室', materials: 'プリント' },
    ]
  }
};

// --- 🚃 鷹の台駅：発車案内（ユーザー提供の2026年10月3日時刻表） ---
const TAKANODAI_TIMETABLE = {
  kokubunji: {
    id: 'kokubunji',
    name: '国分寺方面',
    destination: '国分寺行き',
    trains: [
    { time: '05:10', service: '各駅停車国分寺行き' },
    { time: '05:31', service: '各駅停車国分寺行き' },
    { time: '05:47', service: '各駅停車国分寺行き' },
    { time: '06:04', service: '各駅停車国分寺行き' },
    { time: '06:19', service: '各駅停車国分寺行き' },
    { time: '06:34', service: '各駅停車国分寺行き' },
    { time: '06:48', service: '各駅停車国分寺行き' },
    { time: '07:02', service: '各駅停車国分寺行き' },
    { time: '07:12', service: '各駅停車国分寺行き' },
    { time: '07:22', service: '各駅停車国分寺行き' },
    { time: '07:32', service: '各駅停車国分寺行き' },
    { time: '07:42', service: '各駅停車国分寺行き' },
    { time: '07:51', service: '各駅停車国分寺行き' },
    { time: '08:02', service: '各駅停車国分寺行き' },
    { time: '08:12', service: '各駅停車国分寺行き' },
    { time: '08:22', service: '各駅停車国分寺行き' },
    { time: '08:32', service: '各駅停車国分寺行き' },
    { time: '08:43', service: '各駅停車国分寺行き' },
    { time: '08:52', service: '各駅停車国分寺行き' },
    { time: '09:02', service: '各駅停車国分寺行き' },
    { time: '09:11', service: '各駅停車国分寺行き' },
    { time: '09:21', service: '各駅停車国分寺行き' },
    { time: '09:31', service: '各駅停車国分寺行き' },
    { time: '09:42', service: '各駅停車国分寺行き' },
    { time: '09:51', service: '各駅停車国分寺行き' },
    { time: '10:01', service: '各駅停車国分寺行き' },
    { time: '10:12', service: '各駅停車国分寺行き' },
    { time: '10:21', service: '各駅停車国分寺行き' },
    { time: '10:32', service: '各駅停車国分寺行き' },
    { time: '10:42', service: '各駅停車国分寺行き' },
    { time: '10:53', service: '各駅停車国分寺行き' },
    { time: '11:03', service: '各駅停車国分寺行き' },
    { time: '11:13', service: '各駅停車国分寺行き' },
    { time: '11:23', service: '各駅停車国分寺行き' },
    { time: '11:33', service: '各駅停車国分寺行き' },
    { time: '11:43', service: '各駅停車国分寺行き' },
    { time: '11:53', service: '各駅停車国分寺行き' },
    { time: '12:03', service: '各駅停車国分寺行き' },
    { time: '12:13', service: '各駅停車国分寺行き' },
    { time: '12:23', service: '各駅停車国分寺行き' },
    { time: '12:33', service: '各駅停車国分寺行き' },
    { time: '12:43', service: '各駅停車国分寺行き' },
    { time: '12:53', service: '各駅停車国分寺行き' },
    { time: '13:03', service: '各駅停車国分寺行き' },
    { time: '13:13', service: '各駅停車国分寺行き' },
    { time: '13:23', service: '各駅停車国分寺行き' },
    { time: '13:33', service: '各駅停車国分寺行き' },
    { time: '13:43', service: '各駅停車国分寺行き' },
    { time: '13:53', service: '各駅停車国分寺行き' },
    { time: '14:03', service: '各駅停車国分寺行き' },
    { time: '14:13', service: '各駅停車国分寺行き' },
    { time: '14:23', service: '各駅停車国分寺行き' },
    { time: '14:33', service: '各駅停車国分寺行き' },
    { time: '14:43', service: '各駅停車国分寺行き' },
    { time: '14:53', service: '各駅停車国分寺行き' },
    { time: '15:03', service: '各駅停車国分寺行き' },
    { time: '15:13', service: '各駅停車国分寺行き' },
    { time: '15:23', service: '各駅停車国分寺行き' },
    { time: '15:33', service: '各駅停車国分寺行き' },
    { time: '15:43', service: '各駅停車国分寺行き' },
    { time: '15:53', service: '各駅停車国分寺行き' },
    { time: '16:03', service: '各駅停車国分寺行き' },
    { time: '16:13', service: '各駅停車国分寺行き' },
    { time: '16:23', service: '各駅停車国分寺行き' },
    { time: '16:33', service: '各駅停車国分寺行き' },
    { time: '16:43', service: '各駅停車国分寺行き' },
    { time: '16:53', service: '各駅停車国分寺行き' },
    { time: '17:03', service: '各駅停車国分寺行き' },
    { time: '17:13', service: '各駅停車国分寺行き' },
    { time: '17:23', service: '各駅停車国分寺行き' },
    { time: '17:34', service: '各駅停車国分寺行き' },
    { time: '17:43', service: '各駅停車国分寺行き' },
    { time: '17:53', service: '各駅停車国分寺行き' },
    { time: '18:03', service: '各駅停車国分寺行き' },
    { time: '18:13', service: '各駅停車国分寺行き' },
    { time: '18:23', service: '各駅停車国分寺行き' },
    { time: '18:33', service: '各駅停車国分寺行き' },
    { time: '18:43', service: '各駅停車国分寺行き' },
    { time: '18:53', service: '各駅停車国分寺行き' },
    { time: '19:03', service: '各駅停車国分寺行き' },
    { time: '19:13', service: '各駅停車国分寺行き' },
    { time: '19:23', service: '各駅停車国分寺行き' },
    { time: '19:33', service: '各駅停車国分寺行き' },
    { time: '19:43', service: '各駅停車国分寺行き' },
    { time: '19:53', service: '各駅停車国分寺行き' },
    { time: '20:03', service: '各駅停車国分寺行き' },
    { time: '20:13', service: '各駅停車国分寺行き' },
    { time: '20:23', service: '各駅停車国分寺行き' },
    { time: '20:33', service: '各駅停車国分寺行き' },
    { time: '20:43', service: '各駅停車国分寺行き' },
    { time: '20:53', service: '各駅停車国分寺行き' },
    { time: '21:09', service: '各駅停車国分寺行き' },
    { time: '21:24', service: '各駅停車国分寺行き' },
    { time: '21:39', service: '各駅停車国分寺行き' },
    { time: '21:54', service: '各駅停車国分寺行き' },
    { time: '22:09', service: '各駅停車国分寺行き' },
    { time: '22:24', service: '各駅停車国分寺行き' },
    { time: '22:39', service: '各駅停車国分寺行き' },
    { time: '22:54', service: '各駅停車国分寺行き' },
    { time: '23:11', service: '各駅停車国分寺行き' },
    { time: '23:32', service: '各駅停車国分寺行き' },
    { time: '23:54', service: '各駅停車国分寺行き' },
  ]
  },
  higashimurayama: {
    id: 'higashimurayama',
    name: '東村山方面',
    destination: '東村山行き',
    trains: [
    { time: '05:25', service: '各駅停車東村山行き' },
    { time: '05:47', service: '各駅停車東村山行き' },
    { time: '06:04', service: '各駅停車東村山行き' },
    { time: '06:19', service: '各駅停車東村山行き' },
    { time: '06:34', service: '各駅停車東村山行き' },
    { time: '06:48', service: '各駅停車東村山行き' },
    { time: '07:07', service: '各駅停車東村山行き' },
    { time: '07:16', service: '各駅停車東村山行き' },
    { time: '07:26', service: '各駅停車東村山行き' },
    { time: '07:36', service: '各駅停車東村山行き' },
    { time: '07:46', service: '各駅停車東村山行き' },
    { time: '07:56', service: '各駅停車東村山行き' },
    { time: '08:06', service: '各駅停車東村山行き' },
    { time: '08:16', service: '各駅停車東村山行き' },
    { time: '08:26', service: '各駅停車東村山行き' },
    { time: '08:37', service: '各駅停車東村山行き' },
    { time: '08:47', service: '各駅停車東村山行き' },
    { time: '08:57', service: '各駅停車東村山行き' },
    { time: '09:06', service: '各駅停車東村山行き' },
    { time: '09:16', service: '各駅停車東村山行き' },
    { time: '09:26', service: '各駅停車東村山行き' },
    { time: '09:36', service: '各駅停車東村山行き' },
    { time: '09:46', service: '各駅停車東村山行き' },
    { time: '09:56', service: '各駅停車東村山行き' },
    { time: '10:06', service: '各駅停車東村山行き' },
    { time: '10:16', service: '各駅停車東村山行き' },
    { time: '10:26', service: '各駅停車東村山行き' },
    { time: '10:37', service: '各駅停車東村山行き' },
    { time: '10:47', service: '各駅停車東村山行き' },
    { time: '10:58', service: '各駅停車東村山行き' },
    { time: '11:08', service: '各駅停車東村山行き' },
    { time: '11:18', service: '各駅停車東村山行き' },
    { time: '11:28', service: '各駅停車東村山行き' },
    { time: '11:38', service: '各駅停車東村山行き' },
    { time: '11:48', service: '各駅停車東村山行き' },
    { time: '11:58', service: '各駅停車東村山行き' },
    { time: '12:08', service: '各駅停車東村山行き' },
    { time: '12:18', service: '各駅停車東村山行き' },
    { time: '12:28', service: '各駅停車東村山行き' },
    { time: '12:38', service: '各駅停車東村山行き' },
    { time: '12:48', service: '各駅停車東村山行き' },
    { time: '12:58', service: '各駅停車東村山行き' },
    { time: '13:08', service: '各駅停車東村山行き' },
    { time: '13:18', service: '各駅停車東村山行き' },
    { time: '13:28', service: '各駅停車東村山行き' },
    { time: '13:38', service: '各駅停車東村山行き' },
    { time: '13:48', service: '各駅停車東村山行き' },
    { time: '13:58', service: '各駅停車東村山行き' },
    { time: '14:08', service: '各駅停車東村山行き' },
    { time: '14:18', service: '各駅停車東村山行き' },
    { time: '14:28', service: '各駅停車東村山行き' },
    { time: '14:38', service: '各駅停車東村山行き' },
    { time: '14:48', service: '各駅停車東村山行き' },
    { time: '14:58', service: '各駅停車東村山行き' },
    { time: '15:08', service: '各駅停車東村山行き' },
    { time: '15:18', service: '各駅停車東村山行き' },
    { time: '15:28', service: '各駅停車東村山行き' },
    { time: '15:38', service: '各駅停車東村山行き' },
    { time: '15:48', service: '各駅停車東村山行き' },
    { time: '15:58', service: '各駅停車東村山行き' },
    { time: '16:08', service: '各駅停車東村山行き' },
    { time: '16:18', service: '各駅停車東村山行き' },
    { time: '16:28', service: '各駅停車東村山行き' },
    { time: '16:38', service: '各駅停車東村山行き' },
    { time: '16:48', service: '各駅停車東村山行き' },
    { time: '16:58', service: '各駅停車東村山行き' },
    { time: '17:08', service: '各駅停車東村山行き' },
    { time: '17:18', service: '各駅停車東村山行き' },
    { time: '17:28', service: '各駅停車東村山行き' },
    { time: '17:38', service: '各駅停車東村山行き' },
    { time: '17:48', service: '各駅停車東村山行き' },
    { time: '17:58', service: '各駅停車東村山行き' },
    { time: '18:08', service: '各駅停車東村山行き' },
    { time: '18:18', service: '各駅停車東村山行き' },
    { time: '18:28', service: '各駅停車東村山行き' },
    { time: '18:38', service: '各駅停車東村山行き' },
    { time: '18:48', service: '各駅停車東村山行き' },
    { time: '18:58', service: '各駅停車東村山行き' },
    { time: '19:08', service: '各駅停車東村山行き' },
    { time: '19:17', service: '各駅停車東村山行き' },
    { time: '19:28', service: '各駅停車東村山行き' },
    { time: '19:38', service: '各駅停車東村山行き' },
    { time: '19:48', service: '各駅停車東村山行き' },
    { time: '19:58', service: '各駅停車東村山行き' },
    { time: '20:08', service: '各駅停車東村山行き' },
    { time: '20:18', service: '各駅停車東村山行き' },
    { time: '20:28', service: '各駅停車東村山行き' },
    { time: '20:38', service: '各駅停車東村山行き' },
    { time: '20:48', service: '各駅停車東村山行き' },
    { time: '20:58', service: '各駅停車東村山行き' },
    { time: '21:09', service: '各駅停車東村山行き' },
    { time: '21:24', service: '各駅停車東村山行き' },
    { time: '21:39', service: '各駅停車東村山行き' },
    { time: '21:54', service: '各駅停車東村山行き' },
    { time: '22:09', service: '各駅停車東村山行き' },
    { time: '22:24', service: '各駅停車東村山行き' },
    { time: '22:39', service: '各駅停車東村山行き' },
    { time: '22:54', service: '各駅停車東村山行き' },
    { time: '23:11', service: '各駅停車東村山行き' },
    { time: '23:27', service: '各駅停車東村山行き' },
    { time: '23:46', service: '各駅停車東村山行き' },
    { time: '00:07', service: '各駅停車東村山行き' },
  ]
  }
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

// --- 🏸 新機能：部活動・委員会活動データ ---
const INITIAL_CLUB_NOTES = [
  { id: 1, clubName: '硬式テニス部', title: '雨天時の練習場所変更', date: '今日 14:00', content: '本日の放課後練習は雨天予報のため、オムニコートから雨天練習場（ピロティ）に変更します。トレーニングシューズを持参してください。', author: '主将 より' },
  { id: 2, clubName: '吹奏楽部', title: 'コンクール前合同合奏の案内', date: '昨日', content: '今週土曜日の午前9時より、カレッジホールにて全パート合同の通し練習を行います。チューニングを8:45までに各自終わらせておくこと。', author: '顧問 より' },
  { id: 3, clubName: '生徒会執行部', title: '文化祭パンフレット校正確認', date: '2日前', content: '各クラスの企画紹介文の最終校正データが届いています。担当委員は本日17時までに生徒会室に集まり、チェックを完了させてください。', author: '執行部書記 より' },
];

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

export default function CampusSyncApp() {
  // オープニング演出は、このページを開いた後の認証完了時に1回だけ再生する。
  // 認証ユーザーのオブジェクト更新やタブ切替では再生し直さない。
  const [showCampusIntro, setShowCampusIntro] = useState(false);
  const introStartedAtRef = useRef<number | null>(null);

  const [activeTab, setActiveTab] = useState('home');
  const [selectedTodo, setSelectedTodo] = useState<any>(null);
  const [showTempModal, setShowTempModal] = useState(false);
  const [score, setScore] = useState(65); // 本日の貢献度（0〜100）
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
  const [isDarkMode, setIsDarkMode] = useState(false);
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
    setTheme(nextTheme);
    // ネオン・サイバーは暗い表示、それ以外のプリセットに戻したら黒背景も解除。
    setIsDarkMode(nextTheme === 'neon' || nextTheme === 'cyber');
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
    } catch {}
  }, [theme, customPrimaryColor, customSecondaryColor, customGradientEnabled, isDarkMode, themeSettingsReady]);

  // --- 🔐 学校メール認証・プロフィール ---
  const [authUser, setAuthUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginOtp, setLoginOtp] = useState('');
  const [authStep, setAuthStep] = useState<'email' | 'otp'>('email');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
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
        setAuthUser(user);
        setStudentId(derivedStudentId);
        setLoginEmail(email);
      } else {
        setAuthUser(null);
        setStudentId('');
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

    // PCの通常ブラウザーとホーム画面に追加したアプリ（PWA）の両方で表示する。
    // prefers-reduced-motion が有効な端末ではアニメーションを省略する。

    // このページが開かれた後、認証完了時に1回だけ表示する。
    // Strict Modeのeffect再実行時は開始時刻を維持し、終了タイマーだけ再設定する。
    const durationMs = 6300;
    const now = Date.now();
    if (introStartedAtRef.current === null) {
      introStartedAtRef.current = now;
    }
    const elapsedMs = now - introStartedAtRef.current;
    const remainingMs = durationMs - elapsedMs;
    if (remainingMs <= 0) {
      setShowCampusIntro(false);
      return;
    }

    setShowCampusIntro(true);
    const introTimer = window.setTimeout(() => setShowCampusIntro(false), remainingMs);
    return () => window.clearTimeout(introTimer);
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
      const { data, error } = await supabase
        .from('profiles')
        .select('student_id, student_name, user_class')
        .eq('student_id', derivedStudentId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error('ログインプロフィールの取得に失敗:', error);
        setAuthMessage('ログインできましたが、プロフィールを読み込めません。profilesのSQLとRLSを確認してください。');
        return;
      }
      if (data) {
        setStudentName(data.student_name || '');
        setUserClass(normalizeSchoolClass(data.user_class));
      } else {
        setStudentName('');
        setUserClass('1-1');
      }
    })();
    return () => { cancelled = true; };
  }, [authUser]);

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
      setAuthMessage('メール認証が完了しました。プロフィールを確認してください。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String((error as any)?.message || '不明なエラー');
      setAuthMessage(`ログインできませんでした: ${message}`);
    } finally {
      setAuthBusy(false);
    }
  };

  const signOutStudent = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    setAuthUser(null);
    setStudentId('');
    setStudentName('');
    setLoginHandoffId('');
    setLoginHandoffSecret('');
    setLoginHandoffStatus('idle');
    setShowIdCardModal(false);
    setAuthStep('email');
    setAuthMessage('ログアウトしました。');
  };

  // --- ⏰ おせっかい通知リマインダー設定 ---
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderTimes, setReminderTimes] = useState<string[]>(['dayBefore', 'morningOf']);
  const [allowedNotificationDays, setAllowedNotificationDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
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
  const [facilitiesSubTab, setFacilitiesSubTab] = useState<'status' | 'lost'>('status');
  const [busSubTab] = useState<'countdown' | 'report'>('countdown');

  // タイムテーブル用状態
  const [selectedWeekType, setSelectedWeekType] = useState<'A' | 'B'>('A');
  const [selectedDay, setSelectedDay] = useState<'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri'>('Mon');
  const [timetableData, setTimetableData] = useState(MOCK_TIMETABLE_DATA);
  const [menuItems, setMenuItems] = useState(MENU_ITEMS);

  // バス用状態
  const [selectedBusStation, setSelectedBusStation] = useState<string>('hachioji');
  const [selectedTrainDirection, setSelectedTrainDirection] = useState<'kokubunji' | 'higashimurayama'>('kokubunji');
  const [trainTimetable, setTrainTimetable] = useState(TAKANODAI_TIMETABLE);
  const [trainClockNow, setTrainClockNow] = useState<number>(() => Date.now());
  const [busCongestionVote, setBusCongestionVote] = useState<Record<string, string>>({ hachioji: '普通', haijima: '空いている', akitsu: '混雑' });
  const [busDelayMinutes, setBusDelayMinutes] = useState<Record<string, number>>({ hachioji: 0, haijima: 5, akitsu: 0 });

  // 部活動用状態
  const [clubNotes, setClubNotes] = useState(INITIAL_CLUB_NOTES);
  const [newClubName, setNewClubName] = useState('');
  const [newClubTitle, setNewClubTitle] = useState('');
  const [newClubContent, setNewClubContent] = useState('');

  // 学食レビュー用状態
  const [cafeteriaReviews, setCafeteriaReviews] = useState<CafeteriaReview[]>(INITIAL_CAFETERIA_REVIEWS);
  const [selectedMenuForReview, setSelectedMenuForReview] = useState<string>('soka');
  const [newReviewRating, setNewReviewRating] = useState<number>(5);
  const [newReviewComment, setNewReviewComment] = useState('');
  const [newReviewUser, setNewReviewUser] = useState('');

  // 学食投票関係
  const [crowdVotes, setCrowdVotes] = useState({ empty: 24, normal: 85, crowded: 42 });
  const [userVote, setUserVote] = useState<'empty' | 'normal' | 'crowded' | null>(null);
  const [isVoting, setIsVoting] = useState(false);

  const [menuVotes, setMenuVotes] = useState<Record<string, { empty: number, normal: number, crowded: number }>>({
    snack: { empty: 8, normal: 22, crowded: 14 },
    soka: { empty: 2, normal: 15, crowded: 56 },
    noodles: { empty: 11, normal: 34, crowded: 12 },
    curry: { empty: 14, normal: 40, crowded: 21 },
    healthy: { empty: 25, normal: 12, crowded: 3 },
  });
  const [userMenuVotes, setUserMenuVotes] = useState<Record<string, 'empty' | 'normal' | 'crowded' | null>>({
    snack: null, soka: null, noodles: null, curry: null, healthy: null,
  });
  const [soldOutItems, setSoldOutItems] = useState<Record<string, boolean>>({
    snack: false, soka: false, noodles: false, curry: false, healthy: false,
  });

  // 落とし物関係（Supabaseに保存し、再読み込み後も共有）
  const [lostAndFoundList, setLostAndFoundList] = useState<LostAndFoundItem[]>(INITIAL_LOST_AND_FOUND);
  const [newLostTitle, setNewLostTitle] = useState('');
  const [newLostLocation, setNewLostLocation] = useState('');
  const [newLostDescription, setNewLostDescription] = useState('');
  const [newLostFinder, setNewLostFinder] = useState('');
  const [lostAndFoundError, setLostAndFoundError] = useState('');
  const [lostSubmitting, setLostSubmitting] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [scoreSaving, setScoreSaving] = useState(false);
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
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

    const savedDarkMode = window.localStorage.getItem('campus-sync-dark-mode');
    if (savedDarkMode === 'true') setIsDarkMode(true);
    else if (savedDarkMode === 'false') setIsDarkMode(false);
    if (restoredTheme === 'neon' || restoredTheme === 'cyber') setIsDarkMode(true);

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
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
          content: note.content,
          author: note.author || '匿名の投稿者',
        }))
      );
    }

    fetchStep = '学食メニュー取得（cafeteria_menu）';
    const { data: menuData, error: menuError } = await supabase
      .from('cafeteria_menu')
      .select('*')
      .eq('is_active', true)
      .order('id', { ascending: true });

    const activeMenuItems = (menuData && menuData.length > 0)
      ? menuData.map(item => ({
          id: item.id,
          name: item.name,
          calorie: item.calorie,
          allergy: item.allergy,
        }))
      : MENU_ITEMS;

    if (menuError) {
      console.error('学食メニューの取得に失敗:', menuError);
    } else if (menuData && menuData.length > 0) {
      setMenuItems(activeMenuItems);
    }

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

    fetchStep = '売切れ情報取得（cafeteria_sold_out）';
    const { data: soldOutData, error: soldOutError } = await supabase
      .from('cafeteria_sold_out')
      .select('menu_id, is_sold_out');

    if (soldOutError) {
      console.error('売り切れ情報の取得に失敗:', soldOutError);
    } else if (soldOutData) {
      const nextSoldOut: Record<string, boolean> = {
        snack: false,
        soka: false,
        noodles: false,
        curry: false,
        healthy: false,
      };

      soldOutData.forEach(row => {
        if (row.menu_id in nextSoldOut) {
          nextSoldOut[row.menu_id] = Boolean(row.is_sold_out);
        }
      });

      setSoldOutItems(nextSoldOut);
    }

    fetchStep = '学校通知取得（notifications）';
    const { data: notificationData, error: notificationError } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });

    if (notificationError) {
      console.error('学校通知の取得に失敗:', notificationError);
    } else if (notificationData) {
      setNotifications(
        notificationData.map(note => ({
          id: note.id,
          title: note.title,
          time: new Date(note.created_at).toLocaleString('ja-JP', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
          // 既読管理は後で生徒ごとに分離する。現段階では新着扱い。
          isRead: false,
        }))
      );
    }

    fetchStep = '時間割取得（timetable）';
    const { data: timetableRows, error: timetableError } = await supabase
      .from('timetable')
      .select('*')
      .order('week_type', { ascending: true })
      .order('day_of_week', { ascending: true })
      .order('period', { ascending: true });
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
      fetchStep = 'プロフィール取得（profiles）';
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('student_id, student_name, user_class')
        .eq('student_id', initialStudentId)
        .maybeSingle();

      if (profileError) {
        console.error('プロフィールの取得に失敗:', profileError);
      } else if (profileData) {
        setStudentName(profileData.student_name);
        setUserClass(normalizeSchoolClass(profileData.user_class));
      }
    }

    if (/^\d{6}$/.test(initialStudentId)) {
      fetchStep = '貢献度取得（contribution_scores）';
      const { data: scoreData, error: scoreError } = await supabase
        .from('contribution_scores')
        .select('score')
        .eq('student_id', initialStudentId)
        .maybeSingle();

      if (scoreError) {
        console.error('貢献度ポイントの取得に失敗:', scoreError);
      } else if (scoreData) {
        setScore(scoreData.score);
      } else {
        const { data: newScore, error: createScoreError } = await supabase
          .from('contribution_scores')
          .insert({ student_id: initialStudentId, score: 65 })
          .select('score')
          .single();

        if (createScoreError) {
          console.error('貢献度ポイントの初期登録に失敗:', createScoreError);
        } else if (newScore) {
          setScore(newScore.score);
        }
      }
    }

    if (timetableError) {
      console.error('時間割の取得に失敗:', timetableError);
    } else if (timetableRows && timetableRows.length > 0) {
      const nextTimetable = {
        A: { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [] },
        B: { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [] },
      } as typeof MOCK_TIMETABLE_DATA;

      timetableRows.forEach(row => {
        const weekKey = row.week_type as 'A' | 'B';
        const dayKey = row.day_of_week as 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri';
        nextTimetable[weekKey][dayKey].push({
          period: row.period,
          subject: row.subject,
          teacher: row.teacher,
          room: row.room,
          materials: row.materials,
        });
      });

      setTimetableData(nextTimetable);
    }
    } catch (unexpectedError) {
      console.error('Supabase共有データ取得中に例外が発生しました:', {
        step: fetchStep,
        error: unexpectedError,
      });
    }
  };

  fetchSharedData();
}, []);

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

  const toggleSoldOut = async (menuId: string) => {
    const wasSoldOut = soldOutItems[menuId];
    const nextSoldOut = !wasSoldOut;

    const { error } = await supabase
      .from('cafeteria_sold_out')
      .upsert(
        {
          menu_id: menuId,
          is_sold_out: nextSoldOut,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'menu_id' }
      );

    if (error) {
      console.error('売り切れ情報の保存に失敗:', error);
      alert('売り切れ情報の保存に失敗しました。');
      return;
    }

    setSoldOutItems(prev => ({ ...prev, [menuId]: nextSoldOut }));

    if (nextSoldOut) {
      void updateContribution(10, '学食メニューの売り切れを報告');
      alert(`「${menuItems.find(i => i.id === menuId)?.name}」の売り切れ報告を共有しました。貢献度+10pt！🎉`);
    } else {
      void updateContribution(-10, '学食メニューの売り切れ報告を取り消し');
      alert(`「${menuItems.find(i => i.id === menuId)?.name}」を販売中に戻しました。`);
    }
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
        .insert({
          title,
          location,
          description,
          finder,
          // 日時はSupabaseの created_at default now() に任せる
        })
        .select('*')
        .single();

      if (error) throw error;
      if (!data) throw new Error('保存したデータが返されませんでした。');

      setLostAndFoundList(prev => [normalizeLostAndFoundRow(data), ...prev]);
      void updateContribution(12, '落とし物情報を共有');
      setNewLostTitle('');
      setNewLostLocation('');
      setNewLostDescription('');
      setNewLostFinder('');
      alert('落とし物情報をSupabaseに保存して共有しました！貢献度+12pt！🎁');
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
    if (!newClubName.trim() || !newClubTitle.trim() || !newClubContent.trim()) {
      alert("すべての項目を入力してください。");
      return;
    }

    const noteToInsert = {
      club_name: newClubName.trim(),
      title: newClubTitle.trim(),
      content: newClubContent.trim(),
      author: studentName.trim() ? `${studentName.trim()} より` : '匿名の投稿者',
    };

    const { data, error } = await supabase
      .from('club_notes')
      .insert(noteToInsert)
      .select()
      .single();

    if (error) {
      console.error('部活・委員会ノートの保存に失敗:', error);
      alert('部活・委員会ノートの保存に失敗しました。');
      return;
    }

    if (data) {
      const newNote = {
        id: data.id,
        clubName: data.club_name,
        title: data.title,
        date: new Date(data.created_at).toLocaleString('ja-JP', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        content: data.content,
        author: data.author || '匿名の投稿者',
      };

      setClubNotes(prev => [newNote, ...prev]);
    }

    void updateContribution(15, '部活・委員会ノートを投稿');
    setNewClubName('');
    setNewClubTitle('');
    setNewClubContent('');
    alert("部活動・委員会連絡ノートに新規書き込みを行いました！貢献度+15pt！🏸");
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
  ) => {
    if (!authUser || !/^\d{6}$/.test(studentId)) throw new Error('学校メールでログインしてください。');
    const { error } = await supabase.from('push_reminder_preferences').upsert({
      user_id: authUser.id,
      student_id: studentId,
      reminders_enabled: enabled,
      reminder_times: times,
      allowed_days: days,
      timezone: 'Asia/Tokyo',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
  };

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
      await savePushReminderPreferences(remindersEnabled, reminderTimes, allowedNotificationDays);
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

  const toggleRemindersEnabled = () => {
    const next = !remindersEnabled;
    setRemindersEnabled(next);
    if (pushReady) void savePushReminderPreferences(next, reminderTimes, allowedNotificationDays)
      .catch(error => setPushStatus(`通知設定の保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`));
  };

  const toggleReminderTime = (timeKey: string) => {
    const next = reminderTimes.includes(timeKey)
      ? reminderTimes.filter(t => t !== timeKey)
      : [...reminderTimes, timeKey];
    setReminderTimes(next);
    if (pushReady) void savePushReminderPreferences(remindersEnabled, next, allowedNotificationDays)
      .catch(error => setPushStatus(`通知設定の保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`));
  };

  const toggleNotificationDay = (dayKey: string) => {
    const next = allowedNotificationDays.includes(dayKey)
      ? allowedNotificationDays.filter(d => d !== dayKey)
      : [...allowedNotificationDays, dayKey];
    setAllowedNotificationDays(next);
    if (pushReady) void savePushReminderPreferences(remindersEnabled, reminderTimes, next)
      .catch(error => setPushStatus(`通知設定の保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`));
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
      const { error } = await supabase
        .from('profiles')
        .upsert({
          student_id: cleanStudentId,
          student_name: cleanStudentName,
          user_class: userClass,
          email,
          auth_user_id: authUser.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'student_id' });

      if (error) throw error;
      setStudentId(cleanStudentId);
      setStudentName(cleanStudentName);
      alert('プロフィールを保存しました！');
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

    const { data: current, error: fetchError } = await supabase
      .from('contribution_scores')
      .select('score')
      .eq('student_id', cleanStudentId)
      .maybeSingle();

    if (fetchError) {
      console.error('貢献度ポイントの取得に失敗:', fetchError);
      setScoreSaving(false);
      return;
    }

    const currentScore = current?.score ?? 65;
    const nextScore = Math.max(0, Math.min(currentScore + delta, 100));

    const { error: scoreError } = await supabase
      .from('contribution_scores')
      .upsert(
        {
          student_id: cleanStudentId,
          score: nextScore,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'student_id' }
      );

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
      case 'home':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
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
              <p className="text-[10px] text-white/70 mt-2 text-right">※情報を報告したりタスクを完了するとポイントが貯まります</p>
            </div>

            {/* クイックリンク・本日のショートカット */}
            <div className="grid grid-cols-3 gap-2">
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
            </div>

            {/* TODOセクション */}
            <section>
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

      case 'timetable':
        return (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
              <h2 className={`text-xl font-black ${activeTextClass}`}>時間割スケジュール</h2>
              {/* A週B週セレクター */}
              <div className="bg-gray-200/80 p-1 rounded-xl flex gap-1 text-xs font-bold">
                <button 
                  onClick={() => setSelectedWeekType('A')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${selectedWeekType === 'A' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
                >
                  A週ダイヤ
                </button>
                <button 
                  onClick={() => setSelectedWeekType('B')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${selectedWeekType === 'B' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
                >
                  B週ダイヤ
                </button>
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
              {timetableData[selectedWeekType][selectedDay].length === 0 ? (
                <EmptyStateIllustration kind="empty-no-class" caption="選択した曜日の授業はありません。" />
              ) : timetableData[selectedWeekType][selectedDay].map((slot) => (
                <div key={slot.period} className={`${cardBgClass} p-4 rounded-2xl border shadow-sm flex items-center gap-4`}>
                  <div className={`w-9 h-9 rounded-xl ${themeCls.lightBg} flex flex-col items-center justify-center font-black ${themeCls.text} text-sm flex-shrink-0`}>
                    {slot.period}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <h4 className="text-sm font-black text-gray-800 tracking-wide">{slot.subject}</h4>
                      <span className={`text-[11px] font-bold ${subTextClass}`}>{slot.teacher}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-gray-500 font-medium">
                      <span className="flex items-center gap-0.5"><MapPin size={12} /> {getSchoolRoomDisplay(slot.room, userClass)}</span>
                      <span className="flex items-center gap-0.5"><BookOpenCheck size={12} /> 持参: {slot.materials}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-blue-50/60 p-3.5 rounded-2xl border border-blue-100/50 text-blue-800 text-xs flex gap-2">
              <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed">時間割データは学年別マスターデータと同期しています。特設授業や考査期間等の特別ダイヤは自動的に優先反映されます。</p>
            </div>
          </div>
        );

      case 'cafeteria':
        return (
          <div className="space-y-4 animate-in fade-in duration-300">
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
                {menuItems.map(item => {
                  const isSoldOut = soldOutItems[item.id];
                  const votes = menuVotes[item.id];
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
                          <p className="text-[10px] text-gray-400 font-bold">成分: {item.calorie} | アレルギー: {item.allergy}</p>
                        </div>
                        <button
                          onClick={() => toggleSoldOut(item.id)}
                          className={`text-[10px] font-black px-2.5 py-1.5 rounded-xl border transition-all z-20 ${
                            isSoldOut ? 'bg-red-100 border-red-200 text-red-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-red-50'
                          }`}
                        >
                          {isSoldOut ? '販売中に戻す' : '売り切れを報告'}
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
                          {MENU_ITEMS.find(m => m.id === rev.menuId)?.name.split('（')[0]}
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
            ) : (
              <div className="space-y-4 animate-in fade-in duration-200">
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
                    {lostSubmitting ? 'Supabaseに保存中...' : '掲示板に登録して学校貢献度を獲得'}
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
            )}
          </div>
        );

      case 'bus':
        return (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
              <h2 className={`text-xl font-black ${activeTextClass} flex items-center gap-2`}><AnimatedAsset name="train-move" className="h-9 w-12" /> 鷹の台駅 発車案内</h2>
              <span className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-black">電車時刻表</span>
            </div>

            {busSubTab === 'countdown' ? (
              (() => {
                const direction = trainTimetable[selectedTrainDirection];
                const now = new Date(trainClockNow);
                const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
                const parsed = direction.trains.map(train => ({
                  ...train,
                  seconds: Number(train.time.slice(0, 2)) * 3600 + Number(train.time.slice(3)) * 60
                }));
                const nextIndex = parsed.findIndex(train => train.seconds >= nowSeconds);
                const effectiveIndex = nextIndex >= 0 ? nextIndex : 0;
                const nextTrain = parsed[effectiveIndex];
                const rawDiff = nextIndex >= 0
                  ? nextTrain.seconds - nowSeconds
                  : (24 * 3600 - nowSeconds) + nextTrain.seconds;
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


      case 'club':
        return (
          <div className="space-y-4 animate-in fade-in duration-300">
            <h2 className={`text-xl font-black ${activeTextClass}`}>部活動・委員会 連絡ノート</h2>
            
            {/* 新規投稿インプットフォーム */}
            <form onSubmit={handleAddClubNote} className={`${cardBgClass} rounded-2xl p-4 border shadow-sm space-y-3`}>
              <h4 className="text-xs font-black text-purple-600 flex items-center gap-1"><Plus size={16}/> クラブ内・委員会内への新規業務・連絡投稿</h4>
              <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="部活・委員会名 (例: 男子バドミントン部)" value={newClubName} onChange={e => setNewClubName(e.target.value)} className="bg-gray-50 border border-gray-200 rounded-xl p-2 text-xs font-bold outline-none" />
                <input type="text" placeholder="件名・タイトル" value={newClubTitle} onChange={e => setNewClubTitle(e.target.value)} className="bg-gray-50 border border-gray-200 rounded-xl p-2 text-xs font-bold outline-none" />
                <textarea placeholder="部員へ共有する詳細スケジュールや持参物、重要連絡事項を記載..." value={newClubContent} onChange={e => setNewClubContent(e.target.value)} className="col-span-2 bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-medium outline-none h-16 resize-none" />
              </div>
              <button type="submit" className={`w-full py-2 text-white text-xs font-black rounded-xl ${themeCls.bg} ${themeCls.bgHover} shadow-xs`}>
                連絡事項をタイムラインに掲示 (+15pt)
              </button>
            </form>

            {/* 連絡用タイムライン */}
            <div className="space-y-2.5">
              {clubNotes.length === 0 && <EmptyStateIllustration kind="empty-club-note" caption="部活・委員会の連絡はまだありません。" />}
          {clubNotes.map(note => (
                <div key={note.id} className={`${cardBgClass} p-4 rounded-2xl border shadow-xs space-y-2`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-black bg-purple-50 text-purple-700 px-2.5 py-0.5 rounded-full inline-block mb-1">
                        {note.clubName}
                      </span>
                      <h4 className="text-sm font-black text-gray-800 leading-tight">{note.title}</h4>
                    </div>
                    <span className={`text-[10px] ${subTextClass}`}>{note.date}</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed bg-gray-50/50 p-2.5 rounded-xl border border-gray-100 font-medium">
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
            {notifications.length === 0 && <EmptyStateIllustration kind="empty-notifications" caption="新しい通知はありません。" />}
          {notifications.map(note => (
              <div key={note.id} className={`p-4 rounded-2xl border ${note.isRead ? 'bg-transparent border-gray-200' : 'bg-white border-blue-200 shadow-sm'} flex gap-3.5 items-start`}>
                <div className="mt-1">
                  {note.isRead ? (
                    <Bell size={18} className="text-gray-300"/>
                  ) : (
                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shadow-xs ${themeCls.bg} ${themeCls.shadow}`}></div>
                  )}
                </div>
                <div>
                  <h4 className={`text-xs leading-normal mb-1 ${note.isRead ? 'text-gray-500 font-medium' : 'text-gray-800 font-black'}`}>{note.title}</h4>
                  <p className="text-[10px] text-gray-400 font-medium">{note.time}</p>
                </div>
              </div>
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
            <div className={`${cardBgClass} rounded-3xl p-5 border shadow-sm space-y-3`}>
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

              <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70 p-3 space-y-3">
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
                <span className="text-xs font-black text-gray-700">ダークテーマ（省電力表示モード）</span>
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
                  onClick={toggleRemindersEnabled}
                  className={`w-10 h-6 rounded-full p-0.5 transition-colors ${remindersEnabled ? themeCls.bg : 'bg-gray-200'}`}
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
                            onClick={() => toggleReminderTime(item.key)}
                            className={`p-2 rounded-xl text-left border text-xs font-bold transition-all flex items-center gap-2 ${
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
                            onClick={() => toggleNotificationDay(day)}
                            className={`py-1 text-[10px] font-bold border rounded-lg transition-all ${
                              isAllowed ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-400 border-gray-200'
                            }`}
                          >
                            {day === 'Mon' ? '月' : day === 'Tue' ? '火' : day === 'Wed' ? '水' : day === 'Thu' ? '木' : '金'}
                          </button>
                        );
                      })}
                    </div>
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

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
        <div className="text-center space-y-3"><img src="/animated/loading-logo.svg" alt="" className="mx-auto h-20 w-16 max-w-full object-contain" /><p className="text-sm font-bold">CampusSyncのログイン状態を確認しています…</p></div>
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
                <button type="button" onClick={() => { setShowCardScanner(true); setCardScanDone(false); setScannedStudent(null); setCardScanStatus('カメラを準備しています…'); }} className="w-full rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 py-3 text-sm font-bold flex items-center justify-center gap-2"><QrCode size={17} /> 別の端末のログインQRを読み取る</button>
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

  return (
    <div className={`flex h-screen bg-gray-50 font-sans overflow-hidden ${isDarkMode ? 'dark bg-slate-900' : ''} ${theme === 'neon' ? 'campus-theme-neon' : theme === 'cyber' ? 'campus-theme-cyber' : ''}`}>
      
      {/* デスクトップ用 左側固定サイドバーレイアウト */}
      <aside className="campus-theme-sidebar hidden md:flex flex-col w-64 bg-white border-r border-gray-100 shadow-xs z-30 relative">
        <div className="p-5 flex flex-col h-full justify-between">
          <div>
            <div className="mb-6 min-w-0 max-w-full">
              <CampusSyncLogo variant="wordmark" height={30} theme="auto" />
            </div>
            <nav className="space-y-1">
              <SidebarItem icon={<Home size={18} />} label="ダッシュボード" isActive={activeTab === 'home'} onClick={() => setActiveTab('home')} themeCls={themeCls} />
              <SidebarItem icon={<Calendar size={18} />} label="時間割表" isActive={activeTab === 'timetable'} onClick={() => setActiveTab('timetable')} themeCls={themeCls} />
              <SidebarItem icon={<Utensils size={18} />} label="学食混雑＆レビュー" isActive={activeTab === 'cafeteria'} onClick={() => setActiveTab('cafeteria')} themeCls={themeCls} />
              <SidebarItem icon={<BookOpen size={18} />} label="校内施設＆落とし物" isActive={activeTab === 'facilities'} onClick={() => setActiveTab('facilities')} themeCls={themeCls} />
              <SidebarItem icon={<Train size={18} />} label="電車発車案内" isActive={activeTab === 'bus'} onClick={() => setActiveTab('bus')} themeCls={themeCls} />
              <SidebarItem icon={<MessageSquare size={18} />} label="部活・委員会ノート" isActive={activeTab === 'club'} onClick={() => setActiveTab('club')} themeCls={themeCls} />
              <SidebarItem icon={<img src="/animated/bell-ring.svg" alt="" className="h-[18px] w-[18px] shrink-0 object-contain" />} label="通知・連絡" isActive={activeTab === 'notifications'} onClick={() => setActiveTab('notifications')} badge={3} themeCls={themeCls} />
              <SidebarItem icon={<Settings size={18} />} label="環境マイ設定" isActive={activeTab === 'settings'} onClick={() => setActiveTab('settings')} themeCls={themeCls} />
            </nav>
          </div>
          <div className="text-[10px] text-gray-400 font-bold border-t pt-3">
            <span>© 2026 CampusSync Pro</span>
          </div>
        </div>
      </aside>

      {/* メインビューポートエリア */}
      <div className="flex-1 flex flex-col relative w-full max-w-2xl mx-auto shadow-2xl md:shadow-none bg-gray-50 md:bg-transparent overflow-hidden">
        
        {/* モバイル用トップナビヘッダー */}
        <header className="campus-theme-mobile-header md:hidden flex justify-between items-center px-4 py-3 bg-white/90 backdrop-blur-md sticky top-0 z-20 border-b border-gray-100">
          <div className="min-w-0 max-w-[68%] shrink">
            <CampusSyncLogo variant="wordmark" height={23} theme="auto" />
          </div>
          <div className={`text-xs font-black px-2.5 py-1 rounded-full ${themeCls.lightBg} ${themeCls.text}`}>
            ★ {score} pt
          </div>
        </header>

        {/* スクロールコンテンツコンテナ */}
        <main className="flex-1 min-w-0 overflow-y-scroll pb-24 md:pb-8 px-4 pt-4 md:pt-6">
          {renderContent()}
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

        {/* モバイルスマートフォンスクリーン用ボトムナビゲーションバー */}
        <nav className="campus-theme-mobile-nav md:hidden fixed bottom-0 left-0 right-0 w-full bg-white/95 backdrop-blur-md border-t border-gray-100 flex justify-around items-center h-16 pb-2 px-1 z-20 overflow-x-auto">
          <NavItem icon={<Home size={20} />} label="ホーム" isActive={activeTab === 'home'} onClick={() => setActiveTab('home')} themeCls={themeCls} />
          <NavItem icon={<Calendar size={20} />} label="時間割" isActive={activeTab === 'timetable'} onClick={() => setActiveTab('timetable')} themeCls={themeCls} />
          <NavItem icon={<Utensils size={20} />} label="学食" isActive={activeTab === 'cafeteria'} onClick={() => setActiveTab('cafeteria')} themeCls={themeCls} />
          <NavItem icon={<Train size={20} />} label="電車" isActive={activeTab === 'bus'} onClick={() => setActiveTab('bus')} themeCls={themeCls} />
          <NavItem icon={<Settings size={20} />} label="設定" isActive={activeTab === 'settings'} onClick={() => setActiveTab('settings')} themeCls={themeCls} />
        </nav>
      </div>

      {/* --- アプリケーションモーダルUIコンポーネント群 --- */}

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

      {/* CampusSync オープニング：データ取得とは独立して再生し、一定時間後に必ず操作画面を表示 */}
      {showCampusIntro && (
        <div className="campus-intro" role="status" aria-label="CampusSyncを開いています">
          <div className="campus-intro__water campus-intro__water--back" aria-hidden="true" />
          <div className="campus-intro__water campus-intro__water--front" aria-hidden="true" />
          <div className="campus-intro__night" aria-hidden="true" />
          <div className="campus-intro__stars" aria-hidden="true" />
          <div className="campus-intro__stars campus-intro__stars--far" aria-hidden="true" />
          <div className="campus-intro__meteor" aria-hidden="true" />
          <div className="campus-intro__brand" aria-hidden="true">
            <div className="campus-intro__eyebrow">YOUR CAMPUS, CONNECTED</div>
            <div className="campus-intro__wordmark">Campus<span>Sync</span></div>
            <div className="campus-intro__tagline">学校生活を、もっとスムーズに。</div>
          </div>
          <style jsx global>{`
            .campus-intro {
              position: fixed;
              inset: 0;
              z-index: 99999;
              overflow: hidden;
              isolation: isolate;
              background: #fff;
              opacity: 1;
              pointer-events: auto;
              animation: campusIntroFade 6.3s ease-in forwards;
            }
            .campus-intro__water {
              position: absolute;
              left: -10%;
              width: 120%;
              height: 116%;
              bottom: -13%;
              border-radius: 0;
              background: transparent;
              transform: translate3d(0, 105%, 0);
              will-change: transform;
            }
            /* 波の輪郭はSVGマスクで作る。preserveAspectRatio=none でマスクタイル内を全面に伸ばし、透明な隙間が出ないようにする */
            .campus-intro__water::before {
              content: "";
              position: absolute;
              z-index: 2;
              left: 0;
              top: -1.2vh;
              width: 100%;
              height: 9vh;
              background: #9af8ff;
              -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 480 140' preserveAspectRatio='none'%3E%3Cpath fill='white' d='M0 48 C40 48 40 12 80 12 C120 12 120 84 160 84 C200 84 200 48 240 48 C280 48 280 12 320 12 C360 12 360 84 400 84 C440 84 440 48 480 48 L480 140 L0 140 Z'/%3E%3C/svg%3E");
              mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 480 140' preserveAspectRatio='none'%3E%3Cpath fill='white' d='M0 48 C40 48 40 12 80 12 C120 12 120 84 160 84 C200 84 200 48 240 48 C280 48 280 12 320 12 C360 12 360 84 400 84 C440 84 440 48 480 48 L480 140 L0 140 Z'/%3E%3C/svg%3E");
              -webkit-mask-size: 360px 100%;
              mask-size: 360px 100%;
              -webkit-mask-repeat: repeat-x;
              mask-repeat: repeat-x;
              filter: drop-shadow(0 -5px 12px rgba(120, 244, 255, .42));
              animation: campusIntroSurfaceFront 3.4s linear infinite;
              will-change: -webkit-mask-position, mask-position;
            }
            .campus-intro__water::after {
              content: "";
              position: absolute;
              z-index: 1;
              left: 0;
              right: 0;
              top: 5.4vh;
              bottom: 0;
              background: linear-gradient(180deg, #9af8ff 0%, #4bdef5 18%, #0aa8db 48%, #087cb7 100%);
            }
            .campus-intro__water--back {
              z-index: 1;
              opacity: .82;
              animation: campusIntroRiseBack 3.1s cubic-bezier(.18,.72,.22,1) .12s forwards;
            }
            .campus-intro__water--back::before {
              background: #70efff;
              filter: drop-shadow(0 -3px 10px rgba(95, 225, 255, .28));
              animation: campusIntroSurfaceBack 5.8s linear infinite;
            }
            .campus-intro__water--back::after {
              background: linear-gradient(180deg, #70efff 0%, #20c9ec 28%, #078fc8 72%, #086aab 100%);
            }
            .campus-intro__water--front {
              z-index: 2;
              box-shadow: 0 -18px 70px rgba(60, 229, 255, .28);
              animation: campusIntroRiseFront 3.05s cubic-bezier(.16,.76,.22,1) .28s forwards;
            }
            .campus-intro__water--front::before {
              animation: campusIntroSurfaceFront 3.4s linear infinite reverse;
            }
            .campus-intro__night {
              position: absolute;
              z-index: 3;
              inset: 0;
              opacity: 0;
              background: radial-gradient(ellipse at 50% 110%, #11284a 0%, #060c1d 52%, #01030b 100%);
              animation: campusIntroNightfall .9s ease-in-out 2.65s forwards;
            }
            .campus-intro__stars {
              position: absolute;
              z-index: 4;
              inset: 0;
              opacity: 0;
              background-image:
                radial-gradient(1.5px 1.5px at 8% 18%, rgba(255,255,255,.95) 98%, transparent),
                radial-gradient(1px 1px at 18% 62%, rgba(194,231,255,.9) 98%, transparent),
                radial-gradient(1.4px 1.4px at 31% 26%, rgba(255,255,255,.9) 98%, transparent),
                radial-gradient(1px 1px at 43% 72%, rgba(176,220,255,.85) 98%, transparent),
                radial-gradient(1.8px 1.8px at 55% 15%, rgba(255,255,255,.95) 98%, transparent),
                radial-gradient(1px 1px at 67% 38%, rgba(190,232,255,.9) 98%, transparent),
                radial-gradient(1.5px 1.5px at 79% 22%, rgba(255,255,255,.9) 98%, transparent),
                radial-gradient(1px 1px at 92% 55%, rgba(188,222,255,.8) 98%, transparent),
                radial-gradient(1.3px 1.3px at 13% 86%, rgba(255,255,255,.9) 98%, transparent),
                radial-gradient(1.2px 1.2px at 37% 49%, rgba(255,255,255,.75) 98%, transparent),
                radial-gradient(1.6px 1.6px at 73% 81%, rgba(255,255,255,.85) 98%, transparent),
                radial-gradient(1px 1px at 86% 90%, rgba(193,228,255,.85) 98%, transparent);
              animation: campusIntroStars .75s ease 3.25s forwards, campusIntroTwinkle 3s ease-in-out 4s infinite alternate;
            }
            .campus-intro__stars--far {
              z-index: 4;
              transform: scale(1.02);
              background-image:
                radial-gradient(1px 1px at 23% 11%, #8bdfff 98%, transparent),
                radial-gradient(1px 1px at 47% 34%, #fff 98%, transparent),
                radial-gradient(1px 1px at 62% 61%, #8bdfff 98%, transparent),
                radial-gradient(1px 1px at 95% 13%, #fff 98%, transparent),
                radial-gradient(1px 1px at 4% 42%, #fff 98%, transparent),
                radial-gradient(1px 1px at 51% 90%, #a8dfff 98%, transparent);
              animation-delay: 3.55s, 4.2s;
            }
            .campus-intro__meteor {
              position: absolute;
              z-index: 6;
              top: 16%;
              left: 82%;
              width: clamp(130px, 25vw, 290px);
              height: 2px;
              border-radius: 999px;
              opacity: 0;
              transform-origin: right center;
              background: linear-gradient(90deg, transparent 0%, rgba(90,192,255,.2) 30%, rgba(191,235,255,.95) 82%, #fff 100%);
              filter: drop-shadow(0 0 5px rgba(109,210,255,.95)) drop-shadow(0 0 15px rgba(72,157,255,.7));
              animation: campusIntroMeteor 1.05s cubic-bezier(.18,.55,.4,1) 4.05s forwards;
            }
            .campus-intro__brand {
              position: absolute;
              z-index: 5;
              top: 43%;
              left: 0;
              width: 100%;
              padding: 0 20px;
              color: #fff;
              text-align: center;
              opacity: 0;
              transform: translateY(12px) scale(.98);
              text-shadow: 0 2px 24px rgba(91,180,255,.2);
              animation: campusIntroBrand 2.15s ease 3.4s forwards;
            }
            .campus-intro__eyebrow {
              margin-bottom: 12px;
              color: #9fdcff;
              font-size: 10px;
              font-weight: 800;
              letter-spacing: .34em;
            }
            .campus-intro__wordmark {
              font-size: clamp(42px, 8vw, 70px);
              font-weight: 900;
              line-height: 1;
              letter-spacing: -.06em;
            }
            .campus-intro__wordmark span {
              color: #63dfff;
            }
            .campus-intro__tagline {
              margin-top: 17px;
              color: rgba(231,244,255,.88);
              font-size: clamp(12px, 2vw, 15px);
              font-weight: 600;
              letter-spacing: .12em;
            }
            @keyframes campusIntroFade {
              0%, 86% { opacity: 1; visibility: visible; }
              100% { opacity: 0; visibility: hidden; pointer-events: none; }
            }
            @keyframes campusIntroRiseBack {
              0% { transform: translate3d(0,105%,0); }
              68% { transform: translate3d(0,-1.5%,0); }
              82% { transform: translate3d(0,1%,0); }
              100% { transform: translate3d(0,0,0); }
            }
            @keyframes campusIntroRiseFront {
              0% { transform: translate3d(0,105%,0); }
              52% { transform: translate3d(0,-2.2%,0); }
              70% { transform: translate3d(0,1.4%,0); }
              84% { transform: translate3d(0,-.7%,0); }
              100% { transform: translate3d(0,0,0); }
            }
            @keyframes campusIntroSurfaceBack {
              from { -webkit-mask-position: 0 0; mask-position: 0 0; }
              to { -webkit-mask-position: 360px 0; mask-position: 360px 0; }
            }
            @keyframes campusIntroSurfaceFront {
              from { -webkit-mask-position: 0 0; mask-position: 0 0; }
              to { -webkit-mask-position: 360px 0; mask-position: 360px 0; }
            }
            @keyframes campusIntroNightfall {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes campusIntroStars {
              from { opacity: 0; }
              to { opacity: .95; }
            }
            @keyframes campusIntroTwinkle {
              from { filter: brightness(.8); }
              to { filter: brightness(1.35); }
            }
            @keyframes campusIntroMeteor {
              0% { opacity: 0; transform: translate3d(0,0,0) rotate(135deg) scaleX(.35); }
              14% { opacity: 1; }
              76% { opacity: 1; }
              100% { opacity: 0; transform: translate3d(-62vw,58vh,0) rotate(135deg) scaleX(1); }
            }
            @keyframes campusIntroBrand {
              0% { opacity: 0; transform: translateY(12px) scale(.98); }
              18%, 68% { opacity: 1; transform: translateY(0) scale(1); }
              100% { opacity: 0; transform: translateY(-6px) scale(1.01); }
            }
            @media (prefers-reduced-motion: reduce) {
              .campus-intro { animation: none; }
            }
          `}</style>
        </div>
      )}

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

function NavItem({ icon, label, isActive, onClick, themeCls }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, themeCls: any }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center justify-center w-14 pt-1 gap-0.5 flex-shrink-0 [&_svg]:block [&_svg]:shrink-0 [&_img]:block [&_img]:shrink-0">
      <div className={`flex h-5 w-5 shrink-0 items-center justify-center transition-all [&_svg]:block [&_svg]:shrink-0 ${isActive ? `${themeCls.text} transform -translate-y-0.5` : 'text-gray-400'}`}>
        {icon}
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
      <div className="flex shrink-0 items-center [&_svg]:block [&_svg]:shrink-0">
      {icon}</div>
      <span className="truncate">{label}</span>
      {badge && <span className="ml-auto bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{badge}</span>}
    </button>
  );
}