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
  polygon(points: LatLng[], options?: Record<string, unknown>): LeafletLayer;
  divIcon(options: Record<string, unknown>): unknown;
  latLngBounds(points: LatLng[]): LeafletBounds;
};
declare global { interface Window { L?: LeafletApi } }

const RAW_GEOJSON_ROOT = 'https://raw.githubusercontent.com/kaz-ogiwara/japan-topography/main/data/municipality/geojson';
const CITY_GEOJSON_PATH = (code: string) => RAW_GEOJSON_ROOT + '/s0010/N03-21_' + code.padStart(2, '0') + '_210101.json';
const MAP_ZOOM_DETAIL_THRESHOLD = 7.8;
const MAP_ZOOM_MEDIUM_THRESHOLD = 5.4;
let leafletPromise: Promise<LeafletApi> | null = null;
const geoJsonCache = new Map<string, Promise<GeoCollection>>();

function ensureMapStyles(): void {
  if (document.getElementById('campussync-earthquake-map-styles')) return;
  const style = document.createElement('style');
  style.id = 'campussync-earthquake-map-styles';
  style.textContent = '.cs-earthquake-map-icon{background:transparent!important;border:0!important}.cs-earthquake-pin{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border:2px solid var(--pin-color);border-radius:9999px;background:rgba(255,255,255,.98);color:var(--pin-color);font-size:10px;font-weight:950;line-height:1;box-shadow:0 1px 4px rgba(15,23,42,.22)}.cs-earthquake-pin[data-rank="1"]{background:#334155;color:#fff;border-color:#1e293b;border-width:2.5px;box-shadow:0 1px 5px rgba(15,23,42,.42)}.cs-earthquake-region-pin{display:flex;align-items:center;justify-content:center;width:25px;height:25px;border:1.8px solid var(--pin-color);border-radius:9999px;background:rgba(255,255,255,.97);color:var(--pin-color);font-size:10px;font-weight:900;line-height:1;box-shadow:0 1px 4px rgba(15,23,42,.2)}.cs-earthquake-epicenter{background:transparent!important;border:0!important}.cs-earthquake-epicenter-dot{display:flex;width:24px;height:24px;border:2px solid #e11d48;border-radius:50%;align-items:center;justify-content:center;background:rgba(255,255,255,.8);box-shadow:0 0 0 5px rgba(225,29,72,.14)}.cs-earthquake-epicenter-dot i{display:block;width:7px;height:7px;border-radius:50%;background:#e11d48}.cs-earthquake-station-pin{display:flex;align-items:center;justify-content:center;width:22px;height:22px;border:2px solid #fff;border-radius:5px;background:#1e293b;color:#fff;font-size:11px;font-weight:1000;line-height:1;box-shadow:0 1px 5px rgba(15,23,42,.48)}.cs-earthquake-regional-square{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:2px solid #fff;border-radius:7px;background:var(--cell-color);color:#fff;font-size:12px;font-weight:1000;line-height:1;text-shadow:0 1px 2px rgba(15,23,42,.38);box-shadow:0 1px 6px rgba(15,23,42,.34)}.cs-earthquake-popup{min-width:150px;color:#0f172a;font-family:inherit}.cs-earthquake-popup strong{font-size:13px}.cs-earthquake-popup-rank{display:flex;justify-content:space-between;gap:12px;margin-top:5px;font-size:11px;color:#64748b}.cs-earthquake-popup-list{margin-top:8px;max-height:150px;overflow:auto;border-top:1px solid #e2e8f0}.cs-earthquake-popup-station{display:flex;justify-content:space-between;gap:10px;padding:4px 0;font-size:10px}.cs-earthquake-popup-muted{margin-top:8px;font-size:10px;color:#64748b}.leaflet-container{font-family:inherit}';
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
function loadStationLocations(): Promise<JmaStationLocation[]> {
  if (!stationLocationsPromise) {
    stationLocationsPromise = fetch('/data/jma-intensity-stations.json', { cache: 'force-cache' })
      .then(async response => {
        if (!response.ok) throw new Error('震度観測点の座標データを取得できませんでした。');
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('震度観測点の座標データ形式が正しくありません。');
        return data as JmaStationLocation[];
      })
      .catch(error => { stationLocationsPromise = null; throw error; });
  }
  return stationLocationsPromise;
}
function normaliseName(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '').replace(/　/g, '');
}
function intensityColor(rank: number | null | undefined): string {
  const colors: Record<number, string> = {
    1: '#334155', 2: '#3b82f6', 3: '#0d9488', 4: '#ca8a04',
    5: '#ea580c', 6: '#dc2626', 7: '#c026d3', 8: '#7e22ce', 9: '#7f1d1d',
  };
  return rank ? colors[rank] || '#475569' : '#94a3b8';
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
  return '<span class="cs-earthquake-pin" data-rank="' + String(rank || 0) + '" style="--pin-color:' + intensityColor(rank) + '">' + escapeHtml(label) + '</span>';
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

type MatchedCity = { feature: GeoFeature; area: EarthquakeObservedArea; center: LatLng };
type JmaStationLocation = { name: string; lat: number; lng: number; from: string; to: string | null };
type RegionalCell = { center: LatLng; maxRank: number; areaCount: number; areaNames: string[] };
let stationLocationsPromise: Promise<JmaStationLocation[]> | null = null;

function getAreaRank(area: EarthquakeObservedArea): number {
  if (typeof area.intensityRank === 'number' && Number.isFinite(area.intensityRank)) return area.intensityRank;
  const labels: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4, '5弱': 5, '5強': 6, '6弱': 7, '6強': 8, '7': 9 };
  return labels[String(area.intensity || '')] || 0;
}
function getStationRank(station: EarthquakeStation): number {
  if (typeof station.intensityRank === 'number' && Number.isFinite(station.intensityRank)) return station.intensityRank;
  const labels: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4, '5弱': 5, '5強': 6, '6弱': 7, '6強': 8, '7': 9 };
  return labels[String(station.intensity || '')] || 0;
}
function buildRegionalCells(items: MatchedCity[], step: number): RegionalCell[] {
  const groups = new Map<string, MatchedCity[]>();
  for (const item of items) {
    const row = Math.floor(item.center[0] / step);
    const column = Math.floor(item.center[1] / step);
    const key = row + ':' + column;
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  return Array.from(groups.values()).map(group => {
    const center: LatLng = [
      group.reduce((sum, item) => sum + item.center[0], 0) / group.length,
      group.reduce((sum, item) => sum + item.center[1], 0) / group.length,
    ];
    return {
      center,
      maxRank: Math.max(0, ...group.map(item => getAreaRank(item.area))),
      areaCount: group.length,
      areaNames: group.map(item => item.area.name),
    };
  }).sort((a, b) => b.maxRank - a.maxRank);
}
function regionalCellPopup(cell: RegionalCell, title: string): string {
  return '<div class="cs-earthquake-popup"><strong>' + escapeHtml(title) +
    '</strong><div class="cs-earthquake-popup-rank">周辺の最大震度 <b style="color:' + intensityColor(cell.maxRank) +
    '">震度' + escapeHtml(intensityText(cell.maxRank)) + '</b></div><p class="cs-earthquake-popup-muted">対象市区町村 ' +
    cell.areaCount + '件</p><p class="cs-earthquake-popup-muted">' +
    escapeHtml(cell.areaNames.slice(0, 12).join('、')) + (cell.areaNames.length > 12 ? ' ほか' : '') + '</p></div>';
}

export default function EarthquakeIntensityMap({ event }: { event: EarthquakeMapEvent }) {
  const mapElement = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('震度分布を準備しています…');
  const [rankCounts, setRankCounts] = useState<Record<number, number>>({});
  const [matchedCount, setMatchedCount] = useState(0);
  const [rankOneStationCount, setRankOneStationCount] = useState(0);
  const [rankOneStationMappedCount, setRankOneStationMappedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    const init = async () => {
      setStatus('loading'); setMessage('地図と震度データを読み込んでいます…');
      try {
        const L = await loadLeaflet();
        if (cancelled || !mapElement.current) return;
        ensureMapStyles();
        const areas = (event.observed_areas || [])
          .filter(area => getAreaRank(area) > 0)
          .map(area => ({
            ...area,
            prefectureCode: area.prefectureCode || (area.cityCode ? String(area.cityCode).slice(0, 2) : null),
          }));
        map = L.map(mapElement.current, { zoomControl: true, scrollWheelZoom: true, dragging: true, tap: true, preferCanvas: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
        }).addTo(map);

        const codes = Array.from(new Set(areas
          .map(area => String(area.prefectureCode || '').padStart(2, '0'))
          .filter(code => /^\d{2}$/.test(code))));
        const [cityCollections, stationLocations] = await Promise.all([
          Promise.all(codes.map(code => loadGeoJson(CITY_GEOJSON_PATH(code)))),
          loadStationLocations().catch(() => [] as JmaStationLocation[]),
        ]);
        if (cancelled || !map) return;
        const stationLocationsByName = new Map<string, JmaStationLocation[]>();
        for (const location of stationLocations) {
          const group = stationLocationsByName.get(location.name) || [];
          group.push(location);
          stationLocationsByName.set(location.name, group);
        }
        const eventMinute = event.event_key.slice(0, 12);
        const resolveStationLocation = (station: EarthquakeStation): JmaStationLocation | null => {
          const matches = (stationLocationsByName.get(station.name) || []).filter(location =>
            location.from <= eventMinute && (!location.to || eventMinute < location.to)
          );
          return matches.length === 1 ? matches[0] : null;
        };

        const matched: MatchedCity[] = [];
        const seenAreaKeys = new Set<string>();
        for (const collection of cityCollections) {
          for (const feature of collection.features) {
            const p = feature.properties || {};
            const featurePrefCode = String(p.N03_007 || '').slice(0, 2);
            const featureCityCode = String(p.N03_007 || '').slice(0, 5);
            const municipality = String(p.N03_004 || '');
            const ward = String(p.N03_003 || '');
            const wardPrefix = ward.endsWith('市') ? ward.slice(0, -1) : ward;
            const aliases = [
              municipality, ward, municipality + ward, ward + municipality,
              wardPrefix + municipality, municipality + wardPrefix,
              String(p.N03_001 || '') + municipality + ward,
              String(p.N03_001 || '') + ward + municipality,
            ].map(normaliseName);
            const area = areas.find(candidate => {
              const areaPrefCode = String(candidate.prefectureCode || '').padStart(2, '0');
              if (areaPrefCode && areaPrefCode !== featurePrefCode) return false;
              const areaCityCode = candidate.cityCode ? String(candidate.cityCode).slice(0, 5) : '';
              if (areaCityCode && featureCityCode && areaCityCode === featureCityCode) return true;
              const name = normaliseName(candidate.name);
              if (!aliases.includes(name)) return false;
              return !candidate.prefecture || normaliseName(candidate.prefecture) === normaliseName(String(p.N03_001 || ''));
            });
            if (!area) continue;
            const areaKey = String(area.prefectureCode || '') + '|' + String(area.cityCode || '') + '|' + normaliseName(area.name);
            if (seenAreaKeys.has(areaKey)) continue;
            const center = featureCenter(feature);
            if (!center) continue;
            seenAreaKeys.add(areaKey);
            const rank = getAreaRank(area);
            matched.push({
              feature: { ...feature, properties: { ...feature.properties, __intensityRank: rank, __areaName: area.name } },
              area,
              center,
            });
          }
        }

        const rankCountsNext: Record<number, number> = {};
        for (const item of matched) {
          const rank = getAreaRank(item.area);
          rankCountsNext[rank] = (rankCountsNext[rank] || 0) + 1;
        }
        setRankCounts(rankCountsNext);
        setMatchedCount(matched.length);

        const cityCollection: GeoCollection = { type: 'FeatureCollection', features: matched.map(item => item.feature) };
        const cityLayer = L.geoJSON(cityCollection, {
          style: feature => {
            const rank = Number(feature.properties.__intensityRank || 0);
            const color = intensityColor(rank || null);
            return { color, weight: 0.45, opacity: 0.5, fillColor: color, fillOpacity: 0.24 };
          },
        });

        // Construct true prefecture silhouettes from all municipal polygons in each affected prefecture.
        // Each municipality receives the maximum observed intensity of its prefecture at wide zoom.
        const prefectureAreas = new Map<string, MatchedCity[]>();
        for (const item of matched) {
          const prefCode = String(item.area.prefectureCode || (item.area.cityCode ? String(item.area.cityCode).slice(0, 2) : ''));
          if (!/^\d{2}$/.test(prefCode)) continue;
          const group = prefectureAreas.get(prefCode) || [];
          group.push(item);
          prefectureAreas.set(prefCode, group);
        }
        const prefectureRanks = new Map<string, number>();
        for (const [prefCode, group] of prefectureAreas) {
          prefectureRanks.set(prefCode, Math.max(0, ...group.map(item => getAreaRank(item.area))));
        }
        const prefectureFeatures: GeoFeature[] = cityCollections.flatMap(collection =>
          collection.features.flatMap(feature => {
            const prefCode = String(feature.properties?.N03_007 || '').slice(0, 2);
            const rank = prefectureRanks.get(prefCode);
            if (!rank) return [];
            return [{
              ...feature,
              properties: { ...feature.properties, __prefectureRank: rank },
            }];
          })
        );
        const prefectureLayer = L.geoJSON({ type: 'FeatureCollection', features: prefectureFeatures }, {
          style: feature => {
            const rank = Number(feature.properties.__prefectureRank || 0);
            const color = intensityColor(rank || null);
            return { color, weight: 0.35, opacity: 0.7, fillColor: color, fillOpacity: 0.34 };
          },
          onEachFeature: (feature, layer) => {
            const prefCode = String(feature.properties?.N03_007 || '').slice(0, 2);
            const group = prefectureAreas.get(prefCode) || [];
            const maxRank = prefectureRanks.get(prefCode) || 0;
            const prefName = String(feature.properties?.N03_001 || group[0]?.area.prefecture || '観測地域');
            layer.bindPopup(
              '<div class="cs-earthquake-popup"><strong>' + escapeHtml(prefName) +
              '</strong><div class="cs-earthquake-popup-rank">都道府県内の最大観測震度 <b style="color:' +
              intensityColor(maxRank) + '">震度' + escapeHtml(intensityText(maxRank)) +
              '</b></div><p class="cs-earthquake-popup-muted">観測市区町村 ' + group.length + '件</p></div>'
            );
          },
        });
        const rankOneStationMarkers: LeafletLayer[] = [];
        const areasWithExactRankOneStation = new Set<MatchedCity>();
        let rankOneStationsNext = 0;
        let rankOneStationsMappedNext = 0;
        for (const item of matched) {
          for (const station of item.area.stations || []) {
            if (getStationRank(station) !== 1) continue;
            rankOneStationsNext++;
            const location = resolveStationLocation(station);
            if (!location) continue;
            rankOneStationsMappedNext++;
            areasWithExactRankOneStation.add(item);
            const stationMarker = L.marker([location.lat, location.lng], {
              icon: L.divIcon({
                className: 'cs-earthquake-map-icon',
                html: '<span class="cs-earthquake-station-pin">1</span>',
                iconSize: [22, 22], iconAnchor: [11, 11],
              }),
              riseOnHover: true,
              zIndexOffset: 2400,
            });
            stationMarker.bindPopup(
              '<div class="cs-earthquake-popup"><strong>' + escapeHtml(station.name) +
              '</strong><div class="cs-earthquake-popup-rank">観測震度 <b style="color:' + intensityColor(1) +
              '">震度1</b></div><p class="cs-earthquake-popup-muted">市町村最大震度：震度' +
              escapeHtml(intensityText(getAreaRank(item.area), item.area.intensity)) + '</p></div>'
            );
            rankOneStationMarkers.push(stationMarker);
          }
        }
        setRankOneStationCount(rankOneStationsNext);
        setRankOneStationMappedCount(rankOneStationsMappedNext);

        const cityMarkers = matched.flatMap(item => {
          const rank = getAreaRank(item.area);
          if (rank === 1 && areasWithExactRankOneStation.has(item)) return [];
          const marker = L.marker(item.center, {
            icon: L.divIcon({
              className: 'cs-earthquake-map-icon',
              html: markerHtml(rank, intensityText(rank, item.area.intensity)),
              iconSize: [26, 26], iconAnchor: [13, 13],
            }),
            riseOnHover: true,
            zIndexOffset: rank === 1 ? 1500 : 0,
          });
          marker.bindPopup(observationPopup(item.area));
          return [marker];
        });

        const createRegionalMarkers = (cells: RegionalCell[], title: string) => cells.map(cell => {
          const color = intensityColor(cell.maxRank);
          const marker = L.marker(cell.center, {
            icon: L.divIcon({
              className: 'cs-earthquake-map-icon',
              html: '<span class="cs-earthquake-regional-square" style="--cell-color:' + color + '">' +
                escapeHtml(intensityText(cell.maxRank)) + '</span>',
              iconSize: [34, 34], iconAnchor: [17, 17],
            }),
            riseOnHover: true,
            zIndexOffset: 1100,
          });
          marker.bindPopup(regionalCellPopup(cell, title));
          return marker;
        });
        const mediumRegionalMarkers = createRegionalMarkers(buildRegionalCells(matched, 0.28), '周辺地域の最大震度');
        const wideRegionalMarkers = createRegionalMarkers(buildRegionalCells(matched, 0.62), '広域地域の最大震度');
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
        if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 8.2 });
        else if (points.length === 1) map.setView(points[0], 8.2);
        else if (event.latitude !== null && event.longitude !== null) map.setView([event.latitude, event.longitude], event.is_distant ? 3.8 : 5.5);
        else map.setView([36.2, 138.2], 4.8);

        const updateZoomLayers = () => {
          if (!map) return;
          const zoom = map.getZoom();
          const detailed = zoom >= MAP_ZOOM_DETAIL_THRESHOLD;
          const medium = zoom >= MAP_ZOOM_MEDIUM_THRESHOLD && !detailed;
          const wide = !detailed && !medium;
          ensureLayer(map, prefectureLayer, wide && prefectureFeatures.length > 0);
          for (const marker of wideRegionalMarkers) ensureLayer(map, marker, wide);
          for (const marker of mediumRegionalMarkers) ensureLayer(map, marker, medium);
          ensureLayer(map, cityLayer, medium || detailed);
          for (const marker of cityMarkers) ensureLayer(map, marker, detailed);
          for (const marker of rankOneStationMarkers) ensureLayer(map, marker, medium || detailed);
        };
        map.on('zoomend', updateZoomLayers);
        updateZoomLayers();
        if (cancelled) return;
        setStatus('ready');
        setMessage(matched.length
          ? '拡大：市町村別 ／ 中間：市町村境界別 ／ 縮小：都道府県形状別の最大震度を表示します。'
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
        <div><p className="text-[11px] font-black text-slate-800 dark:text-white">観測震度マップ</p><p className="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">拡大：市町村別 ／ 中間：市町村境界別 ／ 縮小：都道府県形状別</p></div>
        <span className="text-[9px] text-slate-400">観測市区町村 {matchedCount}件 ／ 丸印＝市町村最大震度</span>
      </div>
      <div className="relative">
        <div ref={mapElement} className="h-[300px] w-full bg-slate-100 sm:h-[360px]" aria-label="地震の観測震度分布地図" />
        {status === 'loading' && <div className="absolute inset-0 flex items-center justify-center bg-white/75 text-xs font-bold text-slate-600 backdrop-blur-[1px] dark:bg-slate-950/70 dark:text-slate-300">{message}</div>}
        {status === 'error' && <div className="absolute inset-x-3 bottom-3 rounded-xl border border-amber-200 bg-white/95 px-3 py-2 text-[10px] leading-relaxed text-amber-800 shadow-sm dark:border-amber-900 dark:bg-slate-900/95 dark:text-amber-200">{message}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
        {[[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5弱'], [6, '5強'], [7, '6弱'], [8, '6強'], [9, '7']].map(([rank, label]) => (
          <span key={rank} className="inline-flex items-center gap-1 text-[9px] font-semibold text-slate-500 dark:text-slate-400">
            <i className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: intensityColor(Number(rank)) }} />{label}<b className="ml-0.5 tabular-nums text-slate-400">{rankCounts[Number(rank)] || 0}</b>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1 border-t border-slate-100 px-3 py-2 text-[9px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-[3px] border border-slate-400 bg-slate-700" />実際の震度1観測点 {rankOneStationCount}点</span>
        <span>地図に表示 {rankOneStationMappedCount}点</span>
        <span>色付き四角＝周辺区画の最大震度</span>
      </div>
      <p className="px-3 pb-2 text-[9px] leading-relaxed text-slate-400">
        広域表示は都道府県形状の塗り分けに周辺区画の最大震度を四角いラベルで重ねます。中間表示は市町村別の塗り分けと周辺区画ラベル、拡大表示は市町村最大震度の丸印と実際の震度1観測点を表示します。観測点の位置は気象庁の震度観測点一覧に基づき、観測期間も照合しています。出典：気象庁／国土数値情報／OpenStreetMap
      </p>
    </div>
  );
}
