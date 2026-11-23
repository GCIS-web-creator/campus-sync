import { Buffer } from 'node:buffer';
import {
  ecfToLookAngles,
  eciToEcf,
  degreesToRadians,
  gstime,
  jday,
  propagate,
  shadowFraction,
  sunPos,
  twoline2satrec,
} from 'npm:satellite.js@7.2.0';

export type DigestNewsItem = {
  icon: string;
  title: string;
  body: string;
  url?: string | null;
};

type ForecastHour = {
  time?: string;
  rainMm?: number;
  precipitationMm?: number;
  precipitationProbability?: number;
  values?: Record<string, unknown>;
};

type ForecastDay = {
  date?: string;
  highC?: number | null;
  lowC?: number | null;
  hours?: ForecastHour[];
  sunset?: string;
  values?: Record<string, unknown>;
};

type SchoolEvent = {
  title: string;
  summary?: string | null;
  event_date: string;
};

type AdminDigestNews = {
  icon?: string | null;
  title: string;
  body?: string | null;
  url?: string | null;
  category?: string | null;
};

function tokyoDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return String(map.year) + '-' + String(map.month) + '-' + String(map.day);
}

function tokyoTime(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTomorrow(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  const weekday = new Intl.DateTimeFormat('ja-JP', { timeZone: 'UTC', weekday: 'short' }).format(value);
  return month + '月' + day + '日（' + weekday + '）';
}

function getWeatherNews(forecast: ForecastDay | null | undefined): DigestNewsItem[] {
  if (!forecast) return [];
  const items: DigestNewsItem[] = [];
  const daily = forecast.values || {};
  const hourly = Array.isArray(forecast.hours) ? forecast.hours : [];
  const morning = hourly.filter(hour => {
    const time = String(hour.time || '');
    return time >= '06:00' && time <= '08:00';
  });
  const morningMaxProbability = morning.reduce((max, hour) => {
    const value = numberValue(hour.precipitationProbability ?? hour.values?.precipitation_probability);
    return Math.max(max, value ?? 0);
  }, 0);
  const morningRainMm = morning.reduce((sum, hour) => {
    const value = numberValue(hour.precipitationMm ?? hour.rainMm ?? hour.values?.precipitation);
    return sum + (value ?? 0);
  }, 0);
  if (morningMaxProbability >= 30 || morningRainMm >= 0.2) {
    items.push({
      icon: '🌧️',
      title: '明朝、小平周辺で雨の可能性',
      body: '6:00〜8:30ごろの降水確率は最大' + Math.round(morningMaxProbability) + '%です。登校時は雨具を確認してください。',
    });
  }

  const snowfall = numberValue(daily.snowfall_sum ?? (forecast as Record<string, unknown>).snowfallSum) ?? 0;
  const weatherCode = numberValue(daily.weather_code ?? (forecast as Record<string, unknown>).weatherCode);
  const snowCode = weatherCode !== null && [71, 73, 75, 77, 85, 86].includes(weatherCode);
  const dailyPrecipitationProbability = numberValue(
    (forecast as Record<string, unknown>).precipitationProbabilityMax ??
    daily.precipitation_probability_max,
  ) ?? 0;
  if (snowfall >= 0.5 && (snowCode || dailyPrecipitationProbability >= 50)) {
    items.push({
      icon: '❄️',
      title: '明日、小平市で雪の可能性が高め',
      body: '予報に降雪量約' + snowfall.toFixed(1) + 'cmが含まれています。最新の予報も確認してください。',
    });
  }

  const high = numberValue(forecast.highC ?? daily.temperature_2m_max);
  if (high !== null) {
    if (high >= 40) {
      items.push({ icon: '🔥', title: '明日は酷暑日になる可能性', body: '予想最高気温は約' + Math.round(high) + '℃です。暑さへの対策を優先してください。' });
    } else if (high >= 35) {
      items.push({ icon: '🥵', title: '明日は猛暑日になる可能性', body: '予想最高気温は約' + Math.round(high) + '℃です。' });
    } else if (high >= 30) {
      items.push({ icon: '☀️', title: '明日は真夏日になる可能性', body: '予想最高気温は約' + Math.round(high) + '℃です。' });
    } else if (high <= 10) {
      items.push({ icon: '🧣', title: '明日の最高気温は10℃以下の予報', body: '予想最高気温は約' + Math.round(high) + '℃です。暖かい服装で過ごしてください。' });
    }
  }
  return items;
}

async function getNikkeiClose(todayDateKey: string, weekday: string): Promise<DigestNewsItem | null> {
  if (!['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday)) return null;
  try {
    const response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EN225?range=5d&interval=1d', {
      headers: { 'User-Agent': 'CampusSync-Daily-News/1.0', Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as any;
    const result = payload?.chart?.result?.[0];
    const timestamps = result?.timestamp;
    const closes = result?.indicators?.quote?.[0]?.close;
    if (!Array.isArray(timestamps) || !Array.isArray(closes)) return null;
    for (let index = timestamps.length - 1; index >= 0; index -= 1) {
      const close = numberValue(closes[index]);
      if (close === null || close <= 0) continue;
      const dateKey = tokyoDateKey(new Date(Number(timestamps[index]) * 1000));
      if (dateKey !== todayDateKey) continue;
      return {
        icon: '📈',
        title: '日経平均株価・本日の終値',
        body: close.toLocaleString('ja-JP', { maximumFractionDigits: 2 }) + '円',
      };
    }
    return null;
  } catch (error) {
    console.warn('日次ニュース：日経平均終値を取得できませんでした。', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

type IssPass = { start: Date; end: Date; maxElevation: number };

function parseTleEpoch(line1: string): Date | null {
  const yearPart = Number(line1.slice(18, 20));
  const dayPart = Number(line1.slice(20, 32));
  if (!Number.isFinite(yearPart) || !Number.isFinite(dayPart)) return null;
  const year = yearPart >= 57 ? 1900 + yearPart : 2000 + yearPart;
  return new Date(Date.UTC(year, 0, 1) + (dayPart - 1) * 86_400_000);
}

async function calculateIssPass(tomorrowDateKey: string, forecast: ForecastDay | null | undefined): Promise<IssPass | null> {
  if (!forecast) return null;
  const sunsetText = String(forecast.sunset || forecast.values?.sunset || '');
  const sunsetTime = sunsetText
    ? new Date(/[zZ]|[+-]\d\d:\d\d$/.test(sunsetText) ? sunsetText : sunsetText + '+09:00')
    : new Date(tomorrowDateKey + 'T16:30:00+09:00');
  if (!Number.isFinite(sunsetTime.getTime())) return null;
  const start = new Date(Math.max(sunsetTime.getTime(), new Date(tomorrowDateKey + 'T17:00:00+09:00').getTime()));
  const end = new Date(tomorrowDateKey + 'T23:59:59+09:00');

  const response = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE', {
    headers: { 'User-Agent': 'CampusSync-ISS-Visibility/1.0', Accept: 'text/plain' },
    cache: 'no-store',
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error('CelesTrak TLE HTTP ' + response.status);
  const lines = (await response.text()).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const line1 = lines.find(line => line.startsWith('1 25544'));
  if (!line1) throw new Error('ISS TLE line 1 missing');
  const line1Index = lines.indexOf(line1);
  const line2 = lines.slice(line1Index + 1).find(line => line.startsWith('2 25544'));
  if (!line2) throw new Error('ISS TLE line 2 missing');
  const epoch = parseTleEpoch(line1);
  if (!epoch || Math.abs(Date.now() - epoch.getTime()) > 4 * 86_400_000) {
    console.warn('日次ニュース：ISS TLEが古いため可視パスを判定しません。');
    return null;
  }

  const satellite = twoline2satrec(line1, line2);
  const observer = {
    longitude: degreesToRadians(139.4508),
    latitude: degreesToRadians(35.7236),
    height: 0.1,
  };
  const candidates: IssPass[] = [];
  let active: IssPass | null = null;
  const sampleMs = 20_000;
  const AU_TO_KM = 149_597_870.7;

  for (let time = start.getTime(); time <= end.getTime(); time += sampleMs) {
    const date = new Date(time);
    const state = propagate(satellite, date);
    if (!state || !state.position) continue;
    const gmst = gstime(date);
    const satelliteEcf = eciToEcf(state.position, gmst);
    const look = ecfToLookAngles(observer, satelliteEcf);
    const solar = sunPos(jday(date));
    const sunEciKm = {
      x: solar.rsun.x * AU_TO_KM,
      y: solar.rsun.y * AU_TO_KM,
      z: solar.rsun.z * AU_TO_KM,
    };
    const sunLook = ecfToLookAngles(observer, eciToEcf(sunEciKm, gmst));
    const shaded = shadowFraction(solar.rsun, state.position);
    const visible = look.elevation >= degreesToRadians(10) &&
      sunLook.elevation <= degreesToRadians(-6) &&
      shaded <= 0.25;

    if (visible) {
      if (!active) active = { start: date, end: date, maxElevation: look.elevation };
      active.end = date;
      active.maxElevation = Math.max(active.maxElevation, look.elevation);
    } else if (active) {
      if (active.end.getTime() - active.start.getTime() >= 40_000) candidates.push(active);
      active = null;
    }
  }
  if (active && active.end.getTime() - active.start.getTime() >= 40_000) candidates.push(active);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.maxElevation - a.maxElevation)[0];
}

function getAstronomicalNews(tomorrowDateKey: string): DigestNewsItem[] {
  const known: Record<string, DigestNewsItem[]> = {
    '2026-11-24': [{
      icon: '🌕',
      title: 'プレアデス星団食（すばる食）',
      body: '18:20ごろから月がすばるの星を隠します。満月前後で空が明るいため、肉眼では難しく、双眼鏡・望遠鏡がおすすめです。',
    }],
    '2026-12-14': [{
      icon: '☄️',
      title: 'ふたご座流星群が極大',
      body: '夜から翌朝にかけてが見ごろ。月明かりや天候で見える数は変わります。',
    }],
    '2026-12-15': [{
      icon: '☄️',
      title: 'ふたご座流星群の見ごろ',
      body: '未明まで観察のチャンスがあります。空の開けた暗い場所から安全に観察してください。',
    }],
    '2026-12-23': [{
      icon: '☄️',
      title: 'こぐま座流星群が極大',
      body: '夜半ごろが見ごろの目安です。出現数は少なめで、天候にも左右されます。',
    }],
    '2026-12-24': [{
      icon: '🌕',
      title: '2026年で最も近い満月',
      body: '月が地球に比較的近い位置で満月を迎えます。日没後は月の大きさや明るさに注目です。',
    }],
  };
  return (known[tomorrowDateKey] || []).map(item => ({ ...item }));
}

export async function buildDailyNewsItems(input: {
  now: Date;
  todayDateKey: string;
  tomorrowDateKey: string;
  weekday: string;
  forecast: ForecastDay | null;
  events: SchoolEvent[];
  adminNews: AdminDigestNews[];
}): Promise<DigestNewsItem[]> {
  const items = getWeatherNews(input.forecast);
  const tomorrowEvents = input.events.filter(event => event.event_date === input.tomorrowDateKey);
  for (const event of tomorrowEvents.slice(0, 3)) {
    items.push({
      icon: '🎓',
      title: '明日の学校イベント：' + event.title.slice(0, 90),
      body: String(event.summary || '学校の予定表を確認してください。').slice(0, 180),
    });
  }

  for (const news of input.adminNews.slice(0, 3)) {
    items.push({
      icon: String(news.icon || '📰').slice(0, 8),
      title: String(news.title || '').slice(0, 100),
      body: String(news.body || '').slice(0, 180),
      url: news.url || null,
    });
  }

  try {
    const pass = await calculateIssPass(input.tomorrowDateKey, input.forecast);
    if (pass) {
      items.push({
        icon: '🛰️',
        title: 'ISS（国際宇宙ステーション）が肉眼で見える可能性',
        body: tokyoTime(pass.start) + '〜' + tokyoTime(pass.end) + 'ごろ。最大仰角約' +
          Math.round(pass.maxElevation * 180 / Math.PI) + '°。雲や軌道予測の更新で見え方は変わります。',
      });
    }
  } catch (error) {
    console.warn('日次ニュース：ISS可視パスの取得に失敗しました。', error instanceof Error ? error.message : 'unknown');
  }

  items.push(...getAstronomicalNews(input.tomorrowDateKey));
  const nikkei = await getNikkeiClose(input.todayDateKey, input.weekday);
  if (nikkei) items.push(nikkei);
  return items.slice(0, 12);
}

export function buildDailyNewsBubble(dateLabel: string, items: DigestNewsItem[]): Record<string, unknown> | null {
  if (!items.length) return null;
  const rows = items.slice(0, 12).map(item => ({
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    alignItems: 'flex-start',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        width: '30px',
        height: '30px',
        justifyContent: 'center',
        alignItems: 'center',
        cornerRadius: '9px',
        backgroundColor: '#E0F2FE',
        contents: [{ type: 'text', text: item.icon || '📰', size: 'md', align: 'center' }],
      },
      {
        type: 'box',
        layout: 'vertical',
        flex: 1,
        spacing: 'xs',
        contents: [
          { type: 'text', text: item.title, size: 'sm', weight: 'bold', color: '#0F172A', wrap: true },
          ...(item.body ? [{ type: 'text', text: item.body, size: 'xs', color: '#475569', wrap: true }] : []),
          ...(item.url && /^https:\/\//.test(item.url)
            ? [{ type: 'text', text: '詳細を確認 ↗', size: 'xxs', weight: 'bold', color: '#0369A1', action: { type: 'uri', label: '詳細を確認', uri: item.url } }]
            : []),
        ],
      },
    ],
  }));

  return {
    type: 'bubble',
    size: 'giga',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#0F172A',
      paddingAll: '16px',
      spacing: 'xs',
      contents: [
        { type: 'text', text: 'CAMPUSSYNC  /  TODAY\'S NEWS', size: 'xxs', color: '#7DD3FC', weight: 'bold' },
        { type: 'text', text: '今日のニュース', size: 'xl', color: '#FFFFFF', weight: 'bold' },
        { type: 'text', text: dateLabel + ' に関するお知らせ・天気・天体情報', size: 'xs', color: '#CBD5E1', wrap: true },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '14px',
      spacing: 'md',
      contents: rows,
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#F8FAFC',
      paddingAll: '10px',
      contents: [{ type: 'text', text: 'CAMPUSSYNC・TODAY\'S NEWS', size: 'xxs', color: '#94A3B8', align: 'center' }],
    },
  };
}

export function compactSingleDigestFlex<T extends { contents: { type?: unknown; contents?: unknown } }>(message: T): { message: T; bytes: number; bubbles: number } {
  const carousel = message.contents;
  if (carousel.type !== 'carousel' || !Array.isArray(carousel.contents)) {
    throw new Error('日次まとめは単一カルーセル形式である必要があります。');
  }
  const bubbles = [...carousel.contents] as Record<string, unknown>[];
  if (bubbles.length > 12) bubbles.length = 12;
  const working = { ...message, contents: { ...carousel, contents: bubbles } } as T;
  const size = () => Buffer.byteLength(JSON.stringify(working), 'utf8');
  while (size() > 45 * 1024 && bubbles.length > 2) bubbles.pop();
  const bytes = size();
  if (bytes > 45 * 1024 || bubbles.length > 12) {
    throw new Error('Flex Messageを安全なサイズ（45KB以下・12カード以下）にまとめられません。分割せず配信を中止します。');
  }
  for (const bubble of bubbles) {
    if (Buffer.byteLength(JSON.stringify(bubble), 'utf8') > 30 * 1024) {
      throw new Error('Flexのカード単体が30KBを超えています。分割せず配信を中止します。');
    }
  }
  return { message: working, bytes, bubbles: bubbles.length };
}
