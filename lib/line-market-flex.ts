import type { LineMarketSnapshot } from '@/lib/line-market-data';

function formatPrice(value: number, currency: string, type: LineMarketSnapshot['assetType']): string {
  if (type === 'index') return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 }).format(value) + ' pt';
  const digits = type === 'forex' ? (currency === 'JPY' ? 3 : 4) : (currency === 'JPY' ? 0 : 2);
  try {
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  } catch {
    return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: digits }).format(value) + (currency ? ' ' + currency : '');
  }
}
function formatChange(item: LineMarketSnapshot): string {
  if (item.change === null || item.changePercent === null) return '前日比：算出できません';
  const sign = item.change > 0 ? '+' : '';
  const digits = item.assetType === 'forex' ? 4 : item.currency === 'JPY' || item.assetType === 'index' ? 0 : 2;
  const amount = sign + new Intl.NumberFormat('ja-JP', { maximumFractionDigits: digits }).format(item.change);
  return amount + (item.assetType === 'index' ? ' pt' : ' ' + item.currency) + '  (' + sign + item.changePercent.toFixed(2) + '%)';
}
function timestamp(value: string | null): string {
  if (!value) return '更新時刻：不明';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '更新時刻：不明';
  return '更新時刻：' + new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date) + '（日本時間）';
}
function bubble(item: LineMarketSnapshot): Record<string, unknown> {
  const unavailable = item.status === 'unavailable';
  const reference = item.status === 'reference';
  const positive = item.change !== null && item.change >= 0;
  const priceColor = positive ? '#DC2626' : '#2563EB';
  const kind = item.assetType === 'forex' ? 'FOREIGN EXCHANGE' : item.assetType === 'index' ? 'MARKET INDEX' : 'STOCK';
  const body: Record<string, unknown>[] = [
    { type: 'text', text: item.symbol || item.label, size: 'xs', color: '#64748B', weight: 'bold', wrap: true },
  ];
  if (unavailable) {
    body.push(
      { type: 'text', text: 'データを取得できませんでした', size: 'lg', color: '#B91C1C', weight: 'bold', wrap: true, margin: 'md' },
      { type: 'text', text: item.note, size: 'sm', color: '#475569', wrap: true, margin: 'sm' },
    );
  } else {
    body.push(
      { type: 'text', text: formatPrice(item.price as number, item.currency, item.assetType), size: 'xxl', color: '#0F172A', weight: 'bold', wrap: true, margin: 'md' },
      { type: 'box', layout: 'vertical', paddingAll: '12px', cornerRadius: '10px', backgroundColor: positive ? '#FEF2F2' : '#EFF6FF', contents: [
        { type: 'text', text: '前日終値比', size: 'xs', color: '#64748B', weight: 'bold' },
        { type: 'text', text: formatChange(item), size: 'md', color: priceColor, weight: 'bold', wrap: true },
      ] },
    );
    const stats: Record<string, unknown>[] = [];
    if (item.previousClose !== null) stats.push({ type: 'box', layout: 'horizontal', justifyContent: 'space-between', contents: [
      { type: 'text', text: '前日終値', size: 'xs', color: '#64748B', flex: 2 },
      { type: 'text', text: formatPrice(item.previousClose, item.currency, item.assetType), size: 'xs', color: '#334155', flex: 3, align: 'end', wrap: true },
    ] });
    if (item.dayHigh !== null || item.dayLow !== null) stats.push({ type: 'box', layout: 'horizontal', justifyContent: 'space-between', contents: [
      { type: 'text', text: '当日高値 / 安値', size: 'xs', color: '#64748B', flex: 2 },
      { type: 'text', text: (item.dayHigh === null ? '—' : formatPrice(item.dayHigh, item.currency, item.assetType)) + ' / ' + (item.dayLow === null ? '—' : formatPrice(item.dayLow, item.currency, item.assetType)), size: 'xs', color: '#334155', flex: 3, align: 'end', wrap: true },
    ] });
    if (item.marketState) stats.push({ type: 'box', layout: 'horizontal', justifyContent: 'space-between', contents: [
      { type: 'text', text: '市場状態', size: 'xs', color: '#64748B', flex: 2 },
      { type: 'text', text: item.marketState, size: 'xs', color: '#334155', flex: 3, align: 'end', wrap: true },
    ] });
    if (stats.length) {
      body.push({ type: 'separator', color: '#E2E8F0', margin: 'md' });
      body.push({ type: 'box', layout: 'vertical', spacing: 'sm', margin: 'md', contents: stats });
    }
    body.push(
      { type: 'text', text: timestamp(item.marketTime), size: 'xs', color: '#64748B', wrap: true, margin: 'md' },
      { type: 'text', text: item.source + ' ・ ' + item.note, size: 'xxs', color: '#64748B', wrap: true, margin: 'sm' },
    );
  }
  body.push({ type: 'separator', color: '#E2E8F0', margin: 'md' });
  body.push({ type: 'text', text: '参考情報です。配信遅延や更新時刻の差が生じる場合があります。売買の推奨・投資助言ではありません。', size: 'xxs', color: '#64748B', wrap: true });
  return {
    type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', backgroundColor: unavailable ? '#7F1D1D' : '#0F172A', paddingAll: '18px', spacing: 'sm', contents: [
      { type: 'text', text: 'CAMPUSSYNC  /  ' + kind, size: 'xs', color: '#67E8F9', weight: 'bold', wrap: true },
      { type: 'text', text: item.label, size: 'xl', color: '#FFFFFF', weight: 'bold', wrap: true },
      { type: 'text', text: unavailable ? 'DATA UNAVAILABLE' : reference ? 'DAILY REFERENCE RATE' : 'MARKET DATA', size: 'xxs', color: '#CBD5E1', weight: 'bold', wrap: true },
    ] },
    body: { type: 'box', layout: 'vertical', paddingAll: '18px', spacing: 'sm', contents: body },
  };
}

export function buildLineMarketFlexMessage(question: string, snapshots: LineMarketSnapshot[]) {
  const cards = snapshots.slice(0, 5).map(bubble);
  const contents = cards.length > 1 ? { type: 'carousel', contents: cards } : cards[0] || bubble({
    assetType: 'stock', status: 'unavailable', label: '市場データ', symbol: '', price: null, currency: '',
    previousClose: null, change: null, changePercent: null, dayHigh: null, dayLow: null,
    marketTime: null, marketState: null, source: '', note: '市場データを取得できませんでした。',
  });
  const summary = snapshots.map(x => x.status === 'unavailable' ? x.label + '：取得不可' : x.label + '：' + formatPrice(x.price as number, x.currency, x.assetType)).join(' ／ ');
  return { type: 'flex' as const, altText: ('CampusSync 市場情報｜' + question + '｜' + summary).slice(0, 400), contents };
}
