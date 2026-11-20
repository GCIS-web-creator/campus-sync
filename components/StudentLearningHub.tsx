'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PlanetubeDashboard from '@/components/PlanetubeDashboard';
import { supabase } from '@/lib/supabase';
import { BookOpenCheck, CalendarDays, CheckCircle2, GraduationCap, History, Plus, QrCode, Timer, TrendingUp, UserRound, X, Globe2, Trash2, Info } from 'lucide-react';

const SUBJECTS = ['国語演習', '古典探求', '古典探究', '物理', '化学', '生物', '数３', '数C', '数学C', '数学Ⅱ', '英コミュⅡ', '保健（30分）', '物理・生物', '論理表現Ⅱ（30分）', '公共', '英コミュ', '論表', '情報', '保健'] as const;
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
type Session = { id: string; subject_name: Subject; task_title: string; test_range_title: string; focus_seconds: number; break_seconds: number; started_at: string; reflection: string; next_action: string; finish_kind: 'completed' | 'stopped' };
type TimerSnapshot = {
  version: 1;
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
  showRecord: boolean;
  reflection: string;
  nextAction: string;
  finishKind: 'completed' | 'stopped';
};
function readTimerSnapshot(userId: string): TimerSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('campus-sync-study-timer:' + userId);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<TimerSnapshot>;
    if (value.version !== 1 || !Number.isFinite(value.savedAt) ||
        (value.phase !== 'focus' && value.phase !== 'break') ||
        !['running', 'paused', 'idle'].includes(String(value.timerState)) ||
        !Number.isFinite(value.remaining) || !Number.isFinite(value.focusSeconds) ||
        !Number.isFinite(value.breakSeconds) || !Number.isFinite(value.focusMinutes) ||
        !Number.isFinite(value.breakMinutes) || !SUBJECTS.includes(value.focusSubject as Subject)) return null;
    return value as TimerSnapshot;
  } catch {
    return null;
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
  if (due.getTime() < now.getTime()) {
    const elapsedDays = Math.floor((now.getTime() - due.getTime()) / 86400000);
    return elapsedDays === 0
      ? { label: '期限超過（本日）', tone: 'overdue' as const }
      : { label: `期限超過・${elapsedDays}日前`, tone: 'overdue' as const };
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const days = Math.round((dueDay - today) / 86400000);
  return days === 0
    ? { label: `本日 ${due.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} まで`, tone: 'today' as const }
    : { label: `あと${days}日`, tone: 'future' as const };
};

export default function StudentLearningHub({ userId, userEmail = '', userClass = '', isDarkMode = false }: { userId: string; userEmail?: string; userClass?: string; isDarkMode?: boolean }) {
  const [tab, setTab] = useState<'overview' | 'tests' | 'mini-tests' | 'assignments' | 'focus' | 'history' | 'planetube'>('overview');
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
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [miniTests, setMiniTests] = useState<MiniTestEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [examId, setExamId] = useState('');
  const [rangeInput, setRangeInput] = useState('');
  const [rangeTarget, setRangeTarget] = useState('');

  const [focusSubject, setFocusSubject] = useState<Subject>('国語演習');
  const [focusSubjectId, setFocusSubjectId] = useState('');
  const [task, setTask] = useState('');
  const [rangeId, setRangeId] = useState('');
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
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
  const startedAt = useRef<string | null>(null);
  const lastTick = useRef(Date.now());
  const remainingRef = useRef(1500);
  const setTimerRemaining = (value: number) => { remainingRef.current = value; setRemaining(value); };

  const studentIdentifier = (userEmail || '').trim().toLowerCase().split('@')[0];
  const dark = isDarkMode;
  const panel = 'rounded-2xl border p-4 ' + (dark ? 'border-slate-700 bg-slate-800 text-slate-100' : 'border-slate-200 bg-white text-slate-900');
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const input = 'w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 ' + (dark ? 'border-slate-600 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900');
  const primary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-black text-white hover:bg-cyan-600 disabled:opacity-50';
  const secondary = 'inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ' + (dark ? 'border-slate-600 bg-slate-900 text-slate-200' : 'border-slate-200 bg-white text-slate-700');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true); setError('');
    try {
      const since = new Date(Date.now() - 120 * 86400000).toISOString();
      const [a, b, c, d, e, f, g, h, i] = await Promise.all([
        supabase.from('school_test_exams').select('*').order('start_date', { ascending: false }),
        supabase.from('school_test_subjects').select('*').order('exam_date').order('sort_order'),
        supabase.from('student_test_ranges').select('*').eq('user_id', userId).order('created_at'),
        supabase.from('student_study_sessions').select('*').eq('user_id', userId).gte('started_at', since).order('started_at', { ascending: false }).limit(250),
        supabase.from('assignments').select('id,title,details,subject,subject_option,target_class,source,due_at,type').eq('is_active', true).order('due_at', { ascending: true, nullsFirst: false }),
        supabase.from('mini_test_events').select('id,subject,title,test_date,scope,notes,period,start_note,duration_minutes,question_count,full_score,target_class').eq('audience', 'school').eq('status', 'published').gte('test_date', dayKey(new Date())).order('test_date').limit(40),
        supabase.from('school_test_ranges').select('id,exam_id,subject,display_subject,audience,range_sections,sort_order').order('sort_order', { ascending: true }),
        supabase.from('student_school_range_progress').select('school_test_range_id,section_id,completed').eq('user_id', userId),
        supabase.from('todos').select('id,title,details,subject,source,type,due,due_at,completed,created_at').eq('student_id', studentIdentifier).order('created_at', { ascending: false }),
      ]);
      const issue = a.error || b.error || c.error || d.error || e.error || f.error || g.error || h.error || i.error;
      if (issue) throw issue;
      const newExams = ((a.data || []) as Exam[]).filter(exam => {
        const targetClasses = Array.isArray(exam.target_classes) ? exam.target_classes : [];
        return targetClasses.length === 0 || targetClasses.includes(userClass);
      });
      const visibleExamIds = new Set(newExams.map(exam => exam.id));
      const newSubjects = ((b.data || []) as ExamSubject[]).filter(subject => visibleExamIds.has(subject.exam_id));
      setExams(newExams); setSubjects(newSubjects); setRanges((c.data || []) as Range[]); setSchoolRanges((g.data || []) as SchoolExamRange[]); setSessions((d.data || []) as Session[]);
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

  // 集中モードを別タブへ移動したり、ページを再読み込みしても同じ端末で復元する。
  useEffect(() => {
    const snapshot = readTimerSnapshot(userId);
    if (!snapshot) {
      setTimerReady(true);
      return;
    }

    setPhase(snapshot.phase);
    setFocusMinutes(snapshot.focusMinutes);
    setBreakMinutes(snapshot.breakMinutes);
    setCustomFocus(String(snapshot.focusMinutes));
    setCustomBreak(String(snapshot.breakMinutes));
    setFocusSubject(snapshot.focusSubject);
    setFocusSubjectId(snapshot.focusSubjectId || '');
    setTask(snapshot.task || '');
    setRangeId(snapshot.rangeId || '');
    setFocusSeconds(snapshot.focusSeconds);
    setBreakSeconds(snapshot.breakSeconds);
    setShowRecord(snapshot.showRecord);
    setReflection(snapshot.reflection || '');
    setNextAction(snapshot.nextAction || '');
    setFinishKind(snapshot.finishKind || 'completed');
    startedAt.current = snapshot.startedAt;

    let restoredPhase = snapshot.phase;
    let restoredRemaining = Math.max(0, Math.floor(snapshot.remaining));
    let restoredFocus = Math.max(0, Math.floor(snapshot.focusSeconds));
    let restoredBreak = Math.max(0, Math.floor(snapshot.breakSeconds));
    let elapsed = snapshot.timerState === 'running'
      ? Math.max(0, Math.floor((Date.now() - snapshot.savedAt) / 1000))
      : 0;
    let phaseChanges = 0;

    // 非表示中の経過も実際の集中・休憩時間に振り分ける。長期間放置時は安全のため一時停止する。
    while (elapsed > 0 && phaseChanges < 10000) {
      if (restoredRemaining <= 0) {
        restoredPhase = restoredPhase === 'focus' ? 'break' : 'focus';
        restoredRemaining = (restoredPhase === 'focus' ? snapshot.focusMinutes : snapshot.breakMinutes) * 60;
        phaseChanges += 1;
      }
      const consumed = Math.min(elapsed, restoredRemaining);
      if (restoredPhase === 'focus') restoredFocus += consumed;
      else restoredBreak += consumed;
      elapsed -= consumed;
      restoredRemaining -= consumed;
    }

    setFocusSeconds(restoredFocus);
    setBreakSeconds(restoredBreak);
    setPhase(restoredPhase);
    setTimerRemaining(restoredRemaining);
    setTimerState(phaseChanges >= 10000 ? 'paused' : snapshot.timerState);
    if (snapshot.timerState === 'running' && Date.now() - snapshot.savedAt > 1000) {
      setMessage('集中モードを前回の状態から復元しました。');
    }
    setTimerReady(true);
  }, [userId]);

  useEffect(() => {
    if (!timerReady) return;
    const key = 'campus-sync-study-timer:' + userId;
    if (timerState === 'idle' && !showRecord) {
      try { window.localStorage.removeItem(key); } catch {}
      return;
    }
    const snapshot: TimerSnapshot = {
      version: 1,
      savedAt: Date.now(),
      phase,
      timerState,
      remaining,
      focusSeconds,
      breakSeconds,
      focusMinutes,
      breakMinutes,
      focusSubject,
      focusSubjectId,
      task,
      rangeId,
      startedAt: startedAt.current,
      showRecord,
      reflection,
      nextAction,
      finishKind,
    };
    try { window.localStorage.setItem(key, JSON.stringify(snapshot)); } catch {}
  }, [timerReady, userId, phase, timerState, remaining, focusSeconds, breakSeconds, focusMinutes, breakMinutes, focusSubject, focusSubjectId, task, rangeId, showRecord, reflection, nextAction, finishKind]);

  useEffect(() => {
    if (timerState !== 'running') return;
    lastTick.current = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      const elapsed = Math.floor((now - lastTick.current) / 1000);
      if (elapsed < 1) return;
      lastTick.current += elapsed * 1000;
      const counted = Math.min(elapsed, Math.max(0, remainingRef.current));
      setTimerRemaining(Math.max(0, remainingRef.current - elapsed));
      if (counted > 0 && phase === 'focus') setFocusSeconds(value => value + counted);
      else if (counted > 0) setBreakSeconds(value => value + counted);
    }, 250);
    return () => window.clearInterval(timer);
  }, [timerState, phase]);

  useEffect(() => {
    if (timerState !== 'running' || remaining > 0) return;
    if (phase === 'focus') {
      setPhase('break'); setTimerRemaining(breakMinutes * 60); setMessage('集中時間が終了しました。休憩に切り替わりました。');
    } else {
      setPhase('focus'); setTimerRemaining(focusMinutes * 60); setMessage('休憩が終了しました。次の集中セットを始められます。');
    }
  }, [timerState, remaining, phase, breakMinutes, focusMinutes]);

  const activeSubjects = subjects.filter(item => item.exam_id === examId);
  const activeFocusSubject = subjects.find(item => item.id === focusSubjectId) || null;
  const focusRanges = ranges.filter(item => item.school_test_subject_id === focusSubjectId);
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
        user_id: userId, school_test_subject_id: subjectId, title: rangeInput.trim(),
        sort_order: ranges.filter(item => item.school_test_subject_id === subjectId).length,
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
    const rows = schoolRanges.filter(item => item.exam_id === targetExamId && item.subject === subjectName && isVisibleSchoolRange(item));
    const sections = rows.flatMap(row => (row.range_sections || []).filter(section => section.kind !== 'notice').map(section => ({ row, section })));
    const completed = sections.filter(({ row, section }) => publishedRangeProgress.some(progress => progress.school_test_range_id === row.id && progress.section_id === section.section_id && progress.completed)).length;
    return { total: sections.length, completed, percent: sections.length ? Math.round(completed / sections.length * 100) : 0 };
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
        subject: personalTaskSubject,
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
    if (timerState === 'idle') { setPhase('focus'); setTimerRemaining(focus * 60); }
  };
  const begin = () => {
    if (!task.trim()) { setError('取り組む課題・内容を入力してください。'); return; }
    setError(''); setMessage('');
    if (timerState === 'idle') {
      startedAt.current = new Date().toISOString(); setFocusSeconds(0); setBreakSeconds(0); setPhase('focus'); setTimerRemaining(focusMinutes * 60);
    }
    setShowRecord(false); setTimerState('running');
  };
  const finish = (kind: 'completed' | 'stopped') => {
    setTimerState('idle'); setFinishKind(kind); setShowRecord(true); setReflection(''); setNextAction('');
  };
  const saveSession = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (focusSeconds < 1) { setError('勉強時間が記録されていません。'); return; }
    setSaving(true); setError('');
    try {
      const { error: insertError } = await supabase.from('student_study_sessions').insert({
        user_id: userId, test_subject_id: null,
        subject_name: focusSubject, task_title: task.trim(),
        test_range_title: ranges.find(item => item.id === rangeId)?.title || '',
        focus_seconds: focusSeconds, break_seconds: breakSeconds,
        started_at: startedAt.current || new Date().toISOString(), ended_at: new Date().toISOString(),
        reflection: reflection.trim(), next_action: nextAction.trim(), finish_kind: finishKind,
      });
      if (insertError) throw insertError;
      setShowRecord(false); setTimerState('idle'); setFocusSeconds(0); setBreakSeconds(0); setTimerRemaining(focusMinutes * 60);
      startedAt.current = null; setTask(''); setRangeId(''); setReflection(''); setNextAction('');
      setMessage('学習記録を保存しました。'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '学習記録を保存できませんでした。'); }
    finally { setSaving(false); }
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
  const scopeColor = (percent: number, total: number) => !total
    ? dark ? 'border-slate-600 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-600'
    : percent === 100 ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
    : percent >= 50 ? 'border-cyan-300 bg-cyan-100 text-cyan-900'
    : percent > 0 ? 'border-amber-300 bg-amber-100 text-amber-900'
    : 'border-rose-200 bg-rose-50 text-rose-800';
  const timeText = String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');

  if (loading) return <div className={panel + ' mx-auto max-w-3xl text-center'}><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent"/><p className={'mt-3 text-sm ' + muted}>学習データを読み込んでいます…</p></div>;

  return <div className="mx-auto w-full max-w-5xl space-y-4 pb-8">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-black tracking-[.22em] text-cyan-600">CAMPUSSYNC LEARNING</p><h1 className={'mt-1 text-2xl font-black ' + (dark ? 'text-white' : 'text-slate-900')}>学習・テスト対策</h1><p className={'mt-1 text-xs ' + muted}>考査の予定、集中時間、勉強の記録をまとめて管理。</p></div><div className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-cyan-950"><p className="text-[9px] font-bold">今週の勉強時間</p><p className="text-sm font-black">{duration(weekSeconds)}</p></div></header>
    <nav className={'grid grid-cols-7 gap-1 rounded-2xl border p-1 ' + (dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white')}>
      {[{id:'overview',label:'概要',icon:TrendingUp},{id:'tests',label:'テスト対策',icon:GraduationCap},{id:'mini-tests',label:'小テスト',icon:CalendarDays},{id:'assignments',label:'課題一覧',icon:BookOpenCheck},{id:'focus',label:'集中',icon:Timer},{id:'history',label:'記録',icon:History},{id:'planetube',label:'Planetube',icon:Globe2}].map(item => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => setTab(item.id as typeof tab)} className={'flex flex-col sm:flex-row items-center justify-center gap-1 rounded-xl px-1 py-3 text-[9px] font-black sm:text-xs ' + (tab === item.id ? 'bg-cyan-700 text-white' : muted)}><Icon size={15}/>{item.label}</button>; })}
    </nav>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">{error}</div>}
    {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{message}</div>}

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
        <p className={'mb-3 text-xs leading-5 '+muted}>考査の予定・実施教科はAdmin・先生が登録します。生徒は日程を確認し、自分用のテスト範囲と進捗を管理できます。</p>
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
                  }} className={'flex min-w-[112px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-black shadow-sm transition hover:-translate-y-0.5 '+scopeColor(scope.percent, scope.total)}>
                    <span>{item.sort_order} ・ {item.subject}</span>
                    <span className="shrink-0 text-[10px] tabular-nums">{scope.total ? scope.percent+'%' : '未登録'}</span>
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
                       <span className="min-w-0"><span className="block text-sm font-black">{item.display_subject}</span><span className={'mt-1 block text-[10px] font-bold '+muted}>{item.audience} ・ 範囲 {completedCount}/{rangeSections.length} 完了 ・ お知らせ {noticeSections.length}件</span></span>
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
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold text-cyan-600">{dateLabel(subject.exam_date)}</p><h3 className="text-lg font-black">{subject.subject}</h3></div><b className={'rounded-full border px-3 py-1 text-xs '+scopeColor(official.percent,official.total)}>{official.total ? official.percent + '% 履修済み' : '範囲未登録'}</b></div>
              {official.total>0 && <><div className={'mt-3 h-2 overflow-hidden rounded-full '+(dark?'bg-slate-700':'bg-slate-100')}><div className="h-full rounded-full bg-emerald-500 transition-all" style={{width:pct+'%'}}/></div><p className={'mt-1 text-[10px] '+muted}>学校公開の出題範囲 {official.completed}/{official.total} 項目完了。上の「学校公開の試験範囲」でチェックできます。</p></>}
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
            <label className="block space-y-1 text-xs font-bold">教科<select className={input} value={personalTaskSubject} onChange={e=>setPersonalTaskSubject(e.target.value)}><option value="その他">その他</option>{SUBJECTS.map(subject=><option key={subject} value={subject}>{subject}</option>)}</select></label>
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
      <section className={panel}><div className="mb-3 flex items-center gap-2"><Timer size={19} className="text-cyan-600"/><h2 className="font-black">ポモドーロ設定</h2></div><div className="grid grid-cols-3 gap-2">{[{f:25,b:5,label:'25 + 5'},{f:50,b:10,label:'50 + 10'},{f:45,b:15,label:'45 + 15'}].map(p=> <button key={p.label} type="button" onClick={()=>setPreset(p.f,p.b)} className={'rounded-xl border p-3 text-center '+(focusMinutes===p.f&&breakMinutes===p.b?'border-cyan-500 bg-cyan-50 text-cyan-900':dark?'border-slate-600 bg-slate-900':'border-slate-200 bg-white')}><b className="block text-sm">{p.label}</b><span className="text-[10px]">分</span></button>)}</div><div className="mt-3 grid grid-cols-2 gap-2"><label className="space-y-1 text-xs font-bold">集中時間（分）<input className={input} type="number" min="1" max="180" value={customFocus} onChange={e=>{setCustomFocus(e.target.value);const v=Math.min(180,Math.max(1,Number(e.target.value)||1));setFocusMinutes(v);if(timerState==='idle'&&phase==='focus')setTimerRemaining(v*60)}}/></label><label className="space-y-1 text-xs font-bold">休憩時間（分）<input className={input} type="number" min="1" max="60" value={customBreak} onChange={e=>{setCustomBreak(e.target.value);setBreakMinutes(Math.min(60,Math.max(1,Number(e.target.value)||1)))}}/></label></div></section>
      <section className={panel}><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-black tracking-widest text-cyan-600">FOCUS SESSION</p><h2 className="mt-1 text-lg font-black">今日の自習</h2></div><span className={'rounded-full px-3 py-1.5 text-[10px] font-black '+(phase==='focus'?'bg-cyan-100 text-cyan-900':'bg-amber-100 text-amber-900')}>{phase==='focus'?'集中時間':'休憩時間'}</span></div>
        <div className="mb-5 flex flex-col items-center rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-4 py-7 text-white"><p className="text-[10px] font-bold tracking-[.2em] text-cyan-200">{phase==='focus'?'FOCUS':'BREAK'}</p><p className="my-2 font-mono text-6xl font-black tabular-nums sm:text-7xl">{timeText}</p><p className="text-xs text-white/70">勉強 {duration(focusSeconds)} ・ 休憩 {duration(breakSeconds)}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">{timerState==='idle'&&!showRecord&&<button type="button" onClick={begin} className="rounded-xl bg-cyan-500 px-6 py-3 text-sm font-black text-white"><Timer className="mr-2 inline" size={16}/>開始</button>}{timerState==='running'&&<button type="button" onClick={()=>setTimerState('paused')} className="rounded-xl bg-white/15 px-5 py-3 text-sm font-black">一時停止</button>}{timerState==='paused'&&<><button type="button" onClick={()=>setTimerState('running')} className="rounded-xl bg-cyan-500 px-5 py-3 text-sm font-black">再開</button><button type="button" onClick={()=>finish('completed')} className="rounded-xl bg-white/15 px-5 py-3 text-sm font-black">終了して記録</button></>}{timerState==='running'&&<button type="button" onClick={()=>finish('stopped')} className="rounded-xl bg-rose-500 px-5 py-3 text-sm font-black">途中終了</button>}</div>
          {timerState==='running'&&<button type="button" onClick={()=>{setPhase(phase==='focus'?'break':'focus');setTimerRemaining((phase==='focus'?breakMinutes:focusMinutes)*60)}} className="mt-3 text-[11px] font-bold text-cyan-100 underline">{phase==='focus'?'休憩に切り替える':'集中に戻る'}</button>}{timerState==='paused'&&<p className="mt-3 text-[11px] text-amber-200">一時停止中</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs font-bold">教科<select className={input} value={focusSubject} onChange={e=>{const value=e.target.value as Subject;setFocusSubject(value);if(activeFocusSubject?.subject!==value)setFocusSubjectId('')}} disabled={timerState==='running'}>{SUBJECTS.map(s=><option key={s}>{s}</option>)}</select></label><label className="space-y-1 text-xs font-bold">考査・教科<select className={input} value={focusSubjectId} onChange={e=>{setFocusSubjectId(e.target.value);const found=subjects.find(s=>s.id===e.target.value);if(found)setFocusSubject(found.subject)}} disabled={timerState==='running'}><option value="">指定しない</option>{subjects.map(s=><option key={s.id} value={s.id}>{exams.find(exam=>exam.id===s.exam_id)?.exam_type||'考査'} ・ {s.subject}</option>)}</select></label><label className="space-y-1 text-xs font-bold sm:col-span-2">課題・勉強内容<input className={input} value={task} onChange={e=>setTask(e.target.value)} placeholder="例：物理 波動の問題集を解く" maxLength={180} disabled={timerState==='running'} required/></label><label className="space-y-1 text-xs font-bold sm:col-span-2">テスト範囲（任意）<select className={input} value={rangeId} onChange={e=>setRangeId(e.target.value)} disabled={timerState==='running'}><option value="">範囲を指定しない</option>{focusRanges.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div>
      </section>
      {showRecord&&<section className={panel}><div className="mb-3 flex items-center justify-between"><h2 className="font-black">勉強内容を記録</h2><button type="button" onClick={()=>{setShowRecord(false);setTimerState("paused")}} aria-label="閉じる"><X size={18}/></button></div><p className={'mb-3 text-xs '+muted}>集中 {duration(focusSeconds)} ・ 休憩 {duration(breakSeconds)}</p><form onSubmit={saveSession} className="space-y-3"><label className="block space-y-1 text-xs font-bold">勉強した内容<textarea className={input} value={reflection} onChange={e=>setReflection(e.target.value)} rows={3} placeholder="どこまで進んだか、何を理解できたか…" maxLength={2000} required/></label><label className="block space-y-1 text-xs font-bold">次にやること<textarea className={input} value={nextAction} onChange={e=>setNextAction(e.target.value)} rows={2} placeholder="次回は何から始めるか…" maxLength={1000} required/></label><div className="flex justify-end gap-2"><button type="button" onClick={()=>{setShowRecord(false);setTimerState('paused')}} className={secondary}>戻る</button><button className={primary} disabled={saving||focusSeconds<1}><CheckCircle2 size={15}/>記録を保存</button></div></form></section>}
    </div>}

    {tab === 'history' && <div className="space-y-4">
      <section className={panel}><div className="mb-3 flex items-center gap-2"><CalendarDays size={18} className="text-cyan-600"/><h2 className="font-black">日・週ごとの学習時間</h2></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-cyan-50 p-3 text-cyan-950"><p className="text-[10px] font-bold">今日</p><p className="mt-1 text-xl font-black">{duration(todaySeconds)}</p></div><div className="rounded-xl bg-blue-50 p-3 text-blue-950"><p className="text-[10px] font-bold">今週（月〜日）</p><p className="mt-1 text-xl font-black">{duration(weekSeconds)}</p></div></div><div className="mt-4 grid grid-cols-7 items-end gap-2">{weekData.map(day=><div key={day.key} className="flex flex-col items-center gap-1"><div className={'flex h-20 w-full items-end overflow-hidden rounded-md '+(dark?'bg-slate-900':'bg-slate-100')}><div className="w-full rounded-md bg-cyan-600" style={{height:Math.max(day.seconds?5:0,day.seconds/maxDay*100)+'%'}}/></div><span className={'text-[10px] '+muted}>{day.label}</span></div>)}</div></section>
      <section className={panel}><h2 className="mb-3 font-black">教科別の累計（直近120日）</h2>{subjectTotals.length?<div className="space-y-3">{subjectTotals.map(([name,seconds])=><div key={name}><div className="mb-1 flex justify-between text-xs"><b>{name}</b><span className={muted}>{duration(seconds)}</span></div><div className={'h-2 rounded-full '+(dark?'bg-slate-700':'bg-slate-100')}><div className="h-full rounded-full bg-cyan-600" style={{width:Math.max(2,seconds/Math.max(...subjectTotals.map(item=>item[1]))*100)+'%'}}/></div></div>)}</div>:<p className={'text-sm '+muted}>まだ記録がありません。</p>}</section>
      <section className={panel}><h2 className="mb-3 font-black">最近の学習記録</h2><div className="space-y-2">{sessions.slice(0,20).map(item=><article key={item.id} className={'rounded-xl p-3 '+(dark?'bg-slate-900':'bg-slate-50')}><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">{item.subject_name} ・ {item.task_title}</b><b className="text-xs text-cyan-600">{duration(item.focus_seconds)}</b></div><p className={'mt-1 text-[10px] '+muted}>{new Date(item.started_at).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} ・ 休憩 {duration(item.break_seconds)} ・ {item.finish_kind==='stopped'?'途中終了':'完了'}</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5">{item.reflection}</p><p className={'mt-2 whitespace-pre-wrap text-xs '+muted}>次：{item.next_action}</p></article>)}{!sessions.length&&<p className={'rounded-xl border border-dashed p-4 text-sm '+muted}>学習記録はまだありません。</p>}</div></section>
    </div>}
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
