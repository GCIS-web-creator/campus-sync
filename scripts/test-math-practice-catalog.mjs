import test from 'node:test';
import assert from 'node:assert/strict';
import { filterMathPracticeQuestions, paginateMathPracticeQuestions } from '../lib/math-practice-catalog.ts';

const sample = [
  { id: 'q1', title: '二次関数の最大値', prompt: '放物線の頂点を求めよ', subject: '数学I', unit: '二次関数', difficulty: 'basic' },
  { id: 'q2', title: '三角比の応用', prompt: '正弦定理を用いて辺の長さを求めよ', subject: '数学I', unit: '図形と計量', difficulty: 'normal' },
  { id: 'q3', title: '微分の応用', prompt: '関数の増減を調べよ', subject: '数学III', unit: '微分法', difficulty: 'challenge' },
];

test('検索語から問題タイトル・本文・単元・科目で任意の問題を探せる', () => {
  assert.deepEqual(filterMathPracticeQuestions(sample, '二次関数').map(q => q.id), ['q1']);
  assert.deepEqual(filterMathPracticeQuestions(sample, '正弦定理').map(q => q.id), ['q2']);
  assert.deepEqual(filterMathPracticeQuestions(sample, '数学III').map(q => q.id), ['q3']);
});

test('難易度フィルターと検索語を同時に適用できる', () => {
  assert.deepEqual(filterMathPracticeQuestions(sample, '', 'challenge').map(q => q.id), ['q3']);
  assert.deepEqual(filterMathPracticeQuestions(sample, '微分', 'basic'), []);
});

test('空検索では範囲内の問題をすべて残す', () => {
  assert.equal(filterMathPracticeQuestions(sample, '').length, 3);
});

test('一覧ページ送りは範囲内に制限され、開始・終了位置を返す', () => {
  const many = Array.from({ length: 65 }, (_, index) => ({ id: String(index + 1) }));
  const second = paginateMathPracticeQuestions(many, 2, 30);
  assert.equal(second.page, 2);
  assert.equal(second.pageCount, 3);
  assert.equal(second.start, 30);
  assert.equal(second.end, 60);
  assert.equal(second.items.length, 30);
  const last = paginateMathPracticeQuestions(many, 99, 30);
  assert.equal(last.page, 3);
  assert.equal(last.items.length, 5);
});
