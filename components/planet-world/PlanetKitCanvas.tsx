'use client';

import { useCallback, useMemo, useState } from 'react';
import { PlanetCanvas } from '@/lib/planet-kit/src/react/PlanetCanvas';
import { useAssetCatalog } from '@/lib/planet-kit/src/react/useAssetCatalog';
import type { LayerName } from '@/lib/planet-kit/src/render/PlanetView';

type Props = {
  planetId: string;
  planetName: string;
};

const LAYER_LABELS: Array<{ key: LayerName; label: string }> = [
  { key: 'clouds', label: '雲' },
  { key: 'atmosphere', label: '大気' },
  { key: 'ring', label: 'リング' },
  { key: 'emissive', label: '夜面発光' },
  { key: 'relief', label: '地形陰影' },
];

export default function PlanetKitCanvas({ planetId, planetName }: Props) {
  const { catalog, error: catalogError } = useAssetCatalog('/planet-assets');
  const [paused, setPaused] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [enabledLayers, setEnabledLayers] = useState<Record<LayerName, boolean>>({
    clouds: true, atmosphere: true, ring: true, emissive: true, objects: true, relief: true,
  });
  const [surfacePoint, setSurfacePoint] = useState<{ lat: number; lon: number } | null>(null);
  const [loadError, setLoadError] = useState('');
  const layers = useMemo(() => enabledLayers, [enabledLayers]);
  const onSurfaceTap = useCallback((point: { lat: number; lon: number }) => setSurfacePoint(point), []);
  const onError = useCallback((error: Error) => setLoadError(error.message), []);
  const toggleLayer = (key: LayerName) => setEnabledLayers((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-[#03050b]">
      {catalog && !catalogError && !loadError ? (
        <PlanetCanvas
          planetId={planetId} catalog={catalog} quality="auto"
          timeScale={timeScale} paused={paused} sun={{ mode: 'orbit' }}
          layers={layers} onSurfaceTap={onSurfaceTap} onError={onError}
          className="absolute inset-0"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-slate-300">
          {catalogError || loadError ? '惑星素材の読み込みに失敗しました: ' + (catalogError?.message || loadError) : '50惑星の高精細素材を読み込んでいます…'}
        </div>
      )}

      <div className="pointer-events-none absolute left-3 top-[100px] max-w-[min(330px,calc(100%-1.5rem))] rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-white shadow-xl backdrop-blur-md sm:left-4 sm:top-[94px]">
        <p className="text-[9px] font-black tracking-[.2em] text-cyan-300">PLANET KIT · 360° SURFACE</p>
        <p className="mt-1 text-sm font-black">{planetName}</p>
        <p className="mt-1 text-[10px] leading-4 text-slate-300">ドラッグで360°回転 · ホイール/ピンチでズーム · 表面タップで緯度・経度を確認</p>
        {surfacePoint && <p className="mt-1.5 font-mono text-[9px] text-cyan-200">LAT {surfacePoint.lat.toFixed(2)}° / LON {surfacePoint.lon.toFixed(2)}°</p>}
      </div>

      <div className="absolute bottom-3 left-3 right-3 rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-white shadow-2xl backdrop-blur-md sm:bottom-4 sm:left-4 sm:right-auto sm:w-[min(430px,calc(100%-2rem))]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-black tracking-wide text-cyan-100">環境・時間コントロール</p>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setPaused((value) => !value)} className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-[10px] font-bold">{paused ? '再開' : '一時停止'}</button>
            <button type="button" onClick={() => setTimeScale((value) => value === 1 ? 60 : value === 60 ? 3600 : 1)} className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1.5 text-[10px] font-bold text-cyan-100">時間 {timeScale.toLocaleString('ja-JP')}×</button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {LAYER_LABELS.map(({ key, label }) => (
            <button key={key} type="button" aria-pressed={enabledLayers[key]} onClick={() => toggleLayer(key)} className={'rounded-lg border px-2 py-1.5 text-[10px] font-bold '+(enabledLayers[key] ? 'border-cyan-300/35 bg-cyan-300/15 text-cyan-100' : 'border-white/10 bg-white/5 text-slate-400')}>
              {label} {enabledLayers[key] ? 'ON' : 'OFF'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
