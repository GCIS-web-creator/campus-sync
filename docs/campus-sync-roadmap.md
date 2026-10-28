# CampusSync development roadmap

This roadmap tracks the requested features and defines the order that minimizes risk to existing student data and existing functionality.

## Current work: notification customization

- [x] Add category switches to the student notification settings UI.
- [x] Add configurable quiet hours, alongside reminder time and weekday controls.
- [x] Store preferences in `push_reminder_preferences` so they can be loaded across sessions/devices.
- [x] Make scheduled task reminders respect the `todo_reminders` switch and move a scheduled reminder out of a quiet-hours window to the configured end time.
- [x] Add a repeatable Supabase migration: `supabase/notification-preferences.sql`.
- [ ] Run the migration against the actual Supabase project.
- [ ] Verify load/save from two sessions and test enabled/disabled reminder categories and quiet-hour boundaries.
- [ ] Wire the other notification categories into actual event producers. At present, chat, school announcements, transport, cafeteria, and activity switches are persisted as preferences; they do not by themselves create push events or suppress event senders that have not yet been connected.
- [ ] Confirm production deploy and run an end-to-end test push plus a scheduled reminder.

## Phase 0 — release and data-safety foundation

1. Apply and review the SQL migrations in Supabase SQL Editor.
2. Audit RLS policies for every table that contains profiles, private chats, submissions, subscriptions, and notification settings. Test with two student accounts in different classes, a guest, and an Admin account.
3. Verify GitHub Actions build checks and Vercel deployment status before announcing a release.
4. Add a documented pre-release and post-release smoke-test checklist.
5. Keep all test accounts and sample content separate from real school data.

**Acceptance criteria:** the build succeeds; deployed commit matches GitHub `main`; login, notification settings, chat, and primary student pages pass the smoke tests; one student cannot query another student's private data.

## Phase 1 — complete notification customization

1. Add sender integration for each category: chat messages, school/teacher announcements, transport, cafeteria, and activity updates.
2. Respect a user's category preference on the server before sending a push. Do not rely on client-only hiding for privacy or notification delivery.
3. Define duplicate suppression and send histories for each notification category.
4. Add immediate/digest preference only after a digest scheduler and user-facing timing behavior are implemented.
5. Clearly explain browser/OS notification permission: application settings cannot override a browser or operating-system block.

**Acceptance criteria:** each category can be turned on/off independently; settings persist; quiet hours behave consistently; repeated cron runs do not send duplicate alerts; test notification behavior is documented.

## Phase 2 — "Today's CampusSync" home and integrated calendar

Build one shared calendar view using existing sources instead of copying records into a second source of truth:

- timetable periods for today and the next class;
- personal and Admin-assigned deadlines;
- school events and teacher announcements;
- opt-in calendar export/subscription, with private student details kept private;
- filters for today, this week, overdue, and completed.

Start with read-only aggregation, then add calendar export. Google Classroom integration can later add imported assignments with stable external IDs and explicit OAuth scope.

**Acceptance criteria:** every item shows its source and date/time; changing the source data updates the calendar; private items are visible only to the matching student; timezone handling is tested.

## Phase 3 — account protection and recovery

- Add a Supabase Auth password-reset flow with a verified school-email address and approved redirect URL.
- Explain expired links and provide safe retry messages; never expose whether a different user's account exists.
- Add server-side login/rate limits and session/logout controls where supported.
- Replace the shared Admin password with individual staff identities and explicit server-checked roles before treating Admin as production-ready.
- Keep password credentials exclusively in Supabase Auth; never export passwords or hashes.

**Acceptance criteria:** password reset succeeds only for the authenticated email flow; redirect URLs are allow-listed; revoked/stale sessions stop accessing protected functions; student accounts cannot call privileged Admin APIs.

## Phase 4 — chat safety

- Report message/user, mute/block, and per-user notification controls.
- Rate-limit posts and repeated reports on the server.
- Give moderators a triage queue, clear actions, appeal/contact path, and append-only audit trail.
- Enforce class/year/school audiences in RLS and server handlers, never only in the UI.
- Add tests for cross-class reads/writes, deleted/hidden posts, attachment access, and concurrent moderation actions.

**Acceptance criteria:** blocked/muted chat notifications do not reach the user; restricted messages cannot be fetched via direct API; moderation actions are auditable without broadly exposing reporter identity.

## Phase 5 — encrypted off-site backup and restore

The workflow at `.github/workflows/supabase-backup.yml` is prepared, but it will not create a usable backup until the required secrets/variables and a private S3-compatible destination are configured.

- Encrypt logical SQL dumps before upload; never commit dump files or upload plaintext student data to this public repository.
- Configure approved retention and access restrictions on the private bucket.
- Document limitations: the standard CLI dump excludes platform-managed Auth and Storage schemas and does not include Storage object bytes.
- Test a restore in a separate project before relying on the backup.

**Acceptance criteria:** a scheduled run succeeds; encrypted archive is visible in a private bucket; decryption is tested offline; test restore succeeds; the retention policy is verified.

## Phase 6 — error monitoring

- Use the current Vercel build/runtime logs for immediate diagnosis and introduce a provider such as Sentry only after privacy/settings review.
- Add a typed error boundary and a small correlation/request ID for server errors.
- Redact email, student ID, message text, auth tokens, database URL, and passwords from logs.
- Add health checks for the push scheduler and a safe status dashboard; never display environment secrets in Admin.

**Acceptance criteria:** intentional test error can be found by request ID; telemetry omits personal content and secrets; recurring failed cron/builds create an actionable alert.

## Phase 7 — offline support and accessibility

- Cache the app shell and explicitly approved non-sensitive/static resources first.
- Add offline/online status and safe retry states. Do not queue chat posts or sensitive writes until conflict handling and account switching have been tested.
- Add accessible labels, keyboard navigation, visible focus, sufficient contrast, reduced-motion support, scalable text, and status announcements for dynamic content.

**Acceptance criteria:** offline mode does not expose the prior user's private data after account switching; pending writes are clearly marked; primary flows work with keyboard and screen reader; reduced-motion settings are respected.

## Release principle

Code in GitHub, successful CI, successful Vercel deployment, SQL applied in Supabase, and verified runtime behavior are five separate checkpoints. Do not mark a feature complete until all relevant checkpoints have passed.
