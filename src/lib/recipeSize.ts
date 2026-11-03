import { t } from '../i18n/t';
import { pruneDraft, type RecipeDraft } from './recipe';
import { PHOTO_MAX_BYTES } from './photoResize';

// Size of a recipe (R-004): 2 MB in total, text and photos. The database enforces the limit
// (recipes_check_size); this is the same count on the client for a live number and a quick message.

export { PHOTO_MAX_BYTES };
/** Same number as recipe_size_limit() in SQL; a test keeps the two counts equal. */
export const RECIPE_MAX_BYTES = 2_097_152;
const MB = 1_048_576;

const encoder = new TextEncoder();

export const utf8Bytes = (s: string): number => encoder.encode(s).length;

/** Trimmed like the database does before it stores a value. */
const bytesOf = (s: string | null | undefined): number => utf8Bytes((s ?? '').trim());

/**
 * UTF-8 bytes of all text fields, as the database counts them after saving: trimmed, empty rows left out.
 * Numbers (times, servings, quantities) do not count.
 */
export function recipeTextBytes(draft: RecipeDraft): number {
  const { draft: d } = pruneDraft(draft);
  let total = bytesOf(d.title) + bytesOf(d.source) + bytesOf(d.note);
  for (const ing of d.ingredients) total += bytesOf(ing.name) + bytesOf(ing.unit);
  for (const step of d.steps) total += bytesOf(step);
  for (const list of [d.dishTags, d.traitTags, d.equipment]) for (const name of list ?? []) total += bytesOf(name);
  return total;
}

export const recipeSizeBytes = (textBytes: number, photoBytes: readonly number[]): number =>
  textBytes + photoBytes.reduce((sum, n) => sum + n, 0);

export type SizeCheck = 'ok' | 'photosTooLarge' | 'textTooLarge';

/** Text alone over the limit: the text is too large; otherwise the photos tip it over. */
export function checkRecipeSize(textBytes: number, photoBytes: readonly number[]): SizeCheck {
  if (recipeSizeBytes(textBytes, photoBytes) <= RECIPE_MAX_BYTES) return 'ok';
  return textBytes > RECIPE_MAX_BYTES ? 'textTooLarge' : 'photosTooLarge';
}

/** "1,3 van 2 MB": rounded up to one decimal, so a size over the limit never shows as "2,0". */
export function formatRecipeSize(bytes: number): string {
  // Whole tenths via integer maths: floating point could turn 1,3 MB exactly into 1,3000000000000003.
  const tenths = Math.ceil((bytes * 10) / MB);
  const used = `${Math.floor(tenths / 10)},${tenths % 10}`;
  return t('size.used').replace('{used}', used);
}
