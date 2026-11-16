# CampusSync Admin login security

The Admin login at `/admin-login` supports either of these methods:

1. The existing `CAMPUS_SYNC_ADMIN_PASSWORD`.
2. Today's date in Japan Standard Time as eight digits (`YYYYMMDD`) plus a six-digit confirmation code.

## Confirmation code configuration

Set `CAMPUS_SYNC_ADMIN_DAILY_CODE` in the Vercel project's server-side Environment Variables. The value must be exactly six digits. Do not add it to GitHub, client-side code, or any `NEXT_PUBLIC_` variable.

This is a shared secret configured by the project administrator. It is not automatically generated, emailed, or rotated each day. The date is checked by the server against the current date in `Asia/Tokyo`; the date entered by the browser is not trusted.

Keep `CAMPUS_SYNC_ADMIN_PASSWORD` configured as well. The existing password method remains available, and the date-plus-code method is an alternative.

## Lockout and audit history

- Five failed login attempts from the same IP fingerprint trigger a 15-minute lockout.
- Successful login resets the failure counter for that fingerprint.
- The IP is stored only as an HMAC-SHA256 fingerprint, not as a plaintext address.
- `admin_auth_audit_logs` records the method, outcome, reason code, hashed IP, user-agent, and timestamp. Passwords and confirmation codes are never written to the audit log.
- The attempt and audit tables are protected with RLS and have no table privileges granted to `anon` or `authenticated`; the server uses `SUPABASE_SERVICE_ROLE_KEY` only.

Admin sessions continue to expire after eight hours.
