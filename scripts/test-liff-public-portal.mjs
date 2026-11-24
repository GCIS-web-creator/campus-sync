import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAssignmentVisibleToClass,
  isExamAudienceVisibleToClass,
  isExamTargetedAtClass,
  isSchoolClassCode,
} from '../lib/liff-public-portal.ts';

test('validates school class identifiers', () => {
  assert.equal(isSchoolClassCode('1-1'), true);
  assert.equal(isSchoolClassCode('2-8'), true);
  assert.equal(isSchoolClassCode('3-8'), true);
  assert.equal(isSchoolClassCode('0-1'), false);
  assert.equal(isSchoolClassCode('2-9'), false);
  assert.equal(isSchoolClassCode('2-7x'), false);
});

test('limits target-class exams to the selected class', () => {
  assert.equal(isExamTargetedAtClass(['2-7', '2-8'], '2-7'), true);
  assert.equal(isExamTargetedAtClass(['2-7', '2-8'], '2-8'), true);
  assert.equal(isExamTargetedAtClass(['2-7'], '2-8'), false);
  assert.equal(isExamTargetedAtClass([], '1-1'), true);
  assert.equal(isExamTargetedAtClass(null, '1-1'), true);
  assert.equal(isExamTargetedAtClass(['2-7'], 'invalid'), false);
});

test('limits subject audiences before returning exam ranges', () => {
  assert.equal(isExamAudienceVisibleToClass('全生徒', '1-1'), true);
  assert.equal(isExamAudienceVisibleToClass('2年理系', '2-7'), true);
  assert.equal(isExamAudienceVisibleToClass('2年理系', '2-8'), true);
  assert.equal(isExamAudienceVisibleToClass('2年理系', '2-6'), false);
  assert.equal(isExamAudienceVisibleToClass('2年理系', '1-7'), false);
  assert.equal(isExamAudienceVisibleToClass('不明な対象', '2-7'), false);
});

test('limits science assignments to the two registered science classes', () => {
  assert.equal(isAssignmentVisibleToClass('all', '1-1'), true);
  assert.equal(isAssignmentVisibleToClass('science', '2-7'), true);
  assert.equal(isAssignmentVisibleToClass('science', '2-8'), true);
  assert.equal(isAssignmentVisibleToClass('science', '2-6'), false);
  assert.equal(isAssignmentVisibleToClass('private', '2-7'), false);
});
