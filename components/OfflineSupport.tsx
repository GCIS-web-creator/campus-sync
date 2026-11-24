'use client';

import { useEffect, useState } from 'react';
import { CloudDownload, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { clearOfflineMaterialsForUser } from '@/lib/offline-materials';

type SyncItem = { url: string; authenticated: boolean };

function currentMondayKey(): string {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return [monday.getFullYear(), String(monday.getMonth() + 1).padStart(2, '0'), String(monday.getDate()).padStart(2, '0')].join('-');
}

export default function OfflineSupport() {
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncProgress, setSyncProgress] = useState(0);
  const [wifiConfirmed, setWifiConfirmed] = useState(false);

  useEffect(() => {
    const updateNetwork = () => setOnline(navigator.onLine);
    updateNetwork();
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(registration => registration.update().catch(() => undefined))
        .catch(error => console.error('CampusSync offline service worker registration failed:', error));
    }

    let currentUserId: string | null = null;
    void supabase.auth.getSession().then(({ data }) => {
      currentUserId = data.session?.user.id || null;
    }).catch(() => undefined);

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUserId = session?.user.id || null;
      if (event === 'SIGNED_OUT' && currentUserId) {
        const signedOutUserId = currentUserId;
        void clearOfflineMaterialsForUser(signedOutUserId).catch(error => console.error('CampusSync offline material cleanup failed:', error));
        navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_USER_CACHE', userId: signedOutUserId });
      } else if (currentUserId && nextUserId && currentUserId !== nextUserId) {
        const previousUserId = currentUserId;
        void clearOfflineMaterialsForUser(previousUserId).catch(() => undefined);
        navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_USER_CACHE', userId: previousUserId });
      }
      currentUserId = nextUserId;
    });

    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
      authListener.subscription.unsubscribe();
    };
  }, []);

  const syncOfflineData = async () => {
    if (!navigator.onLine || syncing) return;
    const networkType = (navigator as Navigator & { connection?: { type?: string } }).connection?.type;
    if (networkType && networkType !== 'wifi') {
      setSyncMessage('Wi-Fi接続が確認できません。モバイル通信を使わないため、Wi-Fiに接続してから同期してください。');
      return;
    }
    if (!wifiConfirmed) {
      setSyncMessage('Wi-Fiに接続していることを確認してから同期してください。');
      return;
    }
    setSyncing(true);
    setSyncProgress(0);
    setSyncMessage('端末に保存するデータを確認しています…');
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const token = data.session?.access_token || '';
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.ready.catch(() => undefined);
      }
      const syncItems: SyncItem[] = [
        { url: '/api/weather/forecast', authenticated: false },
        { url: '/api/class-timetable', authenticated: false },
        { url: '/api/school-countdowns', authenticated: false },
        { url: '/api/school-schedule?weekStart=' + currentMondayKey(), authenticated: false },
        { url: '/api/campus-facilities', authenticated: true },
        { url: '/api/club-notes', authenticated: true },
        { url: '/api/materials', authenticated: true },
      ];
      let succeeded = 0;
      const failures: string[] = [];
      for (let index = 0; index < syncItems.length; index += 1) {
        if (!navigator.onLine) break;
        const item = syncItems[index];
        if (item.authenticated && !token) {
          failures.push(item.url);
        } else {
          try {
            const response = await fetch(item.url, {
              method: 'GET',
              headers: item.authenticated ? { Authorization: 'Bearer ' + token } : undefined,
              cache: 'no-store',
            });
            if (response.ok) succeeded += 1;
            else failures.push(item.url);
          } catch {
            failures.push(item.url);
          }
        }
        setSyncProgress(index + 1);
        setSyncMessage('同期中 ' + (index + 1) + ' / ' + syncItems.length);
      }
      if (!navigator.onLine) {
        setSyncMessage('接続が切れたため同期を中断しました。保存済みデータは引き続き利用できます。');
      } else if (succeeded > 0) {
        setSyncMessage('同期完了：' + succeeded + ' / ' + syncItems.length + '項目。PDFはプリント資料室で個別に「オフラインに保存」してください。');
      } else {
        setSyncMessage('同期できませんでした。ログイン状態と通信環境を確認してください。');
      }
      if (failures.length) console.info('CampusSync offline sync skipped or failed:', failures);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'オフライン用データを同期できませんでした。');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed bottom-4 left-3 z-[120] max-w-[min(23rem,calc(100vw-1.5rem))]" aria-live="polite">
      <div className={'rounded-2xl border px-3 py-2.5 shadow-xl backdrop-blur-xl ' + (online
        ? 'border-slate-200/80 bg-white/95 text-slate-800 dark:border-slate-700 dark:bg-slate-950/95 dark:text-slate-100'
        : 'border-amber-300 bg-amber-50/95 text-amber-950 dark:border-amber-700 dark:bg-amber-950/95 dark:text-amber-100')}>
        <div className="flex items-center gap-2">
          {online ? <Wifi size={15} className="shrink-0 text-emerald-600" /> : <WifiOff size={15} className="shrink-0 text-amber-600" />}
          <span className="text-[11px] font-black">{online ? 'オンライン' : 'オフラインモード'}</span>
          {online ? (
            <button type="button" onClick={() => void syncOfflineData()} disabled={syncing || !wifiConfirmed} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-2.5 py-1.5 text-[10px] font-black text-white disabled:opacity-40">
              {syncing ? <RefreshCw size={12} className="animate-spin" /> : <CloudDownload size={12} />}
              {syncing ? '同期中' : 'Wi-Fi接続時に同期'}
            </button>
          ) : (
            <span className="ml-auto rounded-lg bg-amber-200/70 px-2 py-1 text-[10px] font-black dark:bg-amber-900">保存データのみ利用可能</span>
          )}
        </div>
        {online && <label className="mt-2 flex cursor-pointer items-center gap-2 text-[10px] leading-4"><input type="checkbox" checked={wifiConfirmed} onChange={event => setWifiConfirmed(event.target.checked)} disabled={syncing} className="h-3.5 w-3.5 accent-cyan-600" />この端末がWi-Fiに接続中であることを確認しました</label>}
        {syncMessage && <p className="mt-2 max-w-[20rem] text-[10px] leading-4 opacity-80">{syncMessage}</p>}
        {syncing && <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: (syncProgress / 7 * 100) + '%' }} /></div>}
        {!online && <p className="mt-1 text-[10px] leading-4 opacity-80">投稿・編集・AI・外部サービス連携は接続復帰後に利用できます。</p>}
        {online && <p className="mt-1 text-[10px] leading-4 opacity-70">モバイル通信での同期は行いません。Wi-Fi確認後に手動で同期します。</p>}
      </div>
    </div>
  );
}
