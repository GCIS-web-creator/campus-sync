'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Brain, CheckCircle2, CircleAlert, Loader2, RefreshCw, Sparkles, Trophy } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Option = { id: string; text: string };
type Question = {
  id: string;
  subject: string;
  title: string;
  prompt: string;
  options: Option[];
  difficulty: 'normal' | 'advanced' | 'challenge';
  target_class: string;
};
type Attempt = {
  id: string;
  question_id: string;
  selected_option_id: string;
  is_correct: boolean;
  xp_awarded: number;
  attempted_at: string;
};
type GradingResult = {
  is_correct: boolean;
  xp_awarded: number;
  already_awarded: boolean;
  correct_option_id: string;
  correct_option_text: string;
  explanation: string;
  replayed: boolean;
};
type PendingAttempt = { questionId: string; attemptId: string; optionId: string };

const DIFFICULTY: Record<Question['difficulty'], { label: string; xp: number; tone: string }> = {
  normal: { label: '基礎', xp: 2, tone: 'bg-sky-500/10 text-sky-600 border-sky-500/20' },
  advanced: { label: '応用', xp: 4, tone: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  challenge: { label: '発展', xp: 6, tone: 'bg-violet-500/10 text-violet-600 border-violet-500/20' },
};

export default function KnowledgePracticePanel({ isDarkMode = false }: { isDarkMode?: boolean }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [masteredIds, setMasteredIds] = useState<string[]>([]);
  const [knowledgeXp, setKnowledgeXp] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [pending, setPending] = useState<PendingAttempt | null>(null);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const dark = isDarkMode;
  const panel = dark ? 'border-slate-700 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const subtle = dark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const token = authData.session?.access_token;
      if (authError || !token) throw new Error('ログイン状態を確認してください。');
      const response = await fetch('/api/knowledge-practice', {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || '知識問題を読み込めませんでした。');
      const rows = Array.isArray(payload.questions) ? payload.questions as Question[] : [];
      setQuestions(rows);
      setAttempts(Array.isArray(payload.attempts) ? payload.attempts as Attempt[] : []);
      setMasteredIds(Array.isArray(payload.masteredQuestionIds) ? payload.masteredQuestionIds as string[] : []);
      setKnowledgeXp(Number(payload.knowledgeXp || 0));
      setSelectedId(current => current && rows.some(row => row.id === current) ? current : (rows[0]?.id || ''));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '知識問題を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => questions.find(question => question.id === selectedId) || null, [questions, selectedId]);
  const masteredSet = useMemo(() => new Set(masteredIds), [masteredIds]);
  const currentPending = pending?.questionId === selectedId ? pending : null;
  const currentResult = result;
  const correctCount = useMemo(() => masteredIds.length, [masteredIds]);

  const submit = async (optionId: string) => {
    if (!selected || submitting || (currentPending && currentPending.optionId !== optionId)) return;
    const request = currentPending || {
      questionId: selected.id,
      attemptId: crypto.randomUUID(),
      optionId,
    };
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
          selected_option_id: request.optionId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success || !payload.result) throw new Error(payload.message || '回答を採点できませんでした。');
      const graded = payload.result as GradingResult;
      setResult(graded);
      setKnowledgeXp(Number(payload.knowledgeXp || 0));
      if (graded.is_correct) setMasteredIds(current => current.includes(selected.id) ? current : [...current, selected.id]);
      setAttempts(current => [{
        id: request.attemptId,
        question_id: request.questionId,
        selected_option_id: request.optionId,
        is_correct: graded.is_correct,
        xp_awarded: graded.xp_awarded,
        attempted_at: new Date().toISOString(),
      }, ...current].slice(0, 200));
      setPending(null);
      setMessage(graded.xp_awarded > 0
        ? '初回正解！知識XPを獲得しました。'
        : graded.is_correct ? '正解です。この問題の知識XPは獲得済みです。' : '回答を記録しました。解説を確認しましょう。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '回答を送信できませんでした。');
      setMessage('通信に失敗しました。選択した回答を同じ送信IDで再試行できます。');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className={panel + ' flex min-h-56 items-center justify-center gap-2 rounded-2xl border p-6'}><Loader2 size={18} className="animate-spin text-cyan-600"/>問題を読み込んでいます…</div>;

  return <div className="space-y-4">
    <header className={'flex flex-wrap items-end justify-between gap-3 rounded-2xl border p-4 ' + panel}>
      <div>
        <p className="text-[10px] font-black tracking-[.2em] text-cyan-600">KNOWLEDGE XP · PRACTICE</p>
        <h2 className="mt-1 flex items-center gap-2 text-xl font-black"><Brain size={22} className="text-cyan-600"/>知識問題</h2>
        <p className={'mt-1 text-xs ' + muted}>正解して理解を確認すると、研究・知識の成長につながります。</p>
      </div>
      <button type="button" onClick={() => void load()} className={'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ' + subtle}><RefreshCw size={14}/>更新</button>
    </header>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <section className={'rounded-2xl border p-4 ' + panel}><p className={'text-[10px] font-bold ' + muted}>知識XP</p><p className="mt-1 text-2xl font-black tabular-nums text-cyan-600">{knowledgeXp.toLocaleString('ja-JP')}</p></section>
      <section className={'rounded-2xl border p-4 ' + panel}><p className={'text-[10px] font-bold ' + muted}>正解した問題</p><p className="mt-1 text-2xl font-black tabular-nums">{correctCount}<span className={'ml-1 text-xs font-bold ' + muted}>問</span></p></section>
      <section className={'col-span-2 rounded-2xl border p-4 sm:col-span-1 ' + panel}><p className={'text-[10px] font-bold ' + muted}>回答履歴</p><p className="mt-1 text-2xl font-black tabular-nums">{attempts.length}<span className={'ml-1 text-xs font-bold ' + muted}>件</span></p></section>
    </div>

    {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800"><CircleAlert size={14} className="mr-1 inline"/>{error}</div>}
    {message && <div role="status" className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs font-bold text-cyan-700 dark:text-cyan-300">{message}</div>}

    {questions.length === 0 ? <section className={'rounded-2xl border border-dashed p-8 text-center ' + panel}>
      <BookOpen size={30} className={'mx-auto ' + muted}/>
      <h3 className="mt-3 font-black">現在公開中の知識問題はありません</h3>
      <p className={'mt-2 text-xs ' + muted}>先生・Adminが問題を公開すると、ここに表示されます。</p>
    </section> : <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className={'rounded-2xl border p-4 sm:p-5 ' + panel}>
        {selected ? <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-[10px] font-black text-cyan-700 dark:text-cyan-300">{selected.subject}</span>
            <span className={'rounded-full border px-3 py-1 text-[10px] font-bold ' + DIFFICULTY[selected.difficulty].tone}>{DIFFICULTY[selected.difficulty].label} ・ 初回正解 +{DIFFICULTY[selected.difficulty].xp} XP</span>
            {masteredSet.has(selected.id) && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-600"><CheckCircle2 size={12}/>知識XP獲得済み</span>}
          </div>
          <h3 className="mt-4 text-lg font-black leading-7">{selected.title}</h3>
          <p className={'mt-3 whitespace-pre-wrap text-sm leading-7 ' + (dark ? 'text-slate-200' : 'text-slate-700')}>{selected.prompt}</p>
          <div className="mt-5 space-y-2">
            {selected.options.map((option, index) => {
              const isPendingChoice = currentPending?.optionId === option.id;
              const isCorrectChoice = currentResult?.correct_option_id === option.id;
              return <button key={option.id} type="button"
                disabled={submitting || Boolean(currentPending && !isPendingChoice) || Boolean(currentResult)}
                onClick={() => void submit(option.id)}
                className={'flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-75 ' +
                  (isCorrectChoice ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' :
                    isPendingChoice ? 'border-cyan-500 bg-cyan-500/10' :
                      dark ? 'border-slate-700 bg-slate-800 hover:border-cyan-500' : 'border-slate-200 bg-slate-50 hover:border-cyan-500')}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-500/10 text-xs">{String.fromCharCode(65 + index)}</span>
                <span className="flex-1">{option.text}</span>
                {isPendingChoice && submitting && <Loader2 size={15} className="animate-spin text-cyan-600"/>}
                {isCorrectChoice && <CheckCircle2 size={17}/>}
              </button>;
            })}
          </div>
          {currentPending && error && <button type="button" onClick={() => void submit(currentPending.optionId)} disabled={submitting} className="mt-3 rounded-xl bg-cyan-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">同じ回答を再送信</button>}
          {currentResult && <div className={'mt-4 rounded-2xl border p-4 ' + (currentResult.is_correct ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5')}>
            <div className="flex items-center gap-2 font-black">
              {currentResult.is_correct ? <CheckCircle2 className="text-emerald-600" size={18}/> : <CircleAlert className="text-amber-600" size={18}/>}
              {currentResult.is_correct ? '正解です' : '今回は不正解です'}
              {currentResult.xp_awarded > 0 && <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-600"><Sparkles size={14}/>+{currentResult.xp_awarded} XP</span>}
            </div>
            <p className="mt-2 text-xs leading-5"><b>正解：</b>{currentResult.correct_option_text}</p>
            {currentResult.explanation && <p className="mt-2 whitespace-pre-wrap text-xs leading-6">{currentResult.explanation}</p>}
            <button type="button" onClick={() => { setResult(null); setMessage(''); setError(''); }} className="mt-3 rounded-lg border border-current/20 px-3 py-1.5 text-xs font-bold">もう一度確認する</button>
          </div>}
        </> : <p className={'text-sm ' + muted}>左の問題一覧から選択してください。</p>}
      </section>

      <aside className="space-y-3">
        <section className={'rounded-2xl border p-3 ' + panel}>
          <h3 className="flex items-center gap-2 text-sm font-black"><BookOpen size={16} className="text-cyan-600"/>問題一覧</h3>
          <div className="mt-3 space-y-2">
            {questions.map(question => <button key={question.id} type="button" onClick={() => { if (!pending) { setSelectedId(question.id); setResult(null); setMessage(''); setError(''); } }} disabled={Boolean(pending)}
              className={'w-full rounded-xl border p-3 text-left disabled:opacity-60 ' + (selectedId === question.id ? 'border-cyan-500 bg-cyan-500/10' : subtle)}>
              <span className="flex items-center justify-between gap-2 text-[10px] font-bold"><span>{question.subject}</span>{masteredSet.has(question.id) ? <CheckCircle2 size={13} className="text-emerald-600"/> : <span className={muted}>{DIFFICULTY[question.difficulty].label}</span>}</span>
              <span className="mt-1 block text-xs font-black leading-5">{question.title}</span>
            </button>)}
          </div>
        </section>
        <section className={'rounded-2xl border p-3 ' + panel}>
          <h3 className="flex items-center gap-2 text-sm font-black"><Trophy size={16} className="text-amber-500"/>獲得ルール</h3>
          <p className={'mt-2 text-xs leading-6 ' + muted}>基礎は2XP、応用は4XP、発展は6XP。各問題の初回正解だけが対象です。同じ問題を何度解いても追加XPは増えません。</p>
          <p className={'mt-2 text-[10px] leading-5 ' + muted}>回答履歴は残ります。誤答や再挑戦は練習として利用できます。</p>
        </section>
      </aside>
    </div>}
  </div>;
}
