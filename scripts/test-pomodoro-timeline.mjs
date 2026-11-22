import test from 'node:test';
import assert from 'node:assert/strict';
import { advancePomodoroTimeline, normalizeIsbn13 } from '../lib/pomodoro-timeline.ts';

test('absolute time decrements focus independent of throttled ticks', () => {
  const result = advancePomodoroTimeline({
    phase: 'focus', phaseStartedAt: 0, phaseEndsAt: 25 * 60_000,
    focusMinutes: 25, breakMinutes: 5, focusSeconds: 0, breakSeconds: 0,
  }, 10_000);
  assert.equal(result.remaining, 1490);
  assert.equal(result.focusSeconds, 10);
  assert.equal(result.phase, 'focus');
});

test('catches up into break after app suspension', () => {
  const result = advancePomodoroTimeline({
    phase: 'focus', phaseStartedAt: 0, phaseEndsAt: 25 * 60_000,
    focusMinutes: 25, breakMinutes: 5, focusSeconds: 0, breakSeconds: 0,
  }, 26 * 60_000);
  assert.equal(result.phase, 'break');
  assert.equal(result.remaining, 240);
  assert.equal(result.focusSeconds, 1500);
  assert.equal(result.breakSeconds, 60);
});

test('catches up repeated focus phases when break is zero', () => {
  const result = advancePomodoroTimeline({
    phase: 'focus', phaseStartedAt: 0, phaseEndsAt: 60_000,
    focusMinutes: 1, breakMinutes: 0, focusSeconds: 0, breakSeconds: 0,
  }, 155_000);
  assert.equal(result.phase, 'focus');
  assert.equal(result.transitionCount, 2);
  assert.equal(result.focusSeconds, 155);
  assert.equal(result.breakSeconds, 0);
  assert.equal(result.remaining, 25);
});

test('repeated synchronization does not double-count elapsed seconds', () => {
  const first = advancePomodoroTimeline({
    phase: 'focus', phaseStartedAt: 0, phaseEndsAt: 60_000,
    focusMinutes: 1, breakMinutes: 1, focusSeconds: 0, breakSeconds: 0,
  }, 12_500);
  const second = advancePomodoroTimeline(first, 13_500);
  assert.equal(first.focusSeconds, 12);
  assert.equal(second.focusSeconds, 13);
  assert.equal(second.phaseStartedAt, 13_000);
});

test('validates ISBN-13 and ISBN-10 including checksum', () => {
  assert.equal(normalizeIsbn13('978-4-06-515090-0'), '9784065150900');
  assert.equal(normalizeIsbn13('0-306-40615-2'), '9780306406157');
  assert.equal(normalizeIsbn13('9784065150906'), null);
  assert.equal(normalizeIsbn13('4901234567890'), null);
});
