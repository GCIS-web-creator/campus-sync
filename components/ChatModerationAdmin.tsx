'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSearch, Flag, History, LoaderCircle, MessageSquare, RefreshCw, Search, ShieldAlert, Trash2 } from 'lucide-react';

type View = 'reports' | 'messages' | 'audit';
type Scope = 'all' | 'class' | 'grade' | 'school';
type Status = 'open' | 'reviewing' | 'resolved' | 'dismissed';

type MessagePreview = {
  id: string;
  student_name?: string;
  user_class?: string;
  class_name?: string;
  scope?: string;
  body?: string;
  created_at?: string;
  deleted?: boolean;
  attachment_path?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
} | null;

type ChatReport = {
  id: string;
  message_id: string;
  message_table: 'class_chat_messages' | 'school_chat_messages';
  reason: string;
  details: string;
  status: Status;
  created_at: string;
  reviewed_at?: string | null;
  reporter_user_id?: string;
  message_preview?: MessagePreview;
};

type ChatMessage = {
  id: string;
  message_table: 'class_chat_messages' | 'school_chat_messages';
  student_name: string;
  student_id: string;
  class_name?: string;
  user_class?: string;
  scope: 'class' | 'grade' | 'school';
  scope_key?: string;
  body: string;
  created_at: string;
  updated_at: string;
  attachment_path?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
};

type AuditRow = {
  id: number;
  occurred_at: string;
  event_type: string;
  source_table: string;
  record_id?: string | null;
  student_name?: string | null;
  student_id?: string | null;
  user_class?: string | null;
  scope?: string | null;
  body?: string | null;
  previous_body?: string | null;
  reason?: string | null;
  details?: string | null;
  status?: string | null;
  previous_status?: string | null;
  actor_label?: string | null;
  metadata?: Record<string, unknown>;
};

type Payload = { reports: ChatReport[]; messages: ChatMessage[]; auditLogs: AuditRow[]; counts?: { openReports: number; totalReports: number; messages: number; auditEvents: number } };

type Props = {
  adminPassword: string;
  onAdminPasswordChange: (value: string) => void;
};

const STATUS_LABEL: Record<Status, string> = {
  open: '未対応',
  reviewing: '確認中',
  resolved: '対応済み',
  dismissed: '対象外',
};
const EVENT_LABEL: Record<string, string> = {
  baseline_snapshot: '移行時スナップショット',
  message_created: 'メッセージ投稿',
  message_updated: 'メッセージ編集',
  message_deleted: 'メッセージ削除',
  report_created: '通報受付',
  report_status_changed: '通報状態変更',
  admin_message_deleted: '管理者による削除',
  admin_report_status_changed: '管理者による通報処理',
  logs_exported: 'ログ書き出し',
};
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function ChatModerationAdmin({ adminPassword, onAdminPasswordChange }: Props) {
  const [view, setView] = useState<View>('reports');
  const [scope, setScope] = useState<Scope>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('open');
  const [searchText, setSearchText] = useState('');
  const [reports, setReports] = useState<ChatReport[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportAcknowledged, setExportAcknowledged] = useState(false);
  const [verificationFile, setVerificationFile] = useState<File | null>(null);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const initialLoadDone = useRef(false);

  const loadData = useCallback(async (nextScope: Scope = scope) => {
    if (!adminPassword.trim()) {
      setError('管理用パスワードを入力してください。');
      setLoaded(false);
      return;
    }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/chat?scope=' + encodeURIComponent(nextScope), {
        headers: { 'x-admin-password': adminPassword },
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || 'チャット管理データを読み込めませんでした。');
      setReports(Array.isArray(result.reports) ? result.reports : []);
      setMessages(Array.isArray(result.messages) ? result.messages : []);
      setAuditLogs(Array.isArray(result.auditLogs) ? result.auditLogs : []);
      setLoaded(true);
      setNotice('管理データを読み込みました。表示は最新分です。');
    } catch (caught) {
      setLoaded(false);
      setError(caught instanceof Error ? caught.message : 'チャット管理データを読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, [adminPassword, scope]);

  useEffect(() => {
    if (initialLoadDone.current || !adminPassword.trim()) return;
    initialLoadDone.current = true;
    void loadData(scope);
  }, [adminPassword, loadData, scope]);

  const search = searchText.trim().toLocaleLowerCase('ja-JP');
  const filteredReports = useMemo(() => reports.filter(report => {
    const matchesStatus = statusFilter === 'all' || report.status === statusFilter;
    const preview = report.message_preview;
    const haystack = [report.reason, report.details, preview?.body, preview?.student_name, preview?.user_class, preview?.class_name].filter(Boolean).join(' ').toLocaleLowerCase('ja-JP');
    return matchesStatus && (!search || haystack.includes(search));
  }), [reports, statusFilter, search]);

  const filteredMessages = useMemo(() => messages.filter(message => {
    const haystack = [message.body, message.student_name, message.student_id, message.user_class, message.class_name, message.scope].filter(Boolean).join(' ').toLocaleLowerCase('ja-JP');
    return !search || haystack.includes(search);
  }), [messages, search]);

  const filteredLogs = useMemo(() => auditLogs.filter(log => {
    const haystack = [EVENT_LABEL[log.event_type], log.event_type, log.student_name, log.student_id, log.user_class, log.body, log.previous_body, log.reason, log.actor_label].filter(Boolean).join(' ').toLocaleLowerCase('ja-JP');
    return !search || haystack.includes(search);
  }), [auditLogs, search]);

  async function updateReport(report: ChatReport, status: Status) {
    if (busyId || report.status === status) return;
    const note = window.prompt('今回の対応メモ（任意・500文字以内）。入力内容は監査ログに記録されます。', '');
    if (note === null) return;
    if (note.trim().length > 500) { setError('対応メモは500文字以内にしてください。'); return; }
    setBusyId(report.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/chat', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ id: report.id, status, note: note.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || '通報状態を更新できませんでした。');
      setReports(current => current.map(item => item.id === report.id ? result.report : item));
      await loadData();
      setNotice('通報を「' + STATUS_LABEL[status] + '」に更新しました。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '通報状態を更新できませんでした。');
    } finally {
      setBusyId('');
    }
  }

  async function deleteMessage(message: ChatMessage) {
    if (busyId) return;
    const reason = window.prompt('削除理由を入力してください（最大500文字）。理由は監査ログに記録されます。');
    if (!reason?.trim()) return;
    if (!window.confirm('このメッセージを削除しますか？内容は監査ログに保存されます。')) return;
    setBusyId(message.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/chat', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ id: message.id, message_table: message.message_table, reason: reason.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || 'メッセージを削除できませんでした。');
      setMessages(current => current.filter(item => item.id !== message.id));
      await loadData();
      setNotice('メッセージを削除し、理由を監査ログに記録しました。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'メッセージを削除できませんでした。');
    } finally {
      setBusyId('');
    }
  }

  async function exportLogs() {
    if (!adminPassword.trim() || exporting || !exportAcknowledged) {
      if (!adminPassword.trim()) setError('管理用パスワードを入力してください。');
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      setError('書き出し期間の開始日は終了日以前にしてください。');
      return;
    }
    setExporting(true);
    setError('');
    setNotice('');
    try {
      const params = new URLSearchParams({ format: 'cslogson' });
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const response = await fetch('/api/admin/chat?' + params.toString(), {
        headers: { 'x-admin-password': adminPassword },
        cache: 'no-store',
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result?.message || 'ログを書き出せませんでした。');
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'campus-sync-chat-logs.cslogson';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setNotice('監査ログを .cslogson 形式で書き出しました。');
      setExportAcknowledged(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ログを書き出せませんでした。');
    } finally {
      setExporting(false);
    }
  }

  async function verifyCslogson() {
    if (!verificationFile || verificationBusy) return;
    setVerificationBusy(true);
    setVerificationMessage('');
    try {
      if (verificationFile.size > 100 * 1024 * 1024) {
        throw new Error('ファイルが大きすぎます。100MB以下のログを選択してください。');
      }
      if (!window.crypto?.subtle) {
        throw new Error('このブラウザーではSHA-256の検証を利用できません。HTTPSで開いてください。');
      }
      const parsed = JSON.parse(await verificationFile.text()) as {
        format?: string;
        extension?: string;
        schema_version?: string;
        event_count?: number;
        integrity?: { initial_hash?: string; final_hash?: string };
        events?: Array<Record<string, unknown>>;
      };
      if (parsed.format !== 'CampusSync Chat Log JSON' || parsed.extension !== '.cslogson' || !Array.isArray(parsed.events)) {
        throw new Error('CampusSync .cslogson形式のファイルではありません。');
      }
      if (parsed.integrity?.initial_hash !== '0'.repeat(64)) {
        throw new Error('初期ハッシュが一致しません。');
      }

      let previousHash = '0'.repeat(64);
      for (let index = 0; index < parsed.events.length; index += 1) {
        const event = parsed.events[index];
        const integrity = event.integrity as Record<string, unknown> | undefined;
        if (!integrity || integrity.algorithm !== 'SHA-256' || integrity.sequence !== index + 1) {
          throw new Error('イベント ' + (index + 1) + ' の連番またはハッシュ形式が不正です。');
        }
        if (integrity.previous_hash !== previousHash) {
          throw new Error('イベント ' + (index + 1) + ' の前レコードハッシュが一致しません。');
        }
        const eventContent = { ...event };
        delete eventContent.integrity;
        const source = previousHash + '\n' + JSON.stringify(eventContent);
        const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
        const calculated = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        if (integrity.record_hash !== calculated) {
          throw new Error('イベント ' + (index + 1) + ' の内容ハッシュが一致しません。ファイルが変更された可能性があります。');
        }
        previousHash = calculated;
      }
      if (parsed.event_count !== parsed.events.length) {
        throw new Error('記録件数と実際のイベント数が一致しません。');
      }
      if (parsed.integrity?.final_hash !== previousHash) {
        throw new Error('最終ハッシュが一致しません。');
      }
      setVerificationMessage('検証成功：' + parsed.events.length.toLocaleString('ja-JP') + '件。ファイル内のSHA-256ハッシュ連鎖は一致しました。ただし、署名ではないため出所の真正性はこの検査だけでは証明できません。');
    } catch (caught) {
      setVerificationMessage('検証失敗：' + (caught instanceof Error ? caught.message : 'ファイルを検証できませんでした。'));
    } finally {
      setVerificationBusy(false);
    }
  }

  const openCount = reports.filter(report => report.status === 'open').length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[.22em] text-cyan-400">CHAT SAFETY & AUDIT</p>
          <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">チャット管理・監査ログ</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">クラス・学年・全校チャットの通報対応、投稿管理、操作履歴とログ書き出し。</p>
        </div>
        <button type="button" onClick={() => void loadData()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50">
          {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} 更新
        </button>
      </header>

      <section className="rounded-2xl border border-slate-700 bg-slate-950 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert size={20} className="mt-0.5 shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black text-white">管理者認証</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">既存の CAMPUS_SYNC_ADMIN_PASSWORD を使います。パスワードはブラウザーに保存せず、管理用APIへのリクエスト時だけ送信します。</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input type="password" autoComplete="current-password" value={adminPassword} onChange={event => onAdminPasswordChange(event.target.value)} placeholder="管理用パスワード" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500" />
              <button type="button" onClick={() => void loadData()} disabled={loading || !adminPassword.trim()} className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-cyan-400 disabled:opacity-50">{loading ? '確認中…' : loaded ? '認証して更新' : '認証して読み込む'}</button>
            </div>
          </div>
        </div>
      </section>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-900 bg-rose-950/70 p-3 text-sm text-rose-200"><AlertTriangle size={17} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-900 bg-emerald-950/60 p-3 text-sm text-emerald-200">{notice}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: '未対応の通報', value: reports.filter(row => row.status === 'open').length, icon: <Flag size={18} />, color: 'text-rose-300' },
          { label: '確認中', value: reports.filter(row => row.status === 'reviewing').length, icon: <FileSearch size={18} />, color: 'text-amber-300' },
          { label: '表示中のメッセージ', value: messages.length, icon: <MessageSquare size={18} />, color: 'text-cyan-300' },
          { label: '監査イベント', value: auditLogs.length, icon: <History size={18} />, color: 'text-violet-300' },
        ].map(card => (
          <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <div className={card.color}>{card.icon}</div>
            <p className="mt-3 text-2xl font-black text-white">{card.value}</p>
            <p className="mt-1 text-xs text-slate-400">{card.label}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="管理表示">
            {[
              { id: 'reports' as const, label: '通報対応', icon: <Flag size={15} /> },
              { id: 'messages' as const, label: '会話履歴', icon: <MessageSquare size={15} /> },
              { id: 'audit' as const, label: '監査ログ・書き出し', icon: <History size={15} /> },
            ].map(tab => (
              <button key={tab.id} type="button" role="tab" aria-selected={view === tab.id} onClick={() => setView(tab.id)} className={'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition-colors ' + (view === tab.id ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800')}>
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400">範囲
            <select value={scope} onChange={event => { const next = event.target.value as Scope; setScope(next); void loadData(next); }} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-white">
              <option value="all">全チャット</option><option value="class">クラス</option><option value="grade">学年</option><option value="school">全校</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="本文・生徒名・理由・ログを検索（表示中の最新分）" className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500" />
          </div>
          {view === 'reports' && <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as 'all' | Status)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white"><option value="open">未対応</option><option value="reviewing">確認中</option><option value="resolved">対応済み</option><option value="dismissed">対象外</option><option value="all">すべて</option></select>}
        </div>
      </section>

      {!loaded && !loading ? <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">管理パスワードを認証すると、通報・会話・監査ログがここに表示されます。</div> : null}
      {loading && !loaded ? <div className="flex items-center justify-center gap-3 py-12 text-sm text-slate-400"><LoaderCircle size={20} className="animate-spin" />チャット管理データを読み込んでいます…</div> : null}

      {loaded && view === 'reports' && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-black text-white"><Flag size={17} className="text-rose-300" />通報一覧 <span className="text-xs font-normal text-slate-500">({filteredReports.length}件表示)</span></div>
          {filteredReports.length === 0 && <div className="rounded-xl border border-slate-800 p-6 text-center text-sm text-slate-500">条件に合う通報はありません。</div>}
          {filteredReports.map(report => (
            <article key={report.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-white">{report.reason}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{formatDate(report.created_at)} · {report.message_table === 'class_chat_messages' ? 'クラスチャット' : '学年・全校チャット'}</p>
                </div>
                <span className={'rounded-full px-3 py-1 text-[11px] font-black ' + (report.status === 'open' ? 'bg-rose-950 text-rose-300' : report.status === 'reviewing' ? 'bg-amber-950 text-amber-300' : 'bg-slate-800 text-slate-300')}>{STATUS_LABEL[report.status]}</span>
              </div>
              {report.message_preview ? <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
                <p className="text-[11px] font-bold text-slate-400">{report.message_preview.student_name || '投稿者'} · {report.message_preview.user_class || report.message_preview.class_name || 'クラス不明'} {report.message_preview.deleted ? '· 削除済み' : ''}</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{report.message_preview.body}</p>
              </div> : <p className="mt-3 text-xs text-slate-500">元メッセージは既に削除済みか、監査ログから復元できません。</p>}
              {report.message_preview?.attachment_name && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-cyan-300"><span>添付：{report.message_preview.attachment_name} · {report.message_preview.attachment_mime || 'ファイル'}</span>{report.message_preview.attachment_url && <a href={report.message_preview.attachment_url} target="_blank" rel="noreferrer" className="rounded-lg border border-cyan-900 px-2 py-1 font-bold hover:bg-cyan-950">添付を確認（2分間有効）</a>}</div>}
              {report.details && <p className="mt-2 text-sm text-slate-400">通報者の補足：{report.details}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => void updateReport(report, 'reviewing')} disabled={busyId === report.id || report.status === 'reviewing'} className="rounded-lg border border-amber-800 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-950 disabled:opacity-40">確認中にする</button>
                <button type="button" onClick={() => void updateReport(report, 'resolved')} disabled={busyId === report.id || report.status === 'resolved'} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-500 disabled:opacity-40"><CheckCircle2 size={14}/>対応済みにする</button>
                <button type="button" onClick={() => void updateReport(report, 'dismissed')} disabled={busyId === report.id || report.status === 'dismissed'} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40">対象外にする</button>
                {busyId === report.id && <LoaderCircle size={16} className="animate-spin text-slate-400" />}
              </div>
            </article>
          ))}
        </section>
      )}

      {loaded && view === 'messages' && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-black text-white"><MessageSquare size={17} className="text-cyan-300" />会話履歴 <span className="text-xs font-normal text-slate-500">最新{messages.length}件の範囲内で検索</span></div>
          {filteredMessages.length === 0 && <div className="rounded-xl border border-slate-800 p-6 text-center text-sm text-slate-500">条件に合うメッセージはありません。</div>}
          {filteredMessages.map(message => (
            <article key={message.message_table + ':' + message.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-sm font-black text-white">{message.student_name} <span className="font-normal text-slate-400">· {message.student_id}</span></p><p className="mt-1 text-[11px] text-slate-500">{message.scope === 'class' ? (message.class_name || message.user_class) + ' クラス' : message.scope === 'grade' ? (message.scope_key || '?') + '年生' : '全校'} · {formatDate(message.created_at)}</p></div>
                <button type="button" onClick={() => void deleteMessage(message)} disabled={Boolean(busyId)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-900 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-950 disabled:opacity-40"><Trash2 size={14}/>削除</button>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{message.body}</p>
              {message.attachment_name && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-cyan-300"><span>📎 {message.attachment_name} · {message.attachment_mime || 'ファイル'}</span>{message.attachment_url && <a href={message.attachment_url} target="_blank" rel="noreferrer" className="rounded-lg border border-cyan-900 px-2 py-1 font-bold hover:bg-cyan-950">添付を確認（2分間有効）</a>}</div>}
            </article>
          ))}
        </section>
      )}

      {loaded && view === 'audit' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-cyan-900/70 bg-cyan-950/30 p-4">
            <div className="flex items-start gap-3">
              <Download size={20} className="mt-0.5 shrink-0 text-cyan-300" />
              <div className="min-w-0 flex-1">
                <h2 className="font-black text-white">.cslogson 監査ログを書き出す</h2>
                <p className="mt-1 text-xs leading-5 text-slate-400">JSONベースの独自拡張子。各イベントにSHA-256ハッシュチェーンを付け、書き出しファイル内の変更を検出しやすくします。</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-slate-400">開始日（空欄なら最初から）<input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"/></label>
                  <label className="text-xs text-slate-400">終了日（空欄なら最新まで）<input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"/></label>
                </div>
                <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-amber-200"><input type="checkbox" checked={exportAcknowledged} onChange={event => setExportAcknowledged(event.target.checked)} className="mt-1" />氏名・学籍番号・会話本文などの個人情報が含まれる可能性を理解し、学校が承認した保管先だけに保存します。</label>
                <button type="button" onClick={() => void exportLogs()} disabled={exporting || !adminPassword.trim() || !exportAcknowledged} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-cyan-400 disabled:opacity-50">{exporting ? <LoaderCircle size={16} className="animate-spin"/> : <Download size={16}/>} {exporting ? '書き出し中…' : '.cslogson をダウンロード'}</button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
            <div className="flex items-center gap-2"><ShieldAlert size={18} className="text-amber-300"/><h2 className="font-black text-white">.cslogson ファイルの整合性チェック</h2></div>
            <p className="mt-2 text-xs leading-5 text-slate-400">選択したファイルはこのブラウザー内で検証し、サーバーへアップロードしません。ハッシュ連鎖が一致しても、電子署名や別保管先の記録と照合しない限り、ファイルの出所まで保証するものではありません。</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input type="file" accept=".cslogson,.json,application/json" onChange={event => { setVerificationFile(event.target.files?.[0] ?? null); setVerificationMessage(''); }} className="min-w-0 flex-1 text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-200"/>
              <button type="button" onClick={() => void verifyCslogson()} disabled={!verificationFile || verificationBusy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-700 px-4 py-2 text-xs font-black text-violet-200 hover:bg-violet-950 disabled:opacity-40">{verificationBusy ? <LoaderCircle size={15} className="animate-spin"/> : <ShieldAlert size={15}/>} {verificationBusy ? '検証中…' : '整合性を検証'}</button>
            </div>
            {verificationMessage && <p role="status" className={'mt-3 rounded-xl p-3 text-xs leading-5 ' + (verificationMessage.startsWith('検証成功') ? 'bg-emerald-950 text-emerald-200' : 'bg-rose-950 text-rose-200')}>{verificationMessage}</p>}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
            <div className="flex items-center gap-2"><History size={18} className="text-violet-300"/><h2 className="font-black text-white">監査イベント</h2></div>
            <p className="mt-1 text-xs text-slate-500">最新{filteredLogs.length}件を表示。ログ全体は上のボタンから書き出せます。</p>
            <div className="mt-3 space-y-2">
              {filteredLogs.map(log => (
                <article key={log.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2"><p className="text-xs font-black text-white">{EVENT_LABEL[log.event_type] || log.event_type}</p><time className="text-[10px] text-slate-500">{formatDate(log.occurred_at)}</time></div>
                  <p className="mt-1 text-[11px] text-slate-400">{log.student_name || 'システム'} · {log.user_class || log.scope || '範囲不明'} · {log.actor_label || '不明な実行者'}</p>
                  {log.body && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-300">{log.body}</p>}
                  {log.previous_body && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-amber-200">編集前：{log.previous_body}</p>}
                  {log.reason && <p className="mt-1 text-xs text-rose-300">理由：{log.reason}</p>}
                  {log.previous_status && <p className="mt-1 text-xs text-slate-400">状態：{log.previous_status} → {log.status || '不明'}</p>}
                </article>
              ))}
              {!filteredLogs.length && <p className="py-6 text-center text-sm text-slate-500">検索条件に合う監査イベントはありません。</p>}
            </div>
          </div>
        </section>
      )}

      <p className="text-[11px] leading-5 text-slate-500">注意：管理者が共通パスワードで操作した記録は個人を特定しません。本番運用では職員ごとの認証を推奨します。ログの利用目的・保存期間・閲覧権限は学校の規程とプライバシー案内に合わせて決めてください。</p>
    </div>
  );
}
