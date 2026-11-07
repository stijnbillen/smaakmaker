// Pure logic of the ingredient and unit picker in the recipe form (R-020). No Supabase import, so unit
// tests load it without environment variables.
import { displayName, itemKey, suggestionLabel, type CatalogItem, type CatalogLang } from './catalog';
import type { Suggestion } from './suggest';

/** At most this many suggestions or "did you mean" options (R-019). */
export const MAX_OPTIONS = 5;
const MIN_TERM = 2;

/** Suggestions are fetched from 2 typed characters, after trimming. */
export const shouldFetch = (term: string): boolean => [...term.trim()].length >= MIN_TERM;

export type Resolution =
  | { action: 'none' }
  | { action: 'invalid' }
  | { action: 'link'; item: CatalogItem }
  | { action: 'didYouMean'; options: CatalogItem[] }
  | { action: 'askNew' };

const itemOf = (row: Suggestion): CatalogItem => ({ id: row.id, nameNl: row.nameNl, nameFr: row.nameFr });

/**
 * What to do when the user leaves a field whose text changed. `rows` come from the `didYouMean` mode of
 * R-019; begins-with rows are no suggestion here. `max` is the longest text a name (80) or unit (20) may have.
 */
export function resolveOnLeave(text: string, rows: readonly Suggestion[], max: number): Resolution {
  const trimmed = text.trim();
  if (trimmed === '') return { action: 'none' };
  if ([...trimmed].length > max) return { action: 'invalid' };
  const exact = rows.find((r) => r.matchKind === 'exact');
  if (exact) return { action: 'link', item: itemOf(exact) };
  const similar = rows.filter((r) => r.matchKind === 'similar').slice(0, MAX_OPTIONS);
  if (similar.length > 0) return { action: 'didYouMean', options: similar.map(itemOf) };
  return { action: 'askNew' };
}

/**
 * The text of a suggestion. The database returns one row per item, with the first key that matched; when the
 * item's own shown name also begins with what was typed, that name is the better label than a synonym.
 */
export function optionLabel(row: Suggestion, lang: CatalogLang, typed: string): string {
  const name = displayName(row, lang);
  const key = itemKey(typed);
  return key !== '' && itemKey(name).startsWith(key) ? name : suggestionLabel(row, lang);
}

/** The open question of one field. */
export type PendingQuestion =
  | { kind: 'didYouMean'; text: string; options: CatalogItem[] }
  | { kind: 'askNew'; text: string };

/** Names of the options for the question text, in the interface language. */
export const optionNames = (options: readonly CatalogItem[], lang: CatalogLang): string =>
  options.map((o) => displayName(o, lang)).join(' / ');
