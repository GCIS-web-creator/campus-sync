import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBookBarcode } from '../lib/book-isbn.ts';

test('recognizes the Japanese book ISBN barcode', () => {
  assert.deepEqual(classifyBookBarcode('9784342353093'), {
    type: 'isbn',
    isbn13: '9784342353093',
  });
});

test('recognizes the Japanese book supplementary price barcode', () => {
  assert.deepEqual(classifyBookBarcode('1927081009007'), {
    type: 'japanese-book-auxiliary',
    classificationCode: '7081',
    priceYen: 900,
  });
});

test('accepts hyphenated ISBN input and ISBN-10', () => {
  assert.deepEqual(classifyBookBarcode('978-4-342-35309-3'), {
    type: 'isbn',
    isbn13: '9784342353093',
  });
  assert.deepEqual(classifyBookBarcode('0-306-40615-2'), {
    type: 'isbn',
    isbn13: '9780306406157',
  });
});

test('rejects invalid EAN check digits and unrelated product codes', () => {
  assert.deepEqual(classifyBookBarcode('1927081009008'), { type: 'invalid' });
  assert.deepEqual(classifyBookBarcode('4901234567890'), { type: 'invalid' });
});
