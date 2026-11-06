// Recipe rules shared by the form and the detail page. The database enforces the same limits (checks in
// the recipe_content migration); the client validates first for a clear message at the field.

import { getLanguage } from '../i18n/language';
import { format } from '../i18n/t';
import { itemKey, keepRef, type IngredientRef, type UnitRef } from './catalog';

export const TITLE_MAX = 100;
export const INGREDIENT_NAME_MAX = 80;
export const UNIT_MAX = 20;
export const STEP_MAX = 1000;
export const MAX_INGREDIENTS = 60;
export const MAX_STEPS = 40;
/** Own choice (the requirement names no upper bound): against nonsense values and overflow. */
export const QUANTITY_LIMIT = 1_000_000;
/** Three days, in minutes (R-007). */
export const MINUTES_MAX = 4320;
/** Servings are a whole number from 1 to 99 (R-013). */
export const SERVINGS_MIN = 1;
export const SERVINGS_MAX = 99;
/** Optional free text (R-015). */
export const SOURCE_MAX = 200;
export const NOTE_MAX = 1000;
/** Equipment is optional; the upper bound is an own choice, and the database enforces it too (R-008). */
export const EQUIPMENT_MAX_ITEMS = 20;
/** Dish tags are optional; same own upper bound, enforced in the database too (R-010). */
export const TAGS_MAX_ITEMS = 20;
/** At most three photos per recipe (R-005); the database enforces it too. */
export const MAX_PHOTOS = 3;

/**
 * A photo as the form holds it. `path` is set for a stored photo, `blob` for a new one that is not
 * uploaded yet. `key` identifies it in the form (the path of a stored one), `previewUrl` is what the
 * <img> shows (an object URL, or a signed URL once loaded).
 */
export interface PhotoDraft {
  key: string;
  path?: string;
  blob?: Blob;
  previewUrl: string;
  main: boolean;
  /** File size in bytes: the converted blob, or the stored file's size once looked up. Not part of "changed". */
  bytes?: number;
  /** A variant's photo still to be copied: the source path. Becomes a file of its own only at "Opslaan". Not part of "changed". */
  copyFrom?: string;
}

/** A photo as stored in recipes.photos. */
export interface StoredPhoto {
  path: string;
  main: boolean;
}

/** What the form edits. The quantity is the raw text, so "1,2" can be shown back while typing. */
export interface IngredientDraft {
  name: string;
  quantity: string;
  unit: string;
  /** Link to the catalogue as loaded (R-018). Kept only while the text keeps its key; the form never shows it. */
  ingredientRef?: IngredientRef;
  unitRef?: UnitRef;
}

export interface RecipeDraft {
  title: string;
  ingredients: IngredientDraft[];
  steps: string[];
  /** Raw text of the time fields, like the quantity. */
  prepMinutes: string;
  totalMinutes: string;
  /** Raw text of the servings field. */
  servings: string;
  /** Optional; empty text means none. */
  source: string;
  note: string;
  /** Chosen equipment names; none is fine. Optional so drafts built without it still work. */
  equipment?: string[];
  /** Chosen dish tags; none is fine. Optional so drafts built without it still work. */
  dishTags?: string[];
  traitTags?: string[];
  /** In the order the user chose; none is fine. Optional so drafts built without it still work. */
  photos?: PhotoDraft[];
}

/** An ingredient as stored. */
export interface Ingredient {
  name: string;
  quantity?: number;
  unit?: string;
  /** Optional pointers to the catalogues (R-018); the text above always stays. */
  ingredient_id?: string;
  unit_id?: string;
}

/** What is written to the database. */
export interface RecipeRow {
  title: string;
  ingredients: Ingredient[];
  steps: string[];
  prep_minutes: number;
  total_minutes: number;
  servings: number;
  source: string | null;
  note: string | null;
  equipment: string[];
  dish_tags: string[];
  trait_tags: string[];
}

export interface RecipeRecord extends Omit<RecipeRow, 'prep_minutes' | 'total_minutes' | 'servings' | 'dish_tags' | 'trait_tags'> {
  dishTags: string[];
  traitTags: string[];
  photos: StoredPhoto[];
  /** Null for old sample rows saved before the servings existed. */
  servings: number | null;
  /** Null for old sample rows saved before the times existed. */
  prepMinutes: number | null;
  totalMinutes: number | null;
  id: string;
  authorId: string;
  authorName: string | null;
  createdAt: string;
  /** The direct source of a variant; null when there is none or when it was deleted. */
  variantOf: string | null;
  /** The family, fixed at creation; equals `id` for a recipe that was not made as a variant. */
  familyId: string;
  /** Whether the signed-in user marked this recipe as a favourite, as the database said at load time. */
  isFavorite: boolean;
  /** Title of the source, as it is now; null without a (remaining) source. */
  sourceTitle: string | null;
}

/** Counts code points after trimming, like the database does with its trim and char_length. */
const length = (value: string): number => [...value.trim()].length;

export type QuantityResult = { ok: true; value: number | null } | { ok: false };

/** "2", "0,25" and "1.5" are numbers; an empty text is no quantity; anything else is an error. */
export function parseQuantity(input: string): QuantityResult {
  const text = input.trim();
  if (text === '') return { ok: true, value: null };
  // At most two decimals, comma or point; no sign, no exponent.
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) return { ok: false };
  const value = Number(text.replace(',', '.'));
  if (!(value > 0) || value >= QUANTITY_LIMIT) return { ok: false };
  return { ok: true, value };
}

/** Decimal sign of the language, no superfluous zeros, no thousands separator: 0.25 -> "0,25" / "0.25", 2 -> "2". */
export function formatQuantity(value: number): string {
  const plain = String(Number(value.toFixed(2)));
  return getLanguage() === 'nl' ? plain.replace('.', ',') : plain;
}

export type MinutesResult = { ok: true; value: number } | { ok: false; reason: 'required' | 'invalid' };

/** Whole minutes from 0 to 4320. Digits only: no sign, decimals or exponent. "045" is 45. */
export function parseMinutes(input: string): MinutesResult {
  const text = input.trim();
  if (text === '') return { ok: false, reason: 'required' };
  if (!/^\d+$/.test(text)) return { ok: false, reason: 'invalid' };
  const value = Number(text);
  if (value > MINUTES_MAX) return { ok: false, reason: 'invalid' };
  return { ok: true, value };
}

export type ServingsResult = { ok: true; value: number } | { ok: false; reason: 'required' | 'invalid' };

/** Whole servings from 1 to 99. Digits only: no sign, decimals or exponent. "04" is 4. */
export function parseServings(input: string): ServingsResult {
  const text = input.trim();
  if (text === '') return { ok: false, reason: 'required' };
  if (!/^\d+$/.test(text)) return { ok: false, reason: 'invalid' };
  const value = Number(text);
  if (value < SERVINGS_MIN || value > SERVINGS_MAX) return { ok: false, reason: 'invalid' };
  return { ok: true, value };
}

/**
 * quantity x desired / original, rounded to two decimals. Works in hundredths (the database allows at
 * most two decimals) so 0.29 is not 28.999...; a true half rounds up (0.125 -> 0.13).
 */
export function scaleQuantity(quantity: number, original: number, desired: number): number {
  return Math.round((Math.round(quantity * 100) * desired) / original) / 100;
}

/** One ingredient line "quantity unit name" with the quantity scaled; without a quantity it stays as stored. */
export function ingredientLine(ingredient: Ingredient, original: number, desired: number): string {
  let quantity = '';
  if (ingredient.quantity !== undefined) {
    const scaled = scaleQuantity(ingredient.quantity, original, desired);
    // A result that rounds to 0 would read as "none"; say it is below the smallest amount shown.
    quantity = scaled > 0 ? formatQuantity(scaled) : format('servings.belowMinimum', { q: formatQuantity(0.01) });
  }
  return [quantity, ingredient.unit ?? '', ingredient.name].filter(Boolean).join(' ');
}

export type TitleError ='titleInvalid';
export interface IngredientErrors {
  name?: 'nameInvalid';
  quantity?: 'quantityInvalid';
  unit?: 'unitInvalid';
}

export interface RecipeErrors {
  title?: 'titleInvalid';
  prepMinutes?: 'minutesRequired' | 'minutesInvalid';
  totalMinutes?: 'minutesRequired' | 'minutesInvalid' | 'totalBeforePrep';
  servings?: 'servingsRequired' | 'servingsInvalid';
  source?: 'sourceTooLong';
  note?: 'noteTooLong';
  equipment?: 'equipmentTooMany';
  dishTags?: 'tagsTooMany';
  traitTags?: 'tagsTooMany';
  photos?: 'photosTooMany';
  /** About the list as a whole: none, or too many. */
  ingredients?: 'ingredientsRequired' | 'ingredientsTooMany';
  steps?: 'stepsRequired' | 'stepsTooMany';
  /** Per row, indexed like the draft; rows without an error are absent. */
  ingredientRows: Record<number, IngredientErrors>;
  stepRows: Record<number, 'stepInvalid'>;
}

export interface ValidationResult {
  ok: boolean;
  errors: RecipeErrors;
}

export function validateRecipe(draft: RecipeDraft): ValidationResult {
  const errors: RecipeErrors = { ingredientRows: {}, stepRows: {} };

  const titleLength = length(draft.title);
  if (titleLength < 1 || titleLength > TITLE_MAX) errors.title = 'titleInvalid';

  const prep = parseMinutes(draft.prepMinutes);
  const total = parseMinutes(draft.totalMinutes);
  if (!prep.ok) errors.prepMinutes = prep.reason === 'required' ? 'minutesRequired' : 'minutesInvalid';
  if (!total.ok) errors.totalMinutes = total.reason === 'required' ? 'minutesRequired' : 'minutesInvalid';
  // Compared only when both are valid, so one mistake gives one message.
  if (prep.ok && total.ok && total.value < prep.value) errors.totalMinutes = 'totalBeforePrep';

  const servings = parseServings(draft.servings);
  if (!servings.ok) errors.servings = servings.reason === 'required' ? 'servingsRequired' : 'servingsInvalid';

  if (length(draft.source) > SOURCE_MAX) errors.source = 'sourceTooLong';
  if (length(draft.note) > NOTE_MAX) errors.note = 'noteTooLong';

  if ((draft.equipment ?? []).length > EQUIPMENT_MAX_ITEMS) errors.equipment = 'equipmentTooMany';
  if ((draft.dishTags ?? []).length > TAGS_MAX_ITEMS) errors.dishTags = 'tagsTooMany';
  if ((draft.traitTags ?? []).length > TAGS_MAX_ITEMS) errors.traitTags = 'tagsTooMany';

  if ((draft.photos ?? []).length > MAX_PHOTOS) errors.photos = 'photosTooMany';

  if (draft.ingredients.length === 0) errors.ingredients = 'ingredientsRequired';
  else if (draft.ingredients.length > MAX_INGREDIENTS) errors.ingredients = 'ingredientsTooMany';
  draft.ingredients.forEach((ing, i) => {
    const row: IngredientErrors = {};
    const nameLength = length(ing.name);
    if (nameLength < 1 || nameLength > INGREDIENT_NAME_MAX) row.name = 'nameInvalid';
    if (!parseQuantity(ing.quantity).ok) row.quantity = 'quantityInvalid';
    if (length(ing.unit) > UNIT_MAX) row.unit = 'unitInvalid';
    if (Object.keys(row).length > 0) errors.ingredientRows[i] = row;
  });

  if (draft.steps.length === 0) errors.steps = 'stepsRequired';
  else if (draft.steps.length > MAX_STEPS) errors.steps = 'stepsTooMany';
  draft.steps.forEach((step, i) => {
    const stepLength = length(step);
    if (stepLength < 1 || stepLength > STEP_MAX) errors.stepRows[i] = 'stepInvalid';
  });

  const ok =
    !errors.title &&
    !errors.prepMinutes &&
    !errors.totalMinutes &&
    !errors.servings &&
    !errors.source &&
    !errors.note &&
    !errors.equipment &&
    !errors.dishTags &&
    !errors.traitTags &&
    !errors.photos &&
    !errors.ingredients &&
    !errors.steps &&
    Object.keys(errors.ingredientRows).length === 0 &&
    Object.keys(errors.stepRows).length === 0;
  return { ok, errors };
}

/** Pure: a new list, the original is never changed. Moving past either end changes nothing. */
export function moveItem<T>(list: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  const copy = [...list];
  if (index < 0 || index >= copy.length || target < 0 || target >= copy.length) return copy;
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

export function removeItem<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

/**
 * Adds photos up to the maximum; the rest is counted as rejected. The first photo of an empty list becomes
 * the main photo. Pure: the input list is not changed.
 */
export function addPhotos(list: readonly PhotoDraft[], incoming: readonly PhotoDraft[]): { photos: PhotoDraft[]; rejected: number } {
  const room = Math.max(0, MAX_PHOTOS - list.length);
  const added = incoming.slice(0, room).map((p) => ({ ...p, main: false }));
  const photos = [...list, ...added];
  if (photos.length > 0 && !photos.some((p) => p.main)) photos[0] = { ...photos[0], main: true };
  return { photos, rejected: incoming.length - added.length };
}

/** Exactly one main photo: the one at `index`. */
export function setMain(list: readonly PhotoDraft[], index: number): PhotoDraft[] {
  return list.map((p, i) => ({ ...p, main: i === index }));
}

/** Removes a photo; when it was the main photo the new first photo becomes the main one. */
export function removePhoto(list: readonly PhotoDraft[], index: number): PhotoDraft[] {
  const left = removeItem(list, index);
  if (left.length > 0 && !left.some((p) => p.main)) left[0] = { ...left[0], main: true };
  return left;
}

export const emptyIngredient = (): IngredientDraft => ({ name: '', quantity: '', unit: '' });

const isEmptyIngredient = (ing: IngredientDraft): boolean =>
  ing.name.trim() === '' && ing.quantity.trim() === '' && ing.unit.trim() === '';

/**
 * Drops rows that are completely empty (the new form starts with one of each), and remembers where
 * the kept rows came from so that messages land on the right row.
 */
export function pruneDraft(draft: RecipeDraft): { draft: RecipeDraft; ingredientIndex: number[]; stepIndex: number[] } {
  const ingredientIndex: number[] = [];
  const stepIndex: number[] = [];
  const ingredients = draft.ingredients.filter((ing, i) => {
    if (isEmptyIngredient(ing)) return false;
    ingredientIndex.push(i);
    return true;
  });
  const steps = draft.steps.filter((step, i) => {
    if (step.trim() === '') return false;
    stepIndex.push(i);
    return true;
  });
  return { draft: { ...draft, ingredients, steps }, ingredientIndex, stepIndex };
}

/** Call after validation; an invalid text would give NaN, which the database refuses. */
const minutesOf = (text: string): number => {
  const result = parseMinutes(text);
  return result.ok ? result.value : Number.NaN;
};

const servingsOf = (text: string): number => {
  const result = parseServings(text);
  return result.ok ? result.value : Number.NaN;
};

/** Trimmed values; an empty quantity or unit is left out. Call after validation. */
export function toRow(draft: RecipeDraft): RecipeRow {
  return {
    title: draft.title.trim(),
    ingredients: draft.ingredients.map((ing) => {
      const row: Ingredient = { name: ing.name.trim() };
      const quantity = parseQuantity(ing.quantity);
      if (quantity.ok && quantity.value !== null) row.quantity = quantity.value;
      const unit = ing.unit.trim();
      if (unit !== '') row.unit = unit;
      const ingredientId = keepRef(ing.ingredientRef, row.name);
      if (ingredientId) row.ingredient_id = ingredientId;
      const unitId = unit !== '' ? keepRef(ing.unitRef, unit) : undefined;
      if (unitId) row.unit_id = unitId;
      return row;
    }),
    steps: draft.steps.map((step) => step.trim()),
    prep_minutes: minutesOf(draft.prepMinutes),
    total_minutes: minutesOf(draft.totalMinutes),
    servings: servingsOf(draft.servings),
    source: draft.source.trim() || null,
    note: draft.note.trim() || null,
    equipment: (draft.equipment ?? []).map((name) => name.trim()),
    dish_tags: (draft.dishTags ?? []).map((name) => name.trim()),
    trait_tags: (draft.traitTags ?? []).map((name) => name.trim()),
  };
}

/**
 * The source as a link target when it starts with http:// or https:// (scheme case-insensitive, as in
 * the URL standard); anything else, notably javascript: and data:, is plain text.
 */
export function sourceLink(source: string | null): string | null {
  const text = source?.trim() ?? '';
  return /^https?:\/\//i.test(text) ? text : null;
}

/** Compared with the starting value, so a change that is set back does not count. */
export function isDirty(initial: RecipeDraft, current: RecipeDraft): boolean {
  // A Blob serialises to {}, so photos are compared on key, main flag and order instead.
  const signature = (draft: RecipeDraft): string =>
    JSON.stringify({ ...draft, photos: (draft.photos ?? []).map((p) => [p.key, p.main]) });
  return signature(initial) !== signature(current);
}

/** A stored recipe in either shape: the row as written (snake_case) or the record as read (camelCase). */
type StoredRecipe = Omit<RecipeRow, 'prep_minutes' | 'total_minutes' | 'servings' | 'equipment' | 'dish_tags' | 'trait_tags'> &
  Partial<Pick<RecipeRecord, 'prepMinutes' | 'totalMinutes' | 'dishTags' | 'traitTags' | 'photos'>> &
  Partial<Pick<RecipeRow, 'prep_minutes' | 'total_minutes' | 'source' | 'note' | 'equipment' | 'dish_tags' | 'trait_tags'>> & { servings?: number | null };

/** The form's starting values for a stored recipe; old rows without content get one empty row to fill in. */
export function draftFromRecord(record: StoredRecipe, sizes?: ReadonlyMap<string, number>): RecipeDraft {
  // Times as text, so a fresh form is not "changed"; an old row without times starts empty.
  const prep = record.prepMinutes ?? record.prep_minutes ?? null;
  const total = record.totalMinutes ?? record.total_minutes ?? null;
  return {
    title: record.title,
    prepMinutes: prep === null ? '' : String(prep),
    totalMinutes: total === null ? '' : String(total),
    servings: record.servings == null ? '' : String(record.servings),
    source: record.source ?? '',
    note: record.note ?? '',
    equipment: [...(record.equipment ?? [])],
    dishTags: [...(record.dishTags ?? record.dish_tags ?? [])],
    traitTags: [...(record.traitTags ?? record.trait_tags ?? [])],
    // A stored photo is keyed by its path; its preview URL is signed later, when the form is shown.
    photos: (record.photos ?? []).map((p) => {
      const bytes = sizes?.get(p.path);
      return { key: p.path, path: p.path, previewUrl: '', main: p.main, ...(bytes === undefined ? {} : { bytes }) };
    }),
    ingredients:
      record.ingredients.length > 0
        ? record.ingredients.map((ing) => ({
            name: ing.name,
            quantity: ing.quantity === undefined ? '' : formatQuantity(ing.quantity),
            unit: ing.unit ?? '',
            ...(ing.ingredient_id ? { ingredientRef: { id: ing.ingredient_id, key: itemKey(ing.name) } } : {}),
            ...(ing.unit_id && ing.unit ? { unitRef: { id: ing.unit_id, key: itemKey(ing.unit) } } : {}),
          }))
        : [emptyIngredient()],
    steps: record.steps.length > 0 ? [...record.steps] : [''],
  };
}

export const emptyDraft = (): RecipeDraft => ({
  title: '',
  prepMinutes: '',
  totalMinutes: '',
  servings: '',
  source: '',
  note: '',
  equipment: [],
  dishTags: [],
  traitTags: [],
  photos: [],
  ingredients: [emptyIngredient()],
  steps: [''],
});
