# CampusSync HiAdmin setup

## Purpose and data boundary

`/hiadmin` is a separate, read-only highest-administrator console. It shows account metadata, profile fields, and per-user record counts. It does not expose passwords, password hashes, OTP values, private chat bodies, or attachment contents.

Opening an individual account summary writes an audit record to `public.hiadmin_audit_logs`. The audit table and gate-attempt table are inaccessible to `anon` and `authenticated`; only server-side `service_role` can access them.

## Required Vercel Production environment variables

- `CAMPUS_SYNC_HIADMIN_EMAILS`: exact school email address(es) that may use `/hiadmin`. Separate multiple addresses with commas or semicolons. Do not use wildcard domains.
- `CAMPUS_SYNC_HIADMIN_PASSWORD_2`: a unique HiAdmin passphrase of at least 16 characters.
- `CAMPUS_SYNC_HIADMIN_PASSWORD_3`: a different unique HiAdmin passphrase of at least 16 characters.
- `SUPABASE_SERVICE_ROLE_KEY`: existing server-only Supabase service-role key. Never use a `NEXT_PUBLIC_` prefix and never paste the value into chat.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: existing public app configuration.

The three gates are (1) the existing CampusSync account email/password, (2) the HiAdmin passphrase 2, and (3) the different HiAdmin passphrase 3. OTP alone is not accepted for HiAdmin sign-in. Use long, unique passphrases; do not reuse the CampusSync account password or each other. Keep the two HiAdmin values only in Vercel server environment variables. They are never sent to the database and are not saved to browser storage. Requests send them over HTTPS to the server for comparison.

After adding/updating variables, redeploy Production. Until all settings exist, the endpoint fails closed.

## First use

1. Sign in at `/hiadmin` with an existing school email and its CampusSync password (new account creation is disabled).
2. The server checks the exact email allowlist.
3. Enter both separate HiAdmin passphrases.
4. Five incorrect combinations cause a 15-minute lockout for that account.
5. Use the user list to search for an account. Opening a profile summary creates an audit record.

## Password policy

The student account password setup form requires at least 8 characters. Longer passphrases are recommended. Existing passwords are not changed automatically. Passwords remain managed by Supabase Auth and are never copied into `profiles` or the HiAdmin audit log.

## Scope of this first release

The first version is read-only. It intentionally does not provide student-record deletion, chat-content browsing, arbitrary exports, or direct password viewing/reset. Any broader access to student information or account suspension/recovery should be approved by the school and implemented with narrower permissions and audit entries.
