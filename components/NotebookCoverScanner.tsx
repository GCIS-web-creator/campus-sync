'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, ImagePlus, RotateCcw, ScanLine, X, ZoomIn } from 'lucide-react';
import {
  detectDocumentCorners,
  makeDefaultDocumentCorners,
  rectifyDocumentCanvas,
  type DocumentPoint,
} from '@/lib/document-scanner';

type Props = { isDarkMode?: boolean; onClose: () => void; onSelect: (file: File) => void | Promise<void> };
const MAX_SOURCE_DIMENSION = 2200;

export default function NotebookCoverScanner({ isDarkMode = false, onClose, onSelect }: Props) {
  const [stage,setStage]=useState<'camera'|'adjust'>('camera');
  const [cameraStatus,setCameraStatus]=useState('カメラを起動しています…');
  const [cameraError,setCameraError]=useState('');
  const [sourceCanvas,setSourceCanvas]=useState<HTMLCanvasElement|null>(null);
  const [sourceUrl,setSourceUrl]=useState('');
  const [corners,setCorners]=useState<DocumentPoint[]>([]);
  const [autoDetected,setAutoDetected]=useState(false);
  const [processing,setProcessing]=useState(false);
  const [draggingIndex,setDraggingIndex]=useState<number|null>(null);
  const [magnifierPosition,setMagnifierPosition]=useState<{x:number;y:number;width:number;height:number}|null>(null);
  const videoRef=useRef<HTMLVideoElement>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const svgRef=useRef<SVGSVGElement>(null);
  const fileInputRef=useRef<HTMLInputElement>(null);

  const dark=isDarkMode;
  const panel=dark?'border-slate-700 bg-slate-900 text-slate-100':'border-slate-200 bg-white text-slate-900';
  const muted=dark?'text-slate-400':'text-slate-500';
  const button='inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition disabled:opacity-50 '+(dark?'border-slate-700 text-slate-200 hover:bg-slate-800':'border-slate-200 text-slate-700 hover:bg-slate-50');
  const primary='inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-xs font-black text-white transition hover:bg-cyan-800 disabled:opacity-50';

  const stopCamera=useCallback(()=>{
    streamRef.current?.getTracks().forEach(track=>track.stop());
    streamRef.current=null;
    if(videoRef.current)videoRef.current.srcObject=null;
  },[]);

  useEffect(()=>{
    if(stage!=='camera')return;
    let cancelled=false;
    const start=async()=>{
      if(!navigator.mediaDevices?.getUserMedia){setCameraError('このブラウザではカメラを利用できません。画像ファイルを選択してください。');setCameraStatus('');return;}
      try{
        const stream=await navigator.mediaDevices.getUserMedia({
          audio:false,
          video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},
        });
        if(cancelled){stream.getTracks().forEach(track=>track.stop());return;}
        streamRef.current=stream;
        if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play().catch(()=>undefined);}
        setCameraStatus('');setCameraError('');
      }catch(error){
        const name=error instanceof DOMException?error.name:'';
        setCameraError(name==='NotAllowedError'
          ?'カメラの使用が許可されていません。ブラウザの設定を確認するか、画像ファイルを選択してください。'
          :'カメラを起動できませんでした。画像ファイルを選択してください。');
        setCameraStatus('');
      }
    };
    void start();
    return()=>{cancelled=true;stopCamera();};
  },[stage,stopCamera]);

  useEffect(()=>()=>{if(sourceUrl)URL.revokeObjectURL(sourceUrl);},[sourceUrl]);

  const prepareCanvas=useCallback(async(canvas:HTMLCanvasElement)=>{
    setProcessing(true);setCameraError('');
    try{
      const previewBlob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',0.90));
      if(!previewBlob)throw new Error('撮影画像を読み込めませんでした。');
      const url=URL.createObjectURL(previewBlob);
      setSourceUrl(current=>{if(current)URL.revokeObjectURL(current);return url;});
      setSourceCanvas(canvas);
      const context=canvas.getContext('2d',{willReadFrequently:true});
      if(!context)throw new Error('画像を解析できませんでした。');
      const found=detectDocumentCorners(context.getImageData(0,0,canvas.width,canvas.height));
      setCorners(found||makeDefaultDocumentCorners(canvas.width,canvas.height));
      setAutoDetected(Boolean(found));
      setStage('adjust');
    }catch(error){setCameraError(error instanceof Error?error.message:'画像の読み込みに失敗しました。');}
    finally{setProcessing(false);}
  },[]);

  const capture=async()=>{
    const video=videoRef.current;
    if(!video||!video.videoWidth||!video.videoHeight){setCameraError('カメラの準備がまだできていません。');return;}
    const scale=Math.min(1,MAX_SOURCE_DIMENSION/Math.max(video.videoWidth,video.videoHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
    const context=canvas.getContext('2d');if(!context)return;
    context.drawImage(video,0,0,canvas.width,canvas.height);
    stopCamera();
    await prepareCanvas(canvas);
  };

  const chooseFile=async(file:File|null)=>{
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setCameraError('JPG・PNG・WebP画像を選択してください。');return;}
    setProcessing(true);
    try{
      const bitmap=await createImageBitmap(file);
      const scale=Math.min(1,MAX_SOURCE_DIMENSION/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(2,Math.round(bitmap.width*scale));canvas.height=Math.max(2,Math.round(bitmap.height*scale));
      const context=canvas.getContext('2d');if(!context)throw new Error('画像を読み込めませんでした。');
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      stopCamera();
      await prepareCanvas(canvas);
    }catch(error){setCameraError(error instanceof Error?error.message:'画像を開けませんでした。');setProcessing(false);}
  };

  const retryDetection=()=>{
    if(!sourceCanvas)return;
    const context=sourceCanvas.getContext('2d',{willReadFrequently:true});if(!context)return;
    const found=detectDocumentCorners(context.getImageData(0,0,sourceCanvas.width,sourceCanvas.height));
    setCorners(found||makeDefaultDocumentCorners(sourceCanvas.width,sourceCanvas.height));
    setAutoDetected(Boolean(found));
  };

  const updateCorner=(event:React.PointerEvent<SVGSVGElement>)=>{
    if(draggingIndex===null||!sourceCanvas||!svgRef.current)return;
    const rect=svgRef.current.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return;
    const localX=Math.min(rect.width,Math.max(0,event.clientX-rect.left));
    const localY=Math.min(rect.height,Math.max(0,event.clientY-rect.top));
    const x=localX/rect.width*sourceCanvas.width;
    const y=localY/rect.height*sourceCanvas.height;
    setCorners(current=>current.map((point,index)=>index===draggingIndex
      ?{x:Math.min(sourceCanvas.width-1,Math.max(0,x)),y:Math.min(sourceCanvas.height-1,Math.max(0,y))}
      :point));
    setMagnifierPosition({x:localX,y:localY,width:rect.width,height:rect.height});
  };

  const saveScannedImage=async()=>{
    if(!sourceCanvas)return;
    setProcessing(true);setCameraError('');
    try{
      const blob=await rectifyDocumentCanvas(sourceCanvas,corners);
      const file=new File([blob],'notebook-cover-scan.jpg',{type:'image/jpeg',lastModified:Date.now()});
      await onSelect(file);
    }catch(error){setCameraError(error instanceof Error?error.message:'スキャン画像を作成できませんでした。');}
    finally{setProcessing(false);}
  };

  const handleFileInput=(event:React.ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0]||null;event.target.value='';void chooseFile(file);
  };

  const magnifierStyle=magnifierPosition?(()=>{
    const size=120,zoom=3,gap=14;
    const left=Math.max(8,Math.min(magnifierPosition.width-size-8,magnifierPosition.x<magnifierPosition.width/2?magnifierPosition.x+gap:magnifierPosition.x-size-gap));
    const top=Math.max(8,Math.min(magnifierPosition.height-size-8,magnifierPosition.y<magnifierPosition.height/2?magnifierPosition.y+gap:magnifierPosition.y-size-gap));
    return {
      left,top,width:size,height:size,
      backgroundImage:'url("'+sourceUrl+'")',
      backgroundRepeat:'no-repeat',
      backgroundSize:(magnifierPosition.width*zoom)+'px '+(magnifierPosition.height*zoom)+'px',
      backgroundPosition:(size/2-magnifierPosition.x*zoom)+'px '+(size/2-magnifierPosition.y*zoom)+'px',
    } as React.CSSProperties;
  })():null;

  return(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/80 p-2 backdrop-blur-sm sm:p-4">
      <section className={'relative flex max-h-[96dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl '+panel}>
        <header className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-4 py-3 dark:border-slate-700">
          <div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-600">CampusSync / Document Scanner</p><h2 className="mt-0.5 flex items-center gap-2 text-base font-black"><ScanLine size={18}/>ノート表紙スキャン</h2></div>
          <button type="button" className={button} onClick={onClose} aria-label="閉じる"><X size={16}/></button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
          {stage==='camera'?<>
            <div className="relative mx-auto aspect-[4/5] max-h-[58dvh] w-full overflow-hidden rounded-2xl bg-black">
              <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain"/>
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-[8%] rounded-xl border-2 border-dashed border-white/85 shadow-[0_0_0_999px_rgba(0,0,0,0.24)]"/>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-1 text-[10px] font-bold text-white">表紙の四隅を枠内に合わせてください</div>
              </div>
            </div>
            {cameraStatus&&<p className={'text-center text-xs '+muted}>{cameraStatus}</p>}
            {cameraError&&<div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><AlertTriangle size={15} className="mr-1 inline"/>{cameraError}</div>}
            <p className={'text-center text-[10px] leading-5 '+muted}>表紙の外側に少し余白を取り、できるだけ正面から撮影してください。撮影後に四隅を自動検出します。</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={button} onClick={()=>fileInputRef.current?.click()} disabled={processing}><ImagePlus size={15}/>画像を選択</button>
              <button type="button" className={primary} onClick={()=>void capture()} disabled={processing||Boolean(cameraStatus)||Boolean(cameraError)}><Camera size={15}/>撮影する</button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileInput}/>
          </>:<>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-sm font-black">四隅を確認・調整</p><p className={'mt-1 text-[10px] '+muted}>丸をドラッグすると、指の近くに3倍拡大鏡が表示されます。</p></div>
              <span className={'rounded-full px-2.5 py-1 text-[9px] font-black '+(autoDetected?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-800')}>{autoDetected?'四隅を自動検出':'手動で枠を調整してください'}</span>
            </div>
            {sourceCanvas&&sourceUrl&&<div className="relative mx-auto w-full overflow-hidden rounded-xl bg-slate-950" style={{aspectRatio:sourceCanvas.width+'/'+sourceCanvas.height}}>
              <img src={sourceUrl} alt="スキャンする表紙" draggable={false} className="absolute inset-0 h-full w-full select-none object-fill"/>
              <svg ref={svgRef} viewBox={'0 0 '+sourceCanvas.width+' '+sourceCanvas.height} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" style={{touchAction:'none'}} onPointerMove={updateCorner} onPointerUp={()=>{setDraggingIndex(null);setMagnifierPosition(null);}} onPointerCancel={()=>{setDraggingIndex(null);setMagnifierPosition(null);}}>
                <polygon points={corners.map(point=>point.x+','+point.y).join(' ')} fill="rgba(6,182,212,0.13)" stroke="#22d3ee" strokeWidth={Math.max(3,sourceCanvas.width*0.004)}/>
                {corners.map((point,index)=><g key={index}>
                  <circle cx={point.x} cy={point.y} r={Math.max(17,Math.min(sourceCanvas.width,sourceCanvas.height)*0.022)} fill="#0891b2" fillOpacity="0.88" stroke="white" strokeWidth={Math.max(4,sourceCanvas.width*0.003)} style={{touchAction:'none',cursor:'grab'}} onPointerDown={event=>{event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);const rect=svgRef.current?.getBoundingClientRect();if(rect)setMagnifierPosition({x:event.clientX-rect.left,y:event.clientY-rect.top,width:rect.width,height:rect.height});setDraggingIndex(index);}}/>
                  <text x={point.x} y={point.y+Math.max(5,sourceCanvas.width*0.005)} fill="white" fontSize={Math.max(18,sourceCanvas.width*0.025)} fontWeight="bold" textAnchor="middle" pointerEvents="none">{index+1}</text>
                </g>)}
              </svg>
              {magnifierStyle&&<div aria-hidden="true" className="pointer-events-none absolute z-20 overflow-hidden rounded-full border-[3px] border-white shadow-2xl ring-2 ring-cyan-500" style={magnifierStyle}>
                <div className="absolute inset-0 rounded-full bg-black/5"/>
                <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/65"/>
                <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/65"/>
                <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-cyan-500 shadow"/>
                <span className="absolute left-1/2 top-1.5 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-cyan-700/95 px-2 py-0.5 text-[9px] font-black text-white shadow"><ZoomIn size={10}/>3×</span>
              </div>}
            </div>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" className={button} onClick={retryDetection} disabled={processing}><RotateCcw size={14}/>自動検出し直す</button>
              <button type="button" className={button} onClick={()=>{setStage('camera');setSourceCanvas(null);setSourceUrl('');setCorners([]);}} disabled={processing}><Camera size={14}/>撮り直す</button>
            </div>
            <p className={'rounded-xl border p-3 text-[10px] leading-5 '+(dark?'border-slate-700 bg-slate-950 text-slate-400':'border-slate-200 bg-slate-50 text-slate-600')}>枠の内側だけを切り出し、傾きと遠近感を補正します。背景は自動で除外されます。自動検出が難しい表紙は、4つの丸を角に合わせてください。</p>
          </>}
        </div>

        {stage==='adjust'&&<footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 px-3 py-3 dark:border-slate-700 sm:px-4">
          <button type="button" className={button} onClick={()=>setStage('camera')} disabled={processing}>戻る</button>
          <button type="button" className={primary} onClick={()=>void saveScannedImage()} disabled={processing||corners.length!==4}>
            {processing?'補正中…':<><CheckCircle2 size={15}/>この枠で補正して保存</>}
          </button>
        </footer>}
        {processing&&<div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/45 text-sm font-black text-white">画像を処理しています…</div>}
      </section>
    </div>
  );
}
