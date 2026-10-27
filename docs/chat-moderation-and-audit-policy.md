# CampusSync Chat Moderation & Audit Policy (Draft)

Status: **Draft — not an approved school policy**

This document describes the intended implementation. A school administrator/privacy officer should approve the purposes, access rules, retention periods, disclosures, and incident procedures before this feature is used for real student conversations. This document does not claim that the system is legally compliant by itself.

## 1. Purpose and scope

The moderation system supports handling of reports, abusive or harmful messages, operational troubleshooting, and documenting moderation actions across class, grade, and school chats.

The intended audit events are:
- Current messages imported as a one-time `baseline_snapshot` when the Phase 5 migration runs.
- New messages, edits, and deletions after the migration.
- Reports submitted by students and report status changes.
- Administrative message removals, moderation notes, and log exports.

Events that happened before Phase 5 was enabled cannot be reconstructed. The baseline snapshot captures only messages that still exist when the migration runs; it does not recover earlier deleted messages or earlier versions of edited messages.

## 2. System of record and .cslogson format

- Supabase `public.chat_audit_logs` is the operational audit record.
- `.cslogson` is a JSON-based export format for approved retention and review workflows; it is not the primary database.
- Each exported event includes a SHA-256 chain value, previous hash, and sequence number. The export summary includes the final hash, which is also written to the audit table by the export operation.
- The hash chain can reveal accidental or unsophisticated changes to an exported file when compared with a trusted copy of the export record. It is **not** a digital signature and does not protect against an attacker who can alter both the export and the trusted database record.
- If stronger evidence integrity is required, periodically store exports and their final hashes in a separately controlled, append-only or object-locked repository. Separate administration credentials from the application database owner.

## 3. Access and operational security

- Browser clients must not receive `SUPABASE_SERVICE_ROLE_KEY`.
- Admin API requests use the existing `CAMPUS_SYNC_ADMIN_PASSWORD` and execute with server-side service-role credentials. The password must be sent only over HTTPS and must not be written to client storage or application logs.
- The present shared-password approach cannot reliably identify an individual staff member. The current audit label is therefore `admin_shared_password`, not a person's identity. Before relying on individual accountability, replace or augment this with named staff accounts, MFA where available, individual authorization roles, and a server-verified staff identifier.
- Audit table permissions deny ordinary browser users read/write access and deny the service role update/delete privileges on the audit table. Database owners and privileged operators can still change schema or data; this is not absolute immutability.
- Signed attachment links expire quickly. Do not copy them into public channels or permanent records.

## 4. Retention and privacy decisions required before launch

Do **not** assume unlimited retention is required merely because logs are useful. The school must decide and document:
1. Ordinary chat body retention period.
2. Whether reports, severe incidents, and legal/safeguarding holds use a different retention schedule.
3. How attachment objects are retained and removed, including whether report-linked attachments need a restricted hold.
4. Who can search full message bodies versus metadata only.
5. How students and guardians are informed about recording, monitoring, purposes, access, and retention.
6. How requests for correction, deletion, incident response, and legal hold are handled.
7. Who approves exports and where exported files may be stored.

Do not add automatic deletion until an approved schedule exists. Conversely, do not describe the current system as permission to retain personal information forever. After policy approval, implement a reviewed retention workflow with dry-run reports, audit events, and a separate approval/hold mechanism.

## 5. Moderation workflow

1. A student submits a report linked to a specific message.
2. The report stores a snapshot of the reported message, including its body and attachment metadata, so deleting the live message does not erase the report context.
3. A moderator changes the report to `reviewing`, `resolved`, or `dismissed` and can add a moderation note.
4. Administrative deletion requires a reason.
5. The database mutation and corresponding audit event are performed in one database transaction via server-only RPC functions. If the event cannot be recorded, the transaction should fail rather than deleting the message without an audit entry.
6. Exports require a privacy acknowledgement and should be stored only in a school-approved location.

## 6. .cslogson fields

The export is JSON with:
- `format`, `extension`, and `schema_version`
- export timestamp and requested date range
- event count
- an integrity summary with algorithm, initial hash, and final hash
- an ordered `events` array containing audit events and their per-event integrity fields

Exports may include student names, student numbers, message bodies, report details, or attachment paths. Treat them as confidential records.

## 7. Deployment checklist

- Confirm the school has approved purposes, disclosure, role/access model, and retention rules.
- Confirm Vercel has `CAMPUS_SYNC_ADMIN_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` configured as server environment variables.
- Run Phase 2, Phase 3, Phase 4, then Phase 5 SQL in the Supabase SQL Editor, unless earlier phases were already applied successfully. Review the SQL migration before running it against production.
- Verify reports, snapshot capture, student create/edit/delete audit events, admin status updates, admin deletions, and export integrity using test data.
- Check that the admin API is not accessible without the password and that service-role credentials never appear in browser bundles or client requests.
- Verify Vercel's production build and a real end-to-end test. A successful GitHub commit alone is not evidence that the database migration or deployment succeeded.
