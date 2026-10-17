'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Home, Utensils, BookOpen, Settings, Bell, CheckCircle, 
  Clock, FileText, Monitor, Wind, ThermometerSun, 
  ThermometerSnowflake, Search, Info, Users, Check, X, Plus, 
  ChevronRight, AlertTriangle, Sparkles, Star, MapPin, 
  QrCode, User, Palette, BellRing, Lock, Sparkle,
  Calendar, Train, MessageSquare, Award, Heart, ThumbsUp,
  ChevronLeft, BookOpenCheck, ShieldAlert, GraduationCap,
  Volume2, Coffee, Moon, Sun, HelpCircle
} from 'lucide-react';

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
  }
};

type ThemeKey = keyof typeof THEMES;

// --- 📋 初期モックデータ群の超拡充 ---

const INITIAL_TODOS = [
  { id: '1', title: '数学演習プリント P20-21', source: '紙プリント', type: 'paper', due: '本日中', color: 'bg-red-100 text-red-700', icon: FileText, details: '授業で配布されたプリントのP20〜21です。途中式も必ず書くこと。明日の朝のSHRで回収します。', completed: false },
  { id: '2', title: '英語エッセイ ドラフト提出', source: 'Classroom', type: 'classroom', due: '明日まで', color: 'bg-orange-100 text-orange-700', icon: Monitor, details: 'テーマ「My Future Goal」についてのドラフト（下書き）をGoogle Docsで作成し、Classroomの課題から提出してください。最低300語。', completed: false },
  { id: '3', title: '文化祭 参加希望アンケート', source: '生徒会', type: 'other', due: '金曜まで', color: 'bg-blue-100 text-blue-700', icon: Info, details: '文化祭の有志発表（バンド、ダンス等）に参加を希望する団体は、代表者がこのアンケートに回答してください。', completed: false },
  { id: '4', title: '現代文 短歌創作課題', source: '授業内指示', type: 'paper', due: '来週月曜', color: 'bg-purple-100 text-purple-700', icon: FileText, details: 'テーマは「青春」または「日常の発見」。原稿用紙1枚に短歌3首とそれぞれの解説文を記述。', completed: false },
  { id: '5', title: '物理基礎 実験レポート', source: 'Classroom', type: 'classroom', due: '金曜まで', color: 'bg-amber-100 text-amber-700', icon: Monitor, details: '先週行った「自由落下運動」の実験結果をスプレッドシートにまとめ、グラフを添付して提出。', completed: false },
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
  { id: 102, name: '化学実験室', status: '快適', temp: '25℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 103, name: '生物実験室', status: '快適', temp: '25℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 104, name: 'グローリーホール', status: '快適', temp: '25℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 105, name: 'ミーティングルーム1', status: '快適', temp: '25℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 106, name: 'ミーティングルーム2', status: '快適', temp: '25℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 107, name: '図書館', status: '快適', temp: '25℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 108, name: 'グローバルステーション', status: '快適', temp: '25℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 109, name: 'Call教室', status: '快適', temp: '25℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 110, name: 'PC教室', status: '快適', temp: '25℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 111, name: '家庭科室', status: '快適', temp: '25℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
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
  serviceDate: string;
  menuCategory: string;
  menuName: string;
  userName: string;
  rating: number;
  comment: string;
  date: string;
};

type DailyReviewMenuOption = {
  id: string;
  serviceDate: string;
  categoryKey: string;
  categoryLabel: string;
  name: string;
};

const DAILY_REVIEW_MENU_CATEGORIES = [
  { key: 'soka_lunch', label: '創価ランチ' },
  { key: 'healthy_lunch', label: 'ヘルシーランチ' },
  { key: 'snack_lunch', label: 'スナックランチ' },
  { key: 'curry', label: 'カレー' },
  { key: 'noodles', label: '麺類' },
] as const;

const formatMenuServiceDate = (dateValue: string): string => {
  const [year, month, day] = dateValue.split('-').map(Number);
  return `${year}年${month}月${day}日`;
};

// 口コミ対象はAdminの月間献立表（cafeteria_daily_menus）から取得します。架空の初期口コミは表示しません。

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
  // オープニング演出。Supabaseのデータ読み込みとは並行して再生する。
  const [showCampusIntro, setShowCampusIntro] = useState(true);
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setShowCampusIntro(false);
      return;
    }
    const introTimer = window.setTimeout(() => setShowCampusIntro(false), 6300);
    return () => window.clearTimeout(introTimer);
  }, []);

  const [activeTab, setActiveTab] = useState('home');
  const [selectedTodo, setSelectedTodo] = useState<any>(null);
  const [showTempModal, setShowTempModal] = useState(false);
  const [score, setScore] = useState(65); // 学校貢献度初期スコア

  // --- 🎨 テーマカラー＆モード管理 ---
  const [theme, setTheme] = useState<ThemeKey>('blue');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const themeCls = THEMES[theme];

  // --- 🪪 プロフィール・ログイン設定状態 ---
  const [studentId, setStudentId] = useState('581234');
  const [studentName, setStudentName] = useState('創価 太郎');
  const [showIdCardModal, setShowIdCardModal] = useState(false);
  const [userClass, setUserClass] = useState('1-1'); // 1-1〜3-8から選択

  // --- ⏰ おせっかい通知リマインダー設定 ---
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderTimes, setReminderTimes] = useState<string[]>(['dayBefore', 'morningOf']);
  const [allowedNotificationDays, setAllowedNotificationDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

  // --- 各種動的ステート管理 ---
  const [todos, setTodos] = useState(INITIAL_TODOS);
  const [rooms, setRooms] = useState(INITIAL_ROOMS);
  const [favoriteRoomId, setFavoriteRoomId] = useState<number>(101);
  const [selectedRoomId, setSelectedRoomId] = useState<number>(101);
  const [selectedStatus, setSelectedStatus] = useState<string>('快適');

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
  const [busCongestionVote, setBusCongestionVote] = useState<Record<string, string>>({ hachioji: '普通', haijima: '空いている', akitsu: '混雑' });
  const [busDelayMinutes, setBusDelayMinutes] = useState<Record<string, number>>({ hachioji: 0, haijima: 5, akitsu: 0 });

  // 部活動用状態
  const [clubNotes, setClubNotes] = useState(INITIAL_CLUB_NOTES);
  const [newClubName, setNewClubName] = useState('');
  const [newClubTitle, setNewClubTitle] = useState('');
  const [newClubContent, setNewClubContent] = useState('');

  // 学食レビュー用状態。口コミ対象はAdminの月間献立表から取得する実メニューのみ。
  const [cafeteriaReviews, setCafeteriaReviews] = useState<CafeteriaReview[]>([]);
  const [cafeteriaReviewsMessage, setCafeteriaReviewsMessage] = useState('');
  const [dailyReviewMenuOptions, setDailyReviewMenuOptions] = useState<DailyReviewMenuOption[]>([]);
  const [dailyReviewMenusLoading, setDailyReviewMenusLoading] = useState(true);
  const [dailyReviewMenusMessage, setDailyReviewMenusMessage] = useState('');
  const [selectedMenuForReview, setSelectedMenuForReview] = useState<string>('');
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


// Adminと共有する図書室蔵書を読み込む
useEffect(() => {
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
}, []);

// Adminサイトで設定したキャリアセンター自習室の座席状況を読み込む
useEffect(() => {
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
}, []);

// Adminの月間献立表から、実際に登録されたメニューだけを口コミ対象として読み込む。
useEffect(() => {
  let cancelled = false;

  const loadDailyReviewMenus = async () => {
    setDailyReviewMenusLoading(true);
    setDailyReviewMenusMessage('');

    const now = new Date();
    const asDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const startDate = asDate(new Date(now.getFullYear(), now.getMonth(), 1));
    // 今月・翌月・翌々月の献立を対象にする。
    const endDate = asDate(new Date(now.getFullYear(), now.getMonth() + 3, 0));
    const today = asDate(now);

    const { data, error } = await supabase
      .from('cafeteria_daily_menus')
      .select('service_date, soka_lunch, healthy_lunch, snack_lunch, curry, noodles, is_closed')
      .gte('service_date', startDate)
      .lte('service_date', endDate)
      .order('service_date', { ascending: true });

    if (cancelled) return;

    if (error) {
      console.error('Admin月間献立の口コミ候補取得に失敗:', error);
      setDailyReviewMenuOptions([]);
      setDailyReviewMenusMessage('献立を読み込めません。Adminの月間献立表とSupabaseの設定を確認してください。');
      setDailyReviewMenusLoading(false);
      return;
    }

    const options: DailyReviewMenuOption[] = [];
    for (const row of data ?? []) {
      if (row.is_closed) continue;
      for (const category of DAILY_REVIEW_MENU_CATEGORIES) {
        const raw = (row as Record<string, unknown>)[category.key];
        const name = typeof raw === 'string' ? raw.trim() : '';
        if (!name || /^(休業|営業はありません|なし|未定)$/u.test(name)) continue;
        const serviceDate = String(row.service_date);
        options.push({
          id: `${serviceDate}:${category.key}`,
          serviceDate,
          categoryKey: category.key,
          categoryLabel: category.label,
          name,
        });
      }
    }

    options.sort((a, b) => {
      const aPast = a.serviceDate < today;
      const bPast = b.serviceDate < today;
      if (aPast !== bPast) return aPast ? 1 : -1;
      return aPast
        ? b.serviceDate.localeCompare(a.serviceDate)
        : a.serviceDate.localeCompare(b.serviceDate);
    });

    setDailyReviewMenuOptions(options);
    setSelectedMenuForReview(previous => options.some(item => item.id === previous) ? previous : (options[0]?.id ?? ''));
    setDailyReviewMenusMessage(options.length ? '' : 'Adminの月間献立表に口コミ対象のメニューがありません。Adminでメニューを入力し「この月の献立を一括保存」してください。');
    setDailyReviewMenusLoading(false);
  };

  void loadDailyReviewMenus();
  return () => { cancelled = true; };
}, []);

// Supabaseから落とし物・教室状況データを取得
useEffect(() => {
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
          let icon = ThermometerSnowflake;

          if (sharedRoom.status === '寒い' || sharedRoom.status === 'やや寒い') {
            color = 'text-cyan-500';
            bg = 'bg-cyan-50';
            icon = Wind;
          } else if (sharedRoom.status === '暑い' || sharedRoom.status === '激暑') {
            color = 'text-red-500';
            bg = 'bg-red-50';
            icon = ThermometerSun;
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

    fetchStep = '実献立に紐づく学食レビュー取得（cafeteria_daily_menu_reviews）';
    const { data: reviewData, error: reviewError } = await supabase
      .from('cafeteria_daily_menu_reviews')
      .select('id, service_date, menu_category, menu_name, user_name, rating, comment, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (reviewError) {
      console.error('学食レビューの取得に失敗:', reviewError);
      setCafeteriaReviews([]);
      setCafeteriaReviewsMessage('口コミを読み込めません。Supabaseで setup_cafeteria_daily_menu_reviews.sql を実行してください。');
    } else if (reviewData) {
      setCafeteriaReviews(
        reviewData.map(review => ({
          id: review.id,
          serviceDate: String(review.service_date),
          menuCategory: review.menu_category,
          menuName: review.menu_name,
          userName: review.user_name || '匿名の生徒',
          rating: Number(review.rating),
          comment: review.comment,
          date: new Date(review.created_at).toLocaleString('ja-JP', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        }))
      );
      setCafeteriaReviewsMessage('');
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

    if (/^\d{6}$/.test(initialStudentId)) {
      fetchStep = '課題取得（todos）';
      const { data: todoRows, error: todoError } = await supabase
        .from('todos')
        .select('*')
        .eq('student_id', initialStudentId)
        .order('created_at', { ascending: true });

      if (todoError) {
        console.error('課題・提出物の取得に失敗:', todoError);
      } else if (todoRows && todoRows.length > 0) {
        setTodos(
          todoRows.map(row => ({
            id: row.id,
            title: row.title,
            source: row.source,
            type: row.type,
            due: row.due,
            details: row.details,
            completed: row.completed,
            ...getTodoPresentation(row.type),
          }))
        );
      } else {
        // 新しい生徒には現在のデモ課題を個人用としてコピー
        const initialRows = INITIAL_TODOS.map(todo => ({
          student_id: initialStudentId,
          title: todo.title,
          source: todo.source,
          type: todo.type,
          due: todo.due,
          details: todo.details,
          completed: false,
        }));

        const { data: createdTodos, error: createTodoError } = await supabase
          .from('todos')
          .insert(initialRows)
          .select();

        if (createTodoError) {
          console.error('初期課題の登録に失敗:', createTodoError);
        } else if (createdTodos) {
          setTodos(
            createdTodos.map(row => ({
              id: row.id,
              title: row.title,
              source: row.source,
              type: row.type,
              due: row.due,
              details: row.details,
              completed: row.completed,
              ...getTodoPresentation(row.type),
            }))
          );
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

  const toggleTodoComplete = async (todoId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const targetTodo = todos.find(todo => todo.id === todoId);
    if (!targetTodo) return;

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

    let nextTemp = selectedRoom.temp;
    let color = selectedRoom.color;
    let bg = selectedRoom.bg;
    let icon = selectedRoom.icon;

    if (selectedStatus === '寒い') {
      nextTemp = (parseInt(selectedRoom.temp) - 1) + '℃';
      color = 'text-cyan-500';
      bg = 'bg-cyan-50';
      icon = Wind;
    } else if (selectedStatus === '暑い') {
      nextTemp = (parseInt(selectedRoom.temp) + 1) + '℃';
      color = 'text-red-500';
      bg = 'bg-red-50';
      icon = ThermometerSun;
    } else {
      nextTemp = '25℃';
      color = 'text-green-500';
      bg = 'bg-green-50';
      icon = ThermometerSnowflake;
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
    void updateContribution(10, '教室のエアコン状況を報告');
    alert("エアコン状況のリアルタイム報告ありがとうございます！貢献度+10pt！🔥");
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
      alert('コメントを入力してください。');
      return;
    }

    const selectedMenu = dailyReviewMenuOptions.find(item => item.id === selectedMenuForReview);
    if (!selectedMenu) {
      alert('口コミ対象のメニューがありません。Adminで月間献立を登録・保存してください。');
      return;
    }

    const reviewToInsert = {
      service_date: selectedMenu.serviceDate,
      menu_category: selectedMenu.categoryKey,
      menu_name: selectedMenu.name,
      user_name: newReviewUser.trim() || '匿名の生徒',
      rating: newReviewRating,
      comment: newReviewComment.trim(),
    };

    const { data, error } = await supabase
      .from('cafeteria_daily_menu_reviews')
      .insert(reviewToInsert)
      .select('id, service_date, menu_category, menu_name, user_name, rating, comment, created_at')
      .single();

    if (error) {
      console.error('学食レビューの保存に失敗:', error);
      alert(`口コミの保存に失敗しました: ${error.message}`);
      return;
    }

    if (data) {
      const newReview: CafeteriaReview = {
        id: data.id,
        serviceDate: String(data.service_date),
        menuCategory: data.menu_category,
        menuName: data.menu_name,
        userName: data.user_name || '匿名の生徒',
        rating: Number(data.rating),
        comment: data.comment,
        date: new Date(data.created_at).toLocaleString('ja-JP', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setCafeteriaReviews(prev => [newReview, ...prev]);
      setCafeteriaReviewsMessage('');
    }

    void updateContribution(8, '学食レビューを投稿');
    setNewReviewComment('');
    setNewReviewUser('');
    alert('学食レビューを投稿しました！役立つ情報をありがとう！(+8pt)🍲');
  };

  const toggleReminderTime = (timeKey: string) => {
    setReminderTimes(prev => prev.includes(timeKey) ? prev.filter(t => t !== timeKey) : [...prev, timeKey]);
  };

  const toggleNotificationDay = (dayKey: string) => {
    setAllowedNotificationDays(prev => prev.includes(dayKey) ? prev.filter(d => d !== dayKey) : [...prev, dayKey]);
  };

  const handleSaveProfile = async () => {
    const cleanStudentId = studentId.trim();
    const cleanStudentName = studentName.trim();

    if (!/^\d{6}$/.test(cleanStudentId)) {
      alert('学籍番号は6桁の数字で入力してください。');
      return;
    }

    if (!cleanStudentName) {
      alert('氏名を入力してください。');
      return;
    }

    setProfileSaving(true);

    const { error } = await supabase
      .from('profiles')
      .upsert({
        student_id: cleanStudentId,
        student_name: cleanStudentName,
        user_class: userClass,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'student_id' });

    setProfileSaving(false);

    if (error) {
      console.error('プロフィールの保存に失敗:', error);
      alert('プロフィールの保存に失敗しました。');
      return;
    }

    setStudentName(cleanStudentName);
    alert('プロフィールを保存しました！');
  };

  const updateContribution = async (delta: number, reason: string) => {
    const cleanStudentId = studentId.trim();

    if (!/^\d{6}$/.test(cleanStudentId)) {
      setScore(prev => Math.max(0, Math.min(prev + delta, 100)));
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
    }

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
              <div className="space-y-2.5">
                {todos.map(todo => (
                  <div 
                    key={todo.id} 
                    onClick={() => setSelectedTodo(todo)}
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
                  <Wind size={20} className="mr-2 text-teal-500"/> リアルタイム教室エアコン状況
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
              {timetableData[selectedWeekType][selectedDay].map((slot) => (
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
                    <Users size={20} className="mr-2 text-orange-500"/> 現在の食堂全体の混雑状況
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
                {dailyReviewMenusMessage && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    {dailyReviewMenusMessage}
                  </div>
                )}
                {cafeteriaReviewsMessage && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    {cafeteriaReviewsMessage}
                  </div>
                )}
                {/* 新規口コミ投稿フォーム：Adminが保存した実際の献立だけを選択 */}
                <form onSubmit={handleAddReview} className={`${cardBgClass} rounded-2xl p-4 border shadow-sm space-y-3`}>
                  <h4 className="text-xs font-black flex items-center gap-1"><Plus size={15}/> メニューの口コミを投稿</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={selectedMenuForReview}
                      onChange={e => setSelectedMenuForReview(e.target.value)}
                      disabled={dailyReviewMenusLoading || dailyReviewMenuOptions.length === 0}
                      className="bg-gray-50 border border-gray-200 rounded-xl p-2 text-xs font-bold outline-none disabled:opacity-60"
                    >
                      {dailyReviewMenusLoading && <option value="">献立を読み込み中...</option>}
                      {!dailyReviewMenusLoading && dailyReviewMenuOptions.length === 0 && <option value="">口コミ対象メニューなし</option>}
                      {dailyReviewMenuOptions.map(menu => (
                        <option key={menu.id} value={menu.id}>
                          {formatMenuServiceDate(menu.serviceDate)} ・{menu.categoryLabel}：{menu.name}
                        </option>
                      ))}
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
                  <button type="submit" disabled={dailyReviewMenusLoading || dailyReviewMenuOptions.length === 0} className={`w-full py-2.5 text-white text-xs font-black rounded-xl ${themeCls.bg} ${themeCls.bgHover} disabled:opacity-50 disabled:cursor-not-allowed`}>
                    レビューを送信して貢献度ポイント獲得
                  </button>
                </form>

                {/* 口コミタイムライン */}
                <div className="space-y-2">
                  {!cafeteriaReviewsMessage && cafeteriaReviews.length === 0 && (
                    <div className={`${cardBgClass} rounded-2xl p-4 border text-xs ${subTextClass}`}>
                      まだ口コミはありません。Adminで登録された献立への最初の口コミを投稿してみましょう。
                    </div>
                  )}
                  {cafeteriaReviews.map(rev => (
                    <div key={rev.id} className={`${cardBgClass} p-4 rounded-2xl border shadow-xs space-y-1.5`}>
                      <div className="flex justify-between items-center">
                        <span className={`text-xs font-black bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md`}>
                          {rev.menuName}
                        </span>
                        <span className={`text-[10px] ${subTextClass}`}>{formatMenuServiceDate(rev.serviceDate)} ・投稿 {rev.date}</span>
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
                    <p className="py-5 text-center text-xs text-red-500">{libraryBooksError}</p>
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
                        <div className="py-6 text-center">
                          <BookOpen size={24} className="mx-auto mb-2 text-gray-300" />
                          <p className="text-xs font-bold text-gray-500">
                            {librarySearch.trim() ? '一致する蔵書が見つかりません。' : '蔵書はまだ登録されていません。'}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-1">タイトルまたは著者名を変えて検索してください。</p>
                        </div>
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
                  <h4 className="text-xs font-black flex items-center gap-1 text-amber-600"><Plus size={16} /> 落とし物発見の共有報告</h4>
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
                  <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] font-bold text-red-600">{lostAndFoundError}</p>
                )}
                <div className="space-y-2.5">
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
              <h2 className={`text-xl font-black ${activeTextClass}`}>鷹の台駅 発車案内</h2>
              <span className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-black">電車時刻表</span>
            </div>

            {busSubTab === 'countdown' ? (
              (() => {
                const direction = trainTimetable[selectedTrainDirection];
                const now = new Date();
                const nowMinutes = now.getHours() * 60 + now.getMinutes();
                const parsed = direction.trains.map(train => ({
                  ...train,
                  minutes: Number(train.time.slice(0, 2)) * 60 + Number(train.time.slice(3))
                }));
                const nextIndex = parsed.findIndex(train => train.minutes >= nowMinutes);
                const effectiveIndex = nextIndex >= 0 ? nextIndex : 0;
                const nextTrain = parsed[effectiveIndex];
                const rawDiff = nextIndex >= 0
                  ? nextTrain.minutes - nowMinutes
                  : (24 * 60 - nowMinutes) + nextTrain.minutes;
                const hoursUntil = Math.floor(rawDiff / 60);
                const minsUntil = rawDiff % 60;
                const countdownText = rawDiff <= 0
                  ? 'まもなく発車'
                  : `あと ${hoursUntil > 0 ? `${hoursUntil}時間 ` : ''}${minsUntil}分で発車`;
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
                    <input type="text" maxLength={6} value={studentId} onChange={e => setStudentId(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs font-mono font-black outline-none" />
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
                  onClick={() => setShowIdCardModal(true)}
                  disabled={studentId.trim().length !== 6}
                  className={`w-full py-3 mt-1 rounded-xl text-white font-black text-xs shadow-xs flex items-center justify-center gap-1.5 ${
                    studentId.trim().length === 6 ? `${themeCls.bg} ${themeCls.bgHover}` : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <QrCode size={15} /> デジタル生徒身分証アクティベート 🪪
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

              <div className="grid grid-cols-6 gap-1.5 pt-1">
                {(Object.keys(THEMES) as ThemeKey[]).map(key => {
                  const item = THEMES[key];
                  const isActive = theme === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setTheme(key)}
                      className={`flex flex-col items-center py-2 rounded-xl border transition-all ${isActive ? 'border-gray-800 bg-gray-50' : 'border-gray-100 bg-white'}`}
                    >
                      <span className={`w-5 h-5 rounded-full block mb-1 flex items-center justify-center ${item.bg} text-white`}>
                        {isActive && <Check size={10} strokeWidth={3} />}
                      </span>
                      <span className="text-[8px] font-bold text-gray-500 uppercase">{key}</span>
                    </button>
                  );
                })}
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
                  onClick={() => setRemindersEnabled(!remindersEnabled)}
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
                    onClick={() => setFavoriteRoomId(r.id)}
                    className={`text-[11px] px-2.5 py-1.5 rounded-xl border font-black flex items-center gap-1 transition-all ${
                      favoriteRoomId === r.id 
                        ? 'bg-yellow-500 text-white border-yellow-500' 
                        : 'bg-white text-gray-600 border-gray-200'
                    }`}
                  >
                    <Star size={11} fill={favoriteRoomId === r.id ? 'currentColor' : 'none'} />
                    {r.name.replace('教室', '')}
                  </button>
                ))}
              </div>
            </div>

            <button className="w-full py-3.5 text-xs font-black text-red-500 bg-red-50 rounded-2xl hover:bg-red-100 transition-colors">
              アプリケーション連携の解除・ログアウト
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`flex h-screen bg-gray-50 font-sans overflow-hidden ${isDarkMode ? 'dark bg-slate-900' : ''}`}>
      
      {/* デスクトップ用 左側固定サイドバーレイアウト */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-100 shadow-xs z-30 relative">
        <div className="p-5 flex flex-col h-full justify-between">
          <div>
            <h1 className="text-xl font-black text-gray-800 tracking-tight mb-6">
              Campus<span className={themeCls.text}>Sync</span>
            </h1>
            <nav className="space-y-1">
              <SidebarItem icon={<Home size={18} />} label="ダッシュボード" isActive={activeTab === 'home'} onClick={() => setActiveTab('home')} themeCls={themeCls} />
              <SidebarItem icon={<Calendar size={18} />} label="時間割表" isActive={activeTab === 'timetable'} onClick={() => setActiveTab('timetable')} themeCls={themeCls} />
              <SidebarItem icon={<Utensils size={18} />} label="学食混雑＆レビュー" isActive={activeTab === 'cafeteria'} onClick={() => setActiveTab('cafeteria')} themeCls={themeCls} />
              <SidebarItem icon={<BookOpen size={18} />} label="校内施設＆落とし物" isActive={activeTab === 'facilities'} onClick={() => setActiveTab('facilities')} themeCls={themeCls} />
              <SidebarItem icon={<Train size={18} />} label="電車発車案内" isActive={activeTab === 'bus'} onClick={() => setActiveTab('bus')} themeCls={themeCls} />
              <SidebarItem icon={<MessageSquare size={18} />} label="部活・委員会ノート" isActive={activeTab === 'club'} onClick={() => setActiveTab('club')} themeCls={themeCls} />
              <SidebarItem icon={<Bell size={18} />} label="通知・連絡" isActive={activeTab === 'notifications'} onClick={() => setActiveTab('notifications')} badge={3} themeCls={themeCls} />
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
        <header className="md:hidden flex justify-between items-center px-4 py-3 bg-white/90 backdrop-blur-md sticky top-0 z-20 border-b border-gray-100">
          <h1 className="text-lg font-black text-gray-800 tracking-tight">
            Campus<span className={themeCls.text}>Sync</span>
          </h1>
          <div className={`text-xs font-black px-2.5 py-1 rounded-full ${themeCls.lightBg} ${themeCls.text}`}>
            ★ {score} pt
          </div>
        </header>

        {/* スクロールコンテンツコンテナ */}
        <main className="flex-1 overflow-y-scroll pb-24 md:pb-8 px-4 pt-4 md:pt-6">
          {renderContent()}
        </main>

        {/* モバイルスマートフォンスクリーン用ボトムナビゲーションバー */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 w-full bg-white/95 backdrop-blur-md border-t border-gray-100 flex justify-around items-center h-16 pb-2 px-1 z-20 overflow-x-auto">
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

              {/* タッチ決済用模擬バーコードストリップ */}
              <div className="bg-white rounded-xl p-3.5 flex flex-col items-center gap-1.5">
                <div className="w-full h-9 flex justify-between items-center px-1">
                  {[2, 4, 1, 3, 2, 1, 4, 2, 3, 1, 2, 4, 1, 2, 3, 2, 1, 4, 2, 3, 1].map((w, idx) => (
                    <div key={idx} className="bg-black h-full" style={{ width: `${w * 1.3}px` }} />
                  ))}
                </div>
                <p className="text-[9px] font-mono font-black text-gray-400 tracking-widest">*{studentId}*</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 提出物詳細ビューポップアップモーダル */}
      {selectedTodo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-xs overflow-hidden shadow-xl">
            <div className={`p-4 ${selectedTodo.color.split(' ')[0]} bg-opacity-40 flex items-start gap-3`}>
              <div className="p-2.5 bg-white/60 rounded-xl"><selectedTodo.icon size={22} className={selectedTodo.color.split(' ')[1]} /></div>
              <div className="flex-1">
                <span className="text-[10px] font-black bg-white/80 px-2 py-0.5 rounded-md mb-1 inline-block text-gray-700">{selectedTodo.due}</span>
                <h3 className="text-xs font-black text-gray-900 leading-normal">{selectedTodo.title}</h3>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <h4 className="text-[10px] font-black text-gray-400 mb-1">タスク詳細及び指示事項</h4>
                <p className="text-xs text-gray-600 leading-relaxed font-medium">{selectedTodo.details}</p>
              </div>
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
                <select value={selectedRoomId} onChange={e => setSelectedRoomId(Number(e.target.value))} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold outline-none">
                  {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
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
              この室温ステータスで即時報告
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
          {label} {isVoted && <Check size={12} className="text-blue-500 font-black"/>}
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
    <button onClick={onClick} className="flex flex-col items-center justify-center w-14 pt-1 gap-0.5 flex-shrink-0">
      <div className={`transition-all ${isActive ? `${themeCls.text} transform -translate-y-0.5` : 'text-gray-400'}`}>
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
      <div className="flex-shrink-0">{icon}</div>
      <span className="truncate">{label}</span>
      {badge && <span className="ml-auto bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{badge}</span>}
    </button>
  );
}