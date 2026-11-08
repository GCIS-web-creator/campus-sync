'use client';

import React,{useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {CalendarDays,Clock,Send,RefreshCw,AlertCircle,CheckCircle2,ClipboardList,Undo2} from 'lucide-react';

type Report={id:string;report_type:'absence'|'late'|'early_leave';report_date:string;expected_time:string|null;note:string;status:string;created_at:string};
const TYPES=[{id:'absence',label:'欠席',desc:'その日の授業を欠席する場合',icon:'欠'},{id:'late',label:'遅刻',desc:'登校が遅れる場合',icon:'遅'},{id:'early_leave',label:'早退',desc:'途中で下校する場合',icon:'早'}] as const;
const STATUS:Record<string,string>={received:'受付済み',reviewing:'確認中',processed:'確認完了',needs_contact:'学校から確認あり',canceled:'取り消し'};
const LABEL:Record<string,string>={absence:'欠席',late:'遅刻',early_leave:'早退'};
function tokyoToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export default function StudentAttendance({isDarkMode=false,studentName='',studentId='',userClass=''}:{isDarkMode?:boolean;studentName?:string;studentId?:string;userClass?:string}){
 const [type,setType]=useState<'absence'|'late'|'early_leave'>('absence');
 const [date,setDate]=useState(tokyoToday());
 const [time,setTime]=useState('08:30');
 const [note,setNote]=useState('');
 const [reports,setReports]=useState<Report[]>([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState('');
 const dark=isDarkMode;
 const panel=dark?'bg-slate-800 border-slate-700 text-white':'bg-white border-slate-200 text-slate-900';
 const muted=dark?'text-slate-400':'text-slate-500';
 const request=async(path:string,method='GET',body?:unknown)=>{
  const {data,error}=await supabase.auth.getSession();if(error)throw error;
  const token=data.session?.access_token;if(!token)throw new Error('学校アカウントでログインしてください。');
  const response=await fetch(path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const result=await response.json().catch(()=>null);if(!response.ok||!result?.success)throw new Error(result?.message||'処理に失敗しました。');return result;
 };
 const load=async()=>{setLoading(true);try{const result=await request('/api/attendance');setReports(result.reports||[]);setMessage('');}catch(e){setMessage(e instanceof Error?e.message:'履歴を取得できませんでした。');}finally{setLoading(false);}};
 useEffect(()=>{void load();},[]);
 const submit=async()=>{setSaving(true);setMessage('');try{await request('/api/attendance','POST',{report_type:type,report_date:date,expected_time:type==='absence'?'':time,note});setNote('');await load();setMessage('出欠連絡を送信しました。学校側の正式な出欠処理とは別に、受付状況を確認してください。');}catch(e){setMessage(e instanceof Error?e.message:'送信できませんでした。');}finally{setSaving(false);}};
 const cancel=async(id:string)=>{if(!window.confirm('この出欠連絡を取り消しますか？'))return;try{await request('/api/attendance','PATCH',{id,action:'cancel'});await load();}catch(e){setMessage(e instanceof Error?e.message:'取り消せませんでした。');}};
 return <div className="mx-auto max-w-3xl space-y-5 pb-8">
  <header><div className="flex items-center gap-2"><ClipboardList className="text-cyan-500"/><h1 className="text-2xl font-black">出欠連絡</h1></div><p className={'mt-1 text-sm '+muted}>欠席・遅刻・早退を学校へ連絡できます。</p></header>
  <section className={'rounded-3xl border p-4 sm:p-6 '+panel}>
   <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-black">連絡内容</h2><span className={'text-xs '+muted}>{studentName||studentId} ・ {userClass}組</span></div>
   <div className="grid grid-cols-3 gap-2">{TYPES.map(item=><button key={item.id} type="button" onClick={()=>setType(item.id)} className={'rounded-2xl border p-3 text-left transition '+(type===item.id?'border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500':'border-slate-300/50')}><span className="block text-xl font-black">{item.icon}</span><span className="mt-1 block font-black">{item.label}</span><span className={'mt-1 hidden text-[10px] sm:block '+muted}>{item.desc}</span></button>)}</div>
   <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">対象日<input type="date" value={date} onChange={e=>setDate(e.target.value)} min={new Date(Date.now()-7*86400000).toISOString().slice(0,10)} max={new Date(Date.now()+30*86400000).toISOString().slice(0,10)} className="mt-2 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-3"/></label>
   {type!=='absence'&&<label className="text-sm font-bold">{type==='late'?'登校予定時刻':'下校予定時刻'}<input type="time" value={time} onChange={e=>setTime(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-3"/></label>}</div>
   <label className="mt-4 block text-sm font-bold">連絡事項（任意）<textarea value={note} onChange={e=>setNote(e.target.value.slice(0,300))} rows={3} placeholder="必要な連絡事項のみ入力してください。詳しい健康情報は入力しないでください。" className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-transparent px-3 py-3 text-sm"/></label>
   <div className={'mt-2 text-right text-[10px] '+muted}>{note.length}/300文字</div>
   <button type="button" disabled={saving} onClick={()=>void submit()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 font-black text-white transition hover:bg-cyan-700 disabled:opacity-50"><Send size={17}/>{saving?'送信中…':'この内容で連絡する'}</button>
   <p className={'mt-3 text-xs leading-5 '+muted}>送信内容は教職員用の管理画面で確認されます。これは連絡の受付であり、学校の正式な出欠記録を自動確定するものではありません。</p>
  </section>
  {message&&<div role="status" className={'rounded-xl border p-3 text-sm '+(message.includes('送信しました')?'border-emerald-300 bg-emerald-50 text-emerald-800':'border-amber-300 bg-amber-50 text-amber-900')}><AlertCircle className="mr-2 inline" size={16}/>{message}</div>}
  <section className={'rounded-3xl border p-4 sm:p-6 '+panel}><div className="flex items-center justify-between"><h2 className="font-black">連絡履歴</h2><button type="button" onClick={()=>void load()} className="rounded-lg p-2 hover:bg-slate-500/10" aria-label="更新"><RefreshCw size={17}/></button></div>
   {loading?<p className={'py-8 text-center text-sm '+muted}>読み込み中…</p>:reports.length===0?<p className={'py-8 text-center text-sm '+muted}>出欠連絡はまだありません。</p>:<div className="mt-3 space-y-3">{reports.map(report=><article key={report.id} className="rounded-2xl border border-slate-300/40 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-black">{LABEL[report.report_type]} ・ {report.report_date}</div><span className="rounded-full bg-slate-500/10 px-3 py-1 text-xs font-bold">{STATUS[report.status]||report.status}</span></div>{report.expected_time&&<p className={'mt-1 text-sm '+muted}>予定時刻：{report.expected_time.slice(0,5)}</p>}{report.note&&<p className={'mt-2 whitespace-pre-wrap text-sm '+muted}>{report.note}</p>}{['received','reviewing'].includes(report.status)&&<button type="button" onClick={()=>void cancel(report.id)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-rose-500"><Undo2 size={14}/>連絡を取り消す</button>}</article>)}</div>}
  </section>
 </div>;
}
