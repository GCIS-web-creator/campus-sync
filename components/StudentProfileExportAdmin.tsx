"use client";

import React, { useState } from "react";
import { Download, FileLock2, ShieldAlert } from "lucide-react";

type Props = {
  adminPassword: string;
};

export default function StudentProfileExportAdmin({ adminPassword }: Props) {
  const [exportPassword, setExportPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success" | "info">("info");

  const exportProfiles = async () => {
    if (!adminPassword.trim()) {
      setMessageType("error");
      setMessage("先に管理用パスワードを入力してください。");
      return;
    }
    if (!exportPassword) {
      setMessageType("error");
      setMessage("書き出し確認パスワードを入力してください。");
      return;
    }
    if (!confirmed) {
      setMessageType("error");
      setMessage("個人情報を含むファイルを安全に保管することを確認してください。");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/student-profiles", {
        method: "POST",
        headers: {
          "x-admin-password": adminPassword,
          "x-export-confirmation-password": exportPassword,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.message || `書き出しに失敗しました（HTTP ${response.status}）。`);
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const nameMatch = /filename="([^"]+)"/i.exec(disposition);
      const filename = nameMatch?.[1] || `campus-sync-student-profiles-${new Date().toISOString().slice(0, 10)}.cslogson`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessageType("success");
      setMessage("プロフィールの .cslogson ファイルを作成しました。安全な場所に保管し、不要になったコピーは削除してください。");
      setExportPassword("");
      setConfirmed(false);
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "書き出しに失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const messageClass = messageType === "success"
    ? "border-emerald-800 bg-emerald-950/40 text-emerald-200"
    : messageType === "error"
      ? "border-rose-800 bg-rose-950/40 text-rose-200"
      : "border-slate-700 bg-slate-900 text-slate-300";

  return (
    <section className="space-y-5 text-slate-100">
      <header>
        <p className="text-xs font-black uppercase tracking-[.22em] text-amber-300">SENSITIVE DATA EXPORT</p>
        <h1 className="mt-1 text-2xl font-black sm:text-3xl">生徒プロフィール .cslogson 書き出し</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">書き出し操作を行うまで生徒データをこの画面に一覧表示しません。ファイルには氏名・学年クラス・学校メールアドレスなどが含まれます。</p>
      </header>

      <div className="flex items-start gap-3 rounded-2xl border border-amber-800/80 bg-amber-950/30 p-4">
        <ShieldAlert size={21} className="mt-0.5 shrink-0 text-amber-300" />
        <div className="text-sm leading-6 text-amber-100">
          <p className="font-black">重要：パスワードそのものは書き出しません</p>
          <p className="mt-1 text-amber-200/80">Supabase Auth が管理するパスワード、パスワードハッシュ、認証トークンは取得・表示・出力しません。書き出し対象は必要最小限のプロフィール情報と整合性検証用ハッシュです。</p>
        </div>
      </div>

      <div className="max-w-2xl rounded-2xl border border-slate-700 bg-slate-950 p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <FileLock2 size={20} className="text-cyan-300" />
          <h2 className="font-black">二段階の確認</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">管理画面に入力した管理用パスワードに加えて、Vercel の環境変数 <code>STUDENT_PROFILE_EXPORT_PASSWORD</code> に設定した書き出し確認用シークレットを入力します。シークレットはソースコードやファイルに含めないでください。</p>

        <label className="mt-5 block text-sm font-bold" htmlFor="student-profile-export-password">書き出し確認パスワード</label>
        <input
          id="student-profile-export-password"
          type="password"
          autoComplete="off"
          value={exportPassword}
          onChange={(event) => setExportPassword(event.target.value)}
          disabled={busy}
          placeholder="確認用シークレット"
          className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-cyan-500 disabled:opacity-60"
        />

        <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-slate-300">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={busy}
            className="mt-1 size-4 accent-cyan-500"
          />
          <span>生徒の個人情報を含むファイルであることを理解し、許可された目的で保管・利用します。</span>
        </label>

        {message && <p role={messageType === "error" ? "alert" : "status"} className={`mt-4 rounded-xl border p-3 text-sm leading-6 ${messageClass}`}>{message}</p>}

        <button
          type="button"
          onClick={() => void exportProfiles()}
          disabled={busy || !adminPassword.trim() || !exportPassword || !confirmed}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download size={17} />
          {busy ? "書き出し中…" : "確認して .cslogson を書き出す"}
        </button>
      </div>
    </section>
  );
}
