'use client';
import { useEffect,useState } from 'react';
type Hour={time:string;temperatureC:number|null;precipitationProbability:number|null;precipitationMm:number;rainMm:number;windKmh:number|null;humidity:number|null};
type Day={date:string;description:string;iconName:string;highC:number|null;lowC:number|null;precipitationProbabilityMax:number|null;rainTotalMm:number;precipitationTotalMm:number;precipitationHours:number|null;windMaxKmh:number|null;uvIndexMax:number|null;sunrise:string|null;sunset:string|null;rainHours:Hour[];hours:Hour[]};
type Data={location:string;updatedAt:string;days:Day[]};
const fmt=(v:number|null,s='')=>v===null?'—':(Math.round(v*10)/10)+s;
const fmtDate=(v:string)=>new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',weekday:'short',timeZone:'Asia/Tokyo'}).format(new Date(v+'T00:00:00+09:00'));
const WEATHER_ICONS: Array<[string, string]> = [["sunny","晴れ"],["cloudy","くもり"],["rain","雨"],["thunderstorm","雷雨"],["snow","雪"],["hail","ひょう"],["wind","風"],["temperature","気温"],["humidity","湿度"],["umbrella","傘"],["arrow","風向き"],["partly_cloudy","晴れ時々くもり"],["night_clear","夜・晴れ"],["night_cloudy","夜・くもり"],["fog","霧"],["haze","もや"],["sleet","みぞれ"],["rain_light","弱い雨"],["rain_heavy","強い雨"],["shower","にわか雨"],["lightning","稲妻"],["typhoon","台風"],["tornado","竜巻"],["kosa","黄砂"],["pm25","PM2.5"],["sandstorm","砂じん"],["precip_probability","降水確率"],["pressure","気圧"],["uv","紫外線"],["visibility","視程"],["feels_like","体感温度"],["sunrise","日の出"],["sunset","日の入り"],["moon_new","新月"],["moon_waxing_crescent","三日月"],["moon_first_quarter","上弦の月"],["moon_waxing_gibbous","満ちていく月"],["moon_full","満月"],["moon_waning_gibbous","欠けていく月"],["moon_last_quarter","下弦の月"],["moon_waning_crescent","有明月"],["advisory","注意報"],["warning","警報"],["special_warning","特別警報"],["pollen","花粉"],["heatstroke_alert","熱中症警戒"],["temp_high","高温"],["temp_low","低温"]];
export default function WeatherForecast(){
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{
    let cancelled=false;
    const load=async()=>{
      try{
        const response=await fetch('/api/weather/forecast',{cache:'no-store'}),result=await response.json().catch(()=>null);
        if(!response.ok||!result?.days)throw new Error(result?.message||'天気情報を取得できませんでした。');
        if(!cancelled){setData(result as Data);setError('');}
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'天気情報を取得できませんでした。');}
      finally{if(!cancelled)setLoading(false);}
    };
    void load();return()=>{cancelled=true;};
  },[]);
  return <section className="campus-page-transition overflow-hidden rounded-3xl border border-slate-200/70 bg-white/90 shadow-lg shadow-slate-900/5 dark:border-slate-700/70 dark:bg-slate-900/85">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/70 px-4 py-4 dark:border-slate-700/70 sm:px-5">
      <div><p className="text-[10px] font-black tracking-[0.18em] text-cyan-600 dark:text-cyan-300">CAMPUS WEATHER</p><h2 className="mt-1 text-base font-black text-slate-900 dark:text-white">キャンパス周辺の天気</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">東京都小平市たかの台周辺</p></div>
      {data?.updatedAt&&<p className="text-[10px] text-slate-400">更新 {new Date(data.updatedAt).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}</p>}
    </div>
    {loading?<div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">{[0,1,2].map(i=><div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800"/>)}</div>
    :error||!data?<p role="status" className="p-5 text-sm text-rose-600 dark:text-rose-300">{error||'天気情報を取得できませんでした。'}</p>
    :<div className="space-y-4 p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {data.days.map((d,i)=><article key={d.date} className={i===1?'rounded-2xl border border-cyan-300/70 bg-cyan-50/70 p-3 dark:border-cyan-500/30 dark:bg-cyan-950/30':'rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/60'}>
          <p className="text-xs font-black text-slate-700 dark:text-slate-200">{(i===0?'今日':i===1?'明日':'明後日')+' · '+fmtDate(d.date)}</p>
          <div className="mt-2 flex items-center gap-3"><img src={'/api/weather/icons/'+d.iconName} alt={d.description} className="h-14 w-14 object-contain" loading="lazy"/><div><p className="text-sm font-bold text-slate-800 dark:text-slate-100">{d.description}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400"><span className="font-black text-rose-500">{fmt(d.highC,'°')}</span><span className="px-1">/</span><span className="font-black text-sky-500">{fmt(d.lowC,'°')}</span></p></div></div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-white/80 p-2 dark:bg-slate-900/70"><p className="text-[10px] text-slate-400">降水確率</p><p className="mt-0.5 font-black text-slate-800 dark:text-slate-100">{fmt(d.precipitationProbabilityMax,'%')}</p></div><div className="rounded-lg bg-white/80 p-2 dark:bg-slate-900/70"><p className="text-[10px] text-slate-400">予想雨量</p><p className="mt-0.5 font-black text-slate-800 dark:text-slate-100">{fmt(d.rainTotalMm,' mm')}</p></div></div>
        </article>)}
      </div>
      {data.days[1]&&<div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-900 dark:text-white">明日の時間帯別予報・雨の見込み</h3><p className="text-xs text-slate-500 dark:text-slate-400">最高 {fmt(data.days[1].highC,'°')} / 最低 {fmt(data.days[1].lowC,'°')} · 降水確率 {fmt(data.days[1].precipitationProbabilityMax,'%')}</p></div>
        {data.days[1].rainHours.length>0?<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{data.days[1].rainHours.map(h=><div key={h.time} className="rounded-xl bg-sky-50 p-3 dark:bg-sky-950/40"><p className="text-xs font-black text-sky-800 dark:text-sky-200">{h.time}</p><p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{fmt(h.rainMm,' mm')}</p><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">降水確率 {fmt(h.precipitationProbability,'%')}</p></div>)}</div>
        :<p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">明日はまとまった雨の予報はありません。</p>}
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><div><span className="text-slate-400">最大風速</span><p className="font-bold text-slate-800 dark:text-slate-100">{fmt(data.days[1].windMaxKmh,' km/h')}</p></div><div><span className="text-slate-400">紫外線指数</span><p className="font-bold text-slate-800 dark:text-slate-100">{fmt(data.days[1].uvIndexMax)}</p></div><div><span className="text-slate-400">日の出</span><p className="font-bold text-slate-800 dark:text-slate-100">{data.days[1].sunrise?.slice(11,16)||'—'}</p></div><div><span className="text-slate-400">日の入り</span><p className="font-bold text-slate-800 dark:text-slate-100">{data.days[1].sunset?.slice(11,16)||'—'}</p></div></div>
      </div>}
      <details className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <summary className="cursor-pointer list-none text-sm font-black text-slate-900 dark:text-white">
          CampusSync 気象アイコンライブラリ（48種類）
          <span className="mt-1 block text-[10px] font-normal text-slate-500 dark:text-slate-400">天気・気温・大気・警報・月齢などのアイコン一覧</span>
        </summary>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {WEATHER_ICONS.map(([name, label]) => (
            <div key={name} className="flex min-w-0 flex-col items-center rounded-xl bg-slate-50 p-2 text-center dark:bg-slate-800">
              <img src={'/api/weather/icons/' + name} alt="" className="h-10 w-10 object-contain" loading="lazy" />
              <span className="mt-1 text-[9px] font-bold leading-4 text-slate-600 dark:text-slate-300">{label}</span>
            </div>
          ))}
        </div>
      </details>
      <p className="text-[10px] text-slate-400">天気データ：Open-Meteo · 予報は更新される場合があります。</p>
    </div>}
  </section>;
}
