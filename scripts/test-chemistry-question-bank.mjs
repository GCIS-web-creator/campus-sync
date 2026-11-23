import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const bank = JSON.parse(readFileSync(
  new URL('../data/chemistry-question-bank-1500-2026-11.json', import.meta.url),
  'utf8',
));
const expectedSubjects = {
  chem_theory: 400,
  chem_inorganic: 400,
  chem_organic: 400,
  chem_polymer: 300,
};
const expectedTypes = { multiple_choice: 1124, numeric: 376 };
const normalize = value => value.normalize('NFKC')
  .toLocaleLowerCase('ja-JP')
  .replace(/\s+/g, ' ')
  .trim();

test('chemistry question bank contains 1,500 published items', () => {
  assert.equal(bank.length, 1500);
  for (const [code, count] of Object.entries(expectedSubjects)) {
    assert.equal(bank.filter(question => question.subject_code === code).length, count, code);
  }
});

test('question prompts are unique within each subject and unit', () => {
  const keys = bank.map(question => [
    question.subject_code,
    question.unit,
    normalize(question.prompt),
  ].join('\n'));
  assert.equal(new Set(keys).size, keys.length);
});

test('all questions have complete metadata and original provenance', () => {
  for (const [index, question] of bank.entries()) {
    assert.ok(question.subject && question.unit && question.title && question.prompt, 'fields ' + index);
    assert.ok(question.explanation, 'explanation ' + index);
    assert.ok(['normal', 'advanced', 'challenge'].includes(question.difficulty));
    assert.equal(question.status, 'published');
    assert.equal(question.target_class, 'all');
    assert.equal(question.source_name, 'CampusSyncオリジナル');
    assert.equal(question.source_url, null);
    assert.ok(question.source_attribution);
  }
});

test('question formats and multiple-choice answer keys are valid', () => {
  for (const [type, count] of Object.entries(expectedTypes)) {
    assert.equal(bank.filter(question => question.question_type === type).length, count, type);
  }
  for (const question of bank.filter(item => item.question_type === 'multiple_choice')) {
    assert.equal(question.options.length, 4, question.title);
    assert.equal(new Set(question.options.map(option => option.text)).size, 4, question.title);
    assert.ok(question.options.some(option => option.id === question.correct_option_id), question.title);
  }
});

test('numeric questions have valid numeric answer keys and no options', () => {
  for (const question of bank.filter(item => item.question_type === 'numeric')) {
    assert.match(question.correct_answer, /^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)$/, question.title);
    assert.deepEqual(question.options, [], question.title);
    assert.ok(Number(question.answer_tolerance) >= 0, question.title);
  }
});

test('every category has a useful spread of units', () => {
  for (const code of Object.keys(expectedSubjects)) {
    const units = new Set(bank.filter(question => question.subject_code === code).map(question => question.unit));
    assert.ok(units.size >= 5, code + ' units');
  }
});
