'use client';

import React, { useState, useEffect } from 'react';
import { 
  Home, Utensils, BookOpen, Settings, Bell, CheckCircle, 
  Clock, FileText, Monitor, Wind, ThermometerSun, 
  ThermometerSnowflake, Search, Info, Users, Check, X, Plus, 
  ChevronRight, AlertTriangle, Sparkles, Star, MapPin, 
  QrCode, User, Palette, BellRing, Lock, Sparkle,
  Calendar, Bus, MessageSquare, Award, Heart, ThumbsUp,
  ChevronLeft, BookOpenCheck, ShieldAlert, GraduationCap,
  Volume2, Coffee, Moon, Sun, HelpCircle
} from 'lucide-react';

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
  { id: 1, title: '数学演習プリント P20-21', source: '紙プリント', type: 'paper', due: '本日中', color: 'bg-red-100 text-red-700', icon: FileText, details: '授業で配布されたプリントのP20〜21です。途中式も必ず書くこと。明日の朝のSHRで回収します。', completed: false },
  { id: 2, title: '英語エッセイ ドラフト提出', source: 'Classroom', type: 'classroom', due: '明日まで', color: 'bg-orange-100 text-orange-700', icon: Monitor, details: 'テーマ「My Future Goal」についてのドラフト（下書き）をGoogle Docsで作成し、Classroomの課題から提出してください。最低300語。', completed: false },
  { id: 3, title: '文化祭 参加希望アンケート', source: '生徒会', type: 'other', due: '金曜まで', color: 'bg-blue-100 text-blue-700', icon: Info, details: '文化祭の有志発表（バンド、ダンス等）に参加を希望する団体は、代表者がこのアンケートに回答してください。', completed: false },
  { id: 4, title: '現代文 短歌創作課題', source: '授業内指示', type: 'paper', due: '来週月曜', color: 'bg-purple-100 text-purple-700', icon: FileText, details: 'テーマは「青春」または「日常の発見」。原稿用紙1枚に短歌3首とそれぞれの解説文を記述。', completed: false },
  { id: 5, title: '物理基礎 実験レポート', source: 'Classroom', type: 'classroom', due: '金曜まで', color: 'bg-amber-100 text-amber-700', icon: Monitor, details: '先週行った「自由落下運動」の実験結果をスプレッドシートにまとめ、グラフを添付して提出。', completed: false },
];

const INITIAL_ROOMS = [
  { id: 1, name: '1-A教室', status: '快適', temp: '25℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 2, name: '1-B教室', status: '快適', temp: '26℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 3, name: '2-A教室', status: 'やや寒い', temp: '23℃', icon: Wind, color: 'text-cyan-500', bg: 'bg-cyan-50' },
  { id: 4, name: '3-C教室', status: '激暑', temp: '30℃', icon: ThermometerSun, color: 'text-red-500', bg: 'bg-red-50' },
  { id: 5, name: '図書室', status: 'やや寒い', temp: '24℃', icon: Wind, color: 'text-cyan-500', bg: 'bg-cyan-50' },
  { id: 6, name: '食堂', status: '快適', temp: '26℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
  { id: 7, name: '自習室', status: '快適', temp: '25℃', icon: ThermometerSnowflake, color: 'text-green-500', bg: 'bg-green-50' },
];

const MOCK_NOTIFICATIONS = [
  { id: 1, title: '明日の体育はグラウンドです（熱中症対策を万全に）', time: '10分前', isRead: false },
  { id: 2, title: '図書室の新着おすすめ本が入荷しました！', time: '1時間前', isRead: false },
  { id: 3, title: '【重要】週末の部活動のスクールバスダイヤ運行について', time: '昨日', isRead: true },
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

// --- 🚌 新機能：スクールバスダイヤ情報 ---
const MOCK_BUS_STATIONS = [
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

// 学食堂メニューの口コミ初期値
const INITIAL_CAFETERIA_REVIEWS = [
  { id: 1, menuId: 'soka', userName: '2年スキッパー', rating: 5, comment: '今日の創価ランチのチキン南蛮、タルタルソースが濃厚で最高に美味しかった！ボリュームも満点。', date: '今日 12:40' },
  { id: 2, menuId: 'noodles', userName: 'ラーメン大好き3回生', rating: 4, comment: '情熱ラーメンは安定の醤油ベース。トッピングのチャーシューがいつもより少し厚くて嬉しかった！', date: '今日 12:15' },
  { id: 3, menuId: 'snack', userName: '部活終わりの胃袋', rating: 5, comment: 'ポテトと唐揚げのセットは、昼休みだけでなく放課後の部活前の小腹満たしにも神。売り切れるのが早いのが玉にキズ。', date: '昨日' },
];

export default function CampusSyncApp() {
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
  const [userClass, setUserClass] = useState('1-A'); // 自動または手動割り当てクラス

  // --- ⏰ おせっかい通知リマインダー設定 ---
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderTimes, setReminderTimes] = useState<string[]>(['dayBefore', 'morningOf']);
  const [allowedNotificationDays, setAllowedNotificationDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

  // --- 各種動的ステート管理 ---
  const [todos, setTodos] = useState(INITIAL_TODOS);
  const [rooms, setRooms] = useState(INITIAL_ROOMS);
  const [favoriteRoomId, setFavoriteRoomId] = useState<number>(1);
  const [selectedRoomId, setSelectedRoomId] = useState<number>(1);
  const [selectedStatus, setSelectedStatus] = useState<string>('快適');

  // サブタブ管理
  const [cafeteriaSubTab, setCafeteriaSubTab] = useState<'overall' | 'menu' | 'reviews'>('overall');
  const [facilitiesSubTab, setFacilitiesSubTab] = useState<'status' | 'lost'>('status');
  const [busSubTab, setBusSubTab] = useState<'countdown' | 'report'>('countdown');

  // タイムテーブル用状態
  const [selectedWeekType, setSelectedWeekType] = useState<'A' | 'B'>('A');
  const [selectedDay, setSelectedDay] = useState<'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri'>('Mon');

  // バス用状態
  const [selectedBusStation, setSelectedBusStation] = useState<string>('hachioji');
  const [busCongestionVote, setBusCongestionVote] = useState<Record<string, string>>({ hachioji: '普通', haijima: '空いている', akitsu: '混雑' });
  const [busDelayMinutes, setBusDelayMinutes] = useState<Record<string, number>>({ hachioji: 0, haijima: 5, akitsu: 0 });

  // 部活動用状態
  const [clubNotes, setClubNotes] = useState(INITIAL_CLUB_NOTES);
  const [newClubName, setNewClubName] = useState('');
  const [newClubTitle, setNewClubTitle] = useState('');
  const [newClubContent, setNewClubContent] = useState('');

  // 学食レビュー用状態
  const [cafeteriaReviews, setCafeteriaReviews] = useState(INITIAL_CAFETERIA_REVIEWS);
  const [selectedMenuForReview, setSelectedMenuForReview] = useState<string>('soka');
  const [newReviewRating, setNewReviewRating] = useState<number>(5);
  const [newReviewComment, setNewReviewComment] = useState('');
  const [newReviewUser, setNewReviewUser] = useState('');

  // 学食投票関係
  const [crowdVotes, setCrowdVotes] = useState({ empty: 24, normal: 85, crowded: 42 });
  const [userVote, setUserVote] = useState<'empty' | 'normal' | 'crowded' | null>(null);

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

  // 落とし物関係
  const [lostAndFoundList, setLostAndFoundList] = useState(INITIAL_LOST_AND_FOUND);
  const [newLostTitle, setNewLostTitle] = useState('');
  const [newLostLocation, setNewLostLocation] = useState('');
  const [newLostDescription, setNewLostDescription] = useState('');
  const [newLostFinder, setNewLostFinder] = useState('');

  // 学籍番号に応じた自動期生・自動所属判別ロジックの強化
  useEffect(() => {
    const cleanId = studentId.trim();
    if (cleanId.length === 6) {
      const cohortDigits = cleanId.substring(0, 2);
      const classDigit = cleanId.substring(2, 3);
      if (/^\d+$/.test(cohortDigits) && /^\d+$/.test(classDigit)) {
        const parsedClass = `${classDigit}-A`; // 模擬的な自動クラス割り当て
        setUserClass(parsedClass);
      }
    }
  }, [studentId]);

  // 全体混雑パーセント計算
  const totalVotes = crowdVotes.empty + crowdVotes.normal + crowdVotes.crowded + (userVote ? 1 : 0);
  const getPercent = (val: number, key: string) => {
    const adjustedVal = val + (userVote === key ? 1 : 0);
    return Math.round((adjustedVal / totalVotes) * 100) || 0;
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
  const handleVote = (type: 'empty' | 'normal' | 'crowded') => {
    if (userVote !== type) {
      setUserVote(type);
      setScore(prev => Math.min(prev + 5, 100));
    } else {
      setUserVote(null);
      setScore(prev => Math.max(prev - 5, 0));
    }
  };

  const handleMenuVote = (menuId: string, type: 'empty' | 'normal' | 'crowded') => {
    if (soldOutItems[menuId]) return;
    const currentVote = userMenuVotes[menuId];
    setUserMenuVotes(prev => ({ ...prev, [menuId]: currentVote === type ? null : type }));

    if (currentVote !== type && !currentVote) {
      setScore(prev => Math.min(prev + 5, 100));
    } else if (currentVote === type) {
      setScore(prev => Math.max(prev - 5, 0));
    }
  };

  const toggleSoldOut = (menuId: string) => {
    const wasSoldOut = soldOutItems[menuId];
    setSoldOutItems(prev => ({ ...prev, [menuId]: !wasSoldOut }));
    if (!wasSoldOut) {
      setScore(prev => Math.min(prev + 10, 100));
      alert(`「${MENU_ITEMS.find(i => i.id === menuId)?.name}」の売り切れ報告を受理しました。貢献度+10pt！🎉`);
    } else {
      setScore(prev => Math.max(prev - 10, 0));
    }
  };

  const toggleTodoComplete = (todoId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setTodos(prev => prev.map(todo => {
      if (todo.id === todoId) {
        const nextState = !todo.completed;
        setScore(p => nextState ? Math.min(p + 10, 100) : Math.max(p - 10, 0));
        return { ...todo, completed: nextState };
      }
      return todo;
    }));
  };

  const handleAddLostItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLostTitle || !newLostLocation) {
      alert("「品名」と「見つけた場所」を入力してください。");
      return;
    }
    const newItem = {
      id: Date.now(),
      title: newLostTitle,
      location: newLostLocation,
      date: '今日 ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      description: newLostDescription || '詳細情報なし',
      finder: newLostFinder || 'その場付近にあります'
    };
    setLostAndFoundList([newItem, ...lostAndFoundList]);
    setScore(prev => Math.min(prev + 12, 100));
    setNewLostTitle(''); setNewLostLocation(''); setNewLostDescription(''); setNewLostFinder('');
    alert("落とし物情報を共有しました！貢献度+12pt！🎁");
  };

  const submitAcReport = () => {
    setRooms(prev => prev.map(room => {
      if (room.id === selectedRoomId) {
        let nextTemp = room.temp;
        let color = room.color;
        let bg = room.bg;
        let icon = room.icon;

        if (selectedStatus === '寒い') {
          nextTemp = (parseInt(room.temp) - 1) + '℃';
          color = 'text-cyan-500'; bg = 'bg-cyan-50'; icon = Wind;
        } else if (selectedStatus === '暑い') {
          nextTemp = (parseInt(room.temp) + 1) + '℃';
          color = 'text-red-500'; bg = 'bg-red-50'; icon = ThermometerSun;
        } else {
          nextTemp = '25℃';
          color = 'text-green-500'; bg = 'bg-green-50'; icon = ThermometerSnowflake;
        }
        return { ...room, status: selectedStatus, temp: nextTemp, icon, color, bg };
      }
      return room;
    }));
    setShowTempModal(false);
    setScore(prev => Math.min(prev + 10, 100));
    alert("エアコン状況のリアルタイム報告ありがとうございます！貢献度+10pt！🔥");
  };

  // --- 新機能用ハンドラー群 ---
  const handleVoteBusCongestion = (status: string) => {
    setBusCongestionVote(prev => ({ ...prev, [selectedBusStation]: status }));
    setScore(prev => Math.min(prev + 5, 100));
    alert(`バス混雑状況の報告ありがとうございます！`);
  };

  const handleReportBusDelay = (minutes: number) => {
    setBusDelayMinutes(prev => ({ ...prev, [selectedBusStation]: minutes }));
    setScore(prev => Math.min(prev + 10, 100));
    alert(`バスの遅延情報を共有しました。周囲の生徒に通知されます！(+10pt)`);
  };

  const handleAddClubNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClubName || !newClubTitle || !newClubContent) {
      alert("すべての項目を入力してください。");
      return;
    }
    const newNote = {
      id: Date.now(),
      clubName: newClubName,
      title: newClubTitle,
      date: '今日 ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content: newClubContent,
      author: studentName + ' より'
    };
    setClubNotes([newNote, ...clubNotes]);
    setScore(prev => Math.min(prev + 15, 100));
    setNewClubName(''); setNewClubTitle(''); setNewClubContent('');
    alert("部活動・委員会連絡ノートに新規書き込みを行いました！貢献度+15pt！🏸");
  };

  const handleAddReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReviewComment) {
      alert("コメントを入力してください。");
      return;
    }
    const newReview = {
      id: Date.now(),
      menuId: selectedMenuForReview,
      userName: newReviewUser.trim() || '匿名の創価生',
      rating: newReviewRating,
      comment: newReviewComment,
      date: '今日 ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setCafeteriaReviews([newReview, ...cafeteriaReviews]);
    setScore(prev => Math.min(prev + 8, 100));
    setNewReviewComment(''); setNewReviewUser('');
    alert("学食レビューを投稿しました！役立つ情報をありがとう！(+8pt)🍲");
  };

  const toggleReminderTime = (timeKey: string) => {
    setReminderTimes(prev => prev.includes(timeKey) ? prev.filter(t => t !== timeKey) : [...prev, timeKey]);
  };

  const toggleNotificationDay = (dayKey: string) => {
    setAllowedNotificationDays(prev => prev.includes(dayKey) ? prev.filter(d => d !== dayKey) : [...prev, dayKey]);
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
                <Bus className="mx-auto mb-1.5 text-amber-500" size={22} />
                <span className="text-xs font-black block">スクールバス</span>
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
              {MOCK_TIMETABLE_DATA[selectedWeekType][selectedDay].map((slot) => (
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
                      <span className="flex items-center gap-0.5"><MapPin size={12} /> {slot.room}</span>
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
                  <VoteBar label="空いていて快適" count={crowdVotes.empty} type="empty" userVote={userVote} percent={getPercent(crowdVotes.empty, 'empty')} color="bg-green-500" />
                  <VoteBar label="通常の混み具合" count={crowdVotes.normal} type="normal" userVote={userVote} percent={getPercent(crowdVotes.normal, 'normal')} color="bg-orange-400" />
                  <VoteBar label="大変混雑している" count={crowdVotes.crowded} type="crowded" userVote={userVote} percent={getPercent(crowdVotes.crowded, 'crowded')} color="bg-red-500" />
                </div>

                <p className="text-center text-xs font-black text-gray-500 mb-2.5">現在の混雑シチュエーションをワンタップ報告</p>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => handleVote('empty')} className={`py-2.5 text-xs font-black rounded-xl border transition-all ${userVote === 'empty' ? 'border-green-500 bg-green-50 text-green-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>空き</button>
                  <button onClick={() => handleVote('normal')} className={`py-2.5 text-xs font-black rounded-xl border transition-all ${userVote === 'normal' ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>普通</button>
                  <button onClick={() => handleVote('crowded')} className={`py-2.5 text-xs font-black rounded-xl border transition-all ${userVote === 'crowded' ? 'border-red-500 bg-red-50 text-red-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>激混み</button>
                </div>
              </section>
            )}

            {cafeteriaSubTab === 'menu' && (
              <div className="space-y-3">
                {MENU_ITEMS.map(item => {
                  const isSoldOut = soldOutItems[item.id];
                  const votes = menuVotes[item.id];
                  const userVoteItem = userMenuVotes[item.id];
                  const total = votes.empty + votes.normal + votes.crowded + (userVoteItem ? 1 : 0);
                  const getMenuPercent = (val: number, key: string) => {
                    if (isSoldOut) return 0;
                    return Math.round(((val + (userVoteItem === key ? 1 : 0)) / total) * 100) || 0;
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
                      {MENU_ITEMS.map(m => <option key={m.id} value={m.id}>{m.name.split('（')[0]}</option>)}
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
                    <input type="text" placeholder="キーワード・タイトル・著者名で探す..." className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/20" />
                    <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="min-w-[100px] text-center cursor-pointer group">
                        <div className="h-28 bg-gray-100 border rounded-xl mb-1.5 flex items-center justify-center text-gray-300 text-[10px] font-bold">BOOK COVER</div>
                        <h5 className="text-[10px] font-black line-clamp-2 text-gray-700 group-hover:text-indigo-600">新編 創価の栄光歴史学 {i}</h5>
                      </div>
                    ))}
                  </div>
                </section>

                <section className={`${cardBgClass} rounded-2xl p-4 border shadow-sm`}>
                  <h3 className="text-sm font-black text-teal-600 mb-2 flex items-center"><Monitor size={18} className="mr-1.5"/> パソコン自習室 空席状況</h3>
                  <div className="flex items-end justify-between mb-1.5">
                    <span className="text-xs font-bold text-gray-500">リアルタイムブース利用率</span>
                    <span className="text-xl font-black text-gray-800">22 <span className="text-xs font-bold text-gray-400">/ 35席</span></span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full" style={{ width: `${(22 / 35) * 100}%` }}></div>
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
                  <button type="submit" className={`w-full py-2.5 text-white font-black text-xs rounded-xl shadow-xs ${themeCls.bg} ${themeCls.bgHover}`}>
                    掲示板に登録して学校貢献度を獲得
                  </button>
                </form>

                {/* リスト表示 */}
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
                </div>
              </div>
            )}
          </div>
        );

      case 'bus':
        return (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
              <h2 className={`text-xl font-black ${activeTextClass}`}>スクールバス運行情報</h2>
              <div className="bg-gray-200/80 p-1 rounded-xl flex gap-1 text-xs font-bold">
                <button onClick={() => setBusSubTab('countdown')} className={`px-3 py-1.5 rounded-lg transition-all ${busSubTab === 'countdown' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>発車案内</button>
                <button onClick={() => setBusSubTab('report')} className={`px-3 py-1.5 rounded-lg transition-all ${busSubTab === 'report' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>状況報告</button>
              </div>
            </div>

            {/* 発車案内ステーション選択 */}
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

            {busSubTab === 'countdown' ? (
              <div className="space-y-3">
                {/* メイン運行ステータス表示カード */}
                <div className={`${cardBgClass} rounded-2xl p-5 border shadow-sm space-y-3.5`}>
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-black text-gray-800">
                      {MOCK_BUS_STATIONS.find(s => s.id === selectedBusStation)?.name}
                    </h3>
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full font-black">
                      遅延: {busDelayMinutes[selectedBusStation]} 分
                    </span>
                  </div>

                  <div className="bg-gray-50 rounded-2xl p-4 text-center border">
                    <span className="text-xs font-bold text-gray-400 block mb-0.5">次発バス発車時刻</span>
                    <span className="text-3xl font-black text-gray-900 tracking-wide">16:20</span>
                    <span className="text-xs font-black text-amber-600 block mt-1">🕒 およそ あと 12 分で発車</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center text-xs font-bold">
                    <div className="bg-gray-50 p-2 rounded-xl border">
                      <span className="text-gray-400 text-[10px] block">生徒報告の混雑度</span>
                      <span className="text-gray-700 font-black">{busCongestionVote[selectedBusStation]}</span>
                    </div>
                    <div className="bg-gray-50 p-2 rounded-xl border">
                      <span className="text-gray-400 text-[10px] block">後発予定便</span>
                      <span className="text-gray-700 font-black">16:40 / 17:00</span>
                    </div>
                  </div>
                </div>

                {/* 時刻表リスト一覧 */}
                <div className={`${cardBgClass} rounded-2xl p-4 border shadow-sm`}>
                  <h4 className="text-xs font-black text-gray-400 mb-2.5">本日の全出発ダイヤ一覧</h4>
                  <div className="grid grid-cols-4 gap-2">
                    {MOCK_BUS_STATIONS.find(s => s.id === selectedBusStation)?.departures.map(t => (
                      <div key={t} className="bg-gray-50 py-1.5 rounded-lg text-center border text-xs font-mono font-bold text-gray-700">
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* 生徒同士の運行・混雑状況報告機能 */
              <div className={`${cardBgClass} rounded-2xl p-5 border shadow-sm space-y-4 animate-in fade-in duration-200`}>
                <h3 className="text-sm font-black flex items-center gap-1.5 text-amber-600"><AlertTriangle size={17}/> スクールバス運行のリアルタイム共有報告</h3>
                <p className="text-xs text-gray-500 font-medium">現在バス停やロータリーに並んでいる創価生は、後輩や同級生のために現在の生の情報を提供してください。</p>
                
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
            {MOCK_NOTIFICATIONS.map(note => (
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
                  <p className="text-[10px] text-gray-400 font-medium">学籍番号に基づいて期生が自動パースされます</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 block mb-1">氏名設定</label>
                    <input type="text" value={studentName} onChange={e => setStudentName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-black outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 block mb-1">割り当てクラス</label>
                    <input type="text" value={userClass} readOnly className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-xs font-black text-gray-500 cursor-not-allowed outline-none" />
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
              <SidebarItem icon={<Bus size={18} />} label="スクールバス" isActive={activeTab === 'bus'} onClick={() => setActiveTab('bus')} themeCls={themeCls} />
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
          <NavItem icon={<Bus size={20} />} label="バス" isActive={activeTab === 'bus'} onClick={() => setActiveTab('bus')} themeCls={themeCls} />
          <NavItem icon={<Settings size={20} />} label="設定" isActive={activeTab === 'settings'} onClick={() => setActiveTab('settings')} themeCls={themeCls} />
        </nav>
      </div>

      {/* --- アプリケーションモーダルUIコンポーネント群 --- */}

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
        <span className="text-gray-400 font-bold">{count + (isVoted ? 1 : 0)}人 <span className="text-gray-300">({percent}%)</span></span>
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