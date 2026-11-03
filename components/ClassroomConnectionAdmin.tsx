'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { BookOpenCheck, CircleAlert, CircleCheck, ExternalLink, GraduationCap, RefreshCw, ShieldCheck } from 'lucide-react';
type StatusInfo = { configured: boolean; callbackUri?: string; message?: string };
type TestResult = { key: string; courses?: number; assignments?: number; checked?: number };
const resultMessages: Record<string, { title: string; description: string; tone: 'success' | 'warning' | 'error' }> = {
  success: { title: '接続テストに成功しました', description: 'Google Classroomのクラス一覧と、確認対象クラスの課題一覧を読み取れました。データの保存・公開は行っていません。', tone: 'success' },
  partial: { title: 'クラス一覧は取得できましたが、一部の課題を読み取れませんでした', description: '生徒アカウント用の課題読み取り権限や、学校側のClassroom API利用設定を確認してください。', tone: 'warning' },
  no_courses: { title: 'Google認証は成功しましたが、利用可能なクラスがありません', description: '学校アカウントでClassroomに参加しているか、対象クラスが有効になっているか確認してください。', tone: 'warning' },
  oauth_denied: { title: 'Google側で接続が許可されませんでした', description: '学校のGoogle Workspace管理者に、18歳未満の利用者向けの外部アプリ許可とClassroom APIデータアクセス設定を確認してもらってください。', tone: 'error' },
  invalid_state: { title: '認証の安全確認に失敗しました', description: '管理画面からもう一度接続テストを開始してください。', tone: 'error' },
  token_exchange: { title: 'Google認証コードを確認できませんでした', description: 'OAuthクライアントID・クライアントシークレット・リダイレクトURIが一致しているか確認してください。', tone: 'error' },
  api_disabled: { title: 'Google Classroom APIが有効になっていません', description: 'Google Cloud側で対象プロジェクトのGoogle Classroom APIを有効にしてください。', tone: 'error' },
  classroom_access_denied: { title: 'Classroom APIへのアクセスが拒否されました', description: '学校のGoogle Workspace管理者による外部アプリ許可と、読み取り権限の設定を確認してください。', tone: 'error' },
  api_error: { title: 'Classroom APIとの通信に失敗しました', description: 'APIの利用設定、OAuth設定、通信状態を確認してから再試行してください。', tone: 'error' },
  not_configured: { title: 'Google OAuthの設定がまだありません', description: 'VercelにGoogle Classroom用のOAuthクライアントIDとクライアントシークレットを登録してください。', tone: 'warning' },
};
export default function ClassroomConnectionAdmin() {
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false);
  const [pageMessage, setPageMessage] = useState(''); const [testResult, setTestResult] = useState<TestResult | null>(null);
  const loadStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/admin/classroom/status', { cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as StatusInfo;
      if (!response.ok) { setPageMessage(data.message || '管理者認証を確認できませんでした。'); setStatus(null); }
      else { setStatus(data); setPageMessage(''); }
    } catch { setPageMessage('接続設定を読み込めませんでした。通信状態を確認してください。'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => {
    void loadStatus();
    const url = new URL(window.location.href); const resultKey = url.searchParams.get('classroom_test');
    if (resultKey) {
      const courses = url.searchParams.get('courses'); const assignments = url.searchParams.get('assignments'); const checked = url.searchParams.get('checked');
      setTestResult({ key: resultKey, ...(courses !== null ? { courses: Number(courses) } : {}), ...(assignments !== null ? { assignments: Number(assignments) } : {}), ...(checked !== null ? { checked: Number(checked) } : {}) });
      url.searchParams.delete('classroom_test'); url.searchParams.delete('courses'); url.searchParams.delete('assignments'); url.searchParams.delete('checked');
      window.history.replaceState({}, '', url.pathname + url.hash);
    }
  }, [loadStatus]);
  const result = testResult ? resultMessages[testResult.key] : null;
  return (
    <div className="max-w-5xl space-y-6">
      <header><div className="flex items-center gap-3"><div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-3 text-blue-300"><GraduationCap size={25} /></div><div><h2 className="text-2xl font-black text-white">Google Classroom 接続テスト</h2><p className="mt-1 text-sm text-slate-400">学校アカウントで読み取り専用の接続を確認します。</p></div></div></header>
      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3"><h3 className="font-black text-white">OAuth設定状況</h3><button type="button" onClick={() => void loadStatus()} disabled={loading || refreshing} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> 設定を再確認</button></div>
        {loading ? <p className="text-sm text-slate-400">設定を確認しています...</p> : status?.configured ? (
          <div className="space-y-2"><p className="flex items-center gap-2 text-sm font-bold text-emerald-300"><CircleCheck size={17} /> OAuthクライアント情報が設定されています。</p><p className="text-xs text-slate-400">Google Cloud Consoleに次のURIを「承認済みのリダイレクトURI」として登録してください。</p><div className="break-all rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 font-mono text-xs text-blue-200">{status.callbackUri}</div><button type="button" onClick={() => { if (status.callbackUri) void navigator.clipboard?.writeText(status.callbackUri); }} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800">リダイレクトURIをコピー</button></div>
        ) : (
          <div className="space-y-2"><p className="flex items-center gap-2 text-sm font-bold text-amber-200"><CircleAlert size={17} /> Google OAuthの認証情報が未設定です。</p><p className="text-xs leading-6 text-slate-400">Vercelの環境変数に GOOGLE_CLASSROOM_CLIENT_ID と GOOGLE_CLASSROOM_CLIENT_SECRET を登録してください。GOOGLE_CLASSROOM_REDIRECT_URI は省略できます（省略時は上記URIを自動使用）。</p></div>
        )}
        {pageMessage && <p role="status" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{pageMessage}</p>}
      </section>
      <section className="rounded-2xl border border-cyan-900/60 bg-cyan-950/20 p-5 space-y-4">
        <div className="flex items-center gap-2 text-cyan-200"><ShieldCheck size={18} /><h3 className="font-black">今回確認する権限</h3></div>
        <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-sm font-bold text-white">クラス一覧の読み取り</p><p className="mt-1 text-xs text-slate-400">自分が参加している有効なクラスを確認します。</p></div><div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p className="text-sm font-bold text-white">自分に割り当てられた課題の読み取り</p><p className="mt-1 text-xs text-slate-400">各クラス最大20件まで、課題一覧を読み取れるか確認します。</p></div></div>
        <div className="rounded-xl border border-cyan-900/50 bg-slate-950/70 p-3 text-xs leading-6 text-slate-300"><p className="font-bold text-cyan-200">データの扱い</p>接続テストでは課題のタイトルや提出状況を画面に表示せず、件数だけ確認します。Googleのアクセストークンや取得したClassroomデータは保存せず、CampusSyncへの掲載・LINE配信・課題の変更も行いません。</div>
        <button type="button" disabled={!status?.configured || loading} onClick={() => { window.location.assign('/api/admin/classroom/connect'); }} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"><ExternalLink size={16} /> Googleアカウントで接続テストを開始</button>
      </section>
      {result && <section className={'rounded-2xl border p-5 space-y-3 ' + (result.tone === 'success' ? 'border-emerald-700/50 bg-emerald-950/20' : result.tone === 'warning' ? 'border-amber-700/50 bg-amber-950/20' : 'border-rose-700/50 bg-rose-950/20')}><div className="flex items-center gap-2">{result.tone === 'success' ? <CircleCheck className="text-emerald-300" size={19} /> : <CircleAlert className={result.tone === 'warning' ? 'text-amber-300' : 'text-rose-300'} size={19} />}<h3 className="font-black text-white">{result.title}</h3></div><p className="text-sm leading-6 text-slate-300">{result.description}</p>{typeof testResult?.courses === 'number' && <div className="grid grid-cols-3 gap-2"><div className="rounded-xl bg-slate-950/70 p-3"><p className="text-[10px] text-slate-500">有効クラス</p><p className="mt-1 text-xl font-black text-white">{testResult.courses}</p></div><div className="rounded-xl bg-slate-950/70 p-3"><p className="text-[10px] text-slate-500">課題件数</p><p className="mt-1 text-xl font-black text-white">{testResult.assignments ?? 0}</p></div><div className="rounded-xl bg-slate-950/70 p-3"><p className="text-[10px] text-slate-500">課題を確認できたクラス</p><p className="mt-1 text-xl font-black text-white">{testResult.checked ?? 0}</p></div></div>}</section>}
      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-2"><div className="flex items-center gap-2 text-slate-200"><BookOpenCheck size={18} /><h3 className="font-black">学校側の許可について</h3></div><p className="text-xs leading-6 text-slate-400">Google Workspace for Educationでは、18歳未満の利用者が第三者アプリを使う場合、学校の管理者によるアプリ許可が必要になることがあります。また、管理者はClassroom APIへのデータアクセスを制限できます。許可画面でブロックされた場合は、その設定を学校のICT担当者・Google Workspace管理者に確認してください。制限を回避する方法は使いません。</p></section>
    </div>
  );
}