'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Archive, Brain, CheckCircle2, Loader2, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';

type Option = { id: string; text: string };
type Difficulty = 'normal' | 'advanced' | 'challenge';
type Question = {
  id: string; subject: string; title: string; prompt: string; options: Option[];
  correct_option_id: string; explanation: string; difficulty: Difficulty;
  target_class: string; status: 'draft' | 'published' | 'archived';
  created_at: string; published_at: string | null;
};

const SUBJECTS = ['国語演習', '古典探求', '物理', '化学', '生物', '数３', '数C', '公共', '英コミュ', '論表', '情報', '保健', 'その他'];
const makeOptions = (): Option[] => [
  { id: 'a', text: '' }, { id: 'b', text: '' }, { id: 'c', text: '' }, { id: 'd', text: '' },
];
const difficultyLabel: Record<Difficulty, string> = { normal: '基礎・2 XP', advanced: '応用・4 XP', challenge: '発展・6 XP' };
const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500';
const labelClass = 'block space-y-1 text-xs font-bold text-slate-300';

export default function KnowledgeQuestionAdmin() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subject, setSubject] = useState('数３');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState<Option[]>(makeOptions);
  const [correctOptionId, setCorrectOptionId] = useState('a');
  const [explanation, setExplanation] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [targetClass, setTargetClass] = useState('all');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const updateOption = (id: string, text: string) => setOptions(current =>
    current.map(option => option.id === id ? { ...option, text } : option)
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
    setTitle(''); setPrompt(''); setOptions(makeOptions()); setCorrectOptionId('a');
    setExplanation(''); setDifficulty('normal'); setTargetClass('all'); setStatus('draft');
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/knowledge-questions', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject, title, prompt, options, correct_option_id: correctOptionId,
          explanation, difficulty, target_class: targetClass, status,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || '問題を保存できませんでした。');
      setMessage(status === 'published' ? '問題を公開しました。生徒の知識問題に表示されます。' : '問題を下書き保存しました。');
      reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '問題を保存できませんでした。');
    } finally { setSaving(false); }
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

  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-[10px] font-black tracking-[.2em] text-cyan-400">CAMPUSSYNC · PHASE 4</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-black text-white"><Brain className="text-cyan-400"/>知識問題管理</h1><p className="mt-2 text-xs text-slate-400">正解・難易度・解説を登録し、生徒向けの問題演習を公開します。</p></div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200"><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>更新</button>
    </header>
    {error && <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-950/40 px-4 py-3 text-xs font-bold text-rose-200">{error}</div>}
    {message && <div role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-950/40 px-4 py-3 text-xs font-bold text-emerald-200">{message}</div>}

    <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
      <div><h2 className="text-base font-black text-white">新しい問題を作成</h2><p className="mt-1 text-[10px] text-slate-400">正答キーは生徒の画面へ送信せず、サーバー側で採点します。</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>教科<select className={inputClass} value={subject} onChange={e => setSubject(e.target.value)}>{SUBJECTS.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className={labelClass}>問題名<input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} maxLength={160} placeholder="例：微分の基本問題" required/></label>
        <label className={labelClass}>難易度<select className={inputClass} value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)}><option value="normal">基礎（2 XP）</option><option value="advanced">応用（4 XP）</option><option value="challenge">発展（6 XP）</option></select></label>
        <label className={labelClass}>対象クラス<input className={inputClass} value={targetClass} onChange={e => setTargetClass(e.target.value)} maxLength={80} placeholder="all または 1-1" required/><span className="text-[10px] font-normal text-slate-500">全生徒に公開する場合は all</span></label>
      </div>
      <label className={labelClass}>問題文<textarea className={inputClass + ' min-h-28'} value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={4000} placeholder="問題文を入力してください。" required/></label>
      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black text-white">選択肢</h3><button type="button" onClick={addOption} disabled={options.length >= 6} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[10px] font-bold text-cyan-300 disabled:opacity-40"><Plus size={13}/>選択肢を追加</button></div>
        {options.map((option, index) => <div key={option.id} className="flex items-center gap-2">
          <label className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-xs font-black text-cyan-300" title="正解として設定"><input type="radio" name="knowledge-correct-option" checked={correctOptionId === option.id} onChange={() => setCorrectOptionId(option.id)} className="sr-only"/>{String.fromCharCode(65 + index)}</label>
          <input className={inputClass} value={option.text} onChange={e => updateOption(option.id, e.target.value)} maxLength={500} placeholder={'選択肢 ' + (index + 1)} required/>
          <button type="button" onClick={() => removeOption(option.id)} disabled={options.length <= 2} aria-label="選択肢を削除" className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-rose-400 disabled:opacity-30"><Trash2 size={15}/></button>
        </div>)}
        <p className="text-[10px] text-slate-500">左端の A〜F を選ぶと正解に設定されます。選択肢は2〜6個。</p>
      </section>
      <label className={labelClass}>解説<textarea className={inputClass + ' min-h-24'} value={explanation} onChange={e => setExplanation(e.target.value)} maxLength={2000} placeholder="正解の理由や解き方を入力してください。"/></label>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-300"><input type="checkbox" checked={status === 'published'} onChange={e => setStatus(e.target.checked ? 'published' : 'draft')}/>保存後すぐに公開</label>
        <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-5 py-2.5 text-xs font-black text-white hover:bg-cyan-600 disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin"/> : <Send size={15}/>} {status === 'published' ? '作成して公開' : '下書き保存'}</button>
      </div>
    </form>

    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2"><h2 className="text-base font-black text-white">登録済み問題 <span className="text-xs text-slate-400">{questions.length}件</span></h2></div>
      {questions.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">まだ問題が登録されていません。</div> : questions.map(question => <article key={question.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-cyan-950 px-2.5 py-1 text-[10px] font-black text-cyan-200">{question.subject}</span><span className="rounded-lg bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-slate-300">{difficultyLabel[question.difficulty]}</span><span className={'rounded-lg px-2.5 py-1 text-[10px] font-bold ' + (question.status === 'published' ? 'bg-emerald-950 text-emerald-200' : question.status === 'draft' ? 'bg-amber-950 text-amber-200' : 'bg-slate-800 text-slate-400')}>{question.status === 'published' ? '公開中' : question.status === 'draft' ? '下書き' : 'アーカイブ'}</span><span className="text-[10px] text-slate-500">対象：{question.target_class}</span></div>
        <h3 className="mt-2 text-base font-black text-white">{question.title}</h3>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-300">{question.prompt}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{question.options.map((option,index)=><div key={option.id} className={'rounded-lg border p-2 text-xs ' + (option.id === question.correct_option_id ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200' : 'border-slate-800 bg-slate-900 text-slate-300')}><b className="mr-2">{String.fromCharCode(65+index)}.</b>{option.text}{option.id === question.correct_option_id && <CheckCircle2 size={13} className="ml-2 inline text-emerald-400"/>}</div>)}</div>
        {question.explanation && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-400">解説：{question.explanation}</p>}
        {question.status !== 'archived' && <div className="mt-3 flex justify-end gap-2">
          {question.status === 'draft' && <button type="button" onClick={() => void changeStatus(question,'publish')} disabled={busyId === question.id} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-50"><Send size={12}/>公開</button>}
          <button type="button" onClick={() => void changeStatus(question,'archive')} disabled={busyId === question.id} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-bold text-slate-300 disabled:opacity-50">{busyId === question.id ? <Loader2 size={12} className="animate-spin"/> : <Archive size={12}/>}アーカイブ</button>
        </div>}
      </article>)}
    </section>
  </div>;
}
