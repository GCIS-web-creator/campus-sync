import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const migrationsDirectory = resolve(process.cwd(), 'supabase', 'migrations');
const entries = await readdir(migrationsDirectory);
const sqlFiles = entries.filter((name) => name.toLowerCase().endsWith('.sql'));
const errors = [];
const seenVersions = new Map();

for (const fileName of sqlFiles) {
  const match = fileName.match(/^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$/i);
  if (!match) {
    errors.push(`Invalid migration filename: ${fileName}`);
    continue;
  }

  const version = match[1];
  const [year, month, day, hour, minute, second] = [
    Number(version.slice(0, 4)),
    Number(version.slice(4, 6)),
    Number(version.slice(6, 8)),
    Number(version.slice(8, 10)),
    Number(version.slice(10, 12)),
    Number(version.slice(12, 14)),
  ];
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    errors.push(`Invalid migration timestamp: ${fileName}`);
  }

  const previous = seenVersions.get(version);
  if (previous) {
    errors.push(`Duplicate migration version ${version}: ${previous} and ${fileName}`);
  } else {
    seenVersions.set(version, fileName);
  }
}

if (sqlFiles.length === 0) {
  errors.push('No SQL migration files found in supabase/migrations.');
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[migration-check] ERROR: ${error}`);
  process.exitCode = 1;
} else {
  const versions = [...seenVersions.keys()].sort();
  console.log(
    `[migration-check] OK: ${versions.length} SQL migrations; unique 14-digit UTC versions from ${versions[0]} to ${versions.at(-1)}.`,
  );
}
