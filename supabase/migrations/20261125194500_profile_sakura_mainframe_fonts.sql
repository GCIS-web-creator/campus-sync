-- Add Sakura Pop Plump V3 and MainFrame as selectable profile name fonts.
-- Keep the old "marshmallow" value accepted for backwards compatibility.
ALTER TABLE public.student_profile_customizations
  DROP CONSTRAINT IF EXISTS student_profile_name_font_check;
ALTER TABLE public.student_profile_customizations
  ADD CONSTRAINT student_profile_name_font_check
  CHECK (name_font IN ('rounded','sans','serif','mono','marshmallow','sakura-pop','mainframe','modern','thunder-riot'));
