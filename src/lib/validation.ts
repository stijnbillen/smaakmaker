// Same rules as the database (checks on profiles); the client validates first for a clear message at the field.

// Deliberately simple: one @, no spaces, a dot in the domain. The mail server has the final word.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 40;

/** Counts after trimming, like the database does with `btrim` and `char_length`. */
export function isValidDisplayName(value: string): boolean {
  const length = [...value.trim()].length; // code points, as char_length counts characters
  return length >= DISPLAY_NAME_MIN && length <= DISPLAY_NAME_MAX;
}

export function isSixDigitCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}
