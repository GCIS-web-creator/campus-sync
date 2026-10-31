import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import sharp from 'sharp';
import { NextResponse } from 'next/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const ALLOWED=new Set(['sunny','cloudy','rain','thunderstorm','snow','hail','wind','temperature','humidity','umbrella','arrow','partly_cloudy','night_clear','night_cloudy','fog','haze','sleet','rain_light','rain_heavy','shower','lightning','typhoon','tornado','kosa','pm25','sandstorm','precip_probability','pressure','uv','visibility','feels_like','sunrise','sunset','moon_new','moon_waxing_crescent','moon_first_quarter','moon_waxing_gibbous','moon_full','moon_waning_gibbous','moon_last_quarter','moon_waning_crescent','advisory','warning','special_warning','pollen','heatstroke_alert','temp_high','temp_low']);
function extractZipEntry(zip:Buffer,wanted:string):Buffer|null{
  let end=-1;
  for(let p=zip.length-22;p>=Math.max(0,zip.length-65557);p--){if(zip.readUInt32LE(p)===0x06054b50){end=p;break;}}
  if(end<0)return null;
  const count=zip.readUInt16LE(end+10);let cursor=zip.readUInt32LE(end+16);
  for(let i=0;i<count;i++){
    if(zip.readUInt32LE(cursor)!==0x02014b50)return null;
    const method=zip.readUInt16LE(cursor+10),size=zip.readUInt32LE(cursor+20),nl=zip.readUInt16LE(cursor+28),el=zip.readUInt16LE(cursor+30),cl=zip.readUInt16LE(cursor+32),local=zip.readUInt32LE(cursor+42);
    const name=zip.toString('utf8',cursor+46,cursor+46+nl);
    if(name===wanted){
      if(zip.readUInt32LE(local)!==0x04034b50)return null;
      const lnl=zip.readUInt16LE(local+26),lel=zip.readUInt16LE(local+28),start=local+30+lnl+lel,data=zip.subarray(start,start+size);
      if(method===0)return Buffer.from(data);if(method===8)return inflateRawSync(data);return null;
    }
    cursor+=46+nl+el+cl;
  }
  return null;
}
export async function GET(request:Request,context:{params:Promise<{name:string}>}){
  const {name}=await context.params;
  if(!ALLOWED.has(name))return NextResponse.json({message:'Unknown icon'},{status:404});
  try{
    const archive=await readFile(join(process.cwd(),'weather_icons (2).zip'));
    const svg=extractZipEntry(archive,name+'.svg');
    if(!svg)return NextResponse.json({message:'Icon not found'},{status:404});
    if(new URL(request.url).searchParams.get('format')==='png'){
      const png=await sharp(svg,{density:144}).resize(256,256,{fit:'contain'}).png().toBuffer();
      return new NextResponse(new Uint8Array(png),{headers:{'Content-Type':'image/png','Cache-Control':'public,max-age=86400,s-maxage=604800,stale-while-revalidate=86400'}});
    }
    return new NextResponse(new Uint8Array(svg),{headers:{'Content-Type':'image/svg+xml;charset=utf-8','Cache-Control':'public,max-age=86400,s-maxage=604800,stale-while-revalidate=86400','X-Content-Type-Options':'nosniff'}});
  }catch(error){
    console.error('Weather icon archive read failed:',error instanceof Error?error.message:'unknown');
    return NextResponse.json({message:'Weather icon unavailable'},{status:500});
  }
}
