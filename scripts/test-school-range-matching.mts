import assert from 'node:assert/strict';
import test from 'node:test';
import { matchSchoolRangeSubjects } from '../lib/school-range-matching.mts';

const makeRange = (id, subject, display_subject = subject) => ({
  id,
  subject,
  display_subject,
});

test('matches a timetable English subject to the short public-range name', () => {
  const result = matchSchoolRangeSubjects('英コミュⅡ', [makeRange('english', '英コミュ')]);
  assert.deepEqual(result.registeredSubjects, ['英コミュⅡ']);
  assert.deepEqual(result.missingSubjects, []);
  assert.deepEqual(result.rows.map(row => row.id), ['english']);
});

test('matches classical Japanese by display_subject', () => {
  const result = matchSchoolRangeSubjects('古典探究', [
    makeRange('classics', '古典探求', '古典探究'),
  ]);
  assert.deepEqual(result.registeredSubjects, ['古典探究']);
  assert.deepEqual(result.missingSubjects, []);
});

test('matches Math C by display_subject', () => {
  const result = matchSchoolRangeSubjects('数学C', [
    makeRange('math-c', '数C', '数学C'),
  ]);
  assert.deepEqual(result.registeredSubjects, ['数学C']);
  assert.deepEqual(result.missingSubjects, []);
});

test('matches Logic Expression to the abbreviated public-range name', () => {
  const result = matchSchoolRangeSubjects('論理表現Ⅱ（30分）', [
    makeRange('logic', '論表'),
  ]);
  assert.deepEqual(result.registeredSubjects, ['論理表現Ⅱ']);
  assert.deepEqual(result.missingSubjects, []);
});

test('reports Physics/Biology as partial when only Physics is registered', () => {
  const result = matchSchoolRangeSubjects('物理・生物', [
    makeRange('physics', '物理'),
  ]);
  assert.deepEqual(result.registeredSubjects, ['物理']);
  assert.deepEqual(result.missingSubjects, ['生物']);
  assert.deepEqual(result.rows.map(row => row.id), ['physics']);
});

test('treats a genuinely missing Health range as unregistered', () => {
  const result = matchSchoolRangeSubjects('保健（30分）', []);
  assert.deepEqual(result.registeredSubjects, []);
  assert.deepEqual(result.missingSubjects, ['保健（30分）']);
  assert.deepEqual(result.rows, []);
});

test('accepts a single combined Physics/Biology range for both components', () => {
  const result = matchSchoolRangeSubjects('物理・生物', [
    makeRange('combined', '物理・生物'),
  ]);
  assert.deepEqual(result.registeredSubjects, ['物理', '生物']);
  assert.deepEqual(result.missingSubjects, []);
  assert.deepEqual(result.rows.map(row => row.id), ['combined']);
});
