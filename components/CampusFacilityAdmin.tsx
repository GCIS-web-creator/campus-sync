'use client';

import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { Building2, MapPin, Plus, Save, Trash2, Image as ImageIcon, Crosshair } from 'lucide-react';

type FacilityRow = {
  id: string;
  name: string;
  category: string;
  building: string;
  floor_label: string;
  location_description: string;
  description: string;
  keywords: string[];
  map_image_url: string | null;
  map_x: number | null;
  map_y: number | null;
  is_active: boolean;
};

const CATEGORIES = [
  ['facility', '施設'],
  ['hall', 'ホール'],
  ['classroom', '教室・実験室'],
  ['meeting', '会議室'],
  ['library', '図書・学習'],
  ['study', '自習室'],
  ['sports', '体育施設'],
  ['office', '窓口'],
  ['other', 'その他'],
] as const;

const EMPTY_FORM = {
  name: '',
  category: 'facility',
  building: '',
  floor_label: '',
  location_description: '',
  description: '',
  keywords: '',
  map_image_url: '',
  map_x: '',
  map_y: '',
};

export default function CampusFacilityAdmin({ adminPassword }: { adminPassword: string }) {
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  const headers = { 'x-admin-password': adminPassword };
  const grouped = useMemo(() => {
    const groups = new Map<string, FacilityRow[]>();
    for (const row of facilities) {
      const group = [row.building || '建物未設定', row.floor_label || '階未設定'].join(' / ');
      groups.set(group, [...(groups.get(group) || []), row]);
    }
    return Array.from(groups.entries());
  }, [facilities]);

  const load = async () => {
    if (!adminPassword.trim()) {
      setMessage('Admin用パスワードを入力してください。');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/campus-facilities', { headers, cache: 'no-store' });
      const result = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(result?.facilities)) throw new Error(result?.message || '施設一覧を取得できませんでした。');
      setFacilities(result.facilities as FacilityRow[]);
      setMessage(result.facilities.length ? '' : '登録施設はありません。');
    } catch (error) {
      setFacilities([]);
      setMessage(error instanceof Error ? error.message : '施設一覧を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  };

  const edit = (row: FacilityRow) => {
    setEditingId(row.id);
    setForm({
      name: row.name,
      category: row.category,
      building: row.building || '',
      floor_label: row.floor_label || '',
      location_description: row.location_description || '',
      description: row.description || '',
      keywords: (row.keywords || []).join(', '),
      map_image_url: row.map_image_url || '',
      map_x: row.map_x === null ? '' : String(row.map_x),
      map_y: row.map_y === null ? '' : String(row.map_y),
    });
    setMessage('');
  };

  const save = async () => {
    if (saving) return;
    if (!adminPassword.trim()) {
      setMessage('Admin用パスワードを入力してください。');
      return;
    }
    if (!form.name.trim()) {
      setMessage('施設名を入力してください。');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/campus-facilities', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId || undefined,
          ...form,
          keywords: form.keywords.split(/[,、\n]/).map(value => value.trim()).filter(Boolean),
          map_x: form.map_x.trim() ? Number(form.map_x) : null,
          map_y: form.map_y.trim() ? Number(form.map_y) : null,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.facility) throw new Error(result?.message || '施設を保存できませんでした。');
      setMessage('施設情報を保存しました。');
      setEditingId(result.facility.id);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '施設を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: FacilityRow) => {
    if (!window.confirm('「' + row.name + '」を生徒用案内から非公開にしますか？')) return;
    try {
      const response = await fetch('/api/admin/campus-facilities', {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || '非公開にできませんでした。');
      setFacilities(current => current.filter(item => item.id !== row.id));
      if (editingId === row.id) {
        setEditingId('');
        setForm(EMPTY_FORM);
      }
      setMessage('施設を非公開にしました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '非公開にできませんでした。');
    }
  };

  const placePin = (event: MouseEvent<HTMLDivElement>) => {
    if (!form.map_image_url) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setForm(current => ({
      ...current,
      map_x: String(Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10),
      map_y: String(Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10),
    }));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-cyan-500/10 p-3 text-cyan-300"><Building2 size={24}/></div>
        <div><h2 className="text-2xl font-black text-white">校内マップ・施設案内管理</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">学校で確認した施設名・建物・階・場所を登録します。実際の校内図画像をHTTPS URLで設定すると、画像をクリックして正しい位置にピンを置けます。</p></div>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
        <label className="block text-xs font-bold text-slate-300">Admin用パスワード
          <div className="mt-1 rounded-xl border border-emerald-800/60 bg-emerald-950/30 px-3 py-3 text-xs font-bold text-emerald-300">管理者セッション認証済み</div>
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{loading ? '読み込み中…' : '施設一覧を読み込む'}</button>
          <button type="button" onClick={() => { setEditingId(''); setForm(EMPTY_FORM); setMessage('新しい施設を入力してください。'); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-200"><Plus size={15}/> 新規追加</button>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
          <h3 className="mb-3 text-sm font-black text-white">登録済み施設</h3>
          {grouped.map(([group, rows]) => (
            <div key={group} className="mb-4">
              <p className="mb-2 text-[10px] font-bold text-slate-500">{group}</p>
              <div className="space-y-1.5">{rows.map(row => (
                <div key={row.id} className={'flex items-center gap-2 rounded-xl border p-2 ' + (editingId === row.id ? 'border-cyan-500 bg-cyan-950/40' : 'border-slate-800 bg-slate-900')}>
                  <button type="button" onClick={() => edit(row)} className="min-w-0 flex-1 truncate text-left text-xs font-bold text-slate-200">{row.name}</button>
                  <span className="shrink-0 text-[9px] text-slate-500">{row.map_x !== null && row.map_y !== null ? 'ピン設定済み' : '位置未設定'}</span>
                  <button type="button" onClick={() => void remove(row)} aria-label="施設を非公開" className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-950 hover:text-rose-300"><Trash2 size={14}/></button>
                </div>
              ))}</div>
            </div>
          ))}
          {facilities.length === 0 && <p className="text-xs text-slate-500">{loading ? '読み込み中…' : '施設情報はまだ読み込まれていません。'}</p>}
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black text-white">{editingId ? '施設情報を編集' : '施設情報を新規登録'}</h3><span className="text-[10px] text-slate-500">位置情報は確認済みの内容のみ</span></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-300">施設名<input value={form.name} onChange={e => setForm(v => ({...v,name:e.target.value}))} maxLength={80} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white"/></label>
            <label className="text-xs font-bold text-slate-300">カテゴリ<select value={form.category} onChange={e => setForm(v => ({...v,category:e.target.value}))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white">{CATEGORIES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-300">建物<input value={form.building} onChange={e => setForm(v => ({...v,building:e.target.value}))} maxLength={300} placeholder="例：本館" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white"/></label>
            <label className="text-xs font-bold text-slate-300">階<input value={form.floor_label} onChange={e => setForm(v => ({...v,floor_label:e.target.value}))} maxLength={300} placeholder="例：3階" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white"/></label>
          </div>
          <label className="block text-xs font-bold text-slate-300">場所の案内<input value={form.location_description} onChange={e => setForm(v => ({...v,location_description:e.target.value}))} maxLength={300} placeholder="例：東側階段を上がって右手" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white"/></label>
          <label className="block text-xs font-bold text-slate-300">施設の説明<textarea value={form.description} onChange={e => setForm(v => ({...v,description:e.target.value}))} maxLength={300} rows={3} className="mt-1 w-full resize-y rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white"/></label>
          <label className="block text-xs font-bold text-slate-300">検索キーワード（カンマ・読点・改行で区切る）<input value={form.keywords} onChange={e => setForm(v => ({...v,keywords:e.target.value}))} maxLength={400} placeholder="例：図書、読書、勉強" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white"/></label>
          <label className="block text-xs font-bold text-slate-300"><span className="inline-flex items-center gap-2"><ImageIcon size={14}/> 校内図画像URL（HTTPS・任意）</span><input value={form.map_image_url} onChange={e => setForm(v => ({...v,map_image_url:e.target.value}))} placeholder="学校で承認された校内図の公開URL" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white"/></label>
          {form.map_image_url && (
            <div><p className="mb-1 text-[10px] font-bold text-slate-400">画像上をクリックするとピン位置を設定できます。</p><div className="relative cursor-crosshair overflow-hidden rounded-xl border border-slate-700 bg-slate-900" onClick={placePin}><img src={form.map_image_url} alt="校内図プレビュー" className="block max-h-72 w-full object-contain"/>{form.map_x && form.map_y && <span style={{left:form.map_x+'%',top:form.map_y+'%'}} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-600 p-1.5 text-white shadow-lg"><MapPin size={16}/></span>}</div></div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-slate-300">X座標（0〜100）<input type="number" min="0" max="100" step="0.1" value={form.map_x} onChange={e => setForm(v => ({...v,map_x:e.target.value}))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white"/></label>
            <label className="text-xs font-bold text-slate-300">Y座標（0〜100）<input type="number" min="0" max="100" step="0.1" value={form.map_y} onChange={e => setForm(v => ({...v,map_y:e.target.value}))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white"/></label>
          </div>
          {message && <p role="status" className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs leading-5 text-slate-300">{message}</p>}
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={16}/>{saving ? '保存中…' : '施設情報を保存'}</button>
        </section>
      </div>
    </div>
  );
}
