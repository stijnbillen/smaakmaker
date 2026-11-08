import { expect, test, type Locator, type Page } from '@playwright/test';
import { seedLanguage, signInViaStorage } from '../helpers/session';
import {
  clearAllButton,
  closeFilters,
  directionButton,
  filtersButton,
  filtersLabel,
  filtersPanel,
  openFilters,
  sortSelect,
  text,
  type Lang,
} from '../helpers/overview';
import { sql } from '../helpers/pg';
import { adminClient, assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, type TestUser } from '../helpers/supabase-admin';

// T-029 / R-028: filters behind a button, always-visible sort with five fields and a direction button.
// Local Supabase, viewport 360 x 640. Every test has its own letters-only suffix `s` in titles and ingredient names
// and looks only at its own titles, because other specs leave recipes behind.
const LANGS: Lang[] = ['nl', 'fr'];
let user: TestUser;
let raters: TestUser[] = [];
let s = '';

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('ovflt', { displayName: 'Filip Filter' });
  raters = [];
  for (const name of ['ovfltr1', 'ovfltr2', 'ovfltr3', 'ovfltr4']) raters.push(await createTestUser(name));
});

test.afterAll(async () => {
  for (const u of [user, ...raters]) if (u) await deleteTestUser(u);
});

test.beforeEach(async ({ page }) => {
  s = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  await signInViaStorage(page, user.session);
});

const item = (page: Page, title: string) => page.locator('.recipe-list > li').filter({ hasText: title });
const urlParams = (page: Page) => new URL(page.url()).searchParams;

/** Titles of this test in list order. */
async function ownTitles(page: Page): Promise<string[]> {
  const all = await page.locator('.recipe-list .recipe-title').allTextContents();
  return all.filter((x) => x.endsWith(` ${s}`));
}

async function make(label: string, extra: Record<string, unknown> = {}) {
  const title = `${label} ${s}`;
  const row = await insertRecipe(user.client, { title, ...extra });
  return { ...row, title };
}

const ingredient = (name: string) => ({ name, quantity: 1, unit: 'stuk' });
const favorite = async (recipeId: string) => {
  const res = await adminClient().from('favorites').insert({ user_id: user.id, recipe_id: recipeId });
  expect(res.error).toBeNull();
};

// Field locators by label, per language.
const withField = (page: Page, lang: Lang = 'nl') => page.getByLabel(text(lang, 'search.with'), { exact: true });
const withoutField = (page: Page, lang: Lang = 'nl') => page.getByLabel(text(lang, 'search.without'), { exact: true });
const minField = (page: Page, lang: Lang = 'nl') => page.getByLabel(text(lang, 'search.min'), { exact: true });
const prepField = (page: Page, lang: Lang = 'nl') => page.getByLabel(text(lang, 'filter.maxPrep'), { exact: true });
const totalField = (page: Page, lang: Lang = 'nl') => page.getByLabel(text(lang, 'filter.maxTotal'), { exact: true });
const groupOf = (page: Page, lang: Lang, key: 'tags.dish' | 'tags.trait' | 'filter.equipment') =>
  page.getByRole('group', { name: text(lang, key), exact: true });
const submitButton = (page: Page, lang: Lang = 'nl') => page.getByRole('button', { name: text(lang, 'search.submit'), exact: true });
const tagChip = (page: Page, name: string) => groupOf(page, 'nl', 'tags.dish').getByRole('button', { name, exact: true });

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, 'element has a box').not.toBeNull();
  return b as { x: number; y: number; width: number; height: number };
}

/** The label element of a field, found through the field's id. */
async function labelOf(page: Page, field: Locator): Promise<Locator> {
  const id = await field.getAttribute('id');
  expect(id, 'field has an id').toBeTruthy();
  return page.locator(`label[for="${id}"]`);
}

test.describe('crit. 1: only the button, the sort and the list at first', () => {
  for (const path of ['/', '/favorieten']) {
    test(`${path}: search, time, tags and equipment are hidden; button, sort and list are visible`, async ({ page }) => {
      const r = await make('Eerste', { ingredients: [ingredient(`feta${s}`)] });
      await favorite(r.id);
      await page.goto(path);
      await expect(filtersButton(page)).toBeVisible();
      await expect(sortSelect(page)).toBeVisible();
      await expect(item(page, r.title)).toBeVisible();
      await expect(withField(page)).toBeHidden();
      await expect(prepField(page)).toBeHidden();
      await expect(totalField(page)).toBeHidden();
      await expect(groupOf(page, 'nl', 'tags.dish')).toBeHidden();
      await expect(groupOf(page, 'nl', 'tags.trait')).toBeHidden();
      await expect(groupOf(page, 'nl', 'filter.equipment')).toBeHidden();
    });
  }

  test('active filters in the URL keep the panel closed, but the list is filtered', async ({ page }) => {
    const fits = await make('Past', { ingredients: [ingredient(`tomaat${s}`)], prep_minutes: 10, total_minutes: 20, dish_tags: ['soep'] });
    const other = await make('Past niet', { ingredients: [ingredient(`kaas${s}`)], prep_minutes: 10, total_minutes: 20, dish_tags: ['soep'] });
    await page.goto(`/?met=tomaat${s}&prep=15&soort=soep`);
    await expect(item(page, fits.title)).toBeVisible();
    await expect(item(page, other.title)).toHaveCount(0);
    await expect(filtersButton(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(withField(page)).toBeHidden();
    await expect(prepField(page)).toBeHidden();
    await expect(groupOf(page, 'nl', 'tags.dish')).toBeHidden();
    await expect(sortSelect(page)).toBeVisible();
  });
});

test.describe('crit. 2: the button opens and closes the panel and reloads nothing', () => {
  test('aria-expanded flips, the panel sits under the button and is controlled by it', async ({ page }) => {
    await make('Een');
    await page.goto('/');
    const button = filtersButton(page);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    const controls = await button.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator(`#${controls}`);
    await expect(panel).toBeVisible();
    await expect(withField(page)).toBeVisible();
    await expect(prepField(page)).toBeVisible();
    const b = await box(button);
    const p = await box(panel);
    expect(p.y).toBeGreaterThanOrEqual(b.y + b.height - 1);
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();
  });

  test('three times open and closed with active filters: no new data requests, URL byte-equal', async ({ page }) => {
    await make('Twee', { ingredients: [ingredient(`tomaat${s}`)], dish_tags: ['soep'] });
    const url = `/?met=tomaat${s}&prep=15&soort=soep`;
    await page.goto(url);
    await expect(filtersButton(page)).toBeVisible();
    await page.waitForLoadState('networkidle');
    const before = page.url();
    const seen: string[] = [];
    page.on('request', (req) => {
      if (/\/rest\/v1\/(recipes|rpc\/search_recipes|tags|rpc\/equipment_choices)/.test(req.url())) seen.push(req.url());
    });
    for (let i = 0; i < 3; i++) {
      await openFilters(page);
      await closeFilters(page);
    }
    await page.waitForTimeout(500);
    expect(seen).toEqual([]);
    expect(page.url()).toBe(before);
  });

  test('text typed in "Met ingrediënten" survives closing and opening again', async ({ page }) => {
    await make('Drie');
    await page.goto('/');
    await openFilters(page);
    await withField(page).fill(`bloem${s}`);
    await closeFilters(page);
    await openFilters(page);
    await expect(withField(page)).toHaveValue(`bloem${s}`);
  });
});

test.describe('crit. 3: the counter on the button', () => {
  for (const lang of LANGS) {
    test(`${lang}: "${filtersLabel(lang, 2)}" for two filters, 3 with extra equipment, bare label after "${text(lang, 'overview.clearAll')}"`, async ({ page }) => {
      await seedLanguage(page, lang);
      await make('Teller');
      await page.goto('/?prep=15&soort=soep');
      await expect(filtersButton(page)).toHaveText(filtersLabel(lang, 2));
      await openFilters(page);
      await groupOf(page, lang, 'filter.equipment').locator('.choice').first().click();
      await expect(filtersButton(page)).toHaveText(filtersLabel(lang, 3));
      await clearAllButton(page, lang).click();
      await expect(filtersButton(page)).toHaveText(filtersLabel(lang, 0));
      await expect(filtersButton(page)).toHaveText(text(lang, 'overview.filters'));
    });
  }

  test('without filters the button reads "Filters" only', async ({ page }) => {
    await page.goto('/');
    await expect(filtersButton(page)).toHaveText(text('nl', 'overview.filters'));
  });
});

test.describe('crit. 4: "Alles wissen"', () => {
  test('is absent without a filter or search', async ({ page }) => {
    await page.goto('/');
    await openFilters(page);
    await expect(clearAllButton(page)).toHaveCount(0);
  });

  test('clears search and filters, keeps the sort; the list is alphabetical again with every recipe', async ({ page }) => {
    await make('Zeta', { ingredients: [ingredient(`tomaat${s}`)] });
    await make('Midden', { ingredients: [ingredient(`kaas${s}`)] });
    await make('Alfa', { ingredients: [ingredient(`tomaat${s}`)] });
    await page.goto(`/?met=tomaat${s}&prep=15&sorteer=titel`);
    await expect.poll(() => ownTitles(page)).toEqual([`Alfa ${s}`, `Zeta ${s}`]);
    await openFilters(page);
    await clearAllButton(page).click();
    await expect(withField(page)).toHaveValue('');
    await expect(prepField(page)).toHaveValue('');
    await expect(prepField(page).locator('option:checked')).toHaveText(text('nl', 'filter.all'));
    await expect(filtersPanel(page).getByRole('button', { pressed: true })).toHaveCount(0);
    await expect(page).toHaveURL((u) => u.search === '?sorteer=titel');
    await expect.poll(() => ownTitles(page)).toEqual([`Alfa ${s}`, `Midden ${s}`, `Zeta ${s}`]);
  });

  test('a tap right after typing (inside the debounce) leaves the field empty and the search gone', async ({ page }) => {
    await make('Debounce');
    await page.goto('/?prep=15');
    await openFilters(page);
    await withField(page).fill(`melk${s}`);
    await clearAllButton(page).click();
    await expect(withField(page)).toHaveValue('');
    await page.waitForTimeout(1000);
    await expect(withField(page)).toHaveValue('');
    expect(urlParams(page).has('met')).toBe(false);
  });
});

test.describe('crit. 5: search and filters work inside the favourites', () => {
  test('/favorieten: a search term and a tag together leave only the matching favourite', async ({ page }) => {
    const soup = await make('Soep fav', { ingredients: [ingredient(`feta${s}`)], dish_tags: ['soep'] });
    const plain = await make('Gewoon fav', { ingredients: [ingredient(`feta${s}`)] });
    const notFav = await make('Geen fav', { ingredients: [ingredient(`feta${s}`)], dish_tags: ['soep'] });
    await favorite(soup.id);
    await favorite(plain.id);
    await page.goto('/favorieten');
    await openFilters(page);
    await withField(page).fill(`feta${s}`);
    await submitButton(page).click();
    await expect(item(page, plain.title)).toBeVisible();
    await tagChip(page, 'soep').click();
    await expect(item(page, plain.title)).toHaveCount(0);
    await expect(item(page, soup.title)).toBeVisible();
    await expect(item(page, notFav.title)).toHaveCount(0);
  });
});

test.describe('crit. 6: labels above full-width fields, in both languages', () => {
  for (const lang of LANGS) {
    test(`${lang}: label above field; same x and width for all fields; the width is the panel's inner width`, async ({ page }) => {
      await seedLanguage(page, lang);
      await make('Maat');
      // Two search terms, because "Minstens" only appears from two terms on.
      await page.goto(`/?met=feta${s}&met=tomaat${s}`);
      await openFilters(page);
      const fields = [withField(page, lang), withoutField(page, lang), minField(page, lang), prepField(page, lang), totalField(page, lang)];
      const boxes = [];
      for (const field of fields) {
        await expect(field).toBeVisible();
        const f = await box(field);
        const l = await box(await labelOf(page, field));
        expect(l.y + l.height, 'label ends above the field').toBeLessThanOrEqual(f.y + 0.5);
        boxes.push(f);
      }
      const inner = await filtersPanel(page).evaluate((el) => {
        const style = getComputedStyle(el);
        return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      });
      for (const b of boxes) {
        expect(Math.abs(b.x - boxes[0].x), 'same x').toBeLessThanOrEqual(1);
        expect(Math.abs(b.width - boxes[0].width), 'same width').toBeLessThanOrEqual(1);
        expect(Math.abs(b.width - inner), 'full panel width').toBeLessThanOrEqual(1);
      }
    });
  }

  test('the total time sits under the prep time with the same x', async ({ page }) => {
    await make('Onder');
    await page.goto('/');
    await openFilters(page);
    const prep = await box(prepField(page));
    const total = await box(totalField(page));
    expect(total.y).toBeGreaterThanOrEqual(prep.y + prep.height);
    expect(Math.abs(total.x - prep.x)).toBeLessThanOrEqual(1);
  });
});

test.describe('crit. 7: chips wrap, no horizontal scroll', () => {
  for (const lang of LANGS) {
    test(`${lang}: no horizontal scroll, every chip inside the panel, chips on more than one line`, async ({ page }) => {
      await seedLanguage(page, lang);
      await make('Chips');
      await page.goto('/');
      await openFilters(page);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(360);
      const panel = await box(filtersPanel(page));
      const chips = filtersPanel(page).locator('.choice');
      const count = await chips.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const c = await box(chips.nth(i));
        expect(c.x + c.width, `chip ${i} inside the panel`).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
      }
      const dish = groupOf(page, lang, 'tags.dish').locator('.choice');
      const rows = new Set<number>();
      for (let i = 0; i < (await dish.count()); i++) rows.add(Math.round((await box(dish.nth(i))).y));
      expect(rows.size, 'dish chips run on to a next line').toBeGreaterThan(1);
    });
  }
});

test.describe('crit. 8: the sort is always visible next to the button', () => {
  for (const lang of LANGS) {
    test(`${lang}: button, sort and direction on one row, above the first list item; five options in order`, async ({ page }) => {
      await seedLanguage(page, lang);
      const r = await make('Rij');
      await page.goto('/');
      await expect(item(page, r.title)).toBeVisible();
      const button = await box(filtersButton(page));
      const select = await box(sortSelect(page, lang));
      const direction = await box(directionButton(page, lang));
      const first = await box(page.locator('.recipe-list > li').first());
      const overlap = (a: typeof button, b: typeof button) => a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap(button, select), 'button and sort share a row').toBe(true);
      expect(overlap(select, direction), 'sort and direction share a row').toBe(true);
      for (const b of [button, select, direction]) expect(b.y + b.height).toBeLessThanOrEqual(first.y + 0.5);

      const options = await sortSelect(page, lang).locator('option').allTextContents();
      expect(options).toEqual(
        ['overview.sortCreated', 'overview.sortRating', 'overview.sortTitle', 'overview.sortTotal', 'overview.sortPrep'].map((k) => text(lang, k)),
      );
      await expect(sortSelect(page, lang).locator('option:checked')).toHaveText(text(lang, 'overview.sortCreated'));
    });
  }
});

test.describe('crit. 9: the direction button', () => {
  test('default "Aflopend" (newest first); a tap reverses and writes richting=op; Alfabetisch resets to "Oplopend"; back to Aanmaakdatum', async ({ page }) => {
    await make('Een');
    await make('Twee');
    await make('Drie');
    await page.goto('/');
    await expect(directionButton(page)).toHaveText(text('nl', 'overview.sortDesc'));
    await expect.poll(() => ownTitles(page)).toEqual([`Drie ${s}`, `Twee ${s}`, `Een ${s}`]);

    await directionButton(page).click();
    await expect(directionButton(page)).toHaveText(text('nl', 'overview.sortAsc'));
    await expect(page).toHaveURL(/richting=op/);
    await expect.poll(() => ownTitles(page)).toEqual([`Een ${s}`, `Twee ${s}`, `Drie ${s}`]);

    await sortSelect(page).selectOption({ label: text('nl', 'overview.sortTitle') });
    await expect(directionButton(page)).toHaveText(text('nl', 'overview.sortAsc'));
    await expect(page).not.toHaveURL(/richting=/);
    await expect(page).toHaveURL(/sorteer=titel/);

    await sortSelect(page).selectOption({ label: text('nl', 'overview.sortCreated') });
    await expect(directionButton(page)).toHaveText(text('nl', 'overview.sortDesc'));
    await expect(page).not.toHaveURL(/sorteer=/);
  });
});

test.describe('crit. 10: sort by stars', () => {
  async function seedRated() {
    // A: 4 reviews, average 4.5 (oldest). B: none. C: 3.0. D: 2 reviews, average 4.5 (youngest).
    const a = await make('A');
    const b = await make('B');
    const c = await make('C');
    const d = await make('D');
    const rows = [
      ...[4, 5, 4, 5].map((rating, i) => ({ recipe_id: a.id, author_id: raters[i].id, rating })),
      { recipe_id: c.id, author_id: raters[0].id, rating: 3 },
      { recipe_id: d.id, author_id: raters[1].id, rating: 4 },
      { recipe_id: d.id, author_id: raters[2].id, rating: 5 },
    ];
    const res = await adminClient().from('reviews').insert(rows);
    expect(res.error).toBeNull();
    return { a, b, c, d };
  }

  test('descending A, D, C, B; ascending C, A, D, B; no review always last', async ({ page }) => {
    const { a, b, c, d } = await seedRated();
    await page.goto('/');
    await sortSelect(page).selectOption({ label: text('nl', 'overview.sortRating') });
    await expect(directionButton(page)).toHaveText(text('nl', 'overview.sortDesc'));
    await expect.poll(() => ownTitles(page)).toEqual([a.title, d.title, c.title, b.title]);
    await directionButton(page).click();
    await expect.poll(() => ownTitles(page)).toEqual([c.title, a.title, d.title, b.title]);
  });
});

test.describe('crit. 11: alphabetical, ignoring case and accents', () => {
  for (const lang of LANGS) {
    test(`${lang}: Appel/appel (newest first), éclair, eend, Zalm; descending reverses all but the equal pair`, async ({ page }) => {
      await seedLanguage(page, lang);
      await make('Zalm');
      await make('appel');
      await make('éclair');
      await make('Appel');
      await make('eend');
      await page.goto('/?sorteer=titel');
      const asc = ['Appel', 'appel', 'éclair', 'eend', 'Zalm'].map((t) => `${t} ${s}`);
      await expect.poll(() => ownTitles(page)).toEqual(asc);
      await directionButton(page, lang).click();
      await expect(page).toHaveURL(/richting=af/);
      await expect.poll(() => ownTitles(page)).toEqual(['Zalm', 'eend', 'éclair', 'Appel', 'appel'].map((t) => `${t} ${s}`));
    });
  }
});

test.describe('crit. 12 and 14: sort by time; recipes without time last', () => {
  async function seedTimes() {
    const x = await make('X', { prep_minutes: 8, total_minutes: 30 });
    const y = await make('Y', { prep_minutes: 2, total_minutes: 10 });
    const z = await make('Z', { prep_minutes: 6, total_minutes: 60 });
    const none = await make('N');
    // An old sample row without times: lift the NOT VALID checks in one transaction and add them again (as recipe-servings does).
    await sql(`begin;
      alter table public.recipes drop constraint recipes_prep_required, drop constraint recipes_total_required;
      update public.recipes set prep_minutes = null, total_minutes = null where id = '${none.id}';
      alter table public.recipes
        add constraint recipes_prep_required check (prep_minutes is not null) not valid,
        add constraint recipes_total_required check (total_minutes is not null) not valid;
      commit;`);
    return { x, y, z, none };
  }

  test('total time and prep time, both directions: the recipe without times stays at the bottom', async ({ page }) => {
    const { x, y, z, none } = await seedTimes();
    const cases: Array<[string, string[]]> = [
      ['/?sorteer=totaal', [y.title, x.title, z.title, none.title]],
      ['/?sorteer=totaal&richting=af', [z.title, x.title, y.title, none.title]],
      ['/?sorteer=prep', [y.title, z.title, x.title, none.title]],
      ['/?sorteer=prep&richting=af', [x.title, z.title, y.title, none.title]],
    ];
    for (const [url, expected] of cases) {
      await page.goto(url);
      await expect.poll(() => ownTitles(page), url).toEqual(expected);
    }
  });

  test('/?sorteer=totaal&richting=af shows "Totale tijd" and "Aflopend" after a reload', async ({ page }) => {
    const { x, y, z, none } = await seedTimes();
    await page.goto('/?sorteer=totaal&richting=af');
    await page.reload();
    await expect(sortSelect(page).locator('option:checked')).toHaveText(text('nl', 'overview.sortTotal'));
    await expect(directionButton(page)).toHaveText(text('nl', 'overview.sortDesc'));
    await expect.poll(() => ownTitles(page)).toEqual([z.title, x.title, y.title, none.title]);
  });

  test('/?sorteer=beoordeling (existing links) shows "Aantal sterren" descending; an unknown value shows the default', async ({ page }) => {
    await make('Oud');
    await page.goto('/?sorteer=beoordeling');
    await expect(sortSelect(page).locator('option:checked')).toHaveText(text('nl', 'overview.sortRating'));
    await expect(directionButton(page)).toHaveText(text('nl', 'overview.sortDesc'));
    await page.goto('/?sorteer=onzin');
    await expect(sortSelect(page).locator('option:checked')).toHaveText(text('nl', 'overview.sortCreated'));
    await expect(directionButton(page)).toHaveText(text('nl', 'overview.sortDesc'));
  });
});

test.describe('crit. 15: matches first, then the chosen sort', () => {
  test('Alfabetisch: the recipe with two matches first, then the single matches A to Z; descending only flips the second key', async ({ page }) => {
    const zebra = await make('Zebra', { ingredients: [ingredient(`feta${s}`)] });
    const appel = await make('Appel', { ingredients: [ingredient(`feta${s}`)] });
    const mango = await make('Mango', { ingredients: [ingredient(`feta${s}`), ingredient(`tomaat${s}`)] });
    await page.goto(`/?met=feta${s}&met=tomaat${s}&min=1&sorteer=titel`);
    await expect.poll(() => ownTitles(page)).toEqual([mango.title, appel.title, zebra.title]);
    await page.goto(`/?met=feta${s}&met=tomaat${s}&min=1&sorteer=titel&richting=af`);
    await expect.poll(() => ownTitles(page)).toEqual([mango.title, zebra.title, appel.title]);
  });
});
