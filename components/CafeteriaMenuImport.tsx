'use client';

import React, { useRef, useState } from 'react';
import { ScanText, CheckCircle2, AlertCircle, Loader2, X, Plus } from 'lucide-react';

export type CafeteriaMenuImportRow = {
  service_date: string;
  soka_lunch: string;
  healthy_lunch: string;
  snack_lunch: string;
  curry: string;
  noodles: string;
  is_closed: boolean;
};

type Props = { selectedMonth: string; onApply: (rows: CafeteriaMenuImportRow[]) => void };
type Box = { x0: number; y0: number; x1: number; y1: number };
type OcrWord = { text: string; confidence?: number; bbox: Box };
type OcrWorker = {
  setParameters: (parameters: Record<string, string>) => Promise<void>;
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { words?: OcrWord[]; text?: string; confidence?: number } }>;
  terminate: () => Promise<void>;
};
type PdfPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
};
type PdfDocument = { numPages: number; getPage: (pageNumber: number) => Promise<PdfPage> };
type PdfJsApi = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: { data: Uint8Array }) => { promise: Promise<PdfDocument> };
};
type TesseractApi = {
  createWorker: (
    languages: string,
    oem: number,
    options: {
      workerPath: string;
      corePath: string;
      langPath: string;
      logger?: (message: { status?: string; progress?: number }) => void;
    },
  ) => Promise<OcrWorker>;
};
declare global {
  interface Window { pdfjsLib?: PdfJsApi; Tesseract?: TesseractApi; }
}

const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const TESSERACT_WORKER_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js';
const TESSERACT_CORE_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1';
const JAPANESE_DATA_URL = 'https://tessdata.projectnaptha.com/4.0.0_best';

function loadScript(id: string, source: string, ready: () => boolean): Promise<void> {
  if (ready()) return Promise.resolve();
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => ready() ? resolve() : reject(new Error('OCRライブラリを初期化できませんでした。')), { once: true });
      existing.addEventListener('error', () => reject(new Error('OCRライブラリを読み込めませんでした。')), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = source;
    script.async = true;
    script.onload = () => ready() ? resolve() : reject(new Error('OCRライブラリを初期化できませんでした。'));
    script.onerror = () => reject(new Error('OCRライブラリを読み込めませんでした。インターネット接続を確認してください。'));
    document.head.appendChild(script);
  });
}

async function loadOcrLibraries() {
  await Promise.all([
    loadScript('campussync-pdfjs', PDFJS_URL, () => Boolean(window.pdfjsLib)),
    loadScript('campussync-tesseract', TESSERACT_URL, () => Boolean(window.Tesseract)),
  ]);
  if (!window.pdfjsLib || !window.Tesseract) throw new Error('PDF・OCRライブラリを利用できません。');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
}

function imageToCanvas(source: HTMLImageElement | ImageBitmap): HTMLCanvasElement {
  const scale = Math.min(3.8, 3000 / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('画像を読み取れませんでした。');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function createImageCanvas(file: File): Promise<HTMLCanvasElement> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    try { return imageToCanvas(bitmap); } finally { bitmap.close(); }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('画像ファイルを開けませんでした。'));
    });
    return imageToCanvas(image);
  } finally { URL.revokeObjectURL(url); }
}

async function createPdfCanvases(file: File): Promise<HTMLCanvasElement[]> {
  if (!window.pdfjsLib) throw new Error('PDF読み取り機能を初期化できません。');
  const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (pdf.numPages > 5) throw new Error('PDFは5ページ以内のファイルを選択してください。');
  const canvases: HTMLCanvasElement[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const original = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(4.0, 3000 / Math.max(original.width, original.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('PDFページを画像に変換できませんでした。');
    await page.render({ canvasContext: context, viewport }).promise;
    canvases.push(canvas);
  }
  return canvases;
}

function cluster(values: number[], distance = 3): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const value of sorted) {
    const current = groups[groups.length - 1];
    if (current && value - current[current.length - 1] <= distance) current.push(value);
    else groups.push([value]);
  }
  return groups.map(group => Math.round(group.reduce((sum, value) => sum + value, 0) / group.length));
}

function detectLines(canvas: HTMLCanvasElement, axis: 'horizontal' | 'vertical'): number[] {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return [];
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  const isDark = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    const brightness = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    return brightness < 150;
  };
  const found: number[] = [];
  if (axis === 'horizontal') {
    const x0 = Math.round(width * 0.015), x1 = Math.round(width * 0.985);
    const y0 = Math.round(height * 0.065), y1 = Math.round(height * 0.985);
    for (let y = y0; y < y1; y += 1) {
      let count = 0;
      for (let x = x0; x < x1; x += 1) if (isDark(x, y)) count += 1;
      // 写真の傾きや薄い罫線を考慮し、全幅の一部が検出できれば候補にする。
      if (count >= (x1 - x0) * 0.38) found.push(y);
    }
    return cluster(found, 4);
  }
  const y0 = Math.round(height * 0.075), y1 = Math.round(height * 0.985);
  const x0 = Math.round(width * 0.025), x1 = Math.round(width * 0.975);
  for (let x = x0; x < x1; x += 1) {
    let count = 0;
    for (let y = y0; y < y1; y += 1) if (isDark(x, y)) count += 1;
    if (count >= (y1 - y0) * 0.16) found.push(x);
  }
  return cluster(found, 4);
}

// 献立表は画像の幅いっぱいに配置される場合と、左右に余白がある場合がある。
// 画像上の縦罫線を検出し、日付列・曜日列・5つのメニュー列の比率に合わせて
// 表の左右端と6本の区切り線を推定する。
function getColumnBounds(canvas: HTMLCanvasElement): number[] {
  const width = canvas.width;
  const height = canvas.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return [0.062, 0.162, 0.201, 0.348, 0.495, 0.643, 0.790, 0.938].map(value => Math.round(value * width));

  const pixels = context.getImageData(0, 0, width, height).data;
  const y0 = Math.round(height * 0.075);
  const y1 = Math.round(height * 0.985);
  const sampleHeight = Math.max(1, y1 - y0);
  const scores = new Float32Array(width);

  for (let x = 0; x < width; x += 1) {
    let dark = 0;
    for (let y = y0; y < y1; y += 1) {
      const index = (y * width + x) * 4;
      const brightness = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
      if (brightness < 155) dark += 1;
    }
    scores[x] = dark / sampleHeight;
  }

  const candidates: Array<{ position: number; strength: number }> = [];
  const minX = Math.round(width * 0.025);
  const maxX = Math.round(width * 0.975);
  let run: number[] = [];
  const flushRun = () => {
    if (!run.length) return;
    let peak = run[0];
    for (const x of run) if (scores[x] > scores[peak]) peak = x;
    if (scores[peak] >= 0.16) candidates.push({ position: peak, strength: scores[peak] });
    run = [];
  };

  for (let x = minX; x <= maxX; x += 1) {
    if (scores[x] >= 0.14) {
      if (run.length && x - run[run.length - 1] > 4) flushRun();
      run.push(x);
    } else {
      flushRun();
    }
  }
  flushRun();

  // 表の列比率（表の左端から）：日付、曜日、創価、ヘルシー、スナック、カレー、麺類
  const internalRatios = [0.115, 0.159, 0.325, 0.492, 0.659, 0.827];
  const edges = [
    { position: 0, strength: 0 },
    ...candidates,
    { position: width, strength: 0 },
  ];
  let best: { bounds: number[]; error: number } | null = null;

  for (const left of edges) {
    for (const right of edges) {
      const span = right.position - left.position;
      if (span < width * 0.70 || span > width * 1.005) continue;
      const used = new Set<number>();
      const matched: number[] = [];
      let totalError = 0;
      let valid = true;

      for (const ratio of internalRatios) {
        const expected = left.position + span * ratio;
        const options = candidates
          .map((candidate, index) => ({ ...candidate, index, distance: Math.abs(candidate.position - expected) }))
          .filter(candidate => candidate.position > left.position + span * 0.025
            && candidate.position < right.position - span * 0.025
            && !used.has(candidate.index)
            && candidate.distance <= span * 0.045)
          .sort((a, b) => (a.distance / span - a.strength * 0.012) - (b.distance / span - b.strength * 0.012));

        const choice = options[0];
        if (!choice) { valid = false; break; }
        used.add(choice.index);
        matched.push(choice.position);
        totalError += choice.distance / span;
      }

      if (!valid) continue;
      const averageError = totalError / internalRatios.length;
      if (!best || averageError < best.error) {
        best = { bounds: [left.position, ...matched, right.position].map(Math.round), error: averageError };
      }
    }
  }

  // 縦罫線を十分に検出できない画像では、従来の余白付き配置を保険として使う。
  if (best && best.error <= 0.025 && best.bounds.every((value, index, all) => index === 0 || value > all[index - 1])) {
    return best.bounds;
  }
  return [0.062, 0.162, 0.201, 0.348, 0.495, 0.643, 0.790, 0.938].map(value => Math.round(value * width));
}

function normalizeDigits(value: string): string {
  return value.replace(/[０-９]/g, character => String.fromCharCode(character.charCodeAt(0) - 0xFEE0)).replace(/\s/g, '');
}

function wordsInRegion(words: OcrWord[], x0: number, x1: number, y0: number, y1: number): OcrWord[] {
  return words.filter(word => {
    const x = (word.bbox.x0 + word.bbox.x1) / 2;
    const y = (word.bbox.y0 + word.bbox.y1) / 2;
    return x >= x0 + 1 && x <= x1 - 1 && y >= y0 + 1 && y <= y1 - 1;
  });
}

function readRegion(words: OcrWord[], x0: number, x1: number, y0: number, y1: number) {
  const selected = wordsInRegion(words, x0, x1, y0, y1);
  if (!selected.length) return { text: '', confidence: 100 };
  const heights = selected.map(word => Math.max(1, word.bbox.y1 - word.bbox.y0)).sort((a, b) => a - b);
  const tolerance = Math.max(4, (heights[Math.floor(heights.length / 2)] || 8) * 0.55);
  const lines: Array<{ y: number; words: OcrWord[] }> = [];
  for (const word of selected.sort((a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2 || a.bbox.x0 - b.bbox.x0)) {
    const y = (word.bbox.y0 + word.bbox.y1) / 2;
    let line = lines.find(candidate => Math.abs(candidate.y - y) <= tolerance);
    if (!line) { line = { y, words: [] }; lines.push(line); }
    line.words.push(word);
    line.y = line.words.reduce((sum, item) => sum + (item.bbox.y0 + item.bbox.y1) / 2, 0) / line.words.length;
  }
  const text = lines.sort((a, b) => a.y - b.y)
    .map(line => line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0).map(word => word.text).join(''))
    .join('');
  const confidence = selected.reduce((sum, word) => sum + (Number.isFinite(word.confidence) ? Number(word.confidence) : 100), 0) / selected.length;
  return { text, confidence };
}

type DateRowBand = { top: number; bottom: number; month: number; day: number; confidence: number };

// 日付欄のOCR文字を行単位でまとめ、日付の中心位置から各行の上下端を推定する。
// 写真で罫線が斜めになり、横罫線を水平線として検出できないケースにも対応する。
function detectDateRowBands(words: OcrWord[], x0: number, x1: number, height: number): DateRowBand[] {
  const selected = wordsInRegion(words, x0, x1, height * 0.055, height * 0.99);
  if (!selected.length) return [];

  const heights = selected.map(word => Math.max(1, word.bbox.y1 - word.bbox.y0)).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 8;
  const tolerance = Math.max(6, medianHeight * 0.85);
  const lines: Array<{ y: number; words: OcrWord[] }> = [];

  for (const word of [...selected].sort((a, b) =>
    (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2 || a.bbox.x0 - b.bbox.x0
  )) {
    const y = (word.bbox.y0 + word.bbox.y1) / 2;
    let line = lines.find(candidate => Math.abs(candidate.y - y) <= tolerance);
    if (!line) {
      line = { y, words: [] };
      lines.push(line);
    }
    line.words.push(word);
    line.y = line.words.reduce((sum, item) => sum + (item.bbox.y0 + item.bbox.y1) / 2, 0) / line.words.length;
  }

  const anchors = lines.map(line => {
    const text = normalizeDigits(line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0).map(word => word.text).join(''))
      .replace(/[晶曰目]/g, '日').replace(/[^0-9月日]/g, '');
    const match = text.match(/(\d{1,2})月(\d{1,2})日/);
    if (!match) return null;
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const confidence = line.words.reduce((sum, word) => sum + (Number.isFinite(word.confidence) ? Number(word.confidence) : 100), 0) / line.words.length;
    return { center: line.y, month, day, confidence };
  }).filter((value): value is { center: number; month: number; day: number; confidence: number } => value !== null)
    .sort((a, b) => a.center - b.center);

  if (!anchors.length) return [];

  return anchors.map((anchor, index) => {
    const previous = anchors[index - 1];
    const next = anchors[index + 1];
    const halfBefore = previous ? (anchor.center - previous.center) / 2 : next ? (next.center - anchor.center) / 2 : medianHeight * 1.8;
    const halfAfter = next ? (next.center - anchor.center) / 2 : previous ? (anchor.center - previous.center) / 2 : medianHeight * 1.8;
    return {
      top: Math.max(height * 0.055, anchor.center - Math.max(halfBefore, medianHeight * 0.9)),
      bottom: Math.min(height * 0.99, anchor.center + Math.max(halfAfter, medianHeight * 0.9)),
      month: anchor.month,
      day: anchor.day,
      confidence: anchor.confidence,
    };
  });
}

function cleanMenuName(value: string): string {
  return value.replace(/おすすめ|大人気|新登場|期間限定|今月のおすすめ/g, '')
    .replace(/[|｜•·]+/g, '').replace(/\s/g, '').trim().slice(0, 100);
}

function createCellOcrCanvas(
  source: HTMLCanvasElement,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): HTMLCanvasElement {
  // 罫線・セルの外側を少し除き、メニュー文字だけを十分な大きさでOCRへ渡す。
  const padX = Math.max(5, Math.round((x1 - x0) * 0.015));
  const padY = Math.max(4, Math.round((y1 - y0) * 0.045));
  const left = Math.max(0, Math.round(x0 + padX));
  const top = Math.max(0, Math.round(y0 + padY));
  const right = Math.min(source.width, Math.round(x1 - padX));
  const bottom = Math.min(source.height, Math.round(y1 - padY));
  const cropWidth = Math.max(1, right - left);
  const cropHeight = Math.max(1, bottom - top);
  const scale = Math.min(2.6, Math.max(2, 1100 / cropWidth));

  const output = document.createElement('canvas');
  output.width = Math.max(1, Math.round(cropWidth * scale));
  output.height = Math.max(1, Math.round(cropHeight * scale));
  const context = output.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('献立セルを画像に変換できませんでした。');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, output.width, output.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, left, top, cropWidth, cropHeight, 0, 0, output.width, output.height);

  // 色付き背景・影の影響を抑え、文字のコントラストを上げる。
  const image = context.getImageData(0, 0, output.width, output.height);
  const pixels = image.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const gray = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    const contrast = Math.max(0, Math.min(255, (gray - 118) * 1.38 + 128));
    const value = Math.round(contrast);
    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return output;
}

async function extractRows(
  canvas: HTMLCanvasElement,
  words: OcrWord[],
  selectedMonth: string,
  worker: OcrWorker,
  onProgress: (completed: number, total: number) => void,
) {
  const columns = getColumnBounds(canvas);
  const dateBands = detectDateRowBands(words, columns[0], columns[1], canvas.height);
  const horizontal = detectLines(canvas, 'horizontal');
  const fallbackBands: Array<[number, number]> = [];
  for (let index = 0; index < horizontal.length - 1; index += 1) {
    const top = horizontal[index], bottom = horizontal[index + 1];
    if (bottom - top >= 15 && bottom - top <= canvas.height * 0.16) fallbackBands.push([top, bottom]);
  }
  const bands: Array<{ top: number; bottom: number; month?: number; day?: number; confidence?: number }> =
    dateBands.length
      ? dateBands
      : fallbackBands.map(([top, bottom]) => ({ top, bottom }));

  const year = Number(selectedMonth.slice(0, 4));
  const targetMonth = Number(selectedMonth.slice(5, 7));
  const rows: CafeteriaMenuImportRow[] = [];
  const detectedMonths: number[] = [];
  let lowConfidence = 0;
  const targetBands = bands.filter(band => {
    const date = readRegion(words, columns[0], columns[1], band.top, band.bottom);
    const match = normalizeDigits(date.text).replace(/[晶曰目]/g, '日').match(/(\d{1,2})月(\d{1,2})日/);
    const month = band.month ?? (match ? Number(match[1]) : 0);
    if (month >= 1 && month <= 12) detectedMonths.push(month);
    return month === targetMonth;
  });

  // 全ページOCRは日付と行位置の検出にだけ使う。
  // 献立名は1セルずつ拡大・補正し、複数列を混ぜずに認識させる。
  await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
  for (let rowIndex = 0; rowIndex < targetBands.length; rowIndex += 1) {
    const band = targetBands[rowIndex];
    const { top, bottom } = band;
    const date = readRegion(words, columns[0], columns[1], top, bottom);
    const dateMatch = normalizeDigits(date.text).replace(/[晶曰目]/g, '日').match(/(\d{1,2})月(\d{1,2})日/);
    const month = band.month ?? (dateMatch ? Number(dateMatch[1]) : 0);
    const day = band.day ?? (dateMatch ? Number(dateMatch[2]) : 0);
    if (month !== targetMonth || day < 1 || day > 31) {
      onProgress(rowIndex + 1, targetBands.length);
      continue;
    }

    const allMenus = readRegion(words, columns[2], columns[7], top, bottom);
    const normalizedMenus = normalizeDigits(allMenus.text);
    const isClosed = /営業はありません|営業しておりません|休業/.test(normalizedMenus);
    const isSpecialMenu = /特別メニュー/.test(normalizedMenus);
    const values: string[] = [];

    if (!isClosed && !isSpecialMenu) {
      for (let columnIndex = 0; columnIndex < 5; columnIndex += 1) {
        const cellCanvas = createCellOcrCanvas(
          canvas,
          columns[columnIndex + 2],
          columns[columnIndex + 3],
          top,
          bottom,
        );
        const result = await worker.recognize(cellCanvas);
        const rawText = typeof result.data.text === 'string' ? result.data.text : '';
        const text = cleanMenuName(rawText);
        const confidence = Number.isFinite(result.data.confidence) ? Number(result.data.confidence) : 0;

        // 低信頼の文字列はそのまま献立として採用せず、空欄にして手修正を促す。
        if (text && confidence >= 50) {
          values.push(text);
        } else {
          values.push('');
          if (text) lowConfidence += 1;
        }
      }
      if (values.every(value => !value)) lowConfidence += 1;
    } else {
      values.push('', '', '', '', '');
      if (isSpecialMenu) lowConfidence += 1;
    }

    const dateConfidence = band.confidence ?? date.confidence;
    if (dateConfidence < 45) lowConfidence += 1;

    rows.push({
      service_date: String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'),
      soka_lunch: isClosed || isSpecialMenu ? (isSpecialMenu ? '特別メニュー' : '') : values[0],
      healthy_lunch: isClosed || isSpecialMenu ? '' : values[1],
      snack_lunch: isClosed || isSpecialMenu ? '' : values[2],
      curry: isClosed || isSpecialMenu ? '' : values[3],
      noodles: isClosed || isSpecialMenu ? '' : values[4],
      is_closed: isClosed,
    });

    onProgress(rowIndex + 1, targetBands.length);
  }

  const unique = new Map<string, CafeteriaMenuImportRow>();
  for (const row of rows) unique.set(row.service_date, row);
  return {
    rows: [...unique.values()].sort((a, b) => a.service_date.localeCompare(b.service_date)),
    detectedMonths,
    lowConfidence,
  };
}

const MENU_FIELDS = [
  { key: 'soka_lunch', label: '創価ランチ' },
  { key: 'healthy_lunch', label: 'ヘルシーランチ' },
  { key: 'snack_lunch', label: 'スナックランチ' },
  { key: 'curry', label: 'カレー' },
  { key: 'noodles', label: '麺類' },
] as const;

export default function CafeteriaMenuImport({ selectedMonth, onApply }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<CafeteriaMenuImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [applied, setApplied] = useState(false);

  const updateRow = (index: number, patch: Partial<CafeteriaMenuImportRow>) => {
    setRows(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
    setApplied(false);
  };

  const handleAnalyze = async () => {
    if (!file) { setError('PDFまたは写真を選択してください。'); return; }
    if (!/^\d{4}-\d{2}$/.test(selectedMonth)) { setError('先に対象年月を選択してください。'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('ファイルは15MB以内にしてください。'); return; }
    if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) { setError('PDF・画像ファイルを選択してください。'); return; }

    setLoading(true); setRows([]); setError(''); setWarning(''); setApplied(false);
    let worker: OcrWorker | null = null;
    try {
      setProgress('読み取り機能を準備しています...');
      await loadOcrLibraries();
      const canvases = file.type === 'application/pdf' ? await createPdfCanvases(file) : [await createImageCanvas(file)];
      if (!canvases.length) throw new Error('画像ページがありません。');

      setProgress('日本語OCRを準備しています（初回は辞書の取得が必要です）...');
      worker = await window.Tesseract!.createWorker('jpn', 1, {
        workerPath: TESSERACT_WORKER_URL,
        corePath: TESSERACT_CORE_URL,
        langPath: JAPANESE_DATA_URL,
        logger: message => {
          if (message.status === 'recognizing text') setProgress('日本語を読み取り中... ' + Math.round((message.progress || 0) * 100) + '%');
        },
      });
      const extracted: CafeteriaMenuImportRow[] = [];
      const detectedMonths: number[] = [];
      let lowConfidence = 0;
      for (let index = 0; index < canvases.length; index += 1) {
        setProgress('日付と表の位置を検出中... ' + (index + 1) + '/' + canvases.length + 'ページ');
        await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' });
        const result = await worker.recognize(canvases[index]);
        const page = await extractRows(
          canvases[index],
          result.data.words || [],
          selectedMonth,
          worker,
          (completed, total) => setProgress('献立名をセルごとに高解像度で読み取り中... ' + completed + '/' + total + '日分'),
        );
        extracted.push(...page.rows); detectedMonths.push(...page.detectedMonths); lowConfidence += page.lowConfidence;
      }
      const unique = new Map<string, CafeteriaMenuImportRow>();
      for (const row of extracted) unique.set(row.service_date, row);
      const finalRows = [...unique.values()].sort((a, b) => a.service_date.localeCompare(b.service_date));
      if (!finalRows.length) {
        const months = [...new Set(detectedMonths)].map(month => month + '月').join('・');
        if (months && !months.includes(Number(selectedMonth.slice(5, 7)) + '月')) {
          throw new Error('PDF・写真から' + months + 'の日付を検出しました。対象年月を合わせてから再度読み取ってください。');
        }
        throw new Error('日付欄を読み取れませんでした。日付の列がはっきり写っているか確認してください。罫線が斜めでも、日付の文字が読めれば自動で行を検出できます。');
      }
      setRows(finalRows);
      setWarning(lowConfidence > 0
        ? '読み取りに自信がない箇所が' + lowConfidence + '件あります。空欄や文字を確認・修正してください。'
        : '読み取り結果を確認してください。表に載っていない日付は変更されません。');
      setProgress(finalRows.length + '日分を読み取りました。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '読み取りに失敗しました。');
      setProgress('');
    } finally {
      if (worker) await worker.terminate().catch(() => undefined);
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-cyan-500/25 bg-slate-950/70 p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-300"><ScanText size={21} /></div>
        <div className="min-w-0 flex-1">
          <h3 className="font-black text-white">PDF・写真から献立を自動入力</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">月間献立表を選ぶと、日付を検出した後、5区分の各セルを拡大して個別に読み取ります。確認・修正してから月間表へ反映できます。</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-xs font-bold text-slate-300">
          献立表ファイル（PDF・写真／15MB以内）
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={event => { setFile(event.target.files?.[0] || null); setRows([]); setError(''); setWarning(''); setApplied(false); }}
            className="mt-2 block w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
          />
          {file && <span className="mt-1 block truncate text-[11px] font-normal text-slate-500">{file.name}</span>}
        </label>
        <button type="button" onClick={handleAnalyze} disabled={!file || loading} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-5 py-3 text-xs font-black text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <ScanText size={15} />}
          {loading ? '読み取り中...' : '自動読み取り'}
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">ファイルはこのブラウザ内で処理され、CampusSyncやSupabaseにはアップロード・保存されません。初回のみ日本語OCR用データを外部配信元から取得します。</p>
      {progress && <div className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs text-cyan-200">{loading && <Loader2 size={14} className="animate-spin" />}{progress}</div>}
      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs leading-relaxed text-red-300"><AlertCircle size={15} className="mt-0.5 shrink-0" />{error}</div>}
      {warning && rows.length > 0 && <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-200"><AlertCircle size={15} className="mt-0.5 shrink-0" />{warning}</div>}
      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-black text-white">読み取り結果の確認</p>
              <p className="mt-1 text-[11px] text-slate-400">{rows.length}日分・{rows.filter(row => row.is_closed).length}日休業。必要な箇所はその場で修正できます。</p>
            </div>
            <button type="button" onClick={() => { setRows([]); setWarning(''); setApplied(false); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-2 text-[11px] font-bold text-slate-400 hover:text-white"><X size={13} />閉じる</button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="min-w-[1120px] w-full border-collapse text-left">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="text-[11px] text-slate-300">
                  <th className="w-32 border-b border-slate-800 px-3 py-3">日付</th>
                  {MENU_FIELDS.map(field => <th key={field.key} className="min-w-48 border-b border-slate-800 px-3 py-3">{field.label}</th>)}
                  <th className="w-24 border-b border-slate-800 px-3 py-3">営業</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.service_date + '-' + index} className="border-b border-slate-800/80 align-top">
                    <td className="px-2 py-2">
                      <input type="date" value={row.service_date} min={selectedMonth + '-01'} max={selectedMonth + '-31'} onChange={event => updateRow(index, { service_date: event.target.value })} className="w-32 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-[11px] text-white" aria-label="献立日付" />
                    </td>
                    {MENU_FIELDS.map(field => (
                      <td key={field.key} className="px-2 py-2">
                        <input type="text" value={row[field.key]} disabled={row.is_closed} onChange={event => updateRow(index, { [field.key]: event.target.value } as Partial<CafeteriaMenuImportRow>)} placeholder="読み取れなかった場合は入力" aria-label={row.service_date + ' ' + field.label} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white placeholder:text-slate-600 disabled:opacity-40" />
                      </td>
                    ))}
                    <td className="px-3 py-2"><label className="flex items-center gap-2 text-[11px] font-bold text-slate-300"><input type="checkbox" checked={row.is_closed} onChange={event => updateRow(index, { is_closed: event.target.checked })} />休業</label></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">反映後も、月間献立表の一括保存を押すまではデータベースに保存されません。</p>
            <button
              type="button"
              onClick={() => {
                const validRows = rows.filter(row => row.service_date.startsWith(selectedMonth + '-'));
                if (!validRows.length) { setError('対象年月に一致する日付がありません。日付を確認してください。'); return; }
                onApply(validRows); setApplied(true); setError('');
              }}
              disabled={applied || rows.some(row => !row.service_date.startsWith(selectedMonth + '-'))}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applied ? <CheckCircle2 size={15} /> : <Plus size={15} />}
              {applied ? '月間表に反映済み' : '確認した献立を月間表に反映'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
