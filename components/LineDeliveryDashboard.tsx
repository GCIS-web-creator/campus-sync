'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowDownToLine, CheckCircle2, Clock3,
  MessageCircle, RadioTower, RefreshCw, Search, Send, Smartphone, Users,
} from 'lucide-react';

type DeliveryEvent = {
  id: string; source: string; delivery_batch_id: string | null;
  channel: string; destination_type: string; destination_id: string | null;
  kind: string; bot_slot: number | null; status: string; http_status: number | null;
  line_request_id: string | null; retry_key: string | null; title: string;
  alt_text: string | null; message_count: number | null; bubble_count: number | null;
  message_text: string; response_summary: string | null; sent_at: string;
};
type DashboardData = {
  success: boolean; days: number; events: DeliveryEvent[];
  rotation: { active_bot_slot: number; next_switch_at: string; last_switched_at: string | null } | null;
  botEnvironment: Array<{ slot: number; channelSecretConfigured: boolean; accessTokenConfigured: boolean }>;
  groups: Array<{ chat_id: string; chat_type: string; active: boolean; bot_slot: number | null; last_seen_at: string }>;
  dataWarnings?: string[]; note?: string; message?: string;
};

const KIND_LABELS: Record<string, string> = {
  daily_digest: '毎日の学校情報まとめ', train_timetable: '電車時刻表', class_timetable: '翌日の時間割',
  school_schedule: '週間学校予定表', school_event_countdown: '学校イベント', cafeteria_sold_out: '学食売切', cafeteria_menu: '今日の学食メニュー',
  assignment_updates: '課題通知', quick_notice: 'クイックお知らせ', school_notification: '学園総合通知',
  earthquake_alert: '地震情報', weather_alert: '気象警報', weather_forecast_test: '天気予報テスト',
  bot_rotation: 'BOT切替予告', club_note: '部活・委員会投稿', lost_found: '落とし物通知',
  campus_ai: 'CampusSync AI返信', legacy: '過去の配信',
};
const jst = (value: string | null | undefined) => {
  if (!value) return '日時不明';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '日時不明' : new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date);
};
const channelLabel = (channel: string, destination: string) => channel === 'broadcast'
  ? '公式アカウント一斉配信' : channel === 'reply' ? '個別返信'
  : destination === 'room' ? 'LINEルーム送信' : 'LINEグループ送信';
const destinationLabel = (event: DeliveryEvent) => {
  if (event.destination_type === 'official_account') return '公式アカウントの友だち全員';
  if (event.destination_type === 'user') return event.destination_id ? '個別ユーザー ·••' + event.destination_id.slice(-6) : '返信先ユーザー';
  return event.destination_id ? (event.destination_type === 'room' ? 'ルーム' : 'グループ') + ' ·••' + event.destination_id.slice(-6) : '送信先不明';
};
const formatNumber = (value: number) => value.toLocaleString('ja-JP');

export default function LineDeliveryDashboard() {
  const [range, setRange] = useState(14);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [botFilter, setBotFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/line-delivery-dashboard?days=' + range, { cache: 'no-store', credentials: 'same-origin' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) throw new Error(result?.message || 'LINE配信ダッシュボードを読み込めませんでした。');
      setData(result as DashboardData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'LINE配信データを読み込めませんでした。');
      setData(null);
    } finally { setLoading(false); }
  }, [range]);
  useEffect(() => { void load(); }, [load]);

  const events = data?.events || [];
  const filteredEvents = useMemo(() => events.filter(event => {
    if (statusFilter !== 'all' && event.status !== statusFilter) return false;
    if (channelFilter !== 'all' && event.channel !== channelFilter) return false;
    if (botFilter !== 'all' && String(event.bot_slot ?? 'unknown') !== botFilter) return false;
    if (kindFilter !== 'all' && event.kind !== kindFilter) return false;
    const query = search.trim().toLocaleLowerCase();
    if (query) {
      const haystack = [event.title, event.alt_text, event.message_text, event.kind, event.destination_id, event.line_request_id, event.response_summary]
        .filter(Boolean).join(' ').toLocaleLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  }), [events, statusFilter, channelFilter, botFilter, kindFilter, search]);

  const stats = useMemo(() => {
    const success = filteredEvents.filter(event => event.status === 'success').length;
    const failed = filteredEvents.filter(event => event.status === 'failure').length;
    return {
      total: filteredEvents.length, success, failed,
      broadcasts: filteredEvents.filter(event => event.channel === 'broadcast').length,
      groups: filteredEvents.filter(event => event.channel === 'push').length,
      replies: filteredEvents.filter(event => event.channel === 'reply').length,
      successRate: filteredEvents.length ? Math.round(success / filteredEvents.length * 100) : 0,
    };
  }, [filteredEvents]);

  const daily = useMemo(() => {
    const dayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    const keys = Array.from({ length: range }, (_, index) => {
      const date = new Date(); date.setDate(date.getDate() - (range - 1 - index)); return dayKey(date);
    });
    const counts = keys.map(key => filteredEvents.filter(event => dayKey(new Date(event.sent_at)) === key).length);
    const max = Math.max(1, ...counts);
    return keys.map((key, index) => ({ key, count: counts[index], height: Math.max(3, counts[index] / max * 100) }));
  }, [filteredEvents, range]);

  const kindCounts = useMemo(() => {
    const counts = new Map<string, number>();
    filteredEvents.forEach(event => counts.set(event.kind || 'general', (counts.get(event.kind || 'general') || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [filteredEvents]);
  const kinds = useMemo(() => Array.from(new Set(events.map(event => event.kind).filter(Boolean))).sort(), [events]);

  const exportCsv = () => {
    const columns = ['日時(JST)', '送信種類', 'カテゴリ', '内容', '送信先', 'BOT', '結果', 'HTTP', 'LINE Request ID', '本文'];
    const rows = filteredEvents.map(event => [jst(event.sent_at), channelLabel(event.channel, event.destination_type),
      KIND_LABELS[event.kind] || event.kind, event.title, destinationLabel(event),
      event.bot_slot === null ? '不明' : 'BOT ' + event.bot_slot, event.status === 'success' ? 'API受付成功' : '失敗',
      event.http_status ?? '', event.line_request_id || '', event.message_text || event.alt_text || '']);
    const csv = [columns, ...rows].map(row => row.map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'campussync-line-delivery-' + range + 'd.csv'; anchor.click(); URL.revokeObjectURL(url);
  };

  const card = (label: string, value: number, detail: string, icon: ReactNode) => (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-400"><span>{label}</span><span className="text-cyan-300">{icon}</span></div>
      <div className="mt-2 text-3xl font-black tabular-nums text-white">{formatNumber(value)}</div>
      <p className="mt-1 text-[11px] text-slate-500">{detail}</p>
    </div>
  );

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-cyan-300"><RadioTower size={18}/><span className="text-xs font-black tracking-[0.18em]">LINE DELIVERY CENTER</span></div>
          <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">LINE配信ダッシュボード</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">公式アカウント・グループ・AI返信の送信記録、BOT、API応答、失敗理由をまとめて確認できます。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={range} onChange={event => setRange(Number(event.target.value))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs font-bold text-white">
            <option value={1}>直近24時間</option><option value={7}>直近7日間</option><option value={14}>直近14日間</option>
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>更新</button>
          <button type="button" onClick={exportCsv} disabled={!filteredEvents.length} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-cyan-500 disabled:opacity-50"><ArrowDownToLine size={14}/>CSV出力</button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
      {data?.dataWarnings?.map(warning => <div key={warning} className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">{warning}</div>)}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {card('送信リクエスト', stats.total, '選択中の期間・絞り込み条件', <Activity size={17}/>)}
        {card('LINE API受付成功', stats.success, '成功率 ' + stats.successRate + '%', <CheckCircle2 size={17}/>)}
        {card('失敗・エラー', stats.failed, 'HTTPエラー・通信失敗', <AlertTriangle size={17}/>)}
        {card('公式アカウント配信', stats.broadcasts, '友だち全員向けbroadcast', <RadioTower size={17}/>)}
        {card('グループ・ルーム送信', stats.groups, '送信先ごとのpush', <Users size={17}/>)}
        {card('AIなど個別返信', stats.replies, 'Webhook reply', <MessageCircle size={17}/>)}
        {card('登録済みグループ', data?.groups?.filter(group => group.active).length || 0, '現在有効なグループ・ルーム', <Smartphone size={17}/>)}
        {card('表示BOT数', new Set(filteredEvents.map(event => event.bot_slot).filter(slot => slot !== null)).size, '履歴から確認できたBOT', <Send size={17}/>)}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3"><h3 className="font-black text-white">日別配信数</h3><span className="text-[11px] text-slate-500">JST・リクエスト件数</span></div>
          <div className="mt-5 flex h-40 items-end gap-1.5 sm:gap-2">
            {daily.map(day => <div key={day.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <span className="text-[10px] tabular-nums text-slate-400">{day.count || ''}</span>
              <div className="flex h-28 w-full items-end overflow-hidden rounded-t-md bg-slate-900"><div className="w-full rounded-t-md bg-cyan-500/80" style={{ height: day.height + '%' }}/></div>
              <span className="text-[9px] text-slate-500">{day.key.slice(5).replace('-', '/')}</span>
            </div>)}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
          <h3 className="font-black text-white">配信カテゴリ別</h3>
          <div className="mt-4 space-y-3">
            {kindCounts.length ? kindCounts.map(([kind, count]) => <div key={kind}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="text-slate-300">{KIND_LABELS[kind] || kind}</span><span className="tabular-nums text-slate-400">{count}</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-teal-500" style={{ width: Math.max(3, count / Math.max(1, stats.total) * 100) + '%' }}/></div>
            </div>) : <p className="text-xs text-slate-500">配信記録がありません。</p>}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-black text-white">BOTローテーション状況</h3><p className="mt-1 text-xs text-slate-500">アクセストークン・Channel Secretの値は表示しません。</p></div>
          {data?.rotation && <span className="rounded-full bg-cyan-500/15 px-3 py-1.5 text-xs font-black text-cyan-200">現在 BOT {data.rotation.active_bot_slot}</span>}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {(data?.botEnvironment || []).map(bot => <div key={bot.slot} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <p className="font-bold text-white">BOT {bot.slot}</p>
            <p className={'mt-2 text-xs ' + (bot.channelSecretConfigured ? 'text-emerald-300' : 'text-rose-300')}>Channel Secret {bot.channelSecretConfigured ? '登録済み' : '未登録'}</p>
            <p className={'mt-1 text-xs ' + (bot.accessTokenConfigured ? 'text-emerald-300' : 'text-rose-300')}>アクセストークン {bot.accessTokenConfigured ? '登録済み' : '未登録'}</p>
          </div>)}
        </div>
        {data?.rotation && <p className="mt-3 text-xs text-slate-400">次回切替予定：{jst(data.rotation.next_switch_at)} ／ 最終切替：{jst(data.rotation.last_switched_at)}</p>}
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <div><h3 className="font-black text-white">配信履歴・送信内容</h3><p className="mt-1 text-xs text-slate-500">検索・絞り込み後の一覧をCSV保存できます。</p></div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <label className="relative sm:col-span-2 xl:col-span-1"><Search size={14} className="absolute left-3 top-3 text-slate-500"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="内容・送信先・IDを検索" className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 pl-9 pr-3 text-xs text-white outline-none focus:border-cyan-500"/></label>
            <select value={channelFilter} onChange={event => setChannelFilter(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs text-white"><option value="all">すべての送信先</option><option value="broadcast">公式アカウント</option><option value="push">グループ・ルーム</option><option value="reply">個別返信</option></select>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs text-white"><option value="all">成功・失敗すべて</option><option value="success">API受付成功</option><option value="failure">失敗のみ</option></select>
            <select value={botFilter} onChange={event => setBotFilter(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs text-white"><option value="all">全BOT</option><option value="0">旧BOT / 単独BOT</option><option value="1">BOT 1</option><option value="2">BOT 2</option><option value="3">BOT 3</option><option value="4">BOT 4</option><option value="5">BOT 5</option><option value="unknown">BOT不明</option></select>
            <select value={kindFilter} onChange={event => setKindFilter(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs text-white"><option value="all">全カテゴリ</option>{kinds.map(kind => <option key={kind} value={kind}>{KIND_LABELS[kind] || kind}</option>)}</select>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500"><span>{formatNumber(filteredEvents.length)}件表示</span><span>{loading ? '更新中...' : '最終取得 ' + jst(new Date().toISOString())}</span></div>
        {loading && !data ? <div className="py-12 text-center text-sm text-slate-500">LINE配信履歴を読み込んでいます...</div> : filteredEvents.length === 0 ? <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center text-sm text-slate-500">条件に一致する配信履歴はありません。</div> : (
          <div className="space-y-2">
            {filteredEvents.map(event => {
              const expanded = expandedId === event.id; const ok = event.status === 'success';
              return <article key={event.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                <button type="button" onClick={() => setExpandedId(expanded ? null : event.id)} className="w-full p-3 text-left sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={'rounded-full px-2 py-1 text-[10px] font-black ' + (ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300')}>{ok ? 'API受付成功' : '送信失敗'}</span>
                      <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-bold text-cyan-200">{channelLabel(event.channel, event.destination_type)}</span>
                      <span className="text-[10px] text-slate-500">{KIND_LABELS[event.kind] || event.kind}</span>
                    </div>
                    <h4 className="mt-2 break-words text-sm font-black text-white">{event.title || event.alt_text || 'LINEメッセージ'}</h4>
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-400">{event.message_text || event.alt_text || '本文詳細は旧履歴のため記録されていません。'}</p>
                  </div><span className="shrink-0 text-[10px] text-slate-500">{expanded ? '閉じる' : '詳細を見る'}</span></div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
                    <span className="inline-flex items-center gap-1"><Clock3 size={11}/>{jst(event.sent_at)}</span>
                    <span>{event.bot_slot === null ? 'BOT不明' : event.bot_slot === 0 ? '旧BOT' : 'BOT ' + event.bot_slot}</span>
                    <span>{destinationLabel(event)}</span>
                    {event.http_status !== null && <span>HTTP {event.http_status}</span>}
                    {event.bubble_count ? <span>{event.bubble_count}カード</span> : null}
                  </div>
                </button>
                {expanded && <div className="space-y-3 border-t border-slate-800 bg-slate-950 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">送信日時</p><p className="mt-1 text-xs text-slate-200">{jst(event.sent_at)}</p></div>
                    <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">送信先</p><p className="mt-1 break-all text-xs text-slate-200">{destinationLabel(event)}</p></div>
                    <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">LINE Request ID</p><p className="mt-1 break-all text-xs text-slate-200">{event.line_request_id || '未記録（旧ログ）'}</p></div>
                    <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">配信Batch ID</p><p className="mt-1 break-all text-xs text-slate-200">{event.delivery_batch_id || '未記録'}</p></div>
                    <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">送信BOT</p><p className="mt-1 text-xs text-slate-200">{event.bot_slot === null ? '記録なし' : 'BOT ' + event.bot_slot}</p></div>
                    <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">HTTP応答</p><p className="mt-1 text-xs text-slate-200">{event.http_status ?? '旧ログのため未記録'}</p></div>
                  </div>
                  {event.alt_text && <div><p className="text-[10px] font-bold text-slate-500">LINE通知プレビュー（Alt Text）</p><p className="mt-1 whitespace-pre-wrap text-xs text-slate-200">{event.alt_text}</p></div>}
                  {event.message_text && <div><p className="text-[10px] font-bold text-slate-500">送信本文・Flex内テキスト</p><pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-3 font-sans text-xs leading-5 text-slate-200">{event.message_text}</pre></div>}
                  <div><p className="text-[10px] font-bold text-slate-500">LINE API応答・失敗理由</p><p className={'mt-1 whitespace-pre-wrap break-words text-xs ' + (ok ? 'text-emerald-300' : 'text-rose-300')}>{event.response_summary || '応答本文の記録はありません。'}</p></div>
                  {event.retry_key && <div><p className="text-[10px] font-bold text-slate-500">Retry Key</p><p className="mt-1 break-all text-xs text-slate-400">{event.retry_key}</p></div>}
                  <div className="text-[10px] text-slate-500">記録元：{event.source === 'detailed' ? '詳細監査ログ' : event.source === 'legacy_group_log' ? '従来のグループ別ログ' : '従来の公式配信履歴'}</div>
                </div>}
              </article>;
            })}
          </div>
        )}
      </section>
      <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-200/80"><AlertTriangle size={13} className="mr-1 inline"/>{data?.note || '「API受付成功」はLINE側がリクエストを受け付けた意味です。実際の端末到達・既読数とは異なります。詳細監査ログは直近14日間保持します。'}</p>
    </div>
  );
}
