# CampusSync Admin login security

The Admin login at `/admin-login` supports either of these methods:

1. The existing `CAMPUS_SYNC_ADMIN_PASSWORD`.
2. Today's date in Japan Standard Time as eight digits (`YYYYMMDD`) plus a six-digit confirmation code.

## Confirmation code configuration (Cloudflare Workers)

The active CampusSync runtime is the Cloudflare Worker named `campus-sync`. Configure the confirmation code as a **Worker Secret**, not as a Vercel environment variable.

In the Cloudflare dashboard:

1. Open **Workers & Pages**.
2. Select the `campus-sync` Worker.
3. Open **Settings → Variables and Secrets**.
4. Add a secret named `CAMPUS_SYNC_ADMIN_DAILY_CODE`.
5. Set its value to exactly six digits, then save.

Do not add the code to GitHub, client-side code, or any `NEXT_PUBLIC_` variable. Do not paste the secret into chat.

This is a shared secret configured by the project administrator. It is not automatically generated, emailed, or rotated each day. The date is checked by the server against the current date in `Asia/Tokyo`; the date entered by the browser is not trusted.

Keep `CAMPUS_SYNC_ADMIN_PASSWORD` configured as well. The existing password method remains available, and the date-plus-code method is an alternative.

The Worker currently uses the `nodejs_compat` compatibility flag and a compatibility date after 2025-04-01, so configured Worker secrets are available to server code through `process.env`. See [Cloudflare: Access your Worker's environment variables from process.env](https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/#processenv).

## Lockout and audit history

- Five failed login attempts from the same IP fingerprint trigger a 15-minute lockout.
- Successful login resets the failure counter for that fingerprint.
- The IP is stored only as an HMAC-SHA256 fingerprint, not as a plaintext address.
- `admin_auth_audit_logs` records the method, outcome, reason code, hashed IP, user-agent, and timestamp. Passwords and confirmation codes are never written to the audit log.
- The attempt and audit tables are protected with RLS and have no table privileges granted to `anon` or `authenticated`; the server uses `SUPABASE_SERVICE_ROLE_KEY` only.

Admin sessions continue to expire after eight hours.

## Deployment

Committing application source to GitHub does not by itself update this Worker. The production Worker is deployed through Wrangler. Deploy only after reviewing the build and the intended Cloudflare account and Worker target.
