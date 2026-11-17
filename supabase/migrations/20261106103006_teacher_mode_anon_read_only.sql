-- Teacher sessions use the anon API role: keep existing SELECT grants but remove all anon mutation rights.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- New public tables created by the postgres migration role are read-only to anon by default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- Library cover uploads and deletions are restricted to signed-in users (admin server calls remain unaffected).
ALTER POLICY "public_upload_library_covers" ON storage.objects TO authenticated;
ALTER POLICY "public_delete_library_covers" ON storage.objects TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE storage.objects FROM anon;;
