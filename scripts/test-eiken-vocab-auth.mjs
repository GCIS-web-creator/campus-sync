import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEikenVocabSessionToken,
  verifyEikenVocabPassword,
  verifyEikenVocabSessionToken,
} from '../lib/eiken-vocab-auth.ts';

const SECRET = 'test-eiken-vocab-password';

test('creates a session accepted by the matching secret', () => {
  const now = 1_800_000_000_000;
  const session = createEikenVocabSessionToken(SECRET, now);
  assert.ok(session);
  assert.equal(verifyEikenVocabSessionToken(session.token, SECRET, now), true);
});

test('rejects a session signed with another password', () => {
  const now = 1_800_000_000_000;
  const session = createEikenVocabSessionToken(SECRET, now);
  assert.ok(session);
  assert.equal(verifyEikenVocabSessionToken(session.token, 'another-password-value', now), false);
});

test('rejects expired and tampered sessions', () => {
  const now = 1_800_000_000_000;
  const session = createEikenVocabSessionToken(SECRET, now);
  assert.ok(session);
  assert.equal(verifyEikenVocabSessionToken(session.token, SECRET, now + 8 * 60 * 60 * 1000 + 5000), false);
  const tampered = session.token.replace(/.$/, session.token.endsWith('a') ? 'b' : 'a');
  assert.equal(verifyEikenVocabSessionToken(tampered, SECRET, now), false);
});

test('requires an eight-character configured password and compares exact values', () => {
  assert.equal(createEikenVocabSessionToken('short', 1_800_000_000_000), null);
  assert.equal(verifyEikenVocabPassword('short', SECRET), false);
  assert.equal(verifyEikenVocabPassword(SECRET, SECRET), true);
  assert.equal(verifyEikenVocabPassword('not-the-password', SECRET), false);
});
