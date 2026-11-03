import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { nl, tagButton } from '../helpers/recipe-form';
import { signInViaStorage } from '../helpers/session';
import {
  adminClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  insertRecipe,
  insertVariant,
  uploadTestPhoto,
  validRecipe,
  type TestUser,
} from '../helpers/supabase-admin';

// T-015 / R-009: ingredient search on the overview. Local Supabase, viewport 360 x 640.
// Every test has its own letters-only suffix `s` in titles and ingredient names and looks only at its own titles.
let user: TestUser;
let rater1: TestUser;
let rater2: TestUser;
let s = '';

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('rsrch', { displayName: 'Sofie Zoek' });
  rater1 = await createTestUser('rsrchr1');
  rater2 = await createTestUser('rsrchr2');
});

test.afterAll(async () => {
  for (const u of [user, rater1, rater2]) if (u) await deleteTestUser(u);
});

test.beforeEach(async ({ page }) => {
  s = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  await signInViaStorage(page, user.session);
});

const withField = (page: Page) => page.getByLabel(nl['search.with'], { exact: true });
const withoutField = (page: Page) => page.getByLabel(nl['search.without'], { exact: true });
const minSelect = (page: Page) => page.getByLabel(nl['search.min'], { exact: true });
const submitButton = (page: Page) => page.getByRole('button', { name: nl['search.submit'], exact: true });
const item = (page: Page, title: string) => page.locator('.recipe-list > li').filter({ hasText: title });
const matchesText = (count: number, total: number) => nl['search.matches'].replace('{count}', String(count)).replace('{total}', String(total));

/** Fills the "Met" field and searches at once with the button. */
async function searchWith(page: Page, text: string) {
  await withField(page).fill(text);
  await submitButton(page).click();
}

/** Titles of this test in list order. */
async function ownTitles(page: Page): Promise<string[]> {
  const all = await page.locator('.recipe-list .recipe-title').allTextContents();
  return all.filter((x) => x.endsWith(` ${s}`));
}

async function make(label: string, names: string[], extra: Record<string, unknown> = {}) {
  const row = await insertRecipe(user.client, {
    title: `${label} ${s}`,
    ingredients: names.map((name) => ({ name, quantity: 1, unit: 'stuk' })),
    ...extra,
  });
  return { ...row, title: `${label} ${s}` };
}

const urlParams = (page: Page) => new URL(page.url()).searchParams;

async function expectNoOverflow(page: Page) {
  const wide = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > 360.5) out.push(`${el.tagName.toLowerCase()} right=${Math.round(r.right)}`);
    }
    return { scrollWidth: document.documentElement.scrollWidth, wide: out };
  });
  expect(wide.scrollWidth, 'scrollWidth').toBeLessThanOrEqual(360);
  expect(wide.wide, 'elements sticking out past 360 px').toEqual([]);
}

async function expectTapTarget(locator: Locator, what: string) {
  const box = await locator.boundingBox();
  expect(box, what).not.toBeNull();
  expect(box!.width, `${what} width`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${what} height`).toBeGreaterThanOrEqual(44);
}

test.describe('crit. 1: one term', () => {
  test('typing "feta" shows the two feta recipes after the pause and not the tomato recipe', async ({ page }) => {
    const a = await make('Alfa', [`fetakaas${s}`]);
    const b = await make('Bravo', [`Feta${s}`]);
    const c = await make('Charlie', [`tomaat${s}`]);
    await page.goto('/');
    await expect(item(page, c.title)).toBeVisible();
    await withField(page).fill('feta');
    await expect(item(page, a.title)).toBeVisible();
    await expect(item(page, b.title)).toBeVisible();
    await expect(item(page, c.title)).toHaveCount(0);
  });
});

test.describe('crit. 2: terms and "Minstens"', () => {
  test('the "Minstens" list appears from 2 terms, offers 1..n with n ("alle") selected', async ({ page }) => {
    await page.goto('/');
    await expect(withField(page)).toBeVisible();
    await searchWith(page, `a${s}`);
    await expect(minSelect(page)).toHaveCount(0);
    await searchWith(page, `a${s}, b${s}, c${s}`);
    await expect(minSelect(page)).toBeVisible();
    const options = await minSelect(page).locator('option').allTextContents();
    expect(options).toEqual(['1', '2', nl['search.minAll'].replace('{n}', '3')]);
    await expect(minSelect(page).locator('option:checked')).toHaveText(nl['search.minAll'].replace('{n}', '3'));
  });

  test('on "alle" a fifth term makes it 5; a choice of 3 stays 3', async ({ page }) => {
    await page.goto('/');
    await searchWith(page, `a${s}, b${s}, c${s}, d${s}`);
    await expect(minSelect(page).locator('option:checked')).toHaveText(nl['search.minAll'].replace('{n}', '4'));
    await searchWith(page, `a${s}, b${s}, c${s}, d${s}, e${s}`);
    await expect(minSelect(page).locator('option:checked')).toHaveText(nl['search.minAll'].replace('{n}', '5'));

    await minSelect(page).selectOption({ label: '3' });
    await expect(page).toHaveURL(/[?&]min=3/);
    await searchWith(page, `a${s}, b${s}, c${s}, d${s}, e${s}, f${s}`);
    await expect(minSelect(page).locator('option:checked')).toHaveText('3');
    await expect(minSelect(page).locator('option')).toHaveCount(6);
  });

  test('11 terms show "Maximaal 10 ingrediënten." linked to the field', async ({ page }) => {
    await page.goto('/');
    await withField(page).fill(Array.from({ length: 11 }, (_, i) => `t${String.fromCharCode(97 + i)}${s}`).join(', '));
    const message = page.getByText(nl['search.tooMany'], { exact: true });
    await expect(message).toBeVisible();
    const id = await withField(page).getAttribute('aria-describedby');
    expect(id, 'aria-describedby on the field').toBeTruthy();
    expect((await withField(page).getAttribute('aria-describedby'))!.split(' ')).toContain(await message.getAttribute('id'));
  });

  test('opening /?met=Feta&met=feta&min=2 directly shows results and no error', async ({ page }) => {
    const a = await make('Alfa', [`feta${s}`]);
    await page.goto('/?met=Feta&met=feta&min=2');
    await expect(item(page, a.title)).toBeVisible();
    await expect(page.getByText(nl['overview.error'], { exact: true })).toHaveCount(0);
  });
});

test.describe('crit. 3: {feta, tomaat, olijf, ui, look} with k = 3', () => {
  test('"Minstens 3" gives exactly two results', async ({ page }) => {
    // Suffix on every term: the real words "ui" and "look" also hit "fruit" and "knoflook".
    const t = ['feta', 'tomaat', 'olijf', 'ui', 'look'].map((x) => `${x}${s}`);
    const three = await make('Drie', [t[0], t[1], t[3]]);
    const two = await make('Twee', [t[0], t[1]]);
    const five = await make('Vijf', t);
    await page.goto('/');
    await searchWith(page, t.join(', '));
    await minSelect(page).selectOption({ label: '3' });
    await expect(item(page, five.title)).toBeVisible();
    await expect(item(page, three.title)).toBeVisible();
    await expect(item(page, two.title)).toHaveCount(0);
    expect(await ownTitles(page)).toHaveLength(2);
  });
});

test.describe('crit. 4: "Zonder"', () => {
  test('typing "ui" in "Zonder" removes the recipe with feta and ui', async ({ page }) => {
    const withOnion = await make('Met ui', [`feta${s}`, `ui${s}`]);
    const without = await make('Zonder', [`feta${s}`]);
    await page.goto('/');
    await searchWith(page, `feta${s}`);
    await expect(item(page, withOnion.title)).toBeVisible();
    await withoutField(page).fill(`ui${s}`);
    await expect(item(page, withOnion.title)).toHaveCount(0);
    await expect(item(page, without.title)).toBeVisible();
  });

  test('only "Zonder" terms: all recipes except the excluded one, without "k van n"', async ({ page }) => {
    const out = await make('Uit', [`feta${s}`, `ui${s}`]);
    const keepA = await make('Blijft A', [`feta${s}`]);
    const keepB = await make('Blijft B', [`tomaat${s}`]);
    await page.goto('/');
    await withoutField(page).fill(`ui${s}`);
    await expect(item(page, out.title)).toHaveCount(0);
    await expect(item(page, keepA.title)).toBeVisible();
    await expect(item(page, keepB.title)).toBeVisible();
    await expect(page.getByTestId('recipe-matches')).toHaveCount(0);
  });
});

test.describe('crit. 5: order and "k van n"', () => {
  test('every result shows "k van n" and the titles follow the database order (5, 3, 3, 2; youngest first on a tie)', async ({ page }) => {
    const t = ['feta', 'tomaat', 'olijf', 'ui', 'look'].map((x) => `${x}${s}`);
    const two = await make('Twee', [t[0], t[1]]);
    const threeOld = await make('Drie oud', [t[0], t[1], t[3]]);
    const five = await make('Vijf', t);
    const threeNew = await make('Drie nieuw', [t[1], t[2], t[4]]);
    await page.goto('/');
    await searchWith(page, t.join(', '));
    await minSelect(page).selectOption({ label: '1' });
    await expect(item(page, two.title)).toBeVisible();
    expect(await ownTitles(page)).toEqual([five.title, threeNew.title, threeOld.title, two.title]);
    await expect(item(page, five.title).getByTestId('recipe-matches')).toHaveText(matchesText(5, 5));
    await expect(item(page, threeNew.title).getByTestId('recipe-matches')).toHaveText(matchesText(3, 5));
    await expect(item(page, threeOld.title).getByTestId('recipe-matches')).toHaveText(matchesText(3, 5));
    await expect(item(page, two.title).getByTestId('recipe-matches')).toHaveText(matchesText(2, 5));
  });

  test('without search terms there is no "k van n" and the order is newest first', async ({ page }) => {
    const first = await make('Eerste', [`feta${s}`]);
    const second = await make('Tweede', [`feta${s}`]);
    await page.goto('/');
    await expect(item(page, second.title)).toBeVisible();
    await expect(page.getByTestId('recipe-matches')).toHaveCount(0);
    expect(await ownTitles(page)).toEqual([second.title, first.title]);
  });

  test('with "Sorteren: Beoordeling" the number of matches stays the first key, the rating decides on a tie', async ({ page }) => {
    const t = [`feta${s}`, `tomaat${s}`];
    // oldBest: older, 5 stars. newWorst: newer, 2 stars. Same match_count (1). both: 2 matches, no review.
    const oldBest = await make('Oud goed', [t[0]]);
    const newWorst = await make('Nieuw slecht', [t[0]]);
    const both = await make('Beide', t);
    const unrated = await make('Zonder review', [t[0]]);
    const admin = adminClient();
    const ins = await admin.from('reviews').insert([
      { recipe_id: oldBest.id, author_id: rater1.id, rating: 5 },
      { recipe_id: newWorst.id, author_id: rater2.id, rating: 2 },
    ]);
    expect(ins.error).toBeNull();

    await page.goto('/');
    await searchWith(page, t.join(', '));
    await minSelect(page).selectOption({ label: '1' });
    await expect(item(page, both.title)).toBeVisible();
    // Newest first on equal matches: unrated, newWorst, oldBest.
    expect(await ownTitles(page)).toEqual([both.title, unrated.title, newWorst.title, oldBest.title]);

    await page.getByLabel(nl['overview.sort'], { exact: true }).selectOption({ label: nl['overview.sortRating'] });
    await expect(page).toHaveURL(/sorteer=beoordeling/);
    await expect.poll(() => ownTitles(page)).toEqual([both.title, oldBest.title, newWorst.title, unrated.title]);
  });
});

test.describe('crit. 6: nothing found, and clearing', () => {
  test('a term that exists nowhere gives "Niets gevonden."', async ({ page }) => {
    await page.goto('/');
    await searchWith(page, `nergens${s}`);
    await expect(page.getByText(nl['overview.noMatch'], { exact: true })).toBeVisible();
  });

  test('clearing the field shows all recipes again, newest first, and the URL loses met, zonder and min', async ({ page }) => {
    const first = await make('Eerste', [`feta${s}`, `tomaat${s}`]);
    const second = await make('Tweede', [`kaas${s}`]);
    await page.goto('/');
    await searchWith(page, `feta${s}, tomaat${s}`);
    await minSelect(page).selectOption({ label: '1' });
    await withoutField(page).fill(`zout${s}`);
    await submitButton(page).click();
    await expect(item(page, second.title)).toHaveCount(0);

    await withField(page).fill('');
    await withoutField(page).fill('');
    await submitButton(page).click();
    await expect(item(page, second.title)).toBeVisible();
    expect(await ownTitles(page)).toEqual([second.title, first.title]);
    await expect(page.getByTestId('recipe-matches')).toHaveCount(0);
    const params = urlParams(page);
    expect(params.has('met')).toBe(false);
    expect(params.has('zonder')).toBe(false);
    expect(params.has('min')).toBe(false);
  });
});

test.describe('crit. 7: pause, button, Enter, late answers', () => {
  /** Installs a clock and stops it after the page has loaded, so only runFor() moves time. */
  async function frozenOverview(page: Page) {
    const now = Date.now();
    await page.clock.install({ time: now });
    await page.goto('/');
    await expect(withField(page)).toBeVisible();
    await page.clock.pauseAt(now + 5_000);
  }

  test('the URL has no met= after 299 ms and has it after 400 ms in total', async ({ page }) => {
    await frozenOverview(page);
    await withField(page).fill(`feta${s}`);
    await page.clock.runFor(299);
    expect(urlParams(page).has('met'), 'no met= after 299 ms').toBe(false);
    await page.clock.runFor(101);
    await expect(page).toHaveURL(/[?&]met=/);
  });

  test('the "Zoeken" button searches at once, without the clock moving', async ({ page }) => {
    await frozenOverview(page);
    await withField(page).fill(`feta${s}`);
    await submitButton(page).click();
    await expect(page).toHaveURL(/[?&]met=/);
  });

  test('Enter searches at once, without the clock moving', async ({ page }) => {
    await frozenOverview(page);
    await withField(page).fill(`feta${s}`);
    await withField(page).press('Enter');
    await expect(page).toHaveURL(/[?&]met=/);
  });

  test.describe('late answers', () => {
    // Block the service worker: otherwise it can answer the request itself and page.route
    // never sees it, so nothing would be delayed and the test proves nothing.
    test.use({ serviceWorkers: 'block' });

  test('a late answer for an earlier search does not overwrite the last one', async ({ page }) => {
    const feta = await make('Feta recept', [`feta${s}`]);
    const tomato = await make('Tomaat recept', [`tomaat${s}`]);
    const onion = await make('Ui recept', [`ui${s}`]);
    let first = true;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let delivered: Promise<void> = Promise.resolve();
    await page.route(/\/rest\/v1\/rpc\/search_recipes/, async (route: Route) => {
      if (first && route.request().method() !== 'OPTIONS') {
        first = false;
        const response = await route.fetch();
        delivered = gate.then(() => route.fulfill({ response }));
        return;
      }
      await route.continue();
    });
    await page.goto('/');
    await expect(withField(page)).toBeVisible();
    await withField(page).fill(`feta${s}`);
    await withField(page).press('Enter');
    await withField(page).fill(`tomaat${s}`);
    await withField(page).press('Enter');
    await withField(page).fill(`ui${s}`);
    await withField(page).press('Enter');
    await expect(item(page, onion.title)).toBeVisible();
    await expect(item(page, tomato.title)).toHaveCount(0);

    // Proves the first answer really was held back.
    expect(first).toBe(false);
    release();
    await delivered;
    // Give the page time to (wrongly) apply the late answer.
    await page.waitForTimeout(500);
    await expect(item(page, onion.title)).toBeVisible();
    await expect(item(page, feta.title)).toHaveCount(0);
  });
  });
});

test.describe('crit. 8: combines with filters, sorting and the URL', () => {
  async function seedFilters() {
    const base = { prep_minutes: 10, total_minutes: 20, dish_tags: ['soep'], trait_tags: ['snel'], equipment: ['Pan'] };
    const fits = await make('Past overal', [`feta${s}`], base);
    const slow = await make('Te traag', [`feta${s}`], { ...base, prep_minutes: 40, total_minutes: 60 });
    const noPan = await make('Zonder pan', [`feta${s}`], { ...base, equipment: [] });
    const noSoup = await make('Zonder soep', [`feta${s}`], { ...base, dish_tags: ['tapas'] });
    const noTrait = await make('Zonder kenmerk', [`feta${s}`], { ...base, trait_tags: [] });
    const noFeta = await make('Zonder feta', [`tomaat${s}`], base);
    return { fits, slow, noPan, noSoup, noTrait, noFeta };
  }
  const prepFilter = (page: Page) => page.getByLabel(nl['filter.maxPrep'], { exact: true });
  const panButton = (page: Page) => page.getByRole('group', { name: nl['filter.equipment'], exact: true }).getByRole('button', { name: 'Pan', exact: true });

  test('search + time, search + equipment, search + tags each give the right recipes', async ({ page }) => {
    const r = await seedFilters();
    await page.goto('/');
    await searchWith(page, `feta${s}`);
    await expect(item(page, r.slow.title)).toBeVisible();
    await expect(item(page, r.noFeta.title)).toHaveCount(0);

    // search + time
    await prepFilter(page).selectOption({ label: '15 min' });
    await expect(item(page, r.slow.title)).toHaveCount(0);
    await expect(item(page, r.fits.title)).toBeVisible();
    await expect(item(page, r.noPan.title)).toBeVisible();
    await prepFilter(page).selectOption({ label: nl['filter.all'] });

    // search + equipment
    await panButton(page).click();
    await expect(item(page, r.noPan.title)).toHaveCount(0);
    await expect(item(page, r.slow.title)).toBeVisible();
    await panButton(page).click();

    // search + tags (dish)
    await tagButton(page, 'soep').click();
    await expect(item(page, r.noSoup.title)).toHaveCount(0);
    await expect(item(page, r.noPan.title)).toBeVisible();
    await tagButton(page, 'soep').click();

    // search + tags (trait)
    await tagButton(page, 'snel', 'trait').click();
    await expect(item(page, r.noTrait.title)).toHaveCount(0);
    await expect(item(page, r.noSoup.title)).toBeVisible();
  });

  test('all filters together leave only the recipe that fits everything; the URL holds them and a reload keeps them', async ({ page }) => {
    const r = await seedFilters();
    await page.goto('/');
    await searchWith(page, `feta${s}`);
    await prepFilter(page).selectOption({ label: '15 min' });
    await panButton(page).click();
    await tagButton(page, 'soep').click();
    await tagButton(page, 'snel', 'trait').click();
    await page.getByLabel(nl['overview.sort'], { exact: true }).selectOption({ label: nl['overview.sortRating'] });
    await expect.poll(() => ownTitles(page)).toEqual([r.fits.title]);

    const params = urlParams(page);
    expect(params.getAll('met')).toEqual([`feta${s}`]);
    expect(params.get('prep')).toBe('15');
    expect(params.getAll('gerief')).toEqual(['Pan']);
    expect(params.getAll('soort')).toEqual(['soep']);
    expect(params.getAll('kenmerk')).toEqual(['snel']);
    expect(params.get('sorteer')).toBe('beoordeling');

    await page.reload();
    await expect(withField(page)).toHaveValue(`feta${s}`);
    await expect(prepFilter(page)).toHaveValue('15');
    await expect(panButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel(nl['overview.sort'], { exact: true })).toHaveValue('rating');
    await expect.poll(() => ownTitles(page)).toEqual([r.fits.title]);
  });

  test('changing a filter keeps the search terms, and changing the search keeps the filters', async ({ page }) => {
    await seedFilters();
    await page.goto('/');
    await searchWith(page, `feta${s}`);
    await prepFilter(page).selectOption({ label: '15 min' });
    await expect(page).toHaveURL(/prep=15/);
    expect(urlParams(page).getAll('met')).toEqual([`feta${s}`]);
    await expect(withField(page)).toHaveValue(`feta${s}`);

    await searchWith(page, `feta${s}, tomaat${s}`);
    await expect(page).toHaveURL(/met=tomaat/);
    expect(urlParams(page).get('prep')).toBe('15');
    await expect(prepFilter(page)).toHaveValue('15');
  });

  test('results show the main photo, the label "Variant" and the rating like the plain overview', async ({ page }) => {
    // Recipe with a stored main photo.
    const photoId = randomUUID();
    const up = await uploadTestPhoto(user.client, photoId);
    expect(up.error).toBeNull();
    const withPhoto = await user.client
      .from('recipes')
      .insert(validRecipe({ id: photoId, title: `Met foto ${s}`, ingredients: [{ name: `feta${s}`, quantity: 1 }], photos: [{ path: up.path, main: true }] }));
    expect(withPhoto.error).toBeNull();
    const source = await make('Bron', [`feta${s}`]);
    const variant = await insertVariant(user.client, source.id, {
      title: `Een variant ${s}`,
      ingredients: [{ name: `feta${s}`, quantity: 1 }],
    });
    const rated = await make('Beoordeeld', [`feta${s}`]);
    const ins = await adminClient().from('reviews').insert({ recipe_id: rated.id, author_id: rater1.id, rating: 4 });
    expect(ins.error).toBeNull();

    await page.goto('/');
    await searchWith(page, `feta${s}`);
    await expect(item(page, `Met foto ${s}`).getByTestId('recipe-main-photo')).toHaveCount(1);
    await expect(item(page, variant.title).getByTestId('variant-label')).toHaveText(nl['variant.label']);
    await expect(item(page, rated.title).getByTestId('recipe-rating')).toBeVisible();
  });
});

test.describe('crit. 9: empty terms', () => {
  test('only spaces: all recipes, no "Niets gevonden." and no "k van n"', async ({ page }) => {
    const a = await make('Alfa', [`feta${s}`]);
    await page.goto('/');
    await expect(item(page, a.title)).toBeVisible();
    await withField(page).fill('   ');
    await submitButton(page).click();
    await expect(item(page, a.title)).toBeVisible();
    await expect(page.getByText(nl['overview.noMatch'], { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('recipe-matches')).toHaveCount(0);
    expect(urlParams(page).has('met')).toBe(false);
  });
});

test.describe('layout, labels and connection', () => {
  test('both fields and the button have a visible label; button and list are at least 44 x 44 px; no horizontal scroll at 360 px', async ({ page }) => {
    await make('Alfa', [`feta${s}`, `tomaat${s}`, `olijf${s}`]);
    const terms = Array.from({ length: 10 }, (_, i) => `ingrediëntmetlangenaam${String.fromCharCode(97 + i)}${s}`);
    await page.goto('/');
    await expect(page.getByRole('search')).toBeVisible();
    await expect(page.getByText(nl['search.with'], { exact: true }).first()).toBeVisible();
    await expect(page.getByText(nl['search.without'], { exact: true }).first()).toBeVisible();
    await expectTapTarget(submitButton(page), 'Zoeken');

    await searchWith(page, terms.join(', '));
    await expect(minSelect(page)).toBeVisible();
    await expectTapTarget(minSelect(page), 'Minstens');
    await expect(page.getByText(nl['search.min'], { exact: true }).first()).toBeVisible();
    await expectNoOverflow(page);

    await page.goto(`/?${new URLSearchParams([['met', `feta${s}`], ['met', `tomaat${s}`], ['min', '1']])}`);
    await expect(page.getByTestId('recipe-matches').first()).toBeVisible();
    await expectNoOverflow(page);
  });

  test.describe('lost connection', () => {
    // Block the service worker: otherwise it can serve the request itself and page.route
    // (registered after goto) never sees it, which made this test flaky.
    test.use({ serviceWorkers: 'block' });

    test('a lost connection while searching shows the banner and keeps the typed terms', async ({ page }) => {
      await page.route(/\/rest\/v1\/rpc\/search_recipes/, (route) => route.abort());
      await page.goto('/');
      await expect(withField(page)).toBeVisible();
      await withField(page).fill(`feta${s}, tomaat${s}`);
      await withoutField(page).fill(`ui${s}`);
      await submitButton(page).click();
      await expect(page.getByRole('alert').filter({ hasText: nl['connection.error'] })).toBeVisible();
      await expect(page.getByRole('button', { name: nl['connection.retry'], exact: true })).toBeVisible();
      await expect(withField(page)).toHaveValue(`feta${s}, tomaat${s}`);
      await expect(withoutField(page)).toHaveValue(`ui${s}`);
    });
  });

  test('URL from outside: after a search, a link to "/" empties the fields; going back restores them', async ({ page }) => {
    const a = await make('Alfa', [`feta${s}`]);
    await page.goto('/');
    await searchWith(page, `feta${s}`);
    await expect(item(page, a.title)).toBeVisible();
    await expect(withField(page)).toHaveValue(`feta${s}`);

    await page.getByRole('link', { name: nl['nav.recipes'], exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(withField(page)).toHaveValue('');
    await expect(withoutField(page)).toHaveValue('');

    await page.goBack();
    await expect(page).toHaveURL(/[?&]met=/);
    await expect(withField(page)).toHaveValue(`feta${s}`);
  });

  test('typing is not interrupted: the field keeps what is typed while the URL follows', async ({ page }) => {
    await page.goto('/');
    await expect(withField(page)).toBeVisible();
    // Type up to a trailing ", ", wait until the debounce has fired (met= in URL) while the
    // field still ends in ", ", then keep typing. A naive URL->field sync would rewrite the
    // field to the normalised terms and swallow the separator.
    await withField(page).pressSequentially(`feta${s}, `);
    await expect(page).toHaveURL(/[?&]met=/);
    await withField(page).pressSequentially('tom');
    await expect(withField(page)).toHaveValue(`feta${s}, tom`);
  });

});
