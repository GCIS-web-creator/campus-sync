export type WeatherScalar = number | string | null;
export type WeatherValueMap = Record<string, WeatherScalar>;

export type WeatherHour = {
  time: string;
  temperatureC: number | null;
  precipitationProbability: number | null;
  precipitationMm: number;
  rainMm: number;
  windKmh: number | null;
  humidity: number | null;
  values: WeatherValueMap;
};

export type WeatherDayForecast = {
  date: string;
  weatherCode: number;
  description: string;
  iconName: string;
  highC: number | null;
  lowC: number | null;
  apparentHighC: number | null;
  apparentLowC: number | null;
  humidityAvg: number | null;
  precipitationProbabilityMax: number | null;
  rainTotalMm: number;
  precipitationTotalMm: number;
  precipitationHours: number | null;
  windMaxKmh: number | null;
  uvIndexMax: number | null;
  sunrise: string | null;
  sunset: string | null;
  values: WeatherValueMap;
  rainHours: WeatherHour[];
  hours: WeatherHour[];
};

export type WeatherAirQualityHour = { time: string; values: WeatherValueMap };
export type WeatherAirQuality = {
  currentTime: string | null;
  current: WeatherValueMap;
  currentUnits: Record<string, string>;
  hours: WeatherAirQualityHour[];
  hourlyUnits: Record<string, string>;
};

export type WeatherBundle = {
  location: string;
  updatedAt: string;
  attribution: string;
  metadata: {
    latitude: number | null;
    longitude: number | null;
    elevation: number | null;
    timezone: string;
    timezoneAbbreviation: string;
    utcOffsetSeconds: number | null;
    generationTimeMs: number | null;
    modelPolicy: string;
  };
  currentTime: string | null;
  current: WeatherValueMap;
  currentUnits: Record<string, string>;
  dailyUnits: Record<string, string>;
  hourlyUnits: Record<string, string>;
  days: WeatherDayForecast[];
  airQuality: WeatherAirQuality | null;
};

type OpenMeteoPayload = {
  latitude?: number;
  longitude?: number;
  elevation?: number;
  generationtime_ms?: number;
  utc_offset_seconds?: number;
  timezone?: string;
  timezone_abbreviation?: string;
  current?: Record<string, unknown>;
  current_units?: Record<string, string>;
  daily?: Record<string, unknown>;
  daily_units?: Record<string, string>;
  hourly?: Record<string, unknown>;
  hourly_units?: Record<string, string>;
};

const LATITUDE = '35.723600280184456';
const LONGITUDE = '139.4507710152599';
const TIMEZONE = 'Asia/Tokyo';

const CURRENT_FIELDS = [
  'temperature_2m','relative_humidity_2m','apparent_temperature','is_day',
  'precipitation','rain','showers','snowfall','weather_code','cloud_cover',
  'pressure_msl','surface_pressure','wind_speed_10m','wind_direction_10m','wind_gusts_10m',
];

const DIGEST_HOURLY_FIELDS = [
  'temperature_2m','relative_humidity_2m','precipitation_probability','precipitation',
  'rain','showers','wind_speed_10m','is_day','weather_code',
];

const DAILY_FIELDS = [
  'weather_code','temperature_2m_max','temperature_2m_min','apparent_temperature_max','apparent_temperature_min',
  'sunrise','sunset','daylight_duration','sunshine_duration','uv_index_max','uv_index_clear_sky_max',
  'rain_sum','showers_sum','snowfall_sum','precipitation_sum','precipitation_hours',
  'precipitation_probability_max','wind_speed_10m_max','wind_gusts_10m_max',
  'wind_direction_10m_dominant','shortwave_radiation_sum','et0_fao_evapotranspiration',
];

const HOURLY_FIELDS = [
  'temperature_2m','relative_humidity_2m','dew_point_2m','apparent_temperature',
  'precipitation_probability','precipitation','rain','showers','snowfall','snow_depth','weather_code',
  'pressure_msl','surface_pressure','cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high',
  'visibility','evapotranspiration','et0_fao_evapotranspiration','vapour_pressure_deficit','runoff',
  'precipitation_type','rain_probability','snowfall_probability','freezing_rain_probability','ice_pellets_probability','thunderstorm_probability',
  'wind_speed_10m','wind_speed_20m','wind_speed_50m','wind_speed_80m','wind_speed_100m','wind_speed_120m','wind_speed_180m','wind_speed_200m',
  'wind_direction_10m','wind_direction_20m','wind_direction_50m','wind_direction_80m','wind_direction_100m','wind_direction_120m','wind_direction_180m','wind_direction_200m',
  'wind_gusts_10m','temperature_20m','temperature_40m','temperature_80m','temperature_120m','temperature_180m','temperature_200m',
  'soil_temperature_0cm','soil_temperature_6cm','soil_temperature_18cm','soil_temperature_54cm',
  'soil_moisture_0_to_1cm','soil_moisture_1_to_3cm','soil_moisture_3_to_9cm','soil_moisture_9_to_27cm','soil_moisture_27_to_81cm',
  'uv_index','uv_index_clear_sky','is_day','sunshine_duration','wet_bulb_temperature_2m',
  'total_column_integrated_water_vapour','cape','lifted_index','convective_inhibition','freezing_level_height','boundary_layer_height',
  'surface_temperature','snowfall_height','convective_cloud_base','convective_cloud_top','updraft',
  'lightning_potential','lightning_density','snow_height','roughness_length','albedo','k_index',
  'shortwave_radiation','direct_radiation','diffuse_radiation','direct_normal_irradiance','global_tilted_irradiance','terrestrial_radiation',
  'shortwave_radiation_instant','direct_radiation_instant','diffuse_radiation_instant','direct_normal_irradiance_instant','terrestrial_radiation_instant',
  'temperature_850hPa','temperature_700hPa','temperature_500hPa','temperature_300hPa',
  'dew_point_850hPa','dew_point_700hPa','dew_point_500hPa','dew_point_300hPa',
  'relative_humidity_850hPa','relative_humidity_700hPa','relative_humidity_500hPa','relative_humidity_300hPa',
  'cloud_cover_850hPa','cloud_cover_700hPa','cloud_cover_500hPa','cloud_cover_300hPa',
  'wind_speed_850hPa','wind_speed_700hPa','wind_speed_500hPa','wind_speed_300hPa',
  'wind_direction_850hPa','wind_direction_700hPa','wind_direction_500hPa','wind_direction_300hPa',
  'vertical_velocity_850hPa','vertical_velocity_700hPa','vertical_velocity_500hPa','vertical_velocity_300hPa',
  'geopotential_height_850hPa','geopotential_height_700hPa','geopotential_height_500hPa','geopotential_height_300hPa',
];

const AIR_CURRENT_FIELDS = [
  'european_aqi','us_aqi','pm10','pm2_5','carbon_monoxide','nitrogen_dioxide','sulphur_dioxide','ozone',
  'aerosol_optical_depth','dust','uv_index','uv_index_clear_sky','ammonia',
  'alder_pollen','birch_pollen','grass_pollen','mugwort_pollen','olive_pollen','ragweed_pollen',
];

const AIR_HOURLY_FIELDS = [
  'pm10','pm2_5','carbon_monoxide','carbon_dioxide','nitrogen_dioxide','sulphur_dioxide','ozone',
  'aerosol_optical_depth','dust','uv_index','uv_index_clear_sky','ammonia','methane',
  'alder_pollen','birch_pollen','grass_pollen','mugwort_pollen','olive_pollen','ragweed_pollen',
  'formaldehyde','glyoxal','non_methane_volatile_organic_compounds','pm10_wildfires','peroxyacyl_nitrates',
  'secondary_inorganic_aerosol','residential_elementary_carbon','total_elementary_carbon','pm2_5_total_organic_matter',
  'sea_salt_aerosol','nitrogen_monoxide','european_aqi','european_aqi_pm2_5','european_aqi_pm10',
  'european_aqi_nitrogen_dioxide','european_aqi_ozone','european_aqi_sulphur_dioxide',
  'us_aqi','us_aqi_pm2_5','us_aqi_pm10','us_aqi_nitrogen_dioxide','us_aqi_carbon_monoxide',
  'us_aqi_ozone','us_aqi_sulphur_dioxide','is_day',
];

const LABELS: Record<number, string> = {
  0:'快晴',1:'晴れ',2:'晴れ時々くもり',3:'くもり',45:'霧',48:'着氷性の霧',
  51:'霧雨',53:'霧雨',55:'霧雨',56:'着氷性の霧雨',57:'着氷性の霧雨',
  61:'雨',63:'雨',65:'雨',66:'着氷性の雨',67:'着氷性の雨',
  71:'弱い雪',73:'雪',75:'大雪',77:'細かな雪',80:'にわか雨',81:'にわか雨',
  82:'にわか雨',85:'にわか雪',86:'強いにわか雪',95:'雷雨',96:'ひょうを伴う雷雨',
  97:'強い雷雨',99:'強いひょうを伴う雷雨',
};

export function jmaRainIntensityLabel(rainMm: number | null | undefined): string | null {
  if (typeof rainMm !== 'number' || !Number.isFinite(rainMm) || rainMm <= 0) return null;
  if (rainMm < 3) return '弱い雨';
  if (rainMm < 10) return '雨';
  if (rainMm < 20) return 'やや強い雨';
  if (rainMm < 30) return '強い雨';
  if (rainMm < 50) return '激しい雨';
  if (rainMm < 80) return '非常に激しい雨';
  return '猛烈な雨';
}

export function weatherIconName(code: number, isDay = true): string {
  if (code === 0) return isDay ? 'sunny' : 'night_clear';
  if (code === 1 || code === 2) return isDay ? 'partly_cloudy' : 'night_cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return code >= 56 ? 'sleet' : 'rain_light';
  if (code >= 61 && code <= 67) return code === 61 ? 'rain_light' : 'rain_heavy';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 80 && code <= 82) return code === 80 ? 'shower' : 'rain_heavy';
  if (code >= 95) return code === 96 || code === 99 ? 'hail' : 'thunderstorm';
  return 'partly_cloudy';
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function scalarValue(value: unknown): WeatherScalar {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return value;
  return null;
}
function valuesFromRecord(record: Record<string, unknown> | undefined, keys: string[]): WeatherValueMap {
  const result: WeatherValueMap = {};
  for (const key of keys) result[key] = scalarValue(record?.[key]);
  return result;
}
function arrayValue(record: Record<string, unknown>, key: string, index: number): WeatherScalar {
  const values = record[key];
  return Array.isArray(values) ? scalarValue(values[index]) : null;
}
function numericArrayValue(record: Record<string, unknown>, key: string, index: number): number | null {
  return numberValue(arrayValue(record, key, index));
}
function safeTimeArray(record: Record<string, unknown>): string[] {
  return Array.isArray(record.time) ? record.time.map(value => String(value)) : [];
}

async function fetchForecastPayload(forecastDays: number, hourlyFields: string[] = HOURLY_FIELDS): Promise<OpenMeteoPayload> {
  const safeDays = Math.max(1, Math.min(16, Math.floor(forecastDays) || 16));
  const params = new URLSearchParams({
    latitude: LATITUDE,
    longitude: LONGITUDE,
    timezone: TIMEZONE,
    forecast_days: String(safeDays),
    current: CURRENT_FIELDS.join(','),
    daily: DAILY_FIELDS.join(','),
    hourly: hourlyFields.join(','),
  });
  const response = await fetch('https://api.open-meteo.com/v1/forecast?' + params.toString(), {
    next: { revalidate: 1800 },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Open-Meteo Forecast HTTP ' + response.status);
  return await response.json() as OpenMeteoPayload;
}

function createWeatherDays(payload: OpenMeteoPayload, hourlyFields: string[] = HOURLY_FIELDS): WeatherDayForecast[] {
  const daily = payload.daily || {};
  const hourly = payload.hourly || {};
  const dates = safeTimeArray(daily);
  const hourTimes = safeTimeArray(hourly);
  if (!dates.length || !hourTimes.length) throw new Error('Weather response was empty');

  const hourlyIndexesByDate = new Map<string, number[]>();
  hourTimes.forEach((time, index) => {
    const date = time.slice(0, 10);
    const list = hourlyIndexesByDate.get(date) || [];
    list.push(index);
    hourlyIndexesByDate.set(date, list);
  });

  return dates.map((date, index) => {
    const hours: WeatherHour[] = (hourlyIndexesByDate.get(date) || []).map(hourIndex => {
      const values = valuesFromRecord(
        Object.fromEntries(hourlyFields.map(key => [key, arrayValue(hourly, key, hourIndex)])),
        hourlyFields,
      );
      const rain = Math.max(0, (numericArrayValue(hourly, 'rain', hourIndex) ?? 0) + (numericArrayValue(hourly, 'showers', hourIndex) ?? 0));
      return {
        time: hourTimes[hourIndex].slice(11, 16),
        temperatureC: numericArrayValue(hourly, 'temperature_2m', hourIndex),
        precipitationProbability: numericArrayValue(hourly, 'precipitation_probability', hourIndex),
        precipitationMm: Math.max(0, numericArrayValue(hourly, 'precipitation', hourIndex) ?? 0),
        rainMm: rain,
        windKmh: numericArrayValue(hourly, 'wind_speed_10m', hourIndex),
        humidity: numericArrayValue(hourly, 'relative_humidity_2m', hourIndex),
        values,
      };
    });

    const values = valuesFromRecord(
      Object.fromEntries(DAILY_FIELDS.map(key => [key, arrayValue(daily, key, index)])),
      DAILY_FIELDS,
    );
    const code = numberValue(values.weather_code) ?? 3;
    const humidityValues = hours.map(hour => hour.humidity).filter((value): value is number => value !== null);
    const humidityAvg = humidityValues.length
      ? Math.round(humidityValues.reduce((sum, value) => sum + value, 0) / humidityValues.length)
      : null;
    const rain = (numberValue(values.rain_sum) ?? 0) + (numberValue(values.showers_sum) ?? 0);

    return {
      date,
      weatherCode: code,
      description: LABELS[code] || '天気情報',
      iconName: weatherIconName(code, hours.some(hour => numberValue(hour.values.is_day) === 1)),
      highC: numberValue(values.temperature_2m_max),
      lowC: numberValue(values.temperature_2m_min),
      apparentHighC: numberValue(values.apparent_temperature_max),
      apparentLowC: numberValue(values.apparent_temperature_min),
      humidityAvg,
      precipitationProbabilityMax: numberValue(values.precipitation_probability_max),
      rainTotalMm: Math.max(0, rain),
      precipitationTotalMm: Math.max(0, numberValue(values.precipitation_sum) ?? rain),
      precipitationHours: numberValue(values.precipitation_hours),
      windMaxKmh: numberValue(values.wind_speed_10m_max),
      uvIndexMax: numberValue(values.uv_index_max),
      sunrise: typeof values.sunrise === 'string' ? values.sunrise : null,
      sunset: typeof values.sunset === 'string' ? values.sunset : null,
      values,
      rainHours: hours.filter(hour => hour.rainMm >= 0.1),
      hours,
    };
  });
}

async function fetchAirQuality(): Promise<WeatherAirQuality | null> {
  const params = new URLSearchParams({
    latitude: LATITUDE,
    longitude: LONGITUDE,
    timezone: TIMEZONE,
    forecast_days: '7',
    current: AIR_CURRENT_FIELDS.join(','),
    hourly: AIR_HOURLY_FIELDS.join(','),
  });
  const response = await fetch('https://air-quality-api.open-meteo.com/v1/air-quality?' + params.toString(), {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('Open-Meteo Air Quality HTTP ' + response.status);
  const payload = await response.json() as OpenMeteoPayload;
  const current = payload.current || {};
  const hourly = payload.hourly || {};
  const times = safeTimeArray(hourly);
  const hours = times.map((time, index) => ({
    time,
    values: valuesFromRecord(
      Object.fromEntries(AIR_HOURLY_FIELDS.map(key => [key, arrayValue(hourly, key, index)])),
      AIR_HOURLY_FIELDS,
    ),
  }));
  return {
    currentTime: typeof current.time === 'string' ? current.time : null,
    current: valuesFromRecord(current, AIR_CURRENT_FIELDS),
    currentUnits: payload.current_units || {},
    hours,
    hourlyUnits: payload.hourly_units || {},
  };
}

export async function fetchSchoolWeatherForecast(forecastDays = 3): Promise<WeatherDayForecast[]> {
  const payload = await fetchForecastPayload(forecastDays, DIGEST_HOURLY_FIELDS);
  return createWeatherDays(payload, DIGEST_HOURLY_FIELDS);
}

export async function fetchSchoolWeatherBundle(forecastDays = 16): Promise<WeatherBundle> {
  const [forecastResult, airResult] = await Promise.all([
    fetchForecastPayload(forecastDays),
    fetchAirQuality().catch(error => {
      console.error('Open-Meteo Air Quality failed:', error instanceof Error ? error.message : 'unknown');
      return null;
    }),
  ]);
  const currentRaw = forecastResult.current || {};
  const current = valuesFromRecord(currentRaw, CURRENT_FIELDS);
  return {
    location: '東京都小平市たかの台周辺',
    updatedAt: new Date().toISOString(),
    attribution: 'Weather data by Open-Meteo',
    metadata: {
      latitude: numberValue(forecastResult.latitude),
      longitude: numberValue(forecastResult.longitude),
      elevation: numberValue(forecastResult.elevation),
      timezone: forecastResult.timezone || TIMEZONE,
      timezoneAbbreviation: forecastResult.timezone_abbreviation || 'JST',
      utcOffsetSeconds: numberValue(forecastResult.utc_offset_seconds),
      generationTimeMs: numberValue(forecastResult.generationtime_ms),
      modelPolicy: 'Best Match（地点・時間・項目ごとに利用可能な予報モデルを選択）',
    },
    currentTime: typeof currentRaw.time === 'string' ? currentRaw.time : null,
    current,
    currentUnits: forecastResult.current_units || {},
    dailyUnits: forecastResult.daily_units || {},
    hourlyUnits: forecastResult.hourly_units || {},
    days: createWeatherDays(forecastResult),
    airQuality: airResult,
  };
}
