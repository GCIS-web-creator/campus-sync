"use client";

import React, { useState } from "react";
import { BellRing, CheckCircle2, ClipboardList, Download, KeyRound, LoaderCircle, Plus, RefreshCw, ShieldCheck, Trash2, UserCheck, UserX } from "lucide-react";

type Props = {
  adminPassword: string;
  onAdminPasswordChange: (value: string) => void;
};
type ClubNote = {
  id: string | number;
  club_name: string;
  title: string;
  content: string;
  author?: string | null;
  author_name?: string | null;
  created_at: string;
  line_delivery_status?: string | null;
  line_delivery_error?: string | null;
  line_sent_at?: string | null;
  line_request_id?: string | null;
};
type Permission = {
  user_id: string;
  student_id: string;
  student_name: string;
  user_class: string;
  can_post: boolean;
  display_name: string;
  updated_at: string;
};
type PostingCode = {
  id: string;
  allowed_student_id: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  status: "active" | "expired" | "used";
};
type Snapshot = { notes: ClubNote[]; permissions: Permission[]; codes: PostingCode[] };
type ActionResult = {
  message?: string;
  code?: string;
  expiresAt?: string;
  note?: ClubNote;
  success?: boolean;
  lineDelivery?: { status: "sent" | "disabled" | "failed" | "already_sent"; message: string };
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "日時不明"
    : new Intl.DateTimeFormat("ja-JP", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false, timeZone: "Asia/Tokyo",
      }).format(date);
};

export default function ClubNotesAdmin({ adminPassword, onAdminPasswordChange }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ notes: [], permissions: [], codes: [] });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"info" | "error" | "success">("info");
  const [clubName, setClubName] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [authorName, setAuthorName] = useState("CampusSync Admin");
  const [studentId, setStudentId] = useState("");
  const [permissionDisplayName, setPermissionDisplayName] = useState("");
  const [codeStudentId, setCodeStudentId] = useState("");
  const [newlyIssuedCode, setNewlyIssuedCode] = useState<{ code: string; studentId: string; expiresAt: string } | null>(null);

  const request = async (method: "GET" | "POST", payload?: Record<string, unknown>): Promise<ActionResult & Partial<Snapshot>> => {
    if (!adminPassword.trim()) throw new Error("管理用パスワードを入力してください。");
    const response = await fetch("/api/admin/club-posts", {
      method,
      headers: {
        "x-admin-password": adminPassword,
        ...(payload ? { "content-type": "application/json" } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.message || `処理に失敗しました（HTTP ${response.status}）。`);
    return result;
  };

  const loadData = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await request("GET");
      setSnapshot({
        notes: Array.isArray(result.notes) ? result.notes : [],
        permissions: Array.isArray(result.permissions) ? result.permissions : [],
        codes: Array.isArray(result.codes) ? result.codes : [],
      });
      setLoaded(true);
      setMessageKind("success");
      setMessage("投稿・許可一覧を更新しました。");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "データを読み込めませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const postAdminNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clubName.trim() || !title.trim() || !content.trim() || !authorName.trim()) {
      setMessageKind("error");
      setMessage("部活・委員会名、件名、本文、発信者名をすべて入力してください。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await request("POST", { action: "post", clubName, title, content, authorName });
      setClubName(""); setTitle(""); setContent("");
      await loadData();
      setMessageKind(result.lineDelivery?.status === "failed" ? "error" : "success");
      setMessage(result.lineDelivery?.message || "タイムラインに投稿しました。");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "投稿できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const updatePermission = async (action: "grant" | "revoke", id: string, displayName = "") => {
    if (!/^\d{6}$/.test(id)) {
      setMessageKind("error");
      setMessage("学籍番号は6桁の数字で入力してください。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await request("POST", { action, studentId: id, displayName });
      setMessageKind("success");
      setMessage(result.message || "投稿権限を更新しました。");
      await loadData();
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "投稿権限を更新できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const issueCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(codeStudentId)) {
      setMessageKind("error");
      setMessage("コードを渡す対象の学籍番号を6桁で入力してください。");
      return;
    }
    setBusy(true);
    setNewlyIssuedCode(null);
    setMessage("");
    try {
      const result = await request("POST", { action: "issue-code", studentId: codeStudentId });
      if (!result.code || !result.expiresAt) throw new Error("コードの応答を読み取れませんでした。");
      setNewlyIssuedCode({ code: result.code, studentId: codeStudentId, expiresAt: result.expiresAt });
      setMessageKind("success");
      setMessage(result.message || "一回限りコードを発行しました。");
      setCodeStudentId("");
      await loadData();
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "コードを発行できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const retryLine = async (note: ClubNote) => {
    if (!window.confirm(`「${note.title}」のLINE配信を再試行しますか？送信状況によっては同じ内容の再送となる場合があります。`)) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await request("POST", { action: "retry-line", id: note.id });
      await loadData();
      setMessageKind(result.success ? "success" : "error");
      setMessage(result.message || "LINE配信状態を確認しました。");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "LINE配信を再試行できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const deleteNote = async (note: ClubNote) => {
    if (!window.confirm(`「${note.title}」をタイムラインから削除しますか？この操作は取り消せません。`)) return;
    setBusy(true);
    setMessage("");
    try {
      await request("POST", { action: "delete-post", id: note.id });
      setMessageKind("success");
      setMessage("投稿を削除しました。");
      await loadData();
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "投稿を削除できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const messageClass = messageKind === "error"
    ? "border-rose-800 bg-rose-950/30 text-rose-200"
    : messageKind === "success"
      ? "border-emerald-800 bg-emerald-950/30 text-emerald-200"
      : "border-slate-700 bg-slate-900 text-slate-300";

  return (
    <section className="space-y-6 text-slate-100">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[.2em] text-violet-300">CLUB & COMMITTEE</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">部活・委員会投稿管理</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Adminからの直接投稿、投稿許可の付与・解除、対象生徒専用の一回限り8桁コード、既存投稿の削除を管理します。</p>
        </div>
        <button type="button" onClick={() => void loadData()} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-bold hover:bg-slate-800 disabled:opacity-50">
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} 最新データを読み込む
        </button>
      </header>

      <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
        <label htmlFor="club-admin-password" className="block text-sm font-bold">管理用パスワード</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input id="club-admin-password" type="password" autoComplete="current-password" value={adminPassword} onChange={event => onAdminPasswordChange(event.target.value)} placeholder="CAMPUS_SYNC_ADMIN_PASSWORD" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white" />
          <button type="button" onClick={() => void loadData()} disabled={busy || !adminPassword.trim()} className="rounded-xl bg-slate-700 px-4 py-3 text-sm font-black hover:bg-slate-600 disabled:opacity-50">接続して読み込む</button>
        </div>
        {message && <p role={messageKind === "error" ? "alert" : "status"} className={`mt-3 rounded-xl border p-3 text-sm leading-6 ${messageClass}`}>{message}</p>}
      </div>

      {newlyIssuedCode && (
        <div className="rounded-2xl border border-amber-700 bg-amber-950/40 p-4">
          <p className="flex items-center gap-2 text-sm font-black text-amber-100"><KeyRound size={18} /> 発行したコード（今回だけ表示）</p>
          <p className="mt-2 text-xs leading-5 text-amber-200">対象学籍番号 {newlyIssuedCode.studentId} 専用です。24時間で期限切れになり、投稿に使うと再使用できません。再読込後はコード自体を再表示できません。</p>
          <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <code className="rounded-xl bg-black/30 px-4 py-3 text-2xl font-black tracking-[.25em] text-white">{newlyIssuedCode.code}</code>
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(newlyIssuedCode.code); }} className="rounded-xl border border-amber-700 px-3 py-2 text-sm font-bold text-amber-100">コードをコピー</button>
          </div>
          <p className="mt-2 text-xs text-amber-200/80">有効期限：{formatDate(newlyIssuedCode.expiresAt)}</p>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={postAdminNote} className="space-y-4 rounded-2xl border border-slate-700 bg-slate-950 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-lg font-black"><BellRing size={20} className="text-violet-300" /> Adminから投稿</h2>
          <label className="block text-sm font-bold">部活・委員会名<input required maxLength={80} value={clubName} onChange={e => setClubName(e.target.value)} placeholder="例：生徒会執行部" className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm" /></label>
          <label className="block text-sm font-bold">件名<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder="件名・タイトル" className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm" /></label>
          <label className="block text-sm font-bold">本文<textarea required maxLength={3000} rows={5} value={content} onChange={e => setContent(e.target.value)} placeholder="連絡事項、日時、場所、持ち物など" className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm" /></label>
          <label className="block text-sm font-bold">タイムラインに表示する発信者名<input required maxLength={50} value={authorName} onChange={e => setAuthorName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm" /></label>
          <button type="submit" disabled={busy || !adminPassword.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-black text-slate-950 hover:bg-violet-400 disabled:opacity-40"><Plus size={17} /> タイムラインに掲示</button>
        </form>

        <div className="space-y-4 rounded-2xl border border-slate-700 bg-slate-950 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-lg font-black"><ShieldCheck size={20} className="text-emerald-300" /> 投稿者の許可管理</h2>
          <form onSubmit={event => { event.preventDefault(); void updatePermission("grant", studentId, permissionDisplayName); }} className="space-y-3">
            <label className="block text-sm font-bold">許可する生徒の学籍番号（6桁）<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={studentId} onChange={e => setStudentId(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="例：580098" className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm" /></label>
            <label className="block text-sm font-bold">この人の既定表示名（任意）<input maxLength={50} value={permissionDisplayName} onChange={e => setPermissionDisplayName(e.target.value)} placeholder="例：生徒会広報担当" className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm" /></label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="submit" disabled={busy || !adminPassword.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-3 text-sm font-black text-slate-950 disabled:opacity-40"><UserCheck size={16} /> 投稿を許可</button>
              <button type="button" disabled={busy || !/^\d{6}$/.test(studentId) || !adminPassword.trim()} onClick={() => void updatePermission("revoke", studentId)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-700 px-3 py-3 text-sm font-black text-rose-200 disabled:opacity-40"><UserX size={16} /> 投稿を禁止</button>
            </div>
          </form>
          <div className="border-t border-slate-800 pt-4">
            <h3 className="flex items-center gap-2 text-sm font-black"><KeyRound size={16} /> 一回限りの8桁コードを発行</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">対象の学籍番号に紐づけて発行します。有効期限は24時間で、コードはハッシュで保存し、発行時の1回だけ表示します。</p>
            <form onSubmit={issueCode} className="mt-3 flex gap-2">
              <input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={codeStudentId} onChange={e => setCodeStudentId(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="対象の学籍番号6桁" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm" />
              <button type="submit" disabled={busy || !adminPassword.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-3 py-2.5 text-sm font-black text-slate-950 disabled:opacity-40"><KeyRound size={15} /> 発行</button>
            </form>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
          <h2 className="flex items-center gap-2 text-lg font-black"><UserCheck size={19} /> 投稿権限一覧</h2>
          {!loaded ? <p className="mt-3 text-sm text-slate-400">管理用パスワードを入力して「最新データを読み込む」を押してください。</p> : snapshot.permissions.length === 0 ? <p className="mt-3 text-sm text-slate-400">投稿許可ユーザーはまだ登録されていません。</p> : (
            <div className="mt-3 space-y-2">
              {snapshot.permissions.map(row => (
                <div key={row.user_id} className="flex flex-col gap-2 rounded-xl border border-slate-800 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-sm font-bold">{row.student_name || "氏名未設定"}（{row.student_id}）</p><p className="text-xs text-slate-400">{row.user_class || "クラス未設定"} · 表示名：{row.display_name || "投稿時の入力名"}</p><p className={`mt-1 text-xs font-bold ${row.can_post ? "text-emerald-300" : "text-rose-300"}`}>{row.can_post ? "投稿許可中" : "投稿禁止中"}</p></div>
                  <button type="button" disabled={busy} onClick={() => void updatePermission(row.can_post ? "revoke" : "grant", row.student_id, row.display_name || "")} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold hover:bg-slate-800 disabled:opacity-40">{row.can_post ? "許可を解除" : "再び許可"}</button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
          <h2 className="flex items-center gap-2 text-lg font-black"><KeyRound size={19} /> 発行済みコードの状態</h2>
          {!loaded ? <p className="mt-3 text-sm text-slate-400">データを読み込むと表示されます。</p> : snapshot.codes.length === 0 ? <p className="mt-3 text-sm text-slate-400">発行済みコードはありません。</p> : (
            <div className="mt-3 space-y-2">
              {snapshot.codes.map(code => (
                <div key={code.id} className="rounded-xl border border-slate-800 p-3">
                  <div className="flex items-center justify-between gap-2"><p className="text-sm font-bold">対象：{code.allowed_student_id}</p><span className={`rounded-full px-2 py-1 text-[10px] font-black ${code.status === "active" ? "bg-emerald-950 text-emerald-300" : "bg-slate-800 text-slate-300"}`}>{code.status === "active" ? "使用可能" : code.status === "used" ? "使用済み" : "期限切れ"}</span></div>
                  <p className="mt-1 text-xs text-slate-400">発行：{formatDate(code.created_at)}</p><p className="text-xs text-slate-400">期限：{formatDate(code.expires_at)}</p>
                  {code.used_at && <p className="text-xs text-slate-400">使用：{formatDate(code.used_at)}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
        <h2 className="flex items-center gap-2 text-lg font-black"><ClipboardList size={19} /> タイムライン投稿管理</h2>
        {!loaded ? <p className="mt-3 text-sm text-slate-400">データを読み込むと投稿が表示されます。</p> : snapshot.notes.length === 0 ? <p className="mt-3 text-sm text-slate-400">投稿はありません。</p> : (
          <div className="mt-3 space-y-3">
            {snapshot.notes.map(note => {
              const lineStatus = note.line_delivery_status || "not_sent";
              const statusLabel = lineStatus === "sent" ? "LINE送信済み"
                : lineStatus === "sending" ? "LINE送信中"
                : lineStatus === "disabled" ? "自動配信OFF"
                : lineStatus === "failed" ? "LINE送信失敗" : "未送信";
              const statusClass = lineStatus === "sent" ? "bg-emerald-950 text-emerald-300"
                : lineStatus === "failed" ? "bg-rose-950 text-rose-300"
                : lineStatus === "sending" ? "bg-amber-950 text-amber-200"
                : "bg-slate-800 text-slate-300";
              return (
              <article key={String(note.id)} className="rounded-xl border border-slate-800 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-violet-300">{note.club_name}</p>
                    <h3 className="mt-1 text-sm font-black">{note.title}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-300">{note.content}</p>
                    <p className="mt-2 text-xs text-slate-400">発信者：{note.author_name || note.author || "学校からのお知らせ"} · {formatDate(note.created_at)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-black ${statusClass}`}>{statusLabel}</span>
                      {note.line_sent_at && <span className="text-[10px] text-slate-400">LINE送信日時：{formatDate(note.line_sent_at)}</span>}
                    </div>
                    {note.line_delivery_error && <p className="mt-1 text-xs text-rose-300">送信情報：{note.line_delivery_error}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {lineStatus !== "sent" && (
                      <button type="button" disabled={busy} onClick={() => void retryLine(note)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-amber-700 px-3 py-2 text-xs font-bold text-amber-200 disabled:opacity-40"><RefreshCw size={14} /> LINE送信</button>
                    )}
                    <button type="button" disabled={busy} onClick={() => void deleteNote(note)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-800 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-40"><Trash2 size={14} /> 削除</button>
                  </div>
                </div>
              </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
