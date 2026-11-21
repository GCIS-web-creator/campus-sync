'use client';

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Archive, BookOpen, Brain, CheckCircle2, FileUp, Loader2, Plus, RefreshCw,
  Send, Trash2, UploadCloud,
} from 'lucide-react';

type Option = { id: string; text: string };
type Difficulty = 'normal' | 'advanced' | 'challenge';
type QuestionType = 'multiple_choice' | 'numeric' | 'written';
type Question = {
  id: string;
  subject: string;
  subject_code: string | null;
  unit: string;
  title: string;
  prompt: string;
  question_type: QuestionType;
  options: Option[];
  correct_option_id: string | null;
  correct_answer: string | null;
  answer_tolerance: number;
  explanation: string;
  difficulty: Difficulty;
  target_class: string;
  status: 'draft' | 'published' | 'archived';
  source_name: string;
  source_url: string | null;
  source_license: string | null;
  source_attribution: string | null;
  source_revision: string | null;
  created_at: string;
  published_at: string | null;
};

const SUBJECTS = [
  { code: 'math1', name: '数学I' },
  { code: 'matha', name: '数学A' },
  { code: 'math2', name: '数学II' },
  { code: 'mathb', name: '数学B' },
  { code: 'math3', name: '数学III' },
  { code: 'mathc', name: '数学C' },
];
const makeOptions = (): Option[] => [
  { id: 'a', text: '' }, { id: 'b', text: '' }, { id: 'c', text: '' }, { id: 'd', text: '' },
];
const difficultyLabel: Record<Difficulty, string> = {
  normal: '基礎・2 XP', advanced: '応用・4 XP', challenge: '発展・6 XP',
};
const typeLabel: Record<QuestionType, string> = {
  multiple_choice: '選択式', numeric: '数値入力', written: '記述式',
};
const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-500';
const labelClass = 'block space-y-1 text-xs font-bold text-slate-300';

export default function KnowledgeQuestionAdmin() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subject, setSubject] = useState('数学III');
  const [subjectCode, setSubjectCode] = useState('math3');
  const [unit, setUnit] = useState('微分法');
  const [questionType, setQuestionType] = useState<QuestionType>('multiple_choice');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState<Option[]>(makeOptions);
  const [correctOptionId, setCorrectOptionId] = useState('a');
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [answerTolerance, setAnswerTolerance] = useState('0');
  const [explanation, setExplanation] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [targetClass, setTargetClass] = useState('all');
  const [sourceName, setSourceName] = useState('CampusSyncオリジナル');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceLicense, setSourceLicense] = useState('');
  const [sourceAttribution, setSourceAttribution] = useState('');
  const [sourceRevision, setSourceRevision] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/knowledge-questions', { credentials: 'same-origin', cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || '問題一覧を取得できませんでした。');
      setQuestions(Array.isArray(payload.questions) ? payload.questions as Question[] : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '問題一覧を取得できませんでした。');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateOption = (id: string, value: string) => setOptions(current =>
    current.map(option => option.id === id ? { ...option, text: value } : option)
  );

  const addOption = () => {
    if (options.length >= 6) return;
    const nextId = ['a', 'b', 'c', 'd', 'e', 'f'].find(id => !options.some(option => option.id === id));
    if (!nextId) return;
    setOptions(current => [...current, { id: nextId, text: '' }]);
  };

  const removeOption = (id: string) => {
    if (options.length <= 2) return;
    const next = options.filter(option => option.id !== id);
    setOptions(next);
    if (correctOptionId === id) setCorrectOptionId(next[0].id);
  };

  const reset = () => {
    setSubject('数学III'); setSubjectCode('math3'); setUnit('微分法');
    setQuestionType('multiple_choice'); setTitle(''); setPrompt('');
    setOptions(makeOptions()); setCorrectOptionId('a'); setCorrectAnswer('');
    setAnswerTolerance('0'); setExplanation(''); setDifficulty('normal');
    setTargetClass('all'); setSourceName('CampusSyncオリジナル');
    setSourceUrl(''); setSourceLicense(''); setSourceAttribution(''); setSourceRevision('');
    setStatus('draft');
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/knowledge-questions', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject, subject_code: subjectCode, unit, title, prompt, question_type: questionType,
          options: questionType === 'multiple_choice' ? options : [],
          correct_option_id: questionType === 'multiple_choice' ? correctOptionId : null,
          correct_answer: questionType === 'multiple_choice' ? null : correctAnswer,
          answer_tolerance: questionType === 'numeric' ? Number(answerTolerance) : 0,
          explanation, difficulty, target_class: targetClass, status,
          source_name: sourceName, source_url: sourceUrl || null,
          source_license: sourceLicense || null, source_attribution: sourceAttribution || null,
          source_revision: sourceRevision || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || '問題を保存できませんでした。');
      setMessage(status === 'published' ? '問題を公開しました。生徒の演習画面に表示されます。' : '問題を下書き保存しました。');
      reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '問題を保存できませんでした。');
    } finally { setSaving(false); }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(''); setMessage('');
    if (file.size > 1024 * 1024) {
      setError('一括登録ファイルは1MB以下にしてください。');
      return;
    }
    setImporting(true);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const items = Array.isArray(parsed) ? parsed :
        typeof parsed === 'object' && parsed !== null && 'items' in parsed && Array.isArray((parsed as { items: unknown }).items)
          ? (parsed as { items: unknown[] }).items : null;
      if (!items || items.length < 1 || items.length > 100) throw new Error('JSONは1〜100問の配列、または { "items": [...] } の形式にしてください。');

      const response = await fetch('/api/admin/knowledge-questions/import', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || '一括登録に失敗しました。');
      setMessage('取り込み完了：' + Number(payload.imported || 0) + '問を下書き登録、重複 ' + Number(payload.duplicates || 0) + '問をスキップしました。公開前に内容を確認してください。');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'JSONを読み込めませんでした。');
    } finally { setImporting(false); }
  };

  const changeStatus = async (question: Question, action: 'publish' | 'archive') => {
    const label = action === 'publish' ? '公開' : 'アーカイブ';
    if (!window.confirm('「' + question.title + '」を' + label + 'しますか？')) return;
    setBusyId(question.id); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/knowledge-questions', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: question.id, action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || '状態を更新できませんでした。');
      setMessage(action === 'publish' ? '問題を公開しました。' : '問題をアーカイブしました。');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '状態を更新できませんでした。');
    } finally { setBusyId(''); }
  };

  return <div className="mx-auto max-w-7xl space-y-5">
    <header className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950 p-5 text-white sm:p-6">
      <div className="absolute -right-8 -top-14 size-48 rounded-full bg-cyan-400/10 blur-3xl"/>
      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black tracking-[.2em] text-cyan-300">CAMPUSSYNC · LEARNING CONTENT</p>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-black"><Brain className="text-cyan-300"/>数学問題バンク管理</h1>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-300">数学I・A・II・B・III・Cの問題、単元、解答形式、難易度、出典とライセンスを一元管理します。</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
          <p className="text-[10px] font-bold text-slate-300">登録済み（最新1,000問まで表示）</p>
          <p className="mt-1 text-2xl font-black tabular-nums">{questions.length.toLocaleString('ja-JP')}<span className="ml-1 text-xs text-slate-300">問</span></p>
        </div>
      </div>
    </header>

    {error && <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-950/40 px-4 py-3 text-xs font-bold text-rose-200">{error}</div>}
    {message && <div role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-950/40 px-4 py-3 text-xs font-bold text-emerald-200">{message}</div>}

    <section className="rounded-3xl border border-cyan-500/20 bg-cyan-500/[.04] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-100"><UploadCloud size={17} className="text-cyan-300"/>ライセンス確認済み問題の一括登録</h2>
          <p className="mt-1 text-[10px] leading-5 text-slate-400">JSONファイル1つにつき最大100問。重複は自動スキップし、取り込んだ問題はすべて下書きになります。</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-xs font-black text-white transition hover:bg-cyan-600">
          {importing ? <Loader2 size={15} className="animate-spin"/> : <FileUp size={15}/>}
          {importing ? '取り込み中…' : 'JSONを選択して取り込む'}
          <input type="file" accept=".json,application/json" onChange={event => void importFile(event)} disabled={importing} className="sr-only"/>
        </label>
      </div>
      <p className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-[10px] leading-5 text-slate-400">
        必須項目：subject / subject_code / unit / title / prompt / question_type / difficulty / source_name / source_url / source_license / source_attribution。
        選択式はoptions・correct_option_id、数値・記述式はcorrect_answerを指定してください。
      </p>
    </section>

    <form onSubmit={save} className="space-y-4 rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-lg sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-base font-black text-white">問題を手動で作成</h2><p className="mt-1 text-[10px] text-slate-400">正答データは生徒の一覧APIには含めず、採点後にのみ返します。</p></div>
        <button type="button" onClick={() => reset()} className="rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-bold text-slate-300">入力をリセット</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={labelClass}>教科<select className={inputClass} value={subjectCode} onChange={event => {
          const selected = SUBJECTS.find(item => item.code === event.target.value);
          if (selected) { setSubjectCode(selected.code); setSubject(selected.name); }
        }}>{SUBJECTS.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
        <label className={labelClass}>単元<input className={inputClass} value={unit} onChange={event => setUnit(event.target.value)} maxLength={120} placeholder="例：数列、微分法、ベクトル" required/></label>
        <label className={labelClass}>問題形式<select className={inputClass} value={questionType} onChange={event => setQuestionType(event.target.value as QuestionType)}>
          <option value="multiple_choice">選択式（自動採点）</option><option value="numeric">数値入力（自動採点）</option><option value="written">記述式（自己確認）</option>
        </select></label>
        <label className={labelClass}>難易度<select className={inputClass} value={difficulty} onChange={event => setDifficulty(event.target.value as Difficulty)}>
          <option value="normal">基礎（2 XP）</option><option value="advanced">応用（4 XP）</option><option value="challenge">発展（6 XP）</option>
        </select></label>
        <label className={labelClass + ' sm:col-span-2'}>問題名<input className={inputClass} value={title} onChange={event => setTitle(event.target.value)} maxLength={160} placeholder="例：導関数の基本計算" required/></label>
        <label className={labelClass + ' sm:col-span-2'}>対象クラス<input className={inputClass} value={targetClass} onChange={event => setTargetClass(event.target.value)} maxLength={80} placeholder="all または 1-1" required/><span className="text-[10px] font-normal text-slate-500">全生徒に公開する場合は all</span></label>
      </div>

      <label className={labelClass}>問題文<textarea className={inputClass + ' min-h-32 leading-7'} value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={4000} placeholder="数式・条件・図の説明などを入力してください。" required/></label>

      {questionType === 'multiple_choice' ? <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-black text-white">選択肢</h3><button type="button" onClick={addOption} disabled={options.length >= 6} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[10px] font-bold text-cyan-300 disabled:opacity-40"><Plus size={13}/>選択肢を追加</button></div>
        {options.map((option, index) => <div key={option.id} className="flex items-center gap-2">
          <label className={'flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border text-xs font-black ' +
            (correctOptionId === option.id ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-950 text-cyan-300')} title="正解として設定">
            <input type="radio" name="knowledge-correct-option" checked={correctOptionId === option.id} onChange={() => setCorrectOptionId(option.id)} className="sr-only"/>
            {String.fromCharCode(65 + index)}
          </label>
          <input className={inputClass} value={option.text} onChange={event => updateOption(option.id, event.target.value)} maxLength={500} placeholder={'選択肢 ' + (index + 1)} required/>
          <button type="button" onClick={() => removeOption(option.id)} disabled={options.length <= 2} aria-label="選択肢を削除" className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-rose-400 disabled:opacity-30"><Trash2 size={15}/></button>
        </div>)}
        <p className="text-[10px] text-slate-500">左端のA〜Fを選ぶと正解になります。選択肢は2〜6個です。</p>
      </section> : <section className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-3 sm:grid-cols-2 sm:p-4">
        <label className={labelClass + ' sm:col-span-2'}>{questionType === 'numeric' ? '正解の数値' : '模範解答・解答例'}
          {questionType === 'numeric'
            ? <input className={inputClass} value={correctAnswer} onChange={event => setCorrectAnswer(event.target.value)} placeholder="例：2、0.5、-3.14" required/>
            : <textarea className={inputClass + ' min-h-28 leading-6'} value={correctAnswer} onChange={event => setCorrectAnswer(event.target.value)} maxLength={2000} placeholder="解答例や証明の流れを入力してください。" required/>}
        </label>
        {questionType === 'numeric' && <label className={labelClass}>許容誤差<input type="number" min="0" max="1000000000000" step="any" className={inputClass} value={answerTolerance} onChange={event => setAnswerTolerance(event.target.value)}/><span className="text-[10px] font-normal text-slate-500">例：0.01なら正解との差が0.01以内</span></label>}
        {questionType === 'written' && <p className="self-end text-[10px] leading-5 text-slate-400">記述式は自動採点せず、模範解答を見て自己確認します。知識XPは付与しません。</p>}
      </section>}

      <label className={labelClass}>解説<textarea className={inputClass + ' min-h-24 leading-6'} value={explanation} onChange={event => setExplanation(event.target.value)} maxLength={2000} placeholder="考え方、公式、間違えやすいポイントなど。"/></label>

      <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
        <div><h3 className="text-sm font-black text-white">出典・ライセンス</h3><p className="mt-1 text-[10px] text-slate-400">外部教材を取り込む場合は、出典URL・ライセンス・表示文を必ず記録します。</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>出典名<input className={inputClass} value={sourceName} onChange={event => setSourceName(event.target.value)} maxLength={120} placeholder="FTEXT / Wikibooks"/></label>
          <label className={labelClass}>ライセンス<input className={inputClass} value={sourceLicense} onChange={event => setSourceLicense(event.target.value)} maxLength={100} placeholder="CC BY 4.0 / CC BY-SA 4.0"/></label>
          <label className={labelClass + ' sm:col-span-2'}>出典URL<input type="url" className={inputClass} value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://..."/></label>
          <label className={labelClass + ' sm:col-span-2'}>出典表示文<input className={inputClass} value={sourceAttribution} onChange={event => setSourceAttribution(event.target.value)} maxLength={500} placeholder="教材名・ページ名・著作者表示・ライセンスなど"/></label>
          <label className={labelClass + ' sm:col-span-2'}>版・revision ID（任意）<input className={inputClass} value={sourceRevision} onChange={event => setSourceRevision(event.target.value)} maxLength={200} placeholder="Wikibooksのoldid / 取得版など"/></label>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-300"><input type="checkbox" checked={status === 'published'} onChange={event => setStatus(event.target.checked ? 'published' : 'draft')}/>保存後すぐに公開</label>
        <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-5 py-3 text-xs font-black text-white transition hover:bg-cyan-600 disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin"/> : <Send size={15}/>} {status === 'published' ? '作成して公開' : '下書き保存'}</button>
      </div>
    </form>

    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-black text-white">登録済み問題 <span className="ml-1 text-xs text-slate-400">{questions.length.toLocaleString('ja-JP')}件</span></h2><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200"><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>更新</button></div>
      {questions.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500"><BookOpen size={25} className="mx-auto mb-2"/>まだ問題が登録されていません。</div> : questions.map(question => <article key={question.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-cyan-950 px-2.5 py-1 text-[10px] font-black text-cyan-200">{question.subject}</span>
          <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-slate-300">{question.unit}</span>
          <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-slate-300">{typeLabel[question.question_type]}</span>
          <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-slate-300">{difficultyLabel[question.difficulty]}</span>
          <span className={'rounded-lg px-2.5 py-1 text-[10px] font-bold ' + (question.status === 'published' ? 'bg-emerald-950 text-emerald-200' : question.status === 'draft' ? 'bg-amber-950 text-amber-200' : 'bg-slate-800 text-slate-400')}>{question.status === 'published' ? '公開中' : question.status === 'draft' ? '下書き' : 'アーカイブ'}</span>
          <span className="text-[10px] text-slate-500">対象：{question.target_class}</span>
        </div>
        <h3 className="mt-3 text-base font-black text-white">{question.title}</h3>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-300">{question.prompt}</p>
        {question.question_type === 'multiple_choice'
          ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{question.options.map((option, index)=><div key={option.id} className={'rounded-lg border p-2 text-xs ' + (option.id === question.correct_option_id ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200' : 'border-slate-800 bg-slate-900 text-slate-300')}><b className="mr-2">{String.fromCharCode(65 + index)}.</b>{option.text}{option.id === question.correct_option_id && <CheckCircle2 size={13} className="ml-2 inline text-emerald-400"/>}</div>)}</div>
          : <p className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs leading-6 text-slate-200">模範解答：{question.correct_answer}</p>}
        {question.explanation && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-400">解説：{question.explanation}</p>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
          <div className="min-w-0 text-[10px] text-slate-500">{question.source_url ? <a href={question.source_url} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline underline-offset-2">{question.source_name}</a> : question.source_name}{question.source_license ? ' · ' + question.source_license : ''}</div>
          {question.status !== 'archived' && <div className="flex shrink-0 justify-end gap-2">
            {question.status === 'draft' && <button type="button" onClick={() => void changeStatus(question, 'publish')} disabled={busyId === question.id} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-50"><Send size={12}/>公開</button>}
            <button type="button" onClick={() => void changeStatus(question, 'archive')} disabled={busyId === question.id} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-bold text-slate-300 disabled:opacity-50">{busyId === question.id ? <Loader2 size={12} className="animate-spin"/> : <Archive size={12}/>}アーカイブ</button>
          </div>}
        </div>
        {question.source_attribution && <p className="mt-2 text-[9px] leading-5 text-slate-500">{question.source_attribution}</p>}
      </article>)}
    </section>
  </div>;
}
