import { normalizeIsbn13 } from './pomodoro-timeline';

export type BookBarcodeResult =
  | { type: 'isbn'; isbn13: string }
  | { type: 'japanese-book-auxiliary'; classificationCode: string; priceYen: number }
  | { type: 'invalid' };

function hasValidEan13Checksum(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  const sum = [...value.slice(0, 12)].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
    0,
  );
  return (10 - (sum % 10)) % 10 === Number(value[12]);
}

/**
 * Japanese books commonly have two EAN-13 barcodes:
 * 978/979 ISBN and a 192-prefixed domestic supplementary code.
 * The supplementary code contains classification and price, not the ISBN.
 */
export function classifyBookBarcode(value: string): BookBarcodeResult {
  const raw = String(value || '').replace(/[\s-]/g, '').toUpperCase();
  const isbn13 = normalizeIsbn13(raw);
  if (isbn13) return { type: 'isbn', isbn13 };

  if (/^192\d{10}$/.test(raw) && hasValidEan13Checksum(raw)) {
    return {
      type: 'japanese-book-auxiliary',
      classificationCode: raw.slice(3, 7),
      priceYen: Number(raw.slice(7, 12)),
    };
  }

  return { type: 'invalid' };
}
