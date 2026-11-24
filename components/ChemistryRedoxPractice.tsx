'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronRight, Flame, FlaskConical, RotateCcw, Sparkles, Trophy, X, Zap } from 'lucide-react';

type LessonId = 'basics' | 'agents' | 'half' | 'acidic' | 'combine';
type RedoxQuestion = {
  id: string;
  lessonId: LessonId;
  title: string;
  instruction: string;
  parts: string[];
  answers: string[];
  options: string[];
  explanation: string;
  hint?: string;
};
type Attempt = { questionId: string; correct: boolean; at: string };
type Progress = { xp: number; attempts: Attempt[]; completedLessons: Record<string, number> };
type Screen = 'home' | 'session' | 'result';

const LESSONS: Array<{ id: LessonId; title: string; subtitle: string; level: string; tint: string }> = [
  { id: 'basics', title: '酸化・還元の基本', subtitle: '電子の授受・酸化数の変化', level: 'LEVEL 1', tint: 'from-emerald-500 to-teal-600' },
  { id: 'agents', title: '酸化剤・還元剤', subtitle: '相手と自分の変化を見分ける', level: 'LEVEL 2', tint: 'from-cyan-500 to-sky-600' },
  { id: 'half', title: '半反応式の基本', subtitle: '電子を左右どちらに置く？', level: 'LEVEL 3', tint: 'from-blue-500 to-indigo-600' },
  { id: 'acidic', title: '酸性条件の半反応式', subtitle: 'H⁺・H₂O・電子で係数をそろえる', level: 'LEVEL 4', tint: 'from-violet-500 to-purple-600' },
  { id: 'combine', title: 'イオン反応式を完成', subtitle: '電子数をそろえて反応式を導く', level: 'LEVEL 5', tint: 'from-amber-500 to-orange-600' },
];

const QUESTIONS: RedoxQuestion[] = [
  { id: 'b01', lessonId: 'basics', title: '酸化の定義', instruction: '酸化とは、物質が電子をどうする反応？', parts: ['酸化とは、物質が電子を', '反応。'], answers: ['失う'], options: ['失う', '受け取る', '共有する', '変えない'], explanation: '酸化は電子を失う反応。電子を失うと、酸化数は増加します。' },
  { id: 'b02', lessonId: 'basics', title: '還元の定義', instruction: '還元とは、物質が電子をどうする反応？', parts: ['還元とは、物質が電子を', '反応。'], answers: ['受け取る'], options: ['失う', '受け取る', '放出する', '変えない'], explanation: '還元は電子を受け取る反応。電子を受け取ると、酸化数は減少します。' },
  { id: 'b03', lessonId: 'basics', title: '酸化数の変化', instruction: '酸化が起こると、酸化数はどう変化する？', parts: ['酸化が起こると、酸化数は', 'する。'], answers: ['増加'], options: ['増加', '減少', '必ず0', '変化しない'], explanation: '電子を失うほど、形式的な正の電荷が大きくなるため、酸化数は増加します。' },
  { id: 'b04', lessonId: 'basics', title: '還元と酸化数', instruction: '還元が起こると、酸化数はどう変化する？', parts: ['還元が起こると、酸化数は', 'する。'], answers: ['減少'], options: ['増加', '減少', '必ず+1', '変化しない'], explanation: '還元では電子を受け取るため、酸化数は減少します。' },
  { id: 'b05', lessonId: 'basics', title: '単体の酸化数', instruction: '単体をつくる元素の酸化数は？', parts: ['単体をつくる元素の酸化数は、', 'である。'], answers: ['0'], options: ['0', '+1', '-1', '+2'], explanation: 'Fe、O₂、H₂、Cl₂など、単体中の元素の酸化数は0です。' },
  { id: 'b06', lessonId: 'basics', title: '酸素の酸化数', instruction: '通常、化合物中の酸素の酸化数は？', parts: ['通常、化合物中の酸素の酸化数は', 'である。'], answers: ['-2'], options: ['-2', '-1', '+1', '+2'], explanation: '酸素の酸化数は通常−2です。ただし過酸化水素 H₂O₂ などでは−1になります。' },
  { id: 'b07', lessonId: 'basics', title: '過酸化水素の酸化数', instruction: 'H₂O₂では、酸素の酸化数は例外的にいくつ？', parts: ['H₂O₂中の酸素の酸化数は', 'である。'], answers: ['-1'], options: ['-1', '-2', '0', '+1'], explanation: '過酸化物では酸素の酸化数は−1です。H₂O₂は代表例です。' },

  { id: 'a01', lessonId: 'agents', title: '酸化剤のはたらき', instruction: '酸化剤は、相手から電子をどうする物質？', parts: ['酸化剤は、相手から電子を', '物質。'], answers: ['受け取る'], options: ['受け取る', '奪われる', '放出する', '共有しない'], explanation: '酸化剤は相手を酸化し、自分自身は電子を受け取って還元されます。' },
  { id: 'a02', lessonId: 'agents', title: '還元剤のはたらき', instruction: '還元剤は、相手に電子をどうする物質？', parts: ['還元剤は、相手に電子を', '物質。'], answers: ['与える'], options: ['与える', '受け取る', '奪われる', '保存するだけの'], explanation: '還元剤は相手を還元し、自分自身は電子を失って酸化されます。' },
  { id: 'a03', lessonId: 'agents', title: '酸化剤自身の変化', instruction: '反応の前後で、酸化剤自身はどうなる？', parts: ['酸化剤自身は反応によって', 'される。'], answers: ['還元'], options: ['還元', '酸化', '中和', '沈殿'], explanation: '酸化剤は電子を受け取る側なので、自分自身は還元されます。' },
  { id: 'a04', lessonId: 'agents', title: '還元剤自身の変化', instruction: '反応の前後で、還元剤自身はどうなる？', parts: ['還元剤自身は反応によって', 'される。'], answers: ['酸化'], options: ['還元', '酸化', '中和', '分解'], explanation: '還元剤は電子を与える側なので、自分自身は酸化されます。' },
  { id: 'a05', lessonId: 'agents', title: 'マグネシウムの変化', instruction: '2Mg + O₂ → 2MgO。Mgの酸化数は0からいくつに変化？', parts: ['Mgの酸化数は0から', 'に変化する。'], answers: ['+2'], options: ['+2', '-2', '+1', '0'], explanation: 'MgOではOが−2なので、Mgは+2。Mgは電子を失い、酸化されています。' },
  { id: 'a06', lessonId: 'agents', title: '酸化剤を見つける', instruction: 'Zn + Cu²⁺ → Zn²⁺ + Cu。酸化剤はどれ？', parts: ['この反応の酸化剤は', 'である。'], answers: ['Cu²⁺'], options: ['Cu²⁺', 'Zn', 'Zn²⁺', 'Cu'], explanation: 'Cu²⁺は電子を受け取ってCuになるため、酸化剤です。' },

  { id: 'h01', lessonId: 'half', title: '鉄(II)イオンの酸化', instruction: 'Fe²⁺がFe³⁺になる半反応式を完成しよう。', parts: ['Fe²⁺ → Fe³⁺ + ', ''], answers: ['e⁻'], options: ['e⁻', '2e⁻', 'H⁺', 'H₂O'], explanation: 'Fe²⁺は電子を1個失ってFe³⁺になります。電子は生成物側（右辺）です。' },
  { id: 'h02', lessonId: 'half', title: 'ヨウ化物イオンの酸化', instruction: '2I⁻ → I₂ の半反応式。係数を入れよう。', parts: ['', 'I⁻ → I₂ + ', 'e⁻'], answers: ['2', '2'], options: ['2', '1', '3', '4', '2'], explanation: 'ヨウ素原子をそろえるため左辺は2I⁻。電荷をそろえるため右辺に2e⁻を置きます。' },
  { id: 'h03', lessonId: 'half', title: '塩素の還元', instruction: 'Cl₂がCl⁻になる半反応式を完成しよう。', parts: ['Cl₂ + ', 'e⁻ → ', 'Cl⁻'], answers: ['2', '2'], options: ['2', '1', '4', '2'], explanation: 'Cl₂には塩素原子が2個あるので右辺は2Cl⁻。電荷を合わせるため左辺に2e⁻です。' },
  { id: 'h04', lessonId: 'half', title: '銅(II)イオンの還元', instruction: 'Cu²⁺がCuになる半反応式を完成しよう。', parts: ['Cu²⁺ + ', ' → Cu'], answers: ['2e⁻'], options: ['2e⁻', 'e⁻', 'H⁺', 'H₂O'], explanation: 'Cu²⁺が電荷0のCuになるには、電子を2個受け取ります。' },
  { id: 'h05', lessonId: 'half', title: '酸化半反応式', instruction: '酸化では電子は半反応式のどちら側に書く？', parts: ['酸化半反応式では、電子を', 'に書く。'], answers: ['右辺'], options: ['右辺', '左辺', '両辺', '書かない'], explanation: '酸化は電子を失う反応なので、電子は生成物側の右辺に書きます。' },
  { id: 'h06', lessonId: 'half', title: '還元半反応式', instruction: '還元では電子は半反応式のどちら側に書く？', parts: ['還元半反応式では、電子を', 'に書く。'], answers: ['左辺'], options: ['右辺', '左辺', '両辺', '書かない'], explanation: '還元は電子を受け取る反応なので、電子は反応物側の左辺に書きます。' },

  { id: 'c01', lessonId: 'acidic', title: '過マンガン酸イオンの還元', instruction: '酸性条件で MnO₄⁻ が Mn²⁺ になる半反応式を完成。', parts: ['MnO₄⁻ + ', ' + ', ' → Mn²⁺ + ', ''], answers: ['8H⁺', '5e⁻', '4H₂O'], options: ['8H⁺', '5e⁻', '4H₂O', '4H⁺', '2e⁻', '8H₂O'], explanation: '酸素原子4個を右辺に4H₂Oでそろえ、水素原子8個を左辺に8H⁺でそろえます。最後に電荷を合わせると5e⁻です。' },
  { id: 'c02', lessonId: 'acidic', title: '二クロム酸イオンの還元', instruction: '酸性条件で Cr₂O₇²⁻ が Cr³⁺ になる半反応式を完成。', parts: ['Cr₂O₇²⁻ + ', ' + ', ' → 2Cr³⁺ + ', ''], answers: ['14H⁺', '6e⁻', '7H₂O'], options: ['14H⁺', '6e⁻', '7H₂O', '7H⁺', '3e⁻', '14H₂O'], explanation: '酸素7個に合わせて右辺に7H₂O、水素14個に合わせて左辺に14H⁺。電荷を合わせると6e⁻です。' },
  { id: 'c03', lessonId: 'acidic', title: '過酸化水素の還元', instruction: '酸性条件で H₂O₂ が水になる半反応式を完成。', parts: ['H₂O₂ + ', ' + ', ' → ', ''], answers: ['2H⁺', '2e⁻', '2H₂O'], options: ['2H⁺', '2e⁻', '2H₂O', '4H⁺', '4e⁻', 'H₂O'], explanation: 'H₂O₂の酸素は−1から−2へ変化します。HとOをそろえた後、電荷をそろえると2e⁻です。' },
  { id: 'c04', lessonId: 'acidic', title: '酸素の還元', instruction: '酸性条件で O₂ が水になる半反応式を完成。', parts: ['O₂ + ', ' + ', ' → ', ''], answers: ['4H⁺', '4e⁻', '2H₂O'], options: ['4H⁺', '4e⁻', '2H₂O', '2H⁺', '2e⁻', 'H₂O'], explanation: 'O₂の酸素原子2個に合わせて2H₂O。水素4個に4H⁺、電荷をそろえて4e⁻です。' },
  { id: 'c05', lessonId: 'acidic', title: '水の酸化', instruction: '水が酸素になる酸化半反応式を完成。', parts: ['2H₂O → O₂ + ', ' + ', ''], answers: ['4H⁺', '4e⁻'], options: ['4H⁺', '4e⁻', '2H⁺', '2e⁻', 'H₂O₂'], explanation: '2H₂OからO₂をつくると、水素4個と電荷を合わせるため右辺に4H⁺と4e⁻ができます。' },
  { id: 'c06', lessonId: 'acidic', title: '酸性条件で酸素をそろえる', instruction: '酸性条件で、酸素原子の数を合わせるために加えるものは？', parts: ['酸素原子の数を合わせるには、不足する側に', 'を加える。'], answers: ['H₂O'], options: ['H₂O', 'H⁺', 'e⁻', 'O₂'], explanation: '酸性条件の半反応式では、まずH₂Oを加えて酸素原子をそろえ、その後H⁺で水素原子をそろえます。' },
  { id: 'c07', lessonId: 'acidic', title: '酸性条件で水素をそろえる', instruction: '酸性条件で、水素原子の数を合わせるために加えるものは？', parts: ['水素原子の数を合わせるには、不足する側に', 'を加える。'], answers: ['H⁺'], options: ['H⁺', 'H₂O', 'e⁻', 'OH⁻'], explanation: '酸素をH₂Oで合わせた後、水素原子をH⁺で合わせ、最後に電子で電荷をそろえます。' },

  { id: 'f01', lessonId: 'combine', title: '鉄(II)イオンと過マンガン酸イオン', instruction: '酸性条件での全体のイオン反応式。係数を完成させよう。', parts: ['', 'Fe²⁺ + MnO₄⁻ + 8H⁺ → ', 'Fe³⁺ + Mn²⁺ + ', 'H₂O'], answers: ['5', '5', '4'], options: ['5', '4', '2', '1', '5', '7', '4'], explanation: 'Fe²⁺の酸化を5倍して電子を5個にそろえ、MnO₄⁻の還元半反応式と加えます。電子は相殺されます。' },
  { id: 'f02', lessonId: 'combine', title: 'ヨウ化物イオンと塩素', instruction: 'I⁻ + Cl₂ → I₂ + Cl⁻ の係数を完成させよう。', parts: ['', 'I⁻ + Cl₂ → I₂ + ', 'Cl⁻'], answers: ['2', '2'], options: ['2', '1', '3', '4', '2'], explanation: 'I原子をそろえるため左辺を2I⁻にし、Cl原子をそろえるため右辺を2Cl⁻にします。' },
  { id: 'f03', lessonId: 'combine', title: 'アルミニウムと銅(II)イオン', instruction: 'Al + Cu²⁺ → Al³⁺ + Cu の係数を完成させよう。', parts: ['', 'Al + ', 'Cu²⁺ → ', 'Al³⁺ + ', 'Cu'], answers: ['2', '3', '2', '3'], options: ['2', '3', '1', '6', '2', '3'], explanation: 'Alは1個あたり3e⁻を失い、Cu²⁺は1個あたり2e⁻を受け取ります。電子数の最小公倍数6にそろえると2Alと3Cu²⁺です。' },
  { id: 'f04', lessonId: 'combine', title: 'アルミニウムの電子数', instruction: '2Al → 2Al³⁺ + ?。失われる電子の合計は？', parts: ['2Al → 2Al³⁺ + ', ''], answers: ['6e⁻'], options: ['6e⁻', '2e⁻', '3e⁻', '4e⁻'], explanation: 'Al原子1個は3e⁻を失います。2個なら合計6e⁻です。' },
  { id: 'f05', lessonId: 'combine', title: '電子の相殺', instruction: '酸化半反応式と還元半反応式を加えたとき、電子はどうなる？', parts: ['2つの半反応式を加えると、電子は', 'される。'], answers: ['相殺'], options: ['相殺', '増加', '保存', '沈殿'], explanation: '酸化側で放出した電子と還元側で受け取る電子を同じ数にそろえてから加えると、電子は両辺で相殺されます。' },
  { id: 'f06', lessonId: 'combine', title: '酸化数から反応を判定', instruction: '酸化数が +6 から +3 に変化した元素は、酸化・還元のどちら？', parts: ['酸化数が+6から+3に減少したので、これは', 'である。'], answers: ['還元'], options: ['酸化', '還元', '中和', '加水分解'], explanation: '酸化数が減少した変化は還元です。酸化数の増加が酸化、減少が還元です。' },
];

const DEFAULT_PROGRESS: Progress = { xp: 0, attempts: [], completedLessons: {} };
const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export default function ChemistryRedoxPractice({ userId, isDarkMode = false }: { userId: string; isDarkMode?: boolean }) {
  const [screen, setScreen] = useState<Screen>('home');
  const [progress, setProgress] = useState<Progress>(DEFAULT_PROGRESS);
  const [progressReady, setProgressReady] = useState(false);
  const [sessionQuestions, setSessionQuestions] = useState<RedoxQuestion[]>([]);
  const [sessionLessonId, setSessionLessonId] = useState<LessonId | 'review'>('basics');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [filledSlots, setFilledSlots] = useState<Array<number | null>>([]);
  const [optionOrder, setOptionOrder] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [answerCorrect, setAnswerCorrect] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionStreak, setSessionStreak] = useState(0);
  const [hintOpen, setHintOpen] = useState(false);
  const [lastResult, setLastResult] = useState<{ title: string; correct: number; total: number } | null>(null);
  const [lessonNonce, setLessonNonce] = useState(0);

  const dark = isDarkMode;
  const panel = 'rounded-3xl border shadow-sm ' + (dark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900');
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const storageKey = 'campus-sync-redox-practice-v1:' + userId;

  useEffect(() => {
    setProgressReady(false);
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Progress>;
        setProgress({
          xp: Number.isFinite(parsed.xp) ? Math.max(0, Number(parsed.xp)) : 0,
          attempts: Array.isArray(parsed.attempts) ? parsed.attempts.filter((item): item is Attempt =>
            Boolean(item) && typeof item.questionId === 'string' && typeof item.correct === 'boolean' && typeof item.at === 'string'
          ).slice(-500) : [],
          completedLessons: parsed.completedLessons && typeof parsed.completedLessons === 'object' ? parsed.completedLessons as Record<string, number> : {},
        });
      } else {
        setProgress(DEFAULT_PROGRESS);
      }
    } catch {
      setProgress(DEFAULT_PROGRESS);
    } finally {
      setProgressReady(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!progressReady) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(progress)); } catch { /* Storage may be full or disabled. */ }
  }, [progress, progressReady, storageKey]);

  const latestByQuestion = useMemo(() => {
    const latest = new Map<string, Attempt>();
    progress.attempts.forEach(item => latest.set(item.questionId, item));
    return latest;
  }, [progress.attempts]);

  const mistakes = useMemo(() => QUESTIONS.filter(question => latestByQuestion.get(question.id)?.correct === false), [latestByQuestion]);
  const totalCorrect = progress.attempts.filter(item => item.correct).length;
  const accuracy = progress.attempts.length ? Math.round(totalCorrect / progress.attempts.length * 100) : 0;
  const currentQuestion = sessionQuestions[questionIndex] || null;
  const currentLesson = LESSONS.find(item => item.id === sessionLessonId);
  const sessionTitle = sessionLessonId === 'review' ? 'まちがえた問題の復習' : currentLesson?.title || '化学トレーニング';

  useEffect(() => {
    if (!currentQuestion) return;
    setFilledSlots(Array(currentQuestion.answers.length).fill(null));
    setOptionOrder(shuffle(currentQuestion.options.map((_, index) => index)));
    setSubmitted(false);
    setAnswerCorrect(false);
    setHintOpen(false);
  }, [currentQuestion?.id, lessonNonce]);

  const startSession = (lessonId: LessonId | 'review') => {
    const queue = lessonId === 'review'
      ? mistakes.slice().reverse()
      : QUESTIONS.filter(question => question.lessonId === lessonId);
    if (!queue.length) return;
    setSessionLessonId(lessonId);
    setSessionQuestions(queue);
    setQuestionIndex(0);
    setSessionCorrect(0);
    setSessionStreak(0);
    setLastResult(null);
    setLessonNonce(value => value + 1);
    setScreen('session');
  };

  const selectOption = (optionIndex: number) => {
    if (submitted || filledSlots.includes(optionIndex)) return;
    const nextEmpty = filledSlots.findIndex(value => value === null);
    if (nextEmpty < 0) return;
    setFilledSlots(previous => previous.map((value, index) => index === nextEmpty ? optionIndex : value));
  };

  const clearSlot = (slotIndex: number) => {
    if (submitted) return;
    setFilledSlots(previous => previous.map((value, index) => index === slotIndex ? null : value));
  };

  const checkAnswer = () => {
    if (!currentQuestion || submitted || filledSlots.some(value => value === null)) return;
    const correct = currentQuestion.answers.every((answer, index) =>
      filledSlots[index] !== null && currentQuestion.options[filledSlots[index] as number] === answer
    );
    setAnswerCorrect(correct);
    setSubmitted(true);
    setSessionCorrect(value => value + (correct ? 1 : 0));
    setSessionStreak(value => correct ? value + 1 : 0);
    const gainedXp = correct ? 10 + Math.min(sessionStreak + 1, 5) * 2 : 0;
    setProgress(previous => ({
      ...previous,
      xp: previous.xp + gainedXp,
      attempts: [...previous.attempts, { questionId: currentQuestion.id, correct, at: new Date().toISOString() }].slice(-500),
    }));
  };

  const nextQuestion = () => {
    if (questionIndex >= sessionQuestions.length - 1) {
      const title = sessionTitle;
      setLastResult({ title, correct: sessionCorrect, total: sessionQuestions.length });
      if (sessionLessonId !== 'review') {
        setProgress(previous => ({
          ...previous,
          completedLessons: { ...previous.completedLessons, [sessionLessonId]: Number(previous.completedLessons[sessionLessonId] || 0) + 1 },
        }));
      }
      setScreen('result');
      return;
    }
    setQuestionIndex(value => value + 1);
    setLessonNonce(value => value + 1);
  };

  const lessonStats = (lessonId: LessonId) => {
    const questions = QUESTIONS.filter(question => question.lessonId === lessonId);
    const mastered = questions.filter(question => latestByQuestion.get(question.id)?.correct === true).length;
    return { total: questions.length, mastered, percent: questions.length ? Math.round(mastered / questions.length * 100) : 0 };
  };

  if (screen === 'result' && lastResult) {
    const percent = lastResult.total ? Math.round(lastResult.correct / lastResult.total * 100) : 0;
    return (
      <div className="mx-auto w-full max-w-4xl space-y-5 pb-10">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-700 via-teal-700 to-cyan-800 p-6 text-white shadow-xl sm:p-8">
          <Trophy className="mx-auto text-amber-300" size={42} />
          <p className="mt-3 text-center text-xs font-black tracking-[0.2em] text-emerald-100">LESSON COMPLETE</p>
          <h2 className="mt-2 text-center text-2xl font-black">{lastResult.title}</h2>
          <div className="mt-6 text-center text-5xl font-black">{percent}<span className="ml-1 text-2xl">%</span></div>
          <p className="mt-2 text-center text-sm text-emerald-50">{lastResult.correct} / {lastResult.total} 問正解</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4 text-center"><div className="text-xs text-emerald-100">獲得XP</div><div className="mt-1 text-2xl font-black">+{lastResult.correct * 10}以上</div></div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4 text-center"><div className="text-xs text-emerald-100">累計XP</div><div className="mt-1 text-2xl font-black">{progress.xp.toLocaleString('ja-JP')}</div></div>
          </div>
        </section>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => startSession(sessionLessonId)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-5 py-3 text-sm font-black text-white hover:bg-cyan-600"><RotateCcw size={16} />もう一度挑戦</button>
          <button type="button" onClick={() => setScreen('home')} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"><ArrowLeft size={16} />レッスン一覧へ</button>
        </div>
      </div>
    );
  }

  if (screen === 'session' && currentQuestion) {
    const filledCount = filledSlots.filter(value => value !== null).length;
    const isLastQuestion = questionIndex === sessionQuestions.length - 1;
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 pb-10">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setScreen('home')} aria-label="レッスンを終了" className={'rounded-full p-2 ' + (dark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100')}><X size={22} /></button>
          <div className={'h-3 flex-1 overflow-hidden rounded-full ' + (dark ? 'bg-slate-800' : 'bg-slate-200')}>
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all" style={{ width: ((questionIndex + (submitted ? 1 : 0)) / sessionQuestions.length * 100) + '%' }} />
          </div>
          <span className="text-xs font-black text-emerald-600">{questionIndex + 1}/{sessionQuestions.length}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-black text-orange-600"><Flame size={14} />{sessionStreak}</span>
        </div>

        <section className={panel + ' overflow-hidden'}>
          <div className="border-b border-inherit p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black text-emerald-800">{sessionTitle}</span>
              <span className={'text-[11px] font-bold ' + muted}>{currentQuestion.title}</span>
            </div>
            <h2 className="mt-4 text-xl font-black leading-relaxed sm:text-2xl">{currentQuestion.instruction}</h2>
          </div>
          <div className="space-y-5 p-4 sm:p-6">
            <div className={'rounded-2xl border p-4 text-lg font-bold leading-[3.2rem] sm:p-6 sm:text-xl ' + (dark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50')}>
              {currentQuestion.parts.map((part, index) => (
                <React.Fragment key={index}>
                  <span className="whitespace-pre-wrap">{part}</span>
                  {index < currentQuestion.answers.length && (
                    <button type="button" onClick={() => clearSlot(index)} disabled={submitted} aria-label={'空欄' + (index + 1) + 'を消す'}
                      className={'mx-1 inline-flex min-h-10 min-w-16 items-center justify-center rounded-lg border-b-4 px-3 align-middle text-base font-black transition ' +
                        (filledSlots[index] !== null
                          ? 'border-emerald-600 bg-emerald-100 text-emerald-900'
                          : dark ? 'border-slate-600 bg-slate-800 text-slate-300' : 'border-slate-300 bg-white text-slate-400') +
                        (submitted ? ' cursor-default' : ' hover:border-cyan-500')}>
                      {filledSlots[index] === null ? '　　　' : currentQuestion.options[filledSlots[index] as number]}
                    </button>
                  )}
                </React.Fragment>
              ))}
            </div>

            {!submitted && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className={'text-xs font-bold ' + muted}>下のタイルをタップして空欄を埋めよう</p>
                  <span className="text-xs font-black text-emerald-600">{filledCount}/{currentQuestion.answers.length}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {optionOrder.map(optionIndex => {
                    const used = filledSlots.includes(optionIndex);
                    return (
                      <button key={optionIndex} type="button" onClick={() => selectOption(optionIndex)} disabled={used}
                        className={'min-h-12 rounded-xl border-b-4 px-4 py-2 text-base font-black transition ' +
                          (used
                            ? dark ? 'border-slate-800 bg-slate-800/60 text-slate-600' : 'border-slate-100 bg-slate-100 text-slate-300'
                            : dark ? 'border-slate-600 bg-slate-800 text-slate-100 hover:border-cyan-500 hover:bg-slate-700' : 'border-slate-200 bg-white text-slate-800 shadow-sm hover:border-cyan-400 hover:bg-cyan-50')}
                      >
                        {currentQuestion.options[optionIndex]}
                      </button>
                    );
                  })}
                </div>
                {currentQuestion.hint && (
                  <div>
                    <button type="button" onClick={() => setHintOpen(value => !value)} className="text-xs font-bold text-cyan-700 hover:underline">{hintOpen ? 'ヒントを閉じる' : 'ヒントを見る'}</button>
                    {hintOpen && <p className={'mt-2 rounded-xl p-3 text-sm ' + (dark ? 'bg-slate-800 text-slate-300' : 'bg-cyan-50 text-cyan-900')}>{currentQuestion.hint}</p>}
                  </div>
                )}
              </>
            )}

            {submitted && (
              <div role="status" className={'rounded-2xl border p-4 ' + (answerCorrect ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-rose-300 bg-rose-50 text-rose-950')}>
                <div className="flex items-center gap-2 font-black">
                  {answerCorrect ? <><CheckCircle2 size={20} />正解！ +XP</> : <><Flame size={20} />おしい！正答を確認しよう</>}
                </div>
                {!answerCorrect && <p className="mt-2 text-sm font-bold">正答：{currentQuestion.answers.join(' ／ ')}</p>}
                <p className="mt-2 text-sm leading-6">{currentQuestion.explanation}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-inherit pt-4">
              {!submitted ? (
                <>
                  <button type="button" onClick={() => setFilledSlots(Array(currentQuestion.answers.length).fill(null))} className={'rounded-xl px-3 py-2.5 text-xs font-bold ' + muted}>選択をクリア</button>
                  <button type="button" onClick={checkAnswer} disabled={filledCount !== currentQuestion.answers.length} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40">答え合わせ <ChevronRight size={16} /></button>
                </>
              ) : (
                <div className="ml-auto">
                  <button type="button" onClick={nextQuestion} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white hover:bg-emerald-600">{isLastQuestion ? '結果を見る' : '次の問題へ'} <ChevronRight size={16} /></button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-teal-900 to-cyan-900 p-5 text-white shadow-xl sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full border-[28px] border-white/5" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-100/10 px-3 py-1 text-xs font-black text-emerald-100"><FlaskConical size={14} /> CAMPUSSYNC CHEMISTRY LAB</div>
          <h1 className="mt-3 text-2xl font-black sm:text-3xl">酸化還元トレーニング</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">選択タイルをタップして空欄を完成。電子の授受から半反応式、イオン反応式まで段階的に練習できます。</p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3"><div className="text-[10px] font-bold text-emerald-100/70">CHEMISTRY XP</div><div className="mt-1 text-2xl font-black">{progress.xp.toLocaleString('ja-JP')}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3"><div className="text-[10px] font-bold text-emerald-100/70">回答数</div><div className="mt-1 text-2xl font-black">{progress.attempts.length}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3"><div className="text-[10px] font-bold text-emerald-100/70">正答率</div><div className="mt-1 text-2xl font-black">{accuracy}%</div></div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className={panel + ' p-4'}><div className={'text-xs font-bold ' + muted}>レッスン</div><div className="mt-1 text-2xl font-black">{LESSONS.length}<span className="ml-1 text-xs">コース</span></div></div>
        <div className={panel + ' p-4'}><div className={'text-xs font-bold ' + muted}>学習できる問題</div><div className="mt-1 text-2xl font-black">{QUESTIONS.length}<span className="ml-1 text-xs">問</span></div></div>
        <button type="button" onClick={() => startSession('review')} disabled={!mistakes.length} className={panel + ' p-4 text-left transition hover:border-rose-300 disabled:opacity-50'}>
          <div className="flex items-center justify-between"><div className={'text-xs font-bold ' + muted}>間違えた問題</div><RotateCcw size={17} className="text-rose-500" /></div>
          <div className="mt-1 text-2xl font-black">{mistakes.length}<span className="ml-1 text-xs">問</span></div>
          <div className="mt-1 text-[11px] font-bold text-rose-600">{mistakes.length ? '復習を始める →' : '復習対象はありません'}</div>
        </button>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className={'text-lg font-black ' + (dark ? 'text-slate-100' : 'text-slate-900')}>学習ルート</h2><p className={'mt-1 text-xs ' + muted}>基礎から順番に進めるのがおすすめです。</p></div>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700"><Zap size={14} />正解でXP獲得</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {LESSONS.map((lesson, index) => {
          const stats = lessonStats(lesson.id);
          const count = QUESTIONS.filter(question => question.lessonId === lesson.id).length;
          return (
            <button key={lesson.id} type="button" onClick={() => startSession(lesson.id)} className={panel + ' group overflow-hidden text-left transition hover:-translate-y-0.5 hover:shadow-md'}>
              <div className={'h-2 bg-gradient-to-r ' + lesson.tint} />
              <div className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className={'text-[10px] font-black tracking-widest ' + muted}>{lesson.level}</span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">{count}問</span>
                </div>
                <h3 className="mt-2 text-base font-black">{index + 1}. {lesson.title}</h3>
                <p className={'mt-1 text-xs ' + muted}>{lesson.subtitle}</p>
                <div className={'mt-4 h-2 overflow-hidden rounded-full ' + (dark ? 'bg-slate-800' : 'bg-slate-100')}><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: stats.percent + '%' }} /></div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className={'text-[11px] font-bold ' + muted}>{stats.mastered}/{stats.total}問 正解済み ・ 完了 {progress.completedLessons[lesson.id] || 0}回</span>
                  <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-700 group-hover:gap-2">開始する <ChevronRight size={15} /></span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className={'rounded-2xl border p-4 text-sm leading-6 ' + (dark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-emerald-100 bg-emerald-50 text-emerald-950')}>
        <div className="flex items-center gap-2 font-black"><Sparkles size={17} />このトレーニングの使い方</div>
        <p className="mt-2">問題文の空欄をタップして、下のタイルから答えを選びます。選んだタイルをもう一度タップすると取り消せます。答え合わせの後は、正誤だけでなく反応式の考え方も確認できます。</p>
        <p className="mt-1 text-xs opacity-75">学習XP・回答履歴はこの端末に保存され、オフラインでも利用できます。別の端末とは自動同期されません。</p>
      </div>
    </div>
  );
}
