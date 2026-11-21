import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const questions = JSON.parse(readFileSync(
  new URL('../data/math-question-bank-2026-11.json', import.meta.url),
  'utf8',
));
const numericQuestions = questions.filter((question) => question.question_type === 'numeric');
const coefficient = (value) => value === '' ? 1 : Number(value);

function expectedAnswer(question) {
  const p = question.prompt;
  let match;

  if ((match = p.match(/\(x \+ (\d+)\)\(x \+ (\d+)\)/))) {
    return Number(match[1]) + Number(match[2]);
  }
  if ((match = p.match(/(\d+)x \+ (\d+) = (-?\d+)/))) {
    return (Number(match[3]) - Number(match[2])) / Number(match[1]);
  }
  if ((match = p.match(/f\(x\)=x²\s*−\s*(\d+)x\s*\+\s*(\d+)/))) {
    const halfCoefficient = Number(match[1]) / 2;
    return Number(match[2]) - halfCoefficient ** 2;
  }
  if ((match = p.match(/記録が ([\d、]+) である/))) {
    const values = match[1].split('、').map(Number);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  if ((match = p.match(/(\d+)人から異なる3人/))) {
    const n = Number(match[1]);
    return n * (n - 1) * (n - 2);
  }
  if ((match = p.match(/(\d+)個の異なる品物から (\d+) 個/))) {
    const n = Number(match[1]);
    const r = Number(match[2]);
    let numerator = 1;
    let denominator = 1;
    for (let i = 0; i < r; i += 1) {
      numerator *= n - i;
      denominator *= i + 1;
    }
    return numerator / denominator;
  }
  if ((match = p.match(/(\d+) と (\d+) の最大公約数/))) {
    let a = Number(match[1]);
    let b = Number(match[2]);
    while (b !== 0) [a, b] = [b, a % b];
    return a;
  }
  if ((match = p.match(/整数 (\d+)² \+ (\d+)×(\d+) \+ (\d+) を (\d+) で割った/))) {
    return (Number(match[1]) ** 2 + Number(match[2]) * Number(match[3]) + Number(match[4])) % Number(match[5]);
  }
  if ((match = p.match(/外角が (\d+)°、頂点Aの内角が (\d+)°/))) {
    return Number(match[1]) - Number(match[2]);
  }
  if ((match = p.match(/初項 (\d+)、公差 (\d+) の等差数列について、第(\d+)項/))) {
    return Number(match[1]) + (Number(match[3]) - 1) * Number(match[2]);
  }
  if ((match = p.match(/初項 (\d+)、公差 (\d+) の等差数列の初項から第(\d+)項/))) {
    const a = Number(match[1]);
    const d = Number(match[2]);
    const n = Number(match[3]);
    return n * (2 * a + (n - 1) * d) / 2;
  }
  if ((match = p.match(/初項 (\d+)、公比 (\d+) の等比数列について、第(\d+)項/))) {
    return Number(match[1]) * Number(match[2]) ** (Number(match[3]) - 1);
  }
  if ((match = p.match(/初項 (\d+)、公比 (\d+) の等比数列の初項から第(\d+)項/))) {
    const a = Number(match[1]);
    const r = Number(match[2]);
    const n = Number(match[3]);
    return a * (r ** n - 1) / (r - 1);
  }
  if ((match = p.match(/a₁=(\d+)、a₂=(\d+)、aₙ₊₂=aₙ₊₁\+aₙ を満たすとき、a(\d+)/))) {
    let previous = Number(match[1]);
    let current = Number(match[2]);
    const n = Number(match[3]);
    for (let i = 3; i <= n; i += 1) {
      [previous, current] = [current, previous + current];
    }
    return n === 1 ? Number(match[1]) : n === 2 ? Number(match[2]) : current;
  }
  if ((match = p.match(/成功確率 ([0-9.]+) の独立な試行を (\d+) 回/))) {
    return Number(match[1]) * Number(match[2]);
  }
  if ((match = p.match(/成功確率 1\/2 の独立な試行を (\d+) 回/))) {
    return Number(match[1]) / 4;
  }
  if ((match = p.match(/基本料金 (\d+) 円に、.*?につき (\d+) 円.*?が (\d+)(?:回|時間|個)/))) {
    return Number(match[1]) + Number(match[2]) * Number(match[3]);
  }
  if ((match = p.match(/f\(x\)=x³\+(\d*)x²\+(\d*)x\+(\d+) を x−(\d+) で割った余り/))) {
    const a = coefficient(match[1]);
    const b = coefficient(match[2]);
    const c = Number(match[3]);
    const x = Number(match[4]);
    return x ** 3 + a * x ** 2 + b * x + c;
  }
  if ((match = p.match(/A\((-?\d+), (-?\d+)\)、B\((-?\d+), (-?\d+)\)/))) {
    return (Number(match[4]) - Number(match[2])) / (Number(match[3]) - Number(match[1]));
  }
  if ((match = p.match(/= (\d+) の半径/))) {
    return Math.sqrt(Number(match[1]));
  }
  if ((match = p.match(/(\d+)\^\(x \+ (\d+)\) = (\d+)\^(\d+)/))) {
    assert.equal(Number(match[1]), Number(match[3]), 'same-base equation');
    return Number(match[4]) - Number(match[2]);
  }
  if ((match = p.match(/log_(\d+) x = (\d+)/))) {
    return Number(match[1]) ** Number(match[2]);
  }
  if ((match = p.match(/f\(x\)=x³\+(\d*)x²\+(\d*)x とする。f'\((\d+)\)/))) {
    const a = coefficient(match[1]);
    const b = coefficient(match[2]);
    const x = Number(match[3]);
    return 3 * x ** 2 + 2 * a * x + b;
  }
  if ((match = p.match(/lim\(x→(\d+)\) \(x² − (\d+)\)\/\(x − (\d+)\)/))) {
    return 2 * Number(match[1]);
  }
  if ((match = p.match(/f\(x\)=x⁴\+(\d*)x³\+(\d*)x²\+(\d*)x とする。f'\((\d+)\)/))) {
    const a = coefficient(match[1]);
    const b = coefficient(match[2]);
    const c = coefficient(match[3]);
    const x = Number(match[4]);
    return 4 * x ** 3 + 3 * a * x ** 2 + 2 * b * x + c;
  }
  if ((match = p.match(/曲線 y=x²\+(\d*)x\+(\d+) 上の x=(\d+)/))) {
    return 2 * Number(match[3]) + coefficient(match[1]);
  }
  if ((match = p.match(/∫\[0, (\d+)\] (\d*)x dx/))) {
    return coefficient(match[2]) * Number(match[1]) ** 2 / 2;
  }
  if ((match = p.match(/曲線 y=(\d+)x と y=x².*?0≤x≤(\d+) の面積/))) {
    assert.equal(Number(match[1]), Number(match[2]), 'intersection and interval match');
    return Number(match[1]) ** 3 / 6;
  }
  if ((match = p.match(/f\(x\)=(\d+)sin x とする。x=π\/3/))) {
    return Number(match[1]) / 2;
  }
  if ((match = p.match(/f\(x\)=ln x \+ (\d*)x とする。f'\(1\)/))) {
    return coefficient(match[1]) + 1;
  }
  if ((match = p.match(/ベクトル a=\( (\d+), (\d+) \)、b=\( (\d+), (\d+) \)/))) {
    return Number(match[1]) * Number(match[3]) + Number(match[2]) * Number(match[4]);
  }
  if ((match = p.match(/ベクトル a=\( (\d+), (\d+) \) の大きさ/))) {
    return Math.hypot(Number(match[1]), Number(match[2]));
  }
  if ((match = p.match(/B\((\d+)\) を AP:PB=(\d+):(\d+)/))) {
    return Number(match[1]) * Number(match[2]) / (Number(match[2]) + Number(match[3]));
  }
  if ((match = p.match(/楕円 x²\/(\d+) \+ y²\/(\d+) = 1/))) {
    return 2 * Math.sqrt(Number(match[1]));
  }
  if ((match = p.match(/放物線 y²=(\d+)x/))) {
    return Number(match[1]) / 4;
  }
  if ((match = p.match(/複素数 \((\d+)\+(\d*)i\) と \((\d+)\+(\d*)i\)/))) {
    return Number(match[1]) * coefficient(match[4]) + coefficient(match[2]) * Number(match[3]);
  }
  if ((match = p.match(/複素数 z=(\d+)\+(\d*)i の絶対値/))) {
    return Math.hypot(Number(match[1]), coefficient(match[2]));
  }

  throw new Error('No independent checker for: ' + question.title + ' / ' + p);
}

test('all 855 numeric answer keys match an independent calculation from the prompt', () => {
  assert.equal(numericQuestions.length, 855);
  for (const question of numericQuestions) {
    const expected = expectedAnswer(question);
    const actual = Number(question.correct_answer);
    assert.ok(Number.isFinite(expected), 'finite expected answer: ' + question.title);
    assert.ok(Math.abs(actual - expected) <= 1e-8,
      question.title + ': expected ' + expected + ', got ' + actual);
  }
});
