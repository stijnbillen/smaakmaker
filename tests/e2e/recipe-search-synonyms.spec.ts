import { expect, test, type Page } from '@playwright/test';
import { autoOpenFilters, openFilters, setTimeLimit } from '../helpers/overview';
import { nl } from '../helpers/recipe-form';
import frJson from '../../src/i18n/fr.json' with { type: 'json' };
import { signInViaStorage } from '../helpers/session';
import { adminClient, assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, type TestUser } from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';

// T-024 / R-021: search with synonyms, "Bedoelde u" and "Al toegevoegd." on the overview. Viewport 360 x 640.
const fr = frJson as Record<string, string>;
type Lang = 'nl' | 'fr';

let user: TestUser;
let s = '';
const ids: Record<string, string> = {};

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('rsyne2e', { displayName: 'Sofie Synoniem' });
  for (const key of ['broccoli', 'tomaat', 'aardappel', 'paprika']) {
    ids[key] = (await sql<{ id: string }>(`select ingredient_id as id from public.ingredient_keys where key = '${key}'`))[0].id;
  }
});

test.afterAll(async () => {
  if (user) await deleteTestUser(user);
});

test.beforeEach(async ({ page }) => {
  autoOpenFilters(page); // T-029: filters sit behind the "Filters" button
  s = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  await signInViaStorage(page, user.session);
});

const t = (lang: Lang, key: string) => (lang === 'fr' ? fr : nl)[key];
const withField = (page: Page, lang: Lang = 'nl') => page.getByLabel(t(lang, 'search.with'), { exact: true });
const withoutField = (page: Page, lang: Lang = 'nl') => page.getByLabel(t(lang, 'search.without'), { exact: true });
const item = (page: Page, title: string) => page.locator('.recipe-list > li').filter({ hasText: title });
const urlParams = (page: Page) => new URL(page.url()).searchParams;
const didYouMean = (lang: Lang, name: string) => t(lang, 'search.didYouMean').replace('{name}', name);
const matchesText = (lang: Lang, count: number, total: number) =>
  t(lang, 'search.matches').replace('{count}', String(count)).replace('{total}', String(total));

async function open(page: Page, lang: Lang, path = '/') {
  if (lang === 'fr') await page.addInitScript(() => window.localStorage.setItem('smaakmaker.lang', 'fr'));
  await page.goto(path);
  await openFilters(page); // also for pages from newContext(), which autoOpenFilters does not wrap
  await expect(withField(page, lang)).toBeVisible();
}

async function make(label: string, lines: Array<{ name: string; ingredient_id?: string }>, extra: Record<string, unknown> = {}) {
  const row = await insertRecipe(user.client, {
    title: `${label} ${s}`,
    ingredients: lines.map((l) => ({ quantity: 1, unit: 'stuk', ...l })),
    ...extra,
  });
  return { ...row, title: `${label} ${s}` };
}

async function ownTitles(page: Page): Promise<string[]> {
  const all = await page.locator('.recipe-list .recipe-title').allTextContents();
  return all.filter((x) => x.endsWith(` ${s}`));
}

async function expectNoOverflow(page: Page) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(360);
}

test.describe('crit. 1: an exact term finds the item in both languages', () => {
  for (const lang of ['nl', 'fr'] as const) {
    test(`"pomme de terre" and "aardappel" give the same recipe with "1 van 1" (${lang})`, async ({ page }) => {
      const a = await make('Aardappelgerecht', [{ name: `knol ${s}`, ingredient_id: ids.aardappel }]);
      await open(page, lang);
      for (const term of ['pomme de terre', 'aardappel']) {
        await withField(page, lang).fill(term);
        await withField(page, lang).press('Enter');
        await expect(item(page, a.title)).toBeVisible();
        await expect(item(page, a.title).getByTestId('recipe-matches')).toHaveText(matchesText(lang, 1, 1));
      }
    });
  }
});

test.describe('crit. 3: "Bedoelde u <naam>?"', () => {
  test('typing "paprica" shows the suggestion and "Niets gevonden"; a tap puts "paprika" in the field and finds the recipe', async ({ page }) => {
    const a = await make('Paprikagerecht', [{ name: `rode ${s}`, ingredient_id: ids.paprika }]);
    await open(page, 'nl');
    await withField(page).fill('paprica');
    const suggestion = page.getByRole('button', { name: didYouMean('nl', 'paprika'), exact: true });
    await expect(suggestion).toBeVisible();
    await expect(page.getByText(nl['overview.noMatch'], { exact: true })).toBeVisible();
    await expectNoOverflow(page);
    const box = await suggestion.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await suggestion.click();
    await expect(withField(page)).toHaveValue('paprika');
    await expect.poll(() => urlParams(page).getAll('met')).toEqual(['paprika']);
    await expect(item(page, a.title)).toBeVisible();
    await expect(page.getByRole('button', { name: didYouMean('nl', 'paprika') })).toHaveCount(0);
  });

  test('in French the text and the name are French', async ({ page }) => {
    const a = await make('Poivron', [{ name: `rouge ${s}`, ingredient_id: ids.paprika }]);
    await open(page, 'fr');
    await withField(page, 'fr').fill('paprica');
    const suggestion = page.getByRole('button', { name: didYouMean('fr', 'poivron'), exact: true });
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await expect(withField(page, 'fr')).toHaveValue('poivron');
    await expect(item(page, a.title)).toBeVisible();
  });

  test('no "Bedoelde u" for an existing item ("zout") or for nonsense ("xqzv")', async ({ page }) => {
    await open(page, 'nl');
    for (const term of ['zout', 'xqzv']) {
      await withField(page).fill(term);
      await withField(page).press('Enter');
      await expect(page).toHaveURL(new RegExp(`met=${term}`));
      await page.waitForTimeout(600);
      await expect(page.getByRole('button', { name: /^Bedoelde u/ })).toHaveCount(0);
    }
  });

  test('typing "papric" and then "paprica" leaves only the suggestion of the last input', async ({ page }) => {
    await open(page, 'nl');
    await withField(page).fill('papric');
    await withField(page).fill('paprica');
    await expect(page.getByRole('button', { name: didYouMean('nl', 'paprika'), exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Bedoelde u/ })).toHaveCount(1);
  });

  test('"Zonder" also shows "Bedoelde u" for a typo', async ({ page }) => {
    await open(page, 'nl');
    await withoutField(page).fill('paprica');
    await expect(page.getByRole('button', { name: didYouMean('nl', 'paprika'), exact: true })).toBeVisible();
  });
});

test.describe('crit. 4: "Zonder" recognises synonyms', () => {
  test('Zonder "brocoli" drops the recipe with broccoli', async ({ page }) => {
    const withB = await make('Met broccoli', [{ name: `roosjes ${s}`, ingredient_id: ids.broccoli }]);
    const without = await make('Zonder broccoli', [{ name: `rijst ${s}` }]);
    await open(page, 'nl');
    await expect(item(page, withB.title)).toBeVisible();
    await withoutField(page).fill('brocoli');
    await withoutField(page).press('Enter');
    await expect(item(page, withB.title)).toHaveCount(0);
    await expect(item(page, without.title)).toBeVisible();
  });
});

test.describe('crit. 5: two terms for one item', () => {
  for (const lang of ['nl', 'fr'] as const) {
    test(`"broccoli, brocoli" shows "Al toegevoegd.", only met=broccoli in the URL, no "Minstens" and "1 van 1" (${lang})`, async ({ page }) => {
      const a = await make('Broccoli', [{ name: `roosjes ${s}`, ingredient_id: ids.broccoli }]);
      await open(page, lang);
      await withField(page, lang).fill('broccoli, brocoli');
      await withField(page, lang).press('Enter');
      await expect(page.getByText(t(lang, 'search.duplicate'), { exact: true })).toBeVisible();
      // poll: the URL first holds both terms until search_term_info answers, then only the deduplicated one
      await expect.poll(() => urlParams(page).getAll('met')).toEqual(['broccoli']);
      await expect(page.getByLabel(t(lang, 'search.min'), { exact: true })).toHaveCount(0);
      await expect(item(page, a.title).getByTestId('recipe-matches')).toHaveText(matchesText(lang, 1, 1));
      await expectNoOverflow(page);
    });
  }
});

test.describe('crit. 6: results do not depend on the interface language', () => {
  test('"tomate" gives the same titles in the same order in Dutch and French', async ({ page, browser }) => {
    await make('Oud tomaat', [{ name: `rond ${s}`, ingredient_id: ids.tomaat }]);
    await make('Nieuw tomaat', [{ name: `rood ${s}`, ingredient_id: ids.tomaat }]);
    const results: string[][] = [];
    for (const lang of ['nl', 'fr'] as const) {
      const p = lang === 'nl' ? page : await (await browser.newContext({ viewport: { width: 360, height: 640 } })).newPage();
      if (lang === 'fr') await signInViaStorage(p, user.session);
      await open(p, lang, '/?met=tomate');
      await expect(item(p, `Nieuw tomaat ${s}`)).toBeVisible();
      results.push(await ownTitles(p));
    }
    expect(results[0]).toEqual([`Nieuw tomaat ${s}`, `Oud tomaat ${s}`]);
    expect(results[1]).toEqual(results[0]);
  });
});

test.describe('crit. 7: combines with filters', () => {
  test('"brocoli" with a time filter gives only the fitting recipe', async ({ page }) => {
    const fast = await make('Snel', [{ name: `roosjes ${s}`, ingredient_id: ids.broccoli }], { prep_minutes: 10, total_minutes: 20 });
    const slow = await make('Traag', [{ name: `roosjes ${s}`, ingredient_id: ids.broccoli }], { prep_minutes: 40, total_minutes: 60 });
    await open(page, 'nl');
    await withField(page).fill('brocoli');
    await withField(page).press('Enter');
    await expect(item(page, slow.title)).toBeVisible();
    await setTimeLimit(page, 'prep', 15);
    await expect(item(page, slow.title)).toHaveCount(0);
    await expect(item(page, fast.title)).toBeVisible();
  });

  // Crit. 7: search together with the favourites (IngredientSearch is also used on /favorieten).
  test('"brocoli" on the favourites page gives only the favourite broccoli recipe', async ({ page }) => {
    const fav = await make('Favoriet broccoli', [{ name: `roosjes ${s}`, ingredient_id: ids.broccoli }]);
    const other = await make('Gewone broccoli', [{ name: `roosjes ${s}`, ingredient_id: ids.broccoli }]);
    const res = await adminClient().from('favorites').insert({ user_id: user.id, recipe_id: fav.id });
    if (res.error) throw res.error;
    await open(page, 'nl', '/favorieten');
    await expect(item(page, fav.title)).toBeVisible();
    await withField(page).fill('brocoli');
    await withField(page).press('Enter');
    await expect(item(page, fav.title)).toBeVisible();
    await expect(item(page, other.title)).toHaveCount(0);
  });
});
