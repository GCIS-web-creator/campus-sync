-- Add Chemistry to the subjects accepted by LINE assignment registration.
-- Safe to re-run.
alter table public.assignment_suggestions
  drop constraint if exists assignment_suggestions_subject_check;

alter table public.assignment_suggestions
  add constraint assignment_suggestions_subject_check
  check (subject in (
    '国語演習', '古典探求', '物理', '化学', '生物', '数３', '数C',
    '公共', '英コミュ', '論表', '情報', '保健', 'その他'
  ));
