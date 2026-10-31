export type WeatherHour={time:string;temperatureC:number|null;precipitationProbability:number|null;precipitationMm:number;rainMm:number;windKmh:number|null;humidity:number|null};
export type WeatherDayForecast={
  date:string;weatherCode:number;description:string;iconName:string;highC:number|null;lowC:number|null;humidityAvg:number|null;
  precipitationProbabilityMax:number|null;rainTotalMm:number;precipitationTotalMm:number;precipitationHours:number|null;
  windMaxKmh:number|null;uvIndexMax:number|null;sunrise:string|null;sunset:string|null;rainHours:WeatherHour[];hours:WeatherHour[];
};
type OpenMeteoPayload={daily?:{time?:string[];weather_code?:number[];temperature_2m_max?:number[];temperature_2m_min?:number[];precipitation_probability_max?:number[];precipitation_sum?:number[];rain_sum?:number[];showers_sum?:number[];precipitation_hours?:number[];wind_speed_10m_max?:number[];uv_index_max?:number[];sunrise?:string[];sunset?:string[]};hourly?:{time?:string[];temperature_2m?:number[];precipitation_probability?:number[];precipitation?:number[];rain?:number[];showers?:number[];wind_speed_10m?:number[];relative_humidity_2m?:number[]}};
const LABELS:Record<number,string>={0:'快晴',1:'晴れ',2:'晴れ時々くもり',3:'くもり',45:'霧',48:'着氷性の霧',51:'弱い霧雨',53:'霧雨',55:'強い霧雨',56:'弱い凍雨',57:'強い凍雨',61:'弱い雨',63:'雨',65:'強い雨',66:'弱い凍雨',67:'強い凍雨',71:'弱い雪',73:'雪',75:'大雪',77:'細かな雪',80:'にわか雨',81:'強いにわか雨',82:'激しいにわか雨',85:'にわか雪',86:'強いにわか雪',95:'雷雨',96:'ひょうを伴う雷雨',99:'強いひょうを伴う雷雨'};
export function weatherIconName(code:number):string{
  if(code===0)return 'sunny';if(code===1||code===2)return 'partly_cloudy';if(code===3)return 'cloudy';
  if(code===45||code===48)return 'fog';if(code>=51&&code<=57)return 'rain_light';if(code>=61&&code<=67)return code===61?'rain_light':'rain_heavy';
  if((code>=71&&code<=77)||code===85||code===86)return 'snow';if(code>=80&&code<=82)return code===80?'shower':'rain_heavy';
  if(code>=95)return code>=96?'hail':'thunderstorm';return 'partly_cloudy';
}
function num(values:number[]|undefined,i:number):number|null{const v=values?.[i];return typeof v==='number'&&Number.isFinite(v)?v:null;}
export async function fetchSchoolWeatherForecast(forecastDays=3):Promise<WeatherDayForecast[]>{
  const safeForecastDays=Math.max(1,Math.min(16,Math.floor(forecastDays)||3));
  const params=new URLSearchParams({
    latitude:'35.723600280184456',longitude:'139.4507710152599',timezone:'Asia/Tokyo',forecast_days:String(safeForecastDays),
    daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,rain_sum,showers_sum,precipitation_hours,wind_speed_10m_max,uv_index_max,sunrise,sunset',
    hourly:'temperature_2m,precipitation_probability,precipitation,rain,showers,wind_speed_10m,relative_humidity_2m',
  });
  const response=await fetch('https://api.open-meteo.com/v1/forecast?'+params.toString(),{next:{revalidate:1800},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Open-Meteo HTTP '+response.status);
  const payload=await response.json() as OpenMeteoPayload,daily=payload.daily,hourly=payload.hourly;
  if(!daily?.time?.length||!hourly?.time?.length)throw new Error('Weather response was empty');
  return daily.time.map((date,index)=>{
    const hours:WeatherHour[]=hourly.time!.map((time,j)=>({
      time:time.slice(11,16),temperatureC:num(hourly.temperature_2m,j),precipitationProbability:num(hourly.precipitation_probability,j),
      precipitationMm:Math.max(0,num(hourly.precipitation,j)??0),
      rainMm:Math.max(0,(num(hourly.rain,j)??0)+(num(hourly.showers,j)??0)),
      windKmh:num(hourly.wind_speed_10m,j),humidity:num(hourly.relative_humidity_2m,j),
    })).filter((_,j)=>hourly.time![j].startsWith(date));
    const code=num(daily.weather_code,index)??3,rain=(num(daily.rain_sum,index)??0)+(num(daily.showers_sum,index)??0);
    return {
      date,weatherCode:code,description:LABELS[code]||'天気情報',iconName:weatherIconName(code),
      highC:num(daily.temperature_2m_max,index),lowC:num(daily.temperature_2m_min,index),
      humidityAvg:hours.length?Math.round(hours.reduce((sum,h)=>sum+(h.humidity??0),0)/Math.max(1,hours.filter(h=>h.humidity!==null).length)):null,
      precipitationProbabilityMax:num(daily.precipitation_probability_max,index),
      rainTotalMm:Math.max(0,rain),precipitationTotalMm:Math.max(0,num(daily.precipitation_sum,index)??rain),
      precipitationHours:num(daily.precipitation_hours,index),windMaxKmh:num(daily.wind_speed_10m_max,index),uvIndexMax:num(daily.uv_index_max,index),
      sunrise:daily.sunrise?.[index]??null,sunset:daily.sunset?.[index]??null,
      rainHours:hours.filter(h=>h.rainMm>=0.1),hours,
    };
  });
}
