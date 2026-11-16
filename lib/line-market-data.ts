export type LineMarketChartRange = '1d' | '5d' | '1mo' | '1y';

export type LineMarketSnapshot = {
  assetType: 'forex' | 'stock' | 'index';
  status: 'ok' | 'reference' | 'unavailable';
  label: string;
  symbol: string;
  price: number | null;
  currency: string;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  marketTime: string | null;
  marketState: string | null;
  source: string;
  note: string;
  chartImageUrl?: string | null;
  chartRange?: LineMarketChartRange;
};

type R = Record<string, unknown>;
type FxTarget = { base: string; quote: string; yahoo: string; label: string };
type EquityTarget = { symbol: string; label: string; assetType: 'stock' | 'index' };
const cache = new Map<string, { expires: number; value: LineMarketSnapshot }>();
const chartImageCache = new Map<string, { expires: number; url: string | null }>();

const asRecord = (v: unknown): R | null => typeof v === 'object' && v !== null && !Array.isArray(v) ? v as R : null;
const asNumber = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const asString = (v: unknown): string => typeof v === 'string' ? v : '';

function cached(key: string): LineMarketSnapshot | null {
  const item = cache.get(key);
  if (!item || item.expires <= Date.now()) { cache.delete(key); return null; }
  return item.value;
}
function save(key: string, value: LineMarketSnapshot): LineMarketSnapshot {
  cache.set(key, { expires: Date.now() + 45_000, value });
  if (cache.size > 80) for (const [k, v] of cache) if (v.expires <= Date.now()) cache.delete(k);
  return value;
}
function unavailable(type: LineMarketSnapshot['assetType'], label: string, symbol: string, note: string): LineMarketSnapshot {
  return { assetType: type, status: 'unavailable', label, symbol, price: null, currency: '', previousClose: null,
    change: null, changePercent: null, dayHigh: null, dayLow: null, marketTime: null, marketState: null,
    source: '', note };
}

export function isLineMarketQuestion(question: string): boolean {
  return /為替|通貨|forex|\bfx\b|ドル|ユーロ|ポンド|円安|円高|豪ドル|スイスフラン|カナダドル|NZドル|USD\s*\/?\s*JPY|EUR\s*\/?\s*(?:JPY|USD)|GBP\s*\/?\s*(?:JPY|USD)|AUD\s*\/?\s*JPY|株価|株式|株の値動き|株の動き|個別株|銘柄|チャート|グラフ|株価推移|日経平均|日経225|TOPIX|NASDAQ|ナスダック|S\s*&\s*P|SP500|ダウ平均|NYダウ|日本株|米国株|アメリカ株/i.test(question.normalize('NFKC'));
}

const FX: Array<{ re: RegExp; value: FxTarget }> = [
  { re: /CAD\s*\/?\s*JPY|カナダドル円/i, value: { base: 'CAD', quote: 'JPY', yahoo: 'CADJPY=X', label: 'カナダドル／円' } },
  { re: /AUD\s*\/?\s*JPY|豪ドル円|オーストラリアドル円/i, value: { base: 'AUD', quote: 'JPY', yahoo: 'AUDJPY=X', label: '豪ドル／円' } },
  { re: /NZD\s*\/?\s*JPY|NZドル円/i, value: { base: 'NZD', quote: 'JPY', yahoo: 'NZDJPY=X', label: 'NZドル／円' } },
  { re: /GBP\s*\/?\s*JPY|ポンド円/i, value: { base: 'GBP', quote: 'JPY', yahoo: 'GBPJPY=X', label: 'ポンド／円' } },
  { re: /EUR\s*\/?\s*JPY|ユーロ円/i, value: { base: 'EUR', quote: 'JPY', yahoo: 'EURJPY=X', label: 'ユーロ／円' } },
  { re: /EUR\s*\/?\s*USD|ユーロドル/i, value: { base: 'EUR', quote: 'USD', yahoo: 'EURUSD=X', label: 'ユーロ／米ドル' } },
  { re: /GBP\s*\/?\s*USD|ポンドドル/i, value: { base: 'GBP', quote: 'USD', yahoo: 'GBPUSD=X', label: 'ポンド／米ドル' } },
  { re: /CHF\s*\/?\s*JPY|スイスフラン円/i, value: { base: 'CHF', quote: 'JPY', yahoo: 'CHFJPY=X', label: 'スイスフラン／円' } },
  { re: /USD\s*\/?\s*JPY|ドル円|米ドル(?:対円|円)?/i, value: { base: 'USD', quote: 'JPY', yahoo: 'USDJPY=X', label: '米ドル／円' } },
];

function fxTargets(question: string): FxTarget[] {
  const matches = FX.filter(x => x.re.test(question.normalize('NFKC'))).map(x => x.value);
  if (matches.length) return [...new Map(matches.map(x => [x.yahoo, x])).values()].slice(0, 3);
  if (/ユーロ/i.test(question)) return [FX[4].value];
  if (/ポンド/i.test(question)) return [FX[3].value];
  if (/豪ドル/i.test(question)) return [FX[1].value];
  return [FX[8].value]; // pair omitted -> USD/JPY
}

const INDICES: Array<{ re: RegExp; value: EquityTarget }> = [
  { re: /日経平均|日経225|日経\s*225|\^?N225/i, value: { symbol: '^N225', label: '日経平均株価', assetType: 'index' } },
  { re: /TOPIX|東証株価指数|\^?TOPX/i, value: { symbol: '^TOPX', label: 'TOPIX', assetType: 'index' } },
  { re: /S\s*&\s*P\s*500|SP500|S&P|\^?GSPC/i, value: { symbol: '^GSPC', label: 'S&P 500', assetType: 'index' } },
  { re: /NASDAQ|ナスダック|\^?IXIC/i, value: { symbol: '^IXIC', label: 'NASDAQ総合指数', assetType: 'index' } },
  { re: /NYダウ|ダウ平均|ダウ工業株|\^?DJI/i, value: { symbol: '^DJI', label: 'NYダウ', assetType: 'index' } },
];
const KNOWN: Array<{ re: RegExp; value: EquityTarget }> = [
  { re: /キオクシア|KIOXIA|285A/i, value: { symbol: '285A.T', label: 'キオクシアホールディングス', assetType: 'stock' } },
  { re: /トヨタ|TOYOTA/i, value: { symbol: '7203.T', label: 'トヨタ自動車', assetType: 'stock' } },
  { re: /ソニー|SONY/i, value: { symbol: '6758.T', label: 'ソニーグループ', assetType: 'stock' } },
  { re: /任天堂|NINTENDO/i, value: { symbol: '7974.T', label: '任天堂', assetType: 'stock' } },
  { re: /三菱UFJ|MUFG/i, value: { symbol: '8306.T', label: '三菱UFJフィナンシャル・グループ', assetType: 'stock' } },
  { re: /キーエンス|KEYENCE/i, value: { symbol: '6861.T', label: 'キーエンス', assetType: 'stock' } },
  { re: /ファーストリテイリング|ファストリ|ユニクロ/i, value: { symbol: '9983.T', label: 'ファーストリテイリング', assetType: 'stock' } },
  { re: /日立製作所|日立/i, value: { symbol: '6501.T', label: '日立製作所', assetType: 'stock' } },
  { re: /NTT|日本電信電話/i, value: { symbol: '9432.T', label: 'NTT', assetType: 'stock' } },
  { re: /\bAPPLE\b|アップル/i, value: { symbol: 'AAPL', label: 'Apple', assetType: 'stock' } },
  { re: /\bMICROSOFT\b|マイクロソフト/i, value: { symbol: 'MSFT', label: 'Microsoft', assetType: 'stock' } },
  { re: /\bNVIDIA\b|エヌビディア/i, value: { symbol: 'NVDA', label: 'NVIDIA', assetType: 'stock' } },
  { re: /\bTESLA\b|テスラ/i, value: { symbol: 'TSLA', label: 'Tesla', assetType: 'stock' } },
  { re: /\bAMAZON\b|アマゾン/i, value: { symbol: 'AMZN', label: 'Amazon', assetType: 'stock' } },
  { re: /\bALPHABET\b|グーグル|GOOGLE/i, value: { symbol: 'GOOGL', label: 'Alphabet', assetType: 'stock' } },
];

async function yahooJson(url: string): Promise<R | null> {
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    const target = new URL(url); target.hostname = host;
    try {
      const response = await fetch(target.toString(), {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; CampusSyncMarket/1.0)' },
        cache: 'no-store', signal: AbortSignal.timeout(7_000),
      });
      if (response.ok) return asRecord(await response.json().catch(() => null));
    } catch { /* try alternate Yahoo host */ }
  }
  return null;
}

async function yahooChart(symbol: string, type: LineMarketSnapshot['assetType'], label: string): Promise<LineMarketSnapshot | null> {
  const key = 'yahoo:' + symbol;
  const found = cached(key); if (found) return found;
  const url = new URL('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol));
  url.searchParams.set('range', '5d'); url.searchParams.set('interval', '5m'); url.searchParams.set('includePrePost', 'false');
  const payload = await yahooJson(url.toString());
  const chart = asRecord(payload?.chart);
  const result = asRecord(Array.isArray(chart?.result) ? chart?.result[0] : null);
  const meta = asRecord(result?.meta);
  if (!meta) return null;
  const indicators = asRecord(result?.indicators);
  const quote = asRecord(Array.isArray(indicators?.quote) ? indicators?.quote[0] : null);
  const closes = Array.isArray(quote?.close) ? quote.close : [];
  const latestClose = [...closes].reverse().map(asNumber).find(x => x !== null) ?? null;
  const price = asNumber(meta.regularMarketPrice) ?? latestClose;
  if (price === null || price <= 0) return null;
  const previous = asNumber(meta.chartPreviousClose) ?? asNumber(meta.previousClose);
  const change = previous !== null && previous > 0 ? price - previous : null;
  const timestamps = Array.isArray(result?.timestamp) ? result?.timestamp as unknown[] : [];
  const epoch = asNumber(meta.regularMarketTime) ?? [...timestamps].reverse().map(asNumber).find(x => x !== null) ?? null;
  const marketTime = epoch === null ? null : new Date(epoch * 1000).toISOString();
  const marketStateRaw = asString(meta.marketState);
  const marketStates: Record<string, string> = { REGULAR: '取引時間中', PRE: '取引開始前', POST: '時間外取引', CLOSED: '取引終了' };
  return save(key, {
    assetType: type, status: 'ok',
    label: asString(meta.longName) || asString(meta.shortName) || label,
    symbol, price, currency: asString(meta.currency), previousClose: previous,
    change, changePercent: change !== null && previous !== null && previous > 0 ? change / previous * 100 : null,
    dayHigh: asNumber(meta.regularMarketDayHigh), dayLow: asNumber(meta.regularMarketDayLow),
    marketTime, marketState: marketStates[marketStateRaw] || null,
    source: 'Yahoo Finance',
    note: asNumber(meta.exchangeDataDelayedBy) !== null
      ? '配信元の遅延表示：' + asNumber(meta.exchangeDataDelayedBy) + '分'
      : '配信遅延・更新タイミングに差が生じる場合があります。',
  });
}


export function getLineMarketChartRange(question: string): LineMarketChartRange {
  const q = question.normalize('NFKC').toLowerCase();
  if (/1日|1d|1day|当日/.test(q)) return '1d';
  if (/1週間|1週|5日|5d|1week|1w/.test(q)) return '5d';
  if (/1年|12か月|12ヶ月|1y|1year/.test(q)) return '1y';
  return '1mo';
}

const CHART_RANGE_SETTINGS: Record<LineMarketChartRange, { range: string; interval: string; label: string }> = {
  '1d': { range: '1d', interval: '5m', label: '1日' },
  '5d': { range: '5d', interval: '30m', label: '1週間' },
  '1mo': { range: '1mo', interval: '1d', label: '1か月' },
  '1y': { range: '1y', interval: '1wk', label: '1年' },
};

async function yahooChartImageUrl(
  symbol: string,
  label: string,
  range: LineMarketChartRange,
): Promise<string | null> {
  const cacheKey = symbol + ':' + range;
  const cachedImage = chartImageCache.get(cacheKey);
  if (cachedImage && cachedImage.expires > Date.now()) return cachedImage.url;

  const settings = CHART_RANGE_SETTINGS[range];
  const url = new URL('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol));
  url.searchParams.set('range', settings.range);
  url.searchParams.set('interval', settings.interval);
  url.searchParams.set('includePrePost', 'false');
  const payload = await yahooJson(url.toString());
  const resultData = asRecord(payload?.chart);
  const result = asRecord(Array.isArray(resultData?.result) ? resultData.result[0] : null);
  const indicators = asRecord(result?.indicators);
  const quote = asRecord(Array.isArray(indicators?.quote) ? indicators.quote[0] : null);
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const closes = Array.isArray(quote?.close) ? quote.close : [];
  const rows = timestamps.flatMap((timestamp, index) => {
    const epoch = asNumber(timestamp);
    const close = asNumber(closes[index]);
    return epoch !== null && close !== null ? [{ epoch, close }] : [];
  });
  if (rows.length < 2) {
    chartImageCache.set(cacheKey, { expires: Date.now() + 30_000, url: null });
    return null;
  }

  const maxPoints = range === '1d' ? 12 : range === '5d' ? 14 : 16;
  const count = Math.min(maxPoints, rows.length);
  const selected = Array.from({ length: count }, (_, index) =>
    rows[Math.round(index * (rows.length - 1) / Math.max(1, count - 1))]
  );
  const dateOptions: Intl.DateTimeFormatOptions = range === '1d'
    ? { hour: '2-digit', minute: '2-digit' }
    : range === '1y'
      ? { year: '2-digit', month: '2-digit' }
      : { month: '2-digit', day: '2-digit' };
  const labels = selected.map(row => new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', ...dateOptions,
  }).format(new Date(row.epoch * 1000)));
  const values = selected.map(row => Number(row.close.toFixed(4)));
  const rising = selected[selected.length - 1].close >= selected[0].close;
  const lineColor = rising ? '#DC2626' : '#2563EB';
  const chartConfig = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: lineColor,
        backgroundColor: rising ? 'rgba(220,38,38,0.10)' : 'rgba(37,99,235,0.10)',
        borderWidth: 3,
        pointRadius: 0,
        pointHitRadius: 8,
        tension: 0.28,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: { display: true, text: label.slice(0, 48) + ' ・ ' + settings.label },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } },
        y: { grid: { color: '#E2E8F0' }, ticks: { maxTicksLimit: 5 } },
      },
    },
  };
  const chartUrl = new URL('https://quickchart.io/chart');
  chartUrl.searchParams.set('width', '900');
  chartUrl.searchParams.set('height', '360');
  chartUrl.searchParams.set('format', 'png');
  chartUrl.searchParams.set('version', '4');
  chartUrl.searchParams.set('backgroundColor', 'white');
  chartUrl.searchParams.set('chart', JSON.stringify(chartConfig));
  const resultUrl = chartUrl.toString().length <= 2000 ? chartUrl.toString() : null;
  chartImageCache.set(cacheKey, { expires: Date.now() + 60_000, url: resultUrl });
  return resultUrl;
}

async function attachMarketChart(
  snapshot: LineMarketSnapshot,
  range: LineMarketChartRange,
): Promise<LineMarketSnapshot> {
  if (snapshot.status !== 'ok' || !snapshot.symbol) return snapshot;
  const chartImageUrl = await yahooChartImageUrl(snapshot.symbol, snapshot.label, range);
  return { ...snapshot, chartImageUrl, chartRange: range };
}

async function frankfurter(target: FxTarget): Promise<LineMarketSnapshot> {
  const key = 'frankfurter:' + target.base + ':' + target.quote;
  const found = cached(key); if (found) return found;
  const from = new Date(Date.now() - 12 * 86_400_000).toISOString().slice(0, 10);
  const url = new URL('https://api.frankfurter.dev/v2/rates');
  url.searchParams.set('base', target.base); url.searchParams.set('quotes', target.quote); url.searchParams.set('from', from);
  try {
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(7_000) });
    if (!response.ok) throw new Error('Frankfurter HTTP ' + response.status);
    const payload: unknown = await response.json();
    const rows = Array.isArray(payload) ? payload.map(asRecord).filter((x): x is R => Boolean(x))
      .filter(x => typeof x.date === 'string' && asNumber(x[target.quote]) !== null)
      .sort((a, b) => String(a.date).localeCompare(String(b.date))) : [];
    const latest = rows[rows.length - 1]; const previous = rows[rows.length - 2];
    const price = latest ? asNumber(latest[target.quote]) : null;
    if (price === null || price <= 0) throw new Error('No reference rate');
    const prev = previous ? asNumber(previous[target.quote]) : null;
    const change = prev !== null ? price - prev : null;
    return save(key, {
      assetType: 'forex', status: 'reference', label: target.label, symbol: target.base + '/' + target.quote,
      price, currency: target.quote, previousClose: prev, change,
      changePercent: change !== null && prev !== null && prev > 0 ? change / prev * 100 : null,
      dayHigh: null, dayLow: null,
      marketTime: latest && typeof latest.date === 'string' ? latest.date + 'T00:00:00.000Z' : null,
      marketState: null, source: 'Frankfurter（公的機関等の参照レート）',
      note: '日次の参考レートです。リアルタイムの市場価格ではありません。',
    });
  } catch {
    return unavailable('forex', target.label, target.base + '/' + target.quote, '為替データを取得できませんでした。時間をおいてもう一度お試しください。');
  }
}

async function fxSnapshot(target: FxTarget): Promise<LineMarketSnapshot> {
  const quote = await yahooChart(target.yahoo, 'forex', target.label);
  if (quote) return { ...quote, label: target.label, symbol: target.base + '/' + target.quote };
  return frankfurter(target);
}

function stockSearchText(question: string): string {
  return question.normalize('NFKC')
    .replace(/今日|きょう|現在|いま|今|最新|直近|の株価|株価|株式|銘柄|株|値動き|動き|チャート|グラフ|株価推移|過去|期間|1週間|1週|5日|1か月|1ヶ月|1年|1日|1week|1day|1year|1w|5d|1mo|1y|1d|教えて|見せて|知りたい|いくら|どうなってる|を|の|は|が|って|お願い|ください|ですか|です|[？?。！!、,]/gi, '')
    .replace(/[\s　]/g, '').trim();
}

async function searchStock(question: string): Promise<EquityTarget | null> {
  for (const item of KNOWN) if (item.re.test(question)) return item.value;
  const code = question.normalize('NFKC').match(/(?:^|\D)(\d{4})(?:\D|$)/);
  if (code) return { symbol: code[1] + '.T', label: '日本株 ' + code[1], assetType: 'stock' };
  const ticker = question.match(/\b([A-Z]{1,5}(?:\.[A-Z]{1,2})?)\b/);
  if (ticker) return { symbol: ticker[1].toUpperCase(), label: ticker[1].toUpperCase(), assetType: 'stock' };
  const query = stockSearchText(question);
  if (!query || /^(日本|国内|米国|アメリカ|日本株|米国株|アメリカ株)$/i.test(query)) return null;
  const region = /米国|アメリカ|海外/i.test(question) ? 'US' : 'JP';
  const url = new URL('https://query2.finance.yahoo.com/v1/finance/search');
  url.searchParams.set('q', query); url.searchParams.set('quotesCount', '12'); url.searchParams.set('newsCount', '0');
  url.searchParams.set('listsCount', '0'); url.searchParams.set('enableFuzzyQuery', 'false');
  url.searchParams.set('region', region); url.searchParams.set('lang', region === 'JP' ? 'ja-JP' : 'en-US');
  const payload = await yahooJson(url.toString());
  const quotes = Array.isArray(payload?.quotes) ? payload?.quotes.map(asRecord).filter((x): x is R => Boolean(x)) : [];
  const equities = quotes.filter(x => asString(x.quoteType) === 'EQUITY');
  if (!equities.length) return null;
  equities.sort((a, b) => {
    const aj = asString(a.symbol).endsWith('.T') ? 1 : 0;
    const bj = asString(b.symbol).endsWith('.T') ? 1 : 0;
    return region === 'JP' ? bj - aj : aj - bj;
  });
  const selected = equities[0];
  const symbol = asString(selected.symbol);
  return symbol ? { symbol, label: asString(selected.shortname) || asString(selected.longname) || query, assetType: 'stock' } : null;
}

function indexTargets(question: string): EquityTarget[] {
  const matches = INDICES.filter(x => x.re.test(question)).map(x => x.value);
  if (matches.length) return matches.slice(0, 3);
  if (/米国株|アメリカ株|米国|アメリカ/i.test(question)) return [
    { symbol: '^GSPC', label: 'S&P 500', assetType: 'index' },
    { symbol: '^IXIC', label: 'NASDAQ総合指数', assetType: 'index' },
    { symbol: '^DJI', label: 'NYダウ', assetType: 'index' },
  ];
  return [
    { symbol: '^N225', label: '日経平均株価', assetType: 'index' },
    { symbol: '^TOPX', label: 'TOPIX', assetType: 'index' },
  ];
}

export async function getLineMarketSnapshots(question: string): Promise<LineMarketSnapshot[]> {
  const q = question.normalize('NFKC');
  const chartRange = getLineMarketChartRange(q);
  if (/為替|通貨|forex|\bfx\b|ドル|ユーロ|ポンド|円安|円高|豪ドル|スイスフラン|カナダドル|NZドル|USD\s*\/?\s*JPY|EUR\s*\/?\s*(?:JPY|USD)|GBP\s*\/?\s*(?:JPY|USD)|AUD\s*\/?\s*JPY/i.test(q)) {
    const snapshots = await Promise.all(fxTargets(q).map(fxSnapshot));
    return Promise.all(snapshots.map(snapshot => attachMarketChart(snapshot, chartRange)));
  }
  const specificIndex = INDICES.some(x => x.re.test(q));
  const stockQuery = stockSearchText(q);
  if (specificIndex || /日本株|米国株|アメリカ株|国内株|株式市場/i.test(q) || !stockQuery) {
    const snapshots = await Promise.all(indexTargets(q).map(async target =>
      await yahooChart(target.symbol, target.assetType, target.label)
      || unavailable(target.assetType, target.label, target.symbol, '指数データを取得できませんでした。時間をおいてもう一度お試しください。')
    ));
    return Promise.all(snapshots.map(snapshot => attachMarketChart(snapshot, chartRange)));
  }
  const target = await searchStock(q);
  if (!target) return [unavailable('stock', '銘柄を特定できませんでした', '', '会社名・銘柄コード・指数名を指定してください。例：トヨタ、7203、日経平均、Apple。')];
  const snapshot = await yahooChart(target.symbol, target.assetType, target.label)
    || unavailable(target.assetType, target.label, target.symbol, 'この銘柄の価格データを取得できませんでした。銘柄名やコードを確認してください。');
  return [await attachMarketChart(snapshot, chartRange)];
}