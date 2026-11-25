'use client';

import React from 'react';

type Props = {
  stops: string[];
  angle: number;
  onChange: (stops: string[], angle: number) => void;
};

export function GradientEditor({ stops, angle, onChange }: Props) {
  const colors = stops.length ? stops : ['#ffffff'];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {colors.map((color, index) => (
          <label key={index} className="flex items-center gap-1.5 rounded-lg border border-slate-300/30 px-2 py-1.5 text-[10px] font-bold">
            <input
              aria-label={'グラデーション色 ' + (index + 1)}
              type="color"
              value={color}
              onChange={event => onChange(colors.map((item, i) => i === index ? event.target.value : item), angle)}
              className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <span>{index + 1}</span>
            {colors.length > 1 && (
              <button type="button" onClick={() => onChange(colors.filter((_, i) => i !== index), angle)} aria-label={'色 ' + (index + 1) + ' を削除'} className="ml-1 rounded px-1 text-rose-500">×</button>
            )}
          </label>
        ))}
        {colors.length < 8 && (
          <button type="button" onClick={() => onChange([...colors, colors[colors.length - 1] || '#ffffff'], angle)} className="rounded-lg border border-dashed border-slate-400/50 px-3 py-2 text-[10px] font-black">＋ 色を追加</button>
        )}
      </div>
      <label className="block text-[10px] font-bold">
        グラデーションの角度：{angle}°
        <input type="range" min="0" max="360" step="1" value={angle} onChange={event => onChange(colors, Number(event.target.value))} className="mt-1 w-full" />
      </label>
      <div className="h-3 rounded-full" style={{ background: 'linear-gradient(' + angle + 'deg,' + colors.join(',') + ')' }} />
    </div>
  );
}
