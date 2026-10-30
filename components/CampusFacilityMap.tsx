'use client';

import { useMemo, useState } from 'react';
import { MapPin, Search, Building2, LibraryBig, FlaskConical, Users, DoorOpen, Info } from 'lucide-react';

export type CampusFacility = {
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
};

const CATEGORY_LABELS: Record<string, string> = {
  hall: 'ホール',
  classroom: '教室・実験室',
  meeting: '会議室',
  library: '図書・学習',
  study: '自習室',
  sports: '体育施設',
  office: '窓口',
  other: 'その他',
  facility: '施設',
};

const CATEGORY_ICONS: Record<string, typeof Building2> = {
  hall: Building2,
  classroom: FlaskConical,
  meeting: Users,
  library: LibraryBig,
  study: LibraryBig,
  sports: Users,
  office: DoorOpen,
  other: MapPin,
  facility: Building2,
};

export default function CampusFacilityMap({ facilities, loadMessage = '' }: { facilities: CampusFacility[]; loadMessage?: string }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<CampusFacility | null>(null);

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(facilities.map(item => item.category)))],
    [facilities],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return facilities.filter(item => {
      const categoryMatches = category === 'all' || item.category === category;
      const text = [item.name, item.building, item.floor_label, item.location_description, item.description, ...(item.keywords || [])]
        .join(' ').toLocaleLowerCase();
      return categoryMatches && (!query || text.includes(query));
    });
  }, [facilities, search, category]);

  const mapGroups = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; image: string; facilities: CampusFacility[] }>();
    for (const item of filtered) {
      if (!item.map_image_url || item.map_x === null || item.map_y === null) continue;
      const key = [item.building, item.floor_label, item.map_image_url].join('|');
      const group = groups.get(key) || {
        key,
        label: [item.building, item.floor_label].filter(Boolean).join(' ・ ') || '校内マップ',
        image: item.map_image_url,
        facilities: [],
      };
      group.facilities.push(item);
      groups.set(key, group);
    }
    return Array.from(groups.values());
  }, [filtered]);

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
            <MapPin size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-slate-900">校内マップ・施設案内</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">登録済みの施設情報と、管理者が確認・配置したマップを表示します。</p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{facilities.length}施設</span>
        </div>

        <label className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <Search size={16} className="shrink-0 text-slate-400" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="施設名・建物・キーワードで検索" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
        </label>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {categories.map(value => (
            <button key={value} type="button" onClick={() => setCategory(value)} className={'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition ' + (category === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {value === 'all' ? 'すべて' : CATEGORY_LABELS[value] || value}
            </button>
          ))}
        </div>
      </section>

      {loadMessage && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">
          {loadMessage}
        </div>
      )}

      {mapGroups.length > 0 && (
        <div className="space-y-3">
          {mapGroups.map(group => (
            <section key={group.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-slate-800">{group.label}</h3>
              <div className="relative overflow-hidden rounded-xl bg-slate-100">
                <img src={group.image} alt={group.label + 'の校内マップ'} className="block h-auto max-h-[560px] w-full object-contain" />
                {group.facilities.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelected(item)}
                    title={item.name}
                    style={{ left: item.map_x + '%', top: item.map_y + '%' }}
                    className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border-2 border-white bg-cyan-700 px-2 py-1 text-[9px] font-black text-white shadow-lg ring-2 ring-cyan-300/70"
                  >
                    <MapPin size={11} className="shrink-0" />
                    <span className="max-w-24 truncate">{item.name}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-black text-slate-900">施設一覧</h3>
          <span className="text-[10px] text-slate-400">名前を押すと詳細を表示</span>
        </div>
        {filtered.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">一致する施設はありません。</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {filtered.map(item => {
              const Icon = CATEGORY_ICONS[item.category] || Building2;
              const hasMap = Boolean(item.map_image_url && item.map_x !== null && item.map_y !== null);
              return (
                <button key={item.id} type="button" onClick={() => setSelected(item)} className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-100 p-3 text-left transition hover:border-cyan-200 hover:bg-cyan-50/50">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700"><Icon size={18}/></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-black text-slate-800">{item.name}</span>
                    <span className="mt-1 block truncate text-[10px] text-slate-500">{[item.building, item.floor_label, item.location_description].filter(Boolean).join(' ・ ') || '場所情報は確認中'}</span>
                    <span className="mt-1 inline-block text-[9px] font-bold text-cyan-700">{hasMap ? 'マップ上の位置を表示できます' : '位置情報の登録待ち'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {facilities.length > 0 && mapGroups.length === 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">
          <Info size={16} className="mt-0.5 shrink-0" />
          現在、確認済みの校内マップ画像と位置情報はまだ登録されていません。施設名と案内情報を先に表示しています。未確認の場所を地図上に推測して表示することはありません。
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={selected.name + 'の詳細'} onClick={() => setSelected(null)}>
          <section className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[10px] font-black tracking-widest text-cyan-700">CAMPUS FACILITY</p><h3 className="mt-1 text-lg font-black text-slate-900">{selected.name}</h3></div>
              <button type="button" onClick={() => setSelected(null)} aria-label="閉じる" className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">閉じる</button>
            </div>
            <dl className="mt-4 space-y-3 text-xs">
              <div><dt className="font-bold text-slate-400">建物・階</dt><dd className="mt-1 font-semibold text-slate-800">{[selected.building, selected.floor_label].filter(Boolean).join(' ・ ') || '未登録'}</dd></div>
              <div><dt className="font-bold text-slate-400">場所の案内</dt><dd className="mt-1 whitespace-pre-wrap leading-5 text-slate-800">{selected.location_description || '詳細位置は学校で確認してください。'}</dd></div>
              <div><dt className="font-bold text-slate-400">施設情報</dt><dd className="mt-1 whitespace-pre-wrap leading-5 text-slate-700">{selected.description || '説明はまだ登録されていません。'}</dd></div>
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}
