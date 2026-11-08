import { expect, test, type Page } from '@playwright/test';
import { ingredientNameFields, nl } from '../helpers/recipe-form';
import frJson from '../../src/i18n/fr.json' with { type: 'json' };
import { sql } from '../helpers/pg';
import { signInViaStorage } from '../helpers/session';
import { assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, type TestUser } from '../helpers/supabase-admin';
import { autoOpenFilters, openFilters } from '../helpers/overview';

// T-029: filters sit behind the "Filters" button; open them after every visit of `/` or `/favorieten`.
test.beforeEach(({ page }) => autoOpenFilters(page));

// T-023 / R-024: tags, equipment and ingredients show themselves in the language of the reader. Viewport 360 x 640.
const fr = frJson as Record<string, string>;
type Lang = 'nl' | 'fr';
const T = { nl, fr } as const;

let user: TestUser;
const usedNames: string[] = [];
const createdIngredients: string[] = [];
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const rand = () => Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6) || 'abc';
const unique = (label: string) => `${label} ${Date.now()}-${rand()}`;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('bild', { displayName: 'Bilingue Bert' });
});

test.afterAll(async () => {
  if (user) await deleteTestUser(user);
  for (const n of usedNames) {
    await sql(`delete from public.tags where name_key = public.fold_key(${lit(n)})`).catch(() => undefined);
    await sql(`delete from public.equipment where name_key = public.fold_key(${lit(n)})`).catch(() => undefined);
  }
  for (const n of createdIngredients) await sql(`delete from public.ingredients where name_nl = ${lit(n)}`).catch(() => undefined);
});

/** Starts the app in the given language (the same key the language switch uses). */
async function start(page: Page, lang: Lang, path: string) {
  await signInViaStorage(page, user.session);
  await page.addInitScript((l) => window.localStorage.setItem('smaakmaker.lang', l), lang);
  await page.goto(path);
}

const item = (page: Page, title: string) => page.locator('.recipe-list > li').filter({ hasText: title });
const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const group = (page: Page, lang: Lang, key: string) => page.getByRole('group', { name: T[lang][key], exact: true });
const button = (page: Page, lang: Lang, key: string, name: string) =>
  group(page, lang, key).getByRole('button', { name, exact: true });

test.describe('crit. 1: ingredient and unit names follow the interface language', () => {
  test('detail page, form and suggestions show the French name; switching back shows the Dutch name without reload', async ({ page }) => {
    const solo = `alleen-nl-${rand()}`;
    createdIngredients.push(solo);
    const potato = (await sql<{ id: string }>(`select ingredient_id as id from public.ingredient_keys where key = 'aardappel'`))[0].id;
    const soloId = (await sql<{ id: string }>(`insert into public.ingredients (name_nl) values (${lit(solo)}) returning id`))[0].id;
    const title = unique('Tweetalig');
    const row = await insertRecipe(user.client, {
      title,
      ingredients: [
        { name: 'aardappel', quantity: 2, ingredient_id: potato },
        { name: solo, quantity: 1, ingredient_id: soloId },
      ],
    });

    await start(page, 'fr', `/recept/${row.id}`);
    const main = page.getByRole('main');
    await expect(main).toContainText('pomme de terre');
    await expect(main).toContainText(solo); // no French name: falls back to the Dutch one
    await expect(main).not.toContainText('aardappel');

    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(ingredientNameFields(page).first()).toHaveValue('pomme de terre');

    await page.goto('/nieuw');
    await ingredientNameFields(page).first().fill('pom');
    await expect(page.getByRole('option', { name: /pomme de terre/ }).first()).toBeVisible();

    // Switch inside the app (no reload) and come back to the detail page.
    await page.goto(`/recept/${row.id}`);
    await page.getByRole('navigation', { name: fr['nav.label'] }).getByRole('link', { name: fr['nav.profile'], exact: true }).click();
    await page.getByRole('group', { name: fr['language.label'], exact: true }).getByRole('button', { name: 'Nederlands', exact: true }).click();
    await page.goBack();
    await expect(page.getByRole('main')).toContainText('aardappel');
    await expect(page.getByRole('main')).not.toContainText('pomme de terre');
  });

  // Crit. 1 (results overview): the result count is language independent. Searching on the stored text
  // gives the same recipe and the same "1 van 1" / "1 sur 1" count in both interface languages.
  // Searching on the French name ("pomme de terre") needs translated search (R-021, T-024), so it is not tested here.
  test('searching "aardappel" gives the same recipe with "1 van 1" / "1 sur 1" in both languages', async ({ page }) => {
    const potato = (await sql<{ id: string }>(`select ingredient_id as id from public.ingredient_keys where key = 'aardappel'`))[0].id;
    const title = unique('Zoektaal');
    await insertRecipe(user.client, { title, ingredients: [{ name: 'aardappel', quantity: 1, ingredient_id: potato }] });
    for (const lang of ['nl', 'fr'] as const) {
      await start(page, lang, '/');
      await page.getByLabel(T[lang]['search.with'], { exact: true }).fill('aardappel');
      await page.getByRole('button', { name: T[lang]['search.submit'], exact: true }).click();
      const matches = T[lang]['search.matches'].replace('{count}', '1').replace('{total}', '1');
      await expect(item(page, title), lang).toContainText(matches);
    }
  });
});

test.describe('crit. 2: start tags show themselves in the language of the reader', () => {
  test('French: form and filter show "soupe" and "végétarien"; detail shows "soupe"', async ({ page }) => {
    const title = unique('Soupe FR');
    const row = await insertRecipe(user.client, { title, dish_tags: ['soep'], trait_tags: ['vegetarisch'] });
    await start(page, 'fr', '/nieuw');
    await expect(button(page, 'fr', 'tags.dish', 'soupe')).toBeVisible();
    await expect(button(page, 'fr', 'tags.trait', 'végétarien')).toBeVisible();
    await page.goto('/');
    await expect(button(page, 'fr', 'tags.dish', 'soupe')).toBeVisible();
    await expect(button(page, 'fr', 'tags.trait', 'végétarien')).toBeVisible();
    await page.goto(`/recept/${row.id}`);
    await expect(page.getByTestId('recipe-dish-tags')).toContainText('soupe');
    await expect(page.getByTestId('recipe-trait-tags')).toContainText('végétarien');
  });

  test('Dutch: "soep" in form, filter and detail', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Soep NL'), dish_tags: ['soep'] });
    await start(page, 'nl', '/nieuw');
    await expect(button(page, 'nl', 'tags.dish', 'soep')).toBeVisible();
    await page.goto('/');
    await expect(button(page, 'nl', 'tags.dish', 'soep')).toBeVisible();
    await page.goto(`/recept/${row.id}`);
    await expect(page.getByTestId('recipe-dish-tags')).toContainText('soep');
  });
});

test.describe('crit. 3: equipment start list is always a choice', () => {
  test('filter and form show "four" in French and "oven" in Dutch', async ({ page }) => {
    await start(page, 'fr', '/');
    await expect(button(page, 'fr', 'filter.equipment', 'four')).toBeVisible();
    await page.goto('/nieuw');
    await expect(button(page, 'fr', 'form.equipment', 'four')).toBeVisible();
    await expect(button(page, 'fr', 'form.equipment', 'friteuse à air chaud')).toBeVisible();

    const nlPage = await page.context().newPage();
    await start(nlPage, 'nl', '/');
    await openFilters(nlPage); // a page from newPage() is not wrapped by autoOpenFilters
    await expect(button(nlPage, 'nl', 'filter.equipment', 'oven')).toBeVisible();
    await expect(button(nlPage, 'nl', 'filter.equipment', 'airfryer')).toBeVisible();
  });
});

test.describe('crit. 4: user-added tags have one name in both languages', () => {
  test('"Fondue" is "Fondue" in Dutch and in French (tag and equipment)', async ({ page }) => {
    const tag = `Fondue${rand()}`;
    const gear = `Caquelon${rand()}`;
    usedNames.push(tag, gear);
    const row = await insertRecipe(user.client, { title: unique('Eigen'), dish_tags: [tag], equipment: [gear] });
    for (const lang of ['nl', 'fr'] as const) {
      await start(page, lang, `/recept/${row.id}`);
      await expect(page.getByTestId('recipe-dish-tags')).toContainText(tag);
      await expect(page.getByTestId('recipe-equipment')).toContainText(gear);
      await page.goto('/nieuw');
      await expect(button(page, lang, 'tags.dish', tag)).toBeVisible();
      await expect(button(page, lang, 'form.equipment', gear)).toBeVisible();
    }
  });
});

test.describe('crit. 5: filtering works across languages', () => {
  test('a recipe with tag soep and equipment oven is found with "soupe" and "four" in French', async ({ page }) => {
    const title = unique('Filter FR');
    const other = unique('Filter Andere');
    await insertRecipe(user.client, { title, dish_tags: ['soep'], equipment: ['oven'] });
    await insertRecipe(user.client, { title: other, dish_tags: ['dessert'], equipment: ['blender'] });
    await start(page, 'fr', '/');
    await button(page, 'fr', 'tags.dish', 'soupe').click();
    await expect(item(page, title)).toHaveCount(1);
    await expect(item(page, other)).toHaveCount(0);
    await expect(page).toHaveURL(/soort=soep/); // the URL keeps the canonical name
    await button(page, 'fr', 'tags.dish', 'soupe').click();
    await button(page, 'fr', 'filter.equipment', 'four').click();
    await expect(item(page, title)).toHaveCount(1);
    await expect(item(page, other)).toHaveCount(0);
    await expect(page).toHaveURL(/gerief=oven/);
    // The equipment labels on the overview card show the French name too.
    await expect(item(page, title).getByTestId('recipe-equipment')).toContainText('four');
  });

  test('the same URL gives the same selection in Dutch, and a hand-typed French name works', async ({ page }) => {
    const title = unique('Filter URL');
    await insertRecipe(user.client, { title, dish_tags: ['soep'] });
    await start(page, 'nl', '/?soort=soep');
    await expect(item(page, title)).toHaveCount(1);
    await expect(button(page, 'nl', 'tags.dish', 'soep')).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/?soort=soupe');
    await expect(item(page, title)).toHaveCount(1);
  });
});

test.describe('crit. 6: "exists already" compares with both names', () => {
  test('typing "soupe" and tapping "Ajouter une étiquette" presses the existing "soupe" button, no second one', async ({ page }) => {
    await start(page, 'fr', '/nieuw');
    const dish = group(page, 'fr', 'tags.dish');
    await dish.getByRole('textbox', { name: fr['form.tagNew'], exact: true }).fill('soupe');
    await dish.getByRole('button', { name: fr['form.tagAdd'], exact: true }).click();
    await expect(button(page, 'fr', 'tags.dish', 'soupe')).toHaveAttribute('aria-pressed', 'true');
    await expect(dish.getByRole('button', { name: /^soupe$/i })).toHaveCount(1);
  });

  test('typing "micro-ondes" presses the existing equipment button, no second one', async ({ page }) => {
    await start(page, 'fr', '/nieuw');
    const gear = group(page, 'fr', 'form.equipment');
    await page.getByRole('textbox', { name: fr['form.equipmentNew'], exact: true }).fill('Micro-ondes');
    await page.getByRole('button', { name: fr['form.equipmentAdd'], exact: true }).click();
    await expect(button(page, 'fr', 'form.equipment', 'micro-ondes')).toHaveAttribute('aria-pressed', 'true');
    await expect(gear.getByRole('button', { name: /^micro-ondes$/i })).toHaveCount(1);
  });
});

test.describe('crit. 7: lists follow the shown name', () => {
  const START: Record<Lang, string[]> = {
    nl: ['bijgerecht', 'dessert', 'hoofdgerecht', 'ontbijt', 'saus', 'snack', 'soep', 'tapas'],
    fr: ['accompagnement', 'dessert', 'en-cas', 'petit-déjeuner', 'plat principal', 'sauce', 'soupe', 'tapas'],
  };

  for (const lang of ['nl', 'fr'] as const) {
    test(`the dish tag buttons are ordered by the ${lang} name (form and filter)`, async ({ page }) => {
      await start(page, lang, '/nieuw');
      const collator = new Intl.Collator(lang === 'nl' ? 'nl-BE' : 'fr-BE');
      for (const path of ['/nieuw', '/']) {
        await page.goto(path);
        await expect(button(page, lang, 'tags.dish', START[lang][0])).toBeVisible();
        const names = await group(page, lang, 'tags.dish').getByRole('button').allInnerTexts();
        const own = names.map((n) => n.trim()).filter((n) => START[lang].includes(n));
        expect(own, path).toEqual([...START[lang]].sort(collator.compare));
      }
    });
  }

  // The order flips between the languages: "kookplaat" < "oven" in Dutch, "four" < "plaque de cuisson" in French.
  for (const [lang, first, second] of [
    ['nl', 'kookplaat', 'oven'],
    ['fr', 'four', 'plaque de cuisson'],
  ] as const) {
    test(`equipment choices: "${first}" before "${second}" in ${lang}`, async ({ page }) => {
      await start(page, lang, '/nieuw');
      await expect(button(page, lang, 'form.equipment', first)).toBeVisible();
      const names = (await group(page, lang, 'form.equipment').getByRole('button').allInnerTexts()).map((n) => n.trim());
      expect(names.indexOf(first)).toBeGreaterThanOrEqual(0);
      expect(names.indexOf(second)).toBeGreaterThanOrEqual(0);
      expect(names.indexOf(first)).toBeLessThan(names.indexOf(second));
    });
  }

  test('French names fit in 360 px without horizontal scroll (form and overview)', async ({ page }) => {
    await start(page, 'fr', '/nieuw');
    await expect(button(page, 'fr', 'form.equipment', 'friteuse à air chaud')).toBeVisible();
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
    await page.goto('/');
    await expect(button(page, 'fr', 'filter.equipment', 'plaque de cuisson')).toBeVisible();
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
  });
});
