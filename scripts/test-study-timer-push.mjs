import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStudyTimerPushRequest } from '../lib/study-timer-push.ts';
const id = 'b4bf54f0-efcc-4a7c-9c92-5d7fdd17a2be';

test('focus schedule includes the next break', () => assert.deepEqual(
  parseStudyTimerPushRequest({ action:'schedule', schedule_id:id, phase:'focus', remaining_seconds:1500, break_seconds:300 }),
  { action:'schedule', scheduleId:id, phase:'focus', remainingSeconds:1500, breakSeconds:300 }
));
test('break schedule creates a single notification', () => assert.deepEqual(
  parseStudyTimerPushRequest({ action:'schedule', schedule_id:id, phase:'break', remaining_seconds:180, break_seconds:0 }),
  { action:'schedule', scheduleId:id, phase:'break', remainingSeconds:180, breakSeconds:0 }
));
test('cancel request is accepted', () => assert.deepEqual(
  parseStudyTimerPushRequest({ action:'cancel', schedule_id:id }),
  { action:'cancel', scheduleId:id }
));
test('invalid UUID is rejected', () => assert.throws(
  () => parseStudyTimerPushRequest({ action:'cancel', schedule_id:'nope' }), /通知予約ID/
));
test('unsupported timer phase is rejected', () => assert.throws(
  () => parseStudyTimerPushRequest({ action:'schedule', schedule_id:id, phase:'sleep', remaining_seconds:15, break_seconds:5 }),
  /タイマーの状態/
));
test('remaining time must be within six hours', () => {
  for (const n of [0,21601]) assert.throws(
    () => parseStudyTimerPushRequest({ action:'schedule', schedule_id:id, phase:'break', remaining_seconds:n, break_seconds:0 }),
    /残り時間/
  );
});
test('focus schedule supports a zero-minute break', () => assert.deepEqual(
  parseStudyTimerPushRequest({ action:'schedule', schedule_id:id, phase:'focus', remaining_seconds:1500, break_seconds:0 }),
  { action:'schedule', scheduleId:id, phase:'focus', remainingSeconds:1500, breakSeconds:0 }
));
test('break schedule cannot include a second break', () => assert.throws(
  () => parseStudyTimerPushRequest({ action:'schedule', schedule_id:id, phase:'break', remaining_seconds:180, break_seconds:60 }),
  /追加の休憩時間/
));
