// Recipe rules shared by the form and the detail page. The database enforces the same limits (checks in
// the recipe_content migration); the client validates first for a clear message at the field.

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

/** What the form edits. The quantity is the raw text, so "1,2" can be shown back while typing. */
export interface IngredientDraft {
  name: string;
  quantity: string;
  unit: string;
}

export interface RecipeDraft {
  title: string;
  ingredients: IngredientDraft[];
  steps: string[];
  /** Raw text of the time fields, like the quantity. */
  prepMinutes: string;
  totalMinutes: string;
}

/** An ingredient as stored. */
export interface Ingredient {
  name: string;
  quantity?: number;
  unit?: string;
}

/** What is written to the database. */
export interface RecipeRow {
  title: string;
  ingredients: Ingredient[];
  steps: string[];
  prep_minutes: number;
  total_minutes: number;
}

export interface RecipeRecord extends Omit<RecipeRow, 'prep_minutes' | 'total_minutes'> {
  /** Null for old sample rows saved before the times existed. */
  prepMinutes: number | null;
  totalMinutes: number | null;
  id: string;
  authorId: string;
  authorName: string | null;
  createdAt: string;
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

/** Decimal comma, no superfluous zeros: 0.25 -> "0,25", 2 -> "2". */
export function formatQuantity(value: number): string {
  return String(Number(value.toFixed(2))).replace('.', ',');
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

export type TitleError = 'titleInvalid';
export interface IngredientErrors {
  name?: 'nameInvalid';
  quantity?: 'quantityInvalid';
  unit?: 'unitInvalid';
}

export interface RecipeErrors {
  title?: 'titleInvalid';
  prepMinutes?: 'minutesRequired' | 'minutesInvalid';
  totalMinutes?: 'minutesRequired' | 'minutesInvalid' | 'totalBeforePrep';
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
      return row;
    }),
    steps: draft.steps.map((step) => step.trim()),
    prep_minutes: minutesOf(draft.prepMinutes),
    total_minutes: minutesOf(draft.totalMinutes),
  };
}

/** Compared with the starting value, so a change that is set back does not count. */
export function isDirty(initial: RecipeDraft, current: RecipeDraft): boolean {
  return JSON.stringify(initial) !== JSON.stringify(current);
}

/** A stored recipe in either shape: the row as written (snake_case) or the record as read (camelCase). */
type StoredRecipe = Omit<RecipeRow, 'prep_minutes' | 'total_minutes'> &
  Partial<Pick<RecipeRecord, 'prepMinutes' | 'totalMinutes'>> &
  Partial<Pick<RecipeRow, 'prep_minutes' | 'total_minutes'>>;

/** The form's starting values for a stored recipe; old rows without content get one empty row to fill in. */
export function draftFromRecord(record: StoredRecipe): RecipeDraft {
  // Times as text, so a fresh form is not "changed"; an old row without times starts empty.
  const prep = record.prepMinutes ?? record.prep_minutes ?? null;
  const total = record.totalMinutes ?? record.total_minutes ?? null;
  return {
    title: record.title,
    prepMinutes: prep === null ? '' : String(prep),
    totalMinutes: total === null ? '' : String(total),
    ingredients:
      record.ingredients.length > 0
        ? record.ingredients.map((ing) => ({
            name: ing.name,
            quantity: ing.quantity === undefined ? '' : formatQuantity(ing.quantity),
            unit: ing.unit ?? '',
          }))
        : [emptyIngredient()],
    steps: record.steps.length > 0 ? [...record.steps] : [''],
  };
}

export const emptyDraft = (): RecipeDraft => ({
  title: '',
  prepMinutes: '',
  totalMinutes: '',
  ingredients: [emptyIngredient()],
  steps: [''],
});
