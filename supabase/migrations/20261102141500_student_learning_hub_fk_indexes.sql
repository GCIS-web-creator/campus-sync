create index if not exists student_test_subjects_exam_owner_idx
  on public.student_test_subjects(exam_id, user_id);
create index if not exists student_test_ranges_subject_owner_idx
  on public.student_test_ranges(subject_id, user_id);
create index if not exists student_study_sessions_test_subject_id_idx
  on public.student_study_sessions(test_subject_id)
  where test_subject_id is not null;
