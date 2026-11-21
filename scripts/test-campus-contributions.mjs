import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateContributionReview,
  validateContributionSubmission,
} from '../lib/campus-contribution-validation.ts';

const validId = '5a8e27d2-61c7-4a4a-9a8e-98c80d1d1c21';

test('accepts a well-formed contribution submission', () => {
  const result = validateContributionSubmission({
    activity_title: '文化祭の会場設営',
    activity_date: '2026-11-20',
    description: '会場設営を担当し、机や案内表示を準備しました。',
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value?.activity_title, '文化祭の会場設営');
});

test('rejects short and oversized contribution fields', () => {
  assert.match(validateContributionSubmission({
    activity_title: '準備',
    activity_date: '2026-11-20',
    description: '十分な説明があります。',
  }).error || '', /活動名/);

  assert.match(validateContributionSubmission({
    activity_title: '委員会活動',
    activity_date: '2026-11-20',
    description: '短い',
  }).error || '', /活動内容/);

  assert.match(validateContributionSubmission({
    activity_title: 'A'.repeat(121),
    activity_date: '2026-11-20',
    description: '活動の詳しい説明を入力しています。',
  }).error || '', /活動名/);
});

test('rejects invalid calendar dates', () => {
  assert.match(validateContributionSubmission({
    activity_title: '委員会活動',
    activity_date: '2026-02-30',
    description: '活動の詳しい説明を入力しています。',
  }).error || '', /活動日/);
});

test('only allows the three fixed contribution XP values', () => {
  for (const xp of [10, 25, 50]) {
    const result = validateContributionReview({
      submission_id: validId,
      decision: 'approve',
      xp_amount: xp,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.value?.xp_amount, xp);
  }
  assert.match(validateContributionReview({
    submission_id: validId,
    decision: 'approve',
    xp_amount: 99,
  }).error || '', /XP/);
});

test('requires a reason for rejection and return decisions', () => {
  for (const decision of ['reject', 'return']) {
    assert.match(validateContributionReview({
      submission_id: validId,
      decision,
      review_reason: 'no',
    }).error || '', /理由/);
    assert.equal(validateContributionReview({
      submission_id: validId,
      decision,
      review_reason: '活動内容をもう少し詳しくしてください。',
    }).error, undefined);
  }
});

test('rejects malformed submission IDs and unsupported review actions', () => {
  assert.match(validateContributionReview({
    submission_id: 'not-a-uuid',
    decision: 'approve',
    xp_amount: 10,
  }).error || '', /申請ID/);
  assert.match(validateContributionReview({
    submission_id: validId,
    decision: 'delete',
    xp_amount: 10,
  }).error || '', /審査操作/);
});
