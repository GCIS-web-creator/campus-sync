'use client';

import React, { useEffect, useMemo, useState } from 'react';

type HistoryItem = { expression: string; result: string };

function evaluateExpression(source: string): number {
  const input = source.replace(/\s+/g, '');
  let index = 0;

  const parseExpression = (): number => {
    let value = parseTerm();
    while (index < input.length) {
      const operator = input[index];
      if (operator !== '+' && operator !== '-') break;
      index += 1;
      const right = parseTerm();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };

  const parseTerm = (): number => {
    let value = parseUnary();
    while (index < input.length) {
      const operator = input[index];
      if (operator !== '*' && operator !== '/') break;
      index += 1;
      const right = parseUnary();
      if (operator === '/' && right === 0) throw new Error('0では割れません');
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };

  const parseUnary = (): number => {
    if (input[index] === '+') {
      index += 1;
      return parseUnary();
    }
    if (input[index] === '-') {
      index += 1;
      return -parseUnary();
    }
    let value = parsePrimary();
    while (input[index] === '%') {
      value /= 100;
      index += 1;
    }
    return value;
  };

  const parsePrimary = (): number => {
    if (input[index] === '(') {
      index += 1;
      const value = parseExpression();
      if (input[index] !== ')') throw new Error('括弧が閉じていません');
      index += 1;
      return value;
    }

    const start = index;
    while (index < input.length && /[0-9.]/.test(input[index])) index += 1;
    const raw = input.slice(start, index);
    if (!raw || !/^\d*\.?\d+$/.test(raw)) throw new Error('数式を確認してください');
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error('計算できない数値です');
    return value;
  };

  if (!input) throw new Error('数式を入力してください');
  const result = parseExpression();
  if (index !== input.length) throw new Error('数式を確認してください');
  if (!Number.isFinite(result)) throw new Error('計算結果が大きすぎます');
  return result;
}

function formatNumber(value: number): string {
  const rounded = Number(value.toPrecision(12));
  return new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: 10,
    useGrouping: true,
  }).format(rounded);
}

function readableExpression(value: string): string {
  return value.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−');
}

type KeyDefinition = {
  label: string;
  value: string;
  tone?: 'utility' | 'operator' | 'equals' | 'muted';
  action?: 'clear' | 'backspace' | 'sign' | 'equals' | 'parenthesis';
};

const KEYS: KeyDefinition[][] = [
  [
    { label: 'AC', value: 'AC', tone: 'utility', action: 'clear' },
    { label: '⌫', value: 'backspace', tone: 'utility', action: 'backspace' },
    { label: '%', value: '%', tone: 'utility' },
    { label: '÷', value: '/', tone: 'operator' },
  ],
  [
    { label: '(', value: '(', tone: 'utility', action: 'parenthesis' },
    { label: ')', value: ')', tone: 'utility', action: 'parenthesis' },
    { label: '00', value: '00' },
    { label: '×', value: '*', tone: 'operator' },
  ],
  [
    { label: '7', value: '7' },
    { label: '8', value: '8' },
    { label: '9', value: '9' },
    { label: '−', value: '-', tone: 'operator' },
  ],
  [
    { label: '4', value: '4' },
    { label: '5', value: '5' },
    { label: '6', value: '6' },
    { label: '+', value: '+', tone: 'operator' },
  ],
  [
    { label: '1', value: '1' },
    { label: '2', value: '2' },
    { label: '3', value: '3' },
    { label: '±', value: 'sign', tone: 'utility', action: 'sign' },
  ],
  [
    { label: '0', value: '0' },
    { label: '.', value: '.' },
    { label: '=', value: '=', tone: 'equals', action: 'equals' },
  ],
];

export default function CampusCalculator({ isDarkMode = false }: { isDarkMode?: boolean }) {
  const [expression, setExpression] = useState('');
  const [justEvaluated, setJustEvaluated] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const preview = useMemo(() => {
    if (!expression || /[+*/.(-]$/.test(expression)) return null;
    try {
      return formatNumber(evaluateExpression(expression));
    } catch {
      return null;
    }
  }, [expression]);

  const clear = () => {
    setExpression('');
    setErrorMessage('');
    setJustEvaluated(false);
  };

  const appendDigit = (digit: string) => {
    setErrorMessage('');
    setExpression(current => {
      const base = justEvaluated ? '' : current;
      const needsMultiply = /[)%]$/.test(base);
      return base + (needsMultiply ? '*' : '') + digit;
    });
    setJustEvaluated(false);
  };

  const appendDecimal = () => {
    setErrorMessage('');
    setExpression(current => {
      const base = justEvaluated ? '' : current;
      if (/[)%]$/.test(base)) return base + '*0.';
      const currentNumber = base.match(/(?:^|[+*/(\-])(-?\d*\.?\d*)$/)?.[1] ?? '';
      if (currentNumber.includes('.')) return base;
      return base + (currentNumber === '' ? '0.' : '.');
    });
    setJustEvaluated(false);
  };

  const appendOperator = (operator: string) => {
    setErrorMessage('');
    setExpression(current => {
      if (!current) return operator === '-' ? '-' : '';
      if (/[+*/-]$/.test(current)) return current.slice(0, -1) + operator;
      return current + operator;
    });
    setJustEvaluated(false);
  };

  const appendParenthesis = (parenthesis: string) => {
    setErrorMessage('');
    setExpression(current => {
      if (parenthesis === '(') {
        const prefix = /[0-9)%]$/.test(current) ? '*' : '';
        return (justEvaluated ? '' : current) + prefix + '(';
      }
      const opens = (current.match(/\(/g) || []).length;
      const closes = (current.match(/\)/g) || []).length;
      return opens > closes && /[0-9)%]$/.test(current) ? current + ')' : current;
    });
    setJustEvaluated(false);
  };

  const appendPercent = () => {
    setErrorMessage('');
    setExpression(current => {
      if (!current || !/[0-9)]$/.test(current)) return current;
      return current + '%';
    });
    setJustEvaluated(false);
  };

  const toggleSign = () => {
    setErrorMessage('');
    setExpression(current => {
      if (!current) return '-';
      const match = current.match(/(-?\d*\.?\d+%?)$/);
      if (match && match.index !== undefined) {
        const token = match[1];
        const toggled = token.startsWith('-') ? token.slice(1) : '-' + token;
        return current.slice(0, match.index) + toggled;
      }
      if (/[)%]$/.test(current)) return '-(' + current + ')';
      if (/[+*/]$/.test(current)) return current + '-';
      return '-' + current;
    });
    setJustEvaluated(false);
  };

  const backspace = () => {
    setErrorMessage('');
    setExpression(current => justEvaluated ? '' : current.slice(0, -1));
    setJustEvaluated(false);
  };

  const calculate = () => {
    if (!expression) return;
    try {
      const value = evaluateExpression(expression);
      const result = formatNumber(value);
      const rawResult = String(Number(value.toPrecision(12)));
      setHistory(current => [
        { expression: readableExpression(expression), result },
        ...current.filter(item => item.expression !== readableExpression(expression)).slice(0, 4),
      ]);
      setExpression(rawResult);
      setJustEvaluated(true);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '計算できませんでした');
    }
  };

  const pressKey = (key: KeyDefinition) => {
    if (key.action === 'clear') return clear();
    if (key.action === 'backspace') return backspace();
    if (key.action === 'sign') return toggleSign();
    if (key.action === 'equals') return calculate();
    if (key.action === 'parenthesis') return appendParenthesis(key.value);
    if (/^\d+$/.test(key.value)) return appendDigit(key.value);
    if (key.value === '.') return appendDecimal();
    if (key.value === '%') return appendPercent();
    if (/^[+*/-]$/.test(key.value)) return appendOperator(key.value);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

      const key = event.key;
      if (/^\d$/.test(key)) {
        event.preventDefault();
        appendDigit(key);
      } else if (key === '.') {
        event.preventDefault();
        appendDecimal();
      } else if (/^[+\-*/]$/.test(key)) {
        event.preventDefault();
        appendOperator(key);
      } else if (key === '%') {
        event.preventDefault();
        appendPercent();
      } else if (key === '(' || key === ')') {
        event.preventDefault();
        appendParenthesis(key);
      } else if (key === 'Enter' || key === '=') {
        event.preventDefault();
        calculate();
      } else if (key === 'Backspace') {
        event.preventDefault();
        backspace();
      } else if (key === 'Escape') {
        event.preventDefault();
        clear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const panel = isDarkMode
    ? 'border-slate-700 bg-slate-900 text-slate-100'
    : 'border-slate-200 bg-white text-slate-900';
  const keyBase = 'flex min-h-[58px] select-none items-center justify-center rounded-2xl text-lg font-bold shadow-sm transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 sm:min-h-[66px]';

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 animate-in fade-in duration-300">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black tracking-[0.22em] text-cyan-700">CAMPUSSYNC TOOLS</p>
          <h1 className={'mt-1 text-2xl font-black tracking-tight ' + (isDarkMode ? 'text-white' : 'text-slate-900')}>電卓</h1>
          <p className={'mt-1 text-xs ' + (isDarkMode ? 'text-slate-400' : 'text-slate-500')}>四則演算・括弧・パーセントに対応</p>
        </div>
        <span className={'rounded-full border px-3 py-1.5 text-[10px] font-bold ' + (isDarkMode ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-white text-slate-500')}>オフライン計算</span>
      </header>

      <div className={'overflow-hidden rounded-[28px] border p-3 shadow-xl sm:p-5 ' + panel}>
        <div className="rounded-[22px] bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-4 py-5 text-right text-white shadow-inner sm:px-6 sm:py-7">
          <p className="min-h-6 break-all font-mono text-sm text-cyan-100/70" aria-live="polite">
            {expression ? readableExpression(expression) : '計算式を入力'}
          </p>
          <p className="mt-3 min-h-[52px] break-all font-mono text-4xl font-black tracking-tight sm:text-5xl" aria-live="polite">
            {justEvaluated && preview ? preview : preview ? preview : '0'}
          </p>
          {errorMessage && <p role="alert" className="mt-2 text-xs font-bold text-rose-300">{errorMessage}</p>}
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-2.5">
          {KEYS.flat().map(key => {
            const toneClass = key.tone === 'equals'
              ? 'col-span-2 bg-cyan-700 text-white hover:bg-cyan-600'
              : key.tone === 'operator'
                ? 'bg-cyan-50 text-cyan-900 hover:bg-cyan-100'
                : key.tone === 'utility'
                  ? (isDarkMode ? 'bg-slate-700 text-slate-100 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
                  : (isDarkMode ? 'bg-slate-800 text-slate-100 hover:bg-slate-700' : 'bg-white text-slate-800 hover:bg-slate-50 border border-slate-100');
            return (
              <button
                key={key.value}
                type="button"
                onClick={() => pressKey(key)}
                aria-label={key.label === '⌫' ? '1文字削除' : key.label === 'AC' ? 'すべてクリア' : key.label}
                className={keyBase + ' ' + toneClass + (key.tone === 'equals' ? ' col-span-2' : '')}
              >
                {key.label}
              </button>
            );
          })}
        </div>
        <p className={'mt-4 text-center text-[10px] ' + (isDarkMode ? 'text-slate-500' : 'text-slate-400')}>
          キーボード：0〜9、+ − × ÷、Enter（計算）、Backspace（削除）、Esc（クリア）
        </p>
      </div>

      {history.length > 0 && (
        <section className={'rounded-2xl border p-4 ' + panel}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-black">計算履歴</h2>
            <button type="button" onClick={() => setHistory([])} className="text-[11px] font-bold text-cyan-700 hover:underline">履歴を消去</button>
          </div>
          <div className="space-y-2">
            {history.map((item, index) => (
              <button
                key={item.expression + item.result + index}
                type="button"
                onClick={() => {
                  setExpression(String(Number(item.result.replace(/,/g, ''))));
                  setJustEvaluated(true);
                  setErrorMessage('');
                }}
                className={'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition ' + (isDarkMode ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-50 hover:bg-cyan-50')}
              >
                <span className={'min-w-0 truncate font-mono text-xs ' + (isDarkMode ? 'text-slate-400' : 'text-slate-500')}>{item.expression}</span>
                <span className="shrink-0 font-mono text-sm font-black">{item.result}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
