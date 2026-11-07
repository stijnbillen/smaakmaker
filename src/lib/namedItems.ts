// Tags and equipment have a canonical Dutch name and an optional French name (R-024). Shared by both lists.
// No database import here: the unit tests load this file without a Supabase configuration.

import type { Language as Lang } from '../i18n/language';

export interface NamedItem {
  /** Canonical (Dutch) name: what recipes store and what the URL keeps. */
  name: string;
  /** French name; null for items added by users, which show one name in both languages. */
  nameFr: string | null;
}

/** Case- and accent-insensitive key; same outcome as the database's fold_key for Latin text. */
export function nameKey(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('nl');
}

/** The French name in French when there is one, otherwise the canonical name. */
export function shownName(item: NamedItem, lang: Lang): string {
  return lang === 'fr' && item.nameFr ? item.nameFr : item.name;
}

/** Looks up an item by the key of either of its names. */
export function findItem(items: readonly NamedItem[], input: string): NamedItem | undefined {
  const key = nameKey(input);
  return items.find((item) => nameKey(item.name) === key || (item.nameFr !== null && nameKey(item.nameFr) === key));
}

/** Sorted copy by shown name, case- and accent-insensitive in the reader's (Belgian) locale. */
export function sortByShownName<T extends NamedItem>(items: readonly T[], lang: Lang): T[] {
  const collator = new Intl.Collator(lang === 'fr' ? 'fr-BE' : 'nl-BE', { sensitivity: 'base' });
  return [...items].sort((a, b) => collator.compare(shownName(a, lang), shownName(b, lang)));
}

/**
 * Adds a typed name: an item already selected (by either name) is not added twice; a catalogue item gives
 * its canonical name; an unknown name is added trimmed.
 */
export function addNamed(selected: readonly string[], catalog: readonly NamedItem[], input: string): string[] {
  const key = nameKey(input);
  const known = findItem(catalog, input);
  if (selected.some((name) => nameKey(name) === key || (known && nameKey(name) === nameKey(known.name)))) {
    return [...selected];
  }
  return [...selected, known?.name ?? input.trim()];
}
