export type BookBarcodeResult =
  | { type: 'isbn'; isbn13: string }
  | { type: 'japanese-book-auxiliary'; classificationCode: string; priceYen: number }
  | { type: 'invalid' };

function cleanBarcodeValue(value: string): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^\](?:E|C|d)[0-9]/, '')
    .replace(/[\s-]/g, '');
}

function isValidIsbn13(value: string): boolean {
  if (!/^97[89]\d{10}$/.test(value)) return false;
  const sum = [...value.slice(0, 12)].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1),
    0,
  );
  return (10 - (sum % 10)) % 10 === Number(value[12]);
}

function isbn10ToIsbn13(value: string): string | null {
  if (!/^\d{9}[\dX]$/.test(value)) return null;
  const sum = [...value].reduce(
    (total, char, index) => total + (char === 'X' ? 10 : Number(char)) * (10 - index),
    0,
  );
  if (sum % 11 !== 0) return null;
  const base = '978' + value.slice(0, 9);
  const isbnSum = [...base].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1),
    0,
  );
  return base + String((10 - (isbnSum % 10)) % 10);
}

/** Normalize ISBN-10 or ISBN-13 to a verified ISBN-13. */
export function normalizeBookIsbn(value: string): string | null {
  const raw = cleanBarcodeValue(value);
  if (isValidIsbn13(raw)) return raw;
  return isbn10ToIsbn13(raw);
}

/** Derive the ISBN-10 form of a 978 ISBN-13, when one exists. */
export function toIsbn10(isbn13: string): string | null {
  if (!isValidIsbn13(isbn13) || !isbn13.startsWith('978')) return null;
  const base = isbn13.slice(3, 12);
  const sum = [...base].reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const check = (11 - (sum % 11)) % 11;
  return base + (check === 10 ? 'X' : String(check));
}

function hasValidEan13Checksum(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  const sum = [...value.slice(0, 12)].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
    0,
  );
  return (10 - (sum % 10)) % 10 === Number(value[12]);
}

/**
 * Classifies scanner output from phone cameras and common hardware scanners.
 * Supports ISBN-10, ISBN-13, GS1 symbology prefixes and EAN-5 add-ons.
 */
export function classifyBookBarcode(value: string): BookBarcodeResult {
  const raw = cleanBarcodeValue(value);
  const isbnMatch = raw.match(/97[89]\d{10}/);
  if (isbnMatch && isValidIsbn13(isbnMatch[0])) {
    return { type: 'isbn', isbn13: isbnMatch[0] };
  }

  const auxiliaryMatch = raw.match(/192\d{10}/);
  if (auxiliaryMatch && hasValidEan13Checksum(auxiliaryMatch[0])) {
    const code = auxiliaryMatch[0];
    return {
      type: 'japanese-book-auxiliary',
      classificationCode: code.slice(3, 7),
      priceYen: Number(code.slice(7, 12)),
    };
  }

  const isbn10Match = raw.match(/\d{9}[\dX]/);
  if (isbn10Match) {
    const isbn13 = isbn10ToIsbn13(isbn10Match[0]);
    if (isbn13) return { type: 'isbn', isbn13 };
  }

  return { type: 'invalid' };
}
