import { expect, test, type Page } from '@playwright/test';
import nlJson from '../../src/i18n/nl.json' with { type: 'json' };
import { signInViaStorage, supabaseRoutePattern } from '../helpers/session';
import {
  adminClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  insertRecipe,
  makeAdmin,
  type TestUser,
} from '../helpers/supabase-admin';

// T-016 / R-012: reviews on detail page and overview. Local Supabase, viewport 360 x 640.
const nl = nlJson as Record<string, string>;
let author: TestUser;
let u1: TestUser;
let u2: TestUser;
let admin: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  author = await createTestUser('rvw-auth', { displayName: 'Anna Auteur' });
  u1 = await createTestUser('rvw-one', { displayName: 'Een Eerste' });
  u2 = await createTestUser('rvw-two', { displayName: 'Twee Tweede' });
  admin = await createTestUser('rvw-adm', { displayName: 'Bea Beheer' });
  await makeAdmin(admin.id);
});

test.afterAll(async () => {
  for (const u of [author, u1, u2, admin]) if (u) await deleteTestUser(u);
});

const unique = (label: string) => label + ' ' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

async function recipeWith(
  title: string,
  reviews: Array<{ user: TestUser; rating: number; body?: string; createdAt?: string }> = [],
): Promise<string> {
  const row = await insertRecipe(author.client, { title });
  if (reviews.length > 0) {
    const res = await adminClient()
      .from('reviews')
      .insert(
        reviews.map((r) => ({
          recipe_id: row.id,
          author_id: r.user.id,
          rating: r.rating,
          body: r.body ?? null,
          ...(r.createdAt ? { created_at: r.createdAt } : {}),
        })),
      );
    if (res.error) throw res.error;
  }
  return row.id;
}

const star = (page: Page, n: number) =>
  page.getByRole('radio', { name: n === 1 ? nl['reviews.star'].replace('{n}', '1') : nl['reviews.stars'].replace('{n}', String(n)), exact: true });
const bodyField = (page: Page) => page.getByLabel(nl['reviews.body'], { exact: true });
const saveBtn = (page: Page) => page.getByRole('button', { name: nl['reviews.save'], exact: true });
const summary = (page: Page) => page.getByTestId('rating-summary').first();
const isReviewRequest = (r: { url(): string; method(): string }) => r.url().includes('/rest/v1/reviews') && r.method() !== 'GET';

test.describe('crit. 1 and 2: form validation', () => {
  test.beforeEach(async ({ page }) => signInViaStorage(page, u1.session));

  test('saving without a star shows "Kies een score." (aria-describedby) and sends nothing', async ({ page }) => {
    const id = await recipeWith(unique('Zonder ster'));
    const writes: string[] = [];
    page.on('request', (r) => {
      if (isReviewRequest(r)) writes.push(r.url());
    });
    await page.goto('/recept/' + id);
    await saveBtn(page).click();
    const group = page.getByRole('group', { name: nl['reviews.rating'], exact: true });
    await expect(group).toContainText('Kies een score.');
    const describedBy = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('[aria-describedby]')).find((e) =>
        (e.getAttribute('aria-describedby') ?? '')
          .split(/\s+/)
          .some((i) => document.getElementById(i)?.textContent?.includes('Kies een score.')),
      );
      return el !== undefined;
    });
    expect(describedBy).toBe(true);
    expect(writes).toEqual([]);
  });

  test('501 characters show "Hoogstens 500 tekens.", no maxlength, counter {n}/500, nothing sent', async ({ page }) => {
    const id = await recipeWith(unique('Te lang'));
    const writes: string[] = [];
    page.on('request', (r) => {
      if (isReviewRequest(r)) writes.push(r.url());
    });
    await page.goto('/recept/' + id);
    await star(page, 4).check();
    await bodyField(page).fill('x'.repeat(501));
    await expect(bodyField(page)).not.toHaveAttribute('maxlength', /.*/);
    await expect(page.getByText('501/500')).toBeVisible();
    await saveBtn(page).click();
    await expect(page.getByText('Hoogstens 500 tekens.')).toBeVisible();
    expect(writes).toEqual([]);
  });

  test('stars are a fieldset with legend "Score", radios of at least 44 x 44 px, arrow keys work', async ({ page }) => {
    const id = await recipeWith(unique('Sterren'));
    await page.goto('/recept/' + id);
    const group = page.getByRole('group', { name: nl['reviews.rating'], exact: true });
    await expect(group).toBeVisible();
    expect(await group.evaluate((el) => el.tagName.toLowerCase())).toBe('fieldset');
    for (let n = 1; n <= 5; n++) {
      const radio = star(page, n);
      await expect(radio).toHaveCount(1);
      const box = await radio.evaluate((el) => {
        const target = el.closest('label') ?? el;
        const r = target.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
      expect(box.w, 'width of star ' + n).toBeGreaterThanOrEqual(44);
      expect(box.h, 'height of star ' + n).toBeGreaterThanOrEqual(44);
    }
    await star(page, 2).check();
    await star(page, 2).focus();
    await page.keyboard.press('ArrowRight');
    await expect(star(page, 3)).toBeChecked();
  });

  test('the text field has the visible label "Tekst (optioneel)"', async ({ page }) => {
    const id = await recipeWith(unique('Label'));
    await page.goto('/recept/' + id);
    await expect(page.getByText(nl['reviews.body'], { exact: true })).toBeVisible();
    await expect(bodyField(page)).toBeVisible();
  });
});

test.describe('crit. 3 and 4: one review, summary updates', () => {
  test.beforeEach(async ({ page }) => signInViaStorage(page, u1.session));

  test('no reviews: "Nog geen reviews" and no number', async ({ page }) => {
    const id = await recipeWith(unique('Leeg'));
    await page.goto('/recept/' + id);
    await expect(summary(page)).toContainText(nl['reviews.none']);
    await expect(summary(page)).not.toContainText(/\d,\d/);
  });

  test('saving a review replaces the form with the own review and updates the summary without reload', async ({ page }) => {
    const id = await recipeWith(unique('Eerste'));
    await page.goto('/recept/' + id);
    await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
    await star(page, 4).check();
    await bodyField(page).fill('Lekker!');
    await saveBtn(page).click();
    await expect(summary(page)).toContainText('4,0');
    await expect(summary(page)).toContainText('1 review');
    await expect(page.getByText('Lekker!')).toBeVisible();
    await expect(saveBtn(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: nl['reviews.edit'], exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
  });

  test('three reviews 4, 4, 5 show "4,3" and "3 reviews"', async ({ page }) => {
    const id = await recipeWith(unique('Drie'), [
      { user: author, rating: 4 },
      { user: u2, rating: 4 },
      { user: admin, rating: 5 },
    ]);
    await page.goto('/recept/' + id);
    await expect(summary(page)).toContainText('4,3');
    await expect(summary(page)).toContainText('3 reviews');
  });

  test('edit changes the review and summary; the date and place stay', async ({ page }) => {
    const id = await recipeWith(unique('Bewerk'), [
      { user: u2, rating: 2, body: 'Andere', createdAt: '2026-03-01T10:00:00Z' },
      { user: u1, rating: 2, body: 'Oud', createdAt: '2026-02-01T10:00:00Z' },
    ]);
    await page.goto('/recept/' + id);
    await page.getByRole('button', { name: nl['reviews.edit'], exact: true }).click();
    await star(page, 5).check();
    await bodyField(page).fill('Nieuw');
    await saveBtn(page).click();
    await expect(page.getByTestId('review-item').filter({ hasText: 'Nieuw' })).toBeVisible();
    await expect(summary(page)).toContainText('3,5');
    await expect(page.getByText('1 februari 2026')).toBeVisible();
    // Order follows created_at: u2 (March) first, edited review second.
    const texts = await page.getByTestId('review-item').allInnerTexts();
    expect(texts[0]).toContain('Andere');
    expect(texts[1]).toContain('Nieuw');
  });

  test('delete asks for confirmation, then the form returns and the summary resets', async ({ page }) => {
    const id = await recipeWith(unique('Verwijder'), [{ user: u1, rating: 3, body: 'Weg ermee' }]);
    await page.goto('/recept/' + id);
    await page.getByRole('button', { name: nl['reviews.delete'], exact: true }).click();
    await expect(page.getByText('Deze review verwijderen?')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: nl['reviews.delete'], exact: true }).click();
    await expect(saveBtn(page)).toBeVisible();
    await expect(summary(page)).toContainText(nl['reviews.none']);
  });

  test('a 23505 from the database shows "Je hebt dit recept al beoordeeld." and reloads the list', async ({ page }) => {
    const id = await recipeWith(unique('Dubbel'));
    await page.goto('/recept/' + id);
    // Wait until the list has loaded (empty-state form visible) before the review appears behind the page's back.
    await expect(saveBtn(page)).toBeVisible();
    await expect(summary(page)).toContainText(nl['reviews.none']);
    const ins = await u1.client.from('reviews').insert({ recipe_id: id, rating: 2, body: 'Uit tab twee' });
    expect(ins.error).toBeNull();
    await star(page, 5).check();
    await saveBtn(page).click();
    await expect(page.getByText('Je hebt dit recept al beoordeeld.')).toBeVisible();
    await expect(page.getByText('Uit tab twee')).toBeVisible();
    await expect(page.getByRole('button', { name: nl['reviews.edit'], exact: true })).toBeVisible();
  });

  test('connection error keeps the input and offers "Opnieuw proberen"', async ({ page }) => {
    const id = await recipeWith(unique('Offline'));
    await page.goto('/recept/' + id);
    await star(page, 4).check();
    await bodyField(page).fill('Blijft staan');
    await page.route(supabaseRoutePattern(), (r) => r.abort());
    await saveBtn(page).click();
    await expect(page.getByText(nl['connection.error'])).toBeVisible();
    await expect(bodyField(page)).toHaveValue('Blijft staan');
    await expect(star(page, 4)).toBeChecked();
    await expect(page.getByRole('button', { name: nl['connection.retry'], exact: true })).toBeVisible();
  });
});

test.describe('crit. 6 and 7: list and rights', () => {
  test('three reviews appear newest first with score text, body, author and date', async ({ page }) => {
    await signInViaStorage(page, author.session);
    const id = await recipeWith(unique('Volgorde'), [
      { user: u1, rating: 3, body: 'Eerste tekst', createdAt: '2026-11-02T08:00:00Z' },
      { user: u2, rating: 4, body: 'Tweede tekst', createdAt: '2026-11-02T09:00:00Z' },
      { user: admin, rating: 5, body: 'Derde tekst', createdAt: '2026-11-02T10:00:00Z' },
    ]);
    await page.goto('/recept/' + id);
    const items = page.getByTestId('review-item');
    await expect(items).toHaveCount(3);
    const texts = await items.allInnerTexts();
    expect(texts[0]).toContain('Derde tekst');
    expect(texts[1]).toContain('Tweede tekst');
    expect(texts[2]).toContain('Eerste tekst');
    expect(texts[0]).toContain('5 van 5 sterren');
    expect(texts[0]).toContain('Bea Beheer');
    expect(texts[0]).toContain('2 november 2026');
  });

  test('another user sees no buttons on a review; the administrator sees only "Verwijderen"', async ({ page, browser }) => {
    const id = await recipeWith(unique('Rechten'), [{ user: u1, rating: 3, body: 'Van een' }]);
    await signInViaStorage(page, u2.session);
    await page.goto('/recept/' + id);
    const item = page.getByTestId('review-item');
    await expect(item).toContainText('Van een');
    await expect(item.getByRole('button')).toHaveCount(0);

    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
    const adminPage = await ctx.newPage();
    await signInViaStorage(adminPage, admin.session);
    await adminPage.goto('/recept/' + id);
    const adminItem = adminPage.getByTestId('review-item');
    await expect(adminItem.getByRole('button', { name: nl['reviews.delete'], exact: true })).toBeVisible();
    await expect(adminItem.getByRole('button', { name: nl['reviews.edit'], exact: true })).toHaveCount(0);
    await ctx.close();
  });

  test('a delete that affects 0 rows shows "Verwijderen mislukt."', async ({ page }) => {
    const id = await recipeWith(unique('Nul rijen'), [{ user: u1, rating: 3, body: 'Blijft' }]);
    await signInViaStorage(page, u1.session);
    await page.route('**/rest/v1/reviews*', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      } else {
        await route.continue();
      }
    });
    await page.goto('/recept/' + id);
    await page.getByRole('button', { name: nl['reviews.delete'], exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: nl['reviews.delete'], exact: true }).click();
    await expect(page.getByText('Verwijderen mislukt.')).toBeVisible();
  });
});

test.describe('crit. 5: overview', () => {
  test('shows "4,3 · 3 reviews" with reviews and nothing without', async ({ page }) => {
    await signInViaStorage(page, u1.session);
    const withTitle = unique('Met reviews');
    const withoutTitle = unique('Zonder reviews');
    await recipeWith(withTitle, [
      { user: author, rating: 4 },
      { user: u2, rating: 4 },
      { user: admin, rating: 5 },
    ]);
    await recipeWith(withoutTitle);
    await page.goto('/');
    const withItem = page.getByRole('listitem').filter({ hasText: withTitle });
    await expect(withItem.getByTestId('recipe-rating')).toHaveText('4,3 · 3 reviews');
    const withoutItem = page.getByRole('listitem').filter({ hasText: withoutTitle });
    await expect(withoutItem).toBeVisible();
    await expect(withoutItem.getByTestId('recipe-rating')).toHaveCount(0);
  });

  test('sorting by rating: A (4,5 x2), D (4,5 x1, younger), C (3,0), B (none); URL keeps it and filters', async ({ page }) => {
    await signInViaStorage(page, u1.session);
    const tag = unique('Sorteer');
    const a = tag + ' A';
    const b = tag + ' B';
    const c = tag + ' C';
    const d = tag + ' D';
    // A: 4 reviews, avg 4,5 (oldest). D: 2 reviews, avg 4,5 (younger). C: 3,0. B: none.
    await recipeWith(a, [
      { user: author, rating: 4 },
      { user: u1, rating: 5 },
      { user: u2, rating: 4 },
      { user: admin, rating: 5 },
    ]);
    await recipeWith(b);
    await recipeWith(c, [{ user: u2, rating: 3 }]);
    await recipeWith(d, [
      { user: u1, rating: 4 },
      { user: u2, rating: 5 },
    ]);
    await page.goto('/?sorteer=beoordeling');
    const sort = page.getByLabel(nl['overview.sort'], { exact: true });
    await expect(sort.locator('option:checked')).toHaveText(nl['overview.sortRating']);
    const items = page.getByRole('listitem').filter({ hasText: tag });
    await expect(items).toHaveCount(4);
    const titles = await items.allInnerTexts();
    const order = titles.map((t) => t.match(/Sorteer .*? ([ABCD])\b/)?.[1]);
    // Highest average first; equal average: more reviews first; no reviews last.
    expect(order).toEqual(['A', 'D', 'C', 'B']);
  });

  test('the sort choice survives a reload; an unknown value gives "Aanmaakdatum"; filter and sort do not wipe each other', async ({ page }) => {
    await signInViaStorage(page, u1.session);
    await page.goto('/?sorteer=beoordeling');
    const sort = page.getByLabel(nl['overview.sort'], { exact: true });
    await page.reload();
    await expect(page).toHaveURL(/sorteer=beoordeling/);
    await expect(sort.locator('option:checked')).toHaveText(nl['overview.sortRating']);

    await page.goto('/?sorteer=onzin');
    await expect(sort.locator('option:checked')).toHaveText(nl['overview.sortCreated']);

    // The sort stays visible with the filters closed (R-028); the time filter in the URL needs no open panel.
    await page.goto('/?sorteer=beoordeling&totaal=60');
    await sort.selectOption({ label: nl['overview.sortCreated'] });
    await expect(page).toHaveURL(/totaal=60/);
    await sort.selectOption({ label: nl['overview.sortRating'] });
    await expect(page).toHaveURL(/totaal=60/);
    await expect(page).toHaveURL(/sorteer=beoordeling/);
  });
});

test('long review text does not scroll horizontally at 360 px (layout)', async ({ page }) => {
  await signInViaStorage(page, u1.session);
  const id = await recipeWith(unique('Lang'), [{ user: u2, rating: 4, body: 'Superlang'.repeat(50) }]);
  await page.goto('/recept/' + id);
  await expect(page.getByTestId('review-item')).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(360);
});
