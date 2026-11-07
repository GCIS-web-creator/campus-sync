'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarDays, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';

const SUBJECTS = ['国語演習','古典探求','物理','生物','数３','数C','公共','英コミュ','論表','情報','保健'] as const;
type Subject = typeof SUBJECTS[number];
type Draft = { subject: Subject; exam_date: string };
type ExamSubject = Draft & { id: string; sort_order: number };
type Exam = { id:string; school_year:number; term:number; exam_type:string; start_date:string; end_date:string; subjects:ExamSubject[] };

const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500';
const secondaryClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50';
const dateLabel = (value:string) => new Date(value+'T00:00:00').toLocaleDateString('ja-JP',{month:'numeric',day:'numeric',weekday:'short'});
function duration(start:string,end:string) {
  if (!start || !end) return 0;
  const a=start.split('-').map(Number), b=end.split('-').map(Number);
  if (a.length!==3 || b.length!==3) return 0;
  return Math.round((Date.UTC(b[0],b[1]-1,b[2])-Date.UTC(a[0],a[1]-1,a[2]))/86400000)+1;
}
export default function ExamScheduleAdmin() {
  const [exams,setExams]=useState<Exam[]>([]);
  const [year,setYear]=useState(String(new Date().getFullYear()));
  const [term,setTerm]=useState('1');
  const [examType,setExamType]=useState('中間考査');
  const [startDate,setStartDate]=useState('');
  const [endDate,setEndDate]=useState('');
  const [drafts,setDrafts]=useState<Draft[]>([{subject:'国語演習',exam_date:''}]);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const effectiveType=term==='3'?'学年末考査':examType;

  const load=useCallback(async()=>{
    setLoading(true);
    try {
      const response=await fetch('/api/admin/exams',{cache:'no-store'});
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result?.message||'考査日程を読み込めませんでした。');
      setExams(Array.isArray(result.exams)?result.exams:[]);
    } catch(error) {
      setMessage(error instanceof Error?error.message:'考査日程を読み込めませんでした。');
    } finally { setLoading(false); }
  },[]);
  useEffect(()=>{void load();},[load]);

  const save=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault(); setMessage('');
    const n=Number(year), d=duration(startDate,endDate);
    if(!Number.isInteger(n)||n<2020||n>2100){setMessage('年度は2020〜2100で指定してください。');return;}
    if(d!==3&&d!==4){setMessage('考査期間は3日間または4日間にしてください。');return;}
    if(!drafts.length||drafts.some(x=>!x.exam_date)){setMessage('実施する教科と試験日を入力してください。実施しない教科は追加しません。');return;}
    if(new Set(drafts.map(x=>x.subject)).size!==drafts.length){setMessage('同じ教科は重複登録できません。');return;}
    const counts=new Map<string,number>();
    for(const row of drafts){
      if(row.exam_date<startDate||row.exam_date>endDate){setMessage('教科の試験日は考査期間内にしてください。');return;}
      counts.set(row.exam_date,(counts.get(row.exam_date)||0)+1);
    }
    if([...counts.values()].some(x=>x>3)){setMessage('1日最大3教科までです。');return;}
    setSaving(true);
    try{
      const response=await fetch('/api/admin/exams',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({school_year:n,term:Number(term),exam_type:effectiveType,start_date:startDate,end_date:endDate,subjects:drafts}),
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result?.success)throw new Error(result?.message||'考査日程を保存できませんでした。');
      setMessage('考査日程と実施教科を保存しました。生徒画面にも反映されます。');
      setStartDate('');setEndDate('');setDrafts([{subject:'国語演習',exam_date:''}]);
      await load();
    }catch(error){setMessage(error instanceof Error?error.message:'保存できませんでした。');}
    finally{setSaving(false);}
  };
  const remove=async(id:string)=>{
    if(!window.confirm('この考査日程と実施教科を削除しますか？'))return;
    try{
      const response=await fetch('/api/admin/exams',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result?.message||'削除できませんでした。');
      setMessage('考査日程を削除しました。');await load();
    }catch(error){setMessage(error instanceof Error?error.message:'削除できませんでした。');}
  };

  return <div className="max-w-5xl space-y-6">
    <header><h2 className="flex items-center gap-2 text-2xl font-black"><CalendarDays className="text-blue-400"/>考査日程管理</h2><p className="mt-2 text-sm text-slate-400">登録した日程は全生徒に共通表示されます。生徒側から考査予定を追加・変更することはできません。</p></header>
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-5">
      <h3 className="text-base font-black">新しい考査を登録</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs font-bold text-slate-300">年度<input className={inputClass} type="number" min="2020" max="2100" value={year} onChange={e=>setYear(e.target.value)} required/></label>
        <label className="space-y-1 text-xs font-bold text-slate-300">学期<select className={inputClass} value={term} onChange={e=>setTerm(e.target.value)}><option value="1">1学期</option><option value="2">2学期</option><option value="3">3学期</option></select></label>
        <label className="space-y-1 text-xs font-bold text-slate-300">考査<select className={inputClass} value={effectiveType} onChange={e=>setExamType(e.target.value)} disabled={term==='3'}><option value="中間考査">中間考査</option><option value="期末考査">期末考査</option>{term==='3'&&<option value="学年末考査">学年末考査</option>}</select></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-bold text-slate-300">開始日<input className={inputClass} type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} required/></label>
        <label className="space-y-1 text-xs font-bold text-slate-300">終了日<input className={inputClass} type="date" min={startDate||undefined} value={endDate} onChange={e=>setEndDate(e.target.value)} required/></label>
      </div>
      <p className="text-xs text-slate-400">考査期間：{duration(startDate,endDate)||'—'}日間（3日間または4日間）</p>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-black">実施教科・試験日</h4><button type="button" onClick={()=>setDrafts(rows=>[...rows,{subject:'国語演習',exam_date:startDate}])} className={secondaryClass}><Plus size={14}/>教科を追加</button></div>
        {drafts.map((row,index)=><div key={index} className="grid gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="space-y-1 text-xs font-bold text-slate-300">教科<select className={inputClass} value={row.subject} onChange={e=>setDrafts(rows=>rows.map((x,i)=>i===index?{...x,subject:e.target.value as Subject}:x))}>{SUBJECTS.map(x=><option key={x}>{x}</option>)}</select></label>
          <label className="space-y-1 text-xs font-bold text-slate-300">試験日<input className={inputClass} type="date" min={startDate||undefined} max={endDate||undefined} value={row.exam_date} onChange={e=>setDrafts(rows=>rows.map((x,i)=>i===index?{...x,exam_date:e.target.value}:x))} required/></label>
          <button type="button" disabled={drafts.length===1} onClick={()=>setDrafts(rows=>rows.filter((_,i)=>i!==index))} className="rounded-xl border border-rose-900 px-3 py-2.5 text-xs font-bold text-rose-300 disabled:opacity-30"><Trash2 size={14}/></button>
        </div>)}
      </div>
      <p className="text-xs leading-5 text-slate-400">実施しない教科は追加しないでください。1日最大3教科です。生徒には登録した教科だけが表示されます。</p>
      <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><Save size={15}/>{saving?'保存中…':'考査を保存'}</button>
      {message&&<p role="status" className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-200">{message}</p>}
    </form>
    <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black">登録済みの考査</h3><button type="button" onClick={()=>void load()} disabled={loading} className={secondaryClass}><RefreshCw size={13}/>{loading?'読み込み中…':'再読み込み'}</button></div>
      {exams.length?exams.map(exam=><article key={exam.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold text-cyan-300">{exam.school_year}年度・{exam.term}学期</p><h4 className="text-lg font-black">{exam.exam_type}</h4><p className="mt-1 text-xs text-slate-400">{dateLabel(exam.start_date)}〜{dateLabel(exam.end_date)}</p></div><button type="button" onClick={()=>void remove(exam.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-900 px-3 py-2 text-xs font-bold text-rose-300"><Trash2 size={14}/>削除</button></div>
        <div className="mt-3 space-y-2">{Array.from(new Set(exam.subjects.map(x=>x.exam_date))).sort().map(date=><div key={date}><p className="mb-1 text-xs font-bold text-slate-400">{dateLabel(date)}</p><div className="flex flex-wrap gap-2">{exam.subjects.filter(x=>x.exam_date===date).sort((a,b)=>a.sort_order-b.sort_order).map(x=><span key={x.id} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200">{x.sort_order} ・ {x.subject}</span>)}</div></div>)}</div>
      </article>):<p className="text-sm text-slate-500">{loading?'読み込み中…':'考査日程はまだ登録されていません。'}</p>}
    </section>
  </div>;
}
