-- Allow the additional profile name fonts exposed by Profile Studio.
-- The owner-only RLS policies and profile rows remain unchanged.
ALTER TABLE public.student_profile_customizations
  DROP CONSTRAINT IF EXISTS student_profile_name_font_check;

ALTER TABLE public.student_profile_customizations
  ADD CONSTRAINT student_profile_name_font_check
  CHECK (name_font IN ('rounded', 'sans', 'serif', 'mono', 'marshmallow', 'modern', 'thunder-riot'));
