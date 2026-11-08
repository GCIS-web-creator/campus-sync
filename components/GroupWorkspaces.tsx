'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Plus, Search, RefreshCw, Check, X, Copy, ShieldCheck, Crown, UserPlus } from 'lucide-react';

type Workspace = {
  id: string;
  name: string;
  category: string;
  description: string;
  visibility: 'listed' | 'unlisted';
  join_mode: 'invite_only' | 'approval' | 'open';
  is_official: boolean;
  member_count: number;
  my_role: string | null;
  request_status: string | null;
};
type Member = { id: string; user_id: string; student_id: string; display_name: string; user_class: string; member_role: string; joined_at: string };
type JoinRequest = { id: string; user_id: string; student_id: string; display_name: string; user_class: string; message: string; requested_at: string };
const CATEGORY: Record<string, string> = {
  club: '部活動', committee: '委員会', event: '学校行事', project: 'プロジェクト',
  study: '勉強会', research: '研究', volunteer: '自主活動', other: 'その他',
};
const ROLE: Record<string, string> = { owner: 'オーナー', admin: '管理者', editor: '編集者', member: 'メンバー', adviser: '顧問・担当教員' };
const JOIN: Record<string, string> = { invite_only: '招待制', approval: '申請・承認制', open: '自由参加' };

export default function GroupWorkspaces({ isDarkMode = false }: { isDarkMode?: boolean }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selected, setSelected] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', category: 'club', visibility: 'listed', join_mode: 'approval' });
  const [inviteId, setInviteId] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [cardCodes, setCardCodes] = useState<Record<string, string>>({});
  const [issuedCode, setIssuedCode] = useState<{ id: string; code: string; expiresAt: string } | null>(null);

  const dark = isDarkMode;
  const panel = dark ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-900';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const field = dark ? 'border-slate-600 bg-slate-900 text-white placeholder:text-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400';

  const api = async (path: string, method = 'GET', body?: unknown) => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error('学校アカウントでログインしてください。');
    const response = await fetch(path, {
      method,
      headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) throw new Error(result?.message || '処理に失敗しました。');
    return result;
  };

  const load = async () => {
    setLoading(true);
    try {
      const result = await api('/api/workspaces');
      setWorkspaces(result.workspaces || []);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '一覧を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async (workspace: Workspace) => {
    setSelected(workspace);
    setIssuedCode(null);
    try {
      const result = await api('/api/workspaces/' + workspace.id + '/members');
      setMembers(result.members || []);
      setRequests(result.requests || []);
      setRole(result.role || '');
    } catch (error) {
      setMembers([]);
      setRequests([]);
      setRole('');
      setMessage(error instanceof Error ? error.message : 'メンバーを取得できませんでした。');
    }
  };

  useEffect(() => { void load(); }, []);

  const createWorkspace = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api('/api/workspaces', 'POST', form);
      setForm({ name: '', description: '', category: 'club', visibility: 'listed', join_mode: 'approval' });
      setShowCreate(false);
      await load();
      setMessage('共有ワークスペースを作成しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '作成できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const joinWorkspace = async (workspace: Workspace, code = '') => {
    setSaving(true);
    setMessage('');
    try {
      const result = await api('/api/workspaces/' + workspace.id + '/join', 'POST', { invite_code: code });
      setMessage(result.message || '参加処理を完了しました。');
      setCardCodes((previous) => ({ ...previous, [workspace.id]: '' }));
      await load();
      if (result.state === 'joined' || result.state === 'already_member') await loadMembers(workspace);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '参加できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const joinWithInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[0-9a-f-]{36}$/i.test(inviteId.trim())) {
      setMessage('グループIDは正しい形式で入力してください。');
      return;
    }
    setSaving(true);
    try {
      const result = await api('/api/workspaces/' + inviteId.trim() + '/join', 'POST', { invite_code: inviteCode });
      setMessage(result.message || '招待コードを確認しました。');
      setInviteCode('');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '招待コードを利用できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const leaveWorkspace = async () => {
    if (!selected || role === 'owner') return;
    if (!window.confirm(selected.name + 'から退出しますか？')) return;
    setSaving(true);
    try {
      await api('/api/workspaces/' + selected.id + '/members', 'PATCH', { action: 'leave_workspace' });
      setSelected(null);
      setMembers([]);
      setRequests([]);
      setRole('');
      await load();
      setMessage('グループから退出しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '退出できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const createInvite = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const result = await api('/api/workspaces/' + selected.id + '/members', 'POST', { expires_in_hours: 168, max_uses: 5 });
      setIssuedCode({ id: selected.id, code: result.invite.code, expiresAt: result.invite.expires_at });
      setMessage('招待コードを発行しました。コードはこの画面を閉じると再表示できません。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '招待コードを発行できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const memberAction = async (body: Record<string, unknown>, successMessage: string) => {
    if (!selected) return;
    setSaving(true);
    try {
      await api('/api/workspaces/' + selected.id + '/members', 'PATCH', body);
      await loadMembers(selected);
      await load();
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'メンバー管理を更新できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const filtered = workspaces.filter((workspace) => {
    const matchesSearch = !search || (workspace.name + ' ' + workspace.description).toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || workspace.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });
  const myWorkspaces = filtered.filter((workspace) => workspace.my_role);
  const discoverable = filtered.filter((workspace) => !workspace.my_role && workspace.visibility === 'listed');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Users className="text-cyan-500" size={24} /><h1 className="text-2xl font-black">共有ワークスペース</h1></div>
          <p className={'mt-1 text-sm ' + muted}>部活・委員会・行事・プロジェクトなど、校内のあらゆるグループの活動拠点です。</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} disabled={loading} className={'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ' + field}><RefreshCw size={15} />更新</button>
          <button type="button" onClick={() => setShowCreate((value) => !value)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-black text-white hover:bg-cyan-700"><Plus size={16} />グループ作成</button>
        </div>
      </header>

      <section className={'rounded-2xl border p-4 ' + panel}>
        <div className="mb-3 flex items-center gap-2"><Search size={17} className="text-cyan-500" /><h2 className="font-black">グループを探す</h2></div>
        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="グループ名・説明で検索" className={'w-full rounded-xl border px-3 py-2.5 text-sm ' + field} />
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={'rounded-xl border px-3 py-2.5 text-sm ' + field}>
            <option value="all">すべての種類</option>
            {Object.entries(CATEGORY).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
        <form onSubmit={joinWithInvite} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input value={inviteId} onChange={(event) => setInviteId(event.target.value)} placeholder="招待されたグループID" className={'min-w-0 rounded-xl border px-3 py-2.5 text-xs ' + field} />
          <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="招待コード" className={'min-w-0 rounded-xl border px-3 py-2.5 font-mono text-xs ' + field} />
          <button type="submit" disabled={saving} className="rounded-xl bg-slate-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">招待で参加</button>
        </form>
      </section>

      {showCreate && (
        <section className={'rounded-2xl border p-4 sm:p-5 ' + panel}>
          <h2 className="font-black">新しいグループを作成</h2>
          <form onSubmit={createWorkspace} className="mt-4 space-y-3">
            <label className="block text-xs font-bold">グループ名<input required minLength={2} maxLength={60} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="例：文化祭実行委員会" className={'mt-1.5 w-full rounded-xl border px-3 py-3 text-sm ' + field} /></label>
            <label className="block text-xs font-bold">活動内容・説明<textarea maxLength={800} rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="目的や活動内容を入力" className={'mt-1.5 w-full rounded-xl border px-3 py-3 text-sm ' + field} /></label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-bold">種類<select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className={'mt-1.5 w-full rounded-xl border px-3 py-3 text-sm ' + field}>{Object.entries(CATEGORY).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
              <label className="text-xs font-bold">参加方法<select value={form.join_mode} onChange={(event) => setForm((current) => ({ ...current, join_mode: event.target.value }))} className={'mt-1.5 w-full rounded-xl border px-3 py-3 text-sm ' + field}><option value="approval">申請・承認制</option><option value="invite_only">招待制</option><option value="open">自由参加</option></select></label>
              <label className="text-xs font-bold">一覧への表示<select value={form.visibility} onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value }))} className={'mt-1.5 w-full rounded-xl border px-3 py-3 text-sm ' + field}><option value="listed">一覧に表示</option><option value="unlisted">非公開（招待制）</option></select></label>
            </div>
            <p className={'text-xs leading-5 ' + muted}>最初に作成した人がオーナーになります。学校公認の表示は作成者には設定できず、教職員用管理画面でのみ認定できます。</p>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border px-4 py-2 text-xs font-bold">キャンセル</button><button type="submit" disabled={saving} className="rounded-xl bg-cyan-600 px-5 py-2 text-xs font-black text-white disabled:opacity-50">{saving ? '作成中…' : '作成する'}</button></div>
          </form>
        </section>
      )}

      {message && <p role="status" className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm">{message}</p>}

      {selected && (
        <section className={'rounded-2xl border p-4 sm:p-5 ' + panel}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black">{selected.name}</h2>{selected.is_official && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black text-emerald-500"><ShieldCheck size={13} />学校公認</span>}</div><p className={'mt-1 text-xs ' + muted}>{CATEGORY[selected.category] || 'その他'} ・ {ROLE[role] || 'メンバー'} ・ {members.length}人</p></div>
            <div className="flex items-center gap-2">
              {role && role !== 'owner' && <button type="button" onClick={() => void leaveWorkspace()} disabled={saving} className="rounded-lg border border-rose-500/40 px-3 py-2 text-xs font-bold text-rose-500 disabled:opacity-50">退出する</button>}
              <button type="button" onClick={() => { setSelected(null); setMembers([]); setRequests([]); }} className="rounded-lg border px-3 py-2 text-xs font-bold">閉じる</button>
            </div>
          </div>
          {['owner','admin'].includes(role) && <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void createInvite()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-black text-white"><UserPlus size={15} />招待コードを発行</button></div>}
          {issuedCode?.id === selected.id && <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3"><p className="text-xs font-bold text-emerald-500">招待コード（この場で一度だけ表示）</p><div className="mt-2 flex flex-wrap items-center gap-2"><code className="break-all rounded-lg bg-black/10 px-3 py-2 font-mono text-sm">{issuedCode.code}</code><button type="button" onClick={() => void navigator.clipboard.writeText(issuedCode.code)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold"><Copy size={14} />コピー</button></div><p className={'mt-2 text-[10px] ' + muted}>有効期限：{new Date(issuedCode.expiresAt).toLocaleString('ja-JP')} ・ 最大5回</p><p className={'mt-1 text-[10px] ' + muted}>グループID：{selected.id}</p></div>}
          {requests.length > 0 && <div className="mt-5"><h3 className="font-black">参加申請 <span className="text-cyan-500">{requests.length}</span></h3><div className="mt-2 space-y-2">{requests.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"><div><p className="text-sm font-bold">{item.display_name}（{item.user_class}組）</p>{item.message && <p className={'mt-1 text-xs ' + muted}>{item.message}</p>}</div><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => void memberAction({ action: 'approve_request', request_id: item.id }, '参加申請を承認しました。')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Check size={14} className="mr-1 inline" />承認</button><button type="button" disabled={saving} onClick={() => void memberAction({ action: 'reject_request', request_id: item.id }, '参加申請を却下しました。')} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white"><X size={14} className="mr-1 inline" />却下</button></div></div>)}</div></div>}
          <div className="mt-5"><h3 className="font-black">メンバー</h3><div className="mt-2 divide-y divide-slate-500/10">{members.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="flex min-w-0 items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-xs font-black text-cyan-500">{member.display_name.slice(0,1)}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{member.display_name} {member.member_role === 'owner' ? <Crown size={12} className="inline" /> : null}</p><p className={'text-[10px] ' + muted}>{member.user_class}組 ・ {ROLE[member.member_role] || member.member_role}</p></div></div><div className="flex items-center gap-2">{role === 'owner' && member.member_role !== 'owner' && <><select aria-label={member.display_name + 'の権限'} value={member.member_role} onChange={(event) => void memberAction({ action: 'change_role', user_id: member.user_id, member_role: event.target.value }, 'メンバー権限を変更しました。')} className={'rounded-lg border px-2 py-1.5 text-[10px] ' + field}><option value="member">メンバー</option><option value="editor">編集者</option><option value="admin">管理者</option></select><button type="button" disabled={saving} onClick={() => { if (window.confirm(member.display_name + 'さんにオーナーを引き継ぎますか？')) void memberAction({ action: 'transfer_owner', user_id: member.user_id }, 'オーナーを引き継ぎました。'); }} className="rounded-lg border px-2 py-1.5 text-[10px] font-bold">引き継ぐ</button></>}{['owner','admin'].includes(role) && member.member_role !== 'owner' && <button type="button" disabled={saving} onClick={() => { if (window.confirm(member.display_name + 'さんをグループから退出させますか？')) void memberAction({ action: 'remove_member', user_id: member.user_id }, 'メンバーを退出させました。'); }} className="rounded-lg border border-rose-500/30 px-2 py-1.5 text-[10px] font-bold text-rose-500">退出</button>}</div></div>)}</div></div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-black">参加中のグループ</h2><span className={'text-xs ' + muted}>{myWorkspaces.length}件</span></div>
        {loading ? <p className={'py-8 text-center text-sm ' + muted}>読み込み中…</p> : myWorkspaces.length === 0 ? <div className={'rounded-2xl border p-8 text-center ' + panel}><Users className="mx-auto text-slate-400" size={28} /><p className="mt-2 font-bold">まだ参加しているグループはありません。</p><p className={'mt-1 text-xs ' + muted}>一覧から探すか、新しいグループを作成できます。</p></div> : <div className="grid gap-3 sm:grid-cols-2">{myWorkspaces.map((workspace) => <article key={workspace.id} className={'rounded-2xl border p-4 ' + panel}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-black">{workspace.name}</h3><p className={'mt-1 text-xs ' + muted}>{CATEGORY[workspace.category]} ・ {JOIN[workspace.join_mode]} ・ {workspace.member_count}人</p></div>{workspace.is_official && <ShieldCheck size={18} className="shrink-0 text-emerald-500" />}</div><p className={'mt-2 line-clamp-2 text-xs leading-5 ' + muted}>{workspace.description || '説明はまだありません。'}</p><button type="button" onClick={() => void loadMembers(workspace)} className="mt-4 w-full rounded-xl bg-cyan-600 px-3 py-2.5 text-xs font-black text-white">ワークスペースを開く</button></article>)}</div>}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-black">参加できるグループ</h2><span className={'text-xs ' + muted}>{discoverable.length}件</span></div>
        {discoverable.length === 0 ? <div className={'rounded-2xl border p-6 text-center text-xs ' + panel + ' ' + muted}>表示できるグループはありません。</div> : <div className="grid gap-3 sm:grid-cols-2">{discoverable.map((workspace) => <article key={workspace.id} className={'rounded-2xl border p-4 ' + panel}><div className="flex items-center justify-between gap-2"><h3 className="font-black">{workspace.name}</h3>{workspace.is_official && <span className="text-[10px] font-black text-emerald-500">学校公認</span>}</div><p className={'mt-1 text-xs ' + muted}>{CATEGORY[workspace.category]} ・ {JOIN[workspace.join_mode]} ・ {workspace.member_count}人</p><p className={'mt-2 line-clamp-2 text-xs leading-5 ' + muted}>{workspace.description || '説明はまだありません。'}</p>{workspace.request_status === 'pending' ? <p className="mt-3 rounded-lg bg-amber-500/10 p-2 text-center text-xs font-bold text-amber-600">参加申請中</p> : workspace.join_mode === 'invite_only' ? <div className="mt-3 flex gap-2"><input value={cardCodes[workspace.id] || ''} onChange={(event) => setCardCodes((current) => ({ ...current, [workspace.id]: event.target.value.toUpperCase() }))} placeholder="招待コード" className={'min-w-0 flex-1 rounded-lg border px-2 py-2 font-mono text-xs ' + field} /><button type="button" onClick={() => void joinWorkspace(workspace, cardCodes[workspace.id] || '')} disabled={saving || !(cardCodes[workspace.id] || '').trim()} className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">参加</button></div> : <button type="button" onClick={() => void joinWorkspace(workspace)} disabled={saving} className="mt-3 w-full rounded-xl bg-cyan-600 px-3 py-2.5 text-xs font-black text-white disabled:opacity-50">{workspace.join_mode === 'open' ? '参加する' : '参加を申請する'}</button>}</article>)}</div>}
      </section>

      <p className={'text-[10px] leading-5 ' + muted}>各グループの投稿・チャット・ファイル等はメンバーだけが閲覧できます。グループ運営に必要な操作履歴は記録され、学校公認の表示は教職員が認定したものだけです。</p>
    </div>
  );
}
