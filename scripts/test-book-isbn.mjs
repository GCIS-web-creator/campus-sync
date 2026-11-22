import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBookBarcode, normalizeBookIsbn, toIsbn10 } from '../lib/book-isbn.ts';
import { parseNdlOpenSearch, buildBookCoverCandidates } from '../lib/book-catalog.ts';

test('recognizes the Japanese book ISBN barcode', () => {
  assert.deepEqual(classifyBookBarcode('9784342353093'), {
    type: 'isbn', isbn13: '9784342353093',
  });
});

test('recognizes the Japanese book supplementary price barcode', () => {
  assert.deepEqual(classifyBookBarcode('1927081009007'), {
    type: 'japanese-book-auxiliary', classificationCode: '7081', priceYen: 900,
  });
});

test('accepts GS1 prefixes and EAN add-on digits', () => {
  assert.deepEqual(classifyBookBarcode(']E09784342353093 12345'), {
    type: 'isbn', isbn13: '9784342353093',
  });
  assert.deepEqual(classifyBookBarcode('978434235309312345'), {
    type: 'isbn', isbn13: '9784342353093',
  });
});

test('accepts hyphenated ISBN and ISBN-10', () => {
  assert.deepEqual(classifyBookBarcode('978-4-342-35309-3'), {
    type: 'isbn', isbn13: '9784342353093',
  });
  assert.deepEqual(classifyBookBarcode('0-306-40615-2'), {
    type: 'isbn', isbn13: '9780306406157',
  });
  assert.equal(normalizeBookIsbn('0-306-40615-2'), '9780306406157');
  assert.equal(toIsbn10('9780306406157'), '0306406152');
});

test('rejects invalid EAN check digits and unrelated product codes', () => {
  assert.deepEqual(classifyBookBarcode('1927081009008'), { type: 'invalid' });
  assert.deepEqual(classifyBookBarcode('4901234567890'), { type: 'invalid' });
});

test('parses only NDL metadata whose ISBN matches the scan', () => {
  const xml = [
    '<rss><channel>',
    '<item><dc:title>別の本</dc:title><dc:identifier>ISBN 9780000000002</dc:identifier></item>',
    '<item>',
    '<dc:title>古文単語の本 &amp; 改訂版</dc:title>',
    '<dc:creator>山田 太郎</dc:creator><dc:creator>佐藤 花子</dc:creator>',
    '<dc:publisher>出版社</dc:publisher><dc:date>2024</dc:date>',
    '<dc:identifier>ISBN 9784342353093</dc:identifier>',
    '<link>https://ndlsearch.ndl.go.jp/books/R100000002-I123</link>',
    '</item></channel></rss>',
  ].join('');
  assert.deepEqual(parseNdlOpenSearch(xml, '9784342353093', '4342353097'), {
    title: '古文単語の本 & 改訂版',
    authors: ['山田 太郎', '佐藤 花子'],
    publisher: '出版社',
    published_date: '2024',
    info_url: 'https://ndlsearch.ndl.go.jp/books/R100000002-I123',
  });
  assert.equal(parseNdlOpenSearch(xml, '9781111111111', null), null);
});

test('cover candidates include NDL and Open Library and remove duplicate/insecure URLs', () => {
  assert.deepEqual(buildBookCoverCandidates('9784342353093', [
    'https://cdn.example.jp/cover.jpg',
    'http://not-secure.example/cover.jpg',
    'https://cdn.example.jp/cover.jpg',
  ]), [
    'https://cdn.example.jp/cover.jpg',
    'https://thumbnail-s.images.books.or.jp/9784342353093.jpg',
    'https://ndlsearch.ndl.go.jp/thumbnail/9784342353093.jpg',
    'https://covers.openlibrary.org/b/isbn/9784342353093-L.jpg?default=false',
  ]);
});


test('recognizes ISBN for Focus Gold 6th Edition Mathematics II+B+Vector', () => {
  assert.equal(normalizeBookIsbn('978-4-402-26291-4'), '9784402262914');
  assert.deepEqual(classifyBookBarcode('9784402262914'), {
    type: 'isbn', isbn13: '9784402262914',
  });
});


test('includes the Japanese Books.or.jp cover endpoint for a new ISBN', () => {
  assert.ok(buildBookCoverCandidates('9784327764951').includes(
    'https://thumbnail-s.images.books.or.jp/9784327764951.jpg',
  ));
});
