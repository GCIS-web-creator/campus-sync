'use client';

import { useEffect, useMemo, useState } from 'react';

type EarthquakeEvent = {
  event_key: string;
  latest_source_url: string;
  product_code: string;
  title: string;
  headline: string;
  issued_at: string;
  event_time: string | null;
  hypocenter_name: string | null;
  latitude: number | null;
  longitude: number | null;
  depth_km: number | null;
  magnitude: number | null;
  max_intensity: string | null;
  max_intensity_rank: number | null;
  kodaira_intensity: string | null;
  kodaira_intensity_rank: number | null;
  observed_areas: Array<{ name: string; intensity: string | null }>;
  eew_targets: string[];
  eew_kodaira_target: boolean;
  eew_forecast_intensity: string | null;
  is_eew: boolean;
  is_eew_cancelled: boolean;
  is_distant: boolean;
  updated_at: string;
};

type EarthquakeResponse = {
  events: EarthquakeEvent[];
  sync: {
    highLastSuccessAt: string | null;
    longLastSuccessAt: string | null;
    lastAttemptAt: string | null;
    lastError: string | null;
    stale: boolean;
  };
};

function dateText(value: string | null): string {
  if (!value) return '発生時刻不明';
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) return '発生時刻不明';
  return time.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function mapUrl(event: EarthquakeEvent): string | null {
  if (typeof event.latitude !== 'number' || typeof event.longitude !== 'number') return null;
  const lat = Math.max(-85, Math.min(85, event.latitude));
  const lon = Math.max(-180, Math.min(180, event.longitude));
  const span = event.is_distant ? 12 : 1.4;
  const left = Math.max(-180, lon - span);
  const right = Math.min(180, lon + span);
  const bottom = Math.max(-85, lat - span);
  const top = Math.min(85, lat + span);
  return 'https://www.openstreetmap.org/export/embed.html?bbox='
    + [left, bottom, right, top].map(value => value.toFixed(4)).join('%2C')
    + '&layer=mapnik&marker=' + lat.toFixed(5) + '%2C' + lon.toFixed(5);
}

export default function EarthquakePanel() {
  const [data, setData] = useState<EarthquakeResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/earthquakes', { cache: 'no-store' });
        const result = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(result?.events) || !result?.sync) {
          throw new Error(result?.message || '地震情報を取得できませんでした。');
        }
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
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const events = data?.events || [];
  const selected = useMemo(
    () => events.find(event => event.event_key === selectedKey) || events[0] || null,
    [events, selectedKey],
  );
  const selectedMap = selected ? mapUrl(selected) : null;
  const updatedAt = data?.sync.highLastSuccessAt ? dateText(data.sync.highLastSuccessAt) : null;
  const stale = !data || data.sync.stale;

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-black tracking-[0.18em] text-violet-600 dark:text-violet-300">CAMPUSSYNC / EARTHQUAKE</p>
            <h3 className="mt-1 text-base font-black text-slate-900 dark:text-white">地震情報・震源マップ</h3>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">対象：全国・海外／気象庁発表データ</p>
          </div>
          <div className="text-right">
            <p className={'text-[10px] font-black ' + (stale ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300')}>
              {loading ? '初回取得中' : stale ? '更新遅延・確認中' : '自動更新中'}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">{updatedAt ? '最終確認 ' + updatedAt : '確認時刻未取得'}</p>
          </div>
        </div>

        {stale && (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            {error || data?.sync.lastError || '地震データの更新が遅れています。表示中の情報は最後に取得できた内容です。'}
            <span className="mt-1 block text-[10px] opacity-80">緊急時はテレビ・防災行政無線・気象庁などの公式情報も確認してください。</span>
          </div>
        )}

        {loading && !data ? (
          <div className="space-y-3 p-4">
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-56 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          </div>
        ) : error && !data ? (
          <p role="status" className="p-5 text-sm text-rose-600 dark:text-rose-300">{error}</p>
        ) : events.length === 0 ? (
          <p className="p-5 text-sm font-bold text-slate-600 dark:text-slate-300">表示できる地震情報はまだありません。初回同期が完了すると、ここに最新情報が表示されます。</p>
        ) : (
          <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.95fr)]">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-black text-slate-700 dark:text-slate-200">最近の地震（最大60件）</h4>
                <span className="text-[10px] text-slate-400">{events.length}件</span>
              </div>
              <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
                {events.map(event => {
                  const active = selected?.event_key === event.event_key;
                  const localIntensity = event.kodaira_intensity ? '小平市 震度' + event.kodaira_intensity : '';
                  return (
                    <button
                      type="button"
                      key={event.event_key}
                      onClick={() => setSelectedKey(event.event_key)}
                      className={'w-full rounded-2xl border p-3 text-left transition ' + (active
                        ? 'border-violet-400 bg-violet-50 shadow-sm dark:border-violet-700 dark:bg-violet-950/30'
                        : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800')}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {event.is_distant && <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[9px] font-black text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">遠地地震</span>}
                        {event.is_eew_cancelled && <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[9px] font-black text-slate-700 dark:bg-slate-700 dark:text-slate-100">速報取消</span>}
                        {event.is_eew && !event.is_eew_cancelled && <span className="rounded-md bg-red-100 px-2 py-0.5 text-[9px] font-black text-red-800 dark:bg-red-950/50 dark:text-red-200">緊急地震速報</span>}
                        {event.eew_kodaira_target && <span className="rounded-md bg-red-600 px-2 py-0.5 text-[9px] font-black text-white">小平市対象</span>}
                        {event.kodaira_intensity_rank !== null && event.kodaira_intensity_rank >= 2 && <span className="rounded-md bg-violet-100 px-2 py-0.5 text-[9px] font-black text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">小平市 震度{event.kodaira_intensity}</span>}
                      </div>
                      <p className="mt-1.5 text-[10px] font-bold text-slate-400">{dateText(event.event_time || event.issued_at)}</p>
                      <p className="mt-1 break-words text-sm font-black text-slate-900 dark:text-white">{event.hypocenter_name || event.title || '震源情報'}</p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        {event.magnitude === null ? 'M —' : 'M' + event.magnitude.toFixed(1)}
                        {' ・ '}最大震度 {event.max_intensity || '—'}
                        {localIntensity ? ' ・ ' + localIntensity : ''}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-w-0 space-y-3">
              <section className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="border-b border-slate-100 p-3 dark:border-slate-800">
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">選択中の地震</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h4 className="break-words text-sm font-black text-slate-900 dark:text-white">{selected?.hypocenter_name || selected?.title}</h4>
                    {selected?.is_eew_cancelled && <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[9px] font-black text-slate-700 dark:bg-slate-700 dark:text-slate-100">緊急地震速報は取消済み</span>}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{dateText(selected?.event_time || selected?.issued_at || null)}</p>
                </div>
                {selectedMap ? (
                  <iframe
                    title="選択した地震の震源地図"
                    src={selectedMap}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="h-64 w-full border-0 sm:h-72"
                  />
                ) : (
                  <div className="flex h-64 items-center justify-center bg-slate-50 p-4 text-center text-xs text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                    この情報には震源座標が含まれていないため、地図を表示できません。
                  </div>
                )}
                {selectedMap && (
                  <div className="border-t border-slate-100 px-3 py-2 text-right dark:border-slate-800">
                    <a href={selectedMap.replace('/export/embed.html?', '/?')} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-violet-700 underline dark:text-violet-300">地図を別画面で開く</a>
                  </div>
                )}
              </section>

              {selected && (
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                  <h4 className="text-xs font-black text-slate-800 dark:text-white">地震の詳細</h4>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {[
                      ['マグニチュード', selected.magnitude === null ? '—' : 'M' + selected.magnitude.toFixed(1)],
                      ['深さ', selected.depth_km === null ? '—' : Math.round(selected.depth_km) + 'km'],
                      ['最大震度', selected.max_intensity || '—'],
                      ['小平市の観測震度', selected.kodaira_intensity ? '震度' + selected.kodaira_intensity : '観測情報なし'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-white p-2 dark:bg-slate-900">
                        <p className="text-[9px] font-bold text-slate-400">{label}</p>
                        <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{value}</p>
                      </div>
                    ))}
                  </div>
                  {selected.eew_targets.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">緊急地震速報の対象区域</p>
                      <p className="mt-1 text-xs font-bold leading-relaxed text-slate-800 dark:text-slate-200">{selected.eew_targets.join('、')}</p>
                    </div>
                  )}
                  {selected.observed_areas?.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">主な観測地点</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                        {selected.observed_areas.slice(0, 16).map(area => area.name + (area.intensity ? ' 震度' + area.intensity : '')).join(' ／ ')}
                      </p>
                    </div>
                  )}
                  <a href={selected.latest_source_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[10px] font-bold text-violet-700 underline dark:text-violet-300">気象庁XMLの原文</a>
                </section>
              )}
            </div>
          </div>
        )}
      </section>

      <p className="px-1 text-[10px] leading-relaxed text-slate-400">
        出典：気象庁 防災情報XML（地震火山情報）。掲載される情報は発表・更新のタイミングによって変わります。遠地地震は国内の震度観測がない場合があります。
      </p>
    </div>
  );
}
