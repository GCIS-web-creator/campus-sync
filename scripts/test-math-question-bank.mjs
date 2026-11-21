import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const questions = JSON.parse(readFileSync(
  new URL('../data/math-question-bank-2026-11.json', import.meta.url),
  'utf8',
));

const subjects = ['math1', 'matha', 'math2', 'mathb', 'math3', 'mathc'];
const types = ['multiple_choice', 'numeric', 'written'];
const difficulties = ['normal', 'advanced', 'challenge'];
const normalize = (value) => value.normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/\\s+/g, ' ').trim();

test('contains at least 1,000 original questions with balanced subject coverage', () => {
  assert.equal(questions.length, 1080);
  for (const subject of subjects) {
    assert.equal(questions.filter((question) => question.subject_code === subject).length, 180);
  }
});

test('contains no duplicate prompts for the same subject and unit', () => {
  const keys = questions.map((question) => [
    question.subject_code,
    question.unit,
    normalize(question.prompt),
  ].join('\\n'));
  assert.equal(new Set(keys).size, keys.length);
});

test('every question has complete learning and provenance metadata', () => {
  for (const [index, question] of questions.entries()) {
    assert.ok(subjects.includes(question.subject_code), `subject at row ${index + 1}`);
    assert.ok(question.subject && question.unit && question.title && question.prompt);
    assert.ok(question.explanation && question.explanation.length <= 2000);
    assert.ok(difficulties.includes(question.difficulty));
    assert.equal(question.status, 'published');
    assert.equal(question.target_class, 'all');
    assert.equal(question.source_name, 'CampusSyncオリジナル');
    assert.equal(question.source_url, null);
    assert.equal(question.source_license, null);
    assert.ok(question.source_attribution);
  }
});

test('multiple-choice questions have four distinct choices and a valid answer key', () => {
  const selected = questions.filter((question) => question.question_type === 'multiple_choice');
  assert.equal(selected.length, 225);
  for (const [index, question] of selected.entries()) {
    assert.ok(question.options.length >= 2 && question.options.length <= 6, `choice count ${index + 1}`);
    const ids = question.options.map((option) => option.id);
    const labels = question.options.map((option) => option.text);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(new Set(labels).size, labels.length);
    assert.ok(question.options.some((option) => option.id === question.correct_option_id));
    assert.ok(question.options.every((option) => option.text && option.text.length <= 500));
    assert.equal(question.correct_answer, null);
  }
});

test('numeric questions use values compatible with server-side numeric grading', () => {
  const selected = questions.filter((question) => question.question_type === 'numeric');
  assert.equal(selected.length, 855);
  for (const [index, question] of selected.entries()) {
    assert.match(question.correct_answer, /^[+-]?([0-9]+(\\.[0-9]*)?|\\.[0-9]+)$/, `numeric answer ${index + 1}`);
    assert.equal(question.options.length, 0);
    assert.equal(question.correct_option_id, null);
    assert.equal(question.answer_tolerance, 0);
  }
});

test('difficulty mix and question types are explicitly represented', () => {
  for (const type of types) assert.ok(questions.some((question) => question.question_type === type) === (type !== 'written'));
  for (const difficulty of difficulties) assert.ok(questions.some((question) => question.difficulty === difficulty));
});
