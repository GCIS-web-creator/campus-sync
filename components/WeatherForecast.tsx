'use client';

import { useEffect, useMemo, useState } from 'react';
import type { WeatherBundle, WeatherDayForecast, WeatherHour, WeatherScalar, WeatherValueMap } from '@/lib/weather';

type IconInfo = [string, string, string];

const WEATHER_ICONS: IconInfo[] = [
  ['sunny', '晴れ', '天気'], ['cloudy', 'くもり', '天気'], ['rain', '雨', '天気'],
  ['thunderstorm', '雷雨', '天気'], ['snow', '雪', '天気'], ['hail', 'ひょう', '天気'],
  ['wind', '風', '風'], ['temperature', '気温', '気温'], ['humidity', '湿度', '湿度'],
  ['umbrella', '降水・傘', '降水'], ['arrow', '風向き', '風'], ['partly_cloudy', '晴れ時々くもり', '天気'],
  ['night_clear', '夜・晴れ', '天気'], ['night_cloudy', '夜・くもり', '天気'], ['fog', '霧', '天気'],
  ['haze', 'かすみ', '大気'], ['sleet', 'みぞれ', '天気'], ['rain_light', '弱い雨', '降水'],
  ['rain_heavy', '強い雨', '降水'], ['shower', 'にわか雨', '降水'], ['lightning', '雷・雷活動', '雷'],
  ['typhoon', '台風', '気象現象'], ['tornado', '竜巻', '気象現象'], ['kosa', '黄砂', '大気'],
  ['pm25', 'PM2.5', '大気'], ['sandstorm', '浮遊ダスト', '大気'], ['precip_probability', '降水確率', '降水'],
  ['pressure', '気圧', '大気'], ['uv', '紫外線', '太陽'], ['visibility', '視程', '大気'],
  ['feels_like', '体感温度', '気温'], ['sunrise', '日の出', '太陽'], ['sunset', '日の入り', '太陽'],
  ['moon_new', '新月', '月齢アイコン'], ['moon_waxing_crescent', '三日月', '月齢アイコン'],
  ['moon_first_quarter', '上弦の月', '月齢アイコン'], ['moon_waxing_gibbous', '満ちていく月', '月齢アイコン'],
  ['moon_full', '満月', '月齢アイコン'], ['moon_waning_gibbous', '欠けていく月', '月齢アイコン'],
  ['moon_last_quarter', '下弦の月', '月齢アイコン'], ['moon_waning_crescent', '有明月', '月齢アイコン'],
  ['advisory', '注意報アイコン', '警戒アイコン'], ['warning', '警報アイコン', '警戒アイコン'],
  ['special_warning', '特別警報アイコン', '警戒アイコン'], ['pollen', '花粉', '大気'],
  ['heatstroke_alert', '暑さへの注意', '健康'], ['temp_high', '高温', '気温'], ['temp_low', '低温', '気温'],
];

const DAILY_METRICS: Array<{ key: string; label: string; icon: string; suffix?: string; kind?: 'time' | 'duration' | 'direction' }> = [
  { key: 'temperature_2m_max', label: '最高気温', icon: 'temp_high' },
  { key: 'temperature_2m_min', label: '最低気温', icon: 'temp_low' },
  { key: 'apparent_temperature_max', label: '最高体感温度', icon: 'feels_like' },
  { key: 'apparent_temperature_min', label: '最低体感温度', icon: 'feels_like' },
  { key: 'precipitation_sum', label: '総降水量', icon: 'umbrella' },
  { key: 'rain_sum', label: '雨量', icon: 'rain' },
  { key: 'showers_sum', label: 'にわか雨量', icon: 'shower' },
  { key: 'snowfall_sum', label: '降雪量', icon: 'snow' },
  { key: 'precipitation_probability_max', label: '最大降水確率', icon: 'precip_probability' },
  { key: 'precipitation_hours', label: '降水時間', icon: 'rain_light' },
  { key: 'wind_speed_10m_max', label: '最大風速', icon: 'wind' },
  { key: 'wind_gusts_10m_max', label: '最大瞬間風速', icon: 'wind' },
  { key: 'wind_direction_10m_dominant', label: '卓越風向', icon: 'arrow', kind: 'direction' },
  { key: 'uv_index_max', label: '最大UV指数', icon: 'uv' },
  { key: 'uv_index_clear_sky_max', label: '快晴時UV指数', icon: 'uv' },
  { key: 'sunrise', label: '日の出', icon: 'sunrise', kind: 'time' },
  { key: 'sunset', label: '日の入り', icon: 'sunset', kind: 'time' },
  { key: 'daylight_duration', label: '日照可能時間', icon: 'sunny', kind: 'duration' },
  { key: 'sunshine_duration', label: '日照時間', icon: 'sunny', kind: 'duration' },
  { key: 'shortwave_radiation_sum', label: '日射エネルギー', icon: 'uv' },
  { key: 'et0_fao_evapotranspiration', label: '基準蒸発散量', icon: 'humidity' },
];

const DETAIL_GROUPS: Array<{ title: string; icon: string; fields: Array<{ key: string; label: string; unit?: string; mode?: 'max' | 'min' }> }> = [
  { title: '雲・気圧・視界', icon: 'cloudy', fields: [
    { key: 'cloud_cover', label: '雲量（全体）', unit: '%' },
    { key: 'cloud_cover_low', label: '下層雲量', unit: '%' },
    { key: 'cloud_cover_mid', label: '中層雲量', unit: '%' },
    { key: 'cloud_cover_high', label: '上層雲量', unit: '%' },
    { key: 'pressure_msl', label: '海面更正気圧', unit: 'hPa' },
    { key: 'surface_pressure', label: '地上気圧', unit: 'hPa' },
    { key: 'visibility', label: '視程', unit: 'm', mode: 'min' },
    { key: 'vapour_pressure_deficit', label: '飽差', unit: 'kPa' },
  ] },
  { title: '風・上空の風', icon: 'wind', fields: [
    { key: 'wind_speed_10m', label: '地上10m風速', unit: 'km/h' },
    { key: 'wind_speed_20m', label: '20m風速', unit: 'km/h' },
    { key: 'wind_speed_50m', label: '50m風速', unit: 'km/h' },
    { key: 'wind_speed_80m', label: '80m風速', unit: 'km/h' },
    { key: 'wind_speed_120m', label: '120m風速', unit: 'km/h' },
    { key: 'wind_speed_180m', label: '180m風速', unit: 'km/h' },
    { key: 'wind_gusts_10m', label: '最大瞬間風速', unit: 'km/h', mode: 'max' },
    { key: 'wind_direction_10m', label: '地上10m風向', unit: '°' },
  ] },
  { title: '大気の不安定度・雷', icon: 'lightning', fields: [
    { key: 'wet_bulb_temperature_2m', label: '湿球温度', unit: '°C' },
    { key: 'cape', label: 'CAPE（対流有効位置エネルギー）', unit: 'J/kg', mode: 'max' },
    { key: 'lifted_index', label: 'リフティッド指数', unit: '°C', mode: 'min' },
    { key: 'convective_inhibition', label: '対流抑制', unit: 'J/kg' },
    { key: 'freezing_level_height', label: '0℃高度', unit: 'm' },
    { key: 'boundary_layer_height', label: '境界層高度', unit: 'm' },
    { key: 'thunderstorm_probability', label: '雷雨確率', unit: '%', mode: 'max' },
    { key: 'lightning_potential', label: '雷活動ポテンシャル', mode: 'max' },
    { key: 'lightning_density', label: '雷密度', mode: 'max' },
    { key: 'convective_cloud_base', label: '対流雲の底', unit: 'm' },
    { key: 'convective_cloud_top', label: '対流雲の頂', unit: 'm' },
    { key: 'updraft', label: '上昇気流', unit: 'm/s', mode: 'max' },
  ] },
  { title: '地表・土壌', icon: 'humidity', fields: [
    { key: 'surface_temperature', label: '地表面温度', unit: '°C' },
    { key: 'soil_temperature_0cm', label: '地表土壌温度', unit: '°C' },
    { key: 'soil_temperature_6cm', label: '深さ6cmの土壌温度', unit: '°C' },
    { key: 'soil_temperature_18cm', label: '深さ18cmの土壌温度', unit: '°C' },
    { key: 'soil_temperature_54cm', label: '深さ54cmの土壌温度', unit: '°C' },
    { key: 'soil_moisture_0_to_1cm', label: '表層土壌水分', unit: 'm³/m³' },
    { key: 'soil_moisture_1_to_3cm', label: '土壌水分 1–3cm', unit: 'm³/m³' },
    { key: 'soil_moisture_3_to_9cm', label: '土壌水分 3–9cm', unit: 'm³/m³' },
    { key: 'soil_moisture_9_to_27cm', label: '土壌水分 9–27cm', unit: 'm³/m³' },
    { key: 'soil_moisture_27_to_81cm', label: '土壌水分 27–81cm', unit: 'm³/m³' },
    { key: 'runoff', label: '表面流出量', unit: 'mm' },
    { key: 'snow_depth', label: '積雪の深さ', unit: 'm' },
  ] },
  { title: '太陽・放射', icon: 'uv', fields: [
    { key: 'uv_index', label: 'UV指数', mode: 'max' },
    { key: 'uv_index_clear_sky', label: '快晴時UV指数', mode: 'max' },
    { key: 'shortwave_radiation', label: '短波放射', unit: 'W/m²', mode: 'max' },
    { key: 'direct_radiation', label: '直達日射', unit: 'W/m²', mode: 'max' },
    { key: 'diffuse_radiation', label: '散乱日射', unit: 'W/m²', mode: 'max' },
    { key: 'direct_normal_irradiance', label: '直達日射量', unit: 'W/m²', mode: 'max' },
    { key: 'global_tilted_irradiance', label: '傾斜面日射量', unit: 'W/m²', mode: 'max' },
    { key: 'terrestrial_radiation', label: '地球放射', unit: 'W/m²', mode: 'max' },
    { key: 'total_column_integrated_water_vapour', label: '大気中の積算水蒸気量', unit: 'kg/m²' },
    { key: 'evapotranspiration', label: '蒸発散量', unit: 'mm' },
    { key: 'et0_fao_evapotranspiration', label: '基準蒸発散量', unit: 'mm' },
  ] },
  { title: '上空の気圧面データ', icon: 'wind', fields: [
    { key: 'temperature_850hPa', label: '850hPa気温', unit: '°C' },
    { key: 'temperature_700hPa', label: '700hPa気温', unit: '°C' },
    { key: 'temperature_500hPa', label: '500hPa気温', unit: '°C' },
    { key: 'temperature_300hPa', label: '300hPa気温', unit: '°C' },
    { key: 'wind_speed_850hPa', label: '850hPa風速', unit: 'km/h' },
    { key: 'wind_speed_700hPa', label: '700hPa風速', unit: 'km/h' },
    { key: 'wind_speed_500hPa', label: '500hPa風速', unit: 'km/h' },
    { key: 'wind_speed_300hPa', label: '300hPa風速', unit: 'km/h' },
    { key: 'relative_humidity_850hPa', label: '850hPa湿度', unit: '%' },
    { key: 'relative_humidity_700hPa', label: '700hPa湿度', unit: '%' },
    { key: 'geopotential_height_500hPa', label: '500hPa高度', unit: 'm' },
    { key: 'vertical_velocity_700hPa', label: '700hPa鉛直速度', unit: 'Pa/s' },
  ] },
];

const AIR_METRICS = [
  ['us_aqi', '米国大気質指数', ''],
  ['european_aqi', '欧州大気質指数', ''],
  ['pm2_5', 'PM2.5', 'μg/m³'],
  ['pm10', 'PM10', 'μg/m³'],
  ['ozone', 'オゾン', 'μg/m³'],
  ['nitrogen_dioxide', '二酸化窒素', 'μg/m³'],
  ['sulphur_dioxide', '二酸化硫黄', 'μg/m³'],
  ['carbon_monoxide', '一酸化炭素', 'μg/m³'],
  ['carbon_dioxide', '二酸化炭素', 'μg/m³'],
  ['ammonia', 'アンモニア', 'μg/m³'],
  ['dust', '浮遊ダスト', 'μg/m³'],
  ['aerosol_optical_depth', 'エアロゾル光学的厚さ', ''],
  ['methane', 'メタン', 'μg/m³'],
  ['formaldehyde', 'ホルムアルデヒド', 'μg/m³'],
  ['glyoxal', 'グリオキサール', 'μg/m³'],
  ['non_methane_volatile_organic_compounds', '非メタン揮発性有機化合物', 'μg/m³'],
  ['pm10_wildfires', '火災由来PM10', 'μg/m³'],
  ['peroxyacyl_nitrates', '過酸化アシル硝酸', 'μg/m³'],
  ['secondary_inorganic_aerosol', '二次無機エアロゾル', 'μg/m³'],
  ['residential_elementary_carbon', '住宅由来元素状炭素', 'μg/m³'],
  ['total_elementary_carbon', '元素状炭素合計', 'μg/m³'],
  ['pm2_5_total_organic_matter', 'PM2.5有機物', 'μg/m³'],
  ['sea_salt_aerosol', '海塩エアロゾル', 'μg/m³'],
  ['nitrogen_monoxide', '一酸化窒素', 'μg/m³'],
] as const;

const getNumber = (values: WeatherValueMap | undefined, key: string): number | null => {
  const value = values?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const getIcon = (name: string, className = 'h-8 w-8') =>
  <img src={'/api/weather/icons/' + name} alt="" aria-hidden="true" className={className + ' object-contain'} loading="lazy" />;

function fmt(value: WeatherScalar | undefined, unit = ''): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
    return String(rounded) + (unit ? ' ' + unit : '');
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(11, 16);
  return value + (unit ? ' ' + unit : '');
}

function fmtDuration(value: WeatherScalar | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const minutes = Math.round(value / 60);
  return Math.floor(minutes / 60) + '時間' + String(minutes % 60).padStart(2, '0') + '分';
}

function fmtDate(value: string, long = false): string {
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric', day: 'numeric', weekday: 'short',
    ...(long ? { year: 'numeric' as const } : {}),
    timeZone: 'Asia/Tokyo',
  }).format(new Date(value + 'T00:00:00+09:00'));
}

function weatherText(code: number): string {
  const labels: Record<number, string> = {
    0:'快晴',1:'晴れ',2:'晴れ時々くもり',3:'くもり',45:'霧',48:'着氷性の霧',
    51:'弱い霧雨',53:'霧雨',55:'強い霧雨',56:'弱い凍雨',57:'強い凍雨',
    61:'弱い雨',63:'雨',65:'強い雨',66:'弱い凍雨',67:'強い凍雨',
    71:'弱い雪',73:'雪',75:'大雪',77:'細かな雪',80:'にわか雨',81:'強いにわか雨',
    82:'激しいにわか雨',85:'にわか雪',86:'強いにわか雪',95:'雷雨',96:'ひょうを伴う雷雨',99:'強いひょうを伴う雷雨',
  };
  return labels[code] || '天気情報';
}

function weatherIcon(code: number, isDay = true): string {
  if (code === 0) return isDay ? 'sunny' : 'night_clear';
  if (code === 1 || code === 2) return isDay ? 'partly_cloudy' : 'night_cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return code >= 56 ? 'sleet' : 'rain_light';
  if (code >= 61 && code <= 67) return code === 61 ? 'rain_light' : 'rain_heavy';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 80 && code <= 82) return code === 80 ? 'shower' : 'rain_heavy';
  if (code >= 95) return code >= 96 ? 'hail' : 'thunderstorm';
  return 'partly_cloudy';
}

function hourlyAggregate(day: WeatherDayForecast, key: string, mode: 'avg' | 'max' | 'min' = 'avg'): number | null {
  const values = day.hours.map(hour => getNumber(hour.values, key)).filter((value): value is number => value !== null);
  if (!values.length) return null;
  if (mode === 'max') return Math.max(...values);
  if (mode === 'min') return Math.min(...values);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function MetricCard({ icon, label, value, unit = '' }: { icon: string; label: string; value: WeatherScalar | undefined; unit?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        {getIcon(icon, 'h-6 w-6')}
        <p className="min-w-0 text-[11px] font-bold text-slate-500 dark:text-slate-400">{label}</p>
      </div>
      <p className="mt-2 break-words text-lg font-black tabular-nums text-slate-900 dark:text-white">{fmt(value, unit)}</p>
    </div>
  );
}

export default function WeatherForecast() {
  const [data, setData] = useState<WeatherBundle | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');
  const [showAllIcons, setShowAllIcons] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/weather/forecast', { cache: 'no-store' });
        const result = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(result?.days)) throw new Error(result?.message || '天気情報を取得できませんでした。');
        if (!cancelled) {
          setData(result as WeatherBundle);
          setSelectedDate((result.days[0] as WeatherDayForecast | undefined)?.date || '');
          setError('');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '天気情報を取得できませんでした。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const selectedDay = data?.days.find(day => day.date === selectedDate) || data?.days[0] || null;
  const current = data?.current || {};
  const currentCode = getNumber(current, 'weather_code') ?? selectedDay?.weatherCode ?? 3;
  const currentIsDay = getNumber(current, 'is_day') !== 0;
  const currentIcon = weatherIcon(currentCode, currentIsDay);

  const selectedAirHours = useMemo(() => {
    if (!data?.airQuality || !selectedDay) return [];
    return data.airQuality.hours.filter(hour => hour.time.startsWith(selectedDay.date));
  }, [data?.airQuality, selectedDay]);

  const dailyTempRange = useMemo(() => {
    const values = (data?.days || []).flatMap(day => [day.lowC, day.highC]).filter((v): v is number => v !== null);
    return values.length ? { min: Math.min(...values), max: Math.max(...values) } : { min: 0, max: 1 };
  }, [data?.days]);

  return (
    <section className="campus-page-transition overflow-hidden rounded-3xl border border-slate-200/70 bg-white/95 shadow-xl shadow-slate-900/5 dark:border-slate-700/70 dark:bg-slate-950/95">
      <div className="border-b border-slate-200/70 px-4 py-4 dark:border-slate-700/70 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black tracking-[0.2em] text-cyan-600 dark:text-cyan-300">CAMPUS WEATHER INTELLIGENCE</p>
            <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">CampusSync 高機能天気予報</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{data?.location || '東京都小平市たかの台周辺'} ・ 16日間予報</p>
          </div>
          <div className="text-right">
            {data?.updatedAt && <p className="text-[10px] text-slate-400">取得 {new Date(data.updatedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</p>}
            <p className="mt-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-300">気象・大気データを統合</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          {[0,1,2,3,4,5].map(i => <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
      ) : error || !data ? (
        <p role="status" className="p-5 text-sm text-rose-600 dark:text-rose-300">{error || '天気情報を取得できませんでした。'}</p>
      ) : (
        <div className="space-y-6 p-4 sm:p-6">
          <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-900 p-4 text-white shadow-lg sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black tracking-[0.18em] text-cyan-200">CURRENT CONDITIONS</p>
                <p className="mt-1 text-sm font-bold text-blue-100">{data.currentTime ? fmt(data.currentTime) : '現在の天気'}</p>
                <div className="mt-3 flex items-center gap-3">
                  {getIcon(currentIcon, 'h-20 w-20 sm:h-24 sm:w-24')}
                  <div>
                    <p className="text-4xl font-black tabular-nums sm:text-5xl">{fmt(current.temperature_2m, '°C')}</p>
                    <p className="mt-1 text-sm font-bold text-blue-100">{weatherText(currentCode)}</p>
                    <p className="mt-1 text-xs text-blue-100">体感 {fmt(current.apparent_temperature, '°C')} ・ 湿度 {fmt(current.relative_humidity_2m, '%')}</p>
                  </div>
                </div>
              </div>
              <div className="grid min-w-[150px] flex-1 grid-cols-2 gap-2 sm:max-w-md">
                <div className="rounded-2xl bg-white/10 p-3">
                  {getIcon('wind', 'h-6 w-6')}
                  <p className="mt-1 text-[10px] text-blue-100">風速 / 瞬間風速</p>
                  <p className="mt-1 text-sm font-black">{fmt(current.wind_speed_10m, 'km/h')}</p>
                  <p className="text-xs text-blue-100">{fmt(current.wind_gusts_10m, 'km/h')}</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3">
                  {getIcon('pressure', 'h-6 w-6')}
                  <p className="mt-1 text-[10px] text-blue-100">海面気圧</p>
                  <p className="mt-1 text-sm font-black">{fmt(current.pressure_msl, 'hPa')}</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3">
                  {getIcon('umbrella', 'h-6 w-6')}
                  <p className="mt-1 text-[10px] text-blue-100">降水量</p>
                  <p className="mt-1 text-sm font-black">{fmt(current.precipitation, 'mm')}</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3">
                  {getIcon('cloudy', 'h-6 w-6')}
                  <p className="mt-1 text-[10px] text-blue-100">雲量</p>
                  <p className="mt-1 text-sm font-black">{fmt(current.cloud_cover, '%')}</p>
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-xl bg-white/10 p-2.5"><span className="text-blue-100">地上気圧</span><strong className="mt-1 block">{fmt(current.surface_pressure, 'hPa')}</strong></div>
              <div className="rounded-xl bg-white/10 p-2.5"><span className="text-blue-100">風向</span><strong className="mt-1 block">{fmt(current.wind_direction_10m, '°')}</strong></div>
              <div className="rounded-xl bg-white/10 p-2.5"><span className="text-blue-100">雨量</span><strong className="mt-1 block">{fmt(current.rain, 'mm')}</strong></div>
              <div className="rounded-xl bg-white/10 p-2.5"><span className="text-blue-100">にわか雨</span><strong className="mt-1 block">{fmt(current.showers, 'mm')}</strong></div>
            </div>
            <p className="mt-3 text-[10px] text-blue-100">標高 {fmt(data.metadata.elevation, 'm')} ・ 予報モデル：Best Match</p>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[10px] font-black tracking-[0.16em] text-cyan-600 dark:text-cyan-300">16-DAY OUTLOOK</p>
                <h3 className="mt-1 text-base font-black text-slate-900 dark:text-white">16日間の予報</h3>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">日付を選択すると、時間別・詳細データが切り替わります。</p>
              </div>
              <p className="text-[10px] text-slate-400">最高 / 最低 ・ 降水確率</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {data.days.map((day, index) => {
                const selected = selectedDay?.date === day.date;
                const span = Math.max(1, dailyTempRange.max - dailyTempRange.min);
                const left = day.lowC === null ? 0 : ((day.lowC - dailyTempRange.min) / span) * 100;
                const width = day.lowC === null || day.highC === null ? 0 : Math.max(5, ((day.highC - day.lowC) / span) * 100);
                return (
                  <button key={day.date} type="button" onClick={() => setSelectedDate(day.date)}
                    aria-pressed={selected}
                    className={'min-w-0 rounded-2xl border p-3 text-left transition-all ' + (selected
                      ? 'border-cyan-500 bg-cyan-50 shadow-md shadow-cyan-900/10 ring-2 ring-cyan-500/20 dark:border-cyan-400 dark:bg-cyan-950/50'
                      : 'border-slate-200 bg-slate-50/80 hover:border-cyan-300 dark:border-slate-700 dark:bg-slate-900/70')}>
                    <p className="text-[11px] font-black text-slate-700 dark:text-slate-200">{index === 0 ? '今日' : fmtDate(day.date)}</p>
                    <div className="mt-2 flex items-center justify-center">{getIcon(day.iconName, 'h-10 w-10')}</div>
                    <p className="mt-1 truncate text-center text-[11px] font-bold text-slate-600 dark:text-slate-300">{day.description}</p>
                    <div className="mt-2 flex items-center justify-center gap-2 text-xs font-black tabular-nums">
                      <span className="text-rose-600 dark:text-rose-300">{fmt(day.highC, '°')}</span>
                      <span className="text-sky-600 dark:text-sky-300">{fmt(day.lowC, '°')}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-rose-400" style={{ width: width + '%', marginLeft: left + '%' }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                      <span>{getIcon('precip_probability', 'inline-block h-3 w-3 align-middle')} {fmt(day.precipitationProbabilityMax, '%')}</span>
                      <span>{fmt(day.precipitationTotalMm, 'mm')}</span>
                    </div>
                    <p className="mt-1 text-center text-[10px] font-bold text-slate-400">{selected ? '選択中' : '詳細を見る'}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {selectedDay && (
            <>
              <section className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black tracking-[0.16em] text-cyan-600 dark:text-cyan-300">SELECTED DAY</p>
                    <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">{fmtDate(selectedDay.date, true)}の詳細予報</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    {getIcon(selectedDay.iconName, 'h-12 w-12')}
                    <div><p className="text-sm font-black text-slate-800 dark:text-slate-100">{selectedDay.description}</p><p className="text-xs text-slate-500">最高 {fmt(selectedDay.highC, '°C')} / 最低 {fmt(selectedDay.lowC, '°C')}</p></div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {DAILY_METRICS.map(item => {
                    const value = selectedDay.values[item.key];
                    if (value === null || value === undefined) return null;
                    let display = fmt(value, data.dailyUnits[item.key] || '');
                    if (item.kind === 'time') display = fmt(value);
                    if (item.kind === 'duration') display = fmtDuration(value);
                    return <MetricCard key={item.key} icon={item.icon} label={item.label} value={display} />;
                  })}
                </div>
              </section>

              <section>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-black tracking-[0.16em] text-cyan-600 dark:text-cyan-300">HOURLY FORECAST</p>
                    <h3 className="mt-1 text-base font-black text-slate-900 dark:text-white">時間別予報（最大24時間）</h3>
                  </div>
                  <p className="text-[10px] text-slate-400">気温・降水・風・湿度</p>
                </div>
                {selectedDay.hours.length ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
                    {selectedDay.hours.map(hour => (
                      <HourlyCard key={hour.time} hour={hour} />
                    ))}
                  </div>
                ) : <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-900">この日の時間別データはありません。</p>}
              </section>

              <section>
                <div className="mb-3">
                  <p className="text-[10px] font-black tracking-[0.16em] text-cyan-600 dark:text-cyan-300">METEOROLOGICAL DETAIL</p>
                  <h3 className="mt-1 text-base font-black text-slate-900 dark:text-white">専門気象データ</h3>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">利用可能な項目だけを表示します。取得モデルや予報時間帯によって未提供の値があります。</p>
                </div>
                <div className="space-y-3">
                  {DETAIL_GROUPS.map(group => {
                    const rows = group.fields.map(field => {
                      const mode = field.mode || 'avg';
                      const value = hourlyAggregate(selectedDay, field.key, mode);
                      return { ...field, value };
                    }).filter(item => item.value !== null);
                    if (!rows.length) return null;
                    return (
                      <details key={group.title} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                          {getIcon(group.icon, 'h-7 w-7')}
                          <span className="flex-1 text-sm font-black text-slate-800 dark:text-slate-100">{group.title}</span>
                          <span className="text-[10px] text-slate-400">{rows.length}項目</span>
                          <span className="text-slate-400">⌄</span>
                        </summary>
                        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3 dark:border-slate-800 sm:grid-cols-3 lg:grid-cols-4">
                          {rows.map(row => (
                            <MetricCard key={row.key} icon={group.icon} label={row.label + (row.mode === 'max' ? '・最大' : row.mode === 'min' ? '・最小' : '・平均')}
                              value={row.value} unit={row.unit || data.hourlyUnits[row.key] || ''} />
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/70 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black tracking-[0.16em] text-cyan-600 dark:text-cyan-300">AIR QUALITY · CAMS</p>
                <h3 className="mt-1 text-base font-black text-slate-900 dark:text-white">大気質・微粒子・ガス濃度</h3>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">大気質予報は最大7日間。選択日の時間別値がある場合に表示します。</p>
              </div>
              {data.airQuality?.currentTime && <span className="text-[10px] text-slate-400">更新 {fmt(data.airQuality.currentTime)}</span>}
            </div>
            {data.airQuality ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {AIR_METRICS.map(([key, label, unit]) => {
                    const value = data.airQuality?.current[key];
                    if (value === null || value === undefined) return null;
                    const icon = key === 'pm2_5' ? 'pm25' : key === 'dust' ? 'sandstorm' : key.includes('aqi') ? 'haze' : key === 'uv_index' ? 'uv' : key.includes('pollen') ? 'pollen' : 'haze';
                    return <MetricCard key={key} icon={icon} label={label} value={value} unit={unit} />;
                  })}
                </div>
                {selectedAirHours.length ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                    <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">{fmtDate(selectedDay?.date || '')}の大気質・時間推移</h4>
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
                      {selectedAirHours.filter((_, index) => index % 3 === 0).map(hour => (
                        <div key={hour.time} className="rounded-xl bg-slate-50 p-2 dark:bg-slate-900">
                          <p className="text-[10px] font-bold text-slate-500">{hour.time.slice(11,16)}</p>
                          <p className="mt-1 text-xs font-black text-slate-800 dark:text-white">PM2.5 {fmt(hour.values.pm2_5)}</p>
                          <p className="mt-1 text-[10px] text-slate-500">AQI {fmt(hour.values.us_aqi)}</p>
                          <p className="text-[10px] text-slate-500">PM10 {fmt(hour.values.pm10)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : <p className="mt-4 text-xs text-slate-500">選択日は大気質APIの予報期間外、または対象データがありません。</p>}
                <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                  <div className="flex items-center gap-2 font-black">{getIcon('pollen', 'h-5 w-5')} 花粉データについて</div>
                  Open-Meteoの花粉予報項目は欧州の花粉シーズンのみ提供されます。日本のCampusSync地点では値が出ないため、花粉量を推測して表示しません。
                </div>
              </>
            ) : <p className="mt-4 rounded-xl bg-white p-4 text-xs text-slate-500 dark:bg-slate-950">大気質APIは現在取得できません。気象予報は引き続き表示しています。</p>}
          </section>

          <section className="rounded-3xl border border-slate-200 p-4 dark:border-slate-700 sm:p-5">
            <button type="button" onClick={() => setShowAllIcons(value => !value)} className="flex w-full items-center justify-between gap-3 text-left">
              <div>
                <p className="text-[10px] font-black tracking-[0.16em] text-cyan-600 dark:text-cyan-300">WEATHER ICON SYSTEM</p>
                <h3 className="mt-1 text-base font-black text-slate-900 dark:text-white">CampusSync 気象アイコンライブラリ（48種類）</h3>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">ZIP内の48種類のSVGを表示・用途別に整理</p>
              </div>
              <span className="text-xl text-slate-400">{showAllIcons ? '−' : '+'}</span>
            </button>
            {showAllIcons && (
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                {WEATHER_ICONS.map(([name, label, group]) => (
                  <div key={name} className="flex min-w-0 flex-col items-center rounded-xl bg-slate-50 p-2 text-center dark:bg-slate-800">
                    {getIcon(name, 'h-10 w-10')}
                    <span className="mt-1 text-[10px] font-bold text-slate-700 dark:text-slate-200">{label}</span>
                    <span className="text-[9px] text-slate-400">{group}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[10px] leading-5 text-slate-400">
              注意報・警報・特別警報、台風経路、竜巻警報などの公式発表は、このOpen-Meteo予報APIだけでは取得できません。対応する公式情報源を接続するまでは、警報アイコンを実際の発令表示として点灯させません。
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[10px] leading-5 text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            <p className="font-black text-slate-700 dark:text-slate-200">データ提供・予報の見方</p>
            <p className="mt-1">気象：Open-Meteo Forecast API（Best Match）／大気質：Open-Meteo Air Quality API（CAMS）。取得できない項目は「—」または非表示にしています。16日先ほど予測の幅が大きくなるため、先の日付は傾向として確認してください。</p>
            <p className="mt-1">地点：{data.metadata.latitude ?? '—'}, {data.metadata.longitude ?? '—'} ・ {data.metadata.timezone} ・ {data.metadata.modelPolicy}</p>
            <p className="mt-1">予報データ：Open-Meteo ・ 最新取得 {new Date(data.updatedAt).toLocaleString('ja-JP')}</p>
          </section>
        </div>
      )}
    </section>
  );
}

function HourlyCard({ hour }: { hour: WeatherHour }) {
  const code = getNumber(hour.values, 'weather_code') ?? 3;
  const isDay = getNumber(hour.values, 'is_day') !== 0;
  const icon = weatherIcon(code, isDay);
  const temp = hour.temperatureC;
  const chance = hour.precipitationProbability;
  const wind = hour.windKmh;
  const maxTemp = 40;
  const minTemp = -10;
  const barHeight = temp === null ? 0 : Math.max(4, Math.min(100, ((temp - minTemp) / (maxTemp - minTemp)) * 100));
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-center text-[11px] font-black text-slate-600 dark:text-slate-300">{hour.time}</p>
      <div className="mt-1 flex justify-center">{getIcon(icon, 'h-8 w-8')}</div>
      <p className="mt-1 text-center text-sm font-black tabular-nums text-slate-900 dark:text-white">{fmt(temp, '°')}</p>
      <div className="mt-2 flex h-12 items-end justify-center rounded-lg bg-slate-50 px-1 dark:bg-slate-800">
        <div className="w-3 rounded-t-full bg-gradient-to-t from-sky-500 to-rose-400" style={{ height: barHeight + '%' }} />
      </div>
      <p className="mt-2 text-center text-[10px] text-sky-700 dark:text-sky-300">{fmt(chance, '%')}</p>
      <div className="mt-1 flex justify-between gap-1 text-[9px] text-slate-500">
        <span>☂ {fmt(hour.precipitationMm, 'mm')}</span>
        <span>風 {fmt(wind, 'km/h')}</span>
      </div>
      <p className="mt-1 text-center text-[9px] text-slate-400">湿度 {fmt(hour.humidity, '%')}</p>
    </div>
  );
}
