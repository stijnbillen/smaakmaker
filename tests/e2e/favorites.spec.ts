import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { autoOpenFilters } from '../helpers/overview';
import { nl } from '../helpers/recipe-form';
import { signInViaStorage } from '../helpers/session';
import {
  adminClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  insertRecipe,
  type TestUser,
} from '../helpers/supabase-admin';

// T-017 / R-014: favourites on overview, detail page and /favorieten. Local Supabase, viewport 360 x 640.
// Each test has its own letters-only suffix `s` in titles and ingredient names.
let a: TestUser;
let b: TestUser;
let fresh: TestUser;
let s = '';

test.beforeAll(async () => {
  await assertSupabaseUp();
  a = await createTestUser('favA', { displayName: 'Fia Fav' });
  b = await createTestUser('favB', { displayName: 'Bo Fav' });
  fresh = await createTestUser('favN', { displayName: 'Nina Nieuw' });
});

test.afterAll(async () => {
  for (const u of [a, b, fresh]) if (u) await deleteTestUser(u);
});

test.beforeEach(async ({ page }) => {
  autoOpenFilters(page); // T-029: filters sit behind the "Filters" button
  s = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  await signInViaStorage(page, a.session);
});

const FAVORITES = /\/rest\/v1\/favorites/;
const addName = nl['favorites.add'];
const removeName = nl['favorites.remove'];
const item = (page: Page, title: string) => page.locator('.recipe-list > li').filter({ hasText: title });
const heart = (scope: Page | Locator) => scope.getByRole('button', { name: new RegExp(`^(${addName}|${removeName})$`) });

async function make(label: string, extra: Record<string, unknown> = {}, owner: TestUser = a) {
  const title = `${label} ${s}`;
  const row = await insertRecipe(owner.client, { title, ...extra });
  return { ...row, title };
}

async function favorite(user: TestUser, recipeId: string) {
  const res = await adminClient().from('favorites').insert({ user_id: user.id, recipe_id: recipeId });
  if (res.error) throw res.error;
}

async function expectTapTarget(locator: Locator, what: string) {
  const box = await locator.boundingBox();
  expect(box, what).not.toBeNull();
  expect(box!.width, `${what} width`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${what} height`).toBeGreaterThanOrEqual(44);
}

/** Holds back every favourites request until `release()`; returns the release function. */
async function delayFavorites(page: Page): Promise<() => void> {
  const held: Route[] = [];
  let released = false;
  await page.route(FAVORITES, async (route) => {
    if (route.request().method() === 'GET' || released) return route.continue();
    held.push(route);
  });
  return () => {
    released = true;
    for (const r of held) void r.continue();
  };
}

test.describe('crit. 1: heart on overview and detail page', () => {
  test('overview: button with aria-pressed, name and >= 44 x 44; flips before the database answers; survives reload', async ({ page }) => {
    const r = await make('Hart', {});
    await page.goto('/');
    const btn = heart(item(page, r.title));
    await expect(btn).toHaveCount(1);
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await expect(btn).toHaveAccessibleName(addName);
    await expectTapTarget(btn, 'heart on card');

    const release = await delayFavorites(page);
    const saved = page.waitForResponse((res) => FAVORITES.test(res.url()) && res.request().method() === 'POST');
    await btn.click();
    // optimistic: pressed at once, while the favorites call is still held
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await expect(btn).toHaveAccessibleName(removeName);
    release();
    // reload only after the insert answered, or navigation may abort it
    expect((await saved).ok()).toBe(true);

    await page.reload();
    await expect(heart(item(page, r.title))).toHaveAttribute('aria-pressed', 'true');
  });

  test('detail page: same button, flips before the answer, survives reload', async ({ page }) => {
    const r = await make('Detailhart');
    await page.goto('/recept/' + r.id);
    const btn = heart(page);
    await expect(btn).toHaveCount(1);
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await expectTapTarget(btn, 'heart on detail');
    const release = await delayFavorites(page);
    const saved = page.waitForResponse((res) => FAVORITES.test(res.url()) && res.request().method() === 'POST');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    release();
    expect((await saved).ok()).toBe(true);
    await page.reload();
    await expect(heart(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('the detail page also has a heart on your own recipe (author)', async ({ page }) => {
    const r = await make('Eigen');
    await page.goto('/recept/' + r.id);
    await expect(heart(page)).toHaveCount(1);
  });

  test('a refused call (500) turns the heart back and shows the error message', async ({ page }) => {
    const r = await make('Geweigerd');
    await page.route(FAVORITES, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"message":"boom"}' })
        : route.continue(),
    );
    await page.goto('/');
    const btn = heart(item(page, r.title));
    await btn.click();
    await expect(page.getByText(nl['favorites.error'])).toBeVisible();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  test('a network error shows the connection banner with "Opnieuw proberen"', async ({ page }) => {
    const r = await make('Netwerk');
    await page.route(FAVORITES, (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
    await page.goto('/');
    await heart(item(page, r.title)).click();
    await expect(page.getByText(nl['connection.error'])).toBeVisible();
    await expect(page.getByRole('button', { name: nl['connection.retry'] })).toBeVisible();
  });

  test('state comes from one source: mark on detail, go back, heart on overview is filled', async ({ page }) => {
    const r = await make('Bron');
    await page.goto('/');
    await expect(item(page, r.title)).toBeVisible();
    await item(page, r.title).getByRole('link').first().click();
    await expect(page).toHaveURL(new RegExp('/recept/' + r.id));
    // wait until the detail page is the only thing rendered (one heart, not the overview's)
    await expect(heart(page)).toHaveCount(1);
    await expect(heart(page)).toHaveAttribute('aria-pressed', 'false');
    // let the insert finish before leaving, so the overview reloads the stored state
    const saved = page.waitForResponse((res) => FAVORITES.test(res.url()) && res.request().method() === 'POST');
    await heart(page).click();
    await expect(heart(page)).toHaveAttribute('aria-pressed', 'true');
    expect((await saved).ok()).toBe(true);
    await page.goBack();
    await expect(heart(item(page, r.title))).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('crit. 2: favourites are private', () => {
  test('A and B each mark another recipe: /favorieten shows only your own', async ({ page, browser }) => {
    const ra = await make('Van A', {}, a);
    const rb = await make('Van B', {}, a);
    await favorite(a, ra.id);
    await favorite(b, rb.id);

    await page.goto('/favorieten');
    await expect(item(page, ra.title)).toBeVisible();
    await expect(item(page, rb.title)).toHaveCount(0);

    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
    const pageB = await ctx.newPage();
    await signInViaStorage(pageB, b.session);
    await pageB.goto('/favorieten');
    await expect(item(pageB, rb.title)).toBeVisible();
    await expect(item(pageB, ra.title)).toHaveCount(0);
    await ctx.close();
  });
});

test.describe('crit. 3: empty states', () => {
  test('a new user sees "Nog geen favorieten."', async ({ page }) => {
    await signInViaStorage(page, fresh.session);
    await page.goto('/favorieten');
    await expect(page.getByText(nl['favorites.empty'], { exact: true })).toBeVisible();
  });

  test('an active filter without results shows "Niets gevonden."', async ({ page }) => {
    const r = await make('Soep fav', { dish_tags: ['soep'] });
    await favorite(a, r.id);
    await page.goto('/favorieten?soort=dessert');
    await expect(page.getByText(nl['overview.noMatch'], { exact: true })).toBeVisible();
    await expect(page.getByText(nl['favorites.empty'], { exact: true })).toHaveCount(0);
  });
});

test.describe('crit. 4: search and filters inside favourites', () => {
  /**
   * Three recipes: `hit` (favourite, matches), `miss` (favourite, does not match),
   * `outside` (not a favourite, matches). Only `hit` may show.
   */
  async function expectOnlyHit(page: Page, url: string, hit: { title: string }, miss: { title: string }, outside: { title: string }) {
    await page.goto(url);
    await expect(item(page, hit.title)).toBeVisible();
    await expect(item(page, miss.title)).toHaveCount(0);
    await expect(item(page, outside.title)).toHaveCount(0);
  }

  test('time: ?prep=30', async ({ page }) => {
    const hit = await make('Snel', { prep_minutes: 10, total_minutes: 20 });
    const miss = await make('Traag', { prep_minutes: 90, total_minutes: 120 });
    const outside = await make('Snel zonder hart', { prep_minutes: 10, total_minutes: 20 });
    await favorite(a, hit.id);
    await favorite(a, miss.id);
    await expectOnlyHit(page, '/favorieten?prep=30', hit, miss, outside);
  });

  test('equipment (gerief)', async ({ page }) => {
    const oven = `Oven${s}`;
    const hit = await make('Met oven', { equipment: [oven] });
    const miss = await make('Zonder oven', { equipment: [] });
    const outside = await make('Oven zonder hart', { equipment: [oven] });
    await favorite(a, hit.id);
    await favorite(a, miss.id);
    await expectOnlyHit(page, '/favorieten?gerief=' + encodeURIComponent(oven), hit, miss, outside);
  });

  test('dish type (?soort=)', async ({ page }) => {
    const hit = await make('Soep', { dish_tags: ['soep'] });
    const miss = await make('Dessert', { dish_tags: ['dessert'] });
    const outside = await make('Soep zonder hart', { dish_tags: ['soep'] });
    await favorite(a, hit.id);
    await favorite(a, miss.id);
    await expectOnlyHit(page, '/favorieten?soort=soep', hit, miss, outside);
  });

  test('trait (?kenmerk=)', async ({ page }) => {
    const hit = await make('Veggie', { trait_tags: ['vegetarisch'] });
    const miss = await make('Vlees', { trait_tags: [] });
    const outside = await make('Veggie zonder hart', { trait_tags: ['vegetarisch'] });
    await favorite(a, hit.id);
    await favorite(a, miss.id);
    await expectOnlyHit(page, '/favorieten?kenmerk=vegetarisch', hit, miss, outside);
  });

  const ing = (name: string) => [{ name: name + s, quantity: 1, unit: 'stuk' }];

  test('ingredients: with', async ({ page }) => {
    const hit = await make('Feta', { ingredients: ing('feta') });
    const miss = await make('Tomaat', { ingredients: ing('tomaat') });
    const outside = await make('Feta zonder hart', { ingredients: ing('feta') });
    await favorite(a, hit.id);
    await favorite(a, miss.id);
    await expectOnlyHit(page, `/favorieten?met=feta${s}`, hit, miss, outside);
  });

  test('ingredients: without', async ({ page }) => {
    const hit = await make('Zonder noten', { ingredients: [...ing('feta'), ...ing('basilicum')] });
    const miss = await make('Met noten', { ingredients: [...ing('feta'), ...ing('noot')] });
    const outside = await make('Zonder noten en hart', { ingredients: [...ing('feta'), ...ing('basilicum')] });
    await favorite(a, hit.id);
    await favorite(a, miss.id);
    await expectOnlyHit(page, `/favorieten?met=feta${s}&zonder=noot${s}`, hit, miss, outside);
  });

  test('ingredients: k of n (min=2 of 3)', async ({ page }) => {
    const hit = await make('Twee van drie', { ingredients: [...ing('feta'), ...ing('olijf')] });
    const miss = await make('Een van drie', { ingredients: ing('feta') });
    const outside = await make('Twee van drie zonder hart', { ingredients: [...ing('feta'), ...ing('olijf')] });
    await favorite(a, hit.id);
    await favorite(a, miss.id);
    await expectOnlyHit(page, `/favorieten?met=feta${s}&met=olijf${s}&met=tomaat${s}&min=2`, hit, miss, outside);
  });

  test('sorting by rating works inside favourites', async ({ page }) => {
    const low = await make('Laag', {});
    const high = await make('Hoog', {});
    await favorite(a, low.id);
    await favorite(a, high.id);
    const res = await adminClient().from('reviews').insert([
      { recipe_id: low.id, author_id: b.id, rating: 1 },
      { recipe_id: high.id, author_id: b.id, rating: 5 },
    ]);
    if (res.error) throw res.error;
    await page.goto('/favorieten?sorteer=beoordeling');
    // wait for the list to load before reading the order
    await expect(item(page, high.title)).toBeVisible();
    await expect(item(page, low.title)).toBeVisible();
    const titles = (await page.locator('.recipe-list .recipe-title').allTextContents()).filter((t) => t.endsWith(` ${s}`));
    expect(titles).toEqual([high.title, low.title]);
  });
});

test.describe('crit. 5: deleted recipe leaves the favourites list', () => {
  test('after the author deletes X it is gone from /favorieten', async ({ page }) => {
    const x = await make('Weg');
    await favorite(a, x.id);
    await page.goto('/favorieten');
    await expect(item(page, x.title)).toBeVisible();
    const del = await a.client.from('recipes').delete().eq('id', x.id);
    expect(del.error).toBeNull();
    await page.reload();
    await expect(item(page, x.title)).toHaveCount(0);
  });
});

test.describe('crit. 6: fast double tap', () => {
  test('two quick taps give no error and no duplicate row; ends not-favourite', async ({ page }) => {
    const x = await make('Dubbel');
    await page.goto('/');
    const btn = heart(item(page, x.title));
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    // the queue runs add then remove; the remove answering means the queue has settled
    const removed = page.waitForResponse((res) => FAVORITES.test(res.url()) && res.request().method() === 'DELETE');
    await btn.dblclick();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect((await removed).ok()).toBe(true);
    await expect(page.getByText(nl['favorites.error'])).toHaveCount(0);
    // the database agrees after reload
    await expect
      .poll(async () => {
        const rows = await adminClient().from('favorites').select('recipe_id').eq('user_id', a.id).eq('recipe_id', x.id);
        return rows.data?.length;
      })
      .toBe(0);
    await page.reload();
    await expect(heart(item(page, x.title))).toHaveAttribute('aria-pressed', 'false');
  });

  test('un-marking on /favorieten keeps the card with an empty heart until reload', async ({ page }) => {
    const x = await make('Ontmarkeer');
    await favorite(a, x.id);
    await page.goto('/favorieten');
    const btn = heart(item(page, x.title));
    const removed = page.waitForResponse((res) => FAVORITES.test(res.url()) && res.request().method() === 'DELETE');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await expect(item(page, x.title)).toHaveCount(1);
    expect((await removed).ok()).toBe(true);
    await page.reload();
    await expect(item(page, x.title)).toHaveCount(0);
  });
});
