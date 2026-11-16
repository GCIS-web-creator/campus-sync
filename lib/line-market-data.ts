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
};

type R = Record<string, unknown>;
type FxTarget = { base: string; quote: string; yahoo: string; label: string };
type EquityTarget = { symbol: string; label: string; assetType: 'stock' | 'index' };
const cache = new Map<string, { expires: number; value: LineMarketSnapshot }>();

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
  return /為替|通貨|forex|\bfx\b|ドル|ユーロ|ポンド|円安|円高|豪ドル|スイスフラン|カナダドル|NZドル|USD\s*\/?\s*JPY|EUR\s*\/?\s*(?:JPY|USD)|GBP\s*\/?\s*(?:JPY|USD)|AUD\s*\/?\s*JPY|株価|株式|銘柄|日経平均|日経225|TOPIX|NASDAQ|ナスダック|S\s*&\s*P|SP500|ダウ平均|NYダウ|日本株|米国株|アメリカ株/i.test(question.normalize('NFKC'));
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
  { re: /日経平均|日経225|日経\s*225/i, value: { symbol: '^N225', label: '日経平均株価', assetType: 'index' } },
  { re: /TOPIX|東証株価指数/i, value: { symbol: '^TOPX', label: 'TOPIX', assetType: 'index' } },
  { re: /S\s*&\s*P\s*500|SP500|S&P/i, value: { symbol: '^GSPC', label: 'S&P 500', assetType: 'index' } },
  { re: /NASDAQ|ナスダック/i, value: { symbol: '^IXIC', label: 'NASDAQ総合指数', assetType: 'index' } },
  { re: /NYダウ|ダウ平均|ダウ工業株/i, value: { symbol: '^DJI', label: 'NYダウ', assetType: 'index' } },
];
const KNOWN: Array<{ re: RegExp; value: EquityTarget }> = [
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
    .replace(/今日|きょう|現在|いま|今|最新|直近|の株価|株価|株式|銘柄|株|値動き|動き|教えて|見せて|知りたい|いくら|どうなってる|を|の|は|が|って|お願い|ください|ですか|です|[？?。！!、,]/gi, '')
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
  if (/為替|通貨|forex|\bfx\b|ドル|ユーロ|ポンド|円安|円高|豪ドル|スイスフラン|カナダドル|NZドル|USD\s*\/?\s*JPY|EUR\s*\/?\s*(?:JPY|USD)|GBP\s*\/?\s*(?:JPY|USD)|AUD\s*\/?\s*JPY/i.test(q)) {
    return Promise.all(fxTargets(q).map(fxSnapshot));
  }
  const specificIndex = INDICES.some(x => x.re.test(q));
  if (specificIndex || /日本株|米国株|アメリカ株|国内株|株価|株式市場/i.test(q)) {
    return Promise.all(indexTargets(q).map(async target =>
      await yahooChart(target.symbol, target.assetType, target.label)
      || unavailable(target.assetType, target.label, target.symbol, '指数データを取得できませんでした。時間をおいてもう一度お試しください。')
    ));
  }
  const target = await searchStock(q);
  if (!target) return [unavailable('stock', '銘柄を特定できませんでした', '', '会社名・銘柄コード・指数名を指定してください。例：トヨタ、7203、日経平均、Apple。')];
  return [await yahooChart(target.symbol, target.assetType, target.label)
    || unavailable(target.assetType, target.label, target.symbol, 'この銘柄の価格データを取得できませんでした。銘柄名やコードを確認してください。')];
}
