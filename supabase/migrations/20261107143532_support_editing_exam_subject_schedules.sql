-- Applied to Supabase project sgvhktudhxufluuaipwt on 2026-11-07.
-- Allows Admin-only API updates to official exam subject/date assignments.
-- Existing student study-range rows are kept and remain linked to unchanged subjects.

ALTER TABLE public.school_test_subjects
  DROP CONSTRAINT IF EXISTS school_test_subject_day_order_unique;
ALTER TABLE public.school_test_subjects
  ADD CONSTRAINT school_test_subject_day_order_unique
  UNIQUE (exam_id, exam_date, sort_order)
  DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION public.replace_school_test_subjects(
  p_exam_id uuid,
  p_rows jsonb
)
RETURNS SETOF public.school_test_subjects
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  -- Keep student-entered study ranges when an Admin removes a subject.
  -- Their association is cleared, but the students' notes and progress remain.
  UPDATE public.student_test_ranges AS ranges
  SET school_test_subject_id = NULL
  WHERE ranges.school_test_subject_id IN (
    SELECT existing.id
    FROM public.school_test_subjects AS existing
    WHERE existing.exam_id = p_exam_id
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_rows) AS incoming(subject text)
        WHERE incoming.subject = existing.subject
      )
  );

  DELETE FROM public.school_test_subjects AS existing
  WHERE existing.exam_id = p_exam_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_rows) AS incoming(subject text)
      WHERE incoming.subject = existing.subject
    );

  -- Keep IDs stable for subjects that remain, so student study ranges stay linked.
  UPDATE public.school_test_subjects AS existing
  SET exam_date = incoming.exam_date,
      sort_order = incoming.sort_order
  FROM jsonb_to_recordset(p_rows)
       AS incoming(subject text, exam_date date, sort_order smallint)
  WHERE existing.exam_id = p_exam_id
    AND existing.subject = incoming.subject;

  INSERT INTO public.school_test_subjects (exam_id, subject, exam_date, sort_order)
  SELECT p_exam_id, incoming.subject, incoming.exam_date, incoming.sort_order
  FROM jsonb_to_recordset(p_rows)
       AS incoming(subject text, exam_date date, sort_order smallint)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.school_test_subjects AS existing
    WHERE existing.exam_id = p_exam_id
      AND existing.subject = incoming.subject
  );

  RETURN QUERY
  SELECT *
  FROM public.school_test_subjects
  WHERE exam_id = p_exam_id
  ORDER BY exam_date, sort_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.replace_school_test_subjects(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_school_test_subjects(uuid, jsonb) TO service_role;
