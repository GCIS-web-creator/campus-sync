'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { matchSchoolRangeSubjects } from '@/lib/school-range-matching';
import { formatStudyDurationInput, parseStudyDurationInput, toLocalDateTimeInput, fromLocalDateTimeInput } from '@/lib/study-session-edit';
import { classifyBookBarcode } from '@/lib/book-isbn';
import { buildBookCoverCandidates, normalizeBookCoverUrl, toBookCoverProxyUrl } from '@/lib/book-catalog';
import { advancePomodoroTimeline, calculateCountUpSeconds, normalizeIsbn13 } from '@/lib/pomodoro-timeline';
import PlanetubeDashboard from '@/components/PlanetubeDashboard';
import ContributionActivityPanel from '@/components/ContributionActivityPanel';
import { supabase } from '@/lib/supabase';
import StudentLearningAnalytics from '@/components/StudentLearningAnalytics';
import { BarChart3, BookOpenCheck, CalendarDays, CheckCircle2, GraduationCap, History, Plus, QrCode, Timer, TrendingUp, UserRound, X, Globe2, Trash2, Info, Pencil } from 'lucide-react';

const SUBJECTS = ['現代の国語', '言語文化', '論理国語', '文学国語', '国語演習', '古典探求', '古典探究', '地理総合', '地理探究', '歴史総合', '日本史探究', '世界史探究', '公共', '倫理', '政治・経済', '数学I', '数学Ⅱ', '数学III', '数３', '数学A', '数学B', '数C', '数学C', '物理基礎', '物理', '化学基礎', '化学', '生物基礎', '生物', '地学基礎', '地学', '英語コミュニケーションI', '英語コミュニケーションII', '英コミュⅡ', '英語コミュニケーションIII', '英コミュ', '論理・表現I', '論理・表現II', '論理表現Ⅱ（30分）', '論理・表現III', '論表', '情報', '情報I', '情報II', '保健', '保健（30分）', '体育', '音楽', '美術', '書道', '家庭基礎', '家庭総合', '総合的な探究の時間', '物理・生物', 'その他'] as const;
type Subject = typeof SUBJECTS[number];
type Exam = { id: string; school_year: number; term: number; exam_type: string; start_date: string; end_date: string; target_classes?: string[] | null };
type ExamSubject = { id: string; exam_id: string; subject: Subject; exam_date: string; sort_order: number };
type Range = { id: string; subject_id: string | null; school_test_subject_id: string | null; title: string; status: 'not_started' | 'in_progress' | 'completed' | 'reviewed' };
type SchoolRangeSection = { section_id: string; kind: 'range' | 'notice'; title: string; body: string; note?: string | null };
type SchoolExamRange = { id: string; exam_id: string; subject: string; display_subject: string; audience: string; range_sections: SchoolRangeSection[]; sort_order: number };
type PublishedRangeProgress = { school_test_range_id: string; section_id: string; completed: boolean };
type PersonalTask = { id: string; title: string; details: string; subject: string; source: string; type: string; due: string; due_at: string | null; completed: boolean; created_at: string };
type Assignment = { id: string; title: string; details: string; subject: string; subject_option: string; target_class: string; source: string; due_at: string | null; type: string };
type MiniTestEvent = { id: string; subject: string; title: string; test_date: string; scope: string; notes: string; period: number | null; start_note: string; duration_minutes: number | null; question_count: number | null; full_score: number | null; target_class: string };
type Session = { id: string; subject_name: Subject; task_title: string; test_range_title: string; focus_seconds: number; break_seconds: number; started_at: string; ended_at: string; reflection: string; next_action: string; finish_kind: 'completed' | 'stopped'; test_subject_id?: string | null; notebook_id?: string | null; book_id?: string | null };
type NotebookOption = { id: string; name: string; subjects: string[]; status: 'unused' | 'in_use' | 'stored' | 'finished'; used_pages: number; total_pages: number };
type MyBook = {
  id: string; user_id: string; isbn13: string; title: string; authors: string[];
  publisher: string | null; published_date: string | null; description: string | null;
  thumbnail_url: string | null; info_url: string | null; page_count: number | null;
  source: 'openlibrary' | 'google-books' | 'openbd' | 'kirihara' | 'ndl' | 'keirinkan' | 'kenkyusha' | 'manual'; created_at: string;
  cover_urls?: string[];
};
type BookMetadata = Omit<MyBook, 'id' | 'user_id' | 'created_at'>;
type TimerMode = 'pomodoro' | 'countup';
type TimerSnapshot = {
  version: 1 | 2 | 3;
  timerMode?: TimerMode;
  savedAt: number;
  phase: 'focus' | 'break';
  timerState: 'running' | 'paused' | 'idle';
  remaining: number;
  focusSeconds: number;
  breakSeconds: number;
  focusMinutes: number;
  breakMinutes: number;
  focusSubject: Subject;
  focusSubjectId: string;
  task: string;
  rangeId: string;
  startedAt: string | null;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  showRecord: boolean;
  reflection: string;
  nextAction: string;
  finishKind: 'completed' | 'stopped';
  scheduleId: string | null;
  notebookId?: string | null;
  bookId?: string | null;
};
function parseTimerSnapshot(raw: unknown): TimerSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<TimerSnapshot>;
  if (![1, 2, 3].includes(Number(value.version)) || !Number.isFinite(value.savedAt) ||
      (value.phase !== 'focus' && value.phase !== 'break') ||
      !['running', 'paused', 'idle'].includes(String(value.timerState)) ||
      !Number.isFinite(value.remaining) || !Number.isFinite(value.focusSeconds) ||
      !Number.isFinite(value.breakSeconds) || !Number.isFinite(value.focusMinutes) ||
      !Number.isFinite(value.breakMinutes) || !SUBJECTS.includes(value.focusSubject as Subject)) return null;
  return { ...value, timerMode: value.timerMode === 'countup' ? 'countup' : 'pomodoro' } as TimerSnapshot;
}

function readTimerSnapshot(userId: string): TimerSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('campus-sync-study-timer:' + userId);
    if (!raw) return null;
    return parseTimerSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

function timerSnapshotSignature(snapshot: TimerSnapshot): string {
  const running = snapshot.timerState === 'running';
  return JSON.stringify({
    timerMode: snapshot.timerMode || 'pomodoro',
    timerState: snapshot.timerState,
    phase: snapshot.phase,
    focusMinutes: snapshot.focusMinutes,
    breakMinutes: snapshot.breakMinutes,
    focusSubject: snapshot.focusSubject,
    focusSubjectId: snapshot.focusSubjectId,
    task: snapshot.task,
    rangeId: snapshot.rangeId,
    notebookId: snapshot.notebookId || null,
    bookId: snapshot.bookId || null,
    startedAt: snapshot.startedAt,
    phaseEndsAt: running ? snapshot.phaseEndsAt : null,
    remaining: running ? null : snapshot.remaining,
    focusSeconds: running ? null : snapshot.focusSeconds,
    breakSeconds: running ? null : snapshot.breakSeconds,
    showRecord: snapshot.showRecord,
    reflection: snapshot.reflection,
    nextAction: snapshot.nextAction,
    finishKind: snapshot.finishKind,
    scheduleId: snapshot.scheduleId,
  });
}

const PENDING_PLANET_XP_KEY = 'campus-sync-pending-planet-xp:';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readPendingPlanetXpSessionIds(userId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PENDING_PLANET_XP_KEY + userId);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((value): value is string =>
      typeof value === 'string' && UUID_PATTERN.test(value)
    ))].slice(-100);
  } catch {
    return [];
  }
}

function writePendingPlanetXpSessionIds(userId: string, ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    const unique = [...new Set(ids.filter(id => UUID_PATTERN.test(id)))].slice(-100);
    const key = PENDING_PLANET_XP_KEY + userId;
    if (unique.length) window.localStorage.setItem(key, JSON.stringify(unique));
    else window.localStorage.removeItem(key);
  } catch (cause) {
    console.warn('未反映の学習XP IDを端末に保存できませんでした:', cause);
  }
}
const STATUS: Record<Range['status'], string> = { not_started: '未着手', in_progress: '勉強中', completed: '一通り完了', reviewed: '復習済み' };


const dayKey = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const duration = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  return hours ? hours + '時間' + (minutes ? minutes + '分' : '') : minutes + '分';
};
const dateLabel = (value: string) => new Date(value + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
const deadlineStatus = (value: string | null) => {
  if (!value) return { label: '期限なし', tone: 'neutral' as const };
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return { label: '期限未設定', tone: 'neutral' as const };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  if (due.getTime() < now.getTime()) {
    const overdueDays = Math.round((today - dueDay) / 86400000);
    return overdueDays === 0
      ? { label: '期限超過（本日）', tone: 'overdue' as const }
      : { label: `期限超過・${overdueDays}日前`, tone: 'overdue' as const };
  }
  const days = Math.round((dueDay - today) / 86400000);
  return days === 0
    ? { label: `本日 ${due.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} まで`, tone: 'today' as const }
    : { label: `あと${days}日`, tone: 'future' as const };
};


function BookCover({ src, alt, isbn, candidates = [], className = '' }: { src?: string | null; alt: string; isbn?: string; candidates?: string[]; className?: string }) {
  const [remoteSources, setRemoteSources] = useState<string[]>([]);
  const [imageIndex, setImageIndex] = useState(0);
  const [remoteRetryStarted, setRemoteRetryStarted] = useState(false);
  const sourceKey = [isbn || '', src || '', ...candidates].join('|');
  const imageSources = buildBookCoverCandidates(isbn || '', [src, ...candidates, ...remoteSources]);
  const activeImage = imageSources[imageIndex];

  useEffect(() => {
    setImageIndex(0);
    setRemoteSources([]);
    setRemoteRetryStarted(false);
  }, [sourceKey]);

  const handleImageError = () => {
    if (imageIndex + 1 < imageSources.length) {
      setImageIndex(imageIndex + 1);
      return;
    }
    if (isbn && !remoteRetryStarted) {
      setRemoteRetryStarted(true);
      void fetch('/api/books/isbn?isbn=' + encodeURIComponent(isbn), {
        method: 'GET', cache: 'force-cache', credentials: 'same-origin',
      }).then(async response => {
        const payload = await response.json().catch(() => null) as { success?: boolean; book?: BookMetadata } | null;
        const returnedSources = payload?.success ? (payload.book?.cover_urls || []) : [];
        const triedSources = new Set(imageSources);
        const sources = returnedSources.filter(value => !triedSources.has(value));
        if (response.ok && sources.length) {
          setRemoteSources(sources);
          setImageIndex(imageSources.length);
        } else {
          setImageIndex(imageSources.length);
        }
      }).catch(() => setImageIndex(imageSources.length));
      return;
    }
    setImageIndex(imageSources.length);
  };

  return (
    <div className={'flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white ' + className}>
      {activeImage
        ? <img src={toBookCoverProxyUrl(activeImage)} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={handleImageError} className="h-full w-full object-contain"/>
        : <div role="img" aria-label={alt + '（表紙画像なし）'} className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-cyan-50 to-slate-100 text-cyan-700"><BookOpenCheck size={25}/><span className="text-[8px] font-bold">CAMPUS BOOK</span></div>}
    </div>
  );
}


function CoverCandidateStrip({
  candidates = [],
  selectedUrl,
  dark = false,
  onSelect,
}: {
  candidates?: string[];
  selectedUrl?: string | null;
  dark?: boolean;
  onSelect: (url: string) => void;
}) {
  const sources = [...new Set(candidates.filter(value => typeof value === 'string' && /^https:\/\//i.test(value)))].slice(0, 8);
  if (!sources.length) return null;
  return (
    <div className="mt-2 basis-full min-w-0">
      <p className={'mb-1.5 text-[10px] font-bold ' + (dark ? 'text-slate-400' : 'text-slate-500')}>表紙候補（タップして選択）</p>
      <div className="flex flex-wrap items-end gap-2">
        {sources.map((url, index) => (
          <button
            key={url}
            type="button"
            title={'表紙候補 ' + (index + 1) + ' を選択'}
            aria-label={'表紙候補 ' + (index + 1) + ' を選択'}
            onClick={() => onSelect(url)}
            className={'rounded-lg border p-1 transition ' + (selectedUrl === url
              ? 'border-cyan-500 bg-cyan-50 ring-2 ring-cyan-500/30'
              : dark ? 'border-slate-700 bg-slate-950 hover:border-cyan-400' : 'border-slate-200 bg-white hover:border-cyan-400')}
          >
            <img
              src={toBookCoverProxyUrl(url)}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={event => { event.currentTarget.parentElement?.classList.add('hidden'); }}
              className="h-14 w-10 rounded object-contain"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function StudentLearningHub({ userId, userEmail = '', userClass = '', isDarkMode = false }: { userId: string; userEmail?: string; userClass?: string; isDarkMode?: boolean }) {
  const [tab, setTab] = useState<'overview' | 'tests' | 'mini-tests' | 'assignments' | 'focus' | 'history' | 'analysis' | 'planetube' | 'contribution'>('overview');
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<ExamSubject[]>([]);
  const [ranges, setRanges] = useState<Range[]>([]);
  const [schoolRanges, setSchoolRanges] = useState<SchoolExamRange[]>([]);
  const [expandedSchoolRangeIds, setExpandedSchoolRangeIds] = useState<string[]>([]);
  const [publishedRangeProgress, setPublishedRangeProgress] = useState<PublishedRangeProgress[]>([]);
  const [showRangeManager, setShowRangeManager] = useState(false);
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([]);
  const [personalTaskTitle, setPersonalTaskTitle] = useState('');
  const [personalTaskDetails, setPersonalTaskDetails] = useState('');
  const [personalTaskSubject, setPersonalTaskSubject] = useState<string>('その他');
  const [personalTaskType, setPersonalTaskType] = useState<'paper' | 'classroom' | 'other'>('paper');
  const [personalTaskDueAt, setPersonalTaskDueAt] = useState('');

  const [sessions, setSessions] = useState<Session[]>([]);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [editStartedAt, setEditStartedAt] = useState('');
  const [editFocusDuration, setEditFocusDuration] = useState('00:25:00');
  const [editBreakDuration, setEditBreakDuration] = useState('00:05:00');
  const [editSubjectName, setEditSubjectName] = useState<Subject>('その他');
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTestRangeTitle, setEditTestRangeTitle] = useState('');
  const [editReflection, setEditReflection] = useState('');
  const [editNextAction, setEditNextAction] = useState('');
  const [editNotebookId, setEditNotebookId] = useState('');
  const [editBookId, setEditBookId] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [historyLimit, setHistoryLimit] = useState(20);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [miniTests, setMiniTests] = useState<MiniTestEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingXpSessionIds, setPendingXpSessionIds] = useState<string[]>([]);
  const [pendingXpReady, setPendingXpReady] = useState(false);
  const [examId, setExamId] = useState('');
  const [rangeInput, setRangeInput] = useState('');
  const [rangeTarget, setRangeTarget] = useState('');
  const [scienceTrack, setScienceTrack] = useState<'physics' | 'biology' | null>(null);
  const [scienceTrackSaving, setScienceTrackSaving] = useState(false);

  const displaySubjectName = (value: string): string => {
    if (!scienceTrack || !value.includes('物理・生物')) return value;
    return value.replace(/物理・生物/g, scienceTrack === 'physics' ? '物理' : '生物');
  };

  const saveScienceTrack = async (value: 'physics' | 'biology') => {
    setScienceTrackSaving(true);
    const { error: preferenceError } = await supabase
      .from('student_learning_preferences')
      .upsert({ user_id: userId, science_track: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (preferenceError) {
      setError('理科選択を保存できませんでした。もう一度お試しください。');
    } else {
      setScienceTrack(value);
      setMessage('理科選択を「' + (value === 'physics' ? '物理' : '生物') + '」に設定しました。');
    }
    setScienceTrackSaving(false);
  };

  useEffect(() => {
    let active = true;
    void supabase.from('student_learning_preferences')
      .select('science_track')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error: preferenceError }) => {
        if (!active || preferenceError) return;
        if (data?.science_track === 'physics' || data?.science_track === 'biology') {
          setScienceTrack(data.science_track);
        }
      });
    return () => { active = false; };
  }, [userId]);

  const [focusSubject, setFocusSubject] = useState<Subject>('国語演習');
  const [focusSubjectId, setFocusSubjectId] = useState('');
  const [availableNotebooks, setAvailableNotebooks] = useState<NotebookOption[]>([]);
  const [focusNotebookId, setFocusNotebookId] = useState('');

  useEffect(() => {
    let active = true;
    void supabase.from('student_notebooks')
      .select('id,name,subjects,status,used_pages,total_pages')
      .eq('user_id', userId)
      .in('status', ['unused', 'in_use', 'stored', 'finished'])
      .order('updated_at', { ascending: false })
      .then(({ data, error: notebookError }) => {
        if (!active || notebookError) return;
        setAvailableNotebooks((data || []) as NotebookOption[]);
      });
    return () => { active = false; };
  }, [userId]);
  const [task, setTask] = useState('');
  const [rangeId, setRangeId] = useState('');
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [timerMode, setTimerMode] = useState<TimerMode>('pomodoro');
  const [customFocus, setCustomFocus] = useState('25');
  const [customBreak, setCustomBreak] = useState('5');
  const [phase, setPhase] = useState<'focus' | 'break'>('focus');
  const [timerState, setTimerState] = useState<'idle' | 'running' | 'paused'>('idle');
  const [remaining, setRemaining] = useState(1500);
  const [focusSeconds, setFocusSeconds] = useState(0);
  const [breakSeconds, setBreakSeconds] = useState(0);
  const [showRecord, setShowRecord] = useState(false);
  const [reflection, setReflection] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [finishKind, setFinishKind] = useState<'completed' | 'stopped'>('completed');
  const [timerReady, setTimerReady] = useState(false);
  const [timerScheduleId, setTimerScheduleId] = useState<string | null>(null);
  const [timerPushStatus, setTimerPushStatus] = useState('');
  const timerSongRef = useRef<HTMLAudioElement | null>(null);
  const [timerSongStatus, setTimerSongStatus] = useState('');
  const needsTimerPushRefresh = useRef(false);
  const startedAt = useRef<string | null>(null);
  const [phaseStartedAt, setPhaseStartedAt] = useState<number | null>(null);
  const [phaseEndsAt, setPhaseEndsAt] = useState<number | null>(null);
  const timerBaseFocusSecondsRef = useRef(0);
  const remoteTimerUpdatedAtRef = useRef<string | null>(null);
  const cloudTimerSignatureRef = useRef<string | null>(null);
  const cloudTimerSavingRef = useRef(false);
  const [timerSyncStatus, setTimerSyncStatus] = useState('');
  const [myBooks, setMyBooks] = useState<MyBook[]>([]);
  const [myBooksLoading, setMyBooksLoading] = useState(true);
  const [bookScannerOpen, setBookScannerOpen] = useState(false);
  const [bookIsbnInput, setBookIsbnInput] = useState('');
  const [bookLookupLoading, setBookLookupLoading] = useState(false);
  const [bookLookupMessage, setBookLookupMessage] = useState('');
  const [bookPreview, setBookPreview] = useState<BookMetadata | null>(null);
  const [bookCoverUrlDraft, setBookCoverUrlDraft] = useState('');
  const [bookManualEntry, setBookManualEntry] = useState(false);
  const [manualBookTitle, setManualBookTitle] = useState('');
  const [manualBookAuthor, setManualBookAuthor] = useState('');
  const [bookSaving, setBookSaving] = useState(false);
  const [bookStudySelection, setBookStudySelection] = useState('');
  const bookScannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
  const bookScanHandledRef = useRef(false);
  const lastUnsupportedBookBarcodeRef = useRef('');
  const attemptedBookCoverRefreshIdsRef = useRef(new Set<string>());
  const bookScannerElementId = 'campus-sync-isbn-scanner-' + userId.replace(/[^a-zA-Z0-9_-]/g, '');
  const setTimerRemaining = (value: number) => { setRemaining(value); };

  const cancelTimerPush = useCallback(async (scheduleId = timerScheduleId): Promise<boolean> => {
    if (!scheduleId) return true;
    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const accessToken = authData.session?.access_token;
      if (authError || !accessToken) throw new Error('ログイン状態を確認できません。');
      const response = await fetch('/api/push/study-timer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({ action: 'cancel', schedule_id: scheduleId }),
      });
      const payload = await response.json().catch(() => ({})) as { success?: boolean; message?: string };
      if (!response.ok || !payload.success) throw new Error(payload.message || '予約通知を取り消せませんでした。');
      setTimerScheduleId(current => current === scheduleId ? null : current);
      return true;
    } catch (cause) {
      setTimerPushStatus(cause instanceof Error ? cause.message : '予約通知を取り消せませんでした。');
      return false;
    }
  }, [timerScheduleId]);

  const scheduleTimerPush = useCallback(async (phaseValue: 'focus' | 'break', seconds: number): Promise<boolean> => {
    const cleared = await cancelTimerPush();
    if (!cleared) {
      setTimerPushStatus('以前の通知予約を取り消せなかったため、新しい予約は作成していません。通信状態を確認してください。');
      return false;
    }
    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const accessToken = authData.session?.access_token;
      if (authError || !accessToken) throw new Error('ログイン状態を確認できません。');
      const scheduleId = crypto.randomUUID();
      setTimerScheduleId(scheduleId);
      const response = await fetch('/api/push/study-timer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({
          action: 'schedule',
          schedule_id: scheduleId,
          phase: phaseValue,
          remaining_seconds: Math.max(1, Math.ceil(seconds)),
          break_seconds: phaseValue === 'focus' ? breakMinutes * 60 : 0,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { success?: boolean; message?: string; scheduled_count?: number };
      if (!response.ok || !payload.success) throw new Error(payload.message || 'タイマー通知を予約できませんでした。');
      setTimerPushStatus('端末を閉じていても届く終了通知を予約しました。');
      return true;
    } catch (cause) {
      setTimerScheduleId(null);
      setTimerPushStatus(cause instanceof Error ? cause.message : 'タイマー通知を予約できませんでした。');
      return false;
    }
  }, [breakMinutes, cancelTimerPush]);

  const getTimerSong = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (!timerSongRef.current) {
      const audio = new Audio('/audio/x005_saba.mp3');
      audio.preload = 'auto';
      audio.volume = 0.85;
      audio.addEventListener('ended', () => setTimerSongStatus('「鯖の味噌煮と牛乳」の再生が終了しました。'));
      audio.addEventListener('error', () => setTimerSongStatus('曲を読み込めませんでした。通信状態を確認してください。'));
      timerSongRef.current = audio;
    }
    return timerSongRef.current;
  }, []);

  const prepareTimerSong = useCallback(() => {
    const audio = getTimerSong();
    if (!audio) return;
    // Start and immediately pause inside the user's Start gesture so mobile browsers
    // can authorize later playback when the timer reaches zero.
    audio.muted = true;
    void audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
    }).catch(() => {
      audio.muted = false;
    });
  }, [getTimerSong]);

  const playTimerSong = useCallback(() => {
    const audio = getTimerSong();
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    setTimerSongStatus('「鯖の味噌煮と牛乳」を再生しています。');
    void audio.play().catch((cause: unknown) => {
      console.warn('タイマー曲を再生できませんでした:', cause);
      setTimerSongStatus('曲を再生できませんでした。もう一度「通知音をテスト」を押してください。');
    });
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([260, 120, 260, 120, 520]);
    }
  }, [getTimerSong]);

  const stopTimerSong = useCallback(() => {
    const audio = timerSongRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setTimerSongStatus('曲を停止しました。');
  }, []);

  const loadMyBooks = useCallback(async () => {
    setMyBooksLoading(true);
    const { data, error: booksError } = await supabase
      .from('student_my_books')
      .select('id,user_id,isbn13,title,authors,publisher,published_date,description,thumbnail_url,cover_urls,info_url,page_count,source,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (booksError) {
      setBookLookupMessage('マイブックを読み込めませんでした。ページを再読み込みしてください。');
    } else {
      setMyBooks((data || []) as MyBook[]);
    }
    setMyBooksLoading(false);
  }, [userId]);

  useEffect(() => { void loadMyBooks(); }, [loadMyBooks]);


  useEffect(() => {
    const missingCovers = myBooks
      .filter(book => (!book.thumbnail_url || !book.cover_urls?.length) && !attemptedBookCoverRefreshIdsRef.current.has(book.id))
      .slice(0, 4);
    if (!missingCovers.length) return;
    missingCovers.forEach(book => attemptedBookCoverRefreshIdsRef.current.add(book.id));
    let cancelled = false;

    void Promise.all(missingCovers.map(async book => {
      try {
        const response = await fetch('/api/books/isbn?isbn=' + encodeURIComponent(book.isbn13), {
          method: 'GET', cache: 'no-store', credentials: 'same-origin',
        });
        const payload = await response.json().catch(() => null) as { success?: boolean; book?: BookMetadata } | null;
        const coverUrl = payload?.success ? payload.book?.thumbnail_url : null;
        const coverUrls = payload?.success ? payload.book?.cover_urls || [] : [];
        if (!response.ok || (!coverUrl && !coverUrls.length)) return null;

        const updates: Record<string, unknown> = {
          cover_urls: buildBookCoverCandidates(book.isbn13, [book.thumbnail_url, ...coverUrls]),
          info_url: book.info_url || payload?.book?.info_url || null,
        };
        if (!book.thumbnail_url && coverUrl) updates.thumbnail_url = coverUrl;
        const { data, error: updateError } = await supabase
          .from('student_my_books')
          .update(updates)
          .eq('id', book.id)
          .eq('user_id', userId)
          .select('id,thumbnail_url,cover_urls,info_url')
          .maybeSingle();
        if (updateError || !data) return null;
        return {
          id: book.id,
          thumbnail_url: data.thumbnail_url as string | null,
          cover_urls: (data.cover_urls || []) as string[],
          info_url: data.info_url as string | null,
        };
      } catch {
        return null;
      }
    })).then(updated => {
      if (cancelled) return;
      const byId = new Map(updated.filter((item): item is NonNullable<typeof item> => !!item).map(item => [item.id, item]));
      if (!byId.size) return;
      setMyBooks(previous => previous.map(book => {
        const value = byId.get(book.id);
        return value ? { ...book, thumbnail_url: value.thumbnail_url, cover_urls: value.cover_urls, info_url: value.info_url } : book;
      }));
    });

    return () => { cancelled = true; };
  }, [myBooks, userId]);


  const lookupBookIsbn = async (rawValue: string) => {
    const barcode = classifyBookBarcode(rawValue);
    if (barcode.type === 'japanese-book-auxiliary') {
      setBookLookupMessage('これはISBNではなく、日本の書籍用補助バーコードです（分類コード ' + barcode.classificationCode + '・価格表示 ' + barcode.priceYen.toLocaleString('ja-JP') + '円）。同じ本の近くにある978または979から始まるISBNバーコードを読み取ってください。');
      setBookManualEntry(false);
      return;
    }
    const isbn = barcode.type === 'isbn' ? barcode.isbn13 : normalizeIsbn13(rawValue);
    if (!isbn) {
      setBookLookupMessage('有効なISBN-13（978 / 979から始まる13桁）またはISBN-10を入力してください。');
      setBookManualEntry(false);
      return;
    }
    setBookIsbnInput(isbn);
    setBookLookupLoading(true);
    setBookLookupMessage('日本の書籍情報・表紙画像を検索しています…');
    setBookPreview(null);
    setBookCoverUrlDraft('');
    setBookManualEntry(false);
    try {
      const response = await fetch('/api/books/isbn?isbn=' + encodeURIComponent(isbn), {
        method: 'GET', cache: 'no-store', credentials: 'same-origin',
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; book?: BookMetadata; message?: string } | null;
      if (!response.ok || !payload?.success || !payload.book) {
        setBookLookupMessage(payload?.message || '書誌情報が見つかりませんでした。タイトルを手入力して登録できます。');
        setBookManualEntry(true);
        return;
      }
      if (payload.book.source === 'manual') {
        setManualBookTitle('');
        setManualBookAuthor('');
        setBookManualEntry(true);
        setBookLookupMessage('ISBNは読み取れました。書誌データが見つからない本も登録できます。書名を入力してください。');
      } else {
        setBookLookupMessage(myBooks.some(item => item.isbn13 === payload.book!.isbn13)
          ? (payload.book.thumbnail_url ? '書誌情報と表紙を取得しました。この本はすでに登録されています。' : '書誌情報を取得しました。この本はすでに登録されています。')
          : (payload.book.thumbnail_url ? '書誌情報と表紙画像を取得しました。内容を確認して登録してください。' : '書誌情報を取得しました。表紙画像は見つからなかったため、後から再取得します。'));
      }
      setBookPreview(payload.book);
      setBookCoverUrlDraft(payload.book.thumbnail_url || '');
    } catch (cause) {
      setBookLookupMessage(cause instanceof Error ? cause.message : '書誌情報を取得できませんでした。');
      setBookManualEntry(true);
    } finally {
      setBookLookupLoading(false);
    }
  };

  const saveMyBook = async (book: BookMetadata) => {
    const pastedCoverUrl = normalizeBookCoverUrl(bookCoverUrlDraft);
    const bookToSave: BookMetadata = pastedCoverUrl
      ? {
          ...book,
          thumbnail_url: pastedCoverUrl,
          cover_urls: buildBookCoverCandidates(book.isbn13, [pastedCoverUrl, ...(book.cover_urls || [])]),
        }
      : book;
    if (myBooks.some(item => item.isbn13 === book.isbn13)) {
      setBookLookupMessage('この本はすでにマイブックに登録されています。');
      return;
    }
    setBookSaving(true);
    setBookLookupMessage('');
    try {
      const { data, error: insertError } = await supabase
        .from('student_my_books')
        .insert({ ...bookToSave, user_id: userId })
        .select('id,user_id,isbn13,title,authors,publisher,published_date,description,thumbnail_url,cover_urls,info_url,page_count,source,created_at')
        .single();
      if (insertError) {
        if (insertError.code === '23505') throw new Error('この本はすでに登録されています。');
        throw insertError;
      }
      setMyBooks(current => [{ ...(data as MyBook), cover_urls: bookToSave.cover_urls || [] }, ...current]);
      setBookPreview(null);
      setBookCoverUrlDraft('');
      setBookManualEntry(false);
      setManualBookTitle('');
      setManualBookAuthor('');
      setBookLookupMessage('「' + book.title + '」をマイブックに登録しました。勉強内容から選べます。');
    } catch (cause) {
      setBookLookupMessage(cause instanceof Error ? cause.message : '本を登録できませんでした。');
    } finally {
      setBookSaving(false);
    }
  };


  const updateSavedBookCover = async (book: MyBook, thumbnailUrl: string, candidateUrls: string[] = []) => {
    if (!thumbnailUrl) return;
    const coverUrls = buildBookCoverCandidates(book.isbn13, [thumbnailUrl, ...candidateUrls]);
    const { data, error } = await supabase
      .from('student_my_books')
      .update({ thumbnail_url: thumbnailUrl, cover_urls: coverUrls })
      .eq('id', book.id)
      .eq('user_id', userId)
      .select('id,thumbnail_url,cover_urls')
      .single();
    if (error || !data) {
      setBookLookupMessage('選択した表紙を保存できませんでした。もう一度お試しください。');
      return;
    }
    setMyBooks(previous => previous.map(item => item.id === book.id
      ? { ...item, thumbnail_url: data.thumbnail_url as string, cover_urls: (data.cover_urls || []) as string[] }
      : item));
    setBookPreview(null);
    setBookLookupMessage('「' + book.title + '」の表紙を変更しました。');
  };

  const deleteMyBook = async (book: MyBook) => {
    const { error: deleteError } = await supabase.from('student_my_books').delete().eq('id', book.id).eq('user_id', userId);
    if (deleteError) {
      setBookLookupMessage('本を削除できませんでした。');
      return;
    }
    setMyBooks(current => current.filter(item => item.id !== book.id));
    setBookLookupMessage('「' + book.title + '」をマイブックから削除しました。');
  };

  const stopBookScanner = async () => {
    const scanner = bookScannerRef.current;
    bookScannerRef.current = null;
    if (scanner) {
      try { await scanner.stop(); } catch { /* camera already stopped */ }
      try { scanner.clear(); } catch { /* DOM already removed */ }
    }
    setBookScannerOpen(false);
  };

  const startBookScanner = async () => {
    setBookLookupMessage('');
    bookScanHandledRef.current = false;
    lastUnsupportedBookBarcodeRef.current = '';
    setBookScannerOpen(true);
    try {
      await new Promise(resolve => window.setTimeout(resolve, 180));
      if (!document.getElementById(bookScannerElementId)) {
        throw new Error('バーコード読み取り画面を準備できませんでした。');
      }
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
      const scanner = new Html5Qrcode(bookScannerElementId, {
        verbose: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF,
        ],
      });
      bookScannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: (viewfinderWidth, viewfinderHeight) => ({ width: Math.max(180, Math.min(520, viewfinderWidth - 24)), height: Math.max(110, Math.min(220, Math.floor(viewfinderHeight * 0.58))) }), aspectRatio: 1.7777777778 },
        async decodedText => {
          if (bookScanHandledRef.current) return;
          const barcode = classifyBookBarcode(decodedText);
          if (barcode.type !== 'isbn') {
            if (lastUnsupportedBookBarcodeRef.current !== decodedText) {
              lastUnsupportedBookBarcodeRef.current = decodedText;
              setBookLookupMessage(barcode.type === 'japanese-book-auxiliary'
                ? '補助バーコードを読み取りました。これはISBNではありません（分類コード ' + barcode.classificationCode + '・価格表示 ' + barcode.priceYen.toLocaleString('ja-JP') + '円）。カメラを本のもう一方の978 / 979から始まるバーコードへ向けてください。'
                : 'ISBNバーコードではありません。978 / 979から始まる13桁のISBNバーコードを枠内に合わせてください。');
            }
            return;
          }
          const isbn = barcode.isbn13;
          bookScanHandledRef.current = true;
          await stopBookScanner();
          setBookIsbnInput(isbn);
          void lookupBookIsbn(isbn);
        },
        () => undefined,
      );
    } catch {
      await stopBookScanner();
      setBookLookupMessage('カメラを起動できませんでした。ブラウザーのカメラ権限とHTTPS接続を確認してください。');
    }
  };

  useEffect(() => () => {
    const scanner = bookScannerRef.current;
    bookScannerRef.current = null;
    if (scanner) void scanner.stop().catch(() => undefined).finally(() => {
      try { scanner.clear(); } catch { /* unmount cleanup */ }
    });
  }, []);

  const studentIdentifier = (userEmail || '').trim().toLowerCase().split('@')[0];
  const dark = isDarkMode;
  const panel = 'rounded-2xl border p-4 ' + (dark ? 'border-slate-700 bg-slate-800 text-slate-100' : 'border-slate-200 bg-white text-slate-900');
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const input = 'w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 ' + (dark ? 'border-slate-600 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900');
  const primary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-black text-white hover:bg-cyan-600 disabled:opacity-50';
  const secondary = 'inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ' + (dark ? 'border-slate-600 bg-slate-900 text-slate-200' : 'border-slate-200 bg-white text-slate-700');

  const openSessionEditor = (session: Session) => {
    setEditingSession(session);
    setEditSubjectName(session.subject_name);
    setEditStartedAt(toLocalDateTimeInput(session.started_at));
    setEditFocusDuration(formatStudyDurationInput(session.focus_seconds));
    setEditBreakDuration(formatStudyDurationInput(session.break_seconds || 0));
    setEditTaskTitle(session.task_title || '');
    setEditTestRangeTitle(session.test_range_title || '');
    setEditReflection(session.reflection || '');
    setEditNextAction(session.next_action || '');
    setEditNotebookId(session.notebook_id || '');
    setEditBookId(session.book_id || '');
    setEditError('');
  };

  const closeSessionEditor = () => {
    if (editSaving) return;
    setEditingSession(null);
    setEditError('');
  };

  const saveSessionEdits = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingSession || editSaving) return;

    const focusSecondsValue = parseStudyDurationInput(editFocusDuration);
    const breakSecondsValue = parseStudyDurationInput(editBreakDuration);
    const startedAtValue = fromLocalDateTimeInput(editStartedAt);

    if (focusSecondsValue === null || focusSecondsValue < 1) {
      setEditError('集中時間は00:00:01〜24:00:00の範囲で入力してください。');
      return;
    }
    if (breakSecondsValue === null) {
      setEditError('休憩時間は00:00:00〜24:00:00の形式で入力してください。');
      return;
    }
    if (!startedAtValue) {
      setEditError('開始日時を正しく入力してください。');
      return;
    }
    if (editTaskTitle.trim().length > 180 || editTestRangeTitle.trim().length > 160 || editReflection.length > 2000 || editNextAction.length > 1000) {
      setEditError('勉強内容・テスト範囲・振り返りの文字数が上限を超えています。');
      return;
    }
    if (editBookId && !myBooks.some(book => book.id === editBookId)) {
      setEditError('選択した本がマイブックに見つかりません。再読み込みしてください。');
      return;
    }
    if (editNotebookId && !availableNotebooks.some(notebook => notebook.id === editNotebookId)) {
      setEditError('選択したノートがノート一覧に見つかりません。再読み込みしてください。');
      return;
    }

    const startedAtDate = new Date(startedAtValue);
    const endedAtDate = new Date(startedAtDate.getTime() + (focusSecondsValue + breakSecondsValue) * 1000);
    if (Number.isNaN(endedAtDate.getTime())) {
      setEditError('日時を計算できませんでした。入力内容を確認してください。');
      return;
    }

    setEditSaving(true);
    setEditError('');
    try {
      const { data: updatedSession, error: updateError } = await supabase
        .from('student_study_sessions')
        .update({
          started_at: startedAtDate.toISOString(),
          ended_at: endedAtDate.toISOString(),
          focus_seconds: focusSecondsValue,
          break_seconds: breakSecondsValue,
          subject_name: editSubjectName,
          task_title: editTaskTitle.trim(),
          test_range_title: editTestRangeTitle.trim(),
          reflection: editReflection.trim(),
          next_action: editNextAction.trim(),
          notebook_id: editNotebookId || null,
          book_id: editBookId || null,
        })
        .eq('id', editingSession.id)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (updateError) throw updateError;
      if (!updatedSession) throw new Error('更新された学習記録を取得できませんでした。');

      setSessions(previous => previous
        .map(item => item.id === editingSession.id ? updatedSession as Session : item)
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()));
      setEditingSession(null);
      setMessage('学習記録を更新しました。日別・週別・科目別・カレンダーの集計にも反映されています。');
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : '学習記録を更新できませんでした。');
    } finally {
      setEditSaving(false);
    }
  };

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true); setError('');
    try {
      const [a, b, c, e, f, g, h, i] = await Promise.all([
        supabase.from('school_test_exams').select('*').order('start_date', { ascending: false }),
        supabase.from('school_test_subjects').select('*').order('exam_date').order('sort_order'),
        supabase.from('student_test_ranges').select('*').eq('user_id', userId).order('created_at'),
        supabase.from('assignments').select('id,title,details,subject,subject_option,target_class,source,due_at,type').eq('is_active', true).order('due_at', { ascending: true, nullsFirst: false }),
        supabase.from('mini_test_events').select('id,subject,title,test_date,scope,notes,period,start_note,duration_minutes,question_count,full_score,target_class').eq('audience', 'school').eq('status', 'published').gte('test_date', dayKey(new Date())).order('test_date').limit(40),
        supabase.from('school_test_ranges').select('id,exam_id,subject,display_subject,audience,range_sections,sort_order').order('sort_order', { ascending: true }),
        supabase.from('student_school_range_progress').select('school_test_range_id,section_id,completed').eq('user_id', userId),
        supabase.from('todos').select('id,title,details,subject,source,type,due,due_at,completed,created_at').eq('student_id', studentIdentifier).order('created_at', { ascending: false }),
      ]);
      const issue = a.error || b.error || c.error || e.error || f.error || g.error || h.error || i.error;
      if (issue) throw issue;

      // Load the complete personal study history in ordered pages for long-range analytics.
      const allSessions: Session[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data: page, error: pageError } = await supabase
          .from('student_study_sessions')
          .select('*')
          .eq('user_id', userId)
          .order('started_at', { ascending: false })
          .order('id', { ascending: false })
          .range(offset, offset + 999);
        if (pageError) throw pageError;
        const rows = (page || []) as Session[];
        allSessions.push(...rows);
        if (rows.length < 1000) break;
      }
      const newExams = ((a.data || []) as Exam[]).filter(exam => {
        const targetClasses = Array.isArray(exam.target_classes) ? exam.target_classes : [];
        return targetClasses.length === 0 || targetClasses.includes(userClass);
      });
      const visibleExamIds = new Set(newExams.map(exam => exam.id));
      const newSubjects = ((b.data || []) as ExamSubject[]).filter(subject => visibleExamIds.has(subject.exam_id));
      setExams(newExams); setSubjects(newSubjects); setRanges((c.data || []) as Range[]); setSchoolRanges((g.data || []) as SchoolExamRange[]); setSessions(allSessions);
      setAssignments((e.data || []) as Assignment[]);
      setMiniTests((f.data || []) as MiniTestEvent[]);
      setPublishedRangeProgress((h.data || []) as PublishedRangeProgress[]);
      setPersonalTasks((i.data || []) as PersonalTask[]);
      setExamId(current => current && newExams.some(exam => exam.id === current) ? current : (newExams[0]?.id || ''));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '学習データを読み込めませんでした。');
    } finally { setLoading(false); }
  }, [userId, userClass, studentIdentifier]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const pending = readPendingPlanetXpSessionIds(userId);
    setPendingXpSessionIds(pending);
    if (pending.length) {
      setMessage('前回反映できなかった学習XPが' + pending.length + '件あります。再試行できます。');
    }
    setPendingXpReady(true);
  }, [userId]);

  useEffect(() => {
    if (!pendingXpReady) return;
    writePendingPlanetXpSessionIds(userId, pendingXpSessionIds);
  }, [pendingXpReady, pendingXpSessionIds, userId]);

  const enqueuePendingXpSession = (sessionId: string) => {
    const current = readPendingPlanetXpSessionIds(userId);
    const next = current.includes(sessionId) ? current : [...current, sessionId].slice(-100);
    writePendingPlanetXpSessionIds(userId, next);
    setPendingXpSessionIds(previous => previous.includes(sessionId) ? previous : [...previous, sessionId].slice(-100));
  };

  const removePendingXpSession = (sessionId: string) => {
    const next = readPendingPlanetXpSessionIds(userId).filter(id => id !== sessionId);
    writePendingPlanetXpSessionIds(userId, next);
    setPendingXpSessionIds(previous => previous.filter(id => id !== sessionId));
  };

  // Restore the most recent timer saved in Supabase first so every signed-in device
  // starts from the same absolute timestamps. Local storage remains an offline fallback.
  useEffect(() => {
    let cancelled = false;
    const applySnapshot = (snapshot: TimerSnapshot, remoteUpdatedAt: string | null = null) => {
      const mode: TimerMode = snapshot.timerMode === 'countup' ? 'countup' : 'pomodoro';
      setTimerMode(mode);
      setPhase(snapshot.phase);
      setFocusMinutes(snapshot.focusMinutes);
      setBreakMinutes(snapshot.breakMinutes);
      setCustomFocus(String(snapshot.focusMinutes));
      setCustomBreak(String(snapshot.breakMinutes));
      setFocusSubject(snapshot.focusSubject);
      setFocusSubjectId(snapshot.focusSubjectId || '');
      setTask(snapshot.task || '');
      setRangeId(snapshot.rangeId || '');
      setFocusNotebookId(snapshot.notebookId || '');
      setBookStudySelection(snapshot.bookId || '');
      setShowRecord(snapshot.showRecord);
      setReflection(snapshot.reflection || '');
      setNextAction(snapshot.nextAction || '');
      setFinishKind(snapshot.finishKind || 'completed');
      setTimerScheduleId(snapshot.scheduleId || null);
      startedAt.current = snapshot.startedAt;
      timerBaseFocusSecondsRef.current = Math.max(0, Math.floor(snapshot.focusSeconds || 0));
      cloudTimerSignatureRef.current = remoteUpdatedAt ? timerSnapshotSignature(snapshot) : null;
      if (remoteUpdatedAt) remoteTimerUpdatedAtRef.current = remoteUpdatedAt;

      if (snapshot.timerState === 'running' && mode === 'countup') {
        const phaseStart = Number.isFinite(snapshot.phaseStartedAt) && snapshot.phaseStartedAt !== null
          ? Number(snapshot.phaseStartedAt)
          : snapshot.savedAt;
        const baseSeconds = Math.max(0, Math.floor(snapshot.focusSeconds || 0));
        timerBaseFocusSecondsRef.current = baseSeconds;
        setFocusSeconds(calculateCountUpSeconds(baseSeconds, phaseStart, Date.now()));
        setBreakSeconds(Math.max(0, Math.floor(snapshot.breakSeconds || 0)));
        setTimerRemaining(0);
        setPhaseStartedAt(phaseStart);
        setPhaseEndsAt(null);
        setTimerState('running');
      } else if (snapshot.timerState === 'running') {
        const phaseStart = snapshot.version >= 2 && Number.isFinite(snapshot.phaseStartedAt)
          ? Number(snapshot.phaseStartedAt)
          : snapshot.savedAt;
        const phaseEnd = snapshot.version >= 2 && Number.isFinite(snapshot.phaseEndsAt)
          ? Number(snapshot.phaseEndsAt)
          : phaseStart + Math.max(0, snapshot.remaining) * 1000;
        const restored = advancePomodoroTimeline({
          phase: snapshot.phase,
          phaseStartedAt: phaseStart,
          phaseEndsAt: phaseEnd,
          focusMinutes: snapshot.focusMinutes,
          breakMinutes: snapshot.breakMinutes,
          focusSeconds: Math.max(0, Math.floor(snapshot.focusSeconds)),
          breakSeconds: Math.max(0, Math.floor(snapshot.breakSeconds)),
        }, Date.now());
        timerBaseFocusSecondsRef.current = restored.focusSeconds;
        setPhase(restored.phase);
        setTimerRemaining(restored.remaining);
        setFocusSeconds(restored.focusSeconds);
        setBreakSeconds(restored.breakSeconds);
        setPhaseStartedAt(restored.phaseStartedAt);
        setPhaseEndsAt(restored.phaseEndsAt);
        setTimerState('running');
        if (!snapshot.scheduleId || restored.transitionCount > 0) {
          setTimerScheduleId(null);
          needsTimerPushRefresh.current = true;
        }
        if (Date.now() - snapshot.savedAt > 1000) {
          setMessage('実際の経過時刻からタイマーを同期しました。');
        }
      } else {
        setTimerRemaining(Math.max(0, Math.floor(snapshot.remaining)));
        setFocusSeconds(Math.max(0, Math.floor(snapshot.focusSeconds)));
        setBreakSeconds(Math.max(0, Math.floor(snapshot.breakSeconds)));
        timerBaseFocusSecondsRef.current = Math.max(0, Math.floor(snapshot.focusSeconds));
        setPhaseStartedAt(null);
        setPhaseEndsAt(null);
        setTimerState(snapshot.timerState);
      }
      if (remoteUpdatedAt) setTimerSyncStatus('他の端末と同期済み');
    };

    const restore = async () => {
      try {
        const { data, error: remoteError } = await supabase
          .from('student_pomodoro_states')
          .select('state,updated_at')
          .eq('user_id', userId)
          .maybeSingle();
        if (cancelled) return;
        if (remoteError) throw remoteError;
        const remoteSnapshot = data ? parseTimerSnapshot(data.state) : null;
        if (remoteSnapshot && data?.updated_at) {
          applySnapshot(remoteSnapshot, data.updated_at as string);
        } else {
          const localSnapshot = readTimerSnapshot(userId);
          if (localSnapshot) applySnapshot(localSnapshot);
          setTimerSyncStatus('この端末のタイマーを同期しています');
        }
      } catch (cause) {
        if (cancelled) return;
        const localSnapshot = readTimerSnapshot(userId);
        if (localSnapshot) applySnapshot(localSnapshot);
        setTimerSyncStatus('クラウド同期を再試行中（タイマーはこの端末で継続）');
        console.warn('ポモドーロ状態をクラウドから取得できませんでした:', cause);
      } finally {
        if (!cancelled) setTimerReady(true);
      }
    };
    void restore();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!timerReady) return;
    const key = 'campus-sync-study-timer:' + userId;
    const snapshot: TimerSnapshot = {
      version: 3,
      timerMode,
      savedAt: Date.now(),
      phase,
      timerState,
      remaining,
      focusSeconds: timerState === 'running' && timerMode === 'countup'
        ? timerBaseFocusSecondsRef.current : focusSeconds,
      breakSeconds,
      focusMinutes,
      breakMinutes,
      focusSubject,
      focusSubjectId,
      task,
      rangeId,
      notebookId: focusNotebookId || null,
      bookId: bookStudySelection || null,
      startedAt: startedAt.current,
      phaseStartedAt,
      phaseEndsAt,
      showRecord,
      reflection,
      nextAction,
      finishKind,
      scheduleId: timerScheduleId,
    };
    try { window.localStorage.setItem(key, JSON.stringify(snapshot)); } catch {}
  }, [timerReady, userId, timerMode, phase, timerState, remaining, focusSeconds, breakSeconds, focusMinutes, breakMinutes, focusSubject, focusSubjectId, task, rangeId, focusNotebookId, bookStudySelection, phaseStartedAt, phaseEndsAt, showRecord, reflection, nextAction, finishKind, timerScheduleId]);

  // Persist only meaningful timer state changes; ticking seconds are reconstructed
  // from the absolute timestamps, so we do not write to Postgres every second.
  useEffect(() => {
    if (!timerReady) return;
    const snapshot: TimerSnapshot = {
      version: 3,
      timerMode,
      savedAt: Date.now(),
      phase,
      timerState,
      remaining,
      focusSeconds: timerState === 'running' && timerMode === 'countup'
        ? timerBaseFocusSecondsRef.current : focusSeconds,
      breakSeconds,
      focusMinutes,
      breakMinutes,
      focusSubject,
      focusSubjectId,
      task,
      rangeId,
      notebookId: focusNotebookId || null,
      bookId: bookStudySelection || null,
      startedAt: startedAt.current,
      phaseStartedAt,
      phaseEndsAt,
      showRecord,
      reflection,
      nextAction,
      finishKind,
      scheduleId: timerScheduleId,
    };
    const signature = timerSnapshotSignature(snapshot);
    if (signature === cloudTimerSignatureRef.current || cloudTimerSavingRef.current) return;
    cloudTimerSavingRef.current = true;
    void (async () => {
      try {
        const { data, error: saveError } = await supabase
          .from('student_pomodoro_states')
          .upsert({
            user_id: userId,
            state: snapshot,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
          .select('updated_at')
          .single();
        if (saveError) throw saveError;
        cloudTimerSignatureRef.current = signature;
        remoteTimerUpdatedAtRef.current = (data?.updated_at as string) || new Date().toISOString();
        setTimerSyncStatus('他の端末と同期済み');
      } catch (cause: unknown) {
        setTimerSyncStatus('クラウド同期に失敗しました。接続を確認してください。');
        console.error('ポモドーロ状態の同期に失敗しました:', cause);
      } finally {
        cloudTimerSavingRef.current = false;
      }
    })();
  }, [timerReady, userId, timerMode, phase, timerState, remaining, focusSeconds, breakSeconds, focusMinutes, breakMinutes, focusSubject, focusSubjectId, task, rangeId, focusNotebookId, bookStudySelection, phaseStartedAt, phaseEndsAt, showRecord, reflection, nextAction, finishKind, timerScheduleId]);

  // Supabase Realtime delivers immediate updates; polling/visibility refresh is the
  // fallback so a device still catches up after sleeping or temporarily disconnecting.
  useEffect(() => {
    if (!timerReady) return;
    let cancelled = false;
    const applyRemoteRow = (row: { state?: unknown; updated_at?: string | null }) => {
      if (!row.updated_at || !row.state) return;
      const stamp = new Date(row.updated_at).getTime();
      const currentStamp = remoteTimerUpdatedAtRef.current ? new Date(remoteTimerUpdatedAtRef.current).getTime() : 0;
      if (!Number.isFinite(stamp) || stamp <= currentStamp) return;
      const snapshot = parseTimerSnapshot(row.state);
      if (!snapshot) return;
      cloudTimerSignatureRef.current = timerSnapshotSignature(snapshot);
      remoteTimerUpdatedAtRef.current = row.updated_at;
      const mode: TimerMode = snapshot.timerMode === 'countup' ? 'countup' : 'pomodoro';
      setTimerMode(mode);
      setPhase(snapshot.phase);
      setFocusMinutes(snapshot.focusMinutes);
      setBreakMinutes(snapshot.breakMinutes);
      setCustomFocus(String(snapshot.focusMinutes));
      setCustomBreak(String(snapshot.breakMinutes));
      setFocusSubject(snapshot.focusSubject);
      setFocusSubjectId(snapshot.focusSubjectId || '');
      setTask(snapshot.task || '');
      setRangeId(snapshot.rangeId || '');
      setFocusNotebookId(snapshot.notebookId || '');
      setBookStudySelection(snapshot.bookId || '');
      setShowRecord(snapshot.showRecord);
      setReflection(snapshot.reflection || '');
      setNextAction(snapshot.nextAction || '');
      setFinishKind(snapshot.finishKind || 'completed');
      setTimerScheduleId(snapshot.scheduleId || null);
      startedAt.current = snapshot.startedAt;
      timerBaseFocusSecondsRef.current = Math.max(0, Math.floor(snapshot.focusSeconds || 0));
      if (snapshot.timerState === 'running' && mode === 'countup') {
        const phaseStart = Number.isFinite(snapshot.phaseStartedAt) && snapshot.phaseStartedAt !== null
          ? Number(snapshot.phaseStartedAt) : snapshot.savedAt;
        const baseSeconds = Math.max(0, Math.floor(snapshot.focusSeconds || 0));
        timerBaseFocusSecondsRef.current = baseSeconds;
        setFocusSeconds(calculateCountUpSeconds(baseSeconds, phaseStart, Date.now()));
        setBreakSeconds(Math.max(0, Math.floor(snapshot.breakSeconds || 0)));
        setTimerRemaining(0);
        setPhaseStartedAt(phaseStart);
        setPhaseEndsAt(null);
        setTimerState('running');
      } else if (snapshot.timerState === 'running') {
        const phaseStart = snapshot.version >= 2 && Number.isFinite(snapshot.phaseStartedAt)
          ? Number(snapshot.phaseStartedAt) : snapshot.savedAt;
        const phaseEnd = snapshot.version >= 2 && Number.isFinite(snapshot.phaseEndsAt)
          ? Number(snapshot.phaseEndsAt) : phaseStart + Math.max(0, snapshot.remaining) * 1000;
        const restored = advancePomodoroTimeline({
          phase: snapshot.phase, phaseStartedAt: phaseStart, phaseEndsAt: phaseEnd,
          focusMinutes: snapshot.focusMinutes, breakMinutes: snapshot.breakMinutes,
          focusSeconds: snapshot.focusSeconds, breakSeconds: snapshot.breakSeconds,
        }, Date.now());
        timerBaseFocusSecondsRef.current = restored.focusSeconds;
        setPhase(restored.phase);
        setTimerRemaining(restored.remaining);
        setFocusSeconds(restored.focusSeconds);
        setBreakSeconds(restored.breakSeconds);
        setPhaseStartedAt(restored.phaseStartedAt);
        setPhaseEndsAt(restored.phaseEndsAt);
        setTimerState('running');
        if (!snapshot.scheduleId || restored.transitionCount > 0) needsTimerPushRefresh.current = true;
      } else {
        setTimerRemaining(Math.max(0, Math.floor(snapshot.remaining)));
        setFocusSeconds(Math.max(0, Math.floor(snapshot.focusSeconds)));
        setBreakSeconds(Math.max(0, Math.floor(snapshot.breakSeconds)));
        timerBaseFocusSecondsRef.current = Math.max(0, Math.floor(snapshot.focusSeconds));
        setPhaseStartedAt(null);
        setPhaseEndsAt(null);
        setTimerState(snapshot.timerState);
      }
      setTimerSyncStatus('他の端末からタイマー状態を受信しました');
    };

    const syncLatest = async () => {
      const { data, error: readError } = await supabase
        .from('student_pomodoro_states')
        .select('state,updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (readError) {
        setTimerSyncStatus('クラウド同期を再試行中');
        return;
      }
      if (data) applyRemoteRow(data as { state?: unknown; updated_at?: string | null });
    };

    const channel = supabase
      .channel('student-pomodoro-state-' + userId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'student_pomodoro_states',
        filter: 'user_id=eq.' + userId,
      }, payload => {
        if (payload.eventType !== 'DELETE') {
          applyRemoteRow(payload.new as { state?: unknown; updated_at?: string | null });
        }
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') setTimerSyncStatus('他の端末と同期済み');
      });

    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void syncLatest();
    }, 4000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncLatest();
    };
    document.addEventListener('visibilitychange', onVisible);
    void syncLatest();
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [timerReady, userId]);

  useEffect(() => {
    if (!timerReady || !needsTimerPushRefresh.current || timerState !== 'running') return;
    needsTimerPushRefresh.current = false;
    void scheduleTimerPush(phase, Math.max(1, remaining));
  }, [timerReady, timerState, phase, remaining, scheduleTimerPush]);

  useEffect(() => {
    if (timerMode !== 'pomodoro' || timerState !== 'running' || phaseStartedAt === null || phaseEndsAt === null) return;
    const timer = window.setInterval(() => {
      const advanced = advancePomodoroTimeline({
        phase, phaseStartedAt, phaseEndsAt, focusMinutes, breakMinutes, focusSeconds, breakSeconds,
      }, Date.now());
      setPhase(advanced.phase);
      setPhaseStartedAt(advanced.phaseStartedAt);
      setPhaseEndsAt(advanced.phaseEndsAt);
      setTimerRemaining(advanced.remaining);
      setFocusSeconds(advanced.focusSeconds);
      setBreakSeconds(advanced.breakSeconds);

      if (advanced.transitionCount > 0) {
        playTimerSong();
        setMessage(advanced.phase === 'break'
          ? '集中時間が終了しました。休憩に切り替わりました。'
          : breakMinutes <= 0
            ? '集中時間が終了しました。休憩なしで次の集中セットに進みました。'
            : '休憩が終了しました。次の集中セットを開始しました。');
        void scheduleTimerPush(advanced.phase, advanced.remaining);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [timerMode, timerState, phase, phaseStartedAt, phaseEndsAt, focusMinutes, breakMinutes, focusSeconds, breakSeconds, playTimerSong, scheduleTimerPush]);

  useEffect(() => {
    if (timerMode !== 'countup' || timerState !== 'running' || phaseStartedAt === null) return;
    const baseSeconds = timerBaseFocusSecondsRef.current;
    const anchor = phaseStartedAt;
    const timer = window.setInterval(() => {
      setFocusSeconds(calculateCountUpSeconds(baseSeconds, anchor, Date.now()));
    }, 250);
    return () => window.clearInterval(timer);
  }, [timerMode, timerState, phaseStartedAt]);


  const activeSubjects = subjects.filter(item => item.exam_id === examId);
  const activeFocusSubject = subjects.find(item => item.id === focusSubjectId) || null;
  const focusRanges = ranges.filter(item => item.subject_id === focusSubjectId);
  const daysUntilDue = (value: string | null) => {
    if (!value) return null;
    const dueKey = dayKey(new Date(value));
    const todayKey = dayKey(new Date());
    return Math.round((new Date(dueKey + 'T00:00:00').getTime() - new Date(todayKey + 'T00:00:00').getTime()) / 86400000);
  };
  const visibleMiniTests = miniTests.filter(item => item.target_class === 'all' || (userClass && item.target_class === userClass));
    const targetLabel = (assignment: Assignment) => assignment.subject_option?.trim()
    ? '理系クラス・' + assignment.subject_option + '向け'
    : assignment.target_class === 'science' ? '理系クラス向け' : '全クラス';

  const addRange = async (subjectId: string) => {
    if (!rangeInput.trim()) return;
    setSaving(true); setError('');
    try {
      const { error: insertError } = await supabase.from('student_test_ranges').insert({
        user_id: userId, subject_id: subjectId, title: rangeInput.trim(),
        sort_order: ranges.filter(item => item.subject_id === subjectId).length,
      });
      if (insertError) throw insertError;
      setRangeInput(''); setMessage('テスト範囲を追加しました。'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '範囲を追加できませんでした。'); }
    finally { setSaving(false); }
  };

  const setRangeStatus = async (id: string, status: Range['status']) => {
    const { error: updateError } = await supabase.from('student_test_ranges').update({ status }).eq('id', id).eq('user_id', userId);
    if (updateError) setError(updateError.message);
    else setRanges(current => current.map(item => item.id === id ? { ...item, status } : item));
  };

  const isVisibleSchoolRange = (item: SchoolExamRange) => item.audience !== '2年理系' || ['2-7', '2-8'].includes(userClass);
  const getPublishedRangeProgress = (targetExamId: string, subjectName: string) => {
    const visibleRows = schoolRanges.filter(item => item.exam_id === targetExamId && isVisibleSchoolRange(item));
    const matched = matchSchoolRangeSubjects(subjectName, visibleRows, scienceTrack);
    const sections = matched.rows.flatMap(row => (row.range_sections || []).filter(section => section.kind !== 'notice').map(section => ({ row, section })));
    const completed = sections.filter(({ row, section }) => publishedRangeProgress.some(progress => progress.school_test_range_id === row.id && progress.section_id === section.section_id && progress.completed)).length;
    return {
      total: sections.length,
      completed,
      percent: sections.length ? Math.round(completed / sections.length * 100) : 0,
      registeredSubjects: matched.registeredSubjects,
      missingSubjects: matched.missingSubjects,
    };
  };

  const setPublishedRangeCompleted = async (range: SchoolExamRange, section: SchoolRangeSection, completed: boolean) => {
    setError('');
    const { error: saveError } = await supabase.from('student_school_range_progress').upsert({
      user_id: userId,
      school_test_range_id: range.id,
      section_id: section.section_id,
      completed,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,school_test_range_id,section_id' });
    if (saveError) {
      setError('範囲の履修状態を保存できませんでした: ' + saveError.message);
      return;
    }
    setPublishedRangeProgress(current => {
      const found = current.some(item => item.school_test_range_id === range.id && item.section_id === section.section_id);
      return found
        ? current.map(item => item.school_test_range_id === range.id && item.section_id === section.section_id ? { ...item, completed } : item)
        : [...current, { school_test_range_id: range.id, section_id: section.section_id, completed }];
    });
  };

  const addPersonalTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!studentIdentifier) { setError('ログイン情報を取得できません。再ログインしてください。'); return; }
    if (!personalTaskTitle.trim()) { setError('課題名を入力してください。'); return; }
    const dueAt = personalTaskDueAt ? new Date(personalTaskDueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) { setError('提出期限を確認してください。'); return; }
    setSaving(true); setError('');
    try {
      const dueAtIso = dueAt ? dueAt.toISOString() : null;
      const { data, error: insertError } = await supabase.from('todos').insert({
        student_id: studentIdentifier,
        title: personalTaskTitle.trim(),
        details: personalTaskDetails.trim(),
        subject: displaySubjectName(personalTaskSubject),
        source: '自分で追加',
        type: personalTaskType,
        due: dueAt ? dueAt.toLocaleString('ja-JP') : '期限なし',
        due_at: dueAtIso,
        completed: false,
      }).select('id,title,details,subject,source,type,due,due_at,completed,created_at').single();
      if (insertError) throw insertError;
      setPersonalTasks(current => [data as PersonalTask, ...current]);
      setPersonalTaskTitle(''); setPersonalTaskDetails(''); setPersonalTaskDueAt('');
      setPersonalTaskSubject('その他'); setPersonalTaskType('paper');
      setMessage('自分用の課題を追加しました。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '課題を追加できませんでした。'); }
    finally { setSaving(false); }
  };

  const updatePersonalTask = async (id: string, changes: { completed?: boolean }) => {
    const { error: updateError } = await supabase.from('todos').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id).eq('student_id', studentIdentifier);
    if (updateError) { setError('自分用課題を更新できませんでした: ' + updateError.message); return; }
    setPersonalTasks(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
  };

  const deletePersonalTask = async (id: string) => {
    const { error: deleteError } = await supabase.from('todos').delete().eq('id', id).eq('student_id', studentIdentifier);
    if (deleteError) { setError('自分用課題を削除できませんでした: ' + deleteError.message); return; }
    setPersonalTasks(current => current.filter(item => item.id !== id));
  };

  const setPreset = (focus: number, rest: number) => {
    setFocusMinutes(focus); setBreakMinutes(rest); setCustomFocus(String(focus)); setCustomBreak(String(rest));
    if (timerState === 'idle' && timerMode === 'pomodoro') {
      setPhase('focus'); setTimerRemaining(focus * 60);
      setPhaseStartedAt(null); setPhaseEndsAt(null);
    }
  };
  const begin = async () => {
    if (!task.trim()) { setError('取り組む課題・内容を入力してください。'); return; }
    setError(''); setMessage('');
    if (timerMode === 'pomodoro') {
      const startSeconds = timerState === 'idle' ? focusMinutes * 60 : remaining;
      const reserved = await scheduleTimerPush('focus', startSeconds);
      if (!reserved) {
        setError('終了通知をサーバーに予約できなかったため、タイマーを開始しませんでした。通知設定と通信状態を確認して、もう一度開始してください。');
        return;
      }
    }
    if (timerState === 'idle') {
      const now = Date.now();
      startedAt.current = new Date(now).toISOString();
      setFocusSeconds(0); setBreakSeconds(0); setPhase('focus');
      timerBaseFocusSecondsRef.current = 0;
      if (timerMode === 'countup') {
        setTimerRemaining(0);
        setPhaseStartedAt(now);
        setPhaseEndsAt(null);
      } else {
        setTimerRemaining(focusMinutes * 60);
        setPhaseStartedAt(now);
        setPhaseEndsAt(now + focusMinutes * 60 * 1000);
      }
    }
    setShowRecord(false); setTimerState('running');
    prepareTimerSong();
  };
  const pauseTimer = () => {
    if (timerMode === 'countup' && phaseStartedAt !== null) {
      const elapsed = calculateCountUpSeconds(timerBaseFocusSecondsRef.current, phaseStartedAt, Date.now());
      timerBaseFocusSecondsRef.current = elapsed;
      setFocusSeconds(elapsed);
    } else if (timerMode === 'pomodoro' && phaseStartedAt !== null && phaseEndsAt !== null) {
      const current = advancePomodoroTimeline({
        phase, phaseStartedAt, phaseEndsAt, focusMinutes, breakMinutes, focusSeconds, breakSeconds,
      }, Date.now());
      setPhase(current.phase);
      setTimerRemaining(current.remaining);
      setFocusSeconds(current.focusSeconds);
      setBreakSeconds(current.breakSeconds);
      timerBaseFocusSecondsRef.current = current.focusSeconds;
    }
    setPhaseStartedAt(null);
    setPhaseEndsAt(null);
    setTimerState('paused');
    if (timerMode === 'pomodoro') void cancelTimerPush();
  };
  const resumeTimer = async () => {
    if (timerMode === 'pomodoro') {
      const reserved = await scheduleTimerPush(phase, remaining);
      if (!reserved) {
        setError('終了通知を再予約できなかったため、タイマーを再開しませんでした。通信状態を確認してください。');
        return;
      }
    }
    const now = Date.now();
    if (timerMode === 'countup') {
      timerBaseFocusSecondsRef.current = focusSeconds;
      setPhaseStartedAt(now);
      setPhaseEndsAt(null);
    } else {
      setPhaseStartedAt(now);
      setPhaseEndsAt(now + Math.max(1, remaining) * 1000);
    }
    setTimerState('running');
    prepareTimerSong();
  };
  const switchTimerPhase = async () => {
    if (timerMode !== 'pomodoro') return;
    const now = Date.now();
    const current = phaseStartedAt !== null && phaseEndsAt !== null
      ? advancePomodoroTimeline({ phase, phaseStartedAt, phaseEndsAt, focusMinutes, breakMinutes, focusSeconds, breakSeconds }, now)
      : { phase, remaining, focusSeconds, breakSeconds };
    setFocusSeconds(current.focusSeconds);
    setBreakSeconds(current.breakSeconds);
    const nextPhase = current.phase === 'focus' ? 'break' : 'focus';
    if (nextPhase === 'break' && breakMinutes <= 0) {
      const reserved = await scheduleTimerPush('focus', focusMinutes * 60);
      if (!reserved) {
        setError('次の集中時間の通知を予約できませんでした。通信状態を確認してください。');
        return;
      }
      const phaseStart = Date.now();
      setPhase('focus');
      setTimerRemaining(focusMinutes * 60);
      setPhaseStartedAt(phaseStart);
      setPhaseEndsAt(phaseStart + focusMinutes * 60 * 1000);
      setMessage('休憩時間は0分です。休憩を挟まず次の集中セットに進みます。');
      return;
    }
    const nextSeconds = (nextPhase === 'focus' ? focusMinutes : breakMinutes) * 60;
    const reserved = await scheduleTimerPush(nextPhase, nextSeconds);
    if (!reserved) {
      setError('フェーズ変更の通知を予約できませんでした。通信状態を確認してください。');
      return;
    }
    const phaseStart = Date.now();
    setPhase(nextPhase);
    setTimerRemaining(nextSeconds);
    setPhaseStartedAt(phaseStart);
    setPhaseEndsAt(phaseStart + nextSeconds * 1000);
  };
  const finish = (kind: 'completed' | 'stopped') => {
    if (timerState === 'running' && phaseStartedAt !== null) {
      if (timerMode === 'countup') {
        const elapsed = calculateCountUpSeconds(timerBaseFocusSecondsRef.current, phaseStartedAt, Date.now());
        timerBaseFocusSecondsRef.current = elapsed;
        setFocusSeconds(elapsed);
      } else if (phaseEndsAt !== null) {
        const current = advancePomodoroTimeline({ phase, phaseStartedAt, phaseEndsAt, focusMinutes, breakMinutes, focusSeconds, breakSeconds }, Date.now());
        setPhase(current.phase);
        setTimerRemaining(current.remaining);
        setFocusSeconds(current.focusSeconds);
        setBreakSeconds(current.breakSeconds);
        timerBaseFocusSecondsRef.current = current.focusSeconds;
      }
    }
    setPhaseStartedAt(null);
    setPhaseEndsAt(null);
    if (timerMode === 'pomodoro') void cancelTimerPush();
    setTimerState('idle'); setFinishKind(kind); setShowRecord(true); setReflection(''); setNextAction('');
  };
  const discardPausedContinuation = () => {
    if (timerMode === 'pomodoro') void cancelTimerPush();
    setTimerState('idle');
    setShowRecord(false);
    setPhase('focus');
    setFocusSeconds(0);
    setBreakSeconds(0);
    timerBaseFocusSecondsRef.current = 0;
    setTimerRemaining(timerMode === 'countup' ? 0 : focusMinutes * 60);
    setPhaseStartedAt(null);
    setPhaseEndsAt(null);
    setTask('');
    setRangeId('');
    setReflection('');
    setNextAction('');
    startedAt.current = null;
    setMessage('中断していた勉強を終了しました。前回までの学習記録は保存済みです。');
  };
  const saveSession = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (focusSeconds < 1) { setError('勉強時間が記録されていません。'); return; }
    setSaving(true); setError('');
    try {
      const { data: savedSession, error: insertError } = await supabase.from('student_study_sessions').insert({
        user_id: userId, test_subject_id: focusSubjectId || null,
        notebook_id: focusNotebookId || null,
        book_id: bookStudySelection || null,
        subject_name: displaySubjectName(focusSubject) as Subject, task_title: task.trim(),
        test_range_title: ranges.find(item => item.id === rangeId)?.title || rangeId.trim(),
        focus_seconds: focusSeconds, break_seconds: breakSeconds,
        started_at: startedAt.current || new Date().toISOString(), ended_at: new Date().toISOString(),
        reflection: reflection.trim(), next_action: nextAction.trim(), finish_kind: finishKind,
      }).select('id').single();
      if (insertError) throw insertError;

      let xpNotice = '学習XPの反映は保留されています。下の「XPを再試行」から反映できます。';
      if (savedSession?.id) {
        // 学習記録が保存できた時点で、付与リクエストより先に再試行IDを永続化する。
        enqueuePendingXpSession(savedSession.id);
        try {
          const { data: authData, error: authError } = await supabase.auth.getSession();
          const accessToken = authData.session?.access_token;
          if (authError || !accessToken) throw new Error('ログイン状態を確認できません。');
          const xpResponse = await fetch('/api/planet-civilization', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
            body: JSON.stringify({ action: 'award-learning-xp', session_id: savedSession.id }),
          });
          const xpPayload = await xpResponse.json() as { success?: boolean; message?: string; result?: { awarded_xp?: number; credited_seconds?: number; daily_limit_reached?: boolean; already_processed?: boolean } };
          if (!xpResponse.ok || !xpPayload.success) throw new Error(xpPayload.message || '学習XPを反映できませんでした。');
          const awarded = Math.max(0, Number(xpPayload.result?.awarded_xp || 0));
          removePendingXpSession(savedSession.id);
          if (xpPayload.result?.already_processed) xpNotice = 'この学習記録のXPはすでに反映済みです。二重付与はありません。';
          else if (awarded > 0) xpNotice = '学習XP +' + awarded.toLocaleString('ja-JP') + ' を獲得しました。';
          else if (xpPayload.result?.daily_limit_reached) xpNotice = '本日の学習XP上限に達しています。学習記録は保存されています。';
          else xpNotice = '学習時間を記録しました。XPは次の加算に繰り越されます。';
        } catch (xpCause) {
          xpNotice = '学習記録は保存済みです。学習XPは未反映のため、下の「XPを再試行」から反映できます。';
          console.error('惑星の学習XP反映に失敗しました（学習記録は保存済み）:', xpCause);
        }
      }
      setShowRecord(false);
      if (finishKind === 'stopped') {
        // The stopped segment is now saved and XP-accounted. Keep its remaining time
        // and task as a paused continuation; the next resume creates a new DB segment.
        setTimerState('paused');
        setPhaseStartedAt(null);
        setPhaseEndsAt(null);
        setFocusSeconds(0);
        setBreakSeconds(0);
        timerBaseFocusSecondsRef.current = 0;
        setTimerRemaining(timerMode === 'countup' ? 0 : remaining);
        startedAt.current = new Date().toISOString();
        setReflection('');
        setNextAction('');
        setMessage('途中の学習記録を保存しました。残り時間と課題を保持しています。「再開」から続けられます。' + xpNotice);
      } else {
        setTimerState('idle');
        setPhase('focus');
        setFocusSeconds(0);
        setBreakSeconds(0);
        timerBaseFocusSecondsRef.current = 0;
        setTimerRemaining(timerMode === 'countup' ? 0 : focusMinutes * 60);
        startedAt.current = null;
        setTask('');
        setRangeId('');
        setReflection('');
        setNextAction('');
        setMessage('学習記録を保存しました。' + xpNotice);
      }
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '学習記録を保存できませんでした。'); }
    finally { setSaving(false); }
  };

  const retryLearningXp = async () => {
    if (!pendingXpSessionIds.length) return;
    setSaving(true);
    setError('');
    const queuedIds = [...pendingXpSessionIds];
    let processed = 0;
    let awardedTotal = 0;
    let failed = 0;
    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const accessToken = authData.session?.access_token;
      if (authError || !accessToken) throw new Error('ログイン状態を確認できません。');

      for (const sessionId of queuedIds) {
        try {
          const response = await fetch('/api/planet-civilization', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
            body: JSON.stringify({ action: 'award-learning-xp', session_id: sessionId }),
          });
          const payload = await response.json() as { success?: boolean; message?: string; result?: { awarded_xp?: number; already_processed?: boolean } };
          if (!response.ok || !payload.success) throw new Error(payload.message || '学習XPを反映できませんでした。');
          if (!payload.result?.already_processed) {
            awardedTotal += Math.max(0, Number(payload.result?.awarded_xp || 0));
          }
          removePendingXpSession(sessionId);
          processed += 1;
        } catch (cause) {
          failed += 1;
          console.error('学習XPの再試行に失敗しました:', sessionId, cause);
        }
      }

      if (failed) {
        setError(failed + '件の学習XPを再試行できませんでした。通信状態を確認して、もう一度お試しください。');
        setMessage(processed + '件を確認しました。未反映分は端末に保存されています。');
      } else {
        setMessage(processed + '件の学習XP付与状態を確認しました。' + (awardedTotal > 0
          ? '新たに +' + awardedTotal.toLocaleString('ja-JP') + ' XP を反映しました。'
          : '新規加算はありません（二重付与なし）。'));
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '学習XPを再試行できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const today = dayKey(new Date());
  const todaySeconds = sessions.filter(item => dayKey(new Date(item.started_at)) === today).reduce((sum, item) => sum + item.focus_seconds, 0);
  const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekKey = dayKey(weekStart);
  const weekSeconds = sessions.filter(item => dayKey(new Date(item.started_at)) >= weekKey).reduce((sum, item) => sum + item.focus_seconds, 0);
  const weekData = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart); date.setDate(date.getDate() + index); const key = dayKey(date);
    return { key, label: ['月', '火', '水', '木', '金', '土', '日'][index], seconds: sessions.filter(item => dayKey(new Date(item.started_at)) === key).reduce((sum, item) => sum + item.focus_seconds, 0) };
  });
  const maxDay = Math.max(1, ...weekData.map(item => item.seconds));
  const subjectTotals = useMemo(() => {
    const totals = new Map<string, number>();
    sessions.forEach(item => totals.set(item.subject_name, (totals.get(item.subject_name) || 0) + item.focus_seconds));
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [sessions]);
  const progress = (id: string) => {
    const list = ranges.filter(item => item.school_test_subject_id === id);
    const done = list.filter(item => item.status === 'completed' || item.status === 'reviewed').length;
    return { count: list.length, percent: list.length ? Math.round(done / list.length * 100) : 0 };
  };
  const scopeColor = (percent: number, total: number, partial = false) => partial
    ? 'border-amber-300 bg-amber-100 text-amber-900'
    : !total
      ? dark ? 'border-slate-600 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-600'
      : percent === 100 ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
      : percent >= 50 ? 'border-cyan-300 bg-cyan-100 text-cyan-900'
      : percent > 0 ? 'border-amber-300 bg-amber-100 text-amber-900'
      : 'border-rose-200 bg-rose-50 text-rose-800';
  const displayTimerSeconds = timerMode === 'countup' ? focusSeconds : remaining;
  const timerHours = Math.floor(displayTimerSeconds / 3600);
  const timerMinutes = Math.floor(displayTimerSeconds % 3600 / 60);
  const timerRemainder = displayTimerSeconds % 60;
  const timeText = timerHours > 0
    ? String(timerHours).padStart(2, '0') + ':' + String(timerMinutes).padStart(2, '0') + ':' + String(timerRemainder).padStart(2, '0')
    : String(Math.floor(displayTimerSeconds / 60)).padStart(2, '0') + ':' + String(timerRemainder).padStart(2, '0');

  if (loading) return <div className={panel + ' mx-auto max-w-3xl text-center'}><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent"/><p className={'mt-3 text-sm ' + muted}>学習データを読み込んでいます…</p></div>;

  return <div className="mx-auto w-full max-w-5xl space-y-4 pb-8">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-black tracking-[.22em] text-cyan-600">CAMPUSSYNC LEARNING</p><h1 className={'mt-1 text-2xl font-black ' + (dark ? 'text-white' : 'text-slate-900')}>学習・テスト対策</h1><p className={'mt-1 text-xs ' + muted}>考査の予定、集中時間、勉強の記録をまとめて管理。</p></div><div className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-cyan-950"><p className="text-[9px] font-bold">今週の勉強時間</p><p className="text-sm font-black">{duration(weekSeconds)}</p></div></header>
    <nav className={'grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1 rounded-2xl border p-1 ' + (dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white')}>
      {[{id:'overview',label:'概要',icon:TrendingUp},{id:'tests',label:'テスト対策',icon:GraduationCap},{id:'mini-tests',label:'小テスト',icon:CalendarDays},{id:'assignments',label:'課題一覧',icon:BookOpenCheck},{id:'focus',label:'集中',icon:Timer},{id:'history',label:'記録',icon:History},{id:'analysis',label:'分析',icon:BarChart3},{id:'planetube',label:'Planetube',icon:Globe2},{id:'contribution',label:'貢献申請',icon:Plus}].map(item => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => setTab(item.id as typeof tab)} className={'flex flex-col sm:flex-row items-center justify-center gap-1 rounded-xl px-1 py-3 text-[9px] font-black sm:text-xs ' + (tab === item.id ? 'bg-cyan-700 text-white' : muted)}><Icon size={15}/>{item.label}</button>; })}
    </nav>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">{error}</div>}
    {message && <div role="status" className={'flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-bold ' + (pendingXpSessionIds.length ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800')}><span>{message}</span>{pendingXpSessionIds.length > 0 && <button type="button" onClick={() => void retryLearningXp()} disabled={saving} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-black text-amber-900 disabled:opacity-50">{saving ? '再試行中…' : 'XPを再試行（' + pendingXpSessionIds.length + '件）'}</button>}</div>}

    {tab === 'planetube' && <div className="space-y-3"><PlanetubeDashboard campusEmail={userEmail} isDarkMode={isDarkMode} /><a href="/planetube" className="flex items-center justify-center gap-2 rounded-xl border border-cyan-200/20 bg-cyan-50/5 px-4 py-3 text-xs font-black text-cyan-600 hover:bg-cyan-50/10">Planetube拡張機能の導入案内（希望者向け）<Globe2 size={15}/></a></div>}

    {tab === 'overview' && <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><section className={panel}><p className={'text-[10px] font-bold '+muted}>今日</p><p className="mt-2 text-2xl font-black text-cyan-600">{duration(todaySeconds)}</p></section><section className={panel}><p className={'text-[10px] font-bold '+muted}>今週</p><p className="mt-2 text-2xl font-black text-cyan-600">{duration(weekSeconds)}</p></section><section className={panel+' col-span-2 sm:col-span-1'}><p className={'text-[10px] font-bold '+muted}>考査登録数</p><p className="mt-2 text-2xl font-black">{exams.length}件</p></section></div>
      <section className={panel}><div className="mb-3 flex items-center justify-between"><h2 className="font-black">今週の集中時間</h2><button type="button" onClick={() => setTab('history')} className="text-xs font-bold text-cyan-600">詳細</button></div><div className="grid grid-cols-7 items-end gap-2">{weekData.map(day => <div key={day.key} className="flex flex-col items-center gap-2"><span className={'text-[9px] '+muted}>{day.seconds ? Math.round(day.seconds/60)+'分' : '—'}</span><div className={'flex h-24 w-full items-end overflow-hidden rounded-lg '+(dark?'bg-slate-900':'bg-slate-100')}><div className="w-full rounded-lg bg-gradient-to-t from-cyan-700 to-sky-400" style={{height:Math.max(day.seconds?5:0,day.seconds/maxDay*100)+'%'}}/></div><span className={'text-[10px] font-bold '+muted}>{day.label}</span></div>)}</div></section>
      <section className={panel}><div className="mb-3 flex items-center justify-between"><h2 className="font-black">次の考査</h2><button type="button" onClick={() => setTab('tests')} className="text-xs font-bold text-cyan-600">日程を見る</button></div>{exams.length ? exams.slice().sort((a,b)=>a.start_date.localeCompare(b.start_date)).slice(0,1).map(exam => <div key={exam.id} className="rounded-xl bg-gradient-to-r from-cyan-800 to-blue-700 p-4 text-white"><p className="text-xs text-cyan-100">{exam.school_year}年度・{exam.term}学期</p><p className="mt-1 text-xl font-black">{exam.exam_type}</p><p className="mt-2 text-xs">{dateLabel(exam.start_date)}〜{dateLabel(exam.end_date)}</p><p className="mt-2 text-[11px] text-white/80">{subjects.filter(item=>item.exam_id===exam.id).length}教科登録</p></div>) : <p className={'rounded-xl border border-dashed p-4 text-sm '+muted}>考査日程はAdmin・先生が登録するとここに表示されます。</p>}</section>
      <section className={panel}><div className="mb-3 flex items-center justify-between"><h2 className="font-black">教科別の集中時間</h2><button type="button" onClick={() => setTab('focus')} className="text-xs font-bold text-cyan-600">勉強を始める</button></div>{subjectTotals.length ? <div className="space-y-3">{subjectTotals.slice(0,5).map(([name,seconds])=><div key={name}><div className="mb-1 flex justify-between text-xs"><b>{name}</b><span className={muted}>{duration(seconds)}</span></div><div className={'h-2 overflow-hidden rounded-full '+(dark?'bg-slate-700':'bg-slate-100')}><div className="h-full rounded-full bg-cyan-600" style={{width:Math.max(2,seconds/Math.max(...subjectTotals.map(item=>item[1]))*100)+'%'}}/></div></div>)}</div> : <p className={'text-sm '+muted}>勉強記録を保存すると集計が表示されます。</p>}</section>
    </div>}

    {tab === 'tests' && <div className="space-y-4">
      <section className={panel}>
        <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-black">学校公式の考査日程</h2><span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black text-cyan-800">閲覧専用</span></div>
        <p className={'mb-2 text-xs leading-5 '+muted}>考査の予定・実施教科はAdmin・先生が登録します。生徒は日程を確認し、自分用のテスト範囲と進捗を管理できます。</p>
        <div className={'mb-3 rounded-xl border p-3 ' + (dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-50')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs font-black">理科の選択科目</p><p className={'mt-1 text-[10px] ' + muted}>「物理・生物」として登録された科目・範囲を、あなたの選択に合わせて表示します。</p></div>
            <div className="flex gap-2">
              <button type="button" disabled={scienceTrackSaving} onClick={() => void saveScienceTrack('physics')} aria-pressed={scienceTrack === 'physics'} className={'rounded-lg border px-3 py-2 text-xs font-black ' + (scienceTrack === 'physics' ? 'border-cyan-500 bg-cyan-500 text-white' : dark ? 'border-slate-600 bg-slate-800' : 'border-slate-200 bg-white')}>物理選択</button>
              <button type="button" disabled={scienceTrackSaving} onClick={() => void saveScienceTrack('biology')} aria-pressed={scienceTrack === 'biology'} className={'rounded-lg border px-3 py-2 text-xs font-black ' + (scienceTrack === 'biology' ? 'border-cyan-500 bg-cyan-500 text-white' : dark ? 'border-slate-600 bg-slate-800' : 'border-slate-200 bg-white')}>生物選択</button>
            </div>
          </div>
          {!scienceTrack && <p className="mt-2 text-[10px] font-bold text-amber-600">理科選択を設定すると、該当する科目名に切り替わります。</p>}
        </div>
        <p className={'mb-3 text-[10px] leading-5 '+muted}>表示の意味：0%＝公開範囲は登録済みで、履修チェックがまだ0件。「一部登録」＝複数科目のうち一部だけ公開。「範囲未登録」＝対応する学校公開範囲データがありません。0%はテストの点数ではありません。</p>
        {exams.length ? exams.map(exam => {
          const examSubjects = subjects.filter(item => item.exam_id === exam.id).slice().sort((a,b)=>a.exam_date.localeCompare(b.exam_date)||a.sort_order-b.sort_order);
          return <article key={exam.id} className={'mb-3 rounded-xl border p-3 '+(dark?'border-slate-700 bg-slate-900':'border-slate-200 bg-slate-50')}>
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold text-cyan-600">{exam.school_year}年度・{exam.term}学期</p><h3 className="text-lg font-black">{exam.exam_type}</h3></div><p className={'text-xs font-bold '+muted}>{dateLabel(exam.start_date)}〜{dateLabel(exam.end_date)}</p></div>
            <div className="mt-3 space-y-2">{Array.from(new Set(examSubjects.map(item=>item.exam_date))).sort().map(date=><div key={date}><p className={'mb-1 text-xs font-black '+muted}>{dateLabel(date)}</p><div className="flex flex-wrap gap-2">{examSubjects.filter(item=>item.exam_date===date).map(item=>{
                  const scope = getPublishedRangeProgress(exam.id, item.subject);
                  return <button key={item.id} type="button" onClick={() => {
                    setExamId(exam.id);
                    setShowRangeManager(true);
                    window.setTimeout(() => document.getElementById('subject-range-'+item.id)?.scrollIntoView({behavior:'smooth',block:'start'}), 80);
                  }} title={scope.missingSubjects.length ? '公開済み: '+scope.registeredSubjects.join('・')+' / 未登録: '+scope.missingSubjects.join('・') : scope.total ? '登録済み範囲の履修チェック率' : '学校公開の出題範囲は未登録です'} className={'flex min-w-[112px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-black shadow-sm transition hover:-translate-y-0.5 '+scopeColor(scope.percent, scope.total, scope.total > 0 && scope.missingSubjects.length > 0)}>
                    <span>{item.sort_order} ・ {displaySubjectName(item.subject)}</span>
                    <span className="shrink-0 text-[10px] tabular-nums">{scope.total ? scope.missingSubjects.length ? '一部登録' : scope.percent+'%' : '範囲未登録'}</span>
                  </button>;
                })}</div></div>)}
            {!examSubjects.length&&<p className={'text-xs '+muted}>実施教科・日ごとの日程は調整中です。確定後にここへ表示されます。</p>}</div>
            {schoolRanges.filter(item => item.exam_id === exam.id && (item.audience !== '2年理系' || ['2-7', '2-8'].includes(userClass))).length > 0 && (() => {
              const visibleRanges = schoolRanges.filter(item => item.exam_id === exam.id && (item.audience !== '2年理系' || ['2-7', '2-8'].includes(userClass)));
              const allExpanded = visibleRanges.every(item => expandedSchoolRangeIds.includes(item.id));
              return <section className={'mt-4 rounded-xl border p-3 '+(dark?'border-cyan-900 bg-cyan-950/20':'border-cyan-100 bg-cyan-50/60')}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div><h4 className="text-sm font-black">学校公開の試験範囲</h4><p className={'mt-1 text-[10px] '+muted}>{visibleRanges.length}科目・必要な科目だけ開いて確認できます</p></div>
                  <button type="button" onClick={() => setExpandedSchoolRangeIds(allExpanded ? current => current.filter(id => !visibleRanges.some(item => item.id === id)) : current => Array.from(new Set([...current, ...visibleRanges.map(item => item.id)])))} className={secondary}>{allExpanded ? 'すべて閉じる' : 'すべて開く'}</button>
                </div>
                <div className="space-y-2">{visibleRanges.map(item => {
                   const expanded = expandedSchoolRangeIds.includes(item.id);
                   const rangeSections = (item.range_sections || []).filter(section => section.kind !== 'notice');
                   const noticeSections = (item.range_sections || []).filter(section => section.kind === 'notice');
                   const completedCount = rangeSections.filter(section => publishedRangeProgress.some(progress => progress.school_test_range_id === item.id && progress.section_id === section.section_id && progress.completed)).length;
                   return <article key={item.id} className={'overflow-hidden rounded-xl border '+(dark?'border-slate-700 bg-slate-900':'border-white bg-white')}>
                     <button type="button" aria-expanded={expanded} aria-controls={'school-range-'+item.id} onClick={() => setExpandedSchoolRangeIds(current => expanded ? current.filter(id => id !== item.id) : [...current, item.id])} className={'flex w-full items-center justify-between gap-3 p-3 text-left '+(dark?'hover:bg-slate-800':'hover:bg-slate-50')}>
                       <span className="min-w-0"><span className="block text-sm font-black">{displaySubjectName(item.display_subject)}</span><span className={'mt-1 block text-[10px] font-bold '+muted}>{item.audience} ・ 範囲 {completedCount}/{rangeSections.length} 完了 ・ お知らせ {noticeSections.length}件</span></span>
                       <span className="flex shrink-0 items-center gap-2 text-cyan-600"><span className="text-[10px] font-bold">{expanded ? '閉じる' : '範囲を見る'}</span><span className={'text-lg transition-transform '+(expanded?'rotate-90':'')}>›</span></span>
                     </button>
                     {expanded && <div id={'school-range-'+item.id} className={'space-y-3 border-t p-3 '+(dark?'border-slate-700':'border-slate-100')}>
                       <div>
                         <div className="mb-2 flex items-center justify-between gap-2"><h5 className="text-xs font-black">出題範囲</h5><span className="text-[10px] font-bold text-cyan-600">{completedCount}/{rangeSections.length} 履修済み</span></div>
                         {rangeSections.length ? <div className="space-y-2">{rangeSections.map((section,index)=>{
                           const checked = publishedRangeProgress.some(progress => progress.school_test_range_id === item.id && progress.section_id === section.section_id && progress.completed);
                           return <label key={section.section_id || item.id+'-'+index} className={'flex cursor-pointer items-start gap-3 rounded-xl border p-3 '+(checked?(dark?'border-emerald-800 bg-emerald-950/30':'border-emerald-200 bg-emerald-50'):(dark?'border-slate-700 bg-slate-800':'border-slate-200 bg-slate-50'))}>
                             <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-emerald-600" checked={checked} onChange={event=>void setPublishedRangeCompleted(item,section,event.target.checked)} />
                             <span className="min-w-0 flex-1"><span className={'block text-xs font-black '+(checked?'line-through opacity-70':'')}>{section.title}</span><span className="mt-1 block whitespace-pre-wrap break-words text-xs leading-5">{section.body}</span>{section.note && <span className="mt-1 block whitespace-pre-wrap text-[11px] font-bold leading-5 text-amber-700">{section.note}</span>}</span>
                             {checked && <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500"/>}
                           </label>;
                         })}</div> : <p className={'rounded-lg border border-dashed p-3 text-xs '+muted}>出題範囲として登録された項目はありません。</p>}
                       </div>
                       {noticeSections.length > 0 && <section className={'rounded-xl border p-3 '+(dark?'border-amber-900 bg-amber-950/20':'border-amber-200 bg-amber-50')}>
                         <h5 className="mb-2 flex items-center gap-2 text-xs font-black text-amber-800"><Info size={14}/>お知らせ（履修チェック対象外）</h5>
                         <div className="space-y-2">{noticeSections.map((section,index)=><div key={section.section_id || item.id+'-notice-'+index} className="rounded-lg bg-white/60 p-2.5">
                           <p className="text-xs font-black text-amber-900">{section.title}</p>
                           <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{section.body}</p>
                           {section.note && <p className="mt-1 whitespace-pre-wrap text-[11px] font-bold leading-5 text-amber-800">{section.note}</p>}
                         </div>)}</div>
                       </section>}
                     </div>}
                   </article>;
                 })}</div>
              </section>;
            })()}
          </article>;
        }) : <p className={'rounded-xl border border-dashed p-4 text-sm '+muted}>考査日程はまだ登録されていません。Admin・先生の登録後にここへ表示されます。</p>}
      </section>
      <section className={panel}>
        <button type="button" aria-expanded={showRangeManager} onClick={()=>setShowRangeManager(value=>!value)} className="flex w-full items-center justify-between gap-3 text-left">
          <span><span className="block font-black">テスト範囲を管理する考査</span><span className={'mt-1 block text-[10px] '+muted}>教科別の進捗と自分用の学習メモを確認できます</span></span>
          <span className="flex items-center gap-2 text-xs font-bold text-cyan-600">{showRangeManager?'閉じる':'開く'}<span className={'text-lg transition-transform '+(showRangeManager?'rotate-180':'')}>⌄</span></span>
        </button>
        {showRangeManager && <div className="mt-4 space-y-3">
          {exams.length > 0 && <label className={'block space-y-1 text-xs font-bold ' + muted}>対象の考査
            <select className={input} value={examId} onChange={e=>setExamId(e.target.value)}>
              {exams.map(exam=><option key={exam.id} value={exam.id}>{exam.school_year}年度・{exam.term}学期 {exam.exam_type}</option>)}
            </select>
          </label>}
          {activeSubjects.map(subject=>{
            const list=ranges.filter(item=>item.school_test_subject_id===subject.id);
            const official=getPublishedRangeProgress(examId,subject.subject);
            const pct=official.percent;
            return <section id={'subject-range-'+subject.id} key={subject.id} className={panel+' scroll-mt-24'}>
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold text-cyan-600">{dateLabel(subject.exam_date)}</p><h3 className="text-lg font-black">{displaySubjectName(subject.subject)}</h3></div><b className={'rounded-full border px-3 py-1 text-xs '+scopeColor(official.percent,official.total,official.total > 0 && official.missingSubjects.length > 0)}>{official.total ? official.missingSubjects.length ? '一部登録' : official.percent + '% 履修済み' : '範囲未登録'}</b></div>
              {official.total>0 && <><div className={'mt-3 h-2 overflow-hidden rounded-full '+(dark?'bg-slate-700':'bg-slate-100')}><div className="h-full rounded-full bg-emerald-500 transition-all" style={{width:pct+'%'}}/></div><p className={'mt-1 text-[10px] '+muted}>学校公開の出題範囲 {official.completed}/{official.total} 項目完了。上の「学校公開の試験範囲」でチェックできます。</p></>}
              {official.missingSubjects.length > 0 && <p className={'mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-5 text-amber-900'}>公開されている範囲：{official.registeredSubjects.join('・') || 'なし'}。未登録の範囲：{official.missingSubjects.join('・')}。登録済みの科目分だけ進捗に計上しています。</p>}
              {official.total === 0 && <p className={'mt-2 text-[10px] leading-5 '+muted}>学校公開の出題範囲データがまだ紐づいていません。Admin・先生側での登録が必要です。</p>}
              <div className="mt-4 border-t border-slate-200/60 pt-3">
                <h4 className="mb-2 text-xs font-black">自分用の学習メモ</h4>
                <div className="space-y-2">{list.map(item=>{
                  const checked=item.status==='completed'||item.status==='reviewed';
                  return <label key={item.id} className={'flex cursor-pointer items-start gap-2 rounded-xl p-3 '+(dark?'bg-slate-900':'bg-slate-50')}>
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-cyan-600" checked={checked} onChange={e=>void setRangeStatus(item.id,e.target.checked?'completed':'not_started')}/>
                    <span className={'min-w-0 flex-1 text-sm font-bold '+(checked?'line-through opacity-60':'')}>{item.title}</span>
                    {checked&&<CheckCircle2 size={15} className="shrink-0 text-emerald-500"/>}
                  </label>;
                })}{!list.length&&<p className={'text-xs '+muted}>自分用の学習メモはまだありません。</p>}</div>
                <form onSubmit={e=>{e.preventDefault();void addRange(subject.id);}} className="mt-3 flex flex-col gap-2 sm:flex-row"><input className={input} value={rangeTarget===subject.id?rangeInput:''} onFocus={()=>setRangeTarget(subject.id)} onChange={e=>{setRangeTarget(subject.id);setRangeInput(e.target.value)}} placeholder="例：自分で追加する復習項目" maxLength={160}/><button className={secondary} disabled={saving||!rangeInput.trim()||rangeTarget!==subject.id}><Plus size={14}/>メモを追加</button></form>
              </div>
            </section>;
          })}
        </div>}
      </section>
    </div>}

    {tab === 'mini-tests' && <div className="space-y-4">
      <section className={panel}>
        <div className="mb-2 flex items-center gap-2"><CalendarDays size={18} className="text-cyan-600"/><h2 className="font-black">小テスト予定</h2></div>
        <p className={'text-xs leading-5 '+muted}>Adminで公開された小テストの日時・範囲・出題形式を確認できます。</p>
      </section>
      {visibleMiniTests.length ? visibleMiniTests.map(item => <article key={item.id} className={panel}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-cyan-100 px-2.5 py-1 text-[10px] font-black text-cyan-900">{item.subject}</span>
          <span className={'rounded-lg px-2.5 py-1 text-[10px] font-bold '+(dark?'bg-slate-700 text-slate-200':'bg-slate-100 text-slate-700')}>{item.target_class==='all'?'全生徒':item.target_class}</span>
        </div>
        <h3 data-user-content className="mt-2 text-base font-black">{item.title}</h3>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-cyan-700">
          <span>{dateLabel(item.test_date)}</span>
          {item.period ? <span>{item.period}限</span> : null}
          <span data-user-content>{item.start_note || '開始時刻は授業内で案内'}</span>
          {item.duration_minutes ? <span>{item.duration_minutes}分間</span> : null}
        </p>
        {item.scope && <div className={'mt-3 rounded-xl p-3 '+(dark?'bg-slate-900':'bg-slate-50')}><p className={'mb-1 text-[10px] font-black '+muted}>試験範囲</p><p data-user-content className="whitespace-pre-wrap text-sm leading-6">{item.scope}</p></div>}
        {item.notes && <div className="mt-3"><p className={'mb-1 text-[10px] font-black '+muted}>出題内容・形式</p><p data-user-content className="whitespace-pre-wrap text-sm leading-6">{item.notes}</p></div>}
        {(item.question_count || item.full_score) && <p className={'mt-3 border-t pt-3 text-xs font-bold '+(dark?'border-slate-700 text-slate-300':'border-slate-200 text-slate-600')}>{item.question_count ? item.question_count+'問' : '問題数未定'} ・ {item.full_score ? item.full_score+'点満点' : '配点未定'}</p>}
      </article>) : <p className={'rounded-xl border border-dashed p-4 text-sm '+muted}>現在、所属クラスが対象の小テスト予定はありません。</p>}
    </div>}

    {tab === 'assignments' && <div className="space-y-3">
      <section className={panel}><h2 className="font-black">課題一覧</h2><p className={'mt-1 text-xs '+muted}>学校からの課題と、自分だけに表示される個人課題をまとめて管理できます。</p></section>
      <section className={panel}>
        <div className="mb-3"><h3 className="font-black">自分用の課題を作成</h3><p className={'mt-1 text-[10px] '+muted}>ここで作成した課題は自分のアカウントだけに保存・表示されます。</p></div>
        <form onSubmit={addPersonalTask} className="space-y-3">
          <label className="block space-y-1 text-xs font-bold">課題名<input className={input} value={personalTaskTitle} onChange={e=>setPersonalTaskTitle(e.target.value)} maxLength={200} placeholder="例：数学の問題集 P30〜35" required/></label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block space-y-1 text-xs font-bold">教科<select className={input} value={personalTaskSubject} onChange={e=>setPersonalTaskSubject(displaySubjectName(e.target.value))}><option value="その他">その他</option>{SUBJECTS.map(subject=><option key={subject} value={subject}>{displaySubjectName(subject)}</option>)}</select></label>
            <label className="block space-y-1 text-xs font-bold">課題の種類<select className={input} value={personalTaskType} onChange={e=>setPersonalTaskType(e.target.value as 'paper'|'classroom'|'other')}><option value="paper">紙プリント・ノート</option><option value="classroom">Classroom</option><option value="other">その他・授業内指示</option></select></label>
            <label className="block space-y-1 text-xs font-bold sm:col-span-2">提出期限（任意）<input className={input} type="datetime-local" value={personalTaskDueAt} onChange={e=>setPersonalTaskDueAt(e.target.value)}/></label>
          </div>
          <label className="block space-y-1 text-xs font-bold">詳細・メモ<textarea className={input} rows={2} value={personalTaskDetails} onChange={e=>setPersonalTaskDetails(e.target.value)} maxLength={5000} placeholder="課題の内容や提出先など"/></label>
          <div className="flex justify-end"><button type="submit" className={primary} disabled={saving||!personalTaskTitle.trim()}><Plus size={15}/>課題を追加</button></div>
        </form>
        <div className="mt-4 space-y-2">
          {personalTasks.length ? personalTasks.map(item=>{
            const due=deadlineStatus(item.due_at);
            const dueClass=due.tone==='overdue'?'bg-rose-100 text-rose-800':due.tone==='today'?'bg-amber-100 text-amber-900':due.tone==='future'?'bg-blue-100 text-blue-900':'bg-slate-100 text-slate-600';
            return <article key={item.id} className={'rounded-xl border p-3 '+(dark?'border-slate-700 bg-slate-900':'border-slate-200 bg-slate-50')}>
              <div className="flex items-start gap-3">
                <input type="checkbox" aria-label={item.title+'を完了にする'} className="mt-1 h-4 w-4 shrink-0 accent-cyan-700" checked={item.completed} onChange={e=>void updatePersonalTask(item.id,{completed:e.target.checked})}/>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-cyan-100 px-2 py-1 text-[10px] font-black text-cyan-900">{item.subject||'その他'}</span><span className={'rounded-md px-2 py-1 text-[10px] font-bold '+dueClass}>{item.completed?'完了':due.label}</span></div>
                  <h4 className={'mt-2 text-sm font-black '+(item.completed?'line-through opacity-60':'')}>{item.title}</h4>
                  {item.details&&<p className={'mt-1 whitespace-pre-wrap text-xs leading-5 '+muted}>{item.details}</p>}
                  <p className={'mt-2 text-[10px] '+muted}>{item.source} ・ {item.due_at?new Date(item.due_at).toLocaleString('ja-JP'):'期限未設定'}</p>
                </div>
                <button type="button" onClick={()=>void deletePersonalTask(item.id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label={item.title+'を削除'}><Trash2 size={15}/></button>
              </div>
            </article>;
          }) : <p className={'rounded-lg border border-dashed p-3 text-xs '+muted}>自分用の課題はまだありません。上のフォームから追加できます。</p>}
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="px-1 text-sm font-black">学校・先生からの課題</h3>
        {assignments.length ? assignments.map(assignment=>{
          const due=deadlineStatus(assignment.due_at);
          const target=targetLabel(assignment);
          const dueClass=due.tone==='overdue'?'bg-rose-100 text-rose-800':due.tone==='today'?'bg-amber-100 text-amber-900':due.tone==='future'?'bg-blue-100 text-blue-900':'bg-slate-100 text-slate-600';
          return <article key={assignment.id} className={panel}>
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-cyan-100 px-2.5 py-1 text-[10px] font-black text-cyan-900">{assignment.subject||'その他'}</span><span className={'rounded-lg px-2.5 py-1 text-[10px] font-bold '+(assignment.target_class==='science'?'bg-violet-100 text-violet-800':'bg-slate-100 text-slate-700')}>{target}</span></div>
            <h3 className="mt-2 text-base font-black">{assignment.title}</h3>
            <p className={'mt-2 whitespace-pre-wrap text-sm leading-6 '+muted}>{assignment.details||'課題の詳細はありません。'}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-3">
              <p className={'text-xs font-bold '+muted}>{assignment.due_at ? new Date(assignment.due_at).toLocaleString('ja-JP') : '提出期限未設定'}</p>
              <span className={'rounded-full px-3 py-1 text-[11px] font-black '+dueClass}>{due.label}</span>
            </div>
          </article>;
        }) : <p className={'rounded-xl border border-dashed p-4 text-sm '+muted}>現在公開中の学校課題はありません。</p>}
      </section>
    </div>}

    {tab === 'focus' && <div className="space-y-4">
      <section className={panel}>
        <div className="mb-3 flex items-center gap-2"><Timer size={19} className="text-cyan-600"/><h2 className="font-black">タイマー設定</h2></div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={timerState!=='idle'||showRecord} onClick={()=>{setTimerMode('pomodoro');setPhase('focus');setTimerRemaining(focusMinutes*60);setPhaseStartedAt(null);setPhaseEndsAt(null);}} className={'rounded-xl border px-3 py-3 text-sm font-black disabled:opacity-50 '+(timerMode==='pomodoro'?'border-cyan-500 bg-cyan-50 text-cyan-900':dark?'border-slate-600 bg-slate-900':'border-slate-200 bg-white')}>ポモドーロ</button>
          <button type="button" disabled={timerState!=='idle'||showRecord} onClick={()=>{setTimerMode('countup');setPhase('focus');setTimerRemaining(0);setPhaseStartedAt(null);setPhaseEndsAt(null);}} className={'rounded-xl border px-3 py-3 text-sm font-black disabled:opacity-50 '+(timerMode==='countup'?'border-cyan-500 bg-cyan-50 text-cyan-900':dark?'border-slate-600 bg-slate-900':'border-slate-200 bg-white')}>カウントアップ</button>
        </div>
        {timerMode==='pomodoro' ? <>
          <p className={'mb-3 mt-3 text-xs leading-5 '+muted}>集中終了・休憩終了時は、添付曲「鯖の味噌煮と牛乳」を再生します。画面ロック中のWeb PushはOS既定の通知音になります。</p>
          <div className="grid grid-cols-3 gap-2">{[{f:25,b:5,label:'25 + 5'},{f:50,b:10,label:'50 + 10'},{f:45,b:15,label:'45 + 15'}].map(p=> <button key={p.label} type="button" onClick={()=>setPreset(p.f,p.b)} disabled={timerState!=='idle'} className={'rounded-xl border p-3 text-center disabled:opacity-50 '+(focusMinutes===p.f&&breakMinutes===p.b?'border-cyan-500 bg-cyan-50 text-cyan-900':dark?'border-slate-600 bg-slate-900':'border-slate-200 bg-white')}><b className="block text-sm">{p.label}</b><span className="text-[10px]">分</span></button>)}</div>
          <div className="mt-3 grid grid-cols-2 gap-2"><label className="space-y-1 text-xs font-bold">集中時間（分）<input className={input} type="number" min="1" max="180" value={customFocus} disabled={timerState!=='idle'} onChange={e=>{setCustomFocus(e.target.value);const v=Math.min(180,Math.max(1,Number(e.target.value)||1));setFocusMinutes(v);if(timerState==='idle'&&phase==='focus')setTimerRemaining(v*60)}}/></label><label className="space-y-1 text-xs font-bold">休憩時間（分）<input className={input} type="number" min="0" max="60" step="1" value={customBreak} disabled={timerState!=='idle'} onChange={e=>{setCustomBreak(e.target.value);setBreakMinutes(Math.min(60,Math.max(0,Number(e.target.value)||0)))}}/></label></div>
        </> : <p className={'mt-3 text-xs leading-5 '+muted}>開始してからの経過時間を数え続けます。終了時刻は設定せず、停止・一時停止するまでカウントします。通知の予約は行いません。</p>}
      </section>
      <section className={panel}><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-black tracking-widest text-cyan-600">{timerMode==='countup'?'STOPWATCH':'FOCUS SESSION'}</p><h2 className="mt-1 text-lg font-black">今日の自習</h2></div><span className={'rounded-full px-3 py-1.5 text-[10px] font-black '+(timerMode==='countup'?'bg-violet-100 text-violet-900':phase==='focus'?'bg-cyan-100 text-cyan-900':'bg-amber-100 text-amber-900')}>{timerMode==='countup'?'カウントアップ':phase==='focus'?'集中時間':'休憩時間'}</span></div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px]">
          <div className="flex min-w-0 flex-col gap-1">
            {timerSyncStatus && <span className={timerSyncStatus.includes('失敗') ? 'text-amber-600' : 'text-emerald-600'}>{timerSyncStatus}</span>}
            {timerMode==='pomodoro' && <span className={timerPushStatus.includes('予約しました') ? 'text-emerald-600' : muted}>{timerPushStatus || 'ロック中の通知には、この端末のWeb Push登録が必要です。'}</span>}
            {timerSongStatus && <span className={muted}>{timerSongStatus}</span>}
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={playTimerSong} className={secondary}>通知音をテスト</button>
            {timerSongStatus.includes('再生しています') && <button type="button" onClick={stopTimerSong} className={secondary}>曲を停止</button>}
          </div>
        </div>
        <div className="mb-5 flex flex-col items-center rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-4 py-7 text-white"><p className="text-[10px] font-bold tracking-[.2em] text-cyan-200">{timerMode==='countup'?'COUNT UP':phase==='focus'?'FOCUS':'BREAK'}</p><p className="my-2 font-mono text-6xl font-black tabular-nums sm:text-7xl">{timeText}</p><p className="text-xs text-white/70">勉強 {duration(focusSeconds)} ・ 休憩 {duration(breakSeconds)}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">{timerState==='idle'&&!showRecord&&<button type="button" onClick={begin} className="rounded-xl bg-cyan-500 px-6 py-3 text-sm font-black text-white"><Timer className="mr-2 inline" size={16}/>開始</button>}{timerState==='running'&&<button type="button" onClick={pauseTimer} className="rounded-xl bg-white/15 px-5 py-3 text-sm font-black">一時停止</button>}{timerState==='paused'&&<><button type="button" onClick={resumeTimer} className="rounded-xl bg-cyan-500 px-5 py-3 text-sm font-black">再開</button>{focusSeconds>0?<button type="button" onClick={()=>finish('completed')} className="rounded-xl bg-white/15 px-5 py-3 text-sm font-black">終了して記録</button>:<button type="button" onClick={discardPausedContinuation} className="rounded-xl bg-white/15 px-5 py-3 text-sm font-black">この勉強を終了</button>}</>}{timerState==='running'&&<button type="button" onClick={()=>finish(timerMode==='countup'?'completed':'stopped')} className="rounded-xl bg-rose-500 px-5 py-3 text-sm font-black">{timerMode==='countup'?'終了して記録':'中断して記録'}</button>}</div>
          {timerMode==='pomodoro'&&timerState==='running'&&<button type="button" onClick={switchTimerPhase} className="mt-3 text-[11px] font-bold text-cyan-100 underline">{phase==='focus'?'休憩に切り替える':'集中に戻る'}</button>}{timerState==='paused'&&<p className="mt-3 text-[11px] text-amber-200">{task && focusSeconds===0 ? '中断した勉強を保存済みです。残り時間から再開できます。' : '一時停止中'}</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs font-bold">教科<select className={input} value={focusSubject} onChange={e=>{const value=e.target.value as Subject;setFocusSubject(value);if(activeFocusSubject?.subject!==value)setFocusSubjectId('');setRangeId('')}} disabled={timerState==='running'}>{SUBJECTS.map(s=><option key={s} value={s}>{displaySubjectName(s)}</option>)}</select></label><label className="space-y-1 text-xs font-bold">考査・教科<select className={input} value={focusSubjectId} onChange={e=>{setFocusSubjectId(e.target.value);setRangeId('');const found=subjects.find(s=>s.id===e.target.value);if(found)setFocusSubject(displaySubjectName(found.subject) as Subject)}} disabled={timerState==='running'}><option value="">指定しない</option>{subjects.map(s=><option key={s.id} value={s.id}>{exams.find(exam=>exam.id===s.exam_id)?.exam_type||'考査'} ・ {displaySubjectName(s.subject)}</option>)}</select></label><label className="space-y-1 text-xs font-bold sm:col-span-2">マイブックから勉強内容を追加<select className={input} value={bookStudySelection} onChange={e=>{const id=e.target.value;setBookStudySelection(id);const book=myBooks.find(item=>item.id===id);if(book)setTask('本：'+book.title+(book.authors.length?'（'+book.authors.join('・')+'）':''))}} disabled={timerState==='running'}><option value="">登録済みの本を選択</option>{myBooks.map(book=><option key={book.id} value={book.id}>{book.title}</option>)}</select></label><label className="space-y-1 text-xs font-bold sm:col-span-2">使用するノート（任意）<select className={input} value={focusNotebookId} onChange={e=>setFocusNotebookId(e.target.value)} disabled={timerState==='running'}><option value="">ノートを指定しない</option>{availableNotebooks.map(notebook=><option key={notebook.id} value={notebook.id}>{notebook.name} ・ {notebook.subjects.join('／')} ・ 残り{Math.max(0,notebook.total_pages-notebook.used_pages)}ページ</option>)}</select><span className={'block text-[10px] font-normal '+muted}>タイマーの状態と一緒に保存され、終了後の学習記録に紐づきます。</span></label>
          <label className="space-y-1 text-xs font-bold sm:col-span-2">課題・勉強内容<input className={input} value={task} onChange={e=>setTask(e.target.value)} placeholder="例：物理 波動の問題集を解く" maxLength={180} disabled={timerState==='running'} required/></label><label className="space-y-1 text-xs font-bold sm:col-span-2">テスト範囲（任意）<input className={input} list="student-study-range-suggestions" value={focusRanges.find(item=>item.id===rangeId)?.title || rangeId} onChange={e=>{const value=e.target.value;const matched=focusRanges.find(item=>item.title===value);setRangeId(matched?.id || value)}} placeholder="例：教科書 p.120〜145、問題集 3章" maxLength={160} disabled={timerState==='running'}/><datalist id="student-study-range-suggestions">{focusRanges.map(item=><option key={item.id} value={item.title}/>)}</datalist><span className={'block text-[10px] font-normal '+muted}>考査・教科を選ぶと登録済みの範囲が候補に表示されます。候補がなくても自由入力できます。</span></label></div>
      </section>
      <section className={panel}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="flex items-center gap-2 font-black"><BookOpenCheck size={18} className="text-cyan-600"/>マイブック</h2><p className={'mt-1 text-[11px] '+muted}>本の裏面のISBNバーコードを読み取り、個人の本棚に登録します。</p></div>
          <button type="button" onClick={()=>void startBookScanner()} className={primary}><QrCode size={15}/>カメラで読み取る</button>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="space-y-1 text-xs font-bold">ISBN（手入力も可能）<input className={input} value={bookIsbnInput} onChange={e=>setBookIsbnInput(e.target.value)} placeholder="978XXXXXXXXXX / ISBN-10" inputMode="numeric" maxLength={20}/></label>
          <button type="button" onClick={()=>void lookupBookIsbn(bookIsbnInput)} disabled={bookLookupLoading||!bookIsbnInput.trim()} className={secondary+' self-end'}>{bookLookupLoading?'検索中…':'ISBNを検索'}</button>
        </div>
        {bookScannerOpen&&<div className={'mt-3 rounded-2xl border p-3 '+(dark?'border-slate-600 bg-slate-900':'border-slate-200 bg-slate-50')}>
          <div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-black">バーコードを枠内に合わせてください</p><button type="button" onClick={()=>void stopBookScanner()} className={secondary}>読み取り終了</button></div>
          <div id={bookScannerElementId} className="mx-auto min-h-32 w-full max-w-md overflow-hidden rounded-xl bg-black"/>
          <p className={'mt-2 text-[10px] leading-5 '+muted}>本にはバーコードが2つ付いている場合があります。978 / 979のISBNを読み取ってください。192の補助コードにも対応しています。カメラ枠はバーコード全体が入るように調整してください。</p>
        </div>}
        {bookLookupMessage&&<p role="status" className={'mt-3 rounded-xl border px-3 py-2 text-xs leading-5 '+(dark?'border-slate-700 bg-slate-900 text-slate-200':'border-slate-200 bg-slate-50 text-slate-700')}>{bookLookupMessage}</p>}
        {bookPreview&&<article className={'mt-3 flex flex-wrap gap-3 rounded-xl border p-3 '+(dark?'border-slate-600 bg-slate-900':'border-slate-200 bg-slate-50')}>
          <BookCover src={bookPreview.thumbnail_url} alt={bookPreview.title + 'の表紙'} isbn={bookPreview.isbn13} candidates={bookPreview.cover_urls || []} className="h-36 w-24"/>
          <div className="min-w-0 flex-1"><p className="text-sm font-black">{bookPreview.title}</p>{bookPreview.authors.length>0&&<p className={'mt-1 text-xs '+muted}>{bookPreview.authors.join('・')}</p>}<p className={'mt-1 text-[10px] '+muted}>{bookPreview.publisher||'出版社不明'} ・ ISBN {bookPreview.isbn13}</p><p className={'mt-2 line-clamp-3 text-xs leading-5 '+muted}>{bookPreview.description||'説明情報はありません。'}</p></div>
          {bookPreview.source === 'manual' && <div className="grid basis-full gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-bold">本のタイトル（必須）
              <input className={input} value={manualBookTitle} onChange={event => setManualBookTitle(event.target.value)} maxLength={500} placeholder="参考書名・版・科目など"/>
            </label>
            <label className="space-y-1 text-xs font-bold">著者（任意）
              <input className={input} value={manualBookAuthor} onChange={event => setManualBookAuthor(event.target.value)} maxLength={200} placeholder="著者名"/>
            </label>
          </div>}
          <div className="grid basis-full gap-2">
            <label className="space-y-1 text-xs font-bold">
              表紙画像のURL（ここに貼り付け）
              <input
                className={input}
                type="url"
                inputMode="url"
                autoComplete="url"
                value={bookCoverUrlDraft}
                onChange={event => {
                  const value = event.target.value;
                  setBookCoverUrlDraft(value);
                  const normalized = normalizeBookCoverUrl(value);
                  if (normalized) {
                    setBookPreview(current => current ? {
                      ...current,
                      thumbnail_url: normalized,
                      cover_urls: buildBookCoverCandidates(current.isbn13, [normalized, ...(current.cover_urls || [])]),
                    } : current);
                  }
                }}
                placeholder="https://example.com/book-cover.jpg"
                maxLength={2048}
              />
            </label>
            <p className={'text-[10px] leading-5 ' + muted}>書店・出版社などの表紙画像URLを貼り付けてください。プレビューに反映されたら、そのまま登録できます。画像ファイルはアップロードせず、URLだけを保存します。</p>
          </div>
          <CoverCandidateStrip
            candidates={buildBookCoverCandidates(bookPreview.isbn13, [bookPreview.thumbnail_url, ...(bookPreview.cover_urls || [])])}
            selectedUrl={bookPreview.thumbnail_url}
            dark={dark}
            onSelect={url => {
              setBookCoverUrlDraft(url);
              setBookPreview(current => current ? { ...current, thumbnail_url: url } : current);
            }}
          />
          {myBooks.some(item=>item.isbn13===bookPreview.isbn13)
            ? <button type="button" disabled={bookSaving||!bookPreview.thumbnail_url} onClick={()=>{const existing=myBooks.find(item=>item.isbn13===bookPreview.isbn13);if(existing)void updateSavedBookCover(existing,bookPreview.thumbnail_url!,bookPreview.cover_urls||[])}} className={primary+' self-end'}>選択した表紙を登録済みの本に反映</button>
            : <button type="button" disabled={bookSaving || (bookPreview.source === 'manual' && !manualBookTitle.trim())} onClick={()=>void saveMyBook(bookPreview.source === 'manual' ? { ...bookPreview, title: manualBookTitle.trim(), authors: manualBookAuthor.trim() ? [manualBookAuthor.trim()] : [] } : bookPreview)} className={primary+' self-end'}>{bookSaving?'登録中…':bookPreview.source === 'manual' ? '入力した書名でマイブックに登録' : 'マイブックに登録'}</button>}
        </article>}
        {bookManualEntry&&!bookPreview&&<div className={'mt-3 grid gap-2 rounded-xl border p-3 sm:grid-cols-2 '+(dark?'border-slate-600 bg-slate-900':'border-slate-200 bg-slate-50')}>
          <p className="text-xs font-black sm:col-span-2">書誌情報が見つからない本は、タイトルを手入力してISBN付きで登録できます。</p>
          <label className="space-y-1 text-xs font-bold">本のタイトル<input className={input} value={manualBookTitle} onChange={e=>setManualBookTitle(e.target.value)} maxLength={500}/></label>
          <label className="space-y-1 text-xs font-bold">著者（任意）<input className={input} value={manualBookAuthor} onChange={e=>setManualBookAuthor(e.target.value)} maxLength={200}/></label>
          <button type="button" disabled={bookSaving||!manualBookTitle.trim()} onClick={()=>{const isbn=normalizeIsbn13(bookIsbnInput);if(!isbn){setBookLookupMessage('有効なISBNを入力してください。');return;}void saveMyBook({isbn13:isbn,title:manualBookTitle.trim(),authors:manualBookAuthor.trim()?[manualBookAuthor.trim()]:[],publisher:null,published_date:null,description:null,thumbnail_url:null,info_url:null,page_count:null,source:'manual'});}} className={primary+' sm:col-span-2'}>{bookSaving?'登録中…':'手入力で登録'}</button>
        </div>}
        <div className="mt-4 flex items-center justify-between gap-2"><h3 className="text-xs font-black">登録済みの本</h3><span className={'text-[10px] '+muted}>{myBooksLoading?'読み込み中…':myBooks.length+'冊'}</span></div>
        {myBooks.length===0&&!myBooksLoading?<p className={'mt-2 rounded-xl border border-dashed p-4 text-center text-xs '+muted}>まだ本は登録されていません。</p>:<div className="mt-2 grid gap-2 sm:grid-cols-2">{myBooks.map(book=><article key={book.id} className={'flex min-w-0 flex-wrap items-center gap-3 rounded-xl border p-2.5 '+(dark?'border-slate-700 bg-slate-900':'border-slate-200 bg-slate-50')}>
          <BookCover src={book.thumbnail_url} alt={book.title + 'の表紙'} isbn={book.isbn13} candidates={book.cover_urls || []} className="h-28 w-20"/>
          <div className="min-w-0 flex-1"><p className="line-clamp-2 text-xs font-black">{book.title}</p><p className={'mt-1 truncate text-[10px] '+muted}>{book.authors.join('・')||'著者情報なし'} ・ {book.isbn13}</p></div>
          <button type="button" onClick={()=>void deleteMyBook(book)} aria-label={book.title+'を削除'} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15}/></button>
          {book.cover_urls?.length ? <CoverCandidateStrip candidates={buildBookCoverCandidates(book.isbn13, [book.thumbnail_url, ...book.cover_urls])} selectedUrl={book.thumbnail_url} dark={dark} onSelect={url => void updateSavedBookCover(book, url, book.cover_urls || [])}/> : null}
        </article>)}</div>}
      </section>
      {showRecord&&<section className={panel}><div className="mb-3 flex items-center justify-between"><h2 className="font-black">勉強内容を記録</h2><button type="button" onClick={()=>{setShowRecord(false);setTimerState("paused")}} aria-label="閉じる"><X size={18}/></button></div><p className={'mb-3 text-xs '+muted}>集中 {duration(focusSeconds)} ・ 休憩 {duration(breakSeconds)}</p><form onSubmit={saveSession} className="space-y-3"><label className="block space-y-1 text-xs font-bold">勉強した内容<textarea className={input} value={reflection} onChange={e=>setReflection(e.target.value)} rows={3} placeholder="どこまで進んだか、何を理解できたか…" maxLength={2000} required/></label><label className="block space-y-1 text-xs font-bold">次にやること<textarea className={input} value={nextAction} onChange={e=>setNextAction(e.target.value)} rows={2} placeholder="次回は何から始めるか…" maxLength={1000} required/></label><div className="flex justify-end gap-2"><button type="button" onClick={()=>{setShowRecord(false);setTimerState('paused')}} className={secondary}>戻る</button><button className={primary} disabled={saving||focusSeconds<1}><CheckCircle2 size={15}/>記録を保存</button></div></form></section>}
    </div>}

    {tab === 'history' && <div className="space-y-4">
      {editingSession && <section className={panel}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-black tracking-widest text-cyan-600">EDIT STUDY LOG</p><h2 className="mt-1 text-base font-black">学習記録を編集</h2><p className={'mt-1 text-[10px] ' + muted}>{editingSession.subject_name} ・ {editingSession.task_title || '学習'}</p></div>
          <button type="button" onClick={closeSessionEditor} disabled={editSaving} aria-label="編集を閉じる" className={secondary}><X size={15}/></button>
        </div>
        <form onSubmit={saveSessionEdits} className="space-y-3">
          <label className="block space-y-1 text-xs font-bold">教科
            <select className={input} value={editSubjectName} onChange={event=>setEditSubjectName(event.target.value as Subject)} required>{SUBJECTS.map(subject=><option key={subject} value={subject}>{subject}</option>)}</select>
          </label>
          <label className="block space-y-1 text-xs font-bold">勉強内容・課題名
            <input className={input} value={editTaskTitle} onChange={event=>setEditTaskTitle(event.target.value)} maxLength={180} placeholder="例：数III 微分法の演習" />
          </label>
          <label className="block space-y-1 text-xs font-bold">テスト範囲（任意）
            <input className={input} value={editTestRangeTitle} onChange={event=>setEditTestRangeTitle(event.target.value)} maxLength={160} placeholder="例：教科書 p.120〜145" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-xs font-bold">使用した本
              <select className={input} value={editBookId} onChange={event=>setEditBookId(event.target.value)}><option value="">本を紐づけない</option>{myBooks.map(book=><option key={book.id} value={book.id}>{book.title}</option>)}</select>
            </label>
            <label className="block space-y-1 text-xs font-bold">使用したノート
              <select className={input} value={editNotebookId} onChange={event=>setEditNotebookId(event.target.value)}><option value="">ノートを紐づけない</option>{availableNotebooks.map(notebook=><option key={notebook.id} value={notebook.id}>{notebook.name} ・ {notebook.subjects.join('／')}</option>)}</select>
            </label>
          </div>
          <label className="block space-y-1 text-xs font-bold">勉強した内容・振り返り
            <textarea className={input} value={editReflection} onChange={event=>setEditReflection(event.target.value)} rows={3} maxLength={2000} placeholder="どこまで進んだか、何を理解できたか…" />
          </label>
          <label className="block space-y-1 text-xs font-bold">次にやること
            <textarea className={input} value={editNextAction} onChange={event=>setEditNextAction(event.target.value)} rows={2} maxLength={1000} placeholder="次回は何から始めるか…" />
          </label>
          <label className="block space-y-1 text-xs font-bold">開始日時
            <input className={input} type="datetime-local" value={editStartedAt} onChange={event => setEditStartedAt(event.target.value)} required/>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-xs font-bold">集中時間（時:分:秒）
              <input className={input + ' font-mono tabular-nums'} type="text" inputMode="numeric" pattern="[0-9]{1,2}:[0-5][0-9]:[0-5][0-9]" maxLength={8} value={editFocusDuration} onChange={event => setEditFocusDuration(event.target.value)} placeholder="00:25:00" required/>
            </label>
            <label className="block space-y-1 text-xs font-bold">休憩時間（時:分:秒）
              <input className={input + ' font-mono tabular-nums'} type="text" inputMode="numeric" pattern="[0-9]{1,2}:[0-5][0-9]:[0-5][0-9]" maxLength={8} value={editBreakDuration} onChange={event => setEditBreakDuration(event.target.value)} placeholder="00:05:00" required/>
            </label>
          </div>
          <div className={'rounded-xl border p-3 text-[10px] leading-5 ' + (dark ? 'border-slate-700 bg-slate-900 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600')}>
            秒単位で編集できます。開始日時を変更すると、その記録の日付・曜日・時間帯の分析先も変更されます。学習時間の集計は更新されますが、過去に付与された学習XPは再計算されません。
          </div>
          {editError && <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-600">{editError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeSessionEditor} disabled={editSaving} className={secondary}>キャンセル</button>
            <button type="submit" disabled={editSaving} className={primary}><CheckCircle2 size={15}/>{editSaving ? '保存中…' : '変更を保存'}</button>
          </div>
        </form>
      </section>}
      <section className={panel}><div className="mb-3 flex items-center gap-2"><CalendarDays size={18} className="text-cyan-600"/><h2 className="font-black">日・週ごとの学習時間</h2></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-cyan-50 p-3 text-cyan-950"><p className="text-[10px] font-bold">今日</p><p className="mt-1 text-xl font-black">{duration(todaySeconds)}</p></div><div className="rounded-xl bg-blue-50 p-3 text-blue-950"><p className="text-[10px] font-bold">今週（月〜日）</p><p className="mt-1 text-xl font-black">{duration(weekSeconds)}</p></div></div><div className="mt-4 grid grid-cols-7 items-end gap-2">{weekData.map(day=><div key={day.key} className="flex flex-col items-center gap-1"><div className={'flex h-20 w-full items-end overflow-hidden rounded-md '+(dark?'bg-slate-900':'bg-slate-100')}><div className="w-full rounded-md bg-cyan-600" style={{height:Math.max(day.seconds?5:0,day.seconds/maxDay*100)+'%'}}/></div><span className={'text-[10px] '+muted}>{day.label}</span></div>)}</div></section>
      <section className={panel}><h2 className="mb-3 font-black">教科別の累計（直近120日）</h2>{subjectTotals.length?<div className="space-y-3">{subjectTotals.map(([name,seconds])=><div key={name}><div className="mb-1 flex justify-between text-xs"><b>{name}</b><span className={muted}>{duration(seconds)}</span></div><div className={'h-2 rounded-full '+(dark?'bg-slate-700':'bg-slate-100')}><div className="h-full rounded-full bg-cyan-600" style={{width:Math.max(2,seconds/Math.max(...subjectTotals.map(item=>item[1]))*100)+'%'}}/></div></div>)}</div>:<p className={'text-sm '+muted}>まだ記録がありません。</p>}</section>
      <section className={panel}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-black">最近の学習記録</h2><p className={'mt-1 text-[10px] ' + muted}>勉強内容・時間・本・ノートを後から編集できます。</p></div><span className={'text-[10px] ' + muted}>{sessions.length.toLocaleString('ja-JP')}件</span></div>
        <div className="space-y-2">
          {sessions.slice(0, historyLimit).map(item=><article key={item.id} className={'rounded-xl p-3 '+(dark?'bg-slate-900':'bg-slate-50')}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><b className="text-sm">{item.subject_name} ・ {item.task_title || '学習'}</b><p className={'mt-1 text-[10px] ' + muted}>{new Date(item.started_at).toLocaleString('ja-JP',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} ・ {item.finish_kind==='stopped'?'途中終了':'完了'}</p></div>
              <div className="flex shrink-0 flex-col items-end gap-2"><b className="text-xs text-cyan-600">集中 {duration(item.focus_seconds)}</b><span className={'text-[10px] ' + muted}>休憩 {duration(item.break_seconds || 0)}</span><button type="button" onClick={()=>openSessionEditor(item)} className={secondary}><Pencil size={13}/>内容を編集</button></div>
            </div>
            {item.test_range_title && <p className={'mt-2 text-[10px] font-semibold '+muted}>テスト範囲：{item.test_range_title}</p>}
            {(item.book_id || item.notebook_id) && <div className="mt-2 flex flex-wrap gap-2">{item.book_id && <span className="rounded-lg bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-700">本：{myBooks.find(book=>book.id===item.book_id)?.title || '登録済みの本'}</span>}{item.notebook_id && <span className="rounded-lg bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-700">ノート：{availableNotebooks.find(notebook=>notebook.id===item.notebook_id)?.name || '登録済みのノート'}</span>}</div>}
            {item.reflection && <p className="mt-2 whitespace-pre-wrap text-xs leading-5">{item.reflection}</p>}
            {item.next_action && <p className={'mt-2 whitespace-pre-wrap text-xs ' + muted}>次：{item.next_action}</p>}
          </article>)}
          {!sessions.length&&<p className={'rounded-xl border border-dashed p-4 text-sm '+muted}>学習記録はまだありません。</p>}
          {sessions.length > historyLimit && <button type="button" onClick={() => setHistoryLimit(current => current + 20)} className={secondary + ' w-full'}>さらに{Math.min(20, sessions.length - historyLimit)}件表示</button>}
        </div>
      </section>
    </div>}
    {tab === 'analysis' && <StudentLearningAnalytics sessions={sessions} isDarkMode={dark} />}
    {tab === 'contribution' && <ContributionActivityPanel userId={userId} isDarkMode={isDarkMode} />}
  </div>;
}

export function DigitalStudentCard({ studentName, studentId, userClass, onOpen, isDarkMode = false }: {
  studentName: string; studentId: string; userClass: string; onOpen: () => void; isDarkMode?: boolean;
}) {
  return <div className="mx-auto w-full max-w-xl space-y-4">
    <header><p className="text-[10px] font-black tracking-[.22em] text-cyan-600">CAMPUSSYNC ID</p><h1 className={'mt-1 text-2xl font-black '+(isDarkMode?'text-white':'text-slate-900')}>デジタル生徒証</h1><p className={'mt-1 text-xs '+(isDarkMode?'text-slate-400':'text-slate-500')}>登録済みのプロフィールを表示します。</p></header>
    <section className="relative overflow-hidden rounded-[28px] border border-slate-700 bg-gradient-to-br from-[#0B2144] via-[#123E6E] to-[#07182F] p-5 text-white shadow-xl"><div className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-cyan-400/10 blur-3xl"/><div className="relative flex items-start justify-between gap-3 border-b border-white/15 pb-4"><div><p className="text-xs font-black tracking-[.16em] text-cyan-100">SOKA HIGH SCHOOL</p><p className="mt-1 text-[9px] font-bold tracking-[.2em] text-white/50">CAMPUSSYNC DIGITAL CARD</p></div><GraduationCap size={30} className="text-cyan-100"/></div><div className="relative mt-5 flex gap-4"><div className="flex h-28 w-20 shrink-0 flex-col items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white/65"><UserRound size={28}/><span className="mt-2 text-[9px] font-bold">PHOTO</span></div><div className="min-w-0 flex-1 space-y-3"><div><p className="text-[9px] font-bold text-white/50">氏名</p><p className="mt-1 break-words text-lg font-black">{studentName||'プロフィール未登録'}</p></div><div className="grid grid-cols-2 gap-3"><div><p className="text-[9px] font-bold text-white/50">所属クラス</p><p className="mt-1 text-sm font-black">{userClass||'未登録'}組</p></div><div><p className="text-[9px] font-bold text-white/50">学籍番号</p><p className="mt-1 font-mono text-sm font-black tracking-wider">{studentId||'------'}</p></div></div></div></div><div className="relative mt-5 flex items-center justify-between border-t border-white/15 pt-3"><span className="text-[9px] font-bold tracking-[.18em] text-white/50">DIGITAL STUDENT CARD</span><span className="rounded-full border border-cyan-200/30 bg-cyan-300/10 px-2.5 py-1 text-[9px] font-black text-cyan-100">本人用</span></div></section>
    <section className={'rounded-2xl border p-4 '+(isDarkMode?'border-slate-700 bg-slate-800 text-slate-100':'border-slate-200 bg-white text-slate-900')}><div className="flex items-start gap-3"><QrCode size={20} className="mt-0.5 text-cyan-600"/><div><h2 className="text-sm font-black">別端末ログイン用QR</h2><p className={'mt-1 text-xs leading-5 '+(isDarkMode?'text-slate-400':'text-slate-500')}>既存の一回限りQRを必要なときだけ発行できます。QRを読み取った後、元の端末で本人が承認する仕組みです。</p></div></div><button type="button" onClick={onOpen} className="mt-4 w-full rounded-xl bg-cyan-700 px-4 py-3 text-sm font-black text-white hover:bg-cyan-600">生徒証を表示する</button><p className={'mt-3 text-[10px] leading-5 '+(isDarkMode?'text-slate-500':'text-slate-400')}>CampusSync内のデジタル表示です。学校発行の正式な学生証・身分証明書の代わりにはなりません。</p></section>
  </div>;
}
