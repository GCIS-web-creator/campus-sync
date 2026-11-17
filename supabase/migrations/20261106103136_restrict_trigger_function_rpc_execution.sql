-- These are trigger-only functions, not client RPCs. The triggers continue to run,
-- but API roles must not be able to invoke their SECURITY DEFINER bodies directly.
REVOKE EXECUTE ON FUNCTION public.create_soka_student_profile() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_soka_student_email() FROM PUBLIC, anon, authenticated;;
