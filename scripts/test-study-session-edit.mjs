import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatStudyDurationInput,
  parseStudyDurationInput,
  toLocalDateTimeInput,
  fromLocalDateTimeInput,
} from '../lib/study-session-edit.ts';

test('duration input round-trips exact seconds', () => {
  for (const seconds of [1, 59, 60, 1501, 3661, 86399, 86400]) {
    assert.equal(parseStudyDurationInput(formatStudyDurationInput(seconds)), seconds);
  }
});

test('duration parser rejects malformed and over-limit values', () => {
  for (const value of ['', '25:00:00', '24:00:01', '01:60:00', '00:00:60', '1:2:3', '-1:00:00']) {
    assert.equal(parseStudyDurationInput(value), null, value);
  }
});

test('zero break duration is valid while focus minimum is enforced by the form', () => {
  assert.equal(parseStudyDurationInput('00:00:00'), 0);
  assert.equal(parseStudyDurationInput('00:00:01'), 1);
});

test('local datetime conversion preserves the represented instant', () => {
  const original = '2026-11-22T09:30:00.000Z';
  const localInput = toLocalDateTimeInput(original);
  assert.equal(fromLocalDateTimeInput(localInput), original);
});
