// 自作の小型GPT(文字単位)の推論をTypeScriptだけで行う。PyTorch/Python/外部APIは使わない。
// 重みは weights/campus_ai.bin(Float32連結)と weights/campus_ai.json(設定・語彙・各テンソルの位置)。
// 計算は ai/model.py と同じ。KVキャッシュを使い、1文字ずつ貪欲(argmax)に生成する。
import fs from 'node:fs';
import path from 'node:path';

const PAD = 0, BOS = 1, EOS = 2, UNK = 3;

type Meta = {
  cfg: { vocab_size: number; block_size: number; d: number; layers: number; heads: number };
  itos: string[];
  tensors: Record<string, { offset: number; shape: number[] }>;
  floats: number;
};

type Layer = {
  ln1g: Float32Array; ln1b: Float32Array; ln2g: Float32Array; ln2b: Float32Array;
  qkvW: Float32Array; qkvB: Float32Array; projW: Float32Array; projB: Float32Array;
  fc1W: Float32Array; fc1B: Float32Array; fc2W: Float32Array; fc2B: Float32Array;
};

export type Model = {
  meta: Meta; stoi: Map<string, number>;
  tok: Float32Array; pos: Float32Array; lnG: Float32Array; lnB: Float32Array; layers: Layer[];
};

let cached: Model | null = null;

export function loadModel(): Model {
  if (cached) return cached;
  // next.config.ts の outputFileTracingIncludes で、このフォルダがサーバーレス関数に同梱される
  const dir = path.join(process.cwd(), 'lib', 'campus-ai', 'weights');
  const meta: Meta = JSON.parse(fs.readFileSync(path.join(dir, 'campus_ai.json'), 'utf8'));
  const raw = fs.readFileSync(path.join(dir, 'campus_ai.bin'));
  // Bufferのプールで4バイト境界から外れていることがあるのでコピーして読む(リトルエンディアン前提)
  const all = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  if (all.length !== meta.floats) throw new Error(`weights size mismatch: ${all.length} != ${meta.floats}`);
  const t = (name: string) => {
    const m = meta.tensors[name];
    if (!m) throw new Error(`missing tensor ${name}`);
    return all.subarray(m.offset, m.offset + m.shape.reduce((a, b) => a * b, 1));
  };
  const layers: Layer[] = [];
  for (let l = 0; l < meta.cfg.layers; l++) {
    const p = `blocks.${l}.`;
    layers.push({
      ln1g: t(p + 'ln1.weight'), ln1b: t(p + 'ln1.bias'), ln2g: t(p + 'ln2.weight'), ln2b: t(p + 'ln2.bias'),
      qkvW: t(p + 'qkv.weight'), qkvB: t(p + 'qkv.bias'), projW: t(p + 'proj.weight'), projB: t(p + 'proj.bias'),
      fc1W: t(p + 'mlp.0.weight'), fc1B: t(p + 'mlp.0.bias'), fc2W: t(p + 'mlp.2.weight'), fc2B: t(p + 'mlp.2.bias'),
    });
  }
  cached = {
    meta, stoi: new Map(meta.itos.map((c, i) => [c, i])),
    tok: t('tok.weight'), pos: t('pos.weight'), lnG: t('ln.weight'), lnB: t('ln.bias'), layers,
  };
  return cached;
}

// erf の高精度近似(Numerical Recipes の erfc、相対誤差 約1.2e-7)。GELU(厳密版)用
function erf(x: number): number {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? 1 - r : r - 1;
}
const gelu = (x: number) => 0.5 * x * (1 + erf(x * Math.SQRT1_2));

function layerNorm(x: Float32Array, g: Float32Array, b: Float32Array, out: Float32Array) {
  const n = x.length; let m = 0, v = 0;
  for (let i = 0; i < n; i++) m += x[i];
  m /= n;
  for (let i = 0; i < n; i++) { const d = x[i] - m; v += d * d; }
  const inv = 1 / Math.sqrt(v / n + 1e-5);
  for (let i = 0; i < n; i++) out[i] = (x[i] - m) * inv * g[i] + b[i];
}

// out = W(rows×cols) · x + b   (W は PyTorch の Linear と同じ [出力, 入力] の並び)
function matvec(W: Float32Array, b: Float32Array | null, x: Float32Array, rows: number, cols: number, out: Float32Array) {
  for (let r = 0, o = 0; r < rows; r++, o += cols) {
    let s = b ? b[r] : 0;
    for (let c = 0; c < cols; c++) s += W[o + c] * x[c];
    out[r] = s;
  }
}

export class Session {
  private n = 0; // これまでに入れた文字数
  private K: Float32Array[]; private V: Float32Array[];
  private x: Float32Array; private h: Float32Array; private qkv: Float32Array; private att: Float32Array;
  private y: Float32Array; private f: Float32Array; private sc: Float32Array;
  constructor(private m: Model) {
    const { d, block_size, layers } = m.meta.cfg;
    this.K = Array.from({ length: layers }, () => new Float32Array(block_size * d));
    this.V = Array.from({ length: layers }, () => new Float32Array(block_size * d));
    this.x = new Float32Array(d); this.h = new Float32Array(d); this.qkv = new Float32Array(3 * d);
    this.att = new Float32Array(d); this.y = new Float32Array(d); this.f = new Float32Array(4 * d);
    this.sc = new Float32Array(block_size);
  }
  get length() { return this.n; }

  // 1文字(トークンID)を入れて、次の文字のlogitsを返す(wantLogits=false なら出力層を省略)
  step(id: number, wantLogits = true): Float32Array | null {
    const { d, heads, layers, vocab_size, block_size } = this.m.meta.cfg;
    const pos = this.n;
    if (pos >= block_size) throw new Error('context full');
    const hd = d / heads, scale = 1 / Math.sqrt(hd);
    const { x, h, qkv, att, y, f, sc } = this;
    for (let i = 0; i < d; i++) x[i] = this.m.tok[id * d + i] + this.m.pos[pos * d + i];
    for (let l = 0; l < layers; l++) {
      const L = this.m.layers[l], K = this.K[l], V = this.V[l];
      layerNorm(x, L.ln1g, L.ln1b, h);
      matvec(L.qkvW, L.qkvB, h, 3 * d, d, qkv);
      K.set(qkv.subarray(d, 2 * d), pos * d); V.set(qkv.subarray(2 * d, 3 * d), pos * d);
      for (let hh = 0; hh < heads; hh++) {
        const o = hh * hd; let mx = -Infinity;
        for (let t = 0; t <= pos; t++) {
          let s = 0;
          for (let i = 0; i < hd; i++) s += qkv[o + i] * K[t * d + o + i];
          sc[t] = s * scale; if (sc[t] > mx) mx = sc[t];
        }
        let sum = 0;
        for (let t = 0; t <= pos; t++) { sc[t] = Math.exp(sc[t] - mx); sum += sc[t]; }
        for (let i = 0; i < hd; i++) {
          let s = 0;
          for (let t = 0; t <= pos; t++) s += sc[t] * V[t * d + o + i];
          att[o + i] = s / sum;
        }
      }
      matvec(L.projW, L.projB, att, d, d, y);
      for (let i = 0; i < d; i++) x[i] += y[i];
      layerNorm(x, L.ln2g, L.ln2b, h);
      matvec(L.fc1W, L.fc1B, h, 4 * d, d, f);
      for (let i = 0; i < 4 * d; i++) f[i] = gelu(f[i]);
      matvec(L.fc2W, L.fc2B, f, d, 4 * d, y);
      for (let i = 0; i < d; i++) x[i] += y[i];
    }
    this.n++;
    if (!wantLogits) return null;
    layerNorm(x, this.m.lnG, this.m.lnB, h);
    const logits = new Float32Array(vocab_size);
    matvec(this.m.tok, null, h, vocab_size, d, logits); // 出力層は埋め込みと重み共有
    return logits;
  }
}

export function encode(m: Model, s: string): number[] {
  return Array.from(s, c => m.stoi.get(c) ?? UNK); // 未知文字は <unk>
}
export function decode(m: Model, ids: number[]): string {
  return ids.filter(i => i > UNK).map(i => m.meta.itos[i]).join('');
}

// プロンプトの続きを貪欲に生成(EOSか最大文字数で停止)。Python版の temperature=0.1 のほぼ決定的な動作に相当
export function generate(m: Model, prompt: string, maxNew = 110): { text: string; logits0: Float32Array } {
  const s = new Session(m);
  const ids = [BOS, ...encode(m, prompt)];
  let logits: Float32Array | null = null;
  ids.forEach((id, i) => { logits = s.step(id, i === ids.length - 1); });
  const first = logits as unknown as Float32Array;
  const out: number[] = [];
  for (let k = 0; k < maxNew; k++) {
    const lg = logits as unknown as Float32Array;
    let best = 0;
    for (let i = 1; i < lg.length; i++) if (lg[i] > lg[best]) best = i;
    if (best === EOS) break;
    out.push(best);
    if (s.length >= m.meta.cfg.block_size) break; // 文脈の上限(通常の質問では到達しない)
    logits = s.step(best);
  }
  return { text: decode(m, out), logits0: first };
}

export { PAD, BOS, EOS, UNK };
