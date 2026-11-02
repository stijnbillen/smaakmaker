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
}

export const prepField = (page: Page): Locator => page.getByRole('textbox', { name: nl['form.prepMinutes'], exact: true });
export const totalField = (page: Page): Locator => page.getByRole('textbox', { name: nl['form.totalMinutes'], exact: true });

export const servingsField = (page: Page): Locator => page.getByRole('textbox', { name: nl['form.servings'], exact: true });

export const sourceField = (page: Page): Locator => page.getByRole('textbox', { name: nl['form.source'], exact: true });
export const noteField = (page: Page): Locator => page.getByRole('textbox', { name: nl['form.note'], exact: true });

export const titleField = (page: Page): Locator => page.getByRole('textbox', { name: nl['form.titleLabel'], exact: true });
export const ingredientNameFields = (page: Page): Locator => page.getByRole('textbox', { name: /^Ingrediënt/ });
export const quantityFields = (page: Page): Locator => page.getByRole('textbox', { name: /^Hoeveelheid/ });
export const unitFields = (page: Page): Locator => page.getByRole('textbox', { name: /^Eenheid/ });
export const stepFields = (page: Page): Locator => page.getByRole('textbox', { name: /^Stap/ });
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
  for (let i = 0; i < recipe.steps.length; i++) {
    if ((await stepFields(page).count()) <= i) await addStepButton(page).click();
    await stepFields(page).nth(i).fill(recipe.steps[i]);
  }
  if (recipe.source !== undefined) await sourceField(page).fill(recipe.source);
  if (recipe.note !== undefined) await noteField(page).fill(recipe.note);
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
