// Pure logic of the catalogue administration page (R-022). No Supabase import, so Vitest loads it without
// environment variables.
import { itemKey } from './catalog';

export type CatalogKind = 'ingredient' | 'unit';

export interface CatalogItemInput {
  nameNl: string | null;
  nameFr: string | null;
  synonyms: string[];
}

export type CatalogValidation = 'noName' | 'nameTooLong' | 'synonymTooLong' | 'tooManySynonyms' | 'duplicateKey';

/** Same limits as the database (R-018 crit. 1), counted in characters. */
const MAX_LENGTH: Record<CatalogKind, number> = { ingredient: 80, unit: 20 };
export const MAX_SYNONYMS = 20;

const length = (s: string) => [...s].length;

/** Checks an item on the device before it is sent; the database checks it again. null = fine. */
export function validateCatalogItem(kind: CatalogKind, item: CatalogItemInput): CatalogValidation | null {
  const max = MAX_LENGTH[kind];
  const names = [item.nameNl, item.nameFr].map((n) => (n ?? '').trim()).filter((n) => n !== '');
  const synonyms = item.synonyms.map((s) => s.trim()).filter((s) => s !== '');
  if (names.length === 0) return 'noName';
  if (names.some((n) => length(n) > max)) return 'nameTooLong';
  if (synonyms.some((s) => length(s) > max)) return 'synonymTooLong';
  if (synonyms.length > MAX_SYNONYMS) return 'tooManySynonyms';
  // The two names may be equal (same word in both languages); a synonym may not repeat any other entry.
  const seen = new Set(names.map(itemKey));
  for (const s of synonyms) {
    const key = itemKey(s);
    if (seen.has(key)) return 'duplicateKey';
    seen.add(key);
  }
  return null;
}

export type CatalogErrorKind =
  | { kind: 'exists'; itemId: string }
  | { kind: 'inUse'; count: number }
  | { kind: 'invalid' }
  | { kind: 'tooManySynonyms' }
  | { kind: 'forbidden' }
  | { kind: 'unknown' };

/** Turns a database error into something the page can show; the database returns codes, not sentences. */
export function mapCatalogError(error: { code?: string; details?: string | null; message?: string }): CatalogErrorKind {
  const details = (error.details ?? '').trim();
  if (error.code === '23505' && details !== '') return { kind: 'exists', itemId: details };
  if (error.code === '23503' && /^\d+$/.test(details)) return { kind: 'inUse', count: Number(details) };
  if (error.code === '23514' && details === 'too_many_synonyms') return { kind: 'tooManySynonyms' };
  if (error.code === '23514') return { kind: 'invalid' };
  if (error.code === '42501') return { kind: 'forbidden' };
  return { kind: 'unknown' };
}
