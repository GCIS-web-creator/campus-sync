'use client';
import React,{useState} from 'react';
import {useRouter} from 'next/navigation';
import {CampusSyncLogo} from '@/components/CampusSyncLogo';
import {LockKeyhole,ShieldCheck} from 'lucide-react';
export default function AdminLoginPage(){
 const router=useRouter();
 const [password,setPassword]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const submit=async(event:React.FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(busy||!password)return;
  setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/admin/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password}),cache:'no-store',credentials:'same-origin'});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result?.success)throw new Error(result?.message||'ログインできませんでした。');
   setPassword('');router.replace('/admin');router.refresh();
  }catch(error){setMessage(error instanceof Error?error.message:'ログインできませんでした。');}
  finally{setBusy(false);}
 };
 return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
  <div className="w-full max-w-md space-y-6 rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
   <div className="flex items-center justify-between"><CampusSyncLogo variant="wordmark" height={30} theme="dark"/><span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">ADMIN</span></div>
   <div className="space-y-2"><div className="inline-flex rounded-2xl bg-cyan-500/10 p-3 text-cyan-300"><ShieldCheck size={25}/></div><h1 className="text-2xl font-black">管理者ログイン</h1><p className="text-sm leading-6 text-slate-400">CampusSyncの管理機能を利用するには認証が必要です。</p></div>
   <form onSubmit={submit} className="space-y-4">
    <label className="block text-sm font-bold text-slate-200">Adminパスワード
     <span className="relative mt-2 block"><LockKeyhole size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
      <input type="password" autoComplete="current-password" autoFocus required value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-500" placeholder="Adminパスワードを入力"/>
     </span>
    </label>
    {message&&<p role="alert" className="rounded-xl border border-rose-800 bg-rose-950/50 p-3 text-sm text-rose-200">{message}</p>}
    <button type="submit" disabled={busy||!password} className="w-full rounded-xl bg-cyan-600 px-4 py-3 text-sm font-black text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50">{busy?'認証中...':'ログイン'}</button>
   </form>
   <p className="text-center text-xs text-slate-500">認証セッションは8時間で期限切れになります。</p>
  </div>
 </main>;
}