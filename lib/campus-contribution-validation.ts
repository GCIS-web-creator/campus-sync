export const CONTRIBUTION_XP_OPTIONS = [10, 25, 50] as const;

export type ContributionDecision = 'approve' | 'reject' | 'return';

export type ContributionSubmissionInput = {
  activity_title: string;
  activity_date: string;
  description: string;
};

export type ContributionReviewInput = {
  submission_id: string;
  decision: ContributionDecision;
  xp_amount: number | null;
  review_reason: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateContributionSubmission(input: unknown):
  | { value: ContributionSubmissionInput; error?: never }
  | { value?: never; error: string } {
  if (!isPlainObject(input)) return { error: '送信内容を読み取れません。' };

  const activity_title = typeof input.activity_title === 'string' ? input.activity_title.trim() : '';
  const activity_date = typeof input.activity_date === 'string' ? input.activity_date.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';

  if (activity_title.length < 3 || activity_title.length > 120) {
    return { error: '活動名は3〜120文字で入力してください。' };
  }
  if (!isValidDate(activity_date)) return { error: '活動日を正しく入力してください。' };
  if (description.length < 10 || description.length > 2000) {
    return { error: '活動内容は10〜2000文字で入力してください。' };
  }

  return { value: { activity_title, activity_date, description } };
}

export function validateContributionReview(input: unknown):
  | { value: ContributionReviewInput; error?: never }
  | { value?: never; error: string } {
  if (!isPlainObject(input)) return { error: '審査内容を読み取れません。' };

  const submission_id = typeof input.submission_id === 'string' ? input.submission_id.trim() : '';
  const decision = input.decision;
  const xp_amount = input.xp_amount === undefined || input.xp_amount === null
    ? null
    : Number(input.xp_amount);
  const review_reason = typeof input.review_reason === 'string' ? input.review_reason.trim() : '';

  if (!UUID.test(submission_id)) return { error: '申請IDが正しくありません。' };
  if (decision !== 'approve' && decision !== 'reject' && decision !== 'return') {
    return { error: '審査操作が正しくありません。' };
  }
  if (decision === 'approve') {
    if (![10, 25, 50].includes(xp_amount as number)) {
      return { error: 'XPは10・25・50から選択してください。' };
    }
  } else if (review_reason.length < 5 || review_reason.length > 500) {
    return { error: '却下・差し戻しには5〜500文字の理由が必要です。' };
  }

  return {
    value: {
      submission_id,
      decision,
      xp_amount: decision === 'approve' ? xp_amount : null,
      review_reason,
    },
  };
}
