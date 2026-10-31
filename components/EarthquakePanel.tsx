'use client';

import { useEffect, useMemo, useState } from 'react';
import EarthquakeIntensityMap, { type EarthquakeMapEvent, type EarthquakeObservedArea } from '@/components/EarthquakeIntensityMap';

type EarthquakeEvent = EarthquakeMapEvent & {
  product_code: string; title: string; headline: string; issued_at: string; event_time: string | null;
  depth_km: number | null; magnitude: number | null; kodaira_intensity: string | null; kodaira_intensity_rank: number | null;
  eew_targets: string[]; eew_kodaira_target: boolean; eew_forecast_intensity: string | null;
  is_eew: boolean; is_eew_cancelled: boolean; updated_at: string;
};
type EarthquakeResponse = {
  events: EarthquakeEvent[];
  sync: { highLastSuccessAt: string | null; longLastSuccessAt: string | null; lastAttemptAt: string | null; lastError: string | null; stale: boolean };
};
type AreaGroup = { name: string; areas: EarthquakeObservedArea[]; maxRank: number };

function dateText(value: string | null): string {
  if (!value) return '発生時刻不明';
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) return '発生時刻不明';
  return time.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function rankFromIntensity(value: string | null | undefined): number {
  if (!value) return 0;
  const map: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4, '5-': 5, '5弱': 5, '5+': 6, '5強': 6, '6-': 7, '6弱': 7, '6+': 8, '6強': 8, '7': 9 };
  return map[value.normalize('NFKC').replace(/\s/g, '')] || 0;
}
function intensityLabel(rank: number, fallback?: string | null): string {
  const labels: Record<number, string> = { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5弱', 6: '5強', 7: '6弱', 8: '6強', 9: '7' };
  return labels[rank] || fallback || '—';
}
function intensityColor(rank: number): string {
  const colors: Record<number, string> = { 1: '#94a3b8', 2: '#3b82f6', 3: '#0d9488', 4: '#ca8a04', 5: '#ea580c', 6: '#dc2626', 7: '#c026d3', 8: '#7e22ce', 9: '#7f1d1d' };
  return colors[rank] || '#94a3b8';
}
function groupObservedAreas(areas: EarthquakeObservedArea[]): AreaGroup[] {
  const groups = new Map<string, EarthquakeObservedArea[]>();
  for (const area of areas || []) {
    const key = area.prefecture || '都道府県情報なし';
    const current = groups.get(key) || [];
    current.push(area);
    groups.set(key, current);
  }
  return Array.from(groups.entries()).map(([name, rows]) => ({
    name,
    areas: rows.sort((a, b) => (b.intensityRank || rankFromIntensity(b.intensity)) - (a.intensityRank || rankFromIntensity(a.intensity))),
    maxRank: Math.max(0, ...rows.map(area => area.intensityRank || rankFromIntensity(area.intensity))),
  })).sort((a, b) => b.maxRank - a.maxRank || a.name.localeCompare(b.name, 'ja'));
}
function IntensityOutline({ rank, text }: { rank: number; text: string }) {
  const color = intensityColor(rank);
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-transparent px-2 py-0.5 text-[10px] font-black tabular-nums" style={{ color, borderColor: color }}>
      <i className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />{text}
    </span>
  );
}

export default function EarthquakePanel() {
  const [data, setData] = useState<EarthquakeResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState('');
  const [detailsByKey, setDetailsByKey] = useState<Record<string, EarthquakeEvent>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/earthquakes', { cache: 'no-store' });
        const result = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(result?.events) || !result?.sync) throw new Error(result?.message || '地震情報を取得できませんでした。');
        if (!cancelled) {
          setData(result as EarthquakeResponse);
          setSelectedKey(current => current || result.events[0]?.event_key || '');
          setError('');
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : '地震情報を取得できませんでした。');
          setData(current => current ? { ...current, sync: { ...current.sync, stale: true } } : current);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, []);

  const events = data?.events || [];
  const selectedBase = useMemo(() => events.find(event => event.event_key === selectedKey) || events[0] || null, [events, selectedKey]);
  const selected = selectedBase ? detailsByKey[selectedBase.event_key] || selectedBase : null;

  useEffect(() => {
    if (!selectedBase?.event_key || detailsByKey[selectedBase.event_key]) return;
    let cancelled = false;
    const loadDetails = async () => {
      setDetailLoading(true);
      try {
        const response = await fetch('/api/earthquakes?eventKey=' + encodeURIComponent(selectedBase.event_key), { cache: 'no-store' });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.event) throw new Error(result?.message || '観測地点の詳細を取得できませんでした。');
        if (!cancelled) setDetailsByKey(current => ({ ...current, [selectedBase.event_key]: result.event as EarthquakeEvent }));
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : '観測地点の詳細を取得できませんでした。');
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    };
    void loadDetails();
    return () => { cancelled = true; };
  }, [selectedBase?.event_key, detailsByKey]);

  const areaGroups = useMemo(() => selected ? groupObservedAreas(selected.observed_areas || []) : [], [selected]);
  const updatedAt = data?.sync.highLastSuccessAt ? dateText(data.sync.highLastSuccessAt) : null;
  const stale = !data || data.sync.stale;

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div>
            <p className="text-[9px] font-black tracking-[0.18em] text-violet-600 dark:text-violet-300">CAMPUSSYNC / EARTHQUAKE</p>
            <h3 className="mt-1 text-sm font-black text-slate-900 dark:text-white">地震情報・震度分布</h3>
            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">気象庁発表データ ／ 全国・海外</p>
          </div>
          <div className="text-right">
            <p className={'text-[10px] font-black ' + (stale ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300')}>{loading ? '初回取得中' : stale ? '更新遅延・確認中' : '自動更新中'}</p>
            <p className="mt-0.5 text-[9px] text-slate-400">{updatedAt ? '最終確認 ' + updatedAt : '確認時刻未取得'}</p>
          </div>
        </div>

        {stale && (
          <div className="border-b border-amber-100 bg-amber-50/70 px-4 py-2.5 text-[10px] leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
            {error || data?.sync.lastError || '地震データの更新が遅れています。表示中の情報は最後に取得できた内容です。'}
            <span className="mt-0.5 block opacity-80">緊急時はテレビ・防災行政無線・気象庁などの公式情報も確認してください。</span>
          </div>
        )}

        {loading && !data ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map(item => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)}</div>
        ) : error && !data ? (
          <p role="status" className="p-5 text-sm text-rose-600 dark:text-rose-300">{error}</p>
        ) : events.length === 0 ? (
          <p className="p-5 text-sm font-bold text-slate-600 dark:text-slate-300">表示できる地震情報はまだありません。初回同期が完了すると、ここに最新情報が表示されます。</p>
        ) : (
          <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(250px,0.78fr)_minmax(0,1.22fr)]">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <h4 className="text-[11px] font-black text-slate-700 dark:text-slate-200">最近の地震</h4>
                <span className="text-[9px] tabular-nums text-slate-400">最大60件 ／ {events.length}件</span>
              </div>
              <div className="max-h-[660px] space-y-1.5 overflow-y-auto pr-1">
                {events.map(event => {
                  const active = selected?.event_key === event.event_key;
                  const rank = event.max_intensity_rank || rankFromIntensity(event.max_intensity);
                  const color = intensityColor(rank);
                  const localIntensity = event.kodaira_intensity ? '小平市 ' + event.kodaira_intensity : '';
                  return (
                    <button type="button" key={event.event_key} onClick={() => setSelectedKey(event.event_key)} style={{ borderLeftColor: color }}
                      className={'group flex w-full items-center gap-2.5 rounded-xl border border-l-[3px] px-2.5 py-2 text-left transition ' + (active
                        ? 'border-violet-300 bg-violet-50/50 dark:border-violet-800 dark:bg-violet-950/20'
                        : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800/60')}>
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-bold tabular-nums text-slate-400">{dateText(event.event_time || event.issued_at)}</p>
                        <p className="mt-0.5 truncate text-xs font-black text-slate-900 dark:text-white">{event.hypocenter_name || event.title || '震源情報'}</p>
                        <p className="mt-1 truncate text-[10px] text-slate-500 dark:text-slate-400">
                          {event.magnitude === null ? 'M —' : 'M' + event.magnitude.toFixed(1)}{'　・　'}最大震度 {event.max_intensity || '—'}{localIntensity ? '　・　' + localIntensity : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {rank > 0 && <IntensityOutline rank={rank} text={intensityLabel(rank, event.max_intensity)} />}
                        {event.is_eew && !event.is_eew_cancelled && <span className="text-[8px] font-black text-rose-600 dark:text-rose-300">緊急地震速報</span>}
                        {event.is_eew_cancelled && <span className="text-[8px] font-bold text-slate-400">速報取消</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-w-0 space-y-3">
              {selected ? (
                <>
                  <section className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-3 py-3 dark:border-slate-800">
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold text-slate-400">選択中の地震</p>
                        <h4 className="mt-0.5 break-words text-sm font-black text-slate-900 dark:text-white">{selected.hypocenter_name || selected.title}</h4>
                        <p className="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">{dateText(selected.event_time || selected.issued_at)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {selected.magnitude !== null && <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-black text-slate-600 dark:border-slate-600 dark:text-slate-300">M{selected.magnitude.toFixed(1)}</span>}
                        {(selected.max_intensity_rank || rankFromIntensity(selected.max_intensity)) > 0 && (
                          <IntensityOutline rank={selected.max_intensity_rank || rankFromIntensity(selected.max_intensity)} text={'最大 ' + intensityLabel(selected.max_intensity_rank || rankFromIntensity(selected.max_intensity), selected.max_intensity)} />
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
                      {[
                        ['震源の深さ', selected.depth_km === null ? '—' : Math.round(selected.depth_km) + ' km'],
                        ['最大震度', selected.max_intensity || '—'],
                        ['小平市', selected.kodaira_intensity ? '震度' + selected.kodaira_intensity : '観測なし'],
                        ['観測市町村', String((selected.observed_areas || []).length) + ' 地点'],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-slate-200 px-2.5 py-2 dark:border-slate-700">
                          <p className="text-[9px] font-semibold text-slate-400">{label}</p>
                          <p className="mt-0.5 text-xs font-black text-slate-800 dark:text-slate-100">{value}</p>
                        </div>
                      ))}
                    </div>
                    {selected.eew_targets.length > 0 && (
                      <div className="border-t border-slate-100 px-3 py-2 dark:border-slate-800">
                        <p className="text-[9px] font-bold text-slate-400">緊急地震速報の対象区域</p>
                        <p className="mt-1 text-[10px] font-semibold leading-relaxed text-slate-700 dark:text-slate-300">{selected.eew_targets.join('、')}</p>
                      </div>
                    )}
                  </section>

                  <EarthquakeIntensityMap event={selected} />

                  <section className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-[11px] font-black text-slate-800 dark:text-white">主な観測地点</h4>
                      <span className="text-[9px] text-slate-400">{selected.observed_areas.length}市区町村</span>
                    </div>
                    {detailLoading && <p className="mt-1 text-[9px] text-slate-400">観測点の詳細を照合しています…</p>}
                    {areaGroups.length ? (
                      <div className="mt-2 max-h-[230px] space-y-3 overflow-y-auto pr-1">
                        {areaGroups.map(group => (
                          <div key={group.name}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <p className="text-[10px] font-black text-slate-600 dark:text-slate-300">{group.name}</p>
                              {group.maxRank > 0 && <IntensityOutline rank={group.maxRank} text={'最大 ' + intensityLabel(group.maxRank)} />}
                            </div>
                            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                              {group.areas.map(area => {
                                const rank = area.intensityRank || rankFromIntensity(area.intensity);
                                const color = intensityColor(rank);
                                const stationCount = area.stations?.length || 0;
                                return (
                                  <div key={group.name + '-' + area.name} style={{ borderLeftColor: color }}
                                    className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-l-2 border-slate-200 px-2.5 py-1.5 dark:border-slate-700">
                                    <div className="min-w-0">
                                      <p className="truncate text-[10px] font-bold text-slate-700 dark:text-slate-200">{area.name}</p>
                                      {stationCount > 0 && <p className="text-[8px] text-slate-400">観測点 {stationCount}か所</p>}
                                    </div>
                                    {rank > 0 && <IntensityOutline rank={rank} text={'震度' + intensityLabel(rank, area.intensity)} />}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">観測地点の詳細は気象庁の次回発表後に反映されます。</p>}
                  </section>
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                    <a href={selected.latest_source_url} target="_blank" rel="noreferrer" className="text-[9px] font-bold text-violet-700 underline dark:text-violet-300">気象庁の発表原文</a>
                    {selected.is_eew_cancelled && <span className="text-[9px] font-bold text-slate-400">緊急地震速報は取消済み</span>}
                    {selected.is_eew && !selected.is_eew_cancelled && <span className="text-[9px] font-black text-rose-600 dark:text-rose-300">緊急地震速報</span>}
                  </div>
                </>
              ) : <p className="rounded-xl border border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-700">地震を選択すると詳細を表示します。</p>}
            </div>
          </div>
        )}
      </section>
      <p className="px-1 text-[9px] leading-relaxed text-slate-400">出典：気象庁 防災情報XML（地震火山情報）。観測値・掲載時刻は発表や訂正のタイミングによって変わります。緊急時は必ず気象庁などの公式情報も確認してください。</p>
    </div>
  );
}
