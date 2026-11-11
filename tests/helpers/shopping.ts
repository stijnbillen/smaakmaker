// Test-only: seeding and locators for the shopping list tab (T-034 / R-032). Texts come from nl.json / fr.json.
import { expect, type Locator, type Page } from '@playwright/test';
import nlJson from '../../src/i18n/nl.json' with { type: 'json' };
import frJson from '../../src/i18n/fr.json' with { type: 'json' };
import { sql } from './pg';

export type Lang = 'nl' | 'fr';
const texts: Record<Lang, Record<string, string>> = { nl: nlJson as Record<string, string>, fr: frJson as Record<string, string> };
export const text = (lang: Lang, key: string): string => texts[lang][key];
export const fill = (lang: Lang, key: string, vars: Record<string, string | number>): string =>
  text(lang, key).replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));

export const esc = (v: string): string => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/** Inserts an ingredient with a Dutch and (optionally) a French name; returns its id. Names must be unique per run. */
export async function seedIngredient(nameNl: string, nameFr: string | null = null): Promise<string> {
  const rows = await sql<{ id: string }>(
    `insert into public.ingredients (name_nl, name_fr) values (${lit(nameNl)}, ${nameFr === null ? 'null' : lit(nameFr)}) returning id`,
  );
  return rows[0].id;
}

/** Id of a unit of the start list (g, kg, ml, el, ...), by its Dutch name. */
export async function unitId(nameNl: string): Promise<string> {
  const rows = await sql<{ id: string }>(`select id from public.units where name_nl = ${lit(nameNl)} limit 1`);
  if (!rows[0]) throw new Error(`unit ${nameNl} not in the start list`);
  return rows[0].id;
}

/** Puts recipes in a user's menu through SQL, oldest first. `servings` per recipe or one number for all. */
export async function seedMenu(userId: string, recipeIds: string[], servings: number | number[] = 4): Promise<void> {
  for (const [i, id] of recipeIds.entries()) {
    const n = Array.isArray(servings) ? servings[i] : servings;
    await sql(
      `insert into public.week_menu_items (user_id, recipe_id, servings, created_at)
       values ('${userId}', '${id}', ${n}, now() - interval '${recipeIds.length - i} minutes')`,
    );
  }
}

export const row = (page: Page): Locator => page.getByRole('listitem');

/** The toggle button of a line, found by its visible text (exact), with its `aria-pressed` state. */
export function lineButton(page: Page, lineText: string): Locator {
  return page.locator('button[aria-pressed]').filter({ hasText: new RegExp(`^\\s*${esc(lineText)}\\s*$`) });
}

/** The list item that holds a line's toggle button. */
export function lineRow(page: Page, lineText: string): Locator {
  return page.getByRole('listitem').filter({ has: lineButton(page, lineText) });
}

/** Visible text of all line buttons (top to bottom), to check order. */
export async function lineTexts(page: Page): Promise<string[]> {
  return (await page.locator('main button[aria-pressed]').allTextContents()).map((s) => s.replace(/\s+/g, ' ').trim());
}

export const haveSection = (page: Page, lang: Lang, n: number): Locator =>
  page.locator('details').filter({ has: page.locator('summary', { hasText: fill(lang, 'shopping.haveSection', { n }) }) });

export const customInput = (page: Page, lang: Lang): Locator => page.getByLabel(text(lang, 'shopping.customLabel'), { exact: true });
export const customAdd = (page: Page, lang: Lang): Locator => page.getByRole('button', { name: text(lang, 'shopping.customAdd'), exact: true });

/** "Verwijderen" is the plain text or an aria-label with the item text; accept both. */
export function removeButton(scope: Locator, lang: Lang, itemText: string): Locator {
  const labelled = esc(text(lang, 'shopping.removeLabel')).replace(esc('{text}'), esc(itemText));
  return scope.getByRole('button', { name: new RegExp(`^(${esc(text(lang, 'shopping.remove'))}|${labelled})$`) });
}

export async function expectTapTarget(locator: Locator, what: string): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, what).not.toBeNull();
  expect(box!.height, `${what} height`).toBeGreaterThanOrEqual(44);
  expect(box!.width, `${what} width`).toBeGreaterThanOrEqual(44);
}
