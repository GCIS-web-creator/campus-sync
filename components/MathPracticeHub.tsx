'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, BookOpen, CheckCircle2, Clock3, GraduationCap, History, Search,
  RotateCcw, Shuffle, Target, Timer, Trophy, XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { filterMathPracticeQuestions, paginateMathPracticeQuestions } from '@/lib/math-practice-catalog';

type MathCourse = '数学I' | '数学A' | '数学II' | '数学B' | '数学III' | '数学C';
type Option = { id: string; text: string };
type MathQuestion = {
  id: string;
  subject: MathCourse;
  subject_code: string;
  unit: string;
  title: string;
  prompt: string;
  options: Option[] | null;
  difficulty: string;
  question_type: 'multiple_choice' | 'numeric' | 'written';
  source_name: string | null;
  source_url: string | null;
  source_license: string | null;
  source_attribution: string | null;
};
type Attempt = {
  id: string;
  question_id: string;
  course: MathCourse;
  unit: string;
  is_correct: boolean;
  answer_text: string;
  mode: string;
  time_spent_seconds: number;
  created_at: string;
};
type Section = 'practice' | 'review' | 'dashboard' | 'mock';
type PracticeMode = 'unit' | 'random' | 'timed' | 'review' | 'mock';
type MockAnswer = { questionId: string; answer: string; isCorrect: boolean; seconds: number };

const COURSES: MathCourse[] = ['数学I', '数学A', '数学II', '数学B', '数学III', '数学C'];
const shuffle = <T,>(items: T[]) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
const clock = (seconds: number) => String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0') + ':' + String(Math.max(0, seconds) % 60).padStart(2, '0');
const percent = (a: number, b: number) => b ? Math.round(a / b * 100) : 0;
type ServerGrade = {
  is_correct: boolean;
  is_graded: boolean;
  xp_awarded: number;
  already_awarded: boolean;
  question_type: 'multiple_choice' | 'numeric' | 'written';
  correct_option_text: string | null;
  correct_answer: string | null;
  explanation: string;
  replayed: boolean;
};
type PendingKnowledgeSubmission = { questionId: string; answer: string; attemptId: string };

export default function MathPracticeHub({ userId, isDarkMode = false }: { userId: string; isDarkMode?: boolean }) {
  const [section, setSection] = useState<Section>('practice');
  const [course, setCourse] = useState<MathCourse>('数学I');
  const [unit, setUnit] = useState('');
  const [questionSearch, setQuestionSearch] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | 'basic' | 'normal' | 'challenge'>('all');
  const [questionPage, setQuestionPage] = useState(1);
  const [mode, setMode] = useState<PracticeMode>('unit');
  const [questions, setQuestions] = useState<MathQuestion[]>([]);
  const [current, setCurrent] = useState<MathQuestion | null>(null);
  const [answer, setAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [gradingResult, setGradingResult] = useState<ServerGrade | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [timedActive, setTimedActive] = useState(false);
  const [timedExpired, setTimedExpired] = useState(false);
  const [mockActive, setMockActive] = useState(false);
  const [remaining, setRemaining] = useState(15 * 60);
  const [mockQueue, setMockQueue] = useState<MathQuestion[]>([]);
  const [mockIndex, setMockIndex] = useState(0);
  const [mockAnswers, setMockAnswers] = useState<MockAnswer[]>([]);
  const [mockSummary, setMockSummary] = useState<{ score: number; total: number; elapsed: number } | null>(null);
  const [reviewQueue, setReviewQueue] = useState<MathQuestion[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const questionStartedAt = useRef(Date.now());
  const mockStartedAt = useRef<number | null>(null);
  const pendingKnowledgeSubmission = useRef<PendingKnowledgeSubmission | null>(null);

  const dark = isDarkMode;
  const panel = 'rounded-3xl border shadow-sm ' + (dark ? 'border-slate-700 bg-slate-900/80 text-slate-100' : 'border-slate-200 bg-white text-slate-900');
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const field = 'border ' + (dark ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400');
  const button = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50';
  const primary = button + ' bg-cyan-700 text-white hover:bg-cyan-600';
  const secondary = button + ' border ' + (dark ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: authData, error: authError }, attemptsResponse] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from('math_practice_attempts')
          .select('id,question_id,course,unit,is_correct,answer_text,mode,time_spent_seconds,created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1000),
      ]);
      const token = authData.session?.access_token;
      if (authError || !token) throw new Error('ログイン状態を確認してください。');
      if (attemptsResponse.error) throw attemptsResponse.error;

      // Answer keys never reach the browser. Load published, class-eligible questions
      // from the authenticated server API in bounded pages.
      const pageSize = 250;
      const bank: MathQuestion[] = [];
      let totalPages = 1;
      for (let page = 1; page <= totalPages; page += 1) {
        const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
        const response = await fetch('/api/knowledge-practice?' + params.toString(), {
          headers: { Authorization: 'Bearer ' + token },
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.message || '知識問題を読み込めませんでした。');
        bank.push(...(Array.isArray(payload.questions) ? payload.questions as MathQuestion[] : []));
        totalPages = Math.max(1, Number(payload.pagination?.totalPages || 1));
      }

      setQuestions(bank);
      setAttempts((attemptsResponse.data || []) as Attempt[]);
      setCurrent(previous => previous && bank.some(item => item.id === previous.id)
        ? previous
        : bank.find(item => item.subject === '数学I') || bank[0] || null);
      const invalid = bank.filter(item =>
        !item.prompt?.trim() ||
        (item.question_type === 'multiple_choice' && (!item.options || item.options.length < 2))
      );
      if (invalid.length) setError('問題データに確認が必要な項目があります（' + invalid.length + '問）。管理者による確認が必要です。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '問題データを読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const units = useMemo(() => Array.from(new Set(questions.filter(q => q.subject === course).map(q => q.unit))), [questions, course]);
  const selectedQuestions = useMemo(() => questions.filter(q => q.subject === course && (!unit || q.unit === unit)), [questions, course, unit]);
  const searchedQuestions = useMemo(
    () => filterMathPracticeQuestions(selectedQuestions, questionSearch, difficultyFilter),
    [selectedQuestions, questionSearch, difficultyFilter],
  );
  const questionPageData = useMemo(
    () => paginateMathPracticeQuestions(searchedQuestions, questionPage, 30),
    [searchedQuestions, questionPage],
  );
  const courseCounts = useMemo(() => COURSES.map(name => ({ name, count: questions.filter(q => q.subject === name).length })), [questions]);

  const mistakeQuestions = useMemo(() => {
    const seen = new Set<string>();
    const result: MathQuestion[] = [];
    for (const attempt of attempts) {
      if (seen.has(attempt.question_id)) continue;
      seen.add(attempt.question_id);
      if (attempt.is_correct) continue;
      const q = questions.find(item => item.id === attempt.question_id);
      if (q) result.push(q);
    }
    return result;
  }, [attempts, questions]);

  const openQuestion = (question: MathQuestion) => {
    setCurrent(question);
    setCourse(question.subject);
    setUnit(question.unit);
    setAnswer('');
    setShowResult(false);
    setGradingResult(null);
    setLastCorrect(false);
    setQuestionPage(1);
    questionStartedAt.current = Date.now();
    setSection('practice');
  };

  const nextQuestion = useCallback((excludeId?: string) => {
    if (!selectedQuestions.length) return;
    const currentIndex = excludeId ? selectedQuestions.findIndex(q => q.id === excludeId) : -1;
    const next = mode === 'unit'
      ? selectedQuestions[(currentIndex + 1 + selectedQuestions.length) % selectedQuestions.length]
      : selectedQuestions.filter(q => q.id !== excludeId)[Math.floor(Math.random() * Math.max(1, selectedQuestions.filter(q => q.id !== excludeId).length))]
        || selectedQuestions[0];
    setCurrent(next);
    setAnswer('');
    setShowResult(false);
    questionStartedAt.current = Date.now();
  }, [mode, selectedQuestions]);

  const finishMock = useCallback(async (entries: MockAnswer[]) => {
    setMockActive(false);
    setTimedActive(false);
    const elapsed = mockStartedAt.current ? Math.max(0, Math.round((Date.now() - mockStartedAt.current) / 1000)) : 0;
    const score = entries.filter(item => item.isCorrect).length;
    setMockSummary({ score, total: mockQueue.length, elapsed });
    try {
      const { error: insertError } = await supabase.from('math_mock_test_results').insert({
        user_id: userId, course, question_ids: mockQueue.map(q => q.id),
        answers: entries, score, total: mockQueue.length, duration_seconds: elapsed,
      });
      if (insertError) throw insertError;
    } catch (cause) {
      setError(cause instanceof Error ? '模試結果の画面表示は完了しましたが、保存に失敗しました: ' + cause.message : '模試結果を保存できませんでした。');
    }
  }, [course, mockQueue, userId]);

  useEffect(() => {
    if (!timedActive && !mockActive) return;
    const timer = window.setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [timedActive, mockActive]);

  useEffect(() => {
    if (remaining !== 0) return;
    if (timedActive) {
      setTimedActive(false);
      setTimedExpired(true);
    }
    if (mockActive) void finishMock(mockAnswers);
  }, [remaining, timedActive, mockActive, finishMock, mockAnswers]);

  const startTimedPractice = () => {
    setMode('timed');
    setRemaining(15 * 60);
    setTimedExpired(false);
    setTimedActive(true);
    setMockActive(false);
    setSection('practice');
    const pool = selectedQuestions.length ? selectedQuestions : questions.filter(q => q.subject === course);
    if (pool.length) {
      const first = shuffle(pool)[0];
      setCurrent(first);
      setAnswer('');
      setShowResult(false);
      questionStartedAt.current = Date.now();
    }
  };

  const startMock = () => {
    const pool = shuffle(questions.filter(q => q.subject === course));
    const queue = pool.slice(0, 10);
    if (!queue.length) {
      setError('この科目の問題を読み込めませんでした。');
      return;
    }
    setMockQueue(queue);
    setMockIndex(0);
    setMockAnswers([]);
    setMockSummary(null);
    setCurrent(queue[0]);
    setAnswer('');
    setShowResult(false);
    setSection('mock');
    setRemaining(20 * 60);
    setTimedActive(false);
    setMockActive(true);
    mockStartedAt.current = Date.now();
    questionStartedAt.current = Date.now();
  };

  const submitAnswer = async () => {
    if (!current || saving || !answer.trim() || showResult) return;
    const submittedAnswer = answer.trim();
    const seconds = Math.max(0, Math.round((Date.now() - questionStartedAt.current) / 1000));
    const previousPending = pendingKnowledgeSubmission.current;
    const request = previousPending
      && previousPending.questionId === current.id
      && previousPending.answer === submittedAnswer
      ? previousPending
      : { questionId: current.id, answer: submittedAnswer, attemptId: crypto.randomUUID() };
    pendingKnowledgeSubmission.current = request;

    setSaving(true);
    setError('');
    let successfulEntry: MockAnswer | null = null;
    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const token = authData.session?.access_token;
      if (authError || !token) throw new Error('ログイン状態を確認してください。');

      const response = await fetch('/api/knowledge-practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          question_id: request.questionId,
          attempt_id: request.attemptId,
          selected_option_id: current.question_type === 'multiple_choice' ? submittedAnswer : null,
          selected_answer: current.question_type === 'multiple_choice' ? null : submittedAnswer,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success || !payload.result) {
        throw new Error(payload.message || '回答を採点できませんでした。');
      }

      const graded = { ...payload.result, question_type: current.question_type } as ServerGrade;
      const correct = Boolean(graded.is_correct);
      successfulEntry = { questionId: current.id, answer: submittedAnswer, isCorrect: correct, seconds };
      pendingKnowledgeSubmission.current = null;
      setLastCorrect(correct);
      setGradingResult(graded);
      setShowResult(true);

      // Preserve the existing learning report. The server-side knowledge attempt
      // and XP ledger are committed before this secondary history mirror.
      const { data: historyRow, error: historyError } = await supabase.from('math_practice_attempts').insert({
        user_id: userId,
        question_id: current.id,
        course: current.subject,
        unit: current.unit,
        is_correct: correct,
        answer_text: submittedAnswer,
        mode: mockActive ? 'mock' : mode,
        time_spent_seconds: seconds,
      }).select('id,question_id,course,unit,is_correct,answer_text,mode,time_spent_seconds,created_at').single();

      if (historyError) {
        setError('採点と知識XPは保存されましたが、学習レポート用の履歴保存に失敗しました。');
      } else if (historyRow) {
        setAttempts(previous => [historyRow as Attempt, ...previous].slice(0, 1000));
      }
    } catch (cause) {
      // Reuse this idempotency key after network failures to prevent duplicate XP.
      setError(cause instanceof Error ? cause.message : '回答を送信できませんでした。');
    } finally {
      setSaving(false);
    }

    if (successfulEntry && mockActive) {
      const updated = [...mockAnswers, successfulEntry];
      setMockAnswers(updated);
      if (mockIndex + 1 >= mockQueue.length) {
        await finishMock(updated);
      } else {
        const nextIndex = mockIndex + 1;
        setMockIndex(nextIndex);
        setCurrent(mockQueue[nextIndex]);
        setAnswer('');
        setShowResult(false);
        questionStartedAt.current = Date.now();
      }
    }
  };

  const goNext = () => {
    if (mode === 'review' && reviewQueue.length) {
      const nextIndex = (reviewIndex + 1) % reviewQueue.length;
      setReviewIndex(nextIndex);
      openQuestion(reviewQueue[nextIndex]);
      setMode('review');
      return;
    }
    nextQuestion(current?.id);
  };

  const startReview = () => {
    if (!mistakeQuestions.length) return;
    setReviewQueue(mistakeQuestions);
    setReviewIndex(0);
    setMode('review');
    openQuestion(mistakeQuestions[0]);
  };

  const startReviewItem = (question: MathQuestion) => {
    const queue = mistakeQuestions;
    setReviewQueue(queue);
    setReviewIndex(Math.max(0, queue.findIndex(item => item.id === question.id)));
    setMode('review');
    openQuestion(question);
  };

  const accuracy = percent(attempts.filter(item => item.is_correct).length, attempts.length);
  const uniqueSolved = new Set(attempts.map(item => item.question_id)).size;
  const unitStats = useMemo(() => {
    const stats = new Map<string, { correct: number; total: number }>();
    for (const item of attempts) {
      const key = item.course + ' / ' + item.unit;
      const currentStat = stats.get(key) || { correct: 0, total: 0 };
      currentStat.total += 1;
      if (item.is_correct) currentStat.correct += 1;
      stats.set(key, currentStat);
    }
    return [...stats.entries()].map(([name, data]) => ({ name, ...data, rate: percent(data.correct, data.total) }))
      .sort((a, b) => a.rate - b.rate || b.total - a.total);
  }, [attempts]);

  const tabs: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'practice', label: '問題演習', icon: <BookOpen size={16} /> },
    { id: 'review', label: '間違えた問題', icon: <RotateCcw size={16} /> },
    { id: 'dashboard', label: '学習レポート', icon: <Target size={16} /> },
    { id: 'mock', label: '模擬試験', icon: <GraduationCap size={16} /> },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-cyan-950 to-blue-900 p-5 text-white shadow-xl sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full border-[28px] border-white/5" />
        <div className="pointer-events-none absolute -bottom-24 right-32 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-200/10 px-3 py-1 text-xs font-bold text-cyan-100"><GraduationCap size={14} /> CAMPUSSYNC MATH LAB</div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">数学演習ラボ</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-cyan-50/80">数学I・A・II・B・III・Cの公開問題を、単元別・ランダム・時間制限・模擬試験で演習。解答履歴から苦手な単元を把握できます。</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-64">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur"><div className="text-[11px] font-bold text-cyan-100/70">公開問題</div><div className="mt-1 text-2xl font-black">{questions.length.toLocaleString('ja-JP')}<span className="ml-1 text-xs">問</span></div></div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur"><div className="text-[11px] font-bold text-cyan-100/70">あなたの正答率</div><div className="mt-1 text-2xl font-black">{accuracy}<span className="ml-1 text-xs">%</span></div></div>
          </div>
        </div>
      </section>

      <nav className={'flex flex-wrap gap-2 rounded-2xl border p-2 ' + panel} aria-label="数学演習メニュー">
        {tabs.map(item => <button key={item.id} type="button" onClick={() => setSection(item.id)} className={button + ' ' + (section === item.id ? 'bg-cyan-700 text-white' : secondary)}>
          {item.icon}{item.label}{item.id === 'review' && mistakeQuestions.length > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] text-white">{mistakeQuestions.length}</span>}
        </button>)}
      </nav>

      {error && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>}

      {section === 'practice' && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className={'p-4 sm:p-6 ' + panel}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><div className={'text-xs font-bold uppercase tracking-wider ' + muted}>PRACTICE SESSION</div><h2 className="mt-1 text-xl font-black">問題を解く</h2></div>
              <div className="flex flex-wrap items-center gap-2">
                {timedActive && <span className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1.5 text-sm font-black text-rose-700"><Timer size={15} />{clock(remaining)}</span>}
                {timedExpired && <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-800">15分終了・解答受付終了</span>}
                {timedActive && <button type="button" onClick={() => { setTimedActive(false); setTimedExpired(false); }} className={secondary}>終了</button>}
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block"><span className={'mb-1.5 block text-xs font-bold ' + muted}>科目</span>
                <select value={course} onChange={e => {
                  const nextCourse = e.target.value as MathCourse;
                  setCourse(nextCourse); setUnit(''); setQuestionPage(1); setMode('unit'); setTimedActive(false); setTimedExpired(false);
                  const next = questions.find(q => q.subject === nextCourse);
                  if (next) {
                    setCurrent(next); setAnswer(''); setShowResult(false);
                    questionStartedAt.current = Date.now();
                  }
                }} className={'w-full rounded-xl px-3 py-3 text-sm font-bold ' + field}>
                  {COURSES.map(value => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label className="block"><span className={'mb-1.5 block text-xs font-bold ' + muted}>単元</span>
                <select value={unit} onChange={e => {
                  const nextUnit = e.target.value;
                  setUnit(nextUnit); setQuestionPage(1); setMode('unit'); setTimedActive(false); setTimedExpired(false);
                  const next = questions.find(q => q.subject === course && (!nextUnit || q.unit === nextUnit));
                  if (next) {
                    setCurrent(next); setAnswer(''); setShowResult(false);
                    questionStartedAt.current = Date.now();
                  }
                }} className={'w-full rounded-xl px-3 py-3 text-sm font-bold ' + field}>
                  <option value="">すべての単元</option>{units.map(value => <option key={value}>{value}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setMode('unit'); setTimedActive(false); setTimedExpired(false); nextQuestion(current?.id); }} className={mode === 'unit' ? primary : secondary}><BookOpen size={15} />単元順に解く</button>
              <button type="button" onClick={() => { setMode('random'); setTimedActive(false); setTimedExpired(false); nextQuestion(current?.id); }} className={mode === 'random' ? primary : secondary}><Shuffle size={15} />ランダム演習</button>
              <button type="button" onClick={startTimedPractice} className={mode === 'timed' && timedActive ? primary : secondary}><Clock3 size={15} />15分チャレンジ</button>
            </div>

            <div className={'mt-4 rounded-2xl border p-3 sm:p-4 ' + (dark ? 'border-slate-700 bg-slate-950/70' : 'border-slate-200 bg-slate-50/80')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h3 className="text-sm font-black">演習問題一覧から選ぶ</h3><p className={'mt-0.5 text-[10px] ' + muted}>問題を検索して、好きな問題を直接開けます。</p></div>
                <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-[10px] font-black text-cyan-700 dark:text-cyan-300">{searchedQuestions.length.toLocaleString('ja-JP')}問</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
                <label className="relative block">
                  <span className="sr-only">問題を検索</span>
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={questionSearch} onChange={event => { setQuestionSearch(event.target.value); setQuestionPage(1); }} placeholder="問題名・本文・単元で検索…" className={'w-full rounded-xl py-2.5 pl-9 pr-3 text-xs ' + field} />
                </label>
                <select value={difficultyFilter} onChange={event => { setDifficultyFilter(event.target.value as typeof difficultyFilter); setQuestionPage(1); }} className={'w-full rounded-xl px-3 py-2.5 text-xs font-bold ' + field} aria-label="難易度で絞り込む">
                  <option value="all">すべての難易度</option><option value="basic">基礎</option><option value="normal">標準</option><option value="challenge">発展</option>
                </select>
              </div>
              {questionPageData.items.length === 0 ? (
                <div className={'mt-3 rounded-xl border border-dashed p-5 text-center text-xs ' + muted}>条件に一致する問題がありません。検索語や単元を変更してください。</div>
              ) : (
                <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1" aria-label="選択できる演習問題">
                  {questionPageData.items.map((q,index) => <button key={q.id} type="button" onClick={() => {
                    setMode('unit');
                    setTimedActive(false);
                    setTimedExpired(false);
                    setMockActive(false);
                    openQuestion(q);
                  }} aria-current={current?.id === q.id ? 'true' : undefined} className={'w-full rounded-xl border p-3 text-left transition hover:border-cyan-500 hover:shadow-sm ' + (current?.id === q.id ? (dark ? 'border-cyan-500 bg-cyan-950/40' : 'border-cyan-500 bg-cyan-50') : (dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'))}>
                    <div className="flex items-start gap-3">
                      <span className={'mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-lg px-1 text-[10px] font-black ' + (dark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600')}>{questionPageData.start + index + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-cyan-700 dark:text-cyan-300"><span>{q.subject}</span><span>·</span><span>{q.unit}</span><span>·</span><span>{q.difficulty === 'challenge' ? '発展' : q.difficulty === 'normal' ? '標準' : '基礎'}</span></span>
                        <span className="mt-1 block truncate text-xs font-black">{q.title || 'タイトルなし'}</span>
                        <span className={'mt-1 block line-clamp-2 text-[11px] leading-5 ' + muted}>{q.prompt}</span>
                      </span>
                      <span className="mt-1 shrink-0 text-[10px] font-black text-cyan-700 dark:text-cyan-300">{current?.id === q.id ? '選択中' : 'この問題を開く'}</span>
                    </div>
                  </button>)}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className={'text-[10px] ' + muted}>{searchedQuestions.length ? (questionPageData.start + 1) + '〜' + questionPageData.end + '問目を表示' : '0問'}</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setQuestionPage(page => Math.max(1, page - 1))} disabled={questionPageData.page <= 1} className={secondary + ' px-3 py-1.5 text-xs'}>前へ</button>
                  <span className={'text-[10px] font-bold ' + muted}>{questionPageData.page} / {questionPageData.pageCount}</span>
                  <button type="button" onClick={() => setQuestionPage(page => Math.min(questionPageData.pageCount, page + 1))} disabled={questionPageData.page >= questionPageData.pageCount} className={secondary + ' px-3 py-1.5 text-xs'}>次へ</button>
                </div>
              </div>
            </div>

            {loading ? <div className={'py-16 text-center text-sm ' + muted}>問題データを読み込んでいます…</div> : !current ? (
              <div className={'mt-5 rounded-2xl p-8 text-center ' + (dark ? 'bg-slate-800' : 'bg-slate-50')}><BookOpen size={32} className="mx-auto text-cyan-700" /><p className="mt-3 font-black">この範囲の問題はありません</p></div>
            ) : (
              <div className={'mt-5 rounded-2xl border p-4 sm:p-6 ' + (dark ? 'border-slate-700 bg-slate-950' : 'border-slate-100 bg-slate-50')}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-800">{current.subject}</span>
                  <span className={'rounded-full px-3 py-1 text-xs font-bold ' + (dark ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-600')}>{current.unit}</span>
                  <span className={'rounded-full px-3 py-1 text-xs font-bold ' + (current.difficulty === 'challenge' ? 'bg-violet-100 text-violet-700' : current.difficulty === 'normal' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}>{current.difficulty === 'challenge' ? '発展' : current.difficulty === 'normal' ? '標準' : '基礎'}</span>
                  <span className={'ml-auto text-[10px] font-semibold ' + muted}>{current.title}</span>
                </div>
                <div className="mt-5 text-[11px] font-black tracking-[0.18em] text-cyan-700">QUESTION</div>
                <div className="mt-2 whitespace-pre-wrap text-lg font-bold leading-9 sm:text-xl">{current.prompt}</div>

                {current.question_type === 'multiple_choice' ? (
                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    {(current.options || []).map((option, index) => {
                      const selected = answer === option.id;
                      return <button key={option.id} type="button" disabled={showResult} onClick={() => setAnswer(option.id)}
                        className={'rounded-xl border p-3 text-left text-sm font-bold transition ' + (selected ? 'border-cyan-600 bg-cyan-50 text-cyan-900 ring-2 ring-cyan-500/20' : (dark ? 'border-slate-700 bg-slate-900 text-slate-200' : 'border-slate-200 bg-white text-slate-700'))}>
                        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-slate-200/70 text-xs">{String.fromCharCode(65 + index)}</span>{option.text}
                      </button>;
                    })}
                  </div>
                ) : (
                  <label className="mt-6 block"><span className="mb-2 block text-sm font-black">あなたの解答</span>
                    <input type="text" inputMode="decimal" value={answer} onChange={e => setAnswer(e.target.value)} disabled={showResult || timedExpired}
                      placeholder="答えを入力（整数・小数・分数）"
                      className={'w-full rounded-2xl px-4 py-3 text-base outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 ' + field} />
                  </label>
                )}

                {!showResult ? <button type="button" onClick={() => void submitAnswer()} disabled={!answer.trim() || saving || timedExpired} className={primary + ' mt-5 w-full sm:w-auto'}>
                  <CheckCircle2 size={17} />{saving ? '採点・保存中…' : mockActive ? 'この問題を解答する' : '答え合わせ'}
                </button> : (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className={'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-black ' + (lastCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800')}>{lastCorrect ? <CheckCircle2 size={16} /> : <XCircle size={16} />}{lastCorrect ? '正解！' : 'もう一歩'}</span>
                    {!mockActive && <button type="button" onClick={goNext} className={primary}>次の問題 <ArrowRight size={16} /></button>}
                  </div>
                )}
                {showResult && (
                  <div className={'mt-4 rounded-2xl border p-4 ' + (dark ? 'border-slate-700 bg-slate-900' : 'border-cyan-100 bg-white')}>
                    <div className="text-xs font-black tracking-wider text-cyan-700">ANSWER & EXPLANATION</div>
                    <div className="mt-2 text-base font-black">正答：{gradingResult?.question_type === 'multiple_choice' ? gradingResult.correct_option_text : (gradingResult?.correct_answer || '正答データを確認できません')}</div>
                    <p className={'mt-3 whitespace-pre-wrap text-sm leading-7 ' + muted}>{gradingResult?.explanation || '解説が登録されていません。'}</p>
                    {gradingResult?.is_graded && <div className={'mt-3 rounded-xl px-3 py-2 text-xs font-black ' + (gradingResult.xp_awarded > 0 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-slate-500/10 ' + muted)}>
                      {gradingResult.xp_awarded > 0
                        ? '知識XP +' + gradingResult.xp_awarded + (gradingResult.replayed ? '（この回答で付与済み）' : ' 獲得')
                        : gradingResult.already_awarded ? 'この問題の初回正解XPは獲得済みです' : 'この問題は知識XPの追加付与対象外です'}
                    </div>}
                  </div>
                )}
                <details className={'mt-4 rounded-xl border p-3 text-xs ' + (dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white')}>
                  <summary className="cursor-pointer font-bold">出典・利用情報</summary>
                  <div className={'mt-2 space-y-2 leading-6 ' + muted}>
                    <div><span className="font-bold">登録された出典：</span>{current.source_name || '未登録'}</div>
                    {current.source_license && <div><span className="font-bold">ライセンス：</span>{current.source_license}</div>}
                    {current.source_attribution && <p>{current.source_attribution}</p>}
                    {current.source_url && <a href={current.source_url} target="_blank" rel="noreferrer" className="font-bold text-cyan-700 underline">出典ページを開く</a>}
                  </div>
                </details>
              </div>
            )}
            <div className={'mt-4 flex flex-wrap items-center justify-between gap-2 text-xs ' + muted}>
              <span>選択中の範囲：{selectedQuestions.length.toLocaleString('ja-JP')}問</span>
              <span>正答・解説つきの公開問題を利用しています。</span>
            </div>
          </section>

          <aside className="space-y-4">
            <section className={'p-5 ' + panel}>
              <div className="flex items-center gap-2"><Trophy className="text-amber-500" size={18} /><h3 className="font-black">学習状況</h3></div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className={'rounded-2xl p-3 ' + (dark ? 'bg-slate-800' : 'bg-slate-50')}><div className={'text-[11px] font-bold ' + muted}>解答数</div><div className="mt-1 text-2xl font-black">{attempts.length}</div></div>
                <div className={'rounded-2xl p-3 ' + (dark ? 'bg-slate-800' : 'bg-slate-50')}><div className={'text-[11px] font-bold ' + muted}>解いた問題</div><div className="mt-1 text-2xl font-black">{uniqueSolved}</div></div>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm"><span className={muted}>正答率</span><strong className="text-xl">{accuracy}%</strong></div>
              <div className={'mt-2 h-2 overflow-hidden rounded-full ' + (dark ? 'bg-slate-700' : 'bg-slate-100')}><div className="h-full rounded-full bg-emerald-500" style={{ width: accuracy + '%' }} /></div>
              <button type="button" onClick={() => setSection('dashboard')} className={secondary + ' mt-4 w-full'}>学習レポートを見る <ArrowRight size={15} /></button>
            </section>
            <section className={'p-5 ' + panel}>
              <div className="flex items-center gap-2"><RotateCcw className="text-rose-500" size={18} /><h3 className="font-black">復習が必要な問題</h3></div>
              <p className={'mt-2 text-sm leading-6 ' + muted}>最新の解答が不正解になっている問題を自動で集めます。正解できた問題は一覧から外れます。</p>
              <div className="mt-3 text-3xl font-black">{mistakeQuestions.length}<span className={'ml-1 text-xs ' + muted}>問</span></div>
              <button type="button" onClick={startReview} className={secondary + ' mt-3 w-full'} disabled={!mistakeQuestions.length}>間違えた問題を復習</button>
            </section>
            <section className={'p-5 ' + panel}>
              <div className="flex items-center gap-2"><Timer className="text-cyan-600" size={18} /><h3 className="font-black">模擬試験</h3></div>
              <p className={'mt-2 text-sm leading-6 ' + muted}>選択科目から10問・20分の試験を行い、終了時に採点結果を確認できます。</p>
              <button type="button" onClick={startMock} className={primary + ' mt-3 w-full'}>模擬試験を開始 <ArrowRight size={15} /></button>
            </section>
          </aside>
        </div>
      )}

      {section === 'review' && (
        <section className={'p-4 sm:p-6 ' + panel}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className={'text-xs font-bold tracking-wider ' + muted}>REVIEW QUEUE</div><h2 className="mt-1 text-xl font-black">間違えた問題</h2><p className={'mt-1 text-sm ' + muted}>各問題の最新の解答結果で判定しています。</p></div>
            <button type="button" onClick={startReview} disabled={!mistakeQuestions.length} className={primary}><RotateCcw size={16} />復習を始める</button>
          </div>
          {loading ? <p className={'py-10 text-center ' + muted}>履歴を読み込み中…</p> : mistakeQuestions.length === 0 ? (
            <div className={'mt-5 rounded-2xl p-8 text-center ' + (dark ? 'bg-slate-800' : 'bg-emerald-50')}><CheckCircle2 size={34} className="mx-auto text-emerald-500" /><h3 className="mt-3 font-black">復習待ちの問題はありません</h3><p className={'mt-1 text-sm ' + muted}>演習で間違えた問題は、ここに自動で追加されます。</p></div>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {mistakeQuestions.map(q => <button key={q.id} type="button" onClick={() => startReviewItem(q)} className={'rounded-2xl border p-4 text-left transition hover:border-cyan-500 ' + (dark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-white')}>
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-black text-cyan-700">{q.subject} · {q.unit}</span><span className={'text-[10px] ' + muted}>{q.difficulty}</span></div>
                <div className="mt-2 line-clamp-2 text-sm font-bold leading-6">{q.prompt}</div>
                <div className="mt-3 flex items-center justify-between"><span className="text-xs font-semibold text-rose-600">復習対象</span><span className="text-xs font-bold text-cyan-700">解き直す →</span></div>
              </button>)}
            </div>
          )}
        </section>
      )}

      {section === 'dashboard' && (
        <div className="space-y-5">
          <section className={'p-5 sm:p-6 ' + panel}>
            <div className="flex items-center justify-between gap-3"><div><div className={'text-xs font-bold tracking-wider ' + muted}>LEARNING ANALYTICS</div><h2 className="mt-1 text-xl font-black">学習レポート</h2></div><button type="button" onClick={() => void loadData()} className={secondary}><History size={15} />更新</button></div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[['解答数', attempts.length + '問'], ['正答率', accuracy + '%'], ['解いた問題', uniqueSolved + '問'], ['復習対象', mistakeQuestions.length + '問']].map(([label, value]) => <div key={label} className={'rounded-2xl p-4 ' + (dark ? 'bg-slate-800' : 'bg-slate-50')}><div className={'text-xs font-bold ' + muted}>{label}</div><div className="mt-2 text-2xl font-black">{value}</div></div>)}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {courseCounts.map(item => <div key={item.name} className={'flex items-center justify-between rounded-xl px-3 py-2 ' + (dark ? 'bg-slate-800' : 'bg-slate-50')}><span className="text-sm font-bold">{item.name}</span><strong>{item.count}問</strong></div>)}
            </div>
          </section>
          <section className={'p-5 sm:p-6 ' + panel}>
            <h3 className="font-black">単元ごとの正答率</h3>
            {unitStats.length === 0 ? <p className={'mt-3 text-sm ' + muted}>問題を解くと、単元別の結果が表示されます。</p> : <div className="mt-4 space-y-4">
              {unitStats.map(stat => <div key={stat.name}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="font-bold">{stat.name}</span><span className={'text-xs font-semibold ' + muted}>{stat.correct}/{stat.total} · {stat.rate}%</span></div>
                <div className={'h-2.5 overflow-hidden rounded-full ' + (dark ? 'bg-slate-700' : 'bg-slate-100')}><div className={'h-full rounded-full ' + (stat.rate >= 80 ? 'bg-emerald-500' : stat.rate >= 50 ? 'bg-amber-500' : 'bg-rose-500')} style={{ width: stat.rate + '%' }} /></div>
              </div>)}
            </div>}
          </section>
          <section className={'p-5 sm:p-6 ' + panel}>
            <h3 className="font-black">最近の解答履歴</h3>
            {attempts.length === 0 ? <p className={'mt-3 text-sm ' + muted}>まだ解答履歴はありません。</p> : <div className="mt-3 divide-y divide-slate-200/50">
              {attempts.slice(0, 12).map(item => {
                const q = questions.find(candidate => candidate.id === item.question_id);
                return <div key={item.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0"><div className="truncate font-bold">{q?.title || item.unit} · {item.course}</div><div className={'mt-0.5 text-xs ' + muted}>{new Date(item.created_at).toLocaleString('ja-JP')}</div></div>
                  <span className={'shrink-0 rounded-full px-2.5 py-1 text-xs font-black ' + (item.is_correct ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800')}>{item.is_correct ? '正解' : '不正解'}</span>
                </div>;
              })}
            </div>}
          </section>
        </div>
      )}

      {section === 'mock' && (
        <section className={'p-4 sm:p-6 ' + panel}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className={'text-xs font-bold tracking-wider ' + muted}>MOCK EXAMINATION</div><h2 className="mt-1 text-xl font-black">数学 模擬試験</h2><p className={'mt-1 text-sm ' + muted}>{course}・全10問・制限時間20分</p></div>
            {mockActive && <div className="inline-flex items-center gap-2 rounded-xl bg-rose-100 px-4 py-2 text-lg font-black text-rose-700"><Clock3 size={18} />{clock(remaining)}</div>}
          </div>
          {mockSummary ? (
            <div className="mt-5 rounded-3xl bg-gradient-to-br from-cyan-950 to-blue-900 p-7 text-center text-white">
              <Trophy size={38} className="mx-auto text-amber-300" /><div className="mt-3 text-sm font-bold text-cyan-100">試験結果</div>
              <div className="mt-2 text-5xl font-black">{mockSummary.score}<span className="mx-1 text-2xl">/</span>{mockSummary.total}</div>
              <div className="mt-2 text-sm text-cyan-100">正答率 {percent(mockSummary.score, mockSummary.total)}% · 所要 {clock(mockSummary.elapsed)}</div>
              <button type="button" onClick={startMock} className={button + ' mt-5 bg-white text-cyan-900'}>もう一度受験する <RotateCcw size={16} /></button>
            </div>
          ) : !mockActive ? (
            <div className={'mt-5 rounded-2xl p-7 text-center ' + (dark ? 'bg-slate-800' : 'bg-slate-50')}>
              <GraduationCap size={36} className="mx-auto text-cyan-700" /><h3 className="mt-3 font-black">実戦形式で力試し</h3><p className={'mx-auto mt-2 max-w-lg text-sm leading-6 ' + muted}>選択中の科目から10問をランダムに出題します。解答は1問ごとに採点・保存され、終了後に結果を確認できます。</p>
              <button type="button" onClick={startMock} className={primary + ' mt-4'}>模擬試験を開始</button>
            </div>
          ) : (
            <>
              <div className="mt-5 flex items-center justify-between text-sm"><span className="font-bold">第 {mockIndex + 1} 問 / {mockQueue.length} 問</span><span className={muted}>正解 {mockAnswers.filter(item => item.isCorrect).length} 問</span></div>
              <div className={'mt-2 h-2 overflow-hidden rounded-full ' + (dark ? 'bg-slate-700' : 'bg-slate-100')}><div className="h-full rounded-full bg-cyan-600" style={{ width: ((mockIndex + 1) / mockQueue.length * 100) + '%' }} /></div>
              {current && <div className={'mt-5 rounded-2xl border p-5 ' + (dark ? 'border-slate-700 bg-slate-950' : 'border-slate-100 bg-slate-50')}>
                <div className="text-xs font-black text-cyan-700">{current.subject} · {current.unit} · {current.title}</div>
                <p className="mt-3 whitespace-pre-wrap text-lg font-bold leading-9">{current.prompt}</p>
                {current.question_type === 'multiple_choice' ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{(current.options || []).map((option, index) => <button key={option.id} type="button" onClick={() => setAnswer(option.id)} className={'rounded-xl border p-3 text-left text-sm font-bold ' + (answer === option.id ? 'border-cyan-600 bg-cyan-50 text-cyan-900' : field)}><span className="mr-2">{String.fromCharCode(65 + index)}.</span>{option.text}</button>)}</div> : <label className="mt-5 block"><span className="mb-2 block text-sm font-black">解答</span><input value={answer} onChange={e => setAnswer(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void submitAnswer(); }} className={'w-full rounded-xl px-4 py-3 text-base ' + field} placeholder="答えを入力" /></label>}
                <button type="button" onClick={() => void submitAnswer()} disabled={!answer.trim() || saving} className={primary + ' mt-4'}>解答を確定する</button>
              </div>}
            </>
          )}
        </section>
      )}

      <footer className={'px-4 py-4 text-xs leading-6 ' + panel}>
        <div className="font-black">問題データについて</div>
        <p className={'mt-1 ' + muted}>現在はSupabaseの公開済み数学問題バンクを利用しています。科目別件数：{courseCounts.map(item => item.name + ' ' + item.count + '問').join(' / ')}。出典・ライセンスの表示は問題レコードに登録された情報に従います。</p>
        <p className={'mt-1 ' + muted}>学習履歴と模試結果はログイン中のアカウントに紐づけて保存されます。ほかの生徒の履歴は表示されません。</p>
      </footer>
    </div>
  );
}
