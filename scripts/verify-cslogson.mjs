#!/usr/bin/env node
/**
 * Offline verifier for CampusSync .cslogson exports.
 *
 * Usage:
 *   node scripts/verify-cslogson.mjs path/to/export.cslogson
 *
 * Supports chat audit exports and student profile snapshots. This checks the
 * JSON structure, event count, order, and SHA-256 hash chain.
 * A successful result detects no inconsistency in this file's chain; it does
 * not prove the identity of the exporter or that the source database was never
 * altered before export.
 */
import { createHash } from 'node:crypto';
import { stat, readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const MAX_FILE_BYTES = 512 * 1024 * 1024;
const ZERO_HASH = '0'.repeat(64);

function fail(message, code = 1) {
  console.error('検証失敗: ' + message);
  process.exitCode = code;
}

function isSha256(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function findCredentialField(value, path = '') {
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const nextPath = path ? path + '.' + key : key;
    if (/^(?:password|password_hash|encrypted_password|password_digest|admin_password|export_password|access_token|refresh_token|service_role_key|supabase_service_role_key)$/i.test(key)) {
      return nextPath;
    }
    const nested = findCredentialField(child, nextPath);
    if (nested) return nested;
  }
  return null;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath || filePath === '--help' || filePath === '-h') {
    console.log('使用方法: node scripts/verify-cslogson.mjs <file.cslogson>');
    console.log('JSON構造、イベント件数、順序、SHA-256ハッシュ連鎖を検証します。');
    process.exitCode = filePath ? 0 : 2;
    return;
  }

  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) return fail('指定パスはファイルではありません。', 2);
  if (fileStat.size > MAX_FILE_BYTES) return fail('ファイルが大きすぎます（上限512MiB）。', 2);

  const raw = await readFile(filePath, 'utf8');
  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch {
    return fail('JSONとして読み込めません。');
  }

  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return fail('最上位要素がJSONオブジェクトではありません。');
  const supportedFormats = new Set([
    'CampusSync Chat Log JSON',
    'CampusSync Student Profile Export',
  ]);
  if (!supportedFormats.has(pkg.format)) return fail('format が対応していません。');
  if (pkg.extension !== '.cslogson') return fail('extension が .cslogson ではありません。');
  if (pkg.schema_version !== '1.0') return fail('未対応の schema_version です。');
  if (!Array.isArray(pkg.events)) return fail('events が配列ではありません。');
  if (pkg.format === 'CampusSync Student Profile Export' && pkg.export_type !== 'student_profile_snapshot') {
    return fail('生徒プロフィール書き出しの export_type が不正です。');
  }
  if (pkg.format === 'CampusSync Student Profile Export') {
    for (let index = 0; index < pkg.events.length; index += 1) {
      const event = pkg.events[index];
      const prefix = 'イベント ' + (index + 1) + ': ';
      if (!event || typeof event !== 'object' || Array.isArray(event)) {
        return fail(prefix + 'プロフィールイベントがJSONオブジェクトではありません。');
      }
      if (event.event_type !== 'student_profile_export_snapshot' || event.source_table !== 'profiles') {
        return fail(prefix + 'プロフィールイベントの種類が不正です。');
      }
      const credentialPath = findCredentialField(event);
      if (credentialPath) {
        return fail(prefix + '認証情報らしいフィールドが含まれています: ' + credentialPath);
      }
    }
  }
  if (!Number.isSafeInteger(pkg.event_count) || pkg.event_count !== pkg.events.length) {
    return fail('event_count と events の件数が一致しません。');
  }
  if (!pkg.integrity || pkg.integrity.algorithm !== 'SHA-256 hash chain over each event JSON') {
    return fail('integrity.algorithm が不正です。');
  }
  if (pkg.integrity.initial_hash !== ZERO_HASH) return fail('initial_hash が一致しません。');

  let previousHash = ZERO_HASH;
  for (let index = 0; index < pkg.events.length; index += 1) {
    const event = pkg.events[index];
    const prefix = 'イベント ' + (index + 1) + ': ';
    if (!event || typeof event !== 'object' || Array.isArray(event)) return fail(prefix + 'JSONオブジェクトではありません。');
    const integrity = event.integrity;
    if (!integrity || integrity.algorithm !== 'SHA-256' || integrity.sequence !== index + 1) {
      return fail(prefix + 'integrity の形式または連番が不正です。');
    }
    if (!isSha256(integrity.previous_hash) || integrity.previous_hash !== previousHash) {
      return fail(prefix + 'previous_hash が一致しません。');
    }
    if (!isSha256(integrity.record_hash)) return fail(prefix + 'record_hash がSHA-256形式ではありません。');

    // Preserve JSON property insertion order exactly as parsed from the export.
    const eventData = { ...event };
    delete eventData.integrity;
    const canonicalRecord = JSON.stringify(eventData);
    const calculatedHash = createHash('sha256')
      .update(previousHash + '\n' + canonicalRecord, 'utf8')
      .digest('hex');
    if (calculatedHash !== integrity.record_hash) {
      return fail(prefix + 'record_hash が一致しません。ファイルが変更された可能性があります。');
    }
    previousHash = calculatedHash;
  }

  if (!isSha256(pkg.integrity.final_hash) || pkg.integrity.final_hash !== previousHash) {
    return fail('final_hash が一致しません。');
  }

  console.log('検証成功: ' + basename(filePath));
  console.log((pkg.export_type === 'student_profile_snapshot' ? 'プロフィール件数: ' : 'イベント件数: ') + pkg.events.length.toLocaleString('ja-JP'));
  console.log('最終ハッシュ: ' + previousHash);
  console.log('注意: これはファイル内の整合性検査であり、作成者の真正性やエクスポート前のデータベース状態を証明するものではありません。');
}

main().catch(error => {
  fail(error instanceof Error ? error.message : String(error), 2);
});
