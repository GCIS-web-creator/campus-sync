'use client';

import { useEffect, useRef, useState } from 'react';

type EarthquakeStation = { name: string; code: string; intensity: string | null; intensityRank: number | null };
export type EarthquakeObservedArea = {
  name: string; prefecture?: string | null; prefectureCode?: string | null; cityCode?: string | null;
  intensity: string | null; intensityRank: number | null; stations?: EarthquakeStation[];
};
export type EarthquakeMapEvent = {
  event_key: string; latest_source_url: string; hypocenter_name: string | null;
  latitude: number | null; longitude: number | null; max_intensity: string | null;
  max_intensity_rank: number | null; is_distant: boolean; observed_areas: EarthquakeObservedArea[];
};
type GeoFeature = { type: 'Feature'; geometry: { type: string; coordinates: unknown }; properties: Record<string, string | number | null> };
type GeoCollection = { type: 'FeatureCollection'; features: GeoFeature[] };
type LatLng = [number, number];
type LeafletBounds = { isValid(): boolean };
type LeafletLayer = {
  addTo(map: LeafletMap): LeafletLayer; remove(): void;
  bindPopup(html: string): LeafletLayer;
  setStyle?(style: (feature: GeoFeature) => Record<string, string | number>): void;
};
type LeafletMap = {
  setView(center: LatLng, zoom: number): LeafletMap;
  fitBounds(bounds: LeafletBounds, options?: Record<string, unknown>): LeafletMap;
  getZoom(): number; on(event: string, callback: () => void): LeafletMap; remove(): void;
  addLayer(layer: LeafletLayer): LeafletMap; removeLayer(layer: LeafletLayer): LeafletMap; hasLayer(layer: LeafletLayer): boolean;
};
type LeafletApi = {
  map(element: HTMLElement, options?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, options?: Record<string, unknown>): LeafletLayer;
  geoJSON(data: GeoCollection, options?: {
    style?: (feature: GeoFeature) => Record<string, string | number>;
    onEachFeature?: (feature: GeoFeature, layer: LeafletLayer) => void;
  }): LeafletLayer;
  marker(position: LatLng, options?: Record<string, unknown>): LeafletLayer;
  divIcon(options: Record<string, unknown>): unknown;
  latLngBounds(points: LatLng[]): LeafletBounds;
};
declare global { interface Window { L?: LeafletApi } }

const RAW_GEOJSON_ROOT = 'https://raw.githubusercontent.com/kaz-ogiwara/japan-topography/main/data/municipality/geojson';
const PREFECTURE_GEOJSON_URL = RAW_GEOJSON_ROOT + '/s0001/prefectures.json';
const CITY_GEOJSON_PATH = (code: string) => RAW_GEOJSON_ROOT + '/s0010/N03-21_' + code.padStart(2, '0') + '_210101.json';
const MAP_ZOOM_DETAIL_THRESHOLD = 6.5;
let leafletPromise: Promise<LeafletApi> | null = null;
const geoJsonCache = new Map<string, Promise<GeoCollection>>();

function ensureMapStyles(): void {
  if (document.getElementById('campussync-earthquake-map-styles')) return;
  const style = document.createElement('style');
  style.id = 'campussync-earthquake-map-styles';
  style.textContent = '.cs-earthquake-map-icon{background:transparent!important;border:0!important}.cs-earthquake-pin{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border:2px solid var(--pin-color);border-radius:9999px;background:rgba(255,255,255,.94);color:var(--pin-color);font-size:12px;font-weight:900;line-height:1;box-shadow:0 1px 5px rgba(15,23,42,.18)}.cs-earthquake-epicenter{background:transparent!important;border:0!important}.cs-earthquake-epicenter-dot{display:flex;width:24px;height:24px;border:2px solid #e11d48;border-radius:50%;align-items:center;justify-content:center;background:rgba(255,255,255,.8);box-shadow:0 0 0 5px rgba(225,29,72,.14)}.cs-earthquake-epicenter-dot i{display:block;width:7px;height:7px;border-radius:50%;background:#e11d48}.cs-earthquake-popup{min-width:150px;color:#0f172a;font-family:inherit}.cs-earthquake-popup strong{font-size:13px}.cs-earthquake-popup-rank{display:flex;justify-content:space-between;gap:12px;margin-top:5px;font-size:11px;color:#64748b}.cs-earthquake-popup-list{margin-top:8px;max-height:150px;overflow:auto;border-top:1px solid #e2e8f0}.cs-earthquake-popup-station{display:flex;justify-content:space-between;gap:10px;padding:4px 0;font-size:10px}.cs-earthquake-popup-muted{margin-top:8px;font-size:10px;color:#64748b}.leaflet-container{font-family:inherit}';
  document.head.appendChild(style);
}
function loadLeaflet(): Promise<LeafletApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('地図はブラウザでのみ利用できます。'));
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-campus-leaflet]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet'; link.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
        link.dataset.campusLeaflet = 'true'; document.head.appendChild(link);
      }
      const existing = document.querySelector('script[data-campus-leaflet]') as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => window.L ? resolve(window.L) : reject(new Error('地図ライブラリを読み込めませんでした。')), { once: true });
        existing.addEventListener('error', () => reject(new Error('地図ライブラリを読み込めませんでした。')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'; script.async = true;
      script.dataset.campusLeaflet = 'true';
      script.onload = () => window.L ? resolve(window.L) : reject(new Error('地図ライブラリを読み込めませんでした。'));
      script.onerror = () => reject(new Error('地図ライブラリを読み込めませんでした。'));
      document.body.appendChild(script);
    });
  }
  return leafletPromise;
}
function loadGeoJson(url: string): Promise<GeoCollection> {
  const cached = geoJsonCache.get(url);
  if (cached) return cached;
  const request = fetch(url, { cache: 'force-cache' }).then(async response => {
    if (!response.ok) throw new Error('地図境界データを取得できませんでした。');
    return await response.json() as GeoCollection;
  }).catch(error => { geoJsonCache.delete(url); throw error; });
  geoJsonCache.set(url, request);
  return request;
}
function normaliseName(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '').replace(/　/g, '');
}
function intensityColor(rank: number | null | undefined): string {
  const colors: Record<number, string> = {
    1: '#94a3b8', 2: '#3b82f6', 3: '#0d9488', 4: '#ca8a04',
    5: '#ea580c', 6: '#dc2626', 7: '#c026d3', 8: '#7e22ce', 9: '#7f1d1d',
  };
  return rank ? colors[rank] || '#64748b' : '#94a3b8';
}
function intensityText(rank: number | null | undefined, fallback?: string | null): string {
  const labels: Record<number, string> = { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5弱', 6: '5強', 7: '6弱', 8: '6強', 9: '7' };
  return rank ? labels[rank] || fallback || '—' : fallback || '—';
}
function collectPositions(value: unknown, positions: LatLng[]): void {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    positions.push([value[1], value[0]]); return;
  }
  for (const child of value) collectPositions(child, positions);
}
function featureCenter(feature: GeoFeature): LatLng | null {
  const positions: LatLng[] = [];
  collectPositions(feature.geometry.coordinates, positions);
  if (!positions.length) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of positions) {
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
  }
  return [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
}
function markerHtml(rank: number | null, label: string): string {
  return '<span class="cs-earthquake-pin" style="--pin-color:' + intensityColor(rank) + '">' + escapeHtml(label) + '</span>';
}
function ensureLayer(map: LeafletMap, layer: LeafletLayer, visible: boolean): void {
  if (visible && !map.hasLayer(layer)) map.addLayer(layer);
  if (!visible && map.hasLayer(layer)) map.removeLayer(layer);
}
function observationPopup(area: EarthquakeObservedArea): string {
  const stations = (area.stations || []).slice(0, 12);
  const stationRows = stations.length
    ? stations.map(station => '<div class="cs-earthquake-popup-station"><span>' + escapeHtml(station.name) + '</span><b>' + escapeHtml(station.intensity || '—') + '</b></div>').join('')
    : '<p class="cs-earthquake-popup-muted">観測点の個別情報はありません</p>';
  return '<div class="cs-earthquake-popup"><strong>' + escapeHtml((area.prefecture || '') + area.name) +
    '</strong><div class="cs-earthquake-popup-rank">市町村最大震度 <b style="color:' + intensityColor(area.intensityRank) + '">震度' +
    escapeHtml(intensityText(area.intensityRank, area.intensity)) + '</b></div><div class="cs-earthquake-popup-list">' + stationRows + '</div></div>';
}

export default function EarthquakeIntensityMap({ event }: { event: EarthquakeMapEvent }) {
  const mapElement = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('震度分布を準備しています…');

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    const init = async () => {
      setStatus('loading'); setMessage('地図と震度データを読み込んでいます…');
      try {
        const L = await loadLeaflet();
        if (cancelled || !mapElement.current) return;
        ensureMapStyles();
        const areas = (event.observed_areas || []).filter(area => Boolean(area.prefectureCode && area.prefecture));
        const rankByPrefecture = new Map<string, number>();
        for (const area of areas) {
          const key = normaliseName(area.prefecture || '');
          const rank = area.intensityRank || 0;
          if (key && rank > (rankByPrefecture.get(key) || 0)) rankByPrefecture.set(key, rank);
        }
        const prefectureGeo = await loadGeoJson(PREFECTURE_GEOJSON_URL);
        if (cancelled || !mapElement.current) return;
        map = L.map(mapElement.current, { zoomControl: true, scrollWheelZoom: true, dragging: true, tap: true, preferCanvas: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
        }).addTo(map);

        const codes = Array.from(new Set(areas.map(area => String(area.prefectureCode || '').padStart(2, '0')).filter(code => /^\d{2}$/.test(code))));
        const cityCollections = await Promise.all(codes.map(code => loadGeoJson(CITY_GEOJSON_PATH(code))));
        if (cancelled || !map) return;

        const areaByName = new Map<string, EarthquakeObservedArea>();
        for (const area of areas) {
          const key = normaliseName(area.prefecture || '') + '|' + normaliseName(area.name);
          const existing = areaByName.get(key);
          if (!existing || (area.intensityRank || 0) > (existing.intensityRank || 0)) areaByName.set(key, area);
        }
        const matched: Array<{ feature: GeoFeature; area: EarthquakeObservedArea; center: LatLng }> = [];
        for (const collection of cityCollections) {
          for (const feature of collection.features) {
            const p = feature.properties || {};
            const pref = normaliseName(String(p.N03_001 || ''));
            const municipality = String(p.N03_004 || '');
            const ward = String(p.N03_003 || '');
            const aliases = [municipality, ward, municipality + ward, ward + municipality, String(p.N03_001 || '') + municipality + ward, String(p.N03_001 || '') + ward + municipality].map(normaliseName);
            const area = Array.from(areaByName.entries()).find(([key]) =>
              key.startsWith(pref + '|') && aliases.includes(key.slice(key.indexOf('|') + 1))
            )?.[1];
            if (!area) continue;
            const center = featureCenter(feature);
            if (!center) continue;
            matched.push({
              feature: { ...feature, properties: { ...feature.properties, __intensityRank: area.intensityRank || 0, __areaName: area.name } },
              area, center,
            });
          }
        }
        const cityCollection: GeoCollection = { type: 'FeatureCollection', features: matched.map(item => item.feature) };
        const cityLayer = L.geoJSON(cityCollection, {
          style: feature => {
            const rank = Number(feature.properties.__intensityRank || 0);
            const color = intensityColor(rank || null);
            return { color, weight: 1, opacity: 0.8, fillColor: color, fillOpacity: 0.1 };
          },
        });
        const prefectureLayer = L.geoJSON(prefectureGeo, {
          style: feature => {
            const rank = rankByPrefecture.get(normaliseName(String(feature.properties.N03_001 || ''))) || 0;
            const color = intensityColor(rank || null);
            return { color: rank ? color : '#94a3b8', weight: rank ? 1.4 : 0.7, opacity: rank ? 0.9 : 0.55, fillColor: color, fillOpacity: rank ? 0.2 : 0.015 };
          },
        }).addTo(map);
        const cityMarkers = matched.map(item => {
          const rank = item.area.intensityRank;
          const marker = L.marker(item.center, {
            icon: L.divIcon({
              className: 'cs-earthquake-map-icon',
              html: markerHtml(rank, intensityText(rank, item.area.intensity)),
              iconSize: [36, 36], iconAnchor: [18, 18],
            }),
            riseOnHover: true,
          });
          marker.bindPopup(observationPopup(item.area));
          return marker;
        });
        const prefectureMarkers: LeafletLayer[] = [];
        for (const feature of prefectureGeo.features) {
          const name = String(feature.properties.N03_001 || '');
          const rank = rankByPrefecture.get(normaliseName(name));
          if (!rank) continue;
          const center = featureCenter(feature);
          if (!center) continue;
          prefectureMarkers.push(L.marker(center, {
            icon: L.divIcon({
              className: 'cs-earthquake-map-icon',
              html: markerHtml(rank, intensityText(rank)),
              iconSize: [40, 40], iconAnchor: [20, 20],
            }),
            interactive: false,
          }));
        }
        if (event.latitude !== null && event.longitude !== null) {
          L.marker([event.latitude, event.longitude], {
            icon: L.divIcon({
              className: 'cs-earthquake-epicenter',
              html: '<span class="cs-earthquake-epicenter-dot"><i></i></span>',
              iconSize: [26, 26], iconAnchor: [13, 13],
            }),
            zIndexOffset: 1000,
          }).addTo(map);
        }
        const points = matched.map(item => item.center);
        if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 7.2 });
        else if (points.length === 1) map.setView(points[0], 8);
        else if (event.latitude !== null && event.longitude !== null) map.setView([event.latitude, event.longitude], event.is_distant ? 3.8 : 5.5);
        else map.setView([36.2, 138.2], 4.8);

        const updateZoomLayers = () => {
          if (!map) return;
          const detailed = map.getZoom() >= MAP_ZOOM_DETAIL_THRESHOLD;
          prefectureLayer.setStyle?.(feature => {
            const key = normaliseName(String(feature.properties.N03_001 || ''));
            const rank = rankByPrefecture.get(key) || 0;
            const color = intensityColor(rank || null);
            return { color: rank ? color : '#94a3b8', weight: rank ? (detailed ? 0.9 : 1.5) : 0.65, opacity: rank ? 0.8 : 0.45, fillColor: color, fillOpacity: rank ? (detailed ? 0.025 : 0.22) : 0.01 };
          });
          ensureLayer(map, cityLayer, detailed && matched.length > 0);
          for (const marker of cityMarkers) ensureLayer(map, marker, detailed);
          for (const marker of prefectureMarkers) ensureLayer(map, marker, !detailed);
        };
        map.on('zoomend', updateZoomLayers);
        updateZoomLayers();
        if (cancelled) return;
        setStatus('ready');
        setMessage(matched.length
          ? '拡大すると市町村別、縮小すると都道府県別の最大震度を表示します。'
          : areas.length ? '震度情報は取得済みですが、市町村境界と照合できませんでした。' : '震度分布の詳細がありません。震源位置を表示しています。');
      } catch (error) {
        if (cancelled) return;
        setStatus('error'); setMessage(error instanceof Error ? error.message : '地図を表示できませんでした。');
      }
    };
    void init();
    return () => { cancelled = true; map?.remove(); };
  }, [event.event_key, event.observed_areas, event.latitude, event.longitude, event.is_distant]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
        <div><p className="text-[11px] font-black text-slate-800 dark:text-white">観測震度マップ</p><p className="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">拡大：市町村別 ／ 縮小：都道府県別</p></div>
        <span className="text-[9px] text-slate-400">地図上の番号＝最大震度</span>
      </div>
      <div className="relative">
        <div ref={mapElement} className="h-[300px] w-full bg-slate-100 sm:h-[360px]" aria-label="地震の観測震度分布地図" />
        {status === 'loading' && <div className="absolute inset-0 flex items-center justify-center bg-white/75 text-xs font-bold text-slate-600 backdrop-blur-[1px] dark:bg-slate-950/70 dark:text-slate-300">{message}</div>}
        {status === 'error' && <div className="absolute inset-x-3 bottom-3 rounded-xl border border-amber-200 bg-white/95 px-3 py-2 text-[10px] leading-relaxed text-amber-800 shadow-sm dark:border-amber-900 dark:bg-slate-900/95 dark:text-amber-200">{message}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
        {[[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5弱'], [6, '5強'], [7, '6弱'], [8, '6強'], [9, '7']].map(([rank, label]) => (
          <span key={rank} className="inline-flex items-center gap-1 text-[9px] font-semibold text-slate-500 dark:text-slate-400">
            <i className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: intensityColor(Number(rank)) }} />{label}
          </span>
        ))}
      </div>
      <p className="px-3 pb-2 text-[9px] leading-relaxed text-slate-400">
        市町村の色・番号は市町村内の最大観測震度です。拡大時のピンは市町村の代表位置で、震度計そのものの設置座標ではありません。出典：気象庁／国土数値情報／OpenStreetMap
      </p>
    </div>
  );
}
