# CampusSync HiAdmin setup

## Purpose and data boundary

`/hiadmin` is a separate, read-only highest-administrator console. It shows account metadata, profile fields, and per-user record counts. It does not expose passwords, password hashes, OTP values, TOTP secrets, private chat bodies, or attachment contents.

Opening an individual account summary writes an audit record to `public.hiadmin_audit_logs`. The audit table is inaccessible to `anon` and `authenticated`; only server-side `service_role` can access it.

## Required Vercel Production environment variables

- `CAMPUS_SYNC_HIADMIN_EMAILS`: exact school email address(es) that may use `/hiadmin`. Separate multiple addresses with commas or semicolons. Do not use wildcard domains.
- `SUPABASE_SERVICE_ROLE_KEY`: existing server-only Supabase service-role key. Never use a `NEXT_PUBLIC_` prefix and never paste the value into chat.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: existing public app configuration.

After adding/updating variables, redeploy Production. Until the allowlist exists, the endpoint fails closed and returns 503.

## First use

1. Sign in at `/hiadmin` with an existing school email account (email OTP; new account creation is disabled).
2. The server checks the exact email allowlist.
3. Register an authenticator app using the displayed QR code and verify a six-digit TOTP code. All data endpoints require AAL2.
4. Use the user list to search for an account. Opening a profile summary creates an audit record.

## Password policy

The student account password setup form requires at least 8 characters. It does not force numeric-only passwords; longer passphrases remain recommended. Existing passwords are not changed automatically. Passwords remain managed by Supabase Auth and are never copied into `profiles` or the HiAdmin audit log.

## Scope of this first release

The first version is read-only. It intentionally does not provide student-record deletion, chat-content browsing, arbitrary exports, or direct password viewing/reset. Any broader access to student information or account suspension/recovery should be approved by the school and implemented with narrower permissions and audit entries.
