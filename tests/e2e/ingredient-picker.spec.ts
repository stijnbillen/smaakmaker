import { expect, test, type Page } from '@playwright/test';
import {
  catalogQuestion,
  ingredientNameFields,
  quantityFields,
  saveButton,
  sizeFields,
  stepFields,
  titleField,
  unitFields,
  prepField,
  totalField,
  servingsField,
  nl,
} from '../helpers/recipe-form';
import { signInViaStorage } from '../helpers/session';
import { adminClient, assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, type TestUser } from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';
import frJson from '../../src/i18n/fr.json' with { type: 'json' };

const fr = frJson as Record<string, string>;

// T-021 / R-020 in the recipe form at 360 x 640. Real taps/clicks, not only fill + Tab (a tap also blurs).
let user: TestUser;
const created: string[] = [];
const unique = (label: string) => `${label}-e2e-${Math.random().toString(36).slice(2, 8)}`;
// Catalogue names must not resemble each other or leftovers: a near match turns the "new item" question into
// "Bedoelde u …?". Random letters only, no shared prefix.
const rnd = () => Array.from({ length: 12 }, () => 'bcdfghjklmnpqrstvwxz'[Math.floor(Math.random() * 20)]).join('');
const lit =(s: string) => `'${s.replace(/'/g, "''")}'`;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('picker', { displayName: 'Pia Picker' });
  // Remove items that earlier runs left behind under the old naming scheme.
  await sql(`delete from public.ingredients where name_nl like 'tempeh-e2e-%' or name_fr like 'tempeh-e2e-%'`).catch(() => undefined);
});

test.afterAll(async () => {
  if (created.length) {
    await sql(`delete from public.recipes where title in (${created.map(lit).join(',')})`).catch(() => undefined);
    await sql(`delete from public.ingredients where name_nl in (${created.map(lit).join(',')}) or name_fr in (${created.map(lit).join(',')})`).catch(() => undefined);
  }
  if (user) await deleteTestUser(user);
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await signInViaStorage(page, user.session);
});

const idOf = async (table: 'ingredient_keys' | 'unit_keys', col: string, key: string) =>
  (await sql<{ id: string }>(`select ${col} as id from public.${table} where key = ${lit(key)}`))[0].id;

async function openNew(page: Page, lang: 'nl' | 'fr' = 'nl') {
  await page.addInitScript((l) => window.localStorage.setItem('smaakmaker.lang', l), lang);
  await page.goto('/nieuw');
  // The title label differs per interface language, so wait on the label of the chosen language.
  await expect(page.getByRole('textbox', { name: lang === 'fr' ? fr['form.titleLabel'] : nl['form.titleLabel'], exact: true })).toBeVisible();
}

/** Fills the title, times, servings and step, so only the ingredient row is under test. */
async function fillRest(page: Page, title: string) {
  created.push(title);
  await titleField(page).fill(title);
  await prepField(page).fill('5');
  await totalField(page).fill('10');
  await servingsField(page).fill('2');
  await stepFields(page).first().fill('Roer.');
}

const options = (page: Page) => page.getByRole('listbox').getByRole('option');

async function savedLines(title: string) {
  const res = await adminClient().from('recipes').select('ingredients').eq('title', title).single();
  return (res.data?.ingredients ?? []) as Array<Record<string, unknown>>;
}

test.describe('suggestions (crit. 1)', () => {
  test('"br" lists at most 5 options including broccoli; "brocoli" shows the synonym; "b" shows no list', async ({ page }) => {
    await openNew(page);
    const name = ingredientNameFields(page).first();
    await name.fill('b');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await name.fill('br');
    await expect(page.getByRole('listbox')).toBeVisible();
    expect(await options(page).count()).toBeLessThanOrEqual(5);
    await expect(options(page).filter({ hasText: /^broccoli$/ })).toHaveCount(1);
    await name.fill('brocoli');
    await expect(page.getByRole('option', { name: 'brocoli → broccoli' })).toBeVisible();
  });

  test('in French "aardap" offers "pomme de terre"', async ({ page }) => {
    await openNew(page, 'fr');
    await ingredientNameFields(page).first().fill('aardap');
    await expect(page.getByRole('option', { name: 'aardappel → pomme de terre', exact: true })).toBeVisible();
  });

  // Crit. "Overal": the form fits 360 px in both languages, also with an open list and an open question (the French one is longer).
  for (const lang of ['nl', 'fr'] as const) test(`the open list and the open question fit in 360 px and every option is at least 44 px high (${lang})`, async ({ page }) => {
    await openNew(page, lang);
    await ingredientNameFields(page).first().fill('br');
    await expect(page.getByRole('listbox')).toBeVisible();
    for (const o of await options(page).all()) expect((await o.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await ingredientNameFields(page).first().fill(unique('tempeh'));
    await quantityFields(page).first().focus();
    await expect(catalogQuestion(page)).toBeVisible();
    for (const b of await catalogQuestion(page).getByRole('button').all()) {
      const box = (await b.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});

test.describe('choosing (crit. 2)', () => {
  test('tapping the option "broccoli" stores the reference', async ({ page }) => {
    const title = unique('Kies');
    await openNew(page);
    await fillRest(page, title);
    await ingredientNameFields(page).first().fill('br');
    await page.getByRole('option', { name: 'broccoli', exact: true }).tap().catch(() => page.getByRole('option', { name: 'broccoli', exact: true }).click());
    await expect(ingredientNameFields(page).first()).toHaveValue('broccoli');
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    expect((await savedLines(title))[0].ingredient_id).toBe(await idOf('ingredient_keys', 'ingredient_id', 'broccoli'));
  });

  test('typing a full French name "Tomate" and a unit "EL" and moving on links both without a question', async ({ page }) => {
    const title = unique('Exact');
    await openNew(page);
    await fillRest(page, title);
    await ingredientNameFields(page).first().fill('Tomate');
    await unitFields(page).first().fill('EL');
    await quantityFields(page).first().click();
    await page.waitForTimeout(800);
    await expect(catalogQuestion(page)).toHaveCount(0);
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    const line = (await savedLines(title))[0];
    expect(line.ingredient_id).toBe(await idOf('ingredient_keys', 'ingredient_id', 'tomaat'));
    expect(line.unit_id).toBe(await idOf('unit_keys', 'unit_id', 'el'));
  });
});

test.describe('"Bedoelde u" (crit. 3, 6)', () => {
  test('"paprica" asks "Bedoelde u paprika?"; the option links, "Nee" leads to the new-item question', async ({ page }) => {
    await openNew(page);
    await ingredientNameFields(page).first().fill('paprica');
    await quantityFields(page).first().click();
    await expect(page.getByRole('group', { name: 'Bedoelde u paprika?' })).toBeVisible();
    await page.getByRole('button', { name: 'Nee, paprica is nieuw' }).click();
    await expect(page.getByRole('group', { name: "Nieuw ingrediënt 'paprica'. Opslaan in de databank zodat iedereen het kan kiezen?" })).toBeVisible();
    await page.getByRole('button', { name: 'Nee', exact: true }).click();
    // fill() with the text that is already there fires no change event: clear first so the field counts as typed in.
    await ingredientNameFields(page).first().fill('');
    await ingredientNameFields(page).first().fill('paprica');
    await quantityFields(page).first().click();
    await page.getByRole('button', { name: 'paprika', exact: true }).click();
    await expect(ingredientNameFields(page).first()).toHaveValue('paprika');
  });

  test('two or more suggestions: one button per suggestion in suggest order, plus "Nee" (crit. 3)', async ({ page }) => {
    const base = rnd();
    created.push(`${base}a`, `${base}e`);
    for (const n of [`${base}a`, `${base}e`]) await sql(`insert into public.ingredients (name_nl) values (${lit(n)})`);
    await openNew(page);
    await ingredientNameFields(page).first().fill(`${base}o`);
    await quantityFields(page).first().click();
    const res = await user.client.rpc('suggest_ingredients', { p_term: `${base}o`, p_autocomplete: false, p_lang: 'nl' });
    const expected = ((res.data ?? []) as Array<{ name_nl: string | null; name_fr: string | null }>)
      .slice(0, 5)
      .map((r) => r.name_nl ?? r.name_fr);
    expect(expected.length).toBeGreaterThanOrEqual(2);
    const group = page.getByRole('group', { name: `Bedoelde u ${expected.join(' / ')}?` });
    await expect(group).toBeVisible();
    const buttons = group.getByRole('button');
    await expect(buttons).toHaveCount(expected.length + 1);
    expect((await buttons.allTextContents()).slice(0, -1)).toEqual(expected);
    await expect(buttons.last()).toHaveText(`Nee, ${base}o is nieuw`);
  });

  test('unit: "thee" offers "theelepel → tl"; "eetlepl" asks "Bedoelde u el?"', async ({ page }) => {
    await openNew(page);
    await unitFields(page).first().fill('thee');
    await expect(page.getByRole('option', { name: 'theelepel → tl' })).toBeVisible();
    await unitFields(page).first().fill('eetlepl');
    await quantityFields(page).first().click();
    await expect(page.getByRole('group', { name: 'Bedoelde u el?' })).toBeVisible();
  });
});

test.describe('new item (crit. 4, 6, 11)', () => {
  test('"Ja" creates the item with the Dutch name and the line points to it', async ({ page }) => {
    const name = rnd();
    const title = unique('Nieuw');
    created.push(name);
    await openNew(page);
    await fillRest(page, title);
    await ingredientNameFields(page).first().fill(name);
    await quantityFields(page).first().click();
    await expect(page.getByRole('group', { name: `Nieuw ingrediënt '${name}'. Opslaan in de databank zodat iedereen het kan kiezen?` })).toBeVisible();
    await page.getByRole('button', { name: 'Ja', exact: true }).click();
    await expect(catalogQuestion(page)).toHaveCount(0);
    const items = await sql<{ id: string; name_nl: string | null; name_fr: string | null }>(`select id, name_nl, name_fr from public.ingredients where name_nl = ${lit(name)}`);
    expect(items).toHaveLength(1);
    expect(items[0].name_fr).toBeNull();
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    expect((await savedLines(title))[0].ingredient_id).toBe(items[0].id);
  });

  test('in French "Oui" fills name_fr and leaves name_nl empty', async ({ page }) => {
    const name = rnd();
    created.push(name);
    await openNew(page, 'fr');
    await ingredientNameFields(page).first().fill(name);
    await quantityFields(page).first().click();
    await page.getByRole('button', { name: fr['form.yes'], exact: true }).click();
    await expect(catalogQuestion(page)).toHaveCount(0);
    const items = await sql<{ name_nl: string | null }>(`select name_nl from public.ingredients where name_fr = ${lit(name)}`);
    expect(items).toHaveLength(1);
    expect(items[0].name_nl).toBeNull();
  });

  test('"Nee" creates no item; the line stays free text', async ({ page }) => {
    const name = unique('tempeh');
    const title = unique('Vrij');
    await openNew(page);
    await fillRest(page, title);
    await ingredientNameFields(page).first().fill(name);
    await quantityFields(page).first().click();
    await page.getByRole('button', { name: 'Nee', exact: true }).click();
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    const line = (await savedLines(title))[0];
    expect(line.name).toBe(name);
    expect(line).not.toHaveProperty('ingredient_id');
    expect(await sql(`select 1 from public.ingredient_keys where key = ${lit(name.toLowerCase())}`)).toHaveLength(0);
  });

  test('race: the item exists at the moment of "Ja" -> the line links to the existing item, no second item', async ({ page }) => {
    const name = rnd();
    const title = unique('Race');
    created.push(name);
    await openNew(page);
    await fillRest(page, title);
    await ingredientNameFields(page).first().fill(name);
    await quantityFields(page).first().click();
    await expect(catalogQuestion(page)).toBeVisible();
    const other = (await sql<{ id: string }>(`insert into public.ingredients (name_nl) values (${lit(name)}) returning id`))[0].id;
    await page.getByRole('button', { name: 'Ja', exact: true }).click();
    await expect(catalogQuestion(page)).toHaveCount(0);
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    expect((await savedLines(title))[0].ingredient_id).toBe(other);
    expect(await sql(`select 1 from public.ingredients where name_nl = ${lit(name)}`)).toHaveLength(1);
  });

  test('a new unit asks "Nieuwe eenheid …" and "Ja" creates a unit', async ({ page }) => {
    const unit = `hv-${Math.random().toString(36).slice(2, 7)}`;
    await openNew(page);
    await unitFields(page).first().fill(unit);
    await quantityFields(page).first().click();
    await expect(page.getByRole('group', { name: `Nieuwe eenheid '${unit}'. Opslaan in de databank zodat iedereen het kan kiezen?` })).toBeVisible();
    await page.getByRole('button', { name: 'Ja', exact: true }).click();
    // T-032 / R-033: "Ja" is followed by the kind question; "Geen van beide" creates the unit.
    await page.getByRole('button', { name: nl['form.measureNone'], exact: true }).click();
    await expect(catalogQuestion(page)).toHaveCount(0);
    await expect.poll(async () => (await sql(`select 1 from public.units where name_nl = ${lit(unit)}`)).length).toBe(1);
    await sql(`delete from public.units where name_nl = ${lit(unit)}`);
  });

  test('a line without unit saves without a question and has no unit and unit_id', async ({ page }) => {
    const title = unique('ZonderEenheid');
    await openNew(page);
    await fillRest(page, title);
    await ingredientNameFields(page).first().fill('Tomate');
    await quantityFields(page).first().fill('2');
    await page.waitForTimeout(500);
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    const line = (await savedLines(title))[0];
    expect(line).not.toHaveProperty('unit');
    expect(line).not.toHaveProperty('unit_id');
  });

  test('81 characters: no save question, "Opslaan" shows the existing message at the field, no item', async ({ page }) => {
    const long = 'x'.repeat(75) + Math.random().toString(36).slice(2, 8);
    await openNew(page);
    await fillRest(page, unique('Lang'));
    await ingredientNameFields(page).first().fill(long);
    await quantityFields(page).first().click();
    await expect(catalogQuestion(page)).toHaveCount(0);
    await saveButton(page).click();
    await expect(ingredientNameFields(page).first()).toBeFocused();
    // The field message is a plain paragraph at the field (no role="alert").
    await expect(page.getByText(nl['form.nameInvalid'], { exact: true })).toBeVisible();
    expect(await sql(`select 1 from public.ingredient_keys where key = ${lit(long)}`)).toHaveLength(0);
  });

  test('an empty name with a quantity gives the existing message, no question and no item', async ({ page }) => {
    await openNew(page);
    await fillRest(page, unique('LeegNaam'));
    await quantityFields(page).first().fill('2');
    await saveButton(page).click();
    await expect(catalogQuestion(page)).toHaveCount(0);
    await expect(page.getByText(nl['form.nameInvalid'], { exact: true })).toBeVisible();
  });
});

test.describe('size and references on the pages (crit. 7, 9, 10)', () => {
  test('size Groot shows "2 aardappel (groot)", and "2 pomme de terre (grande taille)" after switching to French without reload', async ({ page }) => {
    const title = unique('Maat');
    await openNew(page);
    await fillRest(page, title);
    await ingredientNameFields(page).first().fill('aardappel');
    await quantityFields(page).first().fill('2');
    await sizeFields(page).first().selectOption({ label: 'Groot' });
    await page.waitForTimeout(500);
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('main')).toContainText('2 aardappel (groot)');
    // The language switch lives on /profiel; go there and back inside the app, so nothing reloads.
    await page.getByRole('navigation').getByRole('link', { name: 'Profiel', exact: true }).click();
    await page.getByRole('group', { name: 'Taal' }).getByRole('button', { name: 'Français', exact: true }).click();
    await page.goBack();
    await expect(page.getByRole('main')).toContainText('2 pomme de terre (grande taille)');
  });

  // R-026 crit. 5: the form's size list shows the three French sizes.
  test('in French the size list shows the three French sizes', async ({ page }) => {
    await openNew(page, 'fr');
    const labels = await sizeFields(page).first().locator('option').allTextContents();
    for (const key of ['form.sizeSmall', 'form.sizeMedium', 'form.sizeLarge']) expect(labels).toContain(fr[key]);
  });

  test('an admin rename shows on the detail page and in the edit form (crit. 9)', async ({ page }) => {
    const item = (await sql<{ id: string }>(`insert into public.ingredients (name_nl) values (${lit(unique('rename'))}) returning id`))[0].id;
    const row = await insertRecipe(user.client, { title: unique('Hernoem'), ingredients: [{ name: 'oude tekst', quantity: 1, ingredient_id: item }] });
    created.push(row.title);
    const newName = unique('nieuwenaam');
    created.push(newName);
    await sql(`update public.ingredients set name_nl = ${lit(newName)}, name_fr = ${lit(newName + '-fr')} where id = ${lit(item)}`);
    await page.goto(`/recept/${row.id}`);
    await expect(page.getByRole('main')).toContainText(newName);
    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(ingredientNameFields(page).first()).toHaveValue(newName);
    // Crit. 9: in French the detail page and the form show the new French name.
    await page.addInitScript(() => window.localStorage.setItem('smaakmaker.lang', 'fr'));
    await page.goto(`/recept/${row.id}`);
    await expect(page.getByRole('main')).toContainText(`${newName}-fr`);
    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(ingredientNameFields(page).first()).toHaveValue(`${newName}-fr`);
  });

  test('a variant keeps ids, sizes and the free line (crit. 10)', async ({ page }) => {
    const aardappel = await idOf('ingredient_keys', 'ingredient_id', 'aardappel');
    const src = await insertRecipe(user.client, {
      title: unique('Bron'),
      ingredients: [
        { name: 'aardappel', quantity: 2, size: 'large', ingredient_id: aardappel },
        { name: 'tempeh-vrij', quantity: 1 },
      ],
    });
    created.push(src.title);
    await page.goto(`/recept/${src.id}`);
    await page.getByRole('link', { name: 'Maak een variant' }).click();
    await expect(titleField(page)).toBeVisible();
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    const res = await adminClient().from('recipes').select('title,ingredients').eq('variant_of', src.id).single();
    created.push(res.data!.title as string);
    expect(res.data!.ingredients).toEqual([
      { name: 'aardappel', quantity: 2, size: 'large', ingredient_id: aardappel },
      { name: 'tempeh-vrij', quantity: 1 },
    ]);
  });
});
