// Tag rules shared by the form and the filter (R-010). The database enforces the same limits and decides on
// reuse; this client side gives a message at the field and picks the right button.
// No database import here: the unit tests load this file without a Supabase configuration.

export { TAGS_MAX_ITEMS } from './recipe';
export const TAG_NAME_MAX = 30;

/** Groups of tags; a second group is added here and in the tag filter table. */
export type TagKind = 'dish' | 'trait';

/** Counts code points after trimming, like the database does with its trim and char_length. */
const length = (value: string): number => [...value.trim()].length;

export type TagNameResult = { ok: true } | { ok: false; error: 'tagInvalid' };

export function validateTagName(name: string): TagNameResult {
  const n = length(name);
  return n >= 1 && n <= TAG_NAME_MAX ? { ok: true } : { ok: false, error: 'tagInvalid' };
}

/** Case- and accent-insensitive key; same outcome as the database's fold_key for Latin text. */
export function tagKey(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('nl');
}

/** Adds a typed name: an existing spelling (selected first, then catalogue) wins over the typed one. */
export function addTag(selected: readonly string[], catalog: readonly string[], input: string): string[] {
  const key = tagKey(input);
  if (selected.some((name) => tagKey(name) === key)) return [...selected];
  const known = catalog.find((name) => tagKey(name) === key);
  return [...selected, known ?? input.trim()];
}

export function toggleTag(selected: readonly string[], name: string): string[] {
  return selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name];
}
