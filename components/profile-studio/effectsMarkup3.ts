// v4追加12テーマ。SVG/HTMLはコード内の固定素材のみで生成し、ユーザー入力は埋め込まない。
import { mk, sty, rep } from './effectsMarkup.js';

type Theme = 'lab'|'fw'|'momiji'|'snow'|'halloween'|'neon'|'magic'|'ocean'|'cat'|'dog'|'sweets'|'glass';
const COLORS: Record<Theme, string[]> = {
  lab:['#9ff0c8','#3fd39a','#d9fff0'], fw:['#ff6b9a','#ffd35a','#7be0ff','#c28bff'],
  momiji:['#e8452c','#f08a24','#ffc23d','#c1272d'], snow:['#d8f0ff','#ffffff','#9bd7ff'],
  halloween:['#ff9a3c','#c28bff','#ffd36b'], neon:['#ff3df2','#35f0ff','#ffffff'],
  magic:['#ffd1ff','#c9b3ff','#fff3a8'], ocean:['#bff0ff','#69c8ef','#e6fbff'],
  cat:['#fff3a8','#ffd0e0','#ffffff'], dog:['#b9824f','#ff7a95','#f8e4c8'],
  sweets:['#ff6b9a','#ffd35a','#7be0ff','#9bff8a','#c28bff'], glass:['#e2483d','#3d7be2','#f2c230','#3bb273','#9a4fd0','#f08a24'],
};
const MAPLE='M10 1L11.6 5.5 15 3.8 14.2 8.2 19 8 15.8 11.2 18 14 13 13.4 10 19 7 13.4 2 14 4.2 11.2 1 8 5.8 8.2 5 3.8 8.4 5.5Z';
const shape: Record<Theme,string> = {
  lab:'<path d="M8 3h8M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" fill="none" stroke="#b8f7d8" stroke-width="2"/><path d="M7 15h10" stroke="#3fd39a" stroke-width="2"/><circle cx="10" cy="13" r="1" fill="#fff"/>',
  fw:'<circle cx="12" cy="12" r="3" fill="#fff3a8"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6M4 4l4 4M16 16l4 4M20 4l-4 4M8 16l-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  momiji:'<path d="'+MAPLE+'" fill="#f08a24" transform="translate(2 2) scale(.85)"/>',
  snow:'<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M8 4l4 3 4-3M8 20l4-3 4 3" stroke="#e8f7ff" stroke-width="1.7" stroke-linecap="round" fill="none"/>',
  halloween:'<path d="M12 4c-5 0-8 4-8 9s3 8 8 8 8-3 8-8-3-9-8-9Z" fill="#ff9a3c"/><path d="m8 12 2 2 2-2 2 2 2-2M10 17h4M12 4V1" stroke="#39204c" stroke-width="1.6" fill="none"/>',
  neon:'<circle cx="12" cy="12" r="8" stroke="#ff3df2" stroke-width="2.2" fill="none"/><circle cx="12" cy="12" r="11" stroke="#35f0ff" stroke-width="1.4" stroke-dasharray="7 4" fill="none"/>',
  magic:'<circle cx="12" cy="12" r="7" stroke="#d6c2ff" stroke-width="1.4" fill="none"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5M12 8l1.2 2.8L16 12l-2.8 1.2L12 16l-1.2-2.8L8 12l2.8-1.2Z" fill="#fff1b8"/>',
  ocean:'<path d="M12 3c-4 0-7 4-7 9a7 7 0 0 0 14 0c0-5-3-9-7-9Z" fill="#9ad7ff" fill-opacity=".5" stroke="#e6fbff"/><path d="M8 20v3M12 20v3M16 20v3" stroke="#bff0ff" stroke-width="1.5"/>',
  cat:'<path d="M5 10 4 3l6 4h4l6-4-1 7a7 7 0 0 1-14 0Z" fill="#fff" stroke="#ffd0e0" stroke-width="1.4"/><path d="M9 12h.1M15 12h.1M10 16q2 2 4 0" stroke="#c36d91" stroke-width="1.4" stroke-linecap="round"/>',
  dog:'<path d="M7 6Q2 4 3 13q1 5 5 3M17 6q5-2 4 7-1 5-5 3" fill="#b9824f" stroke="#7a4f2a"/><ellipse cx="12" cy="12" rx="7" ry="8" fill="#f2d6b7"/><ellipse cx="12" cy="14" rx="2.5" ry="1.8" fill="#44302a"/>',
  sweets:'<circle cx="12" cy="12" r="8" fill="#ffb3cf" stroke="#fff0f6" stroke-width="1.5"/><path d="M8 9q4-6 8 0M8 15q4 6 8 0" stroke="#fff" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="2" fill="#e8344f"/>',
  glass:'<path d="M12 1 23 12 12 23 1 12Z" fill="#3d7be2"/><path d="M12 1 12 23M1 12h22M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="#fff" stroke-opacity=".85" stroke-width="1.5"/>',
};
function icon(kind:Theme,count=6){
  const colors=COLORS[kind];
  const dots=rep(Math.min(10,Math.max(2,count)),i=>{const angle=(i/Math.max(2,count))*Math.PI*2;const x=12+10*Math.cos(angle),y=12+10*Math.sin(angle);return '<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="1.1" fill="'+colors[i%colors.length]+'"/>';});
  const extras=kind==='glass'?rep(6,i=>'<path d="M12 12 12 1" stroke="'+colors[i]+'" transform="rotate('+(i*60)+' 12 12)" stroke-width="5"/>'):'';
  return '<div class="ps-deco pn-icon-'+kind+'"><svg class="pn-theme-glyph" style="position:absolute;left:72px;top:72px;width:96px;height:96px" viewBox="0 0 24 24" aria-hidden="true">'+extras+shape[kind]+dots+'</svg></div>';
}
function banner(kind:Theme,count=12){
  const colors=COLORS[kind];
  const points=rep(Math.min(26,Math.max(4,count)),i=>{
    const left=(i*37+11)%100, top=(i*23+17)%86, size=3+(i%4)*2;
    const symbol=kind==='momiji'?'<span class="pn-t3-leaf">✦</span>':kind==='snow'?'<span class="pn-t3-flake">✳</span>':kind==='ocean'?'<span class="pn-t3-bubble"></span>':kind==='glass'?'<span class="pn-t3-diamond"></span>':'<span class="pn-t3-dot"></span>';
    return '<i class="pn-t3-particle" style="left:'+left+'%;top:'+top+'%;--t3-size:'+size+'px;--t3-color:'+colors[i%colors.length]+'">'+symbol+'</i>';
  });
  return '<div class="pn-fx pn-theme-'+kind+'">'+points+'</div>';
}
export const labIcon=(n=7)=>icon('lab',n);
export const fwIcon=(n=8)=>icon('fw',n);
export const momijiIcon=(n=8)=>icon('momiji',n);
export const snowIcon=(n=12)=>icon('snow',n);
export const halloweenIcon=(n=6)=>icon('halloween',n);
export const neonIcon=()=>icon('neon',6);
export const magicIcon=(n=3)=>icon('magic',n);
export const oceanIcon=(n=6)=>icon('ocean',n);
export const catIcon=(n=3)=>icon('cat',n);
export const dogIcon=()=>icon('dog',5);
export const sweetsIcon=(n=28)=>icon('sweets',n);
export const glassIcon=()=>icon('glass',12);
export const labBanner=(n=16)=>banner('lab',n);
export const fwBanner=(n=5)=>banner('fw',n);
export const momijiBanner=(n=16)=>banner('momiji',n);
export const snowBanner=(n=40)=>banner('snow',n);
export const halloweenBanner=(n=5)=>banner('halloween',n);
export const neonBanner=(n=6)=>banner('neon',n);
export const magicBanner=(n=14)=>banner('magic',n);
export const oceanBanner=(n=12)=>banner('ocean',n);
export const catBanner=(n=10)=>banner('cat',n);
export const dogBanner=(n=10)=>banner('dog',n);
export const sweetsBanner=(n=24)=>banner('sweets',n);
export const glassBanner=(n=14)=>banner('glass',n);
