'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, Users, Archive, Ban, CheckCircle2 } from 'lucide-react';

type Row = {
  id: string;
  name: string;
  category: string;
  visibility: string;
  join_mode: string;
  is_official: boolean;
  status: string;
  member_count: number;
  description: string;
};
const CATEGORY: Record<string,string> = {
  club:'部活動',committee:'委員会',event:'学校行事',project:'プロジェクト',
  study:'勉強会',research:'研究',volunteer:'自主活動',other:'その他',
};
const JOIN: Record<string,string> = { invite_only:'招待制',approval:'申請・承認制',open:'自由参加' };

export default function AdminWorkspaces() {
  const [rows,setRows]=useState<Row[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState<string|null>(null);
  const [message,setMessage]=useState('');
  const load=async()=>{
    setLoading(true);
    try{
      const response=await fetch('/api/admin/workspaces',{credentials:'same-origin',cache:'no-store'});
      const result=await response.json();
      if(!response.ok||!result.success)throw new Error(result.message||'取得できませんでした。');
      setRows(result.workspaces||[]);
      setMessage('');
    }catch(error){setMessage(error instanceof Error?error.message:'取得できませんでした。');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);
  const update=async(id:string,action:'official'|'status',value:boolean|string)=>{
    setSaving(id);setMessage('');
    try{
      const response=await fetch('/api/admin/workspaces',{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action,value})});
      const result=await response.json();
      if(!response.ok||!result.success)throw new Error(result.message||'更新できませんでした。');
      await load();
      setMessage('グループ情報を更新しました。');
    }catch(error){setMessage(error instanceof Error?error.message:'更新できませんでした。');}
    finally{setSaving(null);}
  };
  return <div className="mx-auto max-w-6xl space-y-5 text-white">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Users className="text-cyan-400"/><h1 className="text-2xl font-black">共有ワークスペース管理</h1></div><p className="mt-1 text-sm text-slate-400">グループの学校公認認定・公開停止・アーカイブを管理します。</p></div><button type="button" onClick={()=>void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold hover:bg-slate-800"><RefreshCw size={15}/>更新</button></header>
    <div className="grid grid-cols-3 gap-3"><div className="rounded-2xl border border-slate-700 bg-slate-800 p-3"><p className="text-xs text-slate-400">登録グループ</p><p className="mt-1 text-2xl font-black">{rows.length}</p></div><div className="rounded-2xl border border-slate-700 bg-slate-800 p-3"><p className="text-xs text-slate-400">学校公認</p><p className="mt-1 text-2xl font-black text-emerald-300">{rows.filter((row)=>row.is_official).length}</p></div><div className="rounded-2xl border border-slate-700 bg-slate-800 p-3"><p className="text-xs text-slate-400">停止・アーカイブ</p><p className="mt-1 text-2xl font-black text-amber-300">{rows.filter((row)=>row.status!=='active').length}</p></div></div>
    {message&&<p role="status" className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-100">{message}</p>}
    {loading?<p className="py-12 text-center text-slate-400">読み込み中…</p>:rows.length===0?<div className="rounded-2xl border border-slate-700 bg-slate-800 p-8 text-center text-sm text-slate-400">登録されたグループはありません。</div>:<div className="space-y-3">{rows.map((row)=><article key={row.id} className="rounded-2xl border border-slate-700 bg-slate-800 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black">{row.name}</h2>{row.is_official&&<span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-black text-emerald-300"><ShieldCheck size={12}/>学校公認</span>}</div><p className="mt-1 text-xs text-slate-400">{CATEGORY[row.category]||row.category} ・ {JOIN[row.join_mode]||row.join_mode} ・ {row.member_count}人 ・ {row.visibility==='listed'?'一覧表示':'非公開'}</p><p className="mt-2 max-w-3xl whitespace-pre-wrap text-xs leading-5 text-slate-300">{row.description}</p><p className="mt-2 font-mono text-[10px] text-slate-500">{row.id}</p></div><span className={'rounded-full px-3 py-1 text-xs font-bold '+(row.status==='active'?'bg-emerald-500/10 text-emerald-300':row.status==='suspended'?'bg-rose-500/10 text-rose-300':'bg-slate-700 text-slate-300')}>{row.status==='active'?'公開中':row.status==='suspended'?'停止中':'アーカイブ'}</span></div><div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-700 pt-3"><button type="button" disabled={saving===row.id} onClick={()=>void update(row.id,'official',!row.is_official)} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-xs font-bold hover:bg-slate-700 disabled:opacity-50"><ShieldCheck size={14}/>{row.is_official?'公認を解除':'学校公認に認定'}</button>{row.status==='active'?<button type="button" disabled={saving===row.id} onClick={()=>void update(row.id,'status','suspended')} className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-bold text-rose-300 disabled:opacity-50"><Ban size={14}/>一時停止</button>:<button type="button" disabled={saving===row.id} onClick={()=>void update(row.id,'status','active')} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 px-3 py-2 text-xs font-bold text-emerald-300 disabled:opacity-50"><CheckCircle2 size={14}/>再開</button>}{row.status!=='archived'&&<button type="button" disabled={saving===row.id} onClick={()=>{if(window.confirm(row.name+'をアーカイブしますか？'))void update(row.id,'status','archived');}} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-50"><Archive size={14}/>アーカイブ</button>}</div></article>)}</div>}
    <p className="text-xs leading-5 text-slate-500">教職員用管理画面から公式認定・公開状態を変更した記録は監査ログに残ります。グループのチャット内容を常時閲覧する機能は設けていません。</p>
  </div>;
}
