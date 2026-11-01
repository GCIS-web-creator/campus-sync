'use client';

import React, { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowRightLeft, BarChart3, Calculator, Check, ChevronRight,
  Copy, Delete, History, LineChart, Loader2, RotateCcw, Sigma, Sparkles
} from 'lucide-react';

type NerdamerEntity = {
  text: () => string;
  evaluate?: (values?: Record<string, number>) => NerdamerEntity;
};
type NerdamerEngine = (expression: string, values?: Record<string, number>) => NerdamerEntity;
declare global {
  interface Window {
    nerdamer?: NerdamerEngine;
    __campusMathEnginePromise?: Promise<NerdamerEngine>;
  }
}

const NERDAMER_URL = 'https://cdn.jsdelivr.net/npm/nerdamer@2.0.0/dist/bundle.js';

function loadNerdamer(): Promise<NerdamerEngine> {
  if (window.nerdamer) return Promise.resolve(window.nerdamer);
  if (window.__campusMathEnginePromise) return window.__campusMathEnginePromise;
  window.__campusMathEnginePromise = new Promise<NerdamerEngine>((resolve, reject) => {
    const existing = document.getElementById('campus-function-calculator-engine') as HTMLScriptElement | null;
    const script = existing || document.createElement('script');
    const finish = () => {
      if (window.nerdamer) resolve(window.nerdamer);
      else reject(new Error('数式エンジンを初期化できませんでした。ページを再読み込みしてください。'));
    };
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error('数式エンジンを読み込めませんでした。ネットワーク接続を確認してください。')), { once: true });
    if (!existing) {
      script.id = 'campus-function-calculator-engine';
      script.src = NERDAMER_URL;
      script.async = true;
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    } else if (window.nerdamer) finish();
  });
  return window.__campusMathEnginePromise;
}

const ALLOWED_NAMES = new Set([
  'x', 'y', 't', 'n', 'k', 'a', 'b', 'c', 'i', 'e', 'pi', 'infinity',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'sqrt', 'cbrt', 'abs', 'log', 'log10', 'exp',
  'floor', 'ceil', 'ceiling', 'round', 'sign', 'mod',
  'min', 'max', 'gcd', 'lcm', 'fact', 'factorial', 'dfact'
]);

function normalizeExpression(value: string, answer: string, allowEquation = false): string {
  let expression = value.trim()
    .replace(/[０-９]/g, character => String.fromCharCode(character.charCodeAt(0) - 0xFEE0))
    .replace(/[×✕·]/g, '*')
    .replace(/[÷／]/g, '/')
    .replace(/[−―]/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/Ans/gi, '(' + (answer || '0') + ')')
    .replace(/(^|[^A-Za-z])log\s*\(/gi, '$1log10(')
    .replace(/(^|[^A-Za-z])ln\s*\(/gi, '$1log(');
  expression = expression.replace(/\s+/g, '');
  if (!expression) throw new Error('数式を入力してください。');
  if (expression.length > 180) throw new Error('数式は180文字以内にしてください。');
  if (!/^[0-9A-Za-z_+\-*/^().,!<>=]+$/.test(expression)) {
    throw new Error('使用できない文字が含まれています。数式と関数名を確認してください。');
  }
  if (!allowEquation && expression.includes('=')) throw new Error('この欄には「=」を含めず、式だけを入力してください。');
  const names = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  for (const name of names) {
    if (!ALLOWED_NAMES.has(name.toLowerCase())) {
      throw new Error('未対応の文字・関数「' + name + '」があります。x、y、sin、cos、tan、log、sqrt などを使用してください。');
    }
  }
  if (/\b(?:Infinity|infinity)\b/.test(expression)) expression = expression.replace(/\binfinity\b/gi, 'Infinity');
  return expression;
}

function applyDegreeMode(expression: string, mode: 'DEG' | 'RAD'): string {
  if (mode === 'RAD') return expression;
  let result = expression;
  result = result.replace(/\b(sin|cos|tan|sec|csc|cot)\(([^()]+)\)/gi, (_all, fn: string, argument: string) =>
    fn + '((' + argument + ')*pi/180)');
  result = result.replace(/\b(asin|acos|atan)\(([^()]+)\)/gi, (_all, fn: string, argument: string) =>
    '((' + fn + '(' + argument + '))*180/pi)');
  return result;
}

function displayMath(value: string): string {
  return value.replace(/\bpi\b/g, 'π').replace(/\*/g, ' × ').replace(/\s+/g, ' ').trim();
}

function readNumeric(engine: NerdamerEngine, expression: string, variable?: string, value?: number): number {
  const substitutions = variable && typeof value === 'number' ? { [variable]: value } : undefined;
  const raw = engine('numeric(' + expression + ',14)', substitutions).text();
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

type HistoryEntry = { expression: string; result: string; timestamp: string };
type PlotPoint = { x: number; y: number };
type ToolTab = 'algebra' | 'calculus' | 'equations' | 'graph' | 'statistics';

const TOOL_TABS: Array<{ id: ToolTab; label: string; icon: React.ReactNode }> = [
  { id: 'algebra', label: '式の変形', icon: <Sigma size={16} /> },
  { id: 'calculus', label: '微分・積分・極限', icon: <Activity size={16} /> },
  { id: 'equations', label: '方程式', icon: <ArrowRightLeft size={16} /> },
  { id: 'graph', label: '関数グラフ', icon: <LineChart size={16} /> },
  { id: 'statistics', label: '統計', icon: <BarChart3 size={16} /> },
];

const BASIC_KEYS = [
  ['AC', '⌫', '(', ')', '÷'],
  ['7', '8', '9', '×', '^'],
  ['4', '5', '6', '-', 'sqrt('],
  ['1', '2', '3', '+', 'x'],
  ['0', '.', 'Ans', 'π', '='],
];

export default function FunctionCalculator() {
  const [expression, setExpression] = useState('2+3*4');
  const [result, setResult] = useState('');
  const [approximation, setApproximation] = useState('');
  const [error, setError] = useState('');
  const [angleMode, setAngleMode] = useState<'DEG' | 'RAD'>('DEG');
  const [precision, setPrecision] = useState(12);
  const [engineReady, setEngineReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [memory, setMemory] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeTool, setActiveTool] = useState<ToolTab>('calculus');

  const [algebraExpression, setAlgebraExpression] = useState('x^3-3*x^2-4*x+12');
  const [algebraAction, setAlgebraAction] = useState<'simplify' | 'factor' | 'expand'>('factor');
  const [algebraResult, setAlgebraResult] = useState('');
  const [algebraError, setAlgebraError] = useState('');

  const [calculusExpression, setCalculusExpression] = useState('x^3+2*x^2-5*x+1');
  const [calculusVariable, setCalculusVariable] = useState('x');
  const [derivativeOrder, setDerivativeOrder] = useState(1);
  const [derivativeAt, setDerivativeAt] = useState('2');
  const [integralLower, setIntegralLower] = useState('0');
  const [integralUpper, setIntegralUpper] = useState('2');
  const [limitAt, setLimitAt] = useState('0');
  const [calculusResult, setCalculusResult] = useState('');
  const [calculusError, setCalculusError] = useState('');

  const [equationExpression, setEquationExpression] = useState('x^2-5*x+6');
  const [equationVariable, setEquationVariable] = useState('x');
  const [equationResult, setEquationResult] = useState('');
  const [equationError, setEquationError] = useState('');

  const [graphExpression, setGraphExpression] = useState('x^2-4');
  const [graphMin, setGraphMin] = useState('-5');
  const [graphMax, setGraphMax] = useState('5');
  const [plotPoints, setPlotPoints] = useState<PlotPoint[]>([]);
  const [plotMessage, setPlotMessage] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [statisticsInput, setStatisticsInput] = useState('12, 15, 18, 20, 25, 30');
  const [statisticsResult, setStatisticsResult] = useState<Array<{ label: string; value: string }>>([]);
  const [statisticsError, setStatisticsError] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadNerdamer()
      .then(() => { if (!cancelled) setEngineReady(true); })
      .catch(() => { if (!cancelled) setEngineReady(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !plotPoints.length) return;
    const width = Math.max(320, canvas.clientWidth);
    const height = 310;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    context.fillStyle = '#0b1727';
    context.fillRect(0, 0, width, height);

    const padding = { left: 48, right: 18, top: 18, bottom: 34 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;
    const xValues = plotPoints.map(point => point.x);
    const xMin = Math.min(...xValues), xMax = Math.max(...xValues);
    const finiteY = plotPoints.map(point => point.y).filter(Number.isFinite);
    if (!finiteY.length) return;
    const rawMax = Math.max(...finiteY), rawMin = Math.min(...finiteY);
    const center = (rawMax + rawMin) / 2;
    const span = Math.max(4, rawMax - rawMin, Math.abs(center) * 0.25);
    const yMin = center - span * 0.62;
    const yMax = center + span * 0.62;
    const xToCanvas = (x: number) => padding.left + ((x - xMin) / (xMax - xMin)) * graphWidth;
    const yToCanvas = (y: number) => padding.top + ((yMax - y) / (yMax - yMin)) * graphHeight;

    context.strokeStyle = 'rgba(148,163,184,0.12)';
    context.lineWidth = 1;
    for (let index = 0; index <= 8; index += 1) {
      const x = padding.left + (graphWidth * index) / 8;
      const y = padding.top + (graphHeight * index) / 6;
      context.beginPath(); context.moveTo(x, padding.top); context.lineTo(x, height - padding.bottom); context.stroke();
      context.beginPath(); context.moveTo(padding.left, y); context.lineTo(width - padding.right, y); context.stroke();
    }
    context.strokeStyle = 'rgba(203,213,225,0.55)';
    context.lineWidth = 1.2;
    if (xMin <= 0 && xMax >= 0) {
      const x0 = xToCanvas(0); context.beginPath(); context.moveTo(x0, padding.top); context.lineTo(x0, height - padding.bottom); context.stroke();
    }
    if (yMin <= 0 && yMax >= 0) {
      const y0 = yToCanvas(0); context.beginPath(); context.moveTo(padding.left, y0); context.lineTo(width - padding.right, y0); context.stroke();
    }
    context.fillStyle = '#94a3b8';
    context.font = '11px ui-monospace, SFMono-Regular, monospace';
    context.fillText(xMin.toFixed(1), padding.left, height - 10);
    const midX = (xMin + xMax) / 2;
    context.fillText(midX.toFixed(1), xToCanvas(midX) - 10, height - 10);
    context.fillText(xMax.toFixed(1), width - padding.right - 30, height - 10);
    context.fillText(yMax.toPrecision(3), 4, padding.top + 4);
    context.fillText(yMin.toPrecision(3), 4, height - padding.bottom);

    context.strokeStyle = '#38bdf8';
    context.lineWidth = 2.4;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.beginPath();
    let drawing = false;
    let previousX = -1000;
    for (const point of plotPoints) {
      if (!Number.isFinite(point.y)) { drawing = false; continue; }
      const x = xToCanvas(point.x), y = yToCanvas(Math.max(yMin * 2, Math.min(yMax * 2, point.y)));
      if (!drawing || x - previousX > graphWidth / plotPoints.length * 1.8) context.moveTo(x, y);
      else context.lineTo(x, y);
      drawing = true;
      previousX = x;
    }
    context.stroke();
  }, [plotPoints]);

  const pushHistory = (expressionValue: string, resultValue: string) => {
    setHistory(current => [{ expression: expressionValue, result: resultValue, timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) }, ...current].slice(0, 12));
  };

  const calculate = async (source?: string) => {
    const text = (source ?? expression).trim();
    if (!text) return;
    setBusy(true); setError(''); setApproximation('');
    try {
      const engine = await loadNerdamer();
      setEngineReady(true);
      const prepared = applyDegreeMode(normalizeExpression(text, answer), angleMode);
      const exact = engine(prepared).text();
      let decimal = '';
      try {
        const candidate = engine('numeric(' + prepared + ',' + precision + ')').text();
        if (candidate && candidate !== exact && Number.isFinite(Number(candidate))) decimal = Number(candidate).toPrecision(precision);
      } catch { /* symbolic expressions do not always have a decimal value */ }
      setResult(exact);
      setApproximation(decimal);
      setAnswer(decimal || exact);
      setExpression(text);
      pushHistory(text, exact);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '計算できませんでした。');
    } finally { setBusy(false); }
  };

  const handleMainSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void calculate();
  };

  const insert = (token: string) => {
    if (token === 'AC') { setExpression(''); setResult(''); setApproximation(''); setError(''); return; }
    if (token === '⌫') { setExpression(current => current.slice(0, -1)); setResult(''); return; }
    if (token === '=') { void calculate(); return; }
    const mapped = token === '×' ? '*' : token === '÷' ? '/' : token === 'π' ? 'pi' : token;
    setExpression(current => current + mapped);
    setResult(''); setError('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); void calculate(); }
    if (event.key === 'Escape') { setExpression(''); setResult(''); setError(''); }
  };

  const runAlgebra = async (action: 'simplify' | 'factor' | 'expand') => {
    setAlgebraError(''); setAlgebraResult('');
    try {
      const engine = await loadNerdamer();
      const expressionValue = normalizeExpression(algebraExpression, answer);
      const output = engine(action + '(' + expressionValue + ')').text();
      setAlgebraResult(output);
    } catch (caught) { setAlgebraError(caught instanceof Error ? caught.message : '式を変形できませんでした。'); }
  };

  const runCalculus = async (kind: 'derivative' | 'integral' | 'definite' | 'limit') => {
    setCalculusError(''); setCalculusResult(''); setBusy(true);
    try {
      const engine = await loadNerdamer();
      const variable = calculusVariable.trim() || 'x';
      if (!/^[A-Za-z]$/.test(variable)) throw new Error('変数は英字1文字で指定してください。');
      const expr = normalizeExpression(calculusExpression, answer);
      let output = '';
      if (kind === 'derivative') {
        output = engine('diff(' + expr + ',' + variable + ',' + derivativeOrder + ')').text();
        const at = Number(derivativeAt);
        if (derivativeAt.trim() !== '' && Number.isFinite(at)) {
          try {
            const numeric = readNumeric(engine, 'diff(' + expr + ',' + variable + ',' + derivativeOrder + ')', variable, at);
            if (Number.isFinite(numeric)) output += '\n' + variable + ' = ' + at + ' のとき: ' + numeric.toPrecision(precision);
          } catch { /* the symbolic answer remains useful */ }
        }
      } else if (kind === 'integral') {
        output = engine('integrate(' + expr + ',' + variable + ')').text() + ' + C';
      } else if (kind === 'definite') {
        const lower = normalizeExpression(integralLower, answer);
        const upper = normalizeExpression(integralUpper, answer);
        output = engine('defint(' + expr + ',' + variable + ',' + lower + ',' + upper + ')').text();
      } else {
        const point = normalizeExpression(limitAt, answer);
        output = engine('limit(' + expr + ',' + variable + ',' + point + ')').text();
      }
      setCalculusResult(output);
    } catch (caught) { setCalculusError(caught instanceof Error ? caught.message : '計算できませんでした。'); }
    finally { setBusy(false); }
  };

  const runEquation = async () => {
    setEquationError(''); setEquationResult(''); setBusy(true);
    try {
      const engine = await loadNerdamer();
      const variable = equationVariable.trim() || 'x';
      if (!/^[A-Za-z]$/.test(variable)) throw new Error('変数は英字1文字で指定してください。');
      const expr = normalizeExpression(equationExpression, answer, true);
      setEquationResult(engine('solve(' + expr + ',' + variable + ')').text());
    } catch (caught) { setEquationError(caught instanceof Error ? caught.message : '方程式を解けませんでした。'); }
    finally { setBusy(false); }
  };

  const drawGraph = async () => {
    setPlotMessage(''); setPlotPoints([]); setBusy(true);
    try {
      const engine = await loadNerdamer();
      const raw = normalizeExpression(graphExpression, answer);
      const expr = applyDegreeMode(raw, angleMode);
      const min = Number(graphMin), max = Number(graphMax);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) throw new Error('x の範囲は、最小値が最大値より小さくなるように指定してください。');
      if (max - min > 1000) throw new Error('グラフの範囲は1000以内にしてください。');
      const points: PlotPoint[] = [];
      for (let index = 0; index <= 160; index += 1) {
        const x = min + ((max - min) * index) / 160;
        let y = Number.NaN;
        try { y = readNumeric(engine, expr, 'x', x); } catch { y = Number.NaN; }
        points.push({ x, y });
      }
      if (!points.some(point => Number.isFinite(point.y))) throw new Error('この範囲ではグラフを描けません。');
      setPlotPoints(points);
      setPlotMessage('f(x) = ' + displayMath(raw) + '　／　x = ' + min + ' ～ ' + max);
    } catch (caught) { setPlotMessage(caught instanceof Error ? caught.message : 'グラフを描けませんでした。'); }
    finally { setBusy(false); }
  };

  const runStatistics = () => {
    setStatisticsError(''); setStatisticsResult([]);
    const values = statisticsInput.split(/[,\s、，]+/).map(value => value.trim()).filter(Boolean).map(Number);
    if (!values.length || values.some(value => !Number.isFinite(value))) {
      setStatisticsError('数値をカンマ区切りで入力してください。例：12, 15, 18, 20');
      return;
    }
    if (values.length > 500) { setStatisticsError('一度に計算できるデータは500個までです。'); return; }
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((total, value) => total + value, 0);
    const mean = sum / values.length;
    const median = (sorted.length % 2 === 1)
      ? sorted[Math.floor(sorted.length / 2)]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    const variance = values.reduce((total, value) => total + Math.pow(value - mean, 2), 0) / values.length;
    const sampleVariance = values.length > 1
      ? values.reduce((total, value) => total + Math.pow(value - mean, 2), 0) / (values.length - 1)
      : Number.NaN;
    const middle = Math.floor(sorted.length / 2);
    const lower = sorted.slice(0, middle);
    const upper = sorted.length % 2 ? sorted.slice(middle + 1) : sorted.slice(middle);
    const medianOf = (list: number[]) => list.length % 2 ? list[Math.floor(list.length / 2)] : list.length ? (list[list.length / 2 - 1] + list[list.length / 2]) / 2 : Number.NaN;
    const frequency = new Map<number, number>();
    for (const value of values) frequency.set(value, (frequency.get(value) || 0) + 1);
    const maxFrequency = Math.max(...frequency.values());
    const modes = [...frequency.entries()].filter(([, count]) => count === maxFrequency && maxFrequency > 1).map(([value]) => value);
    const format = (value: number) => Number.isFinite(value) ? String(Number(value.toPrecision(12))) : '—';
    setStatisticsResult([
      { label: 'データ数', value: String(values.length) },
      { label: '合計', value: format(sum) },
      { label: '平均値', value: format(mean) },
      { label: '中央値', value: format(median) },
      { label: '最小値 / 最大値', value: format(sorted[0]) + ' / ' + format(sorted[sorted.length - 1]) },
      { label: '範囲', value: format(sorted[sorted.length - 1] - sorted[0]) },
      { label: '第1四分位数 Q1', value: format(medianOf(lower)) },
      { label: '第3四分位数 Q3', value: format(medianOf(upper)) },
      { label: '分散（母）', value: format(variance) },
      { label: '標準偏差（母）', value: format(Math.sqrt(variance)) },
      { label: '標本分散', value: format(sampleVariance) },
      { label: '最頻値', value: modes.length ? modes.join(', ') : 'なし' },
    ]);
  };

  const copyValue = async (value: string) => {
    try { await navigator.clipboard.writeText(value); } catch { setError('コピーできませんでした。ブラウザの権限を確認してください。'); }
  };

  const panelClass = 'rounded-3xl border border-slate-800/90 bg-[#0d1b2b] shadow-[0_16px_50px_rgba(0,0,0,0.18)]';
  const fieldClass = 'w-full rounded-xl border border-slate-700 bg-[#081321] px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10';
  const labelClass = 'mb-1.5 block text-xs font-semibold text-slate-400';
  const smallButton = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-500/50 hover:text-white disabled:opacity-40';
  const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="min-h-screen bg-[#07111e] text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-48 h-[460px] w-[460px] rounded-full bg-cyan-500/10 blur-[120px]" />
        <div className="absolute -right-40 top-[24rem] h-[520px] w-[520px] rounded-full bg-indigo-500/10 blur-[130px]" />
      </div>

      <header className="relative border-b border-slate-800/80 bg-[#07111e]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-blue-500 text-slate-950 shadow-lg shadow-cyan-500/15"><Calculator size={22} /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.26em] text-cyan-300">FUNCTION LAB</p>
              <h1 className="truncate text-lg font-black tracking-tight sm:text-xl">関数電卓</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-[11px] text-slate-400 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />ブラウザ内で計算</div>
            <button type="button" onClick={() => setAngleMode(current => current === 'DEG' ? 'RAD' : 'DEG')} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-black text-cyan-200 transition hover:border-cyan-400" aria-label="角度モードを切り替え">{angleMode}</button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <section className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">MATH TOOLS FOR HIGH SCHOOL</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">計算から微積分まで、ひとつの画面で。</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">四則演算・三角関数・指数対数・式の変形・方程式・微分積分・極限・関数グラフ・統計をまとめた学習用の関数電卓です。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-1.5">高校数学 I・A</span>
            <span className="rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-1.5">II・B・C</span>
            <span className="rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-1.5">III</span>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className={panelClass + ' overflow-hidden'}>
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300"><span className="h-2 w-2 rounded-full bg-cyan-400" />計算パネル</div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-slate-500" htmlFor="precision">精度</label>
                <select id="precision" value={precision} onChange={event => setPrecision(Number(event.target.value))} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200">
                  <option value={8}>8桁</option><option value={12}>12桁</option><option value={16}>16桁</option>
                </select>
              </div>
            </div>
            <div className="space-y-3 p-4 sm:p-5">
              <form onSubmit={handleMainSubmit} className="space-y-3">
                <label className="block">
                  <span className={labelClass}>数式入力</span>
                  <input
                    autoComplete="off"
                    spellCheck={false}
                    value={expression}
                    onChange={event => { setExpression(event.target.value); setError(''); }}
                    onKeyDown={handleKeyDown}
                    placeholder="例：sin(30)+sqrt(16)"
                    className="w-full rounded-2xl border border-slate-700 bg-[#071321] px-4 py-4 font-mono text-xl tracking-wide text-white outline-none transition placeholder:text-slate-700 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10 sm:text-2xl"
                    aria-label="数式入力"
                  />
                </label>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-500">M</span>
                    <button type="button" className={smallButton} onClick={() => setMemory(answer || result)} disabled={!answer && !result}>MS</button>
                    <button type="button" className={smallButton} onClick={() => insert('(' + memory + ')')} disabled={!memory}>MR</button>
                    <button type="button" className={smallButton} onClick={() => setMemory('')} disabled={!memory}>MC</button>
                  </div>
                  <button type="submit" disabled={busy} className={primaryButton}>{busy ? <Loader2 size={16} className="animate-spin" /> : <span className="text-base">=</span>}計算する</button>
                </div>
              </form>

              <div className="min-h-[126px] rounded-2xl border border-slate-800 bg-[#071321] p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">RESULT</span>
                  <div className="flex items-center gap-2">
                    {engineReady ? <span className="text-[10px] text-emerald-400">ENGINE READY</span> : <span className="text-[10px] text-slate-500">ENGINE LOADING</span>}
                    {result && <button type="button" className="text-slate-500 transition hover:text-cyan-300" onClick={() => void copyValue(result)} aria-label="答えをコピー"><Copy size={14} /></button>}
                  </div>
                </div>
                {error ? <p role="alert" className="text-sm leading-relaxed text-rose-300">{error}</p> : result ? (
                  <>
                    <p className="break-all font-mono text-xl font-bold leading-relaxed text-cyan-200 sm:text-2xl">{displayMath(result)}</p>
                    {approximation && <p className="mt-2 text-xs text-slate-400">小数表示：<span className="font-mono text-slate-200">{approximation}</span></p>}
                  </>
                ) : <p className="pt-2 text-sm text-slate-600">計算結果がここに表示されます。</p>}
              </div>

              <div className="grid grid-cols-5 gap-2">
                {BASIC_KEYS.flat().map((key, index) => {
                  const isAction = key === '=' || key === 'AC';
                  const isOperator = ['÷', '×', '^', '-', '+'].includes(key);
                  const isUtility = key === '⌫' || key === 'sqrt(';
                  return (
                    <button
                      type="button"
                      key={key + '-' + index}
                      onClick={() => insert(key)}
                      className={'min-h-12 rounded-xl border text-sm font-bold transition active:scale-[0.97] ' +
                        (key === '=' ? 'border-cyan-400 bg-cyan-400 text-slate-950 hover:bg-cyan-300' :
                         key === 'AC' ? 'border-rose-500/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20' :
                         isOperator ? 'border-slate-700 bg-slate-800/90 text-cyan-200 hover:border-cyan-500/60 hover:bg-slate-700' :
                         isUtility ? 'border-slate-700 bg-slate-900 text-indigo-200 hover:border-indigo-400/60' :
                         'border-slate-800 bg-[#132236] text-slate-100 hover:border-slate-600 hover:bg-[#1a2c43]')}
                    >
                      {key === 'sqrt(' ? '√' : key === '⌫' ? <Delete size={17} className="mx-auto" /> : key}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {['sin(', 'cos(', 'tan(', 'log(', 'ln(', 'exp(', 'abs(', 'fact(', 'asin(', 'acos(', 'atan(', 'x^2', 'x^3', 'pi', 'e', 'i'].map(token => (
                  <button type="button" key={token} onClick={() => insert(token === 'pi' ? 'π' : token)} className="min-h-10 rounded-lg border border-indigo-500/15 bg-indigo-500/5 px-2 text-xs font-semibold text-indigo-200 transition hover:border-indigo-400/40 hover:bg-indigo-500/10">
                    {token === 'pi' ? 'π' : token === 'x^2' ? 'x²' : token === 'x^3' ? 'x³' : token.replace('(', '')}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
                <p className="text-[10px] text-slate-500">三角関数の角度設定：{angleMode}（{angleMode === 'DEG' ? '度数法' : '弧度法'}）</p>
                <button type="button" className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-white" onClick={() => { setExpression(''); setResult(''); setApproximation(''); setError(''); }}><RotateCcw size={12} />クリア</button>
              </div>
            </div>
          </div>

          <div className={panelClass + ' flex min-h-[450px] flex-col'}>
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300"><History size={15} className="text-cyan-300" />計算履歴</div>
              <button type="button" onClick={() => setHistory([])} disabled={!history.length} className="text-[11px] text-slate-500 transition hover:text-rose-300 disabled:opacity-30">履歴を消去</button>
            </div>
            <div className="flex-1 space-y-2 p-3 sm:p-4">
              {!history.length && <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 text-center text-slate-600"><History size={28} strokeWidth={1.4} /><p className="text-xs">計算すると、ここに履歴が残ります。</p></div>}
              {history.map((entry, index) => (
                <button type="button" key={entry.timestamp + '-' + index} onClick={() => { setExpression(entry.expression); setResult(entry.result); setError(''); }} className="group w-full rounded-xl border border-slate-800 bg-[#091625] p-3 text-left transition hover:border-cyan-500/40 hover:bg-[#102238]">
                  <div className="flex items-center justify-between gap-2"><span className="text-[10px] text-slate-600">{entry.timestamp}</span><ChevronRight size={13} className="text-slate-700 group-hover:text-cyan-300" /></div>
                  <p className="mt-1 truncate font-mono text-xs text-slate-400">{displayMath(entry.expression)}</p>
                  <p className="mt-1 break-all font-mono text-sm font-bold text-cyan-200">{displayMath(entry.result)}</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className={panelClass + ' overflow-hidden'}>
          <div className="border-b border-slate-800 px-4 pt-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">ADVANCED MATHEMATICS</p><h3 className="mt-1 text-lg font-black">高機能ツール</h3></div>
              <span className="rounded-full border border-cyan-500/20 bg-cyan-500/5 px-3 py-1 text-[10px] font-bold text-cyan-200">高校数学対応</span>
            </div>
            <div className="mt-4 flex gap-1 overflow-x-auto pb-0">
              {TOOL_TABS.map(tab => (
                <button type="button" key={tab.id} onClick={() => setActiveTool(tab.id)} className={'flex shrink-0 items-center gap-2 rounded-t-xl border-b-2 px-3 py-3 text-xs font-bold transition sm:px-4 ' + (activeTool === tab.id ? 'border-cyan-400 bg-cyan-500/10 text-cyan-200' : 'border-transparent text-slate-500 hover:text-slate-200')}>
                  {tab.icon}{tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 sm:p-5">
            {activeTool === 'algebra' && (
              <div className="grid gap-5 lg:grid-cols-[1fr_0.85fr]">
                <div className="space-y-4">
                  <div><label className={labelClass} htmlFor="algebra-expression">変形する式</label><input id="algebra-expression" className={fieldClass + ' font-mono'} value={algebraExpression} onChange={event => setAlgebraExpression(event.target.value)} /></div>
                  <div className="flex flex-wrap gap-2">
                    {(['simplify', 'factor', 'expand'] as const).map(action => (
                      <button type="button" key={action} onClick={() => setAlgebraAction(action)} className={'rounded-xl border px-3 py-2 text-xs font-bold transition ' + (algebraAction === action ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-200' : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white')}>
                        {action === 'simplify' ? '簡単化' : action === 'factor' ? '因数分解' : '展開'}
                      </button>
                    ))}
                    <button type="button" onClick={() => void runAlgebra(algebraAction)} className={primaryButton}><Sparkles size={14} />実行</button>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-[#081522] p-4">
                  <p className="text-[10px] font-black tracking-[0.16em] text-slate-500">OUTPUT</p>
                  {algebraError ? <p className="mt-3 text-sm text-rose-300">{algebraError}</p> : algebraResult ? <p className="mt-3 break-all font-mono text-lg text-cyan-200">{displayMath(algebraResult)}</p> : <p className="mt-3 text-sm text-slate-600">式を入力し、処理を選択してください。</p>}
                </div>
              </div>
            )}

            {activeTool === 'calculus' && (
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-[1fr_160px]">
                  <div><label className={labelClass} htmlFor="calculus-expression">関数 f(x)</label><input id="calculus-expression" className={fieldClass + ' font-mono'} value={calculusExpression} onChange={event => setCalculusExpression(event.target.value)} /></div>
                  <div><label className={labelClass} htmlFor="calculus-variable">微分・積分する変数</label><input id="calculus-variable" className={fieldClass + ' font-mono'} value={calculusVariable} maxLength={1} onChange={event => setCalculusVariable(event.target.value)} /></div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-slate-800 bg-[#091625] p-3.5">
                    <p className="text-sm font-black text-cyan-200">微分</p>
                    <p className="mt-1 text-[11px] text-slate-500">導関数・高階導関数</p>
                    <label className={labelClass + ' mt-3'} htmlFor="derivative-order">何階導関数</label>
                    <select id="derivative-order" value={derivativeOrder} onChange={event => setDerivativeOrder(Number(event.target.value))} className={fieldClass}><option value={1}>1階</option><option value={2}>2階</option><option value={3}>3階</option><option value={4}>4階</option></select>
                    <label className={labelClass + ' mt-3'} htmlFor="derivative-at">x の値（任意）</label>
                    <input id="derivative-at" value={derivativeAt} onChange={event => setDerivativeAt(event.target.value)} className={fieldClass} />
                    <button type="button" onClick={() => void runCalculus('derivative')} className={primaryButton + ' mt-3 w-full'}>微分する</button>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-[#091625] p-3.5">
                    <p className="text-sm font-black text-cyan-200">不定積分</p>
                    <p className="mt-1 text-[11px] text-slate-500">原始関数を求める</p>
                    <div className="mt-7 rounded-xl bg-slate-900/80 p-3 text-center font-mono text-lg text-slate-300">∫ f(x) dx</div>
                    <button type="button" onClick={() => void runCalculus('integral')} className={primaryButton + ' mt-3 w-full'}>積分する</button>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-[#091625] p-3.5">
                    <p className="text-sm font-black text-cyan-200">定積分</p>
                    <p className="mt-1 text-[11px] text-slate-500">数値積分（適応型 Simpson 法）</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div><label className={labelClass} htmlFor="integral-lower">下端 a</label><input id="integral-lower" value={integralLower} onChange={event => setIntegralLower(event.target.value)} className={fieldClass} /></div>
                      <div><label className={labelClass} htmlFor="integral-upper">上端 b</label><input id="integral-upper" value={integralUpper} onChange={event => setIntegralUpper(event.target.value)} className={fieldClass} /></div>
                    </div>
                    <button type="button" onClick={() => void runCalculus('definite')} className={primaryButton + ' mt-3 w-full'}>定積分を計算</button>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-[#091625] p-3.5">
                    <p className="text-sm font-black text-cyan-200">極限</p>
                    <p className="mt-1 text-[11px] text-slate-500">x が a に近づくとき</p>
                    <div className="mt-3"><label className={labelClass} htmlFor="limit-at">近づく値 a</label><input id="limit-at" value={limitAt} onChange={event => setLimitAt(event.target.value)} className={fieldClass} /></div>
                    <div className="mt-3 rounded-xl bg-slate-900/80 p-3 text-center font-mono text-lg text-slate-300">lim f(x)</div>
                    <button type="button" onClick={() => void runCalculus('limit')} className={primaryButton + ' mt-3 w-full'}>極限を求める</button>
                  </div>
                </div>
                {(calculusError || calculusResult) && (
                  <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                    <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black tracking-[0.16em] text-cyan-300">CALCULUS RESULT</p>{calculusResult && <button type="button" onClick={() => void copyValue(calculusResult)} className="text-slate-500 hover:text-cyan-200"><Copy size={14} /></button>}</div>
                    {calculusError ? <p className="mt-2 text-sm text-rose-300">{calculusError}</p> : <p className="mt-2 whitespace-pre-wrap break-all font-mono text-lg leading-relaxed text-cyan-100">{displayMath(calculusResult)}</p>}
                  </div>
                )}
                <p className="text-[11px] leading-relaxed text-slate-500">不定積分は数式エンジンが対応する初等関数を記号的に処理します。定積分は数値計算です。微分・積分・極限の数式は数学標準のラジアン表記として扱います。</p>
              </div>
            )}

            {activeTool === 'equations' && (
              <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
                <div className="space-y-4">
                  <div><label className={labelClass} htmlFor="equation-input">方程式（右辺を0とする式でも可）</label><input id="equation-input" value={equationExpression} onChange={event => setEquationExpression(event.target.value)} className={fieldClass + ' font-mono'} placeholder="x^2-5*x+6=0" /></div>
                  <div className="max-w-48"><label className={labelClass} htmlFor="equation-variable">求める変数</label><input id="equation-variable" value={equationVariable} maxLength={1} onChange={event => setEquationVariable(event.target.value)} className={fieldClass + ' font-mono'} /></div>
                  <button type="button" onClick={() => void runEquation()} disabled={busy} className={primaryButton}><Sigma size={15} />解を求める</button>
                  <p className="text-[11px] text-slate-500">対応範囲：多項式方程式、因数分解で解ける方程式など。式の種類によっては解が出ない場合があります。</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-[#081522] p-4">
                  <p className="text-[10px] font-black tracking-[0.16em] text-slate-500">SOLUTION</p>
                  {equationError ? <p className="mt-3 text-sm text-rose-300">{equationError}</p> : equationResult ? <p className="mt-3 break-all font-mono text-lg text-cyan-200">{displayMath(equationResult)}</p> : <p className="mt-3 text-sm text-slate-600">方程式の解がここに表示されます。</p>}
                </div>
              </div>
            )}

            {activeTool === 'graph' && (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[1fr_130px_130px_auto] md:items-end">
                  <div><label className={labelClass} htmlFor="graph-expression">関数 f(x)</label><input id="graph-expression" value={graphExpression} onChange={event => setGraphExpression(event.target.value)} className={fieldClass + ' font-mono'} /></div>
                  <div><label className={labelClass} htmlFor="graph-min">x の最小値</label><input id="graph-min" value={graphMin} onChange={event => setGraphMin(event.target.value)} className={fieldClass} /></div>
                  <div><label className={labelClass} htmlFor="graph-max">x の最大値</label><input id="graph-max" value={graphMax} onChange={event => setGraphMax(event.target.value)} className={fieldClass} /></div>
                  <button type="button" onClick={() => void drawGraph()} disabled={busy} className={primaryButton}>{busy ? <Loader2 size={15} className="animate-spin" /> : <LineChart size={15} />}グラフを描く</button>
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0b1727]"><canvas ref={canvasRef} className="block h-[310px] w-full" aria-label="関数グラフ" /></div>
                {plotMessage && <p className="text-xs text-slate-400">{plotMessage}</p>}
                <p className="text-[11px] text-slate-500">定義域の外や不連続点はグラフに表示されない場合があります。目盛りは表示範囲に合わせた概略です。</p>
              </div>
            )}

            {activeTool === 'statistics' && (
              <div className="grid gap-4 lg:grid-cols-[0.9fr_1fr]">
                <div className="space-y-3">
                  <div><label className={labelClass} htmlFor="statistics-data">データ（カンマ区切り）</label><textarea id="statistics-data" rows={5} value={statisticsInput} onChange={event => setStatisticsInput(event.target.value)} className={fieldClass + ' resize-y font-mono'} placeholder="12, 15, 18, 20, 25" /></div>
                  <button type="button" onClick={runStatistics} className={primaryButton}><BarChart3 size={15} />統計量を計算</button>
                  {statisticsError && <p role="alert" className="text-xs text-rose-300">{statisticsError}</p>}
                </div>
                <div className="grid content-start gap-2 sm:grid-cols-2">
                  {statisticsResult.map(item => <div key={item.label} className="rounded-xl border border-slate-800 bg-[#081522] p-3"><p className="text-[10px] font-semibold text-slate-500">{item.label}</p><p className="mt-1 break-all font-mono text-sm font-bold text-cyan-200">{item.value}</p></div>)}
                  {!statisticsResult.length && <p className="text-sm text-slate-600">平均・中央値・四分位数・分散・標準偏差などを計算します。</p>}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {[
            { title: '関数・三角比', text: 'sin / cos / tan、逆三角関数、双曲線関数、平方根、絶対値' },
            { title: '指数・対数', text: '指数関数 exp、自然対数 ln、常用対数 log、任意底の log(x,b)' },
            { title: '数式処理', text: '因数分解、展開、簡単化、方程式、導関数、原始関数、極限' },
          ].map(item => <div key={item.title} className="rounded-2xl border border-slate-800/80 bg-[#0d1b2b]/75 p-4"><h4 className="text-sm font-black text-slate-200">{item.title}</h4><p className="mt-2 text-xs leading-relaxed text-slate-500">{item.text}</p></div>)}
        </section>

        <footer className="flex flex-col items-center justify-between gap-2 border-t border-slate-800/80 py-5 text-center text-[10px] text-slate-600 sm:flex-row sm:text-left">
          <span>FUNCTION LAB · 高校数学向け関数電卓</span>
          <span>入力した数式はブラウザ内で処理され、計算のためにサーバーへ送信されません。</span>
        </footer>
      </main>
    </div>
  );
}
