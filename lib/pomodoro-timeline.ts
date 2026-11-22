export type PomodoroPhase = 'focus' | 'break';

export interface PomodoroTimelineState {
  phase: PomodoroPhase;
  phaseStartedAt: number;
  phaseEndsAt: number;
  focusMinutes: number;
  breakMinutes: number;
  focusSeconds: number;
  breakSeconds: number;
}

export interface PomodoroTimelineResult extends PomodoroTimelineState {
  remaining: number;
  transitionCount: number;
}

/** Calculate Pomodoro progress from absolute Unix timestamps, not interval tick counts. */
export function advancePomodoroTimeline(state: PomodoroTimelineState, now: number): PomodoroTimelineResult {
  const focusMinutes = Math.min(180, Math.max(1, Math.floor(state.focusMinutes || 1)));
  const breakMinutes = Math.min(60, Math.max(0, Math.floor(state.breakMinutes || 0)));
  let phase: PomodoroPhase = state.phase === 'break' && breakMinutes > 0 ? 'break' : 'focus';
  let phaseStartedAt = Number.isFinite(state.phaseStartedAt) ? state.phaseStartedAt : now;
  let phaseEndsAt = Number.isFinite(state.phaseEndsAt) && state.phaseEndsAt > phaseStartedAt
    ? state.phaseEndsAt
    : phaseStartedAt + (phase === 'focus' ? focusMinutes : breakMinutes) * 60_000;
  let focusSeconds = Math.max(0, Math.floor(state.focusSeconds || 0));
  let breakSeconds = Math.max(0, Math.floor(state.breakSeconds || 0));
  let transitionCount = 0;
  const safeNow = Number.isFinite(now) ? now : Date.now();

  while (safeNow >= phaseEndsAt && transitionCount < 100_000) {
    const completedSeconds = Math.max(0, Math.floor((phaseEndsAt - phaseStartedAt) / 1000));
    if (phase === 'focus') focusSeconds += completedSeconds;
    else breakSeconds += completedSeconds;
    phaseStartedAt = phaseEndsAt;
    phase = phase === 'focus' ? (breakMinutes > 0 ? 'break' : 'focus') : 'focus';
    phaseEndsAt = phaseStartedAt + (phase === 'focus' ? focusMinutes : breakMinutes) * 60_000;
    transitionCount += 1;
  }

  const elapsedWholeSeconds = Math.max(0, Math.floor((Math.min(safeNow, phaseEndsAt) - phaseStartedAt) / 1000));
  if (phase === 'focus') focusSeconds += elapsedWholeSeconds;
  else breakSeconds += elapsedWholeSeconds;
  phaseStartedAt += elapsedWholeSeconds * 1000;

  return {
    phase, phaseStartedAt, phaseEndsAt, focusMinutes, breakMinutes,
    focusSeconds, breakSeconds,
    remaining: Math.max(0, Math.ceil((phaseEndsAt - safeNow) / 1000)),
    transitionCount,
  };
}

/** Normalize ISBN-10/13 input into a checksum-validated ISBN-13. */
export function normalizeIsbn13(value: string): string | null {
  const raw = value.replace(/[\s-]/g, '').toUpperCase();
  if (/^97[89]\d{10}$/.test(raw)) {
    const sum = [...raw.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === Number(raw[12]) ? raw : null;
  }
  if (/^\d{9}[\dX]$/.test(raw)) {
    const sum = [...raw].reduce((total, char, index) => total + (char === 'X' ? 10 : Number(char)) * (10 - index), 0);
    if (sum % 11 !== 0) return null;
    const base = '978' + raw.slice(0, 9);
    const isbnSum = [...base].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return base + String((10 - (isbnSum % 10)) % 10);
  }
  return null;
}


/** Return elapsed stopwatch time from a saved base and an absolute start timestamp. */
export function calculateCountUpSeconds(baseSeconds: number, startedAt: number | null, now: number): number {
  const base = Number.isFinite(baseSeconds) ? Math.max(0, Math.floor(baseSeconds)) : 0;
  if (startedAt === null || !Number.isFinite(startedAt) || !Number.isFinite(now)) return base;
  return base + Math.max(0, Math.floor((now - startedAt) / 1000));
}
