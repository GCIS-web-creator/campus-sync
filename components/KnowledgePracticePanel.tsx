'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, Brain, Calculator, CheckCircle2, ChevronLeft,
  ChevronRight, CircleAlert, Clock3, FileText, Filter, Loader2, RefreshCw,
  Search, Sparkles, Trophy,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Option = { id: string; text: string };
type QuestionType = 'multiple_choice' | 'numeric' | 'written';
type Difficulty = 'normal' | 'advanced' | 'challenge';
type Question = {
  id: string;
  subject: string;
  subject_code: string | null;
  unit: string;
  title: string;
  prompt: string;
  question_type: QuestionType;
  options: Option[];
  difficulty: Difficulty;
  target_class: string;
  source_name: string;
  source_url: string | null;
  source_license: string | null;
  source_attribution: string | null;
};
type Attempt = {
  id: string;
  question_id: string;
  selected_option_id: string | null;
  selected_answer: string | null;
  is_correct: boolean;
  is_graded: boolean;
  xp_awarded: number;
  attempted_at: string;
};
type GradingResult = {
  is_correct: boolean;
  is_graded: boolean;
  xp_awarded: number;
  already_awarded: boolean;
  question_type: QuestionType;
  correct_option_id: string | null;
  correct_option_text: string | null;
  correct_answer: string | null;
  explanation: string;
  replayed: boolean;
};
type PendingAttempt = {
  questionId: string;
  attemptId: string;
  selectedOptionId: string | null;
  selectedAnswer: string | null;
};
type LoadOverrides = { page?: number };

const PAGE_SIZE = 18;
const SUBJECT_FILTERS = [
  { value: '', label: 'すべての教科' },
  { value: 'math1', label: '数学I' },
  { value: 'matha', label: '数学A' },
  { value: 'math2', label: '数学II' },
  { value: 'mathb', label: '数学B' },
  { value: 'math3', label: '数学III' },
  { value: 'mathc', label: '数学C' },
];
const DIFFICULTY: Record<Difficulty, { label: string; xp: number; tone: string }> = {
  normal: { label: '基礎', xp: 2, tone: 'border-sky-400/30 bg-sky-400/10 text-sky-700 dark:text-sky-300' },
  advanced: { label: '応用', xp: 4, tone: 'border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-300' },
  challenge: { label: '発展', xp: 6, tone: 'border-violet-400/30 bg-violet-400/10 text-violet-700 dark:text-violet-300' },
};

export default function KnowledgePracticePanel({ isDarkMode = false }: { isDarkMode?: boolean }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [masteredIds, setMasteredIds] = useState<string[]>([]);
  const [knowledgeXp, setKnowledgeXp] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [pending, setPending] = useState<PendingAttempt | null>(null);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');

  const dark = isDarkMode;
  const panel = dark ? 'border-slate-700/80 bg-slate-900/90 text-white' : 'border-slate-200 bg-white text-slate-900';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const subtle = dark ? 'border-slate-700 bg-slate-800/80' : 'border-slate-200 bg-slate-50';
  const input = dark
    ? 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400'
    : 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-500';

  const load = useCallback(async (overrides: LoadOverrides = {}) => {
    const nextPage = overrides.page ?? page;
    setLoading(true);
    setError('');
    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const token = authData.session?.access_token;
      if (authError || !token) throw new Error('ログイン状態を確認してください。');

      const params = new URLSearchParams({
        page: String(nextPage),
        page_size: String(PAGE_SIZE),
      });
      if (subjectFilter) params.set('subject', subjectFilter);
      if (unitFilter.trim()) params.set('unit', unitFilter.trim());
      if (difficultyFilter) params.set('difficulty', difficultyFilter);

      const response = await fetch('/api/knowledge-practice?' + params.toString(), {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || '知識問題を読み込めませんでした。');

      const rows = Array.isArray(payload.questions) ? payload.questions as Question[] : [];
      const pagination = payload.pagination || {};
      setQuestions(rows);
      setAttempts(Array.isArray(payload.attempts) ? payload.attempts as Attempt[] : []);
      setMasteredIds(Array.isArray(payload.masteredQuestionIds) ? payload.masteredQuestionIds as string[] : []);
      setKnowledgeXp(Number(payload.knowledgeXp || 0));
      setPage(Number(pagination.page || nextPage));
      setTotalPages(Math.max(1, Number(pagination.totalPages || 1)));
      setTotalCount(Number(pagination.totalCount || 0));
      setSelectedId(current => current && rows.some(row => row.id === current) ? current : (rows[0]?.id || ''));
      setSelectedOptionId('');
      setAnswerText('');
      setPending(null);
      setResult(null);
      setMessage('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '知識問題を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, [page, subjectFilter, unitFilter, difficultyFilter]);

  useEffect(() => { void load({ page: 1 }); }, []);

  const selected = useMemo(
    () => questions.find(question => question.id === selectedId) || null,
    [questions, selectedId],
  );
  const masteredSet = useMemo(() => new Set(masteredIds), [masteredIds]);
  const correctCount = masteredIds.length;
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCount);
  const currentPending = pending?.questionId === selectedId ? pending : null;

  const chooseQuestion = (questionId: string) => {
    if (pending || submitting) return;
    setSelectedId(questionId);
    setSelectedOptionId('');
    setAnswerText('');
    setResult(null);
    setError('');
    setMessage('');
  };

  const submit = async () => {
    if (!selected || submitting || result) return;
    if (selected.question_type === 'multiple_choice' && !selectedOptionId) {
      setError('選択肢を選んでから解答してください。');
      return;
    }
    if (selected.question_type !== 'multiple_choice' && !answerText.trim()) {
      setError('解答を入力してください。');
      return;
    }

    const selectedAnswer = selected.question_type === 'multiple_choice' ? null : answerText.trim();
    const selectedChoice = selected.question_type === 'multiple_choice' ? selectedOptionId : null;
    const request = currentPending || {
      questionId: selected.id,
      attemptId: crypto.randomUUID(),
      selectedOptionId: selectedChoice,
      selectedAnswer,
    };

    if (currentPending && (
      currentPending.selectedOptionId !== selectedChoice ||
      currentPending.selectedAnswer !== selectedAnswer
    )) {
      setError('通信再試行中は、最初に送信した同じ解答を使用してください。');
      return;
    }

    setPending(request);
    setSubmitting(true);
    setError('');
    setMessage('');
    setResult(null);

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
          selected_option_id: request.selectedOptionId,
          selected_answer: request.selectedAnswer,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success || !payload.result) {
        throw new Error(payload.message || '回答を採点できませんでした。');
      }

      const graded = payload.result as GradingResult;
      setResult(graded);
      setKnowledgeXp(Number(payload.knowledgeXp || 0));
      if (graded.is_graded && graded.is_correct) {
        setMasteredIds(current => current.includes(selected.id) ? current : [...current, selected.id]);
      }
      setAttempts(current => [{
        id: request.attemptId,
        question_id: request.questionId,
        selected_option_id: request.selectedOptionId,
        selected_answer: request.selectedAnswer,
        is_correct: graded.is_correct,
        is_graded: graded.is_graded,
        xp_awarded: graded.xp_awarded,
        attempted_at: new Date().toISOString(),
      }, ...current].slice(0, 200));
      setPending(null);
      setMessage(!graded.is_graded
        ? '記述式の解答を保存しました。模範解答と照らし合わせて確認してください。'
        : graded.xp_awarded > 0
          ? '初回正解！知識XPを獲得しました。'
          : graded.is_correct
            ? '正解です。この問題の知識XPは獲得済みです。'
            : '回答を記録しました。解説を確認しましょう。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '回答を送信できませんでした。');
      setMessage('通信に失敗しました。最初に入力した解答を同じ送信IDで再送信できます。');
    } finally {
      setSubmitting(false);
    }
  };

  const resetAnswer = () => {
    setResult(null);
    setPending(null);
    setSelectedOptionId('');
    setAnswerText('');
    setError('');
    setMessage('');
  };

  if (loading && questions.length === 0) {
    return <div className={panel + ' flex min-h-64 items-center justify-center gap-3 rounded-3xl border p-8'}>
      <Loader2 size={20} className="animate-spin text-cyan-500"/>問題を準備しています…
    </div>;
  }

  return <div className="space-y-5">
    <header className="relative isolate overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-5 text-white shadow-xl shadow-cyan-950/10 sm:p-7">
      <div className="pointer-events-none absolute -right-12 -top-16 size-64 rounded-full bg-cyan-400/10 blur-3xl"/>
      <div className="pointer-events-none absolute -bottom-24 left-1/3 size-64 rounded-full bg-blue-500/10 blur-3xl"/>
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black tracking-[.22em] text-cyan-300"><Brain size={13}/> CAMPUSSYNC LEARNING</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">数学問題演習</h2>
          <p className="mt-2 max-w-xl text-xs leading-6 text-slate-300 sm:text-sm">自分のペースで解いて、解説まで確認。小さな積み重ねを知識の成長につなげよう。</p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
          <Sparkles size={18} className="text-cyan-300"/>
          <div><p className="text-[10px] font-bold text-slate-300">知識XP</p><p className="text-xl font-black tabular-nums">{knowledgeXp.toLocaleString('ja-JP')}</p></div>
        </div>
      </div>
      <div className="relative mt-5 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[.06] p-3">
          <p className="text-[10px] font-bold text-slate-300">公開問題</p>
          <p className="mt-1 text-xl font-black tabular-nums">{totalCount.toLocaleString('ja-JP')}<span className="ml-1 text-[10px] text-slate-300">問</span></p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[.06] p-3">
          <p className="text-[10px] font-bold text-slate-300">正解済み</p>
          <p className="mt-1 text-xl font-black tabular-nums">{correctCount.toLocaleString('ja-JP')}<span className="ml-1 text-[10px] text-slate-300">問</span></p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[.06] p-3">
          <p className="text-[10px] font-bold text-slate-300">最近の回答</p>
          <p className="mt-1 text-xl font-black tabular-nums">{attempts.length.toLocaleString('ja-JP')}<span className="ml-1 text-[10px] text-slate-300">件</span></p>
        </div>
      </div>
    </header>

    <section className={panel + ' rounded-2xl border p-4 sm:p-5'}>
      <div className="mb-3 flex items-center gap-2">
        <Filter size={16} className="text-cyan-500"/>
        <h3 className="text-sm font-black">問題を探す</h3>
        <span className={'ml-auto text-[10px] ' + muted}>全{totalCount.toLocaleString('ja-JP')}問から検索</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="block space-y-1">
          <span className={'text-[10px] font-bold ' + muted}>教科</span>
          <select className={input} value={subjectFilter} onChange={event => setSubjectFilter(event.target.value)}>
            {SUBJECT_FILTERS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className={'text-[10px] font-bold ' + muted}>単元</span>
          <input className={input} value={unitFilter} onChange={event => setUnitFilter(event.target.value)} placeholder="例：微分法、ベクトル"/>
        </label>
        <label className="block space-y-1">
          <span className={'text-[10px] font-bold ' + muted}>難易度</span>
          <select className={input} value={difficultyFilter} onChange={event => setDifficultyFilter(event.target.value)}>
            <option value="">すべて</option><option value="normal">基礎</option><option value="advanced">応用</option><option value="challenge">発展</option>
          </select>
        </label>
        <button type="button" onClick={() => void load({ page: 1 })} disabled={loading}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl bg-cyan-600 px-5 py-2.5 text-xs font-black text-white transition hover:bg-cyan-500 disabled:opacity-50">
          {loading ? <Loader2 size={15} className="animate-spin"/> : <Search size={15}/>}検索
        </button>
      </div>
    </section>

    {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-200"><CircleAlert size={14} className="mr-1 inline"/>{error}</div>}
    {message && <div role="status" className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-xs font-bold text-cyan-800 dark:text-cyan-200">{message}</div>}

    {totalCount === 0 ? <section className={panel + ' rounded-3xl border border-dashed p-10 text-center'}>
      <BookOpen size={34} className={'mx-auto ' + muted}/>
      <h3 className="mt-3 text-base font-black">条件に合う問題はまだありません</h3>
      <p className={'mt-2 text-xs leading-6 ' + muted}>教科や単元の条件を変えるか、Adminから問題が公開されるのをお待ちください。</p>
      <button type="button" onClick={() => { setSubjectFilter(''); setUnitFilter(''); setDifficultyFilter(''); void load({ page: 1 }); }}
        className="mt-4 rounded-xl border border-cyan-500/30 px-4 py-2 text-xs font-black text-cyan-600">条件をリセット</button>
    </section> : <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className={panel + ' min-w-0 rounded-3xl border p-4 shadow-sm sm:p-6'}>
        {selected ? <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-cyan-500/10 px-3 py-1.5 text-[10px] font-black text-cyan-700 dark:text-cyan-300">{selected.subject}</span>
            <span className={'rounded-lg border px-3 py-1.5 text-[10px] font-bold ' + DIFFICULTY[selected.difficulty].tone}>{DIFFICULTY[selected.difficulty].label} · 初回正解 +{DIFFICULTY[selected.difficulty].xp} XP</span>
            <span className={'rounded-lg border px-3 py-1.5 text-[10px] font-bold ' + subtle}>{selected.question_type === 'multiple_choice' ? '選択式' : selected.question_type === 'numeric' ? '数値入力' : '記述式'}</span>
            {masteredSet.has(selected.id) && <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold text-emerald-600"><CheckCircle2 size={12}/>正解済み</span>}
          </div>
          <div className="mt-5 flex items-start justify-between gap-3">
            <div>
              <p className={'text-[10px] font-bold ' + muted}>{selected.unit || '単元未設定'}</p>
              <h3 className="mt-1 text-xl font-black leading-8 tracking-tight">{selected.title}</h3>
            </div>
            <div className="hidden shrink-0 rounded-2xl bg-cyan-500/10 p-3 text-cyan-600 sm:block">
              {selected.question_type === 'numeric' ? <Calculator size={22}/> : selected.question_type === 'written' ? <FileText size={22}/> : <BookOpen size={22}/>}
            </div>
          </div>

          <div className={'mt-5 rounded-2xl border p-4 sm:p-5 ' + subtle}>
            <p className={'mb-2 text-[10px] font-black tracking-[.12em] ' + muted}>QUESTION</p>
            <div className="whitespace-pre-wrap break-words text-[15px] leading-8">{selected.prompt}</div>
          </div>

          {selected.question_type === 'multiple_choice' ? <div className="mt-5 space-y-2.5">
            <p className={'text-xs font-black ' + muted}>正しいと思う選択肢を選んでください</p>
            {selected.options.map((option, index) => {
              const chosen = selectedOptionId === option.id;
              const correct = result?.correct_option_id === option.id;
              return <button key={option.id} type="button"
                disabled={submitting || Boolean(currentPending) || Boolean(result)}
                onClick={() => setSelectedOptionId(option.id)}
                className={'group flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left text-sm transition ' +
                  (correct ? 'border-emerald-500 bg-emerald-500/10' :
                    chosen ? 'border-cyan-500 bg-cyan-500/10 shadow-sm shadow-cyan-500/10' :
                      dark ? 'border-slate-700 bg-slate-800/70 hover:border-cyan-500/60' : 'border-slate-200 bg-white hover:border-cyan-400')}>
                <span className={'flex size-9 shrink-0 items-center justify-center rounded-xl text-xs font-black ' +
                  (chosen || correct ? 'bg-cyan-600 text-white' : dark ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-600')}>{String.fromCharCode(65 + index)}</span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap leading-6">{option.text}</span>
                {chosen && !result && <span className="size-4 rounded-full border-[5px] border-cyan-500"/>}
                {correct && <CheckCircle2 size={18} className="shrink-0 text-emerald-500"/>}
              </button>;
            })}
          </div> : <div className="mt-5 space-y-2">
            <label className={'text-xs font-black ' + muted}>{selected.question_type === 'numeric' ? '数値で解答してください' : '途中式や考え方を入力してください'}</label>
            {selected.question_type === 'numeric'
              ? <input type="text" inputMode="decimal" className={input + ' min-h-14 text-lg font-semibold tabular-nums'} value={answerText}
                  onChange={event => setAnswerText(event.target.value)} disabled={Boolean(result) || Boolean(currentPending) || submitting}
                  placeholder="例：0.5、-2、3.14"/>
              : <textarea className={input + ' min-h-40 resize-y leading-7'} value={answerText}
                  onChange={event => setAnswerText(event.target.value)} disabled={Boolean(result) || Boolean(currentPending) || submitting}
                  placeholder="式の変形や考え方も含めて、自分の言葉で書いてみましょう。"/>}
          </div>}

          {!result && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-500/10 pt-4">
            <p className={'text-[10px] leading-5 ' + muted}>
              {selected.question_type === 'written' ? '記述式は自分で模範解答と照合します。XPは付きません。' : '回答後に正誤と解説が表示されます。'}
            </p>
            {currentPending && error
              ? <button type="button" onClick={() => void submit()} disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-5 py-3 text-xs font-black text-white disabled:opacity-50">
                  {submitting ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}同じ解答を再送信
                </button>
              : <button type="button" onClick={() => void submit()} disabled={submitting || (selected.question_type === 'multiple_choice' ? !selectedOptionId : !answerText.trim())}
                  className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-3 text-xs font-black text-white shadow-lg shadow-cyan-900/10 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
                  {submitting ? <Loader2 size={15} className="animate-spin"/> : <CheckCircle2 size={15}/>}解答を送信
                </button>}
          </div>}

          {result && <div className={'mt-5 rounded-2xl border p-4 sm:p-5 ' +
            (!result.is_graded ? 'border-sky-400/30 bg-sky-500/5' :
              result.is_correct ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5')}>
            <div className="flex flex-wrap items-center gap-2">
              {!result.is_graded ? <FileText size={19} className="text-sky-500"/> :
                result.is_correct ? <CheckCircle2 size={19} className="text-emerald-500"/> : <CircleAlert size={19} className="text-amber-500"/>}
              <h4 className="font-black">{!result.is_graded ? '模範解答を確認しましょう' : result.is_correct ? '正解です！' : '今回は不正解です'}</h4>
              {result.xp_awarded > 0 && <span className="ml-auto inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-black text-emerald-600"><Sparkles size={13}/>+{result.xp_awarded} XP</span>}
            </div>
            {(result.correct_option_text || result.correct_answer) && <div className="mt-3 rounded-xl border border-current/10 bg-white/40 p-3 dark:bg-slate-950/30">
              <p className="text-[10px] font-black opacity-70">模範解答</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-7">{result.correct_option_text || result.correct_answer}</p>
            </div>}
            {result.explanation && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{result.explanation}</p>}
            {!result.is_graded && <p className="mt-2 text-[10px] leading-5 opacity-70">この形式は自動採点されず、知識XPの対象外です。</p>}
            <button type="button" onClick={resetAnswer} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-current/20 px-4 py-2.5 text-xs font-black transition hover:bg-current/5">
              <RefreshCw size={13}/>もう一度解く
            </button>
          </div>}

          <div className={'mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-500/10 pt-4 text-[10px] ' + muted}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {selected.source_url ? <a href={selected.source_url} target="_blank" rel="noopener noreferrer" className="font-bold text-cyan-600 underline decoration-cyan-500/30 underline-offset-2">{selected.source_name || '出典を確認'}</a> : <span>{selected.source_name || 'CampusSync'}</span>}
              {selected.source_license && <span>{selected.source_license}</span>}
            </div>
            <span className="inline-flex items-center gap-1"><Clock3 size={12}/>自分のペースで進めよう</span>
          </div>
          {selected.source_attribution && <p className={'mt-2 text-[9px] leading-5 ' + muted}>{selected.source_attribution}</p>}
        </> : <div className="py-12 text-center">
          <BookOpen size={30} className={'mx-auto ' + muted}/>
          <p className={'mt-3 text-sm ' + muted}>このページにはまだ問題がありません。</p>
        </div>}
      </section>

      <aside className="space-y-4">
        <section className={panel + ' rounded-3xl border p-4'}>
          <div className="flex items-center justify-between gap-2">
            <div><p className={'text-[10px] font-bold ' + muted}>QUESTION BANK</p><h3 className="mt-1 text-sm font-black">問題一覧</h3></div>
            <span className={'text-[10px] font-bold tabular-nums ' + muted}>{rangeStart}–{rangeEnd} / {totalCount}</span>
          </div>
          <div className="mt-4 space-y-2">
            {questions.map((question, index) => <button key={question.id} type="button"
              onClick={() => chooseQuestion(question.id)} disabled={Boolean(pending) || submitting}
              className={'w-full rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ' +
                (selectedId === question.id
                  ? 'border-cyan-500 bg-cyan-500/10 shadow-sm shadow-cyan-500/10'
                  : dark ? 'border-slate-700 bg-slate-800/50 hover:border-slate-500' : 'border-slate-200 bg-white hover:border-cyan-300')}>
              <div className="flex items-center gap-2">
                <span className={'flex size-6 shrink-0 items-center justify-center rounded-lg text-[9px] font-black ' +
                  (selectedId === question.id ? 'bg-cyan-600 text-white' : dark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-500')}>{String((page - 1) * PAGE_SIZE + index + 1).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1 truncate text-[10px] font-bold">{question.unit}</span>
                {masteredSet.has(question.id) && <CheckCircle2 size={14} className="shrink-0 text-emerald-500"/>}
              </div>
              <p className="mt-2 line-clamp-2 text-xs font-black leading-5">{question.title}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className={'text-[9px] ' + muted}>{question.subject}</span>
                <span className={'text-[9px] font-bold ' + muted}>{DIFFICULTY[question.difficulty].label}</span>
              </div>
            </button>)}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-500/10 pt-3">
            <button type="button" onClick={() => void load({ page: Math.max(1, page - 1) })} disabled={page <= 1 || loading || Boolean(pending)}
              className={'inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-[10px] font-bold disabled:opacity-30 ' + subtle}>
              <ChevronLeft size={13}/>前へ
            </button>
            <span className={'text-[10px] font-bold tabular-nums ' + muted}>{page} / {totalPages}</span>
            <button type="button" onClick={() => void load({ page: Math.min(totalPages, page + 1) })} disabled={page >= totalPages || loading || Boolean(pending)}
              className={'inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-[10px] font-bold disabled:opacity-30 ' + subtle}>
              次へ<ChevronRight size={13}/>
            </button>
          </div>
        </section>

        <section className={panel + ' rounded-3xl border p-4'}>
          <h3 className="flex items-center gap-2 text-sm font-black"><Trophy size={16} className="text-amber-500"/>知識XPのルール</h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(['normal', 'advanced', 'challenge'] as const).map(level => <div key={level} className={'rounded-xl border p-2 text-center ' + DIFFICULTY[level].tone}>
              <p className="text-[9px] font-bold">{DIFFICULTY[level].label}</p><p className="mt-1 text-sm font-black">+{DIFFICULTY[level].xp}</p>
            </div>)}
          </div>
          <p className={'mt-3 text-[10px] leading-5 ' + muted}>自動採点できる問題の初回正解だけがXP対象です。再挑戦でも学習履歴は残ります。記述式は模範解答との自己確認形式です。</p>
        </section>
      </aside>
    </div>}
  </div>;
}
