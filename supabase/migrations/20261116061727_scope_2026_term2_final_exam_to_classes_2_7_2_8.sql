
ALTER TABLE public.school_test_exams
  ADD COLUMN IF NOT EXISTS target_classes text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.school_test_subjects
  DROP CONSTRAINT IF EXISTS school_test_subjects_subject_check;
ALTER TABLE public.school_test_subjects
  ADD CONSTRAINT school_test_subjects_subject_check CHECK (
    subject = ANY (ARRAY[
      '国語演習','古典探求','古典探究','物理','化学','生物','数３','数C','数学C',
      '数学Ⅱ','英コミュⅡ','保健（30分）','物理・生物','論理表現Ⅱ（30分）',
      '公共','英コミュ','論表','情報','保健'
    ]::text[])
  );

ALTER TABLE public.student_study_sessions
  DROP CONSTRAINT IF EXISTS student_study_sessions_subject_name_check;
ALTER TABLE public.student_study_sessions
  ADD CONSTRAINT student_study_sessions_subject_name_check CHECK (
    subject_name = ANY (ARRAY[
      '国語演習','古典探求','古典探究','物理','化学','生物','数３','数C','数学C',
      '数学Ⅱ','英コミュⅡ','保健（30分）','物理・生物','論理表現Ⅱ（30分）',
      '公共','英コミュ','論表','情報','保健'
    ]::text[])
  );

-- A class-scoped exam is visible only to members of its target class(es).
DROP POLICY IF EXISTS school_test_exams_authenticated_read ON public.school_test_exams;
CREATE POLICY school_test_exams_authenticated_read
  ON public.school_test_exams
  FOR SELECT TO authenticated
  USING (
    cardinality(target_classes) = 0
    OR EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.auth_user_id = (SELECT auth.uid())
        AND profile.user_class = ANY (school_test_exams.target_classes)
    )
  );

-- A subject row inherits visibility from its parent exam.
DROP POLICY IF EXISTS school_test_subjects_authenticated_read ON public.school_test_subjects;
CREATE POLICY school_test_subjects_authenticated_read
  ON public.school_test_subjects
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.school_test_exams AS exam
      WHERE exam.id = school_test_subjects.exam_id
    )
  );

DO $$
DECLARE
  target_exam_id uuid;
BEGIN
  SELECT id INTO target_exam_id
  FROM public.school_test_exams
  WHERE school_year = 2026
    AND term = 2
    AND exam_type = '期末考査'
    AND start_date = DATE '2026-11-25'
    AND end_date = DATE '2026-11-28';

  IF target_exam_id IS NULL THEN
    RAISE EXCEPTION '2026年度2学期期末考査 (2026-11-25〜2026-11-28) was not found';
  END IF;

  UPDATE public.school_test_exams
  SET target_classes = ARRAY['2-7','2-8']::text[],
      updated_at = now()
  WHERE id = target_exam_id;

  INSERT INTO public.school_test_subjects (exam_id, subject, exam_date, sort_order)
  VALUES
    (target_exam_id, '数学Ⅱ', DATE '2026-11-25', 1),
    (target_exam_id, '英コミュⅡ', DATE '2026-11-25', 2),
    (target_exam_id, '古典探究', DATE '2026-11-25', 3),
    (target_exam_id, '保健（30分）', DATE '2026-11-26', 1),
    (target_exam_id, '化学', DATE '2026-11-26', 2),
    (target_exam_id, '物理・生物', DATE '2026-11-26', 3),
    (target_exam_id, '論理表現Ⅱ（30分）', DATE '2026-11-27', 1),
    (target_exam_id, '国語演習', DATE '2026-11-27', 2),
    (target_exam_id, '数学C', DATE '2026-11-27', 3),
    (target_exam_id, '公共', DATE '2026-11-28', 1),
    (target_exam_id, '情報', DATE '2026-11-28', 2)
  ON CONFLICT (exam_id, subject)
  DO UPDATE SET
    exam_date = EXCLUDED.exam_date,
    sort_order = EXCLUDED.sort_order;
END $$;
