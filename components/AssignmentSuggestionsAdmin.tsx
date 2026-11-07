'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';

type Suggestion = {
  id:string; title:string; details:string; subject:string; subject_option:string;
  target_class:string; type:string; due_at:string|null; status:string; created_at:string;
};
export default function AssignmentSuggestionsAdmin(){
  const [rows,setRows]=useState<Suggestion[]>([]);
  const [loading,setLoading]=useState(false);
  const [busyId,setBusyId]=useState('');
  const [message,setMessage]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch('/api/admin/assignment-suggestions',{cache:'no-store'});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result?.message||'課題提案を取得できませんでした。');
      setRows(Array.isArray(result.suggestions)?result.suggestions:[]);
    }catch(error){setMessage(error instanceof Error?error.message:'課題提案を取得できませんでした。');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  const act=async(id:string,action:'approve'|'reject')=>{
    const label=action==='approve'?'正式課題として公開':'提案を却下';
    if(!window.confirm('この提案を'+label+'しますか？'))return;
    setBusyId(id);setMessage('');
    try{
      const response=await fetch('/api/admin/assignment-suggestions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result?.success)throw new Error(result?.message||label+'できませんでした。');
      setMessage(action==='approve'?'課題を公開しました。'+(result.notification?' '+result.notification:''):'提案を却下しました。');
      await load();
    }catch(error){setMessage(error instanceof Error?error.message:label+'できませんでした。');}
    finally{setBusyId('');}
  };
  return <section className="rounded-2xl border border-violet-800/50 bg-slate-950 p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-base font-black">LINEからの課題提案</h3><p className="mt-1 text-xs text-slate-400">生徒のLINE投稿は承認待ちとして保存されます。承認したものだけ正式課題として公開されます。</p></div>
      <button type="button" onClick={()=>void load()} disabled={loading} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300"><RefreshCw size={13} className="inline mr-1"/>{loading?'読み込み中…':'更新'}</button>
    </div>
    {message&&<p role="status" className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-200">{message}</p>}
    {rows.length?rows.map(row=><article key={row.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-cyan-900/50 px-2 py-1 text-[10px] font-black text-cyan-200">{row.subject}</span><span className="rounded-lg bg-violet-900/50 px-2 py-1 text-[10px] font-bold text-violet-200">{row.target_class==='science'?'理系クラス':'全クラス'}</span>{row.subject_option&&<span className="text-[10px] font-bold text-violet-200">{row.subject_option}向け</span>}</div>
      <h4 className="mt-2 font-black">{row.title}</h4><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-300">{row.details||'詳細なし'}</p>
      <p className="mt-2 text-[10px] text-slate-500">提出期限：{row.due_at?new Date(row.due_at).toLocaleString('ja-JP'):'未設定'} ・ 提案：{new Date(row.created_at).toLocaleString('ja-JP')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={()=>void act(row.id,'approve')} disabled={!!busyId} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40"><Check size={14}/>承認して公開</button>
        <button type="button" onClick={()=>void act(row.id,'reject')} disabled={!!busyId} className="inline-flex items-center gap-1 rounded-lg border border-rose-900 px-3 py-2 text-xs font-bold text-rose-300 disabled:opacity-40"><X size={14}/>却下</button>
      </div>
    </article>):<p className="text-sm text-slate-500">{loading?'読み込み中…':'承認待ちの提案はありません。'}</p>}
  </section>;
}
