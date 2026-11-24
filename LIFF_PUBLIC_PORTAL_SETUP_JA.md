# CampusSync LINE Public Portal setup

## What is included

The public portal is served at `/liff`. It does not use the CampusSync student login, does not call LIFF profile or ID-token APIs, and does not store student-level data. The selected class is stored only in the current browser's local storage.

Public routes:
- `/api/public/school-info?class=2-7` — school-published exam ranges and active class-wide assignments only.
- `/api/public/train-departures` — the registered Takanodai Station timetable only.

The portal reuses existing public/read-only endpoints for the class timetable, school weekly schedule, public countdown events, and weather panel. The calculator runs in the browser. No new database tables or RLS policies are required.

## Security boundary

The public school-info and train endpoints use the server-side Supabase service-role key, but return only explicit allowlisted columns. They never return profiles, personal todos, grades, completion details, study sessions, student names, Classroom IDs, or private materials. Exam target classes and audience labels are checked server-side. Assignments are limited to active rows targeted at the selected class or the configured school-wide/science group. These endpoints are GET-only.

Do not move `SUPABASE_SERVICE_ROLE_KEY` into a `NEXT_PUBLIC_*` variable or browser code. Do not add POST/PATCH/DELETE handlers to these public routes.

## LINE Developers setup (manual step)

1. In the existing LINE Login channel/provider used by the CampusSync materials LIFF, create a separate LIFF app for the public portal. Keep it under the same provider as the official account's Messaging API channel when the channels are linked.
2. Set its endpoint URL to the `/liff` path on the confirmed production host. For the Cloudflare Worker deployment, the configured host is `https://campus-sync.gcis-webcreator.workers.dev/liff`; use it only after the commit containing this page has actually been deployed. A successful CI build by itself does not publish the page.
3. Set the LIFF size to Full. Do not request the `profile` or `email` scopes. The page does not need an ID token or LINE user ID.
4. Save the new LIFF ID. Use its URL, `https://liff.line.me/{LIFF_ID}`, as the URI action in the LINE Official Account rich menu.
5. Keep the existing materials LIFF app and its endpoint unchanged. This public portal is a separate LIFF entry point.

The LIFF ID and rich-menu action must be configured in LINE Developers / LINE Official Account Manager; this repository change cannot perform those console actions. Keep the existing materials LIFF app untouched.

## Deployment

The portal requires the same server environment already used by existing school APIs:
- `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`

The public portal does not request the LINE `profile` or `email` scopes and does not call LIFF profile or ID-token APIs. It uses the LIFF URL as the LINE entry point, while all class selection stays in browser-local storage. Configure the LINE endpoint only after a deployment containing this route is live.
