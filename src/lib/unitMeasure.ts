// Kind and factor of a unit (R-033). No Supabase import, so unit tests load it without environment variables.
import fr from '../i18n/fr.json';
import nl from '../i18n/nl.json';

/** Database values (English); the words for the user live in nl.json / fr.json. */
export type UnitMeasure = 'volume' | 'weight' | 'none';

export const MAX_FACTOR = 100000;

/**
 * Reads a factor typed by the user: comma or point as decimal mark, at most 3 decimals, more than 0 and at
 * most 100000. null = invalid. No thousands separator: "100.000" is 100, as with quantities.
 */
export function parseFactor(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+([.,]\d{1,3})?$/.test(trimmed)) return null;
  const value = Number(trimmed.replace(',', '.'));
  return value > 0 && value <= MAX_FACTOR ? value : null;
}

/** The same rule for a number that is already parsed (administration): 0 < factor <= 100000, 3 decimals. */
export function isValidFactor(value: number | null | undefined): boolean {
  if (value === null || value === undefined || !Number.isFinite(value)) return false;
  return value > 0 && value <= MAX_FACTOR && Math.round(value * 1000) / 1000 === value;
}

/**
 * Link target of "Zoek op Google": the search for "1 <unit> in ml" (or g). Built here and opened by the user's
 * tap on a plain link; the app itself never sends anything to Google.
 */
export function googleSearchUrl(unit: string, base: 'ml' | 'g', lang: 'nl' | 'fr'): string {
  const texts: Record<string, string> = lang === 'fr' ? fr : nl;
  const template = texts[base === 'ml' ? 'form.googleQueryVolume' : 'form.googleQueryWeight'];
  const query = template.replace(/\{name\}/g, unit.trim());
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
