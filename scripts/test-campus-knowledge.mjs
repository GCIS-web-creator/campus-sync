import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateKnowledgeAttempt,
  validateKnowledgeQuestion,
} from '../lib/campus-knowledge-validation.ts';

const validQuestion = {
  subject: '数学III',
  subject_code: 'math3',
  unit: '微分法',
  title: '微分の基本',
  prompt: '関数 f(x)=x^2 の導関数として正しいものを選びなさい。',
  question_type: 'multiple_choice',
  options: [
    { id: 'a', text: 'x' },
    { id: 'b', text: '2x' },
    { id: 'c', text: 'x^2' },
    { id: 'd', text: '2' },
  ],
  correct_option_id: 'b',
  correct_answer: null,
  answer_tolerance: 0,
  explanation: 'べき乗の微分公式より、(x^2)\' = 2x です。',
  difficulty: 'normal',
  target_class: 'all',
  status: 'published',
  source_name: 'CampusSyncオリジナル',
};

const questionId = '9a8e27d2-61c7-4a4a-9a8e-98c80d1d1c21';
const attemptId = '5a8e27d2-61c7-4a4a-9a8e-98c80d1d1c21';

test('accepts a valid multiple-choice knowledge question', () => {
  const result = validateKnowledgeQuestion(validQuestion);
  assert.equal(result.error, undefined);
  assert.equal(result.value?.difficulty, 'normal');
  assert.equal(result.value?.correct_option_id, 'b');
  assert.equal(result.value?.question_type, 'multiple_choice');
});

test('accepts a numeric question and preserves tolerance and source attribution', () => {
  const result = validateKnowledgeQuestion({
    ...validQuestion,
    question_type: 'numeric',
    options: [],
    correct_option_id: null,
    correct_answer: '3.14159',
    answer_tolerance: 0.001,
    source_name: 'FTEXT',
    source_url: 'https://ftext.org/',
    source_license: 'CC BY 4.0',
    source_attribution: 'FTEXT（https://ftext.org）',
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value?.question_type, 'numeric');
  assert.equal(result.value?.options.length, 0);
  assert.equal(result.value?.correct_answer, '3.14159');
  assert.equal(result.value?.answer_tolerance, 0.001);
  assert.equal(result.value?.source_license, 'CC BY 4.0');
});

test('accepts written questions but keeps them separate from automatic grading', () => {
  const result = validateKnowledgeQuestion({
    ...validQuestion,
    question_type: 'written',
    options: [],
    correct_option_id: null,
    correct_answer: 'まず定義域を確認し、条件を整理する。',
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value?.question_type, 'written');
  assert.equal(result.value?.correct_answer, 'まず定義域を確認し、条件を整理する。');
});

test('accepts only defined difficulty and question type values', () => {
  for (const [difficulty, expected] of [['normal', 2], ['advanced', 4], ['challenge', 6]]) {
    const result = validateKnowledgeQuestion({ ...validQuestion, difficulty });
    assert.equal(result.error, undefined);
    assert.equal(result.value?.difficulty, difficulty);
    assert.equal(expected, difficulty === 'normal' ? 2 : difficulty === 'advanced' ? 4 : 6);
  }
  assert.match(validateKnowledgeQuestion({ ...validQuestion, difficulty: 'legendary' }).error || '', /難易度/);
  assert.match(validateKnowledgeQuestion({ ...validQuestion, question_type: 'essay_ai' }).error || '', /問題形式/);
});

test('rejects malformed questions, option counts, and incorrect option identifiers', () => {
  assert.match(validateKnowledgeQuestion({ ...validQuestion, title: '' }).error || '', /問題名/);
  assert.match(validateKnowledgeQuestion({ ...validQuestion, options: [validQuestion.options[0]] }).error || '', /2〜6個/);
  assert.match(validateKnowledgeQuestion({
    ...validQuestion,
    options: [...validQuestion.options, { id: 'e', text: '5' }, { id: 'f', text: '6' }, { id: 'g', text: '7' }],
  }).error || '', /2〜6個/);
  assert.match(validateKnowledgeQuestion({
    ...validQuestion,
    options: [{ id: 'a', text: 'A' }, { id: 'a', text: 'B' }],
  }).error || '', /重複/);
  assert.match(validateKnowledgeQuestion({ ...validQuestion, correct_option_id: 'z' }).error || '', /正解/);
});

test('requires numeric answers to be numeric and rejects negative tolerance', () => {
  const numeric = { ...validQuestion, question_type: 'numeric', options: [], correct_option_id: null, correct_answer: '2.5' };
  assert.equal(validateKnowledgeQuestion(numeric).error, undefined);
  assert.match(validateKnowledgeQuestion({ ...numeric, correct_answer: 'x+1' }).error || '', /数値/);
  assert.match(validateKnowledgeQuestion({ ...numeric, correct_answer: '1'.repeat(121) }).error || '', /120文字/);
  assert.match(validateKnowledgeQuestion({ ...numeric, answer_tolerance: -1 }).error || '', /許容誤差/);
});

test('requires license and attribution whenever an external source URL is supplied', () => {
  assert.match(validateKnowledgeQuestion({
    ...validQuestion, source_name: 'FTEXT', source_url: 'https://ftext.org/',
  }).error || '', /ライセンス/);
  assert.equal(validateKnowledgeQuestion({
    ...validQuestion,
    source_name: 'FTEXT',
    source_url: 'https://ftext.org/',
    source_license: 'CC BY 4.0',
    source_attribution: 'FTEXT（https://ftext.org）',
  }).error, undefined);
  assert.match(validateKnowledgeQuestion({
    ...validQuestion,
    source_name: 'Wikibooks',
    source_url: 'https://ja.wikibooks.org/wiki/高等学校数学III',
    source_license: 'CC BY-SA 4.0',
    source_attribution: 'Wikibooks',
  }).error || '', /revision ID/);
  assert.equal(validateKnowledgeQuestion({
    ...validQuestion,
    source_name: 'Wikibooks',
    source_url: 'https://ja.wikibooks.org/wiki/高等学校数学III',
    source_license: 'CC BY-SA 4.0',
    source_attribution: 'Wikibooks',
    source_revision: 'oldid=123456',
  }).error, undefined);
});

test('rejects oversized fields and invalid target class', () => {
  assert.match(validateKnowledgeQuestion({ ...validQuestion, prompt: 'x'.repeat(4001) }).error || '', /問題文/);
  assert.match(validateKnowledgeQuestion({ ...validQuestion, explanation: 'x'.repeat(2001) }).error || '', /解説/);
  assert.match(validateKnowledgeQuestion({ ...validQuestion, target_class: '' }).error || '', /対象クラス/);
});

test('accepts multiple-choice student attempts and ignores untrusted xp fields', () => {
  const result = validateKnowledgeAttempt({
    question_id: questionId,
    attempt_id: attemptId,
    selected_option_id: 'b',
    xp: 999999,
    xp_awarded: 999999,
    correct: true,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value?.selected_option_id, 'b');
  assert.equal(result.value?.selected_answer, null);
  assert.equal('xp' in (result.value || {}), false);
});

test('accepts numeric and written student responses without option ids', () => {
  const numeric = validateKnowledgeAttempt({
    question_id: questionId, attempt_id: attemptId, selected_answer: ' 3.14 ',
  });
  assert.equal(numeric.error, undefined);
  assert.equal(numeric.value?.selected_option_id, null);
  assert.equal(numeric.value?.selected_answer, '3.14');

  const written = validateKnowledgeAttempt({
    question_id: questionId, attempt_id: attemptId, selected_answer: '途中式を含む解答',
  });
  assert.equal(written.error, undefined);
});

test('rejects malformed attempt ids, mixed answers, and empty answers', () => {
  assert.match(validateKnowledgeAttempt({
    question_id: 'not-a-uuid', attempt_id: attemptId, selected_option_id: 'a',
  }).error || '', /問題ID/);
  assert.match(validateKnowledgeAttempt({
    question_id: questionId, attempt_id: 'not-a-uuid', selected_option_id: 'a',
  }).error || '', /回答ID/);
  assert.match(validateKnowledgeAttempt({
    question_id: questionId, attempt_id: attemptId, selected_option_id: 'bad option!',
  }).error || '', /選択肢ID/);
  assert.match(validateKnowledgeAttempt({
    question_id: questionId, attempt_id: attemptId, selected_option_id: 'a', selected_answer: '2',
  }).error || '', /回答形式/);
  assert.match(validateKnowledgeAttempt({
    question_id: questionId, attempt_id: attemptId, selected_answer: ' ',
  }).error || '', /解答/);
});
