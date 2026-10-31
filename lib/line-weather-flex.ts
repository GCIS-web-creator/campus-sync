import type { WeatherDayForecast } from '@/lib/weather';

export function buildWeatherForecastBubble(weather: WeatherDayForecast[]) {
  const baseOrigin = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://campus-sync-mocha.vercel.app');
  const origin = baseOrigin.endsWith('/') ? baseOrigin.slice(0, -1) : baseOrigin;
  const days = weather.slice(0, 3);
  const weatherEmoji = (code: number): string => {
    if (code === 0) return '☀️';
    if (code === 1 || code === 2) return '🌤️';
    if (code === 3) return '☁️';
    if (code === 45 || code === 48) return '🌫️';
    if (code >= 51 && code <= 67) return '🌧️';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '❄️';
    if (code >= 80 && code <= 82) return '🌦️';
    if (code >= 95) return '⛈️';
    return '🌤️';
  };
  const dayCards: Record<string, unknown>[] = days.map((day, index) => ({
    type: 'box', layout: 'vertical', flex: 1, spacing: 'xs', paddingAll: '8px', cornerRadius: '10px',
    backgroundColor: index === 0 ? '#EFF6FF' : '#F8FAFC',
    contents: [
      { type: 'text', text: ['明日', '明後日', '明々後日'][index] + ' ' + day.date.slice(5).replace('-', '/'), size: 'xs', weight: 'bold', color: '#334155', align: 'center', wrap: true },
      { type: 'text', text: weatherEmoji(day.weatherCode), size: '3xl', align: 'center' },
      { type: 'text', text: day.description, size: 'xs', weight: 'bold', color: '#0F172A', align: 'center', wrap: true },
      { type: 'box', layout: 'horizontal', spacing: 'xs', alignItems: 'center', contents: [
        { type: 'text', text: '↑', size: 'sm', weight: 'bold', color: '#DC2626' },
        { type: 'text', text: day.highC === null ? '—' : Math.round(day.highC) + '°', size: 'sm', weight: 'bold', color: '#DC2626', flex: 1 },
      ] },
      { type: 'box', layout: 'horizontal', spacing: 'xs', alignItems: 'center', contents: [
        { type: 'text', text: '↓', size: 'sm', weight: 'bold', color: '#0284C7' },
        { type: 'text', text: day.lowC === null ? '—' : Math.round(day.lowC) + '°', size: 'sm', weight: 'bold', color: '#0284C7', flex: 1 },
      ] },
      { type: 'separator', color: '#CBD5E1' },
      { type: 'box', layout: 'horizontal', spacing: 'xs', alignItems: 'center', contents: [
        { type: 'text', text: '☔', size: 'xs' },
        { type: 'text', text: day.precipitationProbabilityMax === null ? '—' : Math.round(day.precipitationProbabilityMax) + '%', size: 'xs', color: '#334155', weight: 'bold', flex: 1 },
      ] },
      { type: 'box', layout: 'horizontal', spacing: 'xs', alignItems: 'center', contents: [
        { type: 'text', text: '💧', size: 'xs' },
        { type: 'text', text: day.humidityAvg === null ? '—' : day.humidityAvg + '%', size: 'xs', color: '#334155', weight: 'bold', flex: 1 },
      ] },
    ],
  }));
  const body: Record<string, unknown>[] = days.length ? [
    { type: 'text', text: '天気・最高/最低気温・降水確率・湿度', size: 'xs', color: '#64748B', wrap: true },
    { type: 'box', layout: 'horizontal', spacing: 'sm', contents: dayCards },
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
