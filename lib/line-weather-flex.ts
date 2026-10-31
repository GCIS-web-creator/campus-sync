import type { WeatherDayForecast } from '@/lib/weather';

type WeatherShareItem = { key: 'sunny' | 'cloudy' | 'precipitation'; label: string; emoji: string; color: string; count: number; percent: number };

function summarizeWeatherHours(day: WeatherDayForecast): WeatherShareItem[] | null {
  const categories = [
    { key: 'sunny' as const, label: '晴れ', emoji: '☀', color: '#FBBF24', count: 0 },
    { key: 'cloudy' as const, label: 'くもり', emoji: '☁', color: '#94A3B8', count: 0 },
    { key: 'precipitation' as const, label: '雨・雪', emoji: '☂', color: '#38BDF8', count: 0 },
  ];
  for (const hour of day.hours) {
    const rawCode = hour.values.weather_code;
    const code = typeof rawCode === 'number' ? rawCode : typeof rawCode === 'string' ? Number(rawCode) : NaN;
    if (!Number.isFinite(code)) continue;
    if (code === 0 || code === 1) categories[0].count += 1;
    else if (code === 2 || code === 3 || code === 45 || code === 48) categories[1].count += 1;
    else if ((code >= 51 && code <= 67) || (code >= 71 && code <= 77) || (code >= 80 && code <= 86) || (code >= 95 && code <= 99)) categories[2].count += 1;
  }
  const total = categories.reduce((sum, item) => sum + item.count, 0);
  if (!total) return null;
  const exact = categories.map(item => item.count / total * 100);
  const rounded = exact.map(Math.floor);
  let remaining = 100 - rounded.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - rounded[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; i < remaining; i += 1) rounded[order[i].index] += 1;
  return categories.map((item, index) => ({ ...item, percent: rounded[index] }));
}

function buildWeatherShareRow(day: WeatherDayForecast, index: number) {
  const shares = summarizeWeatherHours(day);
  const dayLabels = ['明日', '明後日', '明々後日'];
  const dateLabel = day.date.slice(5).replace('-', '/');
  const barContents = shares
    ? shares.filter(item => item.count > 0).map(item => ({
        type: 'box', layout: 'vertical', flex: item.count, height: '9px',
        backgroundColor: item.color, contents: [{ type: 'filler' }],
      }))
    : [{ type: 'box', layout: 'vertical', height: '9px', backgroundColor: '#E2E8F0', contents: [{ type: 'filler' }] }];
  const shareLabels = shares
    ? shares.map(item => ({
        type: 'box', layout: 'vertical', flex: 1, spacing: '2px',
        contents: [
          { type: 'text', text: item.emoji + ' ' + item.label, size: 'xxs', color: '#64748B', align: 'center', wrap: true },
          { type: 'text', text: item.percent + '%', size: 'xs', color: '#0F172A', weight: 'bold', align: 'center' },
        ],
      }))
    : [{ type: 'text', text: '時間別の天気内訳を取得できませんでした。', size: 'xxs', color: '#64748B', wrap: true }];
  return {
    type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '10px',
    backgroundColor: index === 0 ? '#EFF6FF' : '#F8FAFC', cornerRadius: '10px',
    contents: [
      { type: 'box', layout: 'horizontal', alignItems: 'center', contents: [
        { type: 'text', text: dayLabels[index] + '  ' + dateLabel, size: 'xs', color: '#334155', weight: 'bold', flex: 1 },
        { type: 'text', text: shares ? '1日の予報内訳' : '内訳なし', size: 'xxs', color: '#94A3B8', align: 'end' },
      ] },
      { type: 'box', layout: 'horizontal', cornerRadius: '6px', height: '9px', spacing: 'none', contents: barContents },
      { type: 'box', layout: 'horizontal', spacing: 'xs', contents: shareLabels },
    ],
  };
}

export function buildWeatherForecastBubble(weather: WeatherDayForecast[]) {
  // LINEの画像・詳細ボタンは必ずCampusSyncの本番URLを使う。NEXT_PUBLIC_SITE_URL等の誤設定でVercel管理画面へ飛ばないよう固定。
  const origin = 'https://campus-sync-mocha.vercel.app';
  const icon = (name: string) => origin + '/api/weather/icons/' + name + '?format=png';
  const days = weather.slice(0, 3);
  const dayCards: Record<string, unknown>[] = days.map((day, index) => ({
    type: 'box', layout: 'vertical', flex: 1, spacing: 'xs', paddingAll: '8px', cornerRadius: '10px',
    backgroundColor: index === 0 ? '#EFF6FF' : '#F8FAFC',
    contents: [
      { type: 'text', text: ['明日', '明後日', '明々後日'][index] + ' ' + day.date.slice(5).replace('-', '/'), size: 'xs', weight: 'bold', color: '#334155', align: 'center', wrap: true },
      { type: 'image', url: icon(day.iconName), size: 'lg', aspectRatio: '1:1', aspectMode: 'fit', align: 'center' },
      { type: 'text', text: day.description, size: 'xs', weight: 'bold', color: '#0F172A', align: 'center', wrap: true },
      { type: 'box', layout: 'horizontal', spacing: 'xs', alignItems: 'center', contents: [
        { type: 'image', url: icon('temp_high'), size: 'xs', aspectRatio: '1:1', aspectMode: 'fit' },
        { type: 'text', text: day.highC === null ? '—' : Math.round(day.highC) + '°', size: 'sm', weight: 'bold', color: '#DC2626', flex: 1 },
      ] },
      { type: 'box', layout: 'horizontal', spacing: 'xs', alignItems: 'center', contents: [
        { type: 'image', url: icon('temp_low'), size: 'xs', aspectRatio: '1:1', aspectMode: 'fit' },
        { type: 'text', text: day.lowC === null ? '—' : Math.round(day.lowC) + '°', size: 'sm', weight: 'bold', color: '#0284C7', flex: 1 },
      ] },
      { type: 'separator', color: '#CBD5E1' },
      { type: 'box', layout: 'horizontal', spacing: 'xs', alignItems: 'center', contents: [
        { type: 'image', url: icon('precip_probability'), size: 'xxs', aspectRatio: '1:1', aspectMode: 'fit' },
        { type: 'text', text: day.precipitationProbabilityMax === null ? '—' : Math.round(day.precipitationProbabilityMax) + '%', size: 'xs', color: '#334155', weight: 'bold', flex: 1 },
      ] },
      { type: 'box', layout: 'horizontal', spacing: 'xs', alignItems: 'center', contents: [
        { type: 'image', url: icon('humidity'), size: 'xxs', aspectRatio: '1:1', aspectMode: 'fit' },
        { type: 'text', text: day.humidityAvg === null ? '—' : day.humidityAvg + '%', size: 'xs', color: '#334155', weight: 'bold', flex: 1 },
      ] },
    ],
  }));
  const body: Record<string, unknown>[] = days.length ? [
    { type: 'text', text: '天気・最高/最低気温・降水確率・湿度', size: 'xs', color: '#64748B', wrap: true },
    { type: 'box', layout: 'horizontal', spacing: 'sm', contents: dayCards },
    { type: 'separator', color: '#CBD5E1', margin: 'md' },
    { type: 'text', text: '3日間の天気の内訳', size: 'sm', color: '#0F172A', weight: 'bold' },
    { type: 'text', text: '晴れ・くもり・雨雪の色分け。24時間の予報を集計した時間割合です（降水確率ではありません）。', size: 'xxs', color: '#64748B', wrap: true },
    ...days.map((day, index) => buildWeatherShareRow(day, index)),
  ] : [{ type: 'text', text: '天気情報を取得できませんでした。', size: 'sm', color: '#64748B', wrap: true }];
  return {
    type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', backgroundColor: '#0F3B63', paddingAll: '16px', spacing: 'xs', contents: [
      { type: 'text', text: 'CAMPUSSYNC / WEATHER', size: 'xs', color: '#67E8F9', weight: 'bold' },
      { type: 'text', text: '3日間の天気予報', size: 'lg', color: '#FFFFFF', weight: 'bold' },
      { type: 'text', text: '小平市たかの台周辺', size: 'xs', color: '#CBD5E1', wrap: true },
    ] },
    body: { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'md', contents: body },
    footer: { type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: '#F8FAFC', spacing: 'sm', contents: [
      { type: 'text', text: '時間ごとの詳しい予報はCampusSyncで確認できます。', size: 'xs', color: '#475569', wrap: true, align: 'center' },
      { type: 'button', style: 'primary', color: '#2563A6', height: 'sm', action: { type: 'uri', label: '天気の詳細を見る', uri: origin + '/#weather' } },
    ] },
  };
}
