# CampusSync student profile setup and export

## 1. Apply the database change

In Supabase, open **SQL Editor** and run `supabase/student-profile-setup.sql` from this repository. The profile setup page queries `profiles.setup_completed_at`; the UI will not work until this column exists.

Existing profile rows with a NULL `setup_completed_at` will be asked to complete the new setup on their next sign-in. Completing setup writes the name, class, email, student ID and completion timestamp to `public.profiles`.

## 2. Configure server-only environment variables

In Vercel project settings, configure these variables for the production deployment:

- `CAMPUS_SYNC_ADMIN_PASSWORD` — the existing Admin API password.
- `STUDENT_PROFILE_EXPORT_PASSWORD` — a **new, separate, strong secret** used only to authorize profile exports. Do not reuse a value that has already been shared in a chat, and do not put it in source code.
- `NEXT_PUBLIC_SUPABASE_URL` — the Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY` — the Supabase service-role key, available only on the server. Never use a `NEXT_PUBLIC_` prefix for this key.

The export endpoint requires both the Admin password and the separate export secret. The browser does not receive the service-role key. Do not put any of these secret values in this file, in GitHub source, or in the exported package.

## 3. Export from Admin

Open Admin → **生徒プロフィール書き出し**. Enter the Admin password in the existing Admin authentication field, enter the separate export confirmation secret, and check the personal-data confirmation. The browser downloads a `.cslogson` file only after the API accepts both secrets.

The export includes profile fields only (student ID, name, school email, class, and timestamps). Supabase Auth passwords, password hashes, authentication tokens and recovery secrets are not exported or displayed.

Treat the downloaded file as confidential personal information. Store it in an approved secure location, limit access, and delete unnecessary copies.

## 4. Verify the downloaded package

With Node.js installed, run:

```bash
npm run verify:cslogson -- ./campus-sync-student-profiles-YYYY-MM-DD.cslogson
```

The verifier supports both chat audit exports and student profile snapshots. A successful result checks the file's SHA-256 hash chain; it does **not** prove who created the file or that the source database had not been altered before export.

## Deployment note

GitHub source changes do not mean the production site has updated. Confirm the Vercel deployment status and test the live site only after Vercel reports a successful deployment.
