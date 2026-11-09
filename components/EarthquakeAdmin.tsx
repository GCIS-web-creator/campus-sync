'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, RefreshCw, Send } from 'lucide-react';

type Area = { name?: string; prefecture?: string | null; intensity?: string | null };
type Candidate = {
  event_key: string; title: string; event_time: string | null; issued_at: string;
  hypocenter_name: string | null; magnitude: number | string | null; max_intensity: string | null;
  observed_areas: Area[]; noticeStatus: 'not_sent' | 'sending' | 'sent' | 'failed'; noticeError: string | null;
};
function dateLabel(value: string | null, fallback: string) {
  const date = new Date(value || fallback);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '発生時刻不明';
}
export default function EarthquakeAdmin() {
  const [events, setEvents] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingKey, setSendingKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const response = await fetch('/api/admin/earthquake-alerts', { cache: 'no-store' });
      const result = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(result?.events)) throw new Error(result?.message || '地震情報を取得できませんでした。');
      setEvents(result.events as Candidate[]); setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : '地震情報を取得できませんでした。'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const send = async (event: Candidate) => {
    if (event.noticeStatus === 'sent' || sendingKey) return;
    const confirmed = window.confirm(
      dateLabel(event.event_time, event.issued_at) + '・' + (event.hypocenter_name || '震源情報')
      + 'を登録済みLINEグループに通知します。\n\n公式アカウントの友だち全員への一斉配信は行いません。送信しますか？'
    );
    if (!confirmed) return;
    setSendingKey(event.event_key); setMessage(''); setError('');
    try {
      const response = await fetch('/api/admin/earthquake-alerts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventKey: event.event_key }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.message || 'LINEグループ通知に失敗しました。');
      setMessage(result.message || 'LINEグループへ通知しました。'); await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'LINEグループ通知に失敗しました。'); await load(true);
    } finally { setSendingKey(''); }
  };
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black tracking-[0.18em] text-cyan-400">CAMPUSSYNC / EARTHQUAKE ALERT CONTROL</p>
          <h2 className="mt-1 flex items-center gap-2 text-2xl font-black text-white"><Activity className="text-cyan-400" />地震情報・LINEグループ通知</h2>
          <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-400">気象庁が発表した実際の震源・震度情報から通知対象を選択します。通知Flexは通常の地震情報と同じ形式で、実際の観測地域・震度を表示します。</p>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />更新</button>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-cyan-900/70 bg-cyan-950/30 p-4"><p className="text-[10px] font-black text-cyan-200">送信先</p><p className="mt-1 text-sm font-black text-white">登録済みLINEグループ・ルームのみ</p><p className="mt-1 text-[10px] leading-5 text-cyan-100/70">公式アカウントの友だち全員への一斉配信は行いません。</p></div>
        <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4"><p className="text-[10px] font-black text-slate-400">選択対象</p><p className="mt-1 text-sm font-black text-white">実観測データを含む気象庁発表の地震のみ</p><p className="mt-1 text-[10px] leading-5 text-slate-500">観測地点がまだない速報や予報だけの情報は対象外です。</p></div>
      </div>
      {message && <p role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-3 text-xs font-bold text-emerald-200">{message}</p>}
      {error && <p role="alert" className="rounded-xl border border-rose-800 bg-rose-950/30 p-3 text-xs font-bold text-rose-200">{error}</p>}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-black text-white">通知候補の地震</h3><span className="text-[10px] text-slate-500">最新40件 ／ {events.length}件</span></div>
        {loading ? <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-xs text-slate-400">気象庁の観測情報を読み込み中...</div>
          : events.length === 0 ? <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-xs text-slate-400">観測地点データのある地震がありません。</div>
          : <div className="grid gap-3 lg:grid-cols-2">
            {events.map(event => {
              const sent = event.noticeStatus === 'sent';
              const sending = event.noticeStatus === 'sending' || sendingKey === event.event_key;
              const tokyoAreas = (event.observed_areas || []).filter(area => (area.prefecture || '').includes('東京'));
              const shownAreas = tokyoAreas.length ? tokyoAreas : event.observed_areas;
              return <article key={event.event_key} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="text-[10px] font-bold text-slate-500">{dateLabel(event.event_time, event.issued_at)}</p><h4 className="mt-1 break-words text-sm font-black text-white">{event.hypocenter_name || event.title || '震源情報'}</h4><p className="mt-1 text-[10px] text-slate-400">{event.magnitude === null ? 'M —' : 'M' + Number(event.magnitude).toFixed(1)}　・　最大震度 {event.max_intensity || '—'}</p></div>
                  <span className={sent ? 'shrink-0 rounded-full bg-emerald-900/60 px-2 py-1 text-[9px] font-black text-emerald-200' : 'shrink-0 rounded-full bg-slate-800 px-2 py-1 text-[9px] font-black text-slate-300'}>{sent ? 'LINE通知済み' : sending ? '送信処理中' : event.noticeStatus === 'failed' ? '前回送信失敗' : '未通知'}</span>
                </div>
                <div className="mt-3 rounded-xl bg-slate-900 p-3"><p className="text-[9px] font-black text-slate-400">主な観測地域（気象庁発表）</p><p className="mt-1 text-[10px] leading-5 text-slate-200">{shownAreas.slice(0,10).map(area => (area.prefecture || '') + (area.name || '観測地域') + (area.intensity ? ' 震度' + area.intensity : '')).join('　／　')}{shownAreas.length > 10 ? '　ほか' : ''}</p></div>
                {event.noticeError && <p className="mt-2 text-[10px] text-amber-300">{event.noticeError}</p>}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><a href="https://www.jma.go.jp/bosai/map.html#contents=earthquake_map" target="_blank" rel="noreferrer" className="text-[10px] font-bold text-cyan-300 underline underline-offset-2">気象庁の地震情報</a>
                  <button type="button" onClick={() => void send(event)} disabled={sent || sending || Boolean(sendingKey)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-3 py-2 text-[11px] font-black text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500">{sent ? <CheckCircle2 size={13} /> : <Send size={13} />}{sent ? 'グループ通知済み' : sending ? '送信中...' : event.noticeStatus === 'failed' ? '再送する' : 'LINEグループへ通知'}</button>
                </div>
              </article>;
            })}
          </div>}
      </section>
      <p className="flex items-start gap-2 text-[10px] leading-5 text-slate-500"><AlertCircle size={13} className="mt-0.5 shrink-0" />送信は確認ダイアログの後に実行されます。通知済み地震は、生徒用地震情報一覧にも「AdminからLINE通知済み」と表示されます。</p>
    </div>
  );
}
