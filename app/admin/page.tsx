'use client';


import { ContributionRankAdminGuide } from '@/components/ContributionRanks';
import { CampusSyncLogo } from '@/components/CampusSyncLogo';
import ChatModerationAdmin from '@/components/ChatModerationAdmin';
import StudentProfileExportAdmin from '@/components/StudentProfileExportAdmin';
import ClubNotesAdmin from '@/components/ClubNotesAdmin';
import React, { useEffect, useState } from 'react';
import {
  supabase } from '@/lib/supabase';
import { 
  LayoutDashboard, Megaphone, FilePlus, Package, Thermometer,
  Check, ClipboardList, Plus, Trash2, UserCheck,
  AlertCircle, Send, Search, Utensils, Clock,
  BellRing, Save, RefreshCw, History, MessageSquare
} from 'lucide-react';
import {
  LibraryBooksIcon as BookOpen, SoldOutIcon as Ban, LostApprovalIcon as CheckCircle2,
  OfficeDeskIcon as ShieldAlert, MenuCalendarIcon as CalendarDays, StudyRoomIcon as Monitor
} from '@/components/CampusIcons';

// 生徒が実際に保存したroom_statusから、現在未解決の暑さ・寒さ報告を表示する。
type AdminACReport = {
  id: string;
  roomId: string;
  room: string;
  issue: string;
  temp: string;
  status: 'pending';
  updatedAt: string;
};

// 学食メニュー名・価格・栄養情報は、月間献立表の当日分から取得する。
type AdminCafeteriaMenuItem = {
  id: string;
  name: string;
  price: string;
  calorie: string;
  allergy: string;
  isSoldOut: boolean;
  userReports: number;
};

const CAFETERIA_CONTROL_CATEGORIES = [
  { id: 'soka', nameField: 'soka_lunch', priceField: 'soka_lunch_price', calorieField: 'soka_lunch_calorie', allergyField: 'soka_lunch_allergy', label: '創価ランチ' },
  { id: 'healthy', nameField: 'healthy_lunch', priceField: 'healthy_lunch_price', calorieField: 'healthy_lunch_calorie', allergyField: 'healthy_lunch_allergy', label: 'ヘルシーランチ' },
  { id: 'snack', nameField: 'snack_lunch', priceField: 'snack_lunch_price', calorieField: 'snack_lunch_calorie', allergyField: 'snack_lunch_allergy', label: 'スナックランチ' },
  { id: 'curry', nameField: 'curry', priceField: 'curry_price', calorieField: 'curry_calorie', allergyField: 'curry_allergy', label: 'カレー' },
  { id: 'noodles', nameField: 'noodles', priceField: 'noodles_price', calorieField: 'noodles_calorie', allergyField: 'noodles_allergy', label: '麺類' },
] as const;

const getTokyoDateKey = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

// Supabaseの同じレコードを生徒画面・Admin画面で共有する落とし物データ
type AdminLostReport = {
  id: string | number;
  title: string;
  location: string;
  finder: string;
  description?: string | null;
  student_id?: string | null;
  reporter?: string | null;
  status: 'pending' | 'approved' | 'returned';
  date: string;
  created_at?: string;
};
const INITIAL_LOST_REPORTS: AdminLostReport[] = [];


const MENU_CATEGORIES = [
  { key: 'soka_lunch', label: '創価ランチ' },
  { key: 'healthy_lunch', label: 'ヘルシーランチ' },
  { key: 'snack_lunch', label: 'スナックランチ' },
  { key: 'curry', label: 'カレー' },
  { key: 'noodles', label: '麺類' },
] as const;

type MenuCategoryKey = typeof MENU_CATEGORIES[number]['key'];

type MenuDetailsSuffix = 'price' | 'calorie' | 'allergy';
type MenuDetailsField = `${MenuCategoryKey}_${MenuDetailsSuffix}`;

type DailyMenuRow = {
  service_date: string;
  soka_lunch: string;
  healthy_lunch: string;
  snack_lunch: string;
  curry: string;
  noodles: string;
  soka_lunch_price: string;
  soka_lunch_calorie: string;
  soka_lunch_allergy: string;
  healthy_lunch_price: string;
  healthy_lunch_calorie: string;
  healthy_lunch_allergy: string;
  snack_lunch_price: string;
  snack_lunch_calorie: string;
  snack_lunch_allergy: string;
  curry_price: string;
  curry_calorie: string;
  curry_allergy: string;
  noodles_price: string;
  noodles_calorie: string;
  noodles_allergy: string;
  is_closed: boolean;
  note: string;
};

const getNextMonthValue = (): string => {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const createEmptyMonthRows = (monthValue: string): DailyMenuRow[] => {
  const match = /^(\d{4})-(\d{2})$/.exec(monthValue);
  if (!match) return [];

  const year = Number(match[1]);
  const month = Number(match[2]);
  const daysInMonth = new Date(year, month, 0).getDate();

  return Array.from({ length: daysInMonth }, (_, index) => ({
    service_date: `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
    soka_lunch: '',
    healthy_lunch: '',
    snack_lunch: '',
    curry: '',
    noodles: '',
    soka_lunch_price: '',
    soka_lunch_calorie: '',
    soka_lunch_allergy: '',
    healthy_lunch_price: '',
    healthy_lunch_calorie: '',
    healthy_lunch_allergy: '',
    snack_lunch_price: '',
    snack_lunch_calorie: '',
    snack_lunch_allergy: '',
    curry_price: '',
    curry_calorie: '',
    curry_allergy: '',
    noodles_price: '',
    noodles_calorie: '',
    noodles_allergy: '',
    is_closed: false,
    note: '',
  }));
};

const getJapaneseWeekday = (dateValue: string): string => {
  const day = new Date(`${dateValue}T00:00:00`).getDay();
  return ['日', '月', '火', '水', '木', '金', '土'][day];
};

// Supabase/PostgRESTのエラーは通常のErrorインスタンスとは限らないため、
// message/code/details/hintを読み取って管理画面に表示します。
const formatErrorDetails = (error: unknown): string => {
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    const parts = [
      typeof value.message === 'string' && value.message.trim() ? value.message.trim() : '',
      typeof value.code === 'string' && value.code.trim() ? `コード: ${value.code.trim()}` : '',
      typeof value.details === 'string' && value.details.trim() ? `詳細: ${value.details.trim()}` : '',
      typeof value.hint === 'string' && value.hint.trim() ? `ヒント: ${value.hint.trim()}` : '',
    ].filter(Boolean);
    if (parts.length) return parts.join(' / ');
    try { return JSON.stringify(error); } catch { return '詳細を読み取れないエラー'; }
  }
  if (error instanceof Error) return error.message;
  return String(error);
};

type LibraryBook = {
  id: string;
  title: string;
  author: string;
  code: string;
  status: string;
  cover_url?: string | null;
  created_at?: string;
};


type CampusAssignment = {
  id: string;
  title: string;
  details: string;
  source: string;
  type: string;
  due_at: string | null;
  due?: string | null;
  is_active: boolean;
  created_at?: string;
  classroom_course_id?: string | null;
  classroom_coursework_id?: string | null;
};

const toAdminDateTimeInput = (value: string | null | undefined): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const LINE_NOTICE_TEMPLATES = [
  {
    id: 'cafeteria',
    label: '学食の混雑',
    title: '学食の混雑について',
    message: '現在、学食が混雑しています。時間に余裕をもって利用するなど、混雑緩和にご協力ください。',
  },
  {
    id: 'bus',
    label: '電車の遅延・運行情報',
    title: '電車の遅延・運行情報',
    message: '電車の運行に遅れが発生している可能性があります。利用する路線の最新の運行情報を確認し、時間に余裕をもって行動してください。',
  },
  {
    id: 'lost',
    label: '落とし物',
    title: '落とし物のお知らせ',
    message: '学校内で落とし物が届けられています。心当たりのある方は、学校の窓口へお問い合わせください。',
  },
  {
    id: 'event',
    label: '行事・学校からのお知らせ',
    title: '学校からのお知らせ',
    message: '学校からのお知らせです。内容を確認してください。',
  },
  {
    id: 'urgent',
    label: '重要なお知らせ',
    title: '重要なお知らせ',
    message: '【配信前に編集してください】重要なお知らせの内容を入力してください。',
  },
] as const;

type LineBroadcastHistoryRow = {
  id: string;
  title: string;
  message: string;
  status: string;
  sent_at: string;
};

const uploadLibraryCoverImage = async (file: File): Promise<string> => {
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage
    .from('library-covers')
    .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false });

  if (error) throw new Error(error.message);
  return supabase.storage.from('library-covers').getPublicUrl(path).data.publicUrl;
};

// 4. 図書室の管理（貸出遅れ・蔵書登録）
const INITIAL_LIBRARY_OVERDUES = [
  { id: 1, title: 'ハリー・ポッターと賢者の石', borrower: '2年C組 鈴木一郎', overDays: 5, notified: false },
  { id: 2, title: 'よくわかるTypeScript入門', borrower: '3年A組 高橋二郎', overDays: 12, notified: false },
];

export default function CampusSyncAdmin() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // 各種ステート管理
  const [acReports, setAcReports] = useState<AdminACReport[]>([]);
  const [acReportsLoading, setAcReportsLoading] = useState(false);
  const [acReportsMessage, setAcReportsMessage] = useState('');
  const [acReportSavingId, setAcReportSavingId] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<AdminCafeteriaMenuItem[]>([]);
  const [cafeteriaControlLoading, setCafeteriaControlLoading] = useState(false);
  const [cafeteriaControlSavingId, setCafeteriaControlSavingId] = useState<string | null>(null);
  const [cafeteriaControlMessage, setCafeteriaControlMessage] = useState('');
  const [cafeteriaLineRetryItem, setCafeteriaLineRetryItem] = useState<AdminCafeteriaMenuItem | null>(null);
  const [lostItems, setLostItems] = useState<AdminLostReport[]>(INITIAL_LOST_REPORTS);
  const [lostLoading, setLostLoading] = useState(false);
  const [lostMessage, setLostMessage] = useState('');
  const [overdues, setOverdues] = useState(INITIAL_LIBRARY_OVERDUES);


  // 学生全員に共有する課題・提出期限
  const [assignmentRows, setAssignmentRows] = useState<CampusAssignment[]>([]);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState('');
  const [adminApiPassword, setAdminApiPassword] = useState('');
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentDetails, setAssignmentDetails] = useState('');
  const [assignmentType, setAssignmentType] = useState('paper');
  const [assignmentDueAt, setAssignmentDueAt] = useState('');

  // 月間献立表（デフォルトは翌月）
  const [selectedMenuMonth, setSelectedMenuMonth] = useState(getNextMonthValue);
  const [dailyMenuRows, setDailyMenuRows] = useState<DailyMenuRow[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuSaving, setMenuSaving] = useState(false);
  const [menuMessage, setMenuMessage] = useState('');

  // 学食おすすめ告知（Supabaseで生徒サイトと共有）
  const [cafeteriaAnnouncementText, setCafeteriaAnnouncementText] = useState('');
  const [cafeteriaAnnouncementSaving, setCafeteriaAnnouncementSaving] = useState(false);
  const [cafeteriaAnnouncementMessage, setCafeteriaAnnouncementMessage] = useState('');
  const [cafeteriaAnnouncementPublished, setCafeteriaAnnouncementPublished] = useState(false);
  const [cafeteriaAnnouncementAlsoSendLine, setCafeteriaAnnouncementAlsoSendLine] = useState(false);
  const [cafeteriaAnnouncementLinePassword, setCafeteriaAnnouncementLinePassword] = useState('');

  // キャリアセンター自習室の座席状況（生徒用サイトとSupabaseで共有）
  const [studyRoomOccupiedSeats, setStudyRoomOccupiedSeats] = useState(22);
  const [studyRoomTotalSeats, setStudyRoomTotalSeats] = useState(35);
  const [studyRoomLoading, setStudyRoomLoading] = useState(true);
  const [studyRoomSaving, setStudyRoomSaving] = useState(false);
  const [studyRoomMessage, setStudyRoomMessage] = useState('');

  // LINE公式アカウントへの全体配信（配信パスコードはサーバー側で検証）
  const [lineBroadcastPassword, setLineBroadcastPassword] = useState('');
  const [lineBroadcasting, setLineBroadcasting] = useState(false);
  const [lineBroadcastMessage, setLineBroadcastMessage] = useState('');
  const [lineNoticeTemplate, setLineNoticeTemplate] = useState('custom');
  const [lineNoticeTitle, setLineNoticeTitle] = useState('');
  const [lineNoticeText, setLineNoticeText] = useState('');
  const [lineBroadcastHistory, setLineBroadcastHistory] = useState<LineBroadcastHistoryRow[]>([]);
  const [lineHistoryLoading, setLineHistoryLoading] = useState(true);
  const [lineHistoryMessage, setLineHistoryMessage] = useState('');
  const [lineHistoryRefreshKey, setLineHistoryRefreshKey] = useState(0);
  const [trainTimetableSending, setTrainTimetableSending] = useState(false);
  const [trainTimetableMessage, setTrainTimetableMessage] = useState('');

  // Supabase共有の蔵書管理
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [booksMessage, setBooksMessage] = useState('');
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookAuthor, setNewBookAuthor] = useState('');
  const [newBookCover, setNewBookCover] = useState<File | null>(null);
  const [newBookCoverPreview, setNewBookCoverPreview] = useState('');
  const [bookRegistering, setBookRegistering] = useState(false);
  const [updatingCoverBookId, setUpdatingCoverBookId] = useState<string | null>(null);
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'dashboard') return;
    let cancelled = false;

    const loadACReports = async () => {
      setAcReportsLoading(true);
      setAcReportsMessage('');
      const { data, error } = await supabase
        .from('room_status')
        .select('room_id, room_name, status, temp, updated_at')
        .order('updated_at', { ascending: false });

      if (cancelled) return;
      if (error) {
        console.error('生徒のエアコン報告を取得できません:', error);
        setAcReports([]);
        setAcReportsMessage('エアコン報告を読み込めません。Supabaseのroom_statusテーブルとRLS設定を確認してください。');
      } else {
        const reports: AdminACReport[] = (data || [])
          .filter((row: any) => ['寒い', 'やや寒い', '暑い', '激暑'].includes(String(row.status || '')))
          .map((row: any) => ({
            id: String(row.room_id),
            roomId: String(row.room_id),
            room: String(row.room_name || `教室 ${row.room_id}`),
            issue: String(row.status),
            temp: String(row.temp || '未記録'),
            status: 'pending' as const,
            updatedAt: row.updated_at
              ? new Date(row.updated_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              : '日時不明',
          }));
        setAcReports(reports);
        setAcReportsMessage('');
      }
      setAcReportsLoading(false);
    };

    void loadACReports();
    return () => { cancelled = true; };
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    const loadCafeteriaAnnouncement = async () => {
      const { data, error } = await supabase
        .from('cafeteria_announcements')
        .select('id, message, show_popup, show_banner, updated_at')
        .eq('id', 1)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error('学食おすすめのお知らせ取得に失敗:', error);
        setCafeteriaAnnouncementMessage('お知らせ設定を読み込めません。先にSQLを実行してください。');
      } else if (data) {
        setCafeteriaAnnouncementText(data.message || '');
        setCafeteriaAnnouncementPublished(Boolean(data.show_banner || data.show_popup));
        setCafeteriaAnnouncementMessage('');
      }
    };
    void loadCafeteriaAnnouncement();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadHistory = async () => {
      setLineHistoryLoading(true);
      const { data, error } = await supabase
        .from('line_broadcast_history')
        .select('id, title, message, status, sent_at')
        .order('sent_at', { ascending: false })
        .limit(20);

      if (cancelled) return;
      if (error) {
        console.error('LINE配信履歴の取得に失敗:', error);
        setLineBroadcastHistory([]);
        setLineHistoryMessage('配信履歴を読み込めません。SQLを実行したか確認してください。');
      } else {
        setLineBroadcastHistory((data || []) as LineBroadcastHistoryRow[]);
        setLineHistoryMessage('');
      }
      setLineHistoryLoading(false);
    };

    void loadHistory();
    return () => { cancelled = true; };
  }, [lineHistoryRefreshKey]);

  useEffect(() => {
    if (!newBookCover) {
      setNewBookCoverPreview('');
      return;
    }
    const previewUrl = URL.createObjectURL(newBookCover);
    setNewBookCoverPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [newBookCover]);

  useEffect(() => {
    let cancelled = false;
    const loadStudyRoomStatus = async () => {
      setStudyRoomLoading(true);
      const { data, error } = await supabase
        .from('study_room_status')
        .select('room_key, room_name, occupied_seats, total_seats, updated_at')
        .eq('room_key', 'career_center')
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error('キャリアセンター自習室の状況取得に失敗:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        setStudyRoomMessage(`設定の読み込みに失敗しました: ${formatErrorDetails(error)}`);
      } else if (data) {
        setStudyRoomOccupiedSeats(Number(data.occupied_seats));
        setStudyRoomTotalSeats(Number(data.total_seats));
        setStudyRoomMessage('');
      }
      setStudyRoomLoading(false);
    };

    void loadStudyRoomStatus();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadBooks = async () => {
      setBooksLoading(true);
      const { data, error } = await supabase
        .from('library_books')
        .select('id, title, author, code, status, cover_url, created_at')
        .order('created_at', { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error('蔵書一覧の取得に失敗:', error);
        setBooksMessage('蔵書を取得できません。library_books テーブルとRLSを確認してください。');
      } else {
        setBooks(data ?? []);
        setBooksMessage('');
      }
      setBooksLoading(false);
    };

    void loadBooks();
    return () => {
      cancelled = true;
    };
  }, []);

  // 売切管理は、月間献立表の当日分とSupabaseの正式な売切状態・実際の生徒報告を使う。
  useEffect(() => {
    if (activeTab !== 'cafeteria') return;
    let cancelled = false;

    const loadTodayCafeteria = async () => {
      setCafeteriaControlLoading(true);
      setCafeteriaControlMessage('');
      const today = getTokyoDateKey();
      const [menuResult, soldOutResult, reportsResult] = await Promise.all([
        supabase.from('cafeteria_daily_menus').select('*').eq('service_date', today).maybeSingle(),
        supabase.from('cafeteria_sold_out').select('menu_id, is_sold_out'),
        supabase.rpc('get_cafeteria_sold_out_report_counts', { p_service_date: today }),
      ]);
      if (cancelled) return;

      if (menuResult.error) {
        console.error('管理画面の本日献立取得に失敗:', menuResult.error);
        setMenuItems([]);
        setCafeteriaControlMessage('本日の献立を取得できません。月間献立表とSupabaseの設定を確認してください。');
        setCafeteriaControlLoading(false);
        return;
      }

      const soldOutById: Record<string, boolean> = {};
      if (soldOutResult.data) {
        for (const row of soldOutResult.data) {
          soldOutById[String(row.menu_id)] = row.is_sold_out === true;
        }
      }

      const reportsById: Record<string, number> = {};
      if (reportsResult.error) {
        console.error('実際の売切報告取得に失敗:', reportsResult.error);
      } else {
        for (const report of reportsResult.data || []) {
          reportsById[String(report.menu_id)] = Number(report.report_count) || 0;
        }
      }

      const saved = menuResult.data;
      const currentMenuItems: AdminCafeteriaMenuItem[] = saved && !saved.is_closed
        ? CAFETERIA_CONTROL_CATEGORIES.flatMap(category => {
            const name = String(saved[category.nameField] || '').trim();
            if (!name) return [];
            return [{
              id: category.id,
              name,
              price: String(saved[category.priceField] || ''),
              calorie: String(saved[category.calorieField] || ''),
              allergy: String(saved[category.allergyField] || ''),
              isSoldOut: soldOutById[category.id] === true,
              userReports: reportsById[category.id] || 0,
            }];
          })
        : [];

      setMenuItems(currentMenuItems);
      if (reportsResult.error) {
        setCafeteriaControlMessage('本日の献立・売切状態は読み込みましたが、売切報告件数を取得できません。supabase/cafeteria-menu-metadata.sql を実行してください。');
      } else if (!saved) {
        setCafeteriaControlMessage('本日の献立は未登録です。「月間献立表の管理」で本日の日付に献立を入力して保存してください。');
      } else if (saved.is_closed) {
        setCafeteriaControlMessage('本日は学食の営業がありません。');
      } else if (currentMenuItems.length === 0) {
        setCafeteriaControlMessage('本日の献立にメニューがありません。「月間献立表の管理」で入力して保存してください。');
      } else {
        setCafeteriaControlMessage('');
      }
      setCafeteriaControlLoading(false);
    };

    void loadTodayCafeteria();
    return () => { cancelled = true; };
  }, [activeTab]);

  // 指定月の献立データをSupabaseから読み込む
  useEffect(() => {
    let cancelled = false;

    const loadMonthMenus = async () => {
      setMenuLoading(true);
      setMenuMessage('');
      setDailyMenuRows(createEmptyMonthRows(selectedMenuMonth));

      const [yearText, monthText] = selectedMenuMonth.split('-');
      const year = Number(yearText);
      const month = Number(monthText);
      const lastDay = new Date(year, month, 0).getDate();
      const startDate = `${selectedMenuMonth}-01`;
      const endDate = `${selectedMenuMonth}-${String(lastDay).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('cafeteria_daily_menus')
        .select('*')
        .gte('service_date', startDate)
        .lte('service_date', endDate)
        .order('service_date', { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error('月間献立の取得に失敗:', error);
        setMenuMessage('献立データを取得できませんでした。SQLで cafeteria_daily_menus テーブルを作成したか確認してください。');
        setMenuLoading(false);
        return;
      }

      const rows = createEmptyMonthRows(selectedMenuMonth);
      const savedByDate = new Map<string, any>((data ?? []).map((row: any) => [String(row.service_date), row] as [string, any]));

      setDailyMenuRows(rows.map(blankRow => {
        const saved = savedByDate.get(blankRow.service_date) as any | undefined;
        if (!saved) return blankRow;

        return {
          ...blankRow,
          soka_lunch: saved.soka_lunch ?? '',
          healthy_lunch: saved.healthy_lunch ?? '',
          snack_lunch: saved.snack_lunch ?? '',
          curry: saved.curry ?? '',
          noodles: saved.noodles ?? '',
          soka_lunch_price: saved.soka_lunch_price ?? '',
          soka_lunch_calorie: saved.soka_lunch_calorie ?? '',
          soka_lunch_allergy: saved.soka_lunch_allergy ?? '',
          healthy_lunch_price: saved.healthy_lunch_price ?? '',
          healthy_lunch_calorie: saved.healthy_lunch_calorie ?? '',
          healthy_lunch_allergy: saved.healthy_lunch_allergy ?? '',
          snack_lunch_price: saved.snack_lunch_price ?? '',
          snack_lunch_calorie: saved.snack_lunch_calorie ?? '',
          snack_lunch_allergy: saved.snack_lunch_allergy ?? '',
          curry_price: saved.curry_price ?? '',
          curry_calorie: saved.curry_calorie ?? '',
          curry_allergy: saved.curry_allergy ?? '',
          noodles_price: saved.noodles_price ?? '',
          noodles_calorie: saved.noodles_calorie ?? '',
          noodles_allergy: saved.noodles_allergy ?? '',
          is_closed: Boolean(saved.is_closed),
          note: saved.note ?? '',
        };
      }));

      setMenuLoading(false);
    };

    void loadMonthMenus();

    return () => {
      cancelled = true;
    };
  }, [selectedMenuMonth]);

  const updateDailyMenuRow = (
    serviceDate: string,
    patch: Partial<DailyMenuRow>
  ) => {
    setDailyMenuRows(prev => prev.map(row =>
      row.service_date === serviceDate ? { ...row, ...patch } : row
    ));
    setMenuMessage('');
  };

  // 選択月の献立をまとめてSupabaseへ保存
  const handleSaveMonthlyMenus = async () => {
    if (!selectedMenuMonth || dailyMenuRows.length === 0) {
      setMenuMessage('保存する月を選択してください。');
      return;
    }

    setMenuSaving(true);
    setMenuMessage('');

    const rowsToSave = dailyMenuRows.map(row => ({
      ...row,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('cafeteria_daily_menus')
      .upsert(rowsToSave, { onConflict: 'service_date' });

    setMenuSaving(false);

    if (error) {
      console.error('月間献立の保存に失敗:', error);
      setMenuMessage(`保存に失敗しました: ${error.message}`);
      return;
    }

    setMenuMessage(`${selectedMenuMonth.replace('-', '年')}月の献立を${dailyMenuRows.length}日分保存しました。`);
  };

  // おすすめ告知を保存し、ポップアップと学食タブのバナーを同時に有効化する
  const handlePublishCafeteriaAnnouncement = async () => {
    const message = cafeteriaAnnouncementText.trim();
    if (!message) {
      setCafeteriaAnnouncementMessage('おすすめのお知らせ内容を入力してください。');
      return;
    }
    if (message.length > 500) {
      setCafeteriaAnnouncementMessage('お知らせは500文字以内で入力してください。');
      return;
    }
    if (cafeteriaAnnouncementAlsoSendLine) {
      if (!cafeteriaAnnouncementLinePassword) {
        setCafeteriaAnnouncementMessage('LINEにも配信する場合は、配信認証コードを入力してください。');
        return;
      }
      const confirmed = window.confirm(
        `次のお知らせを生徒サイトに掲載し、LINE公式アカウントの友だち全員へ一斉配信します。\n\n${message}\n\nLINE配信通数が発生する場合があります。本当に配信しますか？`
      );
      if (!confirmed) return;
    }

    setCafeteriaAnnouncementSaving(true);
    setCafeteriaAnnouncementMessage('');
    try {
      const { error } = await supabase
        .from('cafeteria_announcements')
        .upsert({
          id: 1,
          message,
          show_popup: true,
          show_banner: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

      if (error) {
        console.error('学食おすすめのお知らせ保存に失敗:', error);
        setCafeteriaAnnouncementMessage(`保存に失敗しました: ${error.message}（SQL・RLS設定を確認してください）`);
        return;
      }
      setCafeteriaAnnouncementText(message);
      setCafeteriaAnnouncementPublished(true);

      if (cafeteriaAnnouncementAlsoSendLine) {
        const lineResponse = await fetch('/api/line-broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password: cafeteriaAnnouncementLinePassword,
            title: '学食からのお知らせ',
            message,
          }),
          cache: 'no-store',
        });
        const lineResult = await lineResponse.json().catch(() => null);
        if (!lineResponse.ok || !lineResult?.success) {
          setCafeteriaAnnouncementMessage(
            `生徒サイトへの掲載は完了しましたが、LINE配信は失敗しました。${lineResult?.message || `HTTP ${lineResponse.status}`}`
          );
          return;
        }
        setCafeteriaAnnouncementLinePassword('');
        setCafeteriaAnnouncementAlsoSendLine(false);
        setLineHistoryRefreshKey(key => key + 1);
        setCafeteriaAnnouncementMessage('生徒サイトに掲載し、LINE公式アカウントの友だちへ配信しました。');
        return;
      }

      setCafeteriaAnnouncementMessage('掲載しました。生徒サイトのポップアップと学食タブのバナーに反映されます。');
    } catch (error) {
      console.error('学食おすすめのお知らせ保存中にエラー:', error);
      setCafeteriaAnnouncementMessage(`保存に失敗しました: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
    } finally {
      setCafeteriaAnnouncementSaving(false);
    }
  };

  // 現在のお知らせ表示を停止する
  const handleUnpublishCafeteriaAnnouncement = async () => {
    setCafeteriaAnnouncementSaving(true);
    setCafeteriaAnnouncementMessage('');
    try {
      const { error } = await supabase
        .from('cafeteria_announcements')
        .upsert({
          id: 1,
          message: cafeteriaAnnouncementText.trim(),
          show_popup: false,
          show_banner: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      if (error) {
        console.error('学食おすすめのお知らせ停止に失敗:', error);
        setCafeteriaAnnouncementMessage(`掲載停止に失敗しました: ${error.message}`);
        return;
      }
      setCafeteriaAnnouncementPublished(false);
      setCafeteriaAnnouncementMessage('生徒サイトでのポップアップとバナー掲載を停止しました。');
    } catch (error) {
      console.error('学食おすすめのお知らせ停止中にエラー:', error);
      setCafeteriaAnnouncementMessage(`掲載停止に失敗しました: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
    } finally {
      setCafeteriaAnnouncementSaving(false);
    }
  };

  // テンプレートをフォームに読み込む（読み込んだ後も自由に編集できます）
  const applyLineNoticeTemplate = (templateId: string) => {
    setLineNoticeTemplate(templateId);
    const template = LINE_NOTICE_TEMPLATES.find(item => item.id === templateId);
    if (template) {
      setLineNoticeTitle(template.title);
      setLineNoticeText(template.message);
    } else {
      setLineNoticeTitle('');
      setLineNoticeText('');
    }
    setLineBroadcastMessage('');
  };

  // 自由入力したお知らせをLINE公式アカウントの友だち全員へ配信
  const handleSendLineNotice = async () => {
    if (lineBroadcasting) return;
    if (!lineBroadcastPassword.trim()) {
      setLineBroadcastMessage('配信認証コードを入力してください。');
      return;
    }
    if (!lineNoticeTitle.trim()) {
      setLineBroadcastMessage('お知らせのタイトルを入力してください。');
      return;
    }
    if (!lineNoticeText.trim()) {
      setLineBroadcastMessage('LINEで送る文章を入力してください。');
      return;
    }

    if (Array.from(lineNoticeTitle.trim()).length > 100 || Array.from(lineNoticeText.trim()).length > 1800) {
      setLineBroadcastMessage('Flex Messageのタイトルは100文字以内、本文は1,800文字以内にしてください。');
      return;
    }

    setLineBroadcasting(true);
    setLineBroadcastMessage('');
    try {
      const response = await fetch('/api/line-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: lineBroadcastPassword,
          title: lineNoticeTitle.trim(),
          message: lineNoticeText.trim(),
        }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result) {
        setLineBroadcastMessage(result?.message || `LINE配信に失敗しました（HTTP ${response.status}）。`);
        return;
      }

      setLineBroadcastMessage(result.message || (result.success ? 'LINE配信が完了しました。' : 'LINE配信に失敗しました。'));
      if (result.success) {
        setLineBroadcastPassword('');
        setLineHistoryRefreshKey(key => key + 1);
      }
    } catch (error) {
      console.error('LINEお知らせ配信エラー:', error);
      setLineBroadcastMessage('LINE配信に失敗しました。環境変数とLINE Developersの設定を確認してください。');
    } finally {
      setLineBroadcasting(false);
    }
  };

  // 生徒の実際のroom_statusを快適へ更新し、解決状態を生徒画面にも反映する。
  const handleResolveAC = async (id: string) => {
    const report = acReports.find(item => item.id === id);
    if (!report || acReportSavingId) return;

    setAcReportSavingId(id);
    setAcReportsMessage('');
    const { error } = await supabase
      .from('room_status')
      .update({ status: '快適', updated_at: new Date().toISOString() })
      .eq('room_id', report.roomId);

    setAcReportSavingId(null);
    if (error) {
      console.error('エアコン報告の解決状態を保存できません:', error);
      setAcReportsMessage('解決状態を保存できませんでした。Supabaseのroom_statusのUPDATE権限を確認してください。');
      return;
    }

    setAcReports(prev => prev.filter(item => item.id !== id));
    setAcReportsMessage(`${report.room}を「快適」に更新しました。生徒用サイトにも反映されます。`);
  };

  // Adminからボタン操作で、現在時刻から今後60分の時刻表をLINE Flex Messageとして送信
  const handleSendTrainTimetableNow = async () => {
    if (trainTimetableSending) return;
    if (!adminApiPassword.trim()) {
      setTrainTimetableMessage('管理用パスワードを入力してください。下の入力欄は課題・落とし物管理と共通です。');
      return;
    }

    setTrainTimetableSending(true);
    setTrainTimetableMessage('');
    try {
      const response = await fetch('/api/line-train-timetable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': adminApiPassword,
        },
        body: JSON.stringify({ mode: 'manual' }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        setTrainTimetableMessage(result?.message || `時刻表のLINE送信に失敗しました（HTTP ${response.status}）。`);
        return;
      }
      setTrainTimetableMessage(result.message || '今後1時間の時刻表をLINEへ送信しました。');
    } catch (error) {
      console.error('時刻表の手動LINE送信に失敗:', error);
      setTrainTimetableMessage('時刻表を送信できませんでした。Vercel環境変数とLINE APIの設定を確認してください。');
    } finally {
      setTrainTimetableSending(false);
    }
  };

  // 売切になったときはSupabase保存後にLINEへFlex Messageを配信する。
  const notifyCafeteriaSoldOutOnLine = async (item: AdminCafeteriaMenuItem): Promise<boolean> => {
    if (!adminApiPassword.trim()) {
      setCafeteriaLineRetryItem(item);
      setCafeteriaControlMessage('売切状態は保存されましたが、LINE通知にはAdmin用パスワードが必要です。入力後に「LINE通知を再送」を押してください。');
      return false;
    }

    setCafeteriaControlMessage(`${item.name}の売切をLINEへ通知中...`);
    try {
      const response = await fetch('/api/admin/cafeteria-sold-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': adminApiPassword,
        },
        body: JSON.stringify({ menuName: item.name, price: item.price }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        setCafeteriaLineRetryItem(item);
        setCafeteriaControlMessage(result?.message || `${item.name}は売切にしましたが、LINE通知に失敗しました（HTTP ${response.status}）。`);
        return false;
      }
      setCafeteriaLineRetryItem(null);
      setCafeteriaControlMessage(`${item.name}を売切中に更新し、LINE公式アカウントへFlex Messageで通知しました。`);
      return true;
    } catch (error) {
      console.error('学食売切のLINE通知に失敗:', error);
      setCafeteriaLineRetryItem(item);
      setCafeteriaControlMessage(`${item.name}は売切にしましたが、LINE通知の接続に失敗しました。「LINE通知を再送」から再試行できます。`);
      return false;
    }
  };

  const toggleSoldOut = async (id: string) => {
    const item = menuItems.find(menu => menu.id === id);
    if (!item || cafeteriaControlSavingId) return;

    const nextSoldOut = !item.isSoldOut;
    if (nextSoldOut && !adminApiPassword.trim()) {
      setCafeteriaControlMessage('LINEへの売切通知を行うため、先にAdmin用パスワードを入力してください。');
      return;
    }

    setCafeteriaControlSavingId(id);
    setCafeteriaControlMessage('');
    const { error } = await supabase
      .from('cafeteria_sold_out')
      .upsert({
        menu_id: id,
        is_sold_out: nextSoldOut,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'menu_id' });

    if (error) {
      console.error('学食の売切状態保存に失敗:', error);
      setCafeteriaControlMessage(`売切状態を保存できませんでした: ${error.message}`);
      setCafeteriaControlSavingId(null);
      return;
    }

    setMenuItems(prev => prev.map(menu => menu.id === id ? { ...menu, isSoldOut: nextSoldOut } : menu));
    if (nextSoldOut) {
      await notifyCafeteriaSoldOutOnLine(item);
    } else {
      setCafeteriaLineRetryItem(null);
      setCafeteriaControlMessage(`${item.name}を販売中に戻しました。生徒側にも反映されます。LINE通知は送信していません。`);
    }
    setCafeteriaControlSavingId(null);
  };

  // 落とし物はAdmin APIを通してSupabaseへ保存。画面ローカルだけでは状態を変更しない。
  const loadLostItems = async () => {
    if (!adminApiPassword.trim()) {
      setLostMessage('管理用パスワードを入力してください。');
      return;
    }
    setLostLoading(true);
    setLostMessage('');
    try {
      const response = await fetch('/api/admin/lost-and-found', {
        method: 'GET',
        headers: { 'x-admin-password': adminApiPassword },
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || `読み込みに失敗しました（HTTP ${response.status}）。`);
      setLostItems(Array.isArray(result.items) ? result.items : []);
      setLostMessage('Supabaseの落とし物一覧を読み込みました。');
    } catch (error) {
      setLostMessage(error instanceof Error ? error.message : '落とし物一覧を読み込めませんでした。');
    } finally {
      setLostLoading(false);
    }
  };

  const changeLostItemStatus = async (id: string | number, action: 'approve' | 'return') => {
    if (!adminApiPassword.trim()) {
      setLostMessage('先に管理用パスワードを入力してください。');
      return;
    }
    setLostLoading(true);
    setLostMessage('');
    try {
      const response = await fetch('/api/admin/lost-and-found', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-admin-password': adminApiPassword },
        body: JSON.stringify({ id, action }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result?.message || `保存に失敗しました（HTTP ${response.status}）。`);
      setLostItems(prev => prev.map(item => item.id === result.item.id ? { ...item, ...result.item, date: item.date } : item));
      setLostMessage(result.message || (action === 'approve' ? '全体公開しました。' : '返却完了にしました。'));
    } catch (error) {
      setLostMessage(error instanceof Error ? error.message : '落とし物の状態を保存できませんでした。');
    } finally {
      setLostLoading(false);
    }
  };

  const handleApproveLostItem = (id: string | number) => void changeLostItemStatus(id, 'approve');
  const handleReturnLostItem = (id: string | number) => void changeLostItemStatus(id, 'return');

  // --- 介入アクション4: 図書返却の個別催促 ---
  const handleNotifyOverdue = (id: number) => {
    setOverdues(prev => prev.map(item => 
      item.id === id ? { ...item, notified: true } : item
    ));
    alert('対象の生徒のスマートフォンへ、プッシュ催促通知を送信しました！');
  };

  // 新規書籍をSupabaseに登録し、選択された表紙画像も共有ストレージに保存する
  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();

    const title = newBookTitle.trim();
    const author = newBookAuthor.trim();
    if (!title || !author) {
      setBooksMessage('本のタイトルと著者 / 発行所を入力してください。');
      return;
    }
    if (newBookCover && (!['image/jpeg', 'image/png', 'image/webp'].includes(newBookCover.type) || newBookCover.size > 5 * 1024 * 1024)) {
      setBooksMessage('画像はJPG・PNG・WebP形式、5MB以下のものを選んでください。');
      return;
    }

    setBooksMessage('');
    setBookRegistering(true);
    try {
      let coverUrl: string | null = null;
      if (newBookCover) coverUrl = await uploadLibraryCoverImage(newBookCover);

      const newBook = {
        title,
        author,
        code: `LIB-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        status: '貸出可能',
        cover_url: coverUrl,
      };

      const { data, error } = await supabase
        .from('library_books')
        .insert(newBook)
        .select('id, title, author, code, status, cover_url, created_at')
        .single();

      if (error) {
        console.error('蔵書の登録に失敗:', error);
        setBooksMessage(
          error.code === '23505'
            ? '同じタイトル・著者の本が既に登録されています。'
            : `登録に失敗しました: ${error.message}`
        );
        return;
      }

      setBooks(prev => [data, ...prev]);
      setNewBookTitle('');
      setNewBookAuthor('');
      setNewBookCover(null);
      setBooksMessage(`「${data.title}」を蔵書に登録しました。${coverUrl ? '表紙画像も保存しました。' : ''} 生徒用アプリにも表示されます。`);
    } catch (unexpectedError) {
      console.error('蔵書画像のアップロードに失敗:', unexpectedError);
      setBooksMessage(`登録に失敗しました。画像ストレージの設定を確認してください: ${unexpectedError instanceof Error ? unexpectedError.message : '不明なエラー'}`);
    } finally {
      setBookRegistering(false);
    }
  };

  // 既に登録済みの蔵書にも、後から表紙画像を設定・変更できる
  const handleUpdateBookCover = async (book: LibraryBook, file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setBooksMessage('画像はJPG・PNG・WebP形式、5MB以下のものを選んでください。');
      return;
    }

    setBooksMessage('');
    setUpdatingCoverBookId(book.id);
    try {
      const coverUrl = await uploadLibraryCoverImage(file);
      const { data, error } = await supabase
        .from('library_books')
        .update({ cover_url: coverUrl })
        .eq('id', book.id)
        .select('id, title, author, code, status, cover_url, created_at')
        .single();

      if (error) throw new Error(error.message);
      setBooks(prev => prev.map(item => item.id === book.id ? data : item));
      setBooksMessage(`「${book.title}」の表紙画像を更新しました。`);
    } catch (unexpectedError) {
      console.error('蔵書表紙の更新に失敗:', unexpectedError);
      setBooksMessage(`表紙画像の更新に失敗しました: ${unexpectedError instanceof Error ? unexpectedError.message : '不明なエラー'}`);
    } finally {
      setUpdatingCoverBookId(null);
    }
  };

  // 蔵書をSupabaseから削除し、登録されている表紙画像も削除する
  const handleDeleteBook = async (book: LibraryBook) => {
    if (deletingBookId) return;
    const confirmed = window.confirm(`「${book.title}」を蔵書から削除しますか？\nこの操作は取り消せません。`);
    if (!confirmed) return;

    setDeletingBookId(book.id);
    setBooksMessage('');
    try {
      const { data, error } = await supabase
        .from('library_books')
        .delete()
        .eq('id', book.id)
        .select('id')
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) throw new Error('削除できませんでした。SupabaseのDELETEポリシーを確認してください。');

      // DBの削除が成功したら、Adminの一覧からも即時に取り除く
      setBooks(prev => prev.filter(item => item.id !== book.id));

      // public URLからStorage内のファイルパスを取り出す
      let storagePath: string | null = null;
      if (book.cover_url) {
        try {
          const parsedUrl = new URL(book.cover_url);
          const marker = '/storage/v1/object/public/library-covers/';
          const markerIndex = parsedUrl.pathname.indexOf(marker);
          if (markerIndex >= 0) {
            storagePath = decodeURIComponent(parsedUrl.pathname.slice(markerIndex + marker.length));
          }
        } catch {
          // 古い形式などでURLを解析できない場合は、蔵書削除を優先する
        }
      }

      if (storagePath) {
        const { error: imageError } = await supabase.storage.from('library-covers').remove([storagePath]);
        if (imageError) {
          console.error('蔵書の表紙画像削除に失敗:', imageError);
          setBooksMessage(`「${book.title}」は削除しましたが、表紙画像を削除できませんでした。StorageのDELETEポリシーを確認してください。`);
        } else {
          setBooksMessage(`「${book.title}」を蔵書から削除しました。`);
        }
      } else {
        setBooksMessage(`「${book.title}」を蔵書から削除しました。`);
      }
    } catch (unexpectedError) {
      console.error('蔵書の削除に失敗:', unexpectedError);
      setBooksMessage(`蔵書の削除に失敗しました: ${unexpectedError instanceof Error ? unexpectedError.message : '不明なエラー'}`);
    } finally {
      setDeletingBookId(null);
    }
  };

  const handleSaveStudyRoomStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (studyRoomSaving) return;

    const occupied = Number(studyRoomOccupiedSeats);
    const total = Number(studyRoomTotalSeats);
    if (!Number.isInteger(occupied) || !Number.isInteger(total) || total < 1 || occupied < 0 || occupied > total) {
      setStudyRoomMessage('利用中の席数は0以上、総座席数以下にしてください。総座席数は1以上にしてください。');
      return;
    }

    setStudyRoomSaving(true);
    setStudyRoomMessage('');
    try {
      const { data, error } = await supabase
        .from('study_room_status')
        .upsert({
          room_key: 'career_center',
          room_name: 'キャリアセンター自習室',
          occupied_seats: occupied,
          total_seats: total,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'room_key' })
        .select('room_key, room_name, occupied_seats, total_seats, updated_at')
        .single();

      if (error) throw error;
      setStudyRoomOccupiedSeats(Number(data.occupied_seats));
      setStudyRoomTotalSeats(Number(data.total_seats));
      setStudyRoomMessage('保存しました。生徒用サイトにも反映されます。');
    } catch (unexpectedError) {
      console.error('自習室の座席状況保存に失敗:', unexpectedError);
      const detail = formatErrorDetails(unexpectedError);
      setStudyRoomMessage(`保存に失敗しました: ${detail}`);
    } finally {
      setStudyRoomSaving(false);
    }
  };

  const loadAssignments = async () => {
    if (!adminApiPassword.trim()) {
      setAssignmentMessage('管理用パスワードを入力してください。');
      return;
    }
    setAssignmentLoading(true);
    setAssignmentMessage('');
    try {
      const response = await fetch('/api/admin/assignments', {
        method: 'GET',
        headers: { 'x-admin-password': adminApiPassword },
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || `読み込みに失敗しました（HTTP ${response.status}）。`);
      setAssignmentRows(Array.isArray(result.assignments) ? result.assignments : []);
      setAssignmentMessage('課題一覧を読み込みました。');
    } catch (error) {
      console.error('共通課題の読み込みに失敗:', error);
      setAssignmentMessage(error instanceof Error ? error.message : '課題一覧を読み込めませんでした。');
    } finally {
      setAssignmentLoading(false);
    }
  };

  const resetAssignmentForm = () => {
    setEditingAssignmentId(null);
    setAssignmentTitle('');
    setAssignmentDetails('');
    setAssignmentType('paper');
    setAssignmentDueAt('');
  };

  const editAssignment = (row: CampusAssignment) => {
    setEditingAssignmentId(row.id);
    setAssignmentTitle(row.title || '');
    setAssignmentDetails(row.details || '');
    setAssignmentType(row.type || 'paper');
    setAssignmentDueAt(toAdminDateTimeInput(row.due_at));
    setAssignmentMessage('編集中です。変更後に「保存」を押してください。');
  };

  const saveAssignment = async () => {
    if (!adminApiPassword.trim()) {
      setAssignmentMessage('管理用パスワードを入力してください。');
      return;
    }
    if (!assignmentTitle.trim()) {
      setAssignmentMessage('課題名を入力してください。');
      return;
    }
    if (assignmentTitle.trim().length > 200 || assignmentDetails.length > 5000) {
      setAssignmentMessage('課題名は200文字以内、詳細は5000文字以内にしてください。');
      return;
    }
    let dueAtISO: string | null = null;
    if (assignmentDueAt) {
      const parsedDueAt = new Date(assignmentDueAt);
      if (Number.isNaN(parsedDueAt.getTime())) {
        setAssignmentMessage('提出期限の日付と時刻を確認してください。');
        return;
      }
      dueAtISO = parsedDueAt.toISOString();
    }
    setAssignmentSaving(true);
    setAssignmentMessage('');
    try {
      const payload = {
        title: assignmentTitle.trim(),
        details: assignmentDetails.trim(),
        type: assignmentType,
        source: 'Admin／先生',
        due_at: dueAtISO,
        due: dueAtISO ? '期限あり' : '期限未設定',
        is_active: true,
      };
      const response = await fetch('/api/admin/assignments', {
        method: editingAssignmentId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-password': adminApiPassword },
        body: JSON.stringify(editingAssignmentId ? { ...payload, id: editingAssignmentId } : payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || `保存に失敗しました（HTTP ${response.status}）。`);
      if (editingAssignmentId) {
        setAssignmentMessage('課題を更新しました。学生側にも反映されます。');
      } else if (result?.lineNotification?.status === 'sent') {
        setAssignmentMessage('課題を追加して学生側に公開しました。LINEにもFlex Messageで通知しました。');
      } else {
        setAssignmentMessage(`課題を追加して学生側に公開しました。LINE通知の状況：${result?.lineNotification?.message || '通知結果を確認できませんでした。'}`);
      }
      resetAssignmentForm();
      await loadAssignments();
    } catch (error) {
      console.error('共通課題の保存に失敗:', error);
      setAssignmentMessage(error instanceof Error ? error.message : '課題を保存できませんでした。');
    } finally {
      setAssignmentSaving(false);
    }
  };

  const deleteAssignment = async (row: CampusAssignment) => {
    if (!adminApiPassword.trim()) {
      setAssignmentMessage('管理用パスワードを入力してください。');
      return;
    }
    if (!window.confirm(`「${row.title}」を学生側の一覧から削除しますか？`)) return;
    try {
      const response = await fetch('/api/admin/assignments', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', 'x-admin-password': adminApiPassword },
        body: JSON.stringify({ id: row.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || `削除に失敗しました（HTTP ${response.status}）。`);
      setAssignmentRows(prev => prev.filter(item => item.id !== row.id));
      if (editingAssignmentId === row.id) resetAssignmentForm();
      setAssignmentMessage('課題を削除しました。');
    } catch (error) {
      console.error('共通課題の削除に失敗:', error);
      setAssignmentMessage(error instanceof Error ? error.message : '課題を削除できませんでした。');
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 font-sans text-slate-100 overflow-hidden">
      
      {/* 🚀 サイドバーナビゲーション */}
      <aside className="w-16 shrink-0 bg-slate-950 border-r border-slate-800 p-2 md:w-64 md:p-6 flex flex-col justify-between">
        <div>
          <div className="mb-8 flex min-w-0 flex-col items-center gap-2 md:items-start">
            <div className="hidden max-w-full items-center gap-2 md:flex">
              <CampusSyncLogo variant="wordmark" height={28} theme="dark" />
              <span className="shrink-0 text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">教職員用</span>
            </div>
            <div className="md:hidden">
              <CampusSyncLogo variant="mark" height={28} theme="dark" />
            </div>
            <p className="hidden text-[10px] text-slate-500 font-mono mt-1 md:block">Soka High School Admin</p>
          </div>
          
          <nav className="space-y-1">
            <button aria-label="ダッシュボード概要" title="ダッシュボード概要" onClick={() => setActiveTab('dashboard')} className={`w-full flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-1 md:px-4 py-3 rounded-xl font-bold text-[10px] md:text-sm text-center md:text-left transition-all [&_svg]:shrink-0 ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <LayoutDashboard size={18} /><span className="sr-only md:not-sr-only">ダッシュボード概要</span>
            </button>
            <button aria-label="課題・提出期限管理" title="課題・提出期限管理" onClick={() => setActiveTab('assignments')} className={`w-full flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-1 md:px-4 py-3 rounded-xl font-bold text-[10px] md:text-sm text-center md:text-left transition-all [&_svg]:shrink-0 ${activeTab === 'assignments' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <ClipboardList size={18} /><span className="sr-only md:not-sr-only">課題・提出期限管理</span>
            </button>
            <button aria-label="チャット管理・監査ログ" title="チャット管理・監査ログ" onClick={() => setActiveTab('chat-moderation')} className={`w-full flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-1 md:px-4 py-3 rounded-xl font-bold text-[10px] md:text-sm text-center md:text-left transition-all [&_svg]:shrink-0 ${activeTab === 'chat-moderation' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <MessageSquare size={18} /><span className="sr-only md:not-sr-only">チャット管理・監査ログ</span>
            </button>
            <button aria-label="部活・委員会投稿管理" title="部活・委員会投稿管理" onClick={() => setActiveTab('club-posts')} className={`w-full flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-1 md:px-4 py-3 rounded-xl font-bold text-[10px] md:text-sm text-center md:text-left transition-all [&_svg]:shrink-0 ${activeTab === 'club-posts' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <Megaphone size={18} /><span className="sr-only md:not-sr-only">部活・委員会投稿管理</span>
            </button>
            <button aria-label="生徒プロフィール書き出し" title="生徒プロフィール書き出し" onClick={() => setActiveTab('student-profile-export')} className={`w-full flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-1 md:px-4 py-3 rounded-xl font-bold text-[10px] md:text-sm text-center md:text-left transition-all [&_svg]:shrink-0 ${activeTab === 'student-profile-export' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <FilePlus size={18} /><span className="sr-only md:not-sr-only">生徒プロフィール書き出し</span>
            </button>
            <button aria-label="月間献立表の管理" title="月間献立表の管理" onClick={() => setActiveTab('menu-calendar')} className={`w-full flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-1 md:px-4 py-3 rounded-xl font-bold text-[10px] md:text-sm text-center md:text-left transition-all [&_svg]:shrink-0 ${activeTab === 'menu-calendar' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <CalendarDays size={18} /><span className="sr-only md:not-sr-only">月間献立表の管理</span>
            </button>
            <button aria-label="学食・売切情報の操作" title="学食・売切情報の操作" onClick={() => setActiveTab('cafeteria')} className={`w-full flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-1 md:px-4 py-3 rounded-xl font-bold text-[10px] md:text-sm text-center md:text-left transition-all [&_svg]:shrink-0 ${activeTab === 'cafeteria' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <Utensils size={18} /><span className="sr-only md:not-sr-only">学食・売切情報の操作</span>
            </button>
            <button aria-label="落とし物「承認」管理" title="落とし物「承認」管理" onClick={() => setActiveTab('lost')} className={`w-full flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-1 md:px-4 py-3 rounded-xl font-bold text-[10px] md:text-sm text-center md:text-left transition-all [&_svg]:shrink-0 ${activeTab === 'lost' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <Package size={18} /><span className="sr-only md:not-sr-only">落とし物「承認」管理</span>
            </button>
            <button aria-label="キャリアセンター自習室" title="キャリアセンター自習室" onClick={() => setActiveTab('study-room')} className={`w-full flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-1 md:px-4 py-3 rounded-xl font-bold text-[10px] md:text-sm text-center md:text-left transition-all [&_svg]:shrink-0 ${activeTab === 'study-room' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <Monitor size={18} /><span className="sr-only md:not-sr-only">キャリアセンター自習室</span>
            </button>
            <button aria-label="図書貸出＆書籍登録" title="図書貸出＆書籍登録" onClick={() => setActiveTab('library')} className={`w-full flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-1 md:px-4 py-3 rounded-xl font-bold text-[10px] md:text-sm text-center md:text-left transition-all [&_svg]:shrink-0 ${activeTab === 'library' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <BookOpen size={18} /><span className="sr-only md:not-sr-only">図書貸出＆書籍登録</span>
            </button>
          </nav>
        </div>
        
        <div className="border-t border-slate-800 pt-4 flex flex-col items-center gap-1 md:flex-row md:gap-3">
          <div className="w-9 h-9 bg-slate-800 rounded-full flex items-center justify-center font-bold text-sm text-blue-400">校</div>
          <div className="hidden md:block">
            <p className="text-xs font-bold">校務部 事務室窓口</p>
            <p className="text-[10px] text-slate-500">ログイン中</p>
          </div>
        </div>
      </aside>

      {/* 🚀 メインコンテンツ */}
      <main className="min-w-0 flex-1 bg-slate-900 p-3 sm:p-4 md:p-8 overflow-y-auto overflow-x-auto">
        
        {/* ================= タブ1: ダッシュボード（リアルタイム不満・アラート） ================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black">校内環境リアルタイム状況</h2>
                <p className="text-sm text-slate-400">生徒用アプリから届いた報告に対して、ワンタップでエアコン調整や解決状況の更新ができます。</p>
              </div>
            </div>
            
            <div className="mb-4 min-w-0">
              <ContributionRankAdminGuide />
            </div>
            <div className="grid grid-cols-1 gap-6">
              {/* エアコン不満リアルタイムアラート */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800">
                <h3 className="text-base font-bold text-slate-300 mb-4 flex items-center gap-2">
                  <Thermometer className="text-red-400 animate-pulse" size={20} /> 生徒からのエアコン苦情一覧
                </h3>
                {acReportsMessage && (
                  <p role="status" className={`mb-3 rounded-lg border p-3 text-xs leading-relaxed ${acReportsMessage.includes('できません') || acReportsMessage.includes('確認してください') ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>{acReportsMessage}</p>
                )}
                {acReportsLoading ? (
                  <p className="py-5 text-center text-sm text-slate-500">生徒からのエアコン報告を読み込み中...</p>
                ) : acReports.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-center">
                    <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-400" />
                    <p className="text-sm font-bold text-slate-300">現在、未解決のエアコン報告はありません。</p>
                    <p className="mt-1 text-xs text-slate-500">生徒が「暑い」または「寒い」と報告すると、ここに実際の状況が表示されます。</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {acReports.map(report => (
                      <div key={report.id} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <span className="text-xs font-mono font-bold text-slate-400">{report.room}（報告された設定温度: {report.temp}）</span>
                          <p className="mt-1 flex items-center gap-1.5 text-sm font-black text-red-400">
                            <AlertCircle size={14} /> 【{report.issue}】の報告
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">最終更新: {report.updatedAt}</p>
                        </div>
                        <button
                          type="button"
                          disabled={acReportSavingId === report.id || Boolean(acReportSavingId)}
                          onClick={() => void handleResolveAC(report.id)}
                          className="flex shrink-0 items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-all hover:bg-blue-700 disabled:opacity-50"
                        >
                          <Check size={12} /> {acReportSavingId === report.id ? '保存中...' : '解決済みにする'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 鷹の台駅の時刻表を手動でLINEへ送信 */}
              <div className="rounded-2xl border border-cyan-800/70 bg-gradient-to-br from-slate-950 to-slate-900 p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-cyan-500/15 p-3 text-cyan-300"><Clock size={22} /></div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-black text-white">鷹の台駅・今後1時間の時刻表</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-400">現在時刻から60分間の発車予定を、国分寺方面・東村山方面の2つに分けたFlex MessageでLINE公式アカウントへ送信します。毎時00分の自動配信とは別に、必要なとき手動送信できます。</p>
                  </div>
                </div>
                <label className="block text-xs font-bold text-slate-300">
                  Admin用パスワード
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={adminApiPassword}
                    onChange={event => { setAdminApiPassword(event.target.value); setTrainTimetableMessage(''); }}
                    placeholder="VercelのCAMPUS_SYNC_ADMIN_PASSWORD"
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleSendTrainTimetableNow()}
                  disabled={trainTimetableSending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-black text-white transition hover:bg-cyan-500 disabled:cursor-wait disabled:opacity-60"
                >
                  <Send size={16} />
                  {trainTimetableSending ? '時刻表をLINE送信中...' : '今後1時間の時刻表をLINE送信'}
                </button>
                {trainTimetableMessage && (
                  <p role="status" className={`rounded-xl border p-3 text-xs leading-5 ${trainTimetableMessage.includes('失敗') || trainTimetableMessage.includes('必要') || trainTimetableMessage.includes('確認してください') || trainTimetableMessage.includes('正しい') ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
                    {trainTimetableMessage}
                  </p>
                )}
              </div>

              {/* LINEお知らせ作成・配信・履歴 */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-5">
                <div>
                  <h3 className="text-base font-bold text-slate-300 mb-2 flex items-center gap-2">
                    <ShieldAlert className="text-yellow-400" size={20} /> クイックお知らせ・パトロール
                  </h3>
                  <p className="text-xs text-slate-400">
                    自由な文章やテンプレートから、見やすいカード型のFlex MessageでLINEお知らせを作成できます。配信前に内容を確認し、友だち全員へ送信します。
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-5">
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                    <h4 className="text-sm font-black text-white flex items-center gap-2"><FilePlus size={16} className="text-blue-400" /> お知らせを作成</h4>
                    <label className="block text-xs font-bold text-slate-400">
                      テンプレート
                      <select
                        value={lineNoticeTemplate}
                        onChange={e => applyLineNoticeTemplate(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
                      >
                        <option value="custom">自由入力（テンプレートなし）</option>
                        {LINE_NOTICE_TEMPLATES.map(template => (
                          <option key={template.id} value={template.id}>{template.label}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => applyLineNoticeTemplate('cafeteria')}
                      className="text-xs font-bold text-yellow-300 hover:text-yellow-200 underline underline-offset-4"
                    >
                      「学食が混んでいます」テンプレートを使う
                    </button>
                    <label className="block text-xs font-bold text-slate-400">
                      お知らせのタイトル
                      <input
                        value={lineNoticeTitle}
                        onChange={e => { setLineNoticeTitle(e.target.value); setLineNoticeTemplate('custom'); setLineBroadcastMessage(''); }}
                        maxLength={100}
                        placeholder="例：明日の電車運行について"
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 placeholder:text-slate-600"
                      />
                    </label>
                    <label className="block text-xs font-bold text-slate-400">
                      LINEで送る文章
                      <textarea
                        value={lineNoticeText}
                        onChange={e => { setLineNoticeText(e.target.value); setLineNoticeTemplate('custom'); setLineBroadcastMessage(''); }}
                        maxLength={1800}
                        rows={6}
                        placeholder="ここにLINEで送りたい内容を入力してください。"
                        className="mt-1 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 placeholder:text-slate-600"
                      />
                      <span className="mt-1 block text-right text-[11px] text-slate-500">本文 {Array.from(lineNoticeText).length.toLocaleString()} / 1,800文字（Flex Message上限）</span>
                    </label>
                    <label className="block text-xs font-bold text-slate-400">
                      配信認証コード
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={lineBroadcastPassword}
                        onChange={e => { setLineBroadcastPassword(e.target.value); setLineBroadcastMessage(''); }}
                        placeholder="VercelのADMIN_BROADCAST_PASSWORDの値"
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-yellow-500 placeholder:text-slate-600"
                      />
                    </label>
                    <button
                      onClick={handleSendLineNotice}
                      disabled={lineBroadcasting || !lineNoticeTitle.trim() || !lineNoticeText.trim()}
                      className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-600/10"
                    >
                      <Send size={15} /> {lineBroadcasting ? 'LINE配信中...' : '内容を確認してLINE配信'}
                    </button>
                    {lineBroadcastMessage && (
                      <p role="status" className={`rounded-lg border p-3 text-xs ${lineBroadcastMessage.includes('配信しました') || lineBroadcastMessage.includes('配信が完了') ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
                        {lineBroadcastMessage}
                      </p>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                      <h4 className="text-sm font-black text-white flex items-center gap-2"><Monitor size={16} className="text-green-400" /> LINEメッセージのプレビュー</h4>
                      <div className="rounded-xl bg-slate-800 p-3">
                        <div className="flex items-center gap-2 text-xs text-slate-300 mb-3">
                          <div className="h-7 w-7 rounded-full bg-green-600 flex items-center justify-center"><BellRing size={14} /></div>
                          CampusSync 公式アカウント
                        </div>
                        <div className="max-w-full rounded-2xl rounded-tl-sm bg-slate-100 p-4 text-slate-900 shadow">
                          <p className="font-black text-sm mb-2 break-words">{lineNoticeTitle || 'お知らせのタイトル'}</p>
                          <p className="text-sm whitespace-pre-wrap break-words">{lineNoticeText || 'ここに送信する文章が表示されます。'}</p>
                        </div>
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-500">プレビューは目安です。実際の見え方はLINEアプリや端末によって異なる場合があります。</p>
                    </div>

                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-black text-white flex items-center gap-2"><History size={16} className="text-blue-400" /> 最近の配信履歴</h4>
                        <button type="button" onClick={() => setLineHistoryRefreshKey(key => key + 1)} className="text-xs font-bold text-blue-300 hover:text-blue-200 flex items-center gap-1"><RefreshCw size={12} /> 更新</button>
                      </div>
                      {lineHistoryLoading ? (
                        <p className="text-xs text-slate-500">履歴を読み込み中...</p>
                      ) : lineHistoryMessage ? (
                        <p className="text-xs text-amber-300">{lineHistoryMessage}</p>
                      ) : lineBroadcastHistory.length === 0 ? (
                        <p className="text-xs text-slate-500">まだ配信履歴はありません。SQLを実行し、最初のお知らせを配信するとここに表示されます。</p>
                      ) : (
                        <div className="space-y-2 max-h-[430px] overflow-y-auto pr-1">
                          {lineBroadcastHistory.map(item => (
                            <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-bold text-slate-200 break-words">{item.title}</p>
                                <span className="shrink-0 text-[10px] text-emerald-300">配信済み</span>
                              </div>
                              <p className="mt-1 text-xs text-slate-400 whitespace-pre-wrap break-words">{item.message}</p>
                              <p className="mt-2 text-[10px] text-slate-600">{item.sent_at ? new Date(item.sent_at).toLocaleString('ja-JP') : '日時不明'}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= 課題・提出期限管理 ================= */}
        {activeTab === 'assignments' && (
          <div className="max-w-5xl space-y-6">
            <div>
              <h2 className="text-2xl font-black flex items-center gap-2"><ClipboardList className="text-blue-400" /> 課題・提出期限管理</h2>
              <p className="mt-2 text-sm text-slate-400">ここで登録した課題名・指示事項・提出期限は、生徒用CampusSyncの「マイ提出物・連絡リマインダー」に共通表示されます。生徒側では期限を変更できません。</p>
            </div>

            <div className="rounded-2xl border border-amber-700/40 bg-amber-950/30 p-4 space-y-2">
              <h3 className="text-sm font-black text-amber-200">管理用パスワード</h3>
              <p className="text-xs leading-relaxed text-amber-100/80">サーバーの環境変数 CAMPUS_SYNC_ADMIN_PASSWORD に設定した値を入力してください。これはコードに直接書かず、Vercelの環境変数で管理します。</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input type="password" autoComplete="current-password" value={adminApiPassword} onChange={e => setAdminApiPassword(e.target.value)} placeholder="管理用パスワード" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" />
                <button type="button" onClick={() => void loadAssignments()} disabled={assignmentLoading} className="rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-black hover:bg-slate-600 disabled:opacity-50">{assignmentLoading ? '読み込み中…' : '課題一覧を読み込む'}</button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-4">
              <h3 className="text-base font-black">{editingAssignmentId ? '課題を編集' : '新しい課題を登録'}</h3>
              <label className="block text-xs font-bold text-slate-400">課題名
                <input value={assignmentTitle} onChange={e => setAssignmentTitle(e.target.value)} maxLength={200} placeholder="例：数学演習プリント P20-21" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white" />
              </label>
              <label className="block text-xs font-bold text-slate-400">タスク詳細及び指示事項
                <textarea value={assignmentDetails} onChange={e => setAssignmentDetails(e.target.value)} maxLength={5000} rows={4} placeholder="提出内容、提出方法、回収時の注意など" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white" />
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-xs font-bold text-slate-400">課題の種類
                  <select value={assignmentType} onChange={e => setAssignmentType(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white">
                    <option value="paper">紙プリント・ノート</option>
                    <option value="classroom">Google Classroom</option>
                    <option value="other">連絡・アンケートなど</option>
                  </select>
                </label>
                <label className="block text-xs font-bold text-slate-400">実際の提出期限（日付・時刻）
                  <input type="datetime-local" value={assignmentDueAt} onChange={e => setAssignmentDueAt(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white" />
                </label>
              </div>
              <p className="text-xs text-slate-500">時刻まで設定すると、自動リマインダーの期限として使えます。期限が決まっていない場合は空欄のまま保存できます。</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void saveAssignment()} disabled={assignmentSaving} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-500 disabled:opacity-50">{assignmentSaving ? '保存中…' : editingAssignmentId ? '変更を保存' : '学生全員に課題を公開'}</button>
                {editingAssignmentId && <button type="button" onClick={resetAssignmentForm} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-bold text-slate-300 hover:bg-slate-800">編集をキャンセル</button>}
              </div>
              {assignmentMessage && <p role="status" className={`rounded-xl border p-3 text-xs ${assignmentMessage.includes('失敗') || assignmentMessage.includes('入力') || assignmentMessage.includes('設定') || assignmentMessage.includes('必要') ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>{assignmentMessage}</p>}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h3 className="text-base font-black">登録済みの共通課題</h3>
                <button type="button" onClick={() => void loadAssignments()} disabled={assignmentLoading} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800">再読み込み</button>
              </div>
              {assignmentLoading ? <p className="text-sm text-slate-500">読み込み中…</p> : assignmentRows.length === 0 ? <p className="text-sm text-slate-500">課題がありません。管理用パスワードを入力して「課題一覧を読み込む」を押してください。</p> : (
                <div className="space-y-2">
                  {assignmentRows.map(row => (
                    <div key={row.id} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><p className="font-black text-white">{row.title}</p><span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-300">{row.source || 'Admin／先生'}</span></div>
                        <p className="mt-1 text-xs text-slate-400 whitespace-pre-wrap">{row.details || '詳細なし'}</p>
                        <p className="mt-2 text-xs font-bold text-blue-300">{row.due_at ? new Date(row.due_at).toLocaleString('ja-JP') : '提出期限未設定'}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={() => editAssignment(row)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800">編集</button>
                        <button type="button" onClick={() => void deleteAssignment(row)} className="rounded-lg border border-rose-900 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-950/50">削除</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= 月間献立表（次月分を入力して一括保存） ================= */}
        {activeTab === 'menu-calendar' && (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-2xl font-black flex items-center gap-2">
                  <CalendarDays className="text-blue-400" size={25} /> 月間献立表の管理
                </h2>
                <p className="text-sm text-slate-400 mt-2">
                  写真の献立表と同じように、日付ごとに5種類のメニューを入力できます。翌月が最初に表示されます。
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs font-bold text-slate-400">
                  対象年月
                  <input
                    type="month"
                    value={selectedMenuMonth}
                    onChange={e => setSelectedMenuMonth(e.target.value)}
                    className="block mt-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-blue-500"
                  />
                </label>
                <button
                  onClick={() => setSelectedMenuMonth(getNextMonthValue())}
                  className="px-3 py-2.5 rounded-xl border border-slate-700 text-xs font-bold text-slate-300 hover:bg-slate-800 flex items-center gap-2"
                >
                  <RefreshCw size={14} /> 翌月を選択
                </button>
                <button
                  onClick={handleSaveMonthlyMenus}
                  disabled={menuLoading || menuSaving || dailyMenuRows.length === 0}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-black flex items-center gap-2"
                >
                  <Save size={15} /> {menuSaving ? '保存中...' : 'この月の献立を一括保存'}
                </button>
              </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-xs text-blue-200 leading-relaxed">
              入力した献立は日付単位でSupabaseに保存されます。営業がない日は「営業なし」をチェックしてください。入力途中の内容を残すには、一括保存を押してください。
            </div>

            {menuMessage && (
              <div className={`rounded-xl border p-3 text-sm ${menuMessage.includes('失敗') || menuMessage.includes('できません') ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
                {menuMessage}
              </div>
            )}

            <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-800">
                <div>
                  <h3 className="font-black text-white">{selectedMenuMonth.replace('-', '年')}月の献立</h3>
                  <p className="text-[11px] text-slate-500 mt-1">日付を選ぶ必要はありません。1日から月末までの行が自動で用意されます。</p>
                </div>
                <span className="text-xs font-bold text-slate-400">
                  {menuLoading ? '読み込み中...' : `${dailyMenuRows.length}日分`}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1320px] w-full border-collapse text-left">
                  <thead className="bg-slate-900 sticky top-0">
                    <tr className="text-[11px] text-slate-400">
                      <th className="px-3 py-3 border-b border-slate-800 w-28">日付</th>
                      <th className="px-3 py-3 border-b border-slate-800 w-16">曜日</th>
                      {MENU_CATEGORIES.map(category => (
                        <th key={category.key} className="px-3 py-3 border-b border-slate-800 min-w-52">{category.label}</th>
                      ))}
                      <th className="px-3 py-3 border-b border-slate-800 w-28">営業</th>
                      <th className="px-3 py-3 border-b border-slate-800 min-w-48">特記事項</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyMenuRows.map(row => {
                      const weekday = getJapaneseWeekday(row.service_date);

                      return (
                        <tr key={row.service_date} className={`border-b border-slate-800/80 ${row.is_closed ? 'bg-slate-900/80' : 'hover:bg-slate-900/50'}`}>
                          <td className="px-3 py-3 text-xs font-bold text-slate-200 whitespace-nowrap">
                            {Number(row.service_date.slice(-2))}日
                          </td>
                          <td className={`px-3 py-3 text-sm font-black ${weekday === '日' ? 'text-red-400' : weekday === '土' ? 'text-sky-400' : 'text-slate-300'}`}>
                            {weekday}
                          </td>

                          {row.is_closed ? (
                            <td colSpan={5} className="px-3 py-2">
                              <div className="rounded-lg bg-slate-800 border border-slate-700 px-4 py-3 text-center text-sm font-black text-slate-400">

                                営業はありません
                              </div>
                            </td>
                          ) : (
                            MENU_CATEGORIES.map(category => (
                              <td key={category.key} className="px-2 py-2">
                                <div className="min-w-48 space-y-1.5">
                                  <input
                                    type="text"
                                    value={row[category.key]}
                                    onChange={e => updateDailyMenuRow(row.service_date, { [category.key]: e.target.value } as Partial<DailyMenuRow>)}
                                    placeholder="献立名を入力..."
                                    aria-label={`${row.service_date} ${category.label} 献立名`}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white placeholder:text-slate-600 outline-none focus:border-blue-500"
                                  />
                                  <input
                                    type="text"
                                    value={row[`${category.key}_price` as MenuDetailsField]}
                                    onChange={e => updateDailyMenuRow(row.service_date, { [`${category.key}_price`]: e.target.value } as Partial<DailyMenuRow>)}
                                    placeholder="価格（例：420円）"
                                    aria-label={`${row.service_date} ${category.label} 価格`}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white placeholder:text-slate-600 outline-none focus:border-blue-500"
                                  />
                                  <input
                                    type="text"
                                    value={row[`${category.key}_calorie` as MenuDetailsField]}
                                    onChange={e => updateDailyMenuRow(row.service_date, { [`${category.key}_calorie`]: e.target.value } as Partial<DailyMenuRow>)}
                                    placeholder="カロリー（例：680kcal）"
                                    aria-label={`${row.service_date} ${category.label} カロリー`}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white placeholder:text-slate-600 outline-none focus:border-blue-500"
                                  />
                                  <input
                                    type="text"
                                    value={row[`${category.key}_allergy` as MenuDetailsField]}
                                    onChange={e => updateDailyMenuRow(row.service_date, { [`${category.key}_allergy`]: e.target.value } as Partial<DailyMenuRow>)}
                                    placeholder="アレルギー（例：小麦・卵）"
                                    aria-label={`${row.service_date} ${category.label} アレルギー`}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white placeholder:text-slate-600 outline-none focus:border-blue-500"
                                  />
                                </div>
                              </td>
                            ))
                          )}

                          <td className="px-3 py-2">
                            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-300 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={row.is_closed}
                                onChange={e => updateDailyMenuRow(row.service_date, { is_closed: e.target.checked })}
                                className="h-4 w-4 accent-blue-500"
                              />
                              営業なし
                            </label>
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={row.note}
                              onChange={e => updateDailyMenuRow(row.service_date, { note: e.target.value })}
                              placeholder="例：学校行事"
                              aria-label={`${row.service_date} 特記事項`}
                              className="w-full min-w-44 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-blue-500"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">※ 行を編集しただけでは保存されません。最後に「この月の献立を一括保存」を押してください。</p>
                <button
                  onClick={handleSaveMonthlyMenus}
                  disabled={menuLoading || menuSaving || dailyMenuRows.length === 0}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-black flex items-center gap-2"
                >
                  <Save size={15} /> {menuSaving ? '保存中...' : 'この月の献立を一括保存'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= タブ2: 学食・売切情報の操作 ================= */}
        {activeTab === 'cafeteria' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-black">学食売切の強制管理＆承認</h2>
              <p className="text-sm text-slate-400">生徒からの「これ売り切れてる！」というアラートをチェックして、正式な売り切れマークに反映します。</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* メニューリスト */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-slate-400">本日のメニュー一覧（売切操作スイッチ）</h3>
                {cafeteriaControlMessage && (
                  <p role="status" className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">{cafeteriaControlMessage}</p>
                )}
                <label className="block rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs font-bold text-slate-300">
                  LINE通知用 Adminパスワード
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={adminApiPassword}
                    onChange={event => setAdminApiPassword(event.target.value)}
                    placeholder="VercelのCAMPUS_SYNC_ADMIN_PASSWORD"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
                  />
                  <span className="mt-1 block font-normal text-slate-500">売切にしたとき、LINE公式アカウントへ自動通知します。</span>
                </label>
                {cafeteriaLineRetryItem && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                    <p className="text-xs leading-relaxed text-rose-200">{cafeteriaLineRetryItem.name}のLINE通知が未完了です。</p>
                    <button
                      type="button"
                      onClick={() => void notifyCafeteriaSoldOutOnLine(cafeteriaLineRetryItem)}
                      disabled={!adminApiPassword.trim() || Boolean(cafeteriaControlSavingId)}
                      className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-black text-white hover:bg-rose-500 disabled:opacity-50"
                    >LINE通知を再送</button>
                  </div>
                )}
                {cafeteriaControlLoading && <p className="text-xs text-slate-500">本日の献立・売切状態・報告件数を読み込み中...</p>}
                <div className="space-y-2">
                  {menuItems.map(item => (
                    <div key={item.id} className={`p-4 bg-slate-900 border rounded-xl flex justify-between items-center transition-all ${item.isSoldOut ? 'border-red-500/30 opacity-70' : 'border-slate-800'}`}>
                      <div>
                        <h4 className="text-sm font-bold text-white">{item.name}</h4>
                        {item.price && <p className="text-xs text-slate-500 mt-0.5">価格: {item.price}</p>}
                        {(item.calorie || item.allergy) && (
                          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                            {item.calorie && `カロリー: ${item.calorie}`}{item.calorie && item.allergy ? ' ・ ' : ''}{item.allergy && `アレルギー: ${item.allergy}`}
                          </p>
                        )}
                        {item.userReports > 0 && !item.isSoldOut && (
                          <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full font-bold inline-block mt-1 animate-pulse">
                            ⚠️ 生徒から {item.userReports} 件の売切報告あり！
                          </span>
                        )}
                      </div>
                      
                      <button 
                        onClick={() => void toggleSoldOut(item.id)}
                        disabled={cafeteriaControlSavingId === item.id}
                        className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all disabled:opacity-50 ${item.isSoldOut ? 'bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}
                      >
                        {cafeteriaControlSavingId === item.id ? '保存中...' : item.isSoldOut ? '【売切中】販売再開' : '手動で売切にする'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 生徒向け「今日・明日のおすすめ」告知：Supabase保存 */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-slate-200">学食からのお知らせ配信</h3>
                <p className="text-xs leading-relaxed text-slate-400">入力した内容をSupabaseに保存し、生徒サイトのポップアップと学食タブのバナーに反映します。</p>
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                  <div>
                    <label htmlFor="cafeteria-announcement-text" className="text-xs text-slate-300 font-bold block mb-1">今日・明日のおすすめポップアップ</label>
                    <textarea
                      id="cafeteria-announcement-text"
                      value={cafeteriaAnnouncementText}
                      onChange={event => setCafeteriaAnnouncementText(event.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="例：明日は人気のカレーが登場します！ぜひ学食をご利用ください。"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-blue-500 resize-y"
                    />
                    <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                      <span>生徒サイトでポップアップとバナーに表示</span>
                      <span>{cafeteriaAnnouncementText.length}/500</span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-3">
                    <label htmlFor="cafeteria-announcement-send-line" className="flex cursor-pointer items-start gap-2 text-xs font-bold text-slate-200">
                      <input
                        id="cafeteria-announcement-send-line"
                        type="checkbox"
                        checked={cafeteriaAnnouncementAlsoSendLine}
                        onChange={event => setCafeteriaAnnouncementAlsoSendLine(event.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-green-500"
                      />
                      <span>LINE公式アカウントにも同時配信する</span>
                    </label>
                    {cafeteriaAnnouncementAlsoSendLine && (
                      <>
                        <p className="text-[10px] leading-relaxed text-amber-300">配信先はLINE公式アカウントの友だち全員です。重要なお知らせなど、全体配信が必要な場合だけ選択してください。</p>
                        <input
                          type="password"
                          autoComplete="current-password"
                          value={cafeteriaAnnouncementLinePassword}
                          onChange={event => setCafeteriaAnnouncementLinePassword(event.target.value)}
                          placeholder="LINE配信認証コード（管理用）"
                          className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs font-bold text-white outline-none focus:border-blue-500"
                        />
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handlePublishCafeteriaAnnouncement}
                    disabled={cafeteriaAnnouncementSaving}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all"
                  >
                    {cafeteriaAnnouncementSaving ? '保存中...' : '学食タブにバナー掲載'}
                  </button>
                  {cafeteriaAnnouncementPublished && (
                    <button
                      type="button"
                      onClick={handleUnpublishCafeteriaAnnouncement}
                      disabled={cafeteriaAnnouncementSaving}
                      className="w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-bold text-xs rounded-xl transition-all"
                    >
                      掲載を停止する
                    </button>
                  )}
                  {cafeteriaAnnouncementMessage && (
                    <p role="status" className={`text-xs leading-relaxed ${cafeteriaAnnouncementMessage.includes('失敗') || cafeteriaAnnouncementMessage.includes('入力') || cafeteriaAnnouncementMessage.includes('確認') ? 'text-rose-300' : 'text-emerald-300'}`}>
                      {cafeteriaAnnouncementMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= タブ3: 落とし物「承認」フロー ================= */}
        {activeTab === 'lost' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-black">落とし物・忘れ物のモデレーション（承認・返却）</h2>
              <p className="text-sm text-slate-400">いたずら投稿を防ぐため、生徒がスマホから「これ拾いました」と投稿したものは、事務室で実物確認後に承認ボタンを押して初めて全体公開されます。</p>
            </div>

            <div className="rounded-2xl border border-amber-700/40 bg-amber-950/30 p-4 space-y-2">
              <h3 className="text-sm font-black text-amber-200">管理用パスワード</h3>
              <p className="text-xs leading-relaxed text-amber-100/80">CAMPUS_SYNC_ADMIN_PASSWORDに設定した値を入力し、Supabaseの実データを読み込んでください。承認・返却はサーバーAPI経由で保存します。</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input type="password" autoComplete="current-password" value={adminApiPassword} onChange={e => setAdminApiPassword(e.target.value)} placeholder="管理用パスワード" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" />
                <button type="button" onClick={() => void loadLostItems()} disabled={lostLoading} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-500 disabled:opacity-50">{lostLoading ? '読み込み中…' : '落とし物一覧を読み込む'}</button>
              </div>
              {lostMessage && <p role="status" className={`text-xs leading-5 ${lostMessage.includes('失敗') || lostMessage.includes('入力') || lostMessage.includes('設定') || lostMessage.includes('正しく') ? 'text-rose-300' : 'text-emerald-300'}`}>{lostMessage}</p>}
            </div>

            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800">
              <div className="space-y-3">
                {lostItems.length === 0 && <p className="py-6 text-center text-sm text-slate-500">落とし物一覧は未読み込み、または投稿がありません。管理用パスワードを入力して読み込んでください。</p>}
                {lostItems.map(item => (
                  <div key={item.id} className={`p-4 bg-slate-900 border rounded-xl flex justify-between items-center transition-all ${item.status === 'returned' ? 'border-slate-800/40 opacity-40' : 'border-slate-800'}`}>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-400">【発見場所】{item.location}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400 animate-pulse' : item.status === 'approved' ? 'bg-blue-500/10 text-blue-400' : 'bg-green-500/10 text-green-400'}`}>
                          {item.status === 'pending' ? '⚠️ 事務室未確認（未公開）' : item.status === 'approved' ? '✅ 全体公開中（お預かり中）' : '🎉 本人返却済'}
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-white">{item.title}</h4>
                      <p className="text-xs text-slate-500 mt-1">報告者: {item.reporter || (item.student_id ? '学籍番号 ' + item.student_id : '事務室で直接回収')} | 発見日時: {item.date}</p><p className="text-xs text-slate-400 mt-1">保管: {item.finder || '未入力'}</p>{item.description && <p className="mt-2 max-w-3xl whitespace-pre-wrap text-xs leading-5 text-slate-300">{item.description}</p>}
                    </div>

                    <div className="flex gap-2">
                      {item.status === 'pending' && (
                        <button disabled={lostLoading} onClick={() => handleApproveLostItem(item.id)} className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1">
                          実物確認して全体公開する
                        </button>
                      )}
                      {item.status === 'approved' && (
                        <button disabled={lostLoading} onClick={() => handleReturnLostItem(item.id)} className="px-3.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1">
                          本人に返却したので完了にする
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= キャリアセンター自習室の座席管理 ================= */}
        {activeTab === 'study-room' && (
          <div className="max-w-3xl space-y-6">
            <div>
              <h2 className="text-2xl font-black">キャリアセンター自習室の空席管理</h2>
              <p className="mt-1 text-sm text-slate-400">利用中の席数と総座席数を更新すると、生徒用アプリの空席状況に反映されます。</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 text-teal-300"><Monitor size={24} /></div>
                <div>
                  <h3 className="text-base font-black">キャリアセンター自習室</h3>
                  <p className="text-xs text-slate-400">座席の利用状況</p>
                </div>
              </div>

              <form onSubmit={handleSaveStudyRoomStatus} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="study-room-occupied" className="mb-1.5 block text-xs font-bold text-slate-300">利用中の席数</label>
                    <input id="study-room-occupied" type="number" min={0} max={studyRoomTotalSeats} step={1} required value={studyRoomOccupiedSeats} onChange={e => setStudyRoomOccupiedSeats(Number(e.target.value))} className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm font-black text-white outline-none focus:border-teal-500" />
                  </div>
                  <div>
                    <label htmlFor="study-room-total" className="mb-1.5 block text-xs font-bold text-slate-300">総座席数</label>
                    <input id="study-room-total" type="number" min={1} step={1} required value={studyRoomTotalSeats} onChange={e => setStudyRoomTotalSeats(Number(e.target.value))} className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm font-black text-white outline-none focus:border-teal-500" />
                  </div>
                </div>

                <div className="rounded-xl bg-slate-900 p-4">
                  <div className="mb-2 flex items-end justify-between gap-3">
                    <span className="text-xs font-bold text-slate-400">生徒用サイトでの表示プレビュー</span>
                    <span className="text-lg font-black text-white">空席 {Math.max(0, studyRoomTotalSeats - studyRoomOccupiedSeats)}席</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-teal-400 transition-all" style={{ width: `${studyRoomTotalSeats > 0 ? Math.min(100, Math.max(0, (studyRoomOccupiedSeats / studyRoomTotalSeats) * 100)) : 0}%` }} />
                  </div>
                  <p className="mt-2 text-right text-[10px] text-slate-500">利用中 {studyRoomOccupiedSeats} / {studyRoomTotalSeats}席</p>
                </div>

                {studyRoomMessage && <p role="status" className={`text-xs font-bold ${studyRoomMessage.includes('失敗') || studyRoomMessage.includes('できません') || studyRoomMessage.includes('してください') ? 'text-amber-300' : 'text-emerald-300'}`}>{studyRoomMessage}</p>}
                <button type="submit" disabled={studyRoomSaving || studyRoomLoading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-xs font-black text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50">
                  <Save size={15} /> {studyRoomLoading ? '設定を読み込み中...' : studyRoomSaving ? '保存中...' : '空席状況を保存して生徒サイトに反映'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ================= タブ4: 図書貸出＆書籍登録 ================= */}
        {activeTab === 'library' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-black">図書管理システム（蔵書＆催促）</h2>
              <p className="text-sm text-slate-400">図書室の蔵書データへの追加、および返却期限が切れた生徒へダイレクトに「通知」を飛ばせます。</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 返却期限遅れ（生徒への自動・手動プッシュ督促） */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="text-base font-bold text-slate-300 flex items-center gap-1.5">
                  <Clock className="text-red-400" size={18} /> 返却遅れ生徒一覧
                </h3>
                <div className="space-y-3">
                  {overdues.map(item => (
                    <div key={item.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex justify-between items-center">
                      <div>
                        <h4 className="text-xs font-mono text-slate-400 font-bold">{item.borrower}</h4>
                        <p className="text-sm font-bold text-white mt-0.5">『{item.title}』</p>
                        <p className="text-xs text-red-400 font-bold mt-1">超過日数: {item.overDays}日</p>
                      </div>
                      
                      <button 
                        onClick={() => handleNotifyOverdue(item.id)}
                        disabled={item.notified}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${item.notified ? 'bg-slate-800 text-slate-500' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                      >
                        <Megaphone size={12} /> {item.notified ? '催促通知 済' : 'スマホへ催促'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 図書室 新しい本の登録 */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="text-base font-bold text-slate-300 flex items-center gap-1.5">
                  <BookOpen className="text-blue-400" size={18} /> 新規蔵書の追加登録
                </h3>
                
                <form onSubmit={handleAddBook} className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 font-bold block mb-1">本・資料のタイトル</label>
                    <input type="text" required value={newBookTitle} onChange={e => setNewBookTitle(e.target.value)} placeholder="例: 学力の経済学" className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-bold block mb-1">著者 / 発行所</label>
                    <input type="text" required value={newBookAuthor} onChange={e => setNewBookAuthor(e.target.value)} placeholder="例: 中室牧子" className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-bold block mb-1">表紙画像（任意・5MB以下）</label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={e => {
                        const file = e.target.files?.[0] ?? null;
                        if (!file) { setNewBookCover(null); return; }
                        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
                          setBooksMessage('画像はJPG・PNG・WebP形式、5MB以下のものを選んでください。');
                          e.currentTarget.value = '';
                          return;
                        }
                        setBooksMessage('');
                        setNewBookCover(file);
                      }}
                      className="w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-200"
                    />
                    {newBookCoverPreview && (
                      <div className="mt-3 flex items-center gap-3">
                        <img src={newBookCoverPreview} alt="選択した表紙のプレビュー" className="h-20 w-16 rounded-lg border border-slate-700 object-cover" />
                        <p className="text-[10px] text-slate-400">この画像が生徒用アプリの蔵書一覧に表示されます。</p>
                      </div>
                    )}
                  </div>
                  <button type="submit" disabled={bookRegistering} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5">
                    <Plus size={14} /> {bookRegistering ? '登録中...' : '図書室の蔵書としてデータベースに登録'}
                  </button>
                </form>

                <div className="border-t border-slate-800 pt-4">
                  <h4 className="text-xs font-bold text-slate-400 mb-2">登録済みの本（削除・表紙変更）</h4>
                  {booksMessage && (
                    <p className={`text-xs mb-2 ${booksMessage.includes('失敗') || booksMessage.includes('できません') || booksMessage.includes('既に') || booksMessage.includes('削除しましたが') ? 'text-amber-300' : 'text-emerald-300'}`}>
                      {booksMessage}
                    </p>
                  )}
                  <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
                    {booksLoading ? (
                      <p className="text-xs text-slate-500">蔵書を読み込み中...</p>
                    ) : books.length === 0 ? (
                      <p className="text-xs text-slate-500">登録された本はありません。</p>
                    ) : books.map(b => (
                      <div key={b.id} className="p-2 bg-slate-900 rounded-lg text-xs flex items-center gap-3">
                        {b.cover_url ? (
                          <img src={b.cover_url} alt={`${b.title}の表紙`} className="h-12 w-9 shrink-0 rounded object-cover bg-slate-800" />
                        ) : (
                          <div className="h-12 w-9 shrink-0 rounded bg-slate-800 flex items-center justify-center"><BookOpen size={15} className="text-slate-500" /></div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-bold">『{b.title}』</p>
                          <p className="text-[10px] text-slate-500 break-words">{b.author} · {b.status}</p>
                        </div>
                        <div className="shrink-0 flex flex-col gap-1">
                          <label className="cursor-pointer rounded-lg border border-slate-700 px-2 py-1.5 text-center text-[10px] font-bold text-blue-300 hover:bg-slate-800">
                            {updatingCoverBookId === b.id ? '更新中...' : b.cover_url ? '表紙変更' : '表紙追加'}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              disabled={updatingCoverBookId === b.id || deletingBookId !== null}
                              className="hidden"
                              onChange={e => {
                                const file = e.currentTarget.files?.[0];
                                e.currentTarget.value = '';
                                if (file) void handleUpdateBookCover(b, file);
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void handleDeleteBook(b)}
                            disabled={deletingBookId !== null || updatingCoverBookId === b.id}
                            className="rounded-lg border border-red-900/80 px-2 py-1.5 text-[10px] font-bold text-red-300 hover:bg-red-950 disabled:opacity-50"
                          >
                            <span className="inline-flex items-center justify-center gap-1">
                              <Trash2 size={11} /> {deletingBookId === b.id ? '削除中...' : '削除'}
                            </span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'chat-moderation' && (
          <ChatModerationAdmin
            adminPassword={adminApiPassword}
            onAdminPasswordChange={setAdminApiPassword}
          />
        )}

        {activeTab === 'club-posts' && (
          <ClubNotesAdmin
            adminPassword={adminApiPassword}
            onAdminPasswordChange={setAdminApiPassword}
          />
        )}

        {activeTab === 'student-profile-export' && (
          <StudentProfileExportAdmin
            adminPassword={adminApiPassword}
            onAdminPasswordChange={setAdminApiPassword}
          />
        )}

      </main>
    </div>
  );
}