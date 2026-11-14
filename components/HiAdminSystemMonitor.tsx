'use client';

import React, { useEffect, useState } from 'react';
import { Activity, AlertCircle, Bot, CheckCircle2, Clock3, Cloud, MessageSquareText, RefreshCw, ShieldCheck } from 'lucide-react';

type ConversationMessage = { role: 'user' | 'assistant'; content: string };
type Conversation = {
  label: string;
  chat_type: 'group' | 'room';
  bot_slot: number;
  messages: ConversationMessage[];
  expires_at: string | null;
  updated_at: string | null;
  daily_requests: number;
  last_request_at: string | null;
  active: boolean;
};
type CloudflareLog = {
  time: string | null;
  level: string;
  message: string;
  error: string | null;
  trigger: string;
  status: number | null;
  outcome: string;
};

type Props = { token: string; password2: string; password3: string };
type Section = 'ai' | 'cloudflare';

const dateText = (value?: string | null) => value
  ? new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
  : '記録なし';

export default function HiAdminSystemMonitor({ token, password2, password3 }: Props) {
  const [section, setSection] = useState<Section>('ai');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [logs, setLogs] = useState<CloudflareLog[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState('');
  const [minutes, setMinutes] = useState('15');
  const [errorsOnly, setErrorsOnly] = useState(true);
  const [logWindow, setLogWindow] = useState<{ from: string; to: string } | null>(null);

  const request = async (query: string) => {
    const response = await fetch('/api/hiadmin?' + query, {
      headers: {
        Authorization: 'Bearer ' + token,
        'Cache-Control': 'no-store',
        'X-HiAdmin-Password-2': password2,
        'X-HiAdmin-Password-3': password3,
      },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || '監視データを取得できませんでした。') as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return data;
  };

  const loadConversations = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const data = await request('view=ai-conversations');
      setConversations(Array.isArray(data.chats) ? data.chats : []);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : '初等AIの会話履歴を取得できませんでした。');
    } finally {
      setAiLoading(false);
    }
  };

  const loadCloudflareLogs = async () => {
    setLogLoading(true);
    setLogError('');
    try {
      const params = new URLSearchParams({
        view: 'cloudflare-logs',
        minutes,
        errors: errorsOnly ? '1' : '0',
      });
      const data = await request(params.toString());
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setLogWindow({ from: data.from, to: data.to });
    } catch (error) {
      setLogError(error instanceof Error ? error.message : 'Cloudflareログを取得できませんでした。');
      setLogs([]);
      setLogWindow(null);
    } finally {
      setLogLoading(false);
    }
  };

  useEffect(() => {
    if (token && password2 && password3) void loadConversations();
    // The authenticated token and the two additional passwords define the server-side gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, password2, password3]);

  const activeCount = conversations.filter((item) => item.active).length;
  const errorCount = logs.filter((item) => item.level === 'error' || (item.status !== null && item.status >= 400)).length;

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">System observability</p>
          <h2 className="mt-1 text-xl font-black">運用監視</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">初等AIの会話状態と、Cloudflare Workerの実行ログを確認します。</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300/15 bg-emerald-300/5 px-3 py-2 text-[11px] font-bold text-emerald-200">
          <ShieldCheck size={15} /> 最高管理者専用・閲覧操作を監査記録
        </div>
      </header>

      <nav className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.025] p-2">
        <button onClick={() => setSection('ai')} className={'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition ' + (section === 'ai' ? 'bg-cyan-300 text-slate-950' : 'text-slate-400 hover:bg-white/5 hover:text-white')}>
          <MessageSquareText size={15} /> 初等AI会話
        </button>
        <button onClick={() => setSection('cloudflare')} className={'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition ' + (section === 'cloudflare' ? 'bg-cyan-300 text-slate-950' : 'text-slate-400 hover:bg-white/5 hover:text-white')}>
          <Cloud size={15} /> Cloudflareログ
        </button>
      </nav>

      {section === 'ai' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-xs font-bold text-slate-400">保存中の会話枠</p>
              <p className="mt-2 text-2xl font-black tabular-nums">{conversations.length}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-xs font-bold text-slate-400">有効な会話</p>
              <p className="mt-2 text-2xl font-black tabular-nums text-emerald-300">{activeCount}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-xs font-bold text-slate-400">表示対象</p>
              <p className="mt-2 text-sm font-black">直近30グループ・各3往復まで</p>
            </article>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black">LINE初等AIの会話履歴</h3>
              <p className="mt-1 text-[11px] text-slate-400">会話内容は保存期間内の直近6メッセージのみ。閲覧は監査ログに記録されます。</p>
            </div>
            <button disabled={aiLoading} onClick={() => void loadConversations()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/5 disabled:opacity-50">
              <RefreshCw size={14} className={aiLoading ? 'animate-spin' : ''} /> 更新
            </button>
          </div>

          {aiError && <div className="flex items-start gap-2 rounded-xl border border-rose-300/20 bg-rose-300/5 p-3 text-xs leading-5 text-rose-100"><AlertCircle size={15} className="mt-0.5 shrink-0" />{aiError}</div>}
          {aiLoading && <p className="flex items-center gap-2 py-4 text-xs text-cyan-200"><RefreshCw size={14} className="animate-spin" />会話履歴を読み込んでいます…</p>}
          {!aiLoading && !aiError && conversations.length === 0 && <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center"><Bot className="mx-auto mb-2 text-slate-500" size={25} /><p className="text-sm font-bold text-slate-300">会話履歴はまだありません</p><p className="mt-1 text-xs text-slate-500">LINEグループで初等AIを起動すると、直近の会話が表示されます。</p></div>}

          <div className="space-y-4">
            {conversations.map((chat, index) => (
              <article key={chat.label + '-' + index} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <MessageSquareText size={16} className="text-cyan-300" />
                    <b className="text-sm">{chat.label}</b>
                    <span className="rounded-lg bg-white/5 px-2 py-1 text-[10px] text-slate-400">BOT slot {chat.bot_slot}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className={'rounded-full px-2 py-1 font-bold ' + (chat.active ? 'bg-emerald-300/10 text-emerald-200' : 'bg-slate-700/50 text-slate-400')}>{chat.active ? '会話中' : '停止・期限切れ'}</span>
                    <span className="text-slate-500">更新 {dateText(chat.updated_at)}</span>
                  </div>
                </div>
                <div className="space-y-2 p-4">
                  {chat.messages.map((message, messageIndex) => (
                    <div key={messageIndex} className={'max-w-3xl rounded-xl px-3 py-2.5 ' + (message.role === 'assistant' ? 'bg-cyan-300/10 text-cyan-50' : 'ml-auto bg-white/[0.06] text-slate-100')}>
                      <p className="mb-1 text-[10px] font-black text-slate-400">{message.role === 'assistant' ? 'CampusSync 初等AI' : 'LINE利用者'}</p>
                      <p className="whitespace-pre-wrap break-words text-xs leading-5">{message.content}</p>
                    </div>
                  ))}
                  {chat.messages.length === 0 && <p className="text-xs text-slate-500">表示できる会話本文はありません。</p>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/5 bg-black/10 px-4 py-2 text-[10px] text-slate-500">
                  <span>本日の利用回数: {Number(chat.daily_requests || 0).toLocaleString('ja-JP')}</span>
                  <span>最終利用: {dateText(chat.last_request_at)}</span>
                  <span>履歴期限: {dateText(chat.expires_at)}</span>
                </div>
              </article>
            ))}
          </div>
          <p className="rounded-xl border border-amber-300/10 bg-amber-300/[0.04] p-3 text-[10px] leading-5 text-amber-100/80">会話本文は運用トラブルの確認目的で最高管理者だけに表示します。必要以上に共有・転載せず、個人情報が含まれている場合は取り扱いに注意してください。</p>
        </div>
      )}

      {section === 'cloudflare' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-base font-black">Cloudflare Worker 実行ログ</h3>
              <p className="mt-1 text-[11px] text-slate-400">campus-syncの保存済みログを検索します。取得は手動更新のみです。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] text-slate-400">期間
                <select value={minutes} onChange={(event) => setMinutes(event.target.value)} className="ml-2 rounded-lg border border-white/10 bg-slate-900 px-2 py-2 text-xs text-white">
                  <option value="5">直近5分</option>
                  <option value="15">直近15分</option>
                  <option value="60">直近1時間</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-[11px] text-slate-300">
                <input type="checkbox" checked={errorsOnly} onChange={(event) => setErrorsOnly(event.target.checked)} />
                エラーのみ
              </label>
              <button disabled={logLoading} onClick={() => void loadCloudflareLogs()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50">
                <RefreshCw size={14} className={logLoading ? 'animate-spin' : ''} /> ログ取得
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-[11px] leading-5 text-slate-300">
            <p className="font-bold text-slate-100">接続方式</p>
            <p className="mt-1">Cloudflare APIトークンはサーバー側だけで使い、ブラウザには送信しません。CloudflareのTelemetry Query APIは仕様上 <code>Workers Observability Write</code> 権限を要求しますが、この画面からWorker設定やログを書き換える処理は行いません。</p>
          </div>

          {logError && (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4 text-xs leading-5 text-amber-100">
              <div className="flex items-center gap-2 font-black"><AlertCircle size={15} />ログを取得できませんでした</div>
              <p className="mt-2">{logError}</p>
              {logError.includes('CLOUDFLARE_') || logError.includes('未設定') ? (
                <div className="mt-3 space-y-2 rounded-xl bg-black/20 p-3">
                  <p className="font-bold">Cloudflare Dashboardで次の2つを設定してください。</p>
                  <p><code>CLOUDFLARE_ACCOUNT_ID</code>：アカウントID（通常のテキスト変数）</p>
                  <p><code>CLOUDFLARE_API_TOKEN</code>：上記の権限だけを付けたAPIトークン（Secret）</p>
                  <p className="text-amber-100/70">Workers & Pages → campus-sync → Settings → Variables and Secrets。値はGitHubやこの画面には貼らないでください。</p>
                  <a className="inline-flex items-center gap-1 text-cyan-200 underline" href="https://developers.cloudflare.com/workers/authorization/workers/" target="_blank" rel="noreferrer">権限の公式説明 <ShieldCheck size={12} /></a>
                </div>
              ) : null}
            </div>
          )}

          {logWindow && <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500"><span>{dateText(logWindow.from)} ～ {dateText(logWindow.to)}</span><span>{logs.length}件{errorsOnly ? '（エラー条件）' : ''} / 最大80件</span></div>}
          {logLoading && <p className="flex items-center gap-2 py-4 text-xs text-cyan-200"><RefreshCw size={14} className="animate-spin" />Cloudflareからログを取得しています…</p>}
          {logs.length > 0 && <div className="space-y-2">
            {logs.map((log, index) => (
              <article key={(log.time || 'event') + '-' + index} className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={'rounded-md px-2 py-1 text-[10px] font-black uppercase ' + (log.level === 'error' || (log.status !== null && log.status >= 500) ? 'bg-rose-400/10 text-rose-200' : log.status !== null && log.status >= 400 ? 'bg-amber-300/10 text-amber-100' : 'bg-slate-700/60 text-slate-300')}>{log.level}</span>
                  <span className="text-[10px] text-slate-400">{dateText(log.time)}</span>
                  {log.status !== null && <span className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-300">HTTP {log.status}</span>}
                  {log.outcome && <span className="text-[10px] text-slate-500">{log.outcome}</span>}
                </div>
                <p className="mt-2 break-words text-xs font-semibold leading-5 text-slate-100">{log.message}</p>
                {log.error && <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-5 text-rose-200">{log.error}</p>}
                <p className="mt-2 break-all font-mono text-[10px] text-slate-500">{log.trigger}</p>
              </article>
            ))}
          </div>}
          {!logLoading && !logError && logWindow && logs.length === 0 && <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center"><CheckCircle2 className="mx-auto mb-2 text-emerald-300" size={24} /><p className="text-sm font-bold text-slate-300">該当するログはありません</p><p className="mt-1 text-xs text-slate-500">条件または期間を変えて再取得してください。</p></div>}
          {!logWindow && !logError && !logLoading && <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center"><Activity className="mx-auto mb-2 text-slate-500" size={24} /><p className="text-sm font-bold text-slate-300">ログはまだ取得していません</p><p className="mt-1 text-xs text-slate-500">期間を選び「ログ取得」を押してください。</p></div>}
        </div>
      )}
    </section>
  );
}
