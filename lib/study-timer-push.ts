export type StudyTimerPhase = 'focus' | 'break';
export type StudyTimerPushRequest =
  | { action: 'cancel'; scheduleId: string }
  | { action: 'schedule'; scheduleId: string; phase: StudyTimerPhase; remainingSeconds: number; breakSeconds: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseStudyTimerPushRequest(value: unknown): StudyTimerPushRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('リクエスト内容が正しくありません。');
  }
  const body = value as Record<string, unknown>;
  const action = body.action;
  const scheduleId = typeof body.schedule_id === 'string' ? body.schedule_id : '';
  if (!UUID.test(scheduleId)) throw new Error('通知予約IDが正しくありません。');

  if (action === 'cancel') return { action: 'cancel', scheduleId };
  if (action !== 'schedule') throw new Error('操作内容が正しくありません。');

  const phase = body.phase;
  const remainingSeconds = body.remaining_seconds;
  const breakSeconds = body.break_seconds;
  if (phase !== 'focus' && phase !== 'break') throw new Error('タイマーの状態が正しくありません。');
  if (!Number.isSafeInteger(remainingSeconds) || Number(remainingSeconds) < 1 || Number(remainingSeconds) > 21600) {
    throw new Error('残り時間は1秒から6時間の範囲で指定してください。');
  }
  const parsedBreakSeconds = Number(breakSeconds);
  if (!Number.isSafeInteger(parsedBreakSeconds) || parsedBreakSeconds < 0 || parsedBreakSeconds > 10800) {
    throw new Error('休憩時間が正しくありません。');
  }
  if (phase === 'focus' && parsedBreakSeconds < 1) {
    throw new Error('集中終了後の休憩時間を指定してください。');
  }
  if (phase === 'break' && parsedBreakSeconds !== 0) {
    throw new Error('休憩中の予約では追加の休憩時間を指定できません。');
  }
  return { action: 'schedule', scheduleId, phase, remainingSeconds: Number(remainingSeconds), breakSeconds: parsedBreakSeconds };
}
