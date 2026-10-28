# CampusSync: encrypted off-site backup and restore

## Important privacy boundary

This repository is public. **Never commit SQL dumps, exported student data, encryption private keys, or database credentials to GitHub.** Obtain the school's approval before creating off-site copies of real student names, student IDs, school email addresses, chat records, or assignment information. Keep the destination bucket private and grant access only to approved maintainers.

The prepared GitHub Actions workflow encrypts its database archive with age before upload. It does not upload plaintext dumps. The workflow is not operational until all listed GitHub Actions secrets and variables are configured. No backup has been proven to exist until a manual workflow run succeeds and the encrypted object is visible in the private destination.

## Storage choice

Use a private S3-compatible object-storage bucket that is separate from the Supabase project (for example, an approved S3-compatible provider). Do not use this public repository, public release assets, or public GitHub Actions artifacts as the backup destination.

Create a private bucket, disable public access, and configure a lifecycle rule to delete the backup prefix after an approved retention period (for example, 30 days). Choose retention with the school; do not keep personal data indefinitely by default.

## Create an age encryption key

On a trusted computer, install the age tool and run:

```bash
age-keygen -o campus-sync-backup-identity.txt
```

The file contains the private identity. Keep it offline or in an approved password manager and **never upload it to GitHub**. Copy only the public recipient (the line beginning `age1...`) into the GitHub repository variable `BACKUP_AGE_RECIPIENT`. A backup encrypted to this recipient can only be decrypted by someone who has the matching private identity. Keep a second secure copy of the private identity so that losing the computer does not make every backup unrecoverable.

## Configure GitHub Actions

Repository → **Settings → Secrets and variables → Actions**.

Add these **Secrets**:

- `SUPABASE_DB_URL`: the database connection string from Supabase Dashboard → Connect. Use the direct/session-pooler connection recommended for your network, and URL-encode special characters in the password.
- `S3_ENDPOINT_URL`: the HTTPS S3 API endpoint of the private bucket provider.
- `S3_BUCKET`: the bucket name.
- `S3_ACCESS_KEY_ID`: access key restricted to this bucket/prefix and upload/list permissions needed by the workflow.
- `S3_SECRET_ACCESS_KEY`: the matching secret key.

Add these **Variables**:

- `S3_REGION`: the region required by the bucket provider (for Cloudflare R2, commonly `auto`).
- `BACKUP_AGE_RECIPIENT`: the age public recipient beginning with `age1...`. This is not the private key.

Start with **Actions → Supabase encrypted off-site backup → Run workflow**. Review the result and confirm that the uploaded object exists in the private bucket. Once configured, the workflow also runs daily at approximately 03:00 Japan time (GitHub Actions schedules can be delayed). A failed run means that a reliable backup has not been confirmed; review the workflow log without pasting secrets into chat or issue comments.

## What this workflow includes and excludes

It creates a logical dump of the application database schema and data using the Supabase CLI, then encrypts and uploads one archive.

It is **not a complete Supabase project image**:

- Supabase CLI dumps exclude the platform-managed `auth` and `storage` schemas. This workflow therefore does not back up Supabase Auth user records, sessions, or credentials.
- Database dumps do not contain the binary files stored using the Supabase Storage API. Cover images or other uploaded files need their own private backup/retention procedure.
- Environment variables, VAPID keys, Supabase keys, and third-party service credentials are not included. Keep them in a secure secret manager and document how to rotate them.
- A successful upload alone does not prove the backup can be restored.

Supabase documents daily managed database backups for Pro, Team, and Enterprise projects; for Free projects it recommends exporting database data with the CLI and maintaining off-site backups. Before going live, decide whether the project needs a paid managed-backup plan or additional approved processes for Auth and Storage. See the [official Supabase backup guide](https://supabase.com/docs/guides/platform/backups) and [CLI dump reference](https://supabase.com/docs/reference/cli/supabase-db-dump).

## Restore rehearsal

Do not test a restore against production. In a separate approved test project:

1. Download the encrypted archive from the private bucket.
2. Decrypt it on the trusted computer that holds the private age identity:

   ```bash
   age -d -i campus-sync-backup-identity.txt -o campus-sync-backup.tar.gz backup.tar.gz.age
   tar -tzf campus-sync-backup.tar.gz
   ```

3. Restore the schema and application data into the test database using the documented Supabase restore procedure. Review the target database and privileges before running SQL.
4. Check that key tables, RLS policies, indexes, functions, and application data exist, and that storage/auth limitations above are accounted for.
5. Record the rehearsal date and outcome without recording student data or secrets.

Run a restore rehearsal after major schema changes and periodically thereafter. Backups only help if the team can decrypt and restore them.
