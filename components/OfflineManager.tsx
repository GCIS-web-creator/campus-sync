'use client';

import { useEffect, useState } from 'react';
import { CloudOff, Wifi } from 'lucide-react';

type NetworkInformationLike = EventTarget & {
  type?: string;
  effectiveType?: string;
  saveData?: boolean;
};

type NavigatorWithNetworkInformation = Navigator & {
  connection?: NetworkInformationLike;
};

type CampusSyncNetworkEvent = 'campussync:network-online' | 'campussync:network-offline';

export default function OfflineManager() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const handleNetworkOnline = () => setOnline(true);
    const handleNetworkOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('campussync:network-online', handleNetworkOnline as EventListener);
    window.addEventListener('campussync:network-offline', handleNetworkOffline as EventListener);

    let connection: NetworkInformationLike | undefined;
    let readyWorker: ServiceWorker | null = null;

    const updateWifiPrefetch = () => {
      if (!readyWorker) return;
      const isWifi = connection?.type === 'wifi' && connection.saveData !== true;
      readyWorker.postMessage({
        type: isWifi
          ? 'CAMPUSSYNC_PREFETCH_ON_WIFI'
          : 'CAMPUSSYNC_CANCEL_WIFI_PREFETCH',
      });
    };

    let removeConnectionListener: () => void = () => {};

    if ('serviceWorker' in navigator) {
      const networkNavigator = navigator as NavigatorWithNetworkInformation;
      connection = networkNavigator.connection;

      if (connection) {
        connection.addEventListener('change', updateWifiPrefetch);
        removeConnectionListener = () => connection?.removeEventListener('change', updateWifiPrefetch);
      }

      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then(async (registration) => {
          await navigator.serviceWorker.ready;
          readyWorker = registration.active || navigator.serviceWorker.controller;
          updateWifiPrefetch();
          registration.update().catch(() => undefined);
        })
        .catch((error) => console.warn('CampusSync offline worker registration failed:', error));
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('campussync:network-online', handleNetworkOnline as EventListener);
      window.removeEventListener('campussync:network-offline', handleNetworkOffline as EventListener);
      removeConnectionListener();
      readyWorker?.postMessage({ type: 'CAMPUSSYNC_CANCEL_WIFI_PREFETCH' });
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-3 right-3 top-3 z-[90] mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-amber-300 bg-slate-950/95 px-4 py-3 text-white shadow-2xl backdrop-blur"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">
        <CloudOff size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-black">オフラインモード</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-slate-300">
          端末内の機能と保存済み資料、直近14日以内に取得したデータを利用できます。通信が必要な操作は接続回復後にご利用ください。
        </span>
      </span>
      <Wifi size={16} className="shrink-0 text-slate-500" aria-hidden="true" />
    </div>
  );
}
