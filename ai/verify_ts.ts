import fs from 'node:fs';
import { generate, loadModel } from '../lib/campus-ai/model';
const cases = JSON.parse(fs.readFileSync('ai/cases.json', 'utf8'));
const m = loadModel();
let same = 0, maxd = 0, tmax = 0, ttot = 0;
const out: any[] = [];
for (const c of cases) {
  const t0 = performance.now();
  const { text, logits0 } = generate(m, c.prompt);
  const dt = performance.now() - t0; ttot += dt; tmax = Math.max(tmax, dt);
  if (text === c.py) same++; else console.log('DIFF', JSON.stringify(c.prompt), '\n py:', c.py, '\n ts:', text);
  if (c.logits_last) for (let i = 0; i < logits0.length; i++) maxd = Math.max(maxd, Math.abs(logits0[i] - c.logits_last[i]));
  out.push({ ...c, gen: text });
}
console.log(`生成文が numpy参照と一致: ${same}/${cases.length}`);
console.log(`logits最大絶対誤差(25件): ${maxd.toExponential(2)}`);
console.log(`1回の生成: 平均 ${(ttot / cases.length).toFixed(1)}ms / 最大 ${tmax.toFixed(1)}ms (初回ロード除く前のウォームアップなし)`);
fs.writeFileSync('ai/ts_out.json', JSON.stringify(out));
