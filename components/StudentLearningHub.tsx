'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BookOpenCheck, CalendarDays, CheckCircle2, GraduationCap, History, Plus, QrCode, Timer, TrendingUp, UserRound, X } from 'lucide-react';

const SUBJECTS = ['国語演習', '古典探求', '物理', '生物', '数３', '数C', '公共', '英コミュ', '論表', '情報', '保健'] as const;
type Subject = typeof SUBJECTS[number];
type Exam = { id: string; school_year: number; term: number; exam_type: string; start_date: string; end_date: string };
type ExamSubject = { id: string; exam_id: string; subject: Subject; exam_date: string; sort_order: number };
type Range = { id: string; subject_id: string; title: string; status: 'not_started' | 'in_progress' | 'completed' | 'reviewed' };
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

export default function StudentLearningHub({ userId, isDarkMode = false }: { userId: string; isDarkMode?: boolean }) {
  const [tab, setTab] = useState<'overview' | 'tests' | 'focus' | 'history'>('overview');
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<ExamSubject[]>([]);
  const [ranges, setRanges] = useState<Range[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [examId, setExamId] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [term, setTerm] = useState('1');
  const [examType, setExamType] = useState('中間考査');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [subjectName, setSubjectName] = useState<Subject>('国語演習');
  const [subjectDate, setSubjectDate] = useState('');
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
      const [a, b, c, d] = await Promise.all([
        supabase.from('student_test_exams').select('*').eq('user_id', userId).order('start_date', { ascending: false }),
        supabase.from('student_test_subjects').select('*').eq('user_id', userId).order('exam_date').order('sort_order'),
        supabase.from('student_test_ranges').select('*').eq('user_id', userId).order('created_at'),
        supabase.from('student_study_sessions').select('*').eq('user_id', userId).gte('started_at', since).order('started_at', { ascending: false }).limit(250),
      ]);
      const issue = a.error || b.error || c.error || d.error;
      if (issue) throw issue;
      const newExams = (a.data || []) as Exam[];
      setExams(newExams); setSubjects((b.data || []) as ExamSubject[]); setRanges((c.data || []) as Range[]); setSessions((d.data || []) as Session[]);
      setExamId(current => current && newExams.some(exam => exam.id === current) ? current : (newExams[0]?.id || ''));
      setSubjectDate(current => current || newExams[0]?.start_date || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '学習データを読み込めませんでした。');
    } finally { setLoading(false); }
  }, [userId]);

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
    if (term === '3') setExamType('学年末考査');
    else if (examType === '学年末考査') setExamType('中間考査');
  }, [term, examType]);

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

  const activeExam = exams.find(item => item.id === examId) || null;
  const activeSubjects = subjects.filter(item => item.exam_id === examId);
  const activeFocusSubject = subjects.find(item => item.id === focusSubjectId) || null;
  const focusRanges = ranges.filter(item => item.subject_id === focusSubjectId);
  const datesDuration = startDate && endDate
    ? Math.round((new Date(endDate + 'T00:00:00').getTime() - new Date(startDate + 'T00:00:00').getTime()) / 86400000) + 1 : 0;

  const createExam = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setMessage('');
    if (datesDuration !== 3 && datesDuration !== 4) { setError('考査期間は3日間または4日間で設定してください。'); return; }
    setSaving(true);
    try {
      const { data, error: insertError } = await supabase.from('student_test_exams').insert({
        user_id: userId, school_year: Number(year), term: Number(term),
        exam_type: term === '3' ? '学年末考査' : examType, start_date: startDate, end_date: endDate,
      }).select('id').single();
      if (insertError) throw insertError;
      setExamId(data.id); setSubjectDate(startDate); setMessage('考査を登録しました。実施教科を追加してください。'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '考査を登録できませんでした。'); }
    finally { setSaving(false); }
  };

  const addSubject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeExam) { setError('先に考査を登録してください。'); return; }
    if (subjectDate < activeExam.start_date || subjectDate > activeExam.end_date) { setError('教科の日付は考査期間内にしてください。'); return; }
    const sameDay = activeSubjects.filter(item => item.exam_date === subjectDate);
    if (sameDay.length >= 3) { setError('1日に登録できる教科は最大3教科です。'); return; }
    if (activeSubjects.some(item => item.subject === subjectName)) { setError('この考査には同じ教科が登録済みです。'); return; }
    setSaving(true); setError('');
    try {
      const { error: insertError } = await supabase.from('student_test_subjects').insert({
        user_id: userId, exam_id: activeExam.id, subject: subjectName, exam_date: subjectDate, sort_order: sameDay.length + 1,
      });
      if (insertError) throw insertError;
      setMessage(subjectName + 'を追加しました。'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '教科を追加できませんでした。'); }
    finally { setSaving(false); }
  };

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

  const removeExam = async () => {
    if (!activeExam || !window.confirm('この考査と教科・範囲を削除しますか？')) return;
    const { error: deleteError } = await supabase.from('student_test_exams').delete().eq('id', activeExam.id).eq('user_id', userId);
    if (deleteError) setError(deleteError.message);
    else { setExamId(''); setMessage('考査を削除しました。'); await load(); }
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
        user_id: userId, test_subject_id: activeFocusSubject?.subject === focusSubject ? activeFocusSubject.id : null,
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
    const list = ranges.filter(item => item.subject_id === id);
    const done = list.filter(item => item.status === 'completed' || item.status === 'reviewed').length;
    return { count: list.length, percent: list.length ? Math.round(done / list.length * 100) : 0 };
  };
  const timeText = String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');

  if (loading) return <div className={panel + ' mx-auto max-w-3xl text-center'}><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent"/><p className={'mt-3 text-sm ' + muted}>学習データを読み込んでいます…</p></div>;

  return <div className="mx-auto w-full max-w-5xl space-y-4 pb-8">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-black tracking-[.22em] text-cyan-600">CAMPUSSYNC LEARNING</p><h1 className={'mt-1 text-2xl font-black ' + (dark ? 'text-white' : 'text-slate-900')}>学習・テスト対策</h1><p className={'mt-1 text-xs ' + muted}>考査の予定、集中時間、勉強の記録をまとめて管理。</p></div><div className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-cyan-950"><p className="text-[9px] font-bold">今週の勉強時間</p><p className="text-sm font-black">{duration(weekSeconds)}</p></div></header>
    <nav className={'grid grid-cols-4 gap-1 rounded-2xl border p-1 ' + (dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white')}>
      {[{id:'overview',label:'概要',icon:TrendingUp},{id:'tests',label:'テスト対策',icon:GraduationCap},{id:'focus',label:'集中モード',icon:Timer},{id:'history',label:'学習記録',icon:History}].map(item => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => setTab(item.id as typeof tab)} className={'flex items-center justify-center gap-1 rounded-xl px-1 py-3 text-[10px] font-black sm:text-xs ' + (tab === item.id ? 'bg-cyan-700 text-white' : muted)}><Icon size={15}/>{item.label}</button>; })}
    </nav>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">{error}</div>}
    {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{message}</div>}

    {tab === 'overview' && <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><section className={panel}><p className={'text-[10px] font-bold '+muted}>今日</p><p className="mt-2 text-2xl font-black text-cyan-600">{duration(todaySeconds)}</p></section><section className={panel}><p className={'text-[10px] font-bold '+muted}>今週</p><p className="mt-2 text-2xl font-black text-cyan-600">{duration(weekSeconds)}</p></section><section className={panel+' col-span-2 sm:col-span-1'}><p className={'text-[10px] font-bold '+muted}>考査登録数</p><p className="mt-2 text-2xl font-black">{exams.length}件</p></section></div>
      <section className={panel}><div className="mb-3 flex items-center justify-between"><h2 className="font-black">今週の集中時間</h2><button type="button" onClick={() => setTab('history')} className="text-xs font-bold text-cyan-600">詳細</button></div><div className="grid grid-cols-7 items-end gap-2">{weekData.map(day => <div key={day.key} className="flex flex-col items-center gap-2"><span className={'text-[9px] '+muted}>{day.seconds ? Math.round(day.seconds/60)+'分' : '—'}</span><div className={'flex h-24 w-full items-end overflow-hidden rounded-lg '+(dark?'bg-slate-900':'bg-slate-100')}><div className="w-full rounded-lg bg-gradient-to-t from-cyan-700 to-sky-400" style={{height:Math.max(day.seconds?5:0,day.seconds/maxDay*100)+'%'}}/></div><span className={'text-[10px] font-bold '+muted}>{day.label}</span></div>)}</div></section>
      <section className={panel}><div className="mb-3 flex items-center justify-between"><h2 className="font-black">次の考査</h2><button type="button" onClick={() => setTab('tests')} className="text-xs font-bold text-cyan-600">管理</button></div>{exams.length ? exams.slice().sort((a,b)=>a.start_date.localeCompare(b.start_date)).slice(0,1).map(exam => <div key={exam.id} className="rounded-xl bg-gradient-to-r from-cyan-800 to-blue-700 p-4 text-white"><p className="text-xs text-cyan-100">{exam.school_year}年度・{exam.term}学期</p><p className="mt-1 text-xl font-black">{exam.exam_type}</p><p className="mt-2 text-xs">{dateLabel(exam.start_date)}〜{dateLabel(exam.end_date)}</p><p className="mt-2 text-[11px] text-white/80">{subjects.filter(item=>item.exam_id===exam.id).length}教科登録</p></div>) : <p className={'rounded-xl border border-dashed p-4 text-sm '+muted}>考査が未登録です。テスト対策から登録できます。</p>}</section>
      <section className={panel}><div className="mb-3 flex items-center justify-between"><h2 className="font-black">教科別の集中時間</h2><button type="button" onClick={() => setTab('focus')} className="text-xs font-bold text-cyan-600">勉強を始める</button></div>{subjectTotals.length ? <div className="space-y-3">{subjectTotals.slice(0,5).map(([name,seconds])=><div key={name}><div className="mb-1 flex justify-between text-xs"><b>{name}</b><span className={muted}>{duration(seconds)}</span></div><div className={'h-2 overflow-hidden rounded-full '+(dark?'bg-slate-700':'bg-slate-100')}><div className="h-full rounded-full bg-cyan-600" style={{width:Math.max(2,seconds/Math.max(...subjectTotals.map(item=>item[1]))*100)+'%'}}/></div></div>)}</div> : <p className={'text-sm '+muted}>勉強記録を保存すると集計が表示されます。</p>}</section>
    </div>}

    {tab === 'tests' && <div className="space-y-4">
      <section className={panel}><div className="mb-3 flex items-center gap-2"><Plus size={18} className="text-cyan-600"/><h2 className="font-black">考査を登録</h2></div><form onSubmit={createExam} className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-bold">年度<input className={input} type="number" min="2020" max="2100" value={year} onChange={e=>setYear(e.target.value)} required/></label>
        <label className="space-y-1 text-xs font-bold">学期<select className={input} value={term} onChange={e=>setTerm(e.target.value)}><option value="1">1学期</option><option value="2">2学期</option><option value="3">3学期</option></select></label>
        <label className="space-y-1 text-xs font-bold">考査<select className={input} value={term==='3'?'学年末考査':examType} onChange={e=>setExamType(e.target.value)} disabled={term==='3'}><option>中間考査</option><option>期末考査</option></select></label>
        <div className="grid grid-cols-2 gap-2"><label className="space-y-1 text-xs font-bold">開始日<input className={input} type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} required/></label><label className="space-y-1 text-xs font-bold">終了日<input className={input} type="date" min={startDate||undefined} value={endDate} onChange={e=>setEndDate(e.target.value)} required/></label></div>
        <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2"><p className={'text-[11px] '+muted}>3日間または4日間。実施しない教科は追加しないでください。</p><button className={primary} disabled={saving}>考査を保存</button></div>
      </form></section>
      {exams.length>0 && <section className={panel}><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-black">登録済みの考査</h2><select className={input+' max-w-[260px]'} value={examId} onChange={e=>setExamId(e.target.value)}>{exams.map(item=><option key={item.id} value={item.id}>{item.school_year}年度・{item.term}学期 {item.exam_type}</option>)}</select></div>
        {activeExam && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-cyan-50 p-3 text-cyan-950"><div><b className="text-sm">{activeExam.exam_type}</b><p className="mt-1 text-xs">{dateLabel(activeExam.start_date)}〜{dateLabel(activeExam.end_date)}</p></div><button type="button" onClick={()=>void removeExam()} className="rounded-lg border border-rose-200 bg-white px-2.5 py-2 text-[10px] font-bold text-rose-700">考査を削除</button></div>}
        <form onSubmit={addSubject} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="space-y-1 text-xs font-bold">教科<select className={input} value={subjectName} onChange={e=>setSubjectName(e.target.value as Subject)}>{SUBJECTS.map(item=><option key={item}>{item}</option>)}</select></label><label className="space-y-1 text-xs font-bold">試験日<input className={input} type="date" min={activeExam?.start_date} max={activeExam?.end_date} value={subjectDate} onChange={e=>setSubjectDate(e.target.value)} required/></label><button className={primary} disabled={saving||!activeExam}><Plus size={15}/>教科を追加</button></form>
        <p className={'mt-2 text-[10px] '+muted}>1日最大3教科。同一考査で同じ教科は1回まで。</p>
        <div className="mt-4 space-y-3">{Array.from(new Set(activeSubjects.map(item=>item.exam_date))).sort().map(date=><div key={date} className="rounded-xl border border-slate-200/70 p-3"><p className="mb-2 text-xs font-black">{dateLabel(date)}</p><div className="flex flex-wrap gap-2">{activeSubjects.filter(item=>item.exam_date===date).sort((a,b)=>a.sort_order-b.sort_order).map(item=><span key={item.id} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{item.sort_order} ・ {item.subject}</span>)}</div></div>)}{!activeSubjects.length&&<p className={'rounded-xl border border-dashed p-4 text-xs '+muted}>まだ教科が登録されていません。</p>}</div>
      </section>}
      {activeSubjects.map(subject=>{const list=ranges.filter(item=>item.subject_id===subject.id);const pct=progress(subject.id).percent;return <section key={subject.id} className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold text-cyan-600">{dateLabel(subject.exam_date)}</p><h3 className="text-lg font-black">{subject.subject}</h3></div><b className="rounded-full bg-cyan-50 px-3 py-1 text-xs text-cyan-800">{pct}% 完了</b></div>
        <div className={'mt-3 h-2 overflow-hidden rounded-full '+(dark?'bg-slate-700':'bg-slate-100')}><div className="h-full rounded-full bg-cyan-600" style={{width:pct+'%'}}/></div>
        <div className="mt-3 space-y-2">{list.map(item=><div key={item.id} className={'flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 '+(dark?'bg-slate-900':'bg-slate-50')}><span className="min-w-0 flex-1 text-sm font-bold">{item.title}</span><select aria-label={item.title+'の進捗'} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-700" value={item.status} onChange={e=>void setRangeStatus(item.id,e.target.value as Range['status'])}>{Object.entries(STATUS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>)}{!list.length&&<p className={'text-xs '+muted}>範囲が未登録です。</p>}</div>
        <form onSubmit={e=>{e.preventDefault();void addRange(subject.id);}} className="mt-3 flex flex-col gap-2 sm:flex-row"><input className={input} value={rangeTarget===subject.id?rangeInput:''} onFocus={()=>setRangeTarget(subject.id)} onChange={e=>{setRangeTarget(subject.id);setRangeInput(e.target.value)}} placeholder="例：教科書 P20〜35、問題集 第2章" maxLength={160}/><button className={secondary} disabled={saving||!rangeInput.trim()||rangeTarget!==subject.id}><Plus size={14}/>範囲を追加</button></form>
      </section>;})}
      {exams.length===0&&<p className={'text-sm '+muted}>考査を登録すると、試験日ごとの教科とテスト範囲を管理できます。</p>}
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
