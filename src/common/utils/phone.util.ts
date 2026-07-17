/**
 * Normalizes Egyptian mobile phone numbers to a canonical form: `01XXXXXXXXX`
 * (11 digits, local format, no country code, no separators).
 *
 * Accepts: +20XXXXXXXXXX, 0020XXXXXXXXXX, 20XXXXXXXXXX, 01XXXXXXXXX, with
 * spaces/dashes/parens in between.
 */
export function normalizeEgyptianPhone(raw: string): string {
  let digits = raw.replace(/[^\d+]/g, '');
  digits = digits.replace(/^\+/, '');

  if (digits.startsWith('0020')) {
    digits = digits.slice(4);
  } else if (digits.startsWith('20') && digits.length === 12) {
    digits = digits.slice(2);
  }

  if (digits.length === 10 && digits.startsWith('1')) {
    digits = `0${digits}`;
  }

  return digits;
}

export function isValidEgyptianPhone(normalized: string): boolean {
  return /^01[0125]\d{8}$/.test(normalized);
}
