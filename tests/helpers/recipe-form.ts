// Test-only: drives the recipe form (T-005) through its accessible names, so the markup stays free.
import { expect, type Locator, type Page } from '@playwright/test';
import nlJson from '../../src/i18n/nl.json' with { type: 'json' };

export const nl = nlJson as Record<string, string>;

export interface IngredientInput {
  name: string;
  quantity?: string;
  unit?: string;
}

export interface RecipeInput {
  title: string;
  ingredients: Array<string | IngredientInput>;
  steps: string[];
  /** Raw text for the time fields (T-006 / R-007); defaults to a valid 10 / 20. */
  prepMinutes?: string;
  totalMinutes?: string;
  /** Raw text for the servings field (T-007 / R-013); defaults to a valid 4. */
  servings?: string;
  /** Optional source and note (T-008 / R-015); left empty when not given. */
  source?: string;
  note?: string;
  /** Equipment (T-009 / R-008): tap the choice button when it exists, else type it and press "Toevoegen". */
  equipment?: string[];
  /** Dish tags (T-010 / R-010): tapped when the button exists, else typed into "Nieuwe tag". */
  dishTags?: string[];
  /** Trait tags ("Kenmerken", T-011 / R-011): same behaviour, own group. */
  traitTags?: string[];
}

export type TagGroupKind = 'dish' | 'trait';

// Two tag groups exist (T-010 dish, T-011 trait); every locator is scoped to its own role=group,
// because the same tag name can live in both groups. The group defaults to 'dish' for older tests.
export const tagGroup = (page: Page, kind: TagGroupKind = 'dish'): Locator =>
  page.getByRole('group', { name: nl[`tags.${kind}`], exact: true });
export const tagButton = (page: Page, name: string, kind: TagGroupKind = 'dish'): Locator =>
  tagGroup(page, kind).getByRole('button', { name, exact: true });
// Scoped to the tag group: the equipment picker has its own "Toevoegen" button.
export const newTagField = (page: Page, kind: TagGroupKind = 'dish'): Locator =>
  tagGroup(page, kind).getByRole('textbox', { name: nl['form.tagNew'], exact: true });
export const addTagButton = (page: Page, kind: TagGroupKind = 'dish'): Locator =>
  tagGroup(page, kind).getByRole('button', { name: nl['form.tagAdd'], exact: true });

export async function pickTags(page: Page, kind: TagGroupKind, names: string[]): Promise<void> {
  for (const name of names) {
    const button = tagButton(page, name, kind);
    if ((await button.count()) > 0) {
      if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
    } else {
      await newTagField(page, kind).fill(name);
      await addTagButton(page, kind).click();
    }
    await expect(tagButton(page, name, kind)).toHaveAttribute('aria-pressed', 'true');
  }
}

export const pickDishTags = (page: Page, names: string[]): Promise<void> => pickTags(page, 'dish', names);

export const equipmentGroup = (page: Page): Locator => page.getByRole('group', { name: nl['form.equipment'], exact: true });
export const equipmentChoice = (page: Page, name: string): Locator =>
  equipmentGroup(page).getByRole('button', { name, exact: true });
export const equipmentNewField = (page: Page): Locator =>
  page.getByRole('textbox', { name: nl['form.equipmentNew'], exact: true });
export const equipmentAddButton = (page: Page): Locator =>
  page.getByRole('button', { name: nl['form.equipmentAdd'], exact: true });

export const prepField = (page: Page): Locator => page.getByRole('textbox', { name: nl['form.prepMinutes'], exact: true });
export const totalField = (page: Page): Locator => page.getByRole('textbox', { name: nl['form.totalMinutes'], exact: true });

export const servingsField = (page: Page): Locator => page.getByRole('textbox', { name: nl['form.servings'], exact: true });

export const sourceField = (page: Page): Locator => page.getByRole('textbox', { name: nl['form.source'], exact: true });
export const noteField = (page: Page): Locator => page.getByRole('textbox', { name: nl['form.note'], exact: true });

export const titleField = (page: Page): Locator => page.getByRole('textbox', { name: nl['form.titleLabel'], exact: true });
// T-021: the name and unit fields are comboboxes (suggestion list), no longer plain textboxes.
export const ingredientNameFields = (page: Page): Locator => page.getByRole('combobox', { name: /^Ingredi[eë]nt/ });
export const quantityFields = (page: Page): Locator => page.getByRole('textbox', { name: /^(Hoeveelheid|Quantity)/ });
export const unitFields = (page: Page): Locator => page.getByRole('combobox', { name: /^(Eenheid|Unit)/ });
export const sizeFields = (page: Page): Locator => page.getByLabel(/^(Formaat|Size)/);

/** The inline question of a catalogue field ("Bedoelde u …?" / "Nieuw ingrediënt …" / "Nieuwe eenheid …"). */
export const catalogQuestion = (page: Page): Locator =>
  page.getByRole('group', { name: /^(Bedoelde u|Nieuw ingrediënt|Nieuwe eenheid|Did you mean|New ingredient|New unit)/ });

/**
 * T-021: answers every open catalogue question with "No" (free text), so a typed name that is not in the
 * catalogue does not block "Opslaan". Waits briefly for a question to appear after the last blur.
 */
export async function answerQuestionsNo(page: Page): Promise<void> {
  for (let guard = 0; guard < 130; guard++) {
    const question = catalogQuestion(page).first();
    try {
      await question.waitFor({ state: 'visible', timeout: 1000 });
    } catch {
      return;
    }
    await question.getByRole('button', { name: /^(Nee|No)/ }).click();
    await expect(question).toBeHidden().catch(() => undefined);
  }
}
export const stepFields = (page: Page): Locator => page.getByRole('textbox', { name: /^(Stap|Step)/ });
export const saveButton = (page: Page): Locator => page.getByRole('button', { name: nl['form.save'], exact: true });
export const addIngredientButton = (page: Page): Locator =>
  page.getByRole('button', { name: nl['form.addIngredient'], exact: true });
export const addStepButton = (page: Page): Locator => page.getByRole('button', { name: nl['form.addStep'], exact: true });

/** Fills the form; the new form starts with one empty ingredient row and one empty step row. */
export async function fillRecipe(page: Page, recipe: RecipeInput): Promise<void> {
  await titleField(page).fill(recipe.title);
  await prepField(page).fill(recipe.prepMinutes ?? '10');
  await totalField(page).fill(recipe.totalMinutes ?? '20');
  await servingsField(page).fill(recipe.servings ?? '4');
  for (let i = 0; i < recipe.ingredients.length; i++) {
    if ((await ingredientNameFields(page).count()) <= i) await addIngredientButton(page).click();
    const ing = typeof recipe.ingredients[i] === 'string' ? { name: recipe.ingredients[i] as string } : (recipe.ingredients[i] as IngredientInput);
    await ingredientNameFields(page).nth(i).fill(ing.name);
    if (ing.quantity !== undefined) await quantityFields(page).nth(i).fill(ing.quantity);
    if (ing.unit !== undefined) await unitFields(page).nth(i).fill(ing.unit);
  }
  // Leave the last catalogue field (blur), then answer the questions that this raised.
  await titleField(page).focus();
  await answerQuestionsNo(page);
  for (let i = 0; i < recipe.steps.length; i++) {
    if ((await stepFields(page).count()) <= i) await addStepButton(page).click();
    await stepFields(page).nth(i).fill(recipe.steps[i]);
  }
  if (recipe.source !== undefined) await sourceField(page).fill(recipe.source);
  if (recipe.note !== undefined) await noteField(page).fill(recipe.note);
  for (const name of recipe.equipment ?? []) {
    const choice = equipmentChoice(page, name);
    if ((await choice.count()) > 0) {
      if ((await choice.getAttribute('aria-pressed')) !== 'true') await choice.click();
    } else {
      await equipmentNewField(page).fill(name);
      await equipmentAddButton(page).click();
    }
  }
  if (recipe.dishTags !== undefined) await pickDishTags(page, recipe.dishTags);
  if (recipe.traitTags !== undefined) await pickTags(page, 'trait', recipe.traitTags);
}

export async function expectIngredientOrder(page: Page, names: string[]): Promise<void> {
  await expect(ingredientNameFields(page)).toHaveCount(names.length);
  for (let i = 0; i < names.length; i++) await expect(ingredientNameFields(page).nth(i)).toHaveValue(names[i]);
}

export async function expectStepOrder(page: Page, steps: string[]): Promise<void> {
  await expect(stepFields(page)).toHaveCount(steps.length);
  for (let i = 0; i < steps.length; i++) await expect(stepFields(page).nth(i)).toHaveValue(steps[i]);
}

export const isRecipePost = (r: { method(): string; url(): string }): boolean =>
  r.method() === 'POST' && r.url().includes('/rest/v1/recipes');
