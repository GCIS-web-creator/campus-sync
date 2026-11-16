#!/usr/bin/env node
import { createHmac } from 'node:crypto';

const secret = process.env.CAMPUS_SYNC_ADMIN_DATE_CODE_SECRET || '';
if (secret.length < 32) {
  console.error('CAMPUS_SYNC_ADMIN_DATE_CODE_SECRET must contain at least 32 characters.');
  process.exit(1);
}

const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).formatToParts(new Date());
const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
const date = `${values.year}${values.month}${values.day}`;
const digest = createHmac('sha256', secret)
  .update('campussync-admin-date-code:v1:' + date)
  .digest();
const suffix = String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0');
console.log(date + '-' + suffix);
