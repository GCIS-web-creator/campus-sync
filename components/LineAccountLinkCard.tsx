'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, Link2, Loader2, ShieldCheck, Unlink } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type LinkStatus = {
  linked: boolean;
  linkedAt: string | null;
  verifiedClass: string | null;
};

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('学校アカウントでログインしてください。');
  return token;
}

export default function LineAccountLinkCard() {
  const [status, setStatus] = useState<LinkStatus>({ linked: false, linkedAt: null, verifiedClass: null });
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/line-student-link', {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.message || 'LINE連携状態を取得できませんでした。');
      setStatus({
        linked: Boolean(data.linked),
        linkedAt: data.linkedAt || null,
        verifiedClass: data.verifiedClass || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'LINE連携状態を取得できませんでした。');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const createCode = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    setCode('');
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/line-student-link', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.message || '認証コードを発行できませんでした。');
      setCode(String(data.code || ''));
      setExpiresAt(String(data.expiresAt || ''));
      setStatus(previous => ({ ...previous, verifiedClass: data.verifiedClass || null }));
      setMessage(data.message || '認証コードを発行しました。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '認証コードを発行できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!window.confirm('このCampusSyncアカウントとLINEの連携を解除しますか？')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/line-student-link', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.message || 'LINE連携を解除できませんでした。');
      setCode('');
      setExpiresAt('');
      setStatus(previous => ({ ...previous, linked: false, linkedAt: null }));
      setMessage(data.message || 'LINE連携を解除しました。');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'LINE連携を解除できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage('コピーしました。LINEの1対1トークに貼り付けてください。');
    } catch {
      setError('コピーできませんでした。表示されている文字列を選択してコピーしてください。');
    }
  };

  const sendText = code ? 'CSAI LINE連携 ' + code : '';
  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })
    : '';

  return (
    <section className="space-y-4 rounded-3xl border border-cyan-100 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-cyan-50 p-2.5 text-cyan-700"><Link2 size={20} /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black text-slate-900">LINEアカウント連携</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">学校アカウントとLINEを一度だけ本人確認し、学年・クラス限定の学校資料を1対1トークで閲覧できるようにします。</p>
        </div>
        {status.linked && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700"><CheckCircle2 size={12}/>連携済み</span>}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold text-slate-500">LINE連携状態</p>
            <p className="mt-1 text-sm font-black text-slate-800">{busy ? '確認中…' : status.linked ? '連携済み' : '未連携'}</p>
          </div>
          <button type="button" onClick={() => void refresh()} disabled={busy} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-50">更新</button>
        </div>
        {status.linkedAt && <p className="mt-2 text-[10px] text-slate-500">連携日時：{new Date(status.linkedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>}
      </div>

      <div className={'rounded-2xl border p-3 ' + (status.verifiedClass ? 'border-emerald-100 bg-emerald-50' : 'border-amber-200 bg-amber-50')}>
        <div className="flex items-start gap-2">
          <ShieldCheck size={16} className={status.verifiedClass ? 'mt-0.5 text-emerald-700' : 'mt-0.5 text-amber-700'} />
          <div>
            <p className={'text-xs font-black ' + (status.verifiedClass ? 'text-emerald-800' : 'text-amber-900')}>学年・クラス確認</p>
            <p className={'mt-1 text-[11px] leading-5 ' + (status.verifiedClass ? 'text-emerald-800' : 'text-amber-800')}>
              {status.verifiedClass
                ? '管理者確認済み：' + status.verifiedClass + '組。該当する限定資料を閲覧できます。'
                : '管理者による所属クラス確認がまだ完了していません。連携後も、限定資料は管理者が確認済みクラスを設定するまで表示されません。'}
            </p>
          </div>
        </div>
      </div>

      {!status.linked ? (
        <div className="space-y-3">
          <button type="button" onClick={() => void createCode()} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-3 text-xs font-black text-white hover:bg-cyan-600 disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
            LINE連携コードを発行
          </button>
          {code && (
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
              <p className="text-[10px] font-black tracking-wide text-cyan-800">ONE-TIME LINK CODE</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 select-all break-all text-xl font-black tracking-[0.16em] text-slate-900">{code}</code>
                <button type="button" onClick={() => void copy(code)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-[10px] font-black text-cyan-800"><Copy size={13}/>コード</button>
              </div>
              <p className="mt-2 text-[10px] leading-5 text-cyan-900">有効期限：{expiresLabel}（発行から5分）</p>
              <div className="mt-3 rounded-xl bg-white p-3">
                <p className="text-[10px] font-bold text-slate-500">LINEの1対1トークへ送信する文</p>
                <p className="mt-1 break-all font-mono text-xs font-black text-slate-900">{sendText}</p>
                <button type="button" onClick={() => void copy(sendText)} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-cyan-700 px-3 py-2 text-[10px] font-black text-white"><Copy size={12}/>送信文をコピー</button>
              </div>
              <p className="mt-2 text-[10px] leading-5 text-cyan-900">このコードは一度だけ使用できます。ほかの人には共有しないでください。</p>
            </div>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => void unlink()} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-3 text-xs font-black text-rose-700 hover:bg-rose-50 disabled:opacity-50">
          <Unlink size={15}/> LINE連携を解除
        </button>
      )}

      {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">{message}</p>}
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">{error}</p>}
    </section>
  );
}
