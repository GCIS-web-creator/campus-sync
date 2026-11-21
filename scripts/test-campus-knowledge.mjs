import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateKnowledgeAttempt,
  validateKnowledgeQuestion,
} from '../lib/campus-knowledge-validation.ts';

const validQuestion = {
  subject: '数３',
  title: '微分の基本',
  prompt: '関数 f(x)=x^2 の導関数として正しいものを選びなさい。',
  options: [
    { id: 'a', text: 'x' },
    { id: 'b', text: '2x' },
    { id: 'c', text: 'x^2' },
    { id: 'd', text: '2' },
  ],
  correct_option_id: 'b',
  explanation: 'べき乗の微分公式より、(x^2)\' = 2x です。',
  difficulty: 'normal',
  target_class: 'all',
  status: 'published',
};

const questionId = '9a8e27d2-61c7-4a4a-9a8e-98c80d1d1c21';
const attemptId = '5a8e27d2-61c7-4a4a-9a8e-98c80d1d1c21';

test('accepts a valid published knowledge question', () => {
  const result = validateKnowledgeQuestion(validQuestion);
  assert.equal(result.error, undefined);
  assert.equal(result.value?.difficulty, 'normal');
  assert.equal(result.value?.correct_option_id, 'b');
});

test('accepts only the defined difficulty values and derives no client XP amount', () => {
  for (const [difficulty, expected] of [['normal', 2], ['advanced', 4], ['challenge', 6]] as const) {
    const result = validateKnowledgeQuestion({ ...validQuestion, difficulty });
    assert.equal(result.error, undefined);
    assert.equal(result.value?.difficulty, difficulty);
    assert.equal(expected, difficulty === 'normal' ? 2 : difficulty === 'advanced' ? 4 : 6);
  }
  assert.match(validateKnowledgeQuestion({ ...validQuestion, difficulty: 'legendary' }).error || '', /難易度/);
});

test('rejects malformed questions, too many/few options, and duplicate option ids', () => {
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

test('rejects oversized fields and invalid target class', () => {
  assert.match(validateKnowledgeQuestion({ ...validQuestion, prompt: 'x'.repeat(4001) }).error || '', /問題文/);
  assert.match(validateKnowledgeQuestion({ ...validQuestion, explanation: 'x'.repeat(2001) }).error || '', /解説/);
  assert.match(validateKnowledgeQuestion({ ...validQuestion, target_class: '' }).error || '', /対象クラス/);
});

test('accepts a well-formed student attempt and ignores untrusted xp fields', () => {
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
  assert.equal('xp' in (result.value || {}), false);
});

test('rejects malformed question, attempt, and option identifiers', () => {
  assert.match(validateKnowledgeAttempt({
    question_id: 'not-a-uuid', attempt_id: attemptId, selected_option_id: 'a',
  }).error || '', /問題ID/);
  assert.match(validateKnowledgeAttempt({
    question_id: questionId, attempt_id: 'not-a-uuid', selected_option_id: 'a',
  }).error || '', /回答ID/);
  assert.match(validateKnowledgeAttempt({
    question_id: questionId, attempt_id: attemptId, selected_option_id: 'correct',
  }).error || '', /選択肢/);
});
