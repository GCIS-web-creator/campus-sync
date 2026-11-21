import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const questions = JSON.parse(readFileSync(
  new URL('../data/math-question-bank-2026-11.json', import.meta.url),
  'utf8',
));
const choiceQuestions = questions.filter((question) => question.question_type === 'multiple_choice');
const gcd = (a, b) => {
  while (b !== 0) [a, b] = [b, a % b];
  return Math.abs(a) || 1;
};
const fraction = (numerator, denominator) => {
  const divisor = gcd(numerator, denominator);
  const n = numerator / divisor;
  const d = denominator / divisor;
  return d === 1 ? String(n) : n + '/' + d;
};
const correctText = (question) => {
  const option = question.options.find((item) => item.id === question.correct_option_id);
  assert.ok(option, 'correct option exists for ' + question.title);
  return option.text;
};

test('all 225 multiple-choice answer keys match the mathematical condition in their prompts', () => {
  assert.equal(choiceQuestions.length, 225);
  for (const question of choiceQuestions) {
    const prompt = question.prompt;
    const answer = correctText(question);
    let match;

    if ((match = prompt.match(/x² \+ (\d+)x \+ (\d+)/))) {
      const factors = answer.match(/^\(x \+ (\d+)\)\(x \+ (\d+)\)$/);
      assert.ok(factors, question.title);
      assert.equal(Number(factors[1]) + Number(factors[2]), Number(match[1]), question.title);
      assert.equal(Number(factors[1]) * Number(factors[2]), Number(match[2]), question.title);
      continue;
    }

    if ((match = prompt.match(/二次方程式 x²(.*) = 0/))) {
      const linear = match[1].match(/([+−])\s*(\d*)x/);
      const linearCoefficient = linear
        ? (linear[1] === '+' ? 1 : -1) * (linear[2] === '' ? 1 : Number(linear[2]))
        : 0;
      const constant = match[1].match(/([+−])\s*(\d+)$/);
      const constantTerm = constant
        ? (constant[1] === '+' ? 1 : -1) * Number(constant[2])
        : 0;
      const roots = [...answer.matchAll(/x = (-?\d+)/g)].map((item) => Number(item[1]));
      assert.equal(roots.length, 2, question.title);
      assert.equal(roots[0] + roots[1], -linearCoefficient, question.title);
      assert.equal(roots[0] * roots[1], constantTerm, question.title);
      continue;
    }

    if ((match = prompt.match(/二次式 x²(?: ([+−]) (\d+)x)? \+ (\d+)/))) {
      const coefficient = match[1]
        ? (match[1] === '+' ? 1 : -1) * Number(match[2])
        : 0;
      const constant = Number(match[3]);
      const h = -coefficient / 2;
      const minimum = constant - h ** 2;
      const square = h === 0
        ? 'x²'
        : '(x ' + (h > 0 ? '− ' : '+ ') + Math.abs(h) + ')²';
      const expected = square + (minimum >= 0 ? ' + ' : ' − ') + Math.abs(minimum);
      assert.equal(answer, expected, question.title);
      continue;
    }

    if ((match = prompt.match(/対辺が (\d+)、斜辺が (\d+)/))) {
      assert.equal(answer, fraction(Number(match[1]), Number(match[2])), question.title);
      continue;
    }

    if ((match = prompt.match(/1から (\d+) まで.*?が (\d+) の倍数/))) {
      assert.equal(answer, fraction(Math.floor(Number(match[1]) / Number(match[2])), Number(match[1])), question.title);
      continue;
    }

    if ((match = prompt.match(/赤玉 (\d+) 個、青玉 (\d+) 個/))) {
      const red = Number(match[1]);
      const total = red + Number(match[2]);
      assert.equal(answer, fraction(red * (red - 1), total * (total - 1)), question.title);
      continue;
    }

    if ((match = prompt.match(/正 (\d+) 角形の1つの外角/))) {
      assert.equal(answer, fraction(360, Number(match[1])) + '°', question.title);
      continue;
    }

    if ((match = prompt.match(/sin θ = sin\(π\/(\d+)\)/))) {
      const n = Number(match[1]);
      assert.equal(answer, 'θ = π/' + n + ' または θ = ' + (n - 1) + 'π/' + n, question.title);
      continue;
    }

    if (question.subject_code === 'mathc' && question.title.includes('ド・モアブル')) {
      assert.equal(answer, '1', question.title);
      continue;
    }

    assert.fail('No independent choice checker for ' + question.title);
  }
});
