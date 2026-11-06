// Keys of the ingredient and unit catalogues (R-018). No Supabase import, so unit tests load it without
// environment variables.

/** Same idea as the database's item_key(): trimmed, lower case, no accents, runs of whitespace as one space. */
export function itemKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** A line's pointer to a catalogue item, with the key of the text at the time it was loaded. */
export interface IngredientRef {
  id: string;
  key: string;
}

/** A catalogue item as the screens use it: the id and both names (either may be missing). */
export interface CatalogItem {
  id: string;
  nameNl: string | null;
  nameEn: string | null;
}

export type CatalogLang = 'nl' | 'en';

/** The name in the interface language; when that one is missing, the other name. */
export function displayName(item: CatalogItem, lang: CatalogLang): string {
  const [first, second] = lang === 'nl' ? [item.nameNl, item.nameEn] : [item.nameEn, item.nameNl];
  return first || second || '';
}

/** A suggestion row, as much as the label needs (structurally the same as `Suggestion` of suggest.ts). */
interface LabelRow extends CatalogItem {
  matched: string;
}

/** "name", or "synonym → name" when the hit came from another key than the shown name. */
export function suggestionLabel(row: LabelRow, lang: CatalogLang): string {
  const name = displayName(row, lang);
  return itemKey(row.matched) === itemKey(name) ? name : `${row.matched} → ${name}`;
}
