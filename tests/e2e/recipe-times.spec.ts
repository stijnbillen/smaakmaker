import { expect, test, type Page } from '@playwright/test';
import {
  fillRecipe,
  isRecipePost,
  nl,
  prepField,
  saveButton,
  titleField,
  totalField,
} from '../helpers/recipe-form';
import { signInViaStorage, supabaseRoutePattern } from '../helpers/session';
import { assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, type TestUser } from '../helpers/supabase-admin';

// T-006 / R-007: time fields in the form, display, and the overview filter. Local Supabase, viewport 360 x 640.
let user: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('rtime', { displayName: 'Tim Tijd' });
});

test.afterAll(async () => {
  if (user) await deleteTestUser(user);
});

test.beforeEach(async ({ page }) => {
  await signInViaStorage(page, user.session);
});

const unique = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const base = { ingredients: ['Zout'], steps: ['Roer.'] };

const prepFilter = (page: Page) => page.getByLabel(nl['filter.maxPrep'], { exact: true });
const totalFilter = (page: Page) => page.getByLabel(nl['filter.maxTotal'], { exact: true });
const item = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title });

function collectPosts(page: Page): string[] {
  const posts: string[] = [];
  page.on('request', (r) => {
    if (isRecipePost(r)) posts.push(r.url());
  });
  return posts;
}

async function expectMessageAt(page: Page, field: ReturnType<typeof prepField>, message: string) {
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await field.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  const text = await page.evaluate(
    (ids) => ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '),
    describedBy!,
  );
  expect(text).toContain(message);
}

test.describe('crit. 1: both times are required and bounded', () => {
  test('empty times give a message at each field, aria-invalid, and no POST', async ({ page }) => {
    const posts = collectPosts(page);
    await page.goto('/nieuw');
    await titleField(page).fill(unique('Leeg'));
    await expect(prepField(page)).toHaveAttribute('inputmode', 'numeric');
    await expect(totalField(page)).toHaveAttribute('inputmode', 'numeric');
    await saveButton(page).click();
    await expectMessageAt(page, prepField(page), nl['form.minutesRequired']);
    await expectMessageAt(page, totalField(page), nl['form.minutesRequired']);
    expect(posts).toEqual([]);
    await expect(page).toHaveURL(/\/nieuw$/);
  });

  for (const [label, value] of [
    ['4321', '4321'],
    ['a text', 'abc'],
  ] as const) {
    test(`${label} in the prep field is refused with a message at that field and no POST`, async ({ page }) => {
      const posts = collectPosts(page);
      await page.goto('/nieuw');
      await fillRecipe(page, { title: unique('Grens'), ...base, prepMinutes: value, totalMinutes: '4320' });
      await saveButton(page).click();
      await expectMessageAt(page, prepField(page), nl['form.minutesInvalid']);
      expect(posts).toEqual([]);
    });

    test(`${label} in the total field is refused with a message at that field and no POST`, async ({ page }) => {
      const posts = collectPosts(page);
      await page.goto('/nieuw');
      await fillRecipe(page, { title: unique('Grens'), ...base, prepMinutes: '0', totalMinutes: value });
      await saveButton(page).click();
      await expectMessageAt(page, totalField(page), nl['form.minutesInvalid']);
      expect(posts).toEqual([]);
    });
  }

  test('0 and 4320 can be saved', async ({ page }) => {
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Uiterst'), ...base, prepMinutes: '0', totalMinutes: '4320' });
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
  });
});

test.describe('crit. 2: total >= prep', () => {
  test('30 / 29 shows the literal message at the total field, sends nothing and focuses that field', async ({ page }) => {
    const posts = collectPosts(page);
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Te kort'), ...base, prepMinutes: '30', totalMinutes: '29' });
    await saveButton(page).click();
    await expect(page.getByText('Totale tijd kan niet korter zijn dan de preptijd.')).toBeVisible();
    await expectMessageAt(page, totalField(page), 'Totale tijd kan niet korter zijn dan de preptijd.');
    await expect(totalField(page)).toBeFocused();
    expect(posts).toEqual([]);
  });

  test('30 / 30 can be saved', async ({ page }) => {
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Gelijk'), ...base, prepMinutes: '30', totalMinutes: '30' });
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
  });
});

test.describe('crit. 3: display', () => {
  test('a saved 90 / 4320 shows "1 u 30 min" and "72 u" on the detail page and in the overview', async ({ page }) => {
    const title = unique('Weergave');
    await page.goto('/nieuw');
    await fillRecipe(page, { title, ...base, prepMinutes: '90', totalMinutes: '4320' });
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);

    await expect(page.getByText(nl['time.prep'], { exact: true })).toBeVisible();
    await expect(page.getByText('1 u 30 min', { exact: true })).toBeVisible();
    await expect(page.getByText(nl['time.total'], { exact: true })).toBeVisible();
    await expect(page.getByText('72 u', { exact: true })).toBeVisible();

    await page.goto('/');
    const row = item(page, title);
    await expect(row).toContainText('1 u 30 min');
    await expect(row).toContainText('72 u');
  });
});

test.describe('crit. 4: overview filter', () => {
  async function seed() {
    const tag = unique('Tijdfilter');
    const a = await insertRecipe(user.client, { title: `${tag} A`, prep_minutes: 30, total_minutes: 60 });
    const b = await insertRecipe(user.client, { title: `${tag} B`, prep_minutes: 31, total_minutes: 61 });
    const c = await insertRecipe(user.client, { title: `${tag} C`, prep_minutes: 15, total_minutes: 120 });
    return { tag, a: a.title, b: b.title, c: c.title };
  }

  test('max prep 30: exactly 30 counts, 31 does not; max total 60; both together use "and"; "Alle" resets', async ({ page }) => {
    const { a, b, c } = await seed();
    await page.goto('/');
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, b)).toBeVisible();
    await expect(item(page, c)).toBeVisible();

    await prepFilter(page).selectOption({ label: '30 min' });
    await expect(item(page, b)).toHaveCount(0);
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, c)).toBeVisible();

    await prepFilter(page).selectOption({ label: nl['filter.all'] });
    await totalFilter(page).selectOption({ label: '1 u' });
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, b)).toHaveCount(0);
    await expect(item(page, c)).toHaveCount(0);

    await prepFilter(page).selectOption({ label: '15 min' });
    await totalFilter(page).selectOption({ label: '2 u' });
    await expect(item(page, c)).toBeVisible();
    await expect(item(page, a)).toHaveCount(0);
    await expect(item(page, b)).toHaveCount(0);

    await prepFilter(page).selectOption({ label: nl['filter.all'] });
    await totalFilter(page).selectOption({ label: nl['filter.all'] });
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, b)).toBeVisible();
    await expect(item(page, c)).toBeVisible();
  });

  test('the choice is in the URL and survives reload and back from a detail page; newest first stays', async ({ page }) => {
    const { a, b, c } = await seed();
    await page.goto('/');
    await prepFilter(page).selectOption({ label: '30 min' });
    await totalFilter(page).selectOption({ label: '1 u' });
    await expect(page).toHaveURL(/[?&]prep=30/);
    await expect(page).toHaveURL(/[?&]totaal=60/);
    await expect(item(page, a)).toBeVisible();

    await page.reload();
    await expect(prepFilter(page)).toHaveValue('30');
    await expect(totalFilter(page)).toHaveValue('60');
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, b)).toHaveCount(0);
    await expect(item(page, c)).toHaveCount(0);

    await item(page, a).getByText(a).click();
    await expect(page).toHaveURL(/\/recept\//);
    await page.goBack();
    await expect(page).toHaveURL(/prep=30/);
    await expect(prepFilter(page)).toHaveValue('30');
    await expect(item(page, a)).toBeVisible();

    // Sorting: with prep <= 120 all three match; C was inserted last, so it is the newest of the three.
    await page.goto('/?prep=30');
    // Wait for the list to be loaded before reading it, else the order check races the fetch.
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, c)).toBeVisible();
    const titles = await page.getByRole('listitem').allInnerTexts();
    const idx = (t: string) => titles.findIndex((x) => x.includes(t));
    expect(idx(c)).toBeGreaterThanOrEqual(0);
    expect(idx(c)).toBeLessThan(idx(a));
  });

  test('a filter without matches shows "Niets gevonden." and not "Nog geen recepten."', async ({ page }) => {
    await page.route(/\/rest\/v1\/recipes/, (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: '[]',
      });
    });
    await page.goto('/?prep=15');
    await expect(page.getByText('Niets gevonden.')).toBeVisible();
    await expect(page.getByText('Nog geen recepten.')).toHaveCount(0);
  });

  test('the selects have a visible label, are at least 44 px high and fit in 360 px', async ({ page }) => {
    await page.goto('/');
    for (const [select, label] of [
      [prepFilter(page), nl['filter.maxPrep']],
      [totalFilter(page), nl['filter.maxTotal']],
    ] as const) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
      const box = await select.boundingBox();
      expect(box, label).not.toBeNull();
      expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width, `${label} right edge`).toBeLessThanOrEqual(360);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('a connection error while filtering shows the banner; "Opnieuw proberen" reloads with the same filter', async ({ page }) => {
    await page.goto('/');
    // Wait for the filter to be visible so the select is interactive before requests are aborted.
    await expect(prepFilter(page)).toBeVisible();
    await expect(prepFilter(page)).toBeEnabled();
    await page.route(supabaseRoutePattern(), (r) => r.abort());
    await prepFilter(page).selectOption({ label: '30 min' });
    const retry = page.getByRole('button', { name: 'Opnieuw proberen' });
    await expect(retry).toBeVisible();
    await page.unroute(supabaseRoutePattern());
    const reload = page.waitForRequest(
      (r) => r.method() === 'GET' && r.url().includes('/rest/v1/recipes') && /prep_minutes=lte\.30/.test(r.url()),
    );
    await retry.click();
    await reload;
    await expect(retry).toHaveCount(0);
    await expect(prepFilter(page)).toHaveValue('30');
  });
});

test.describe('editing keeps the times (R-001, R-003)', () => {
  test('the edit form shows the stored times and a fresh form is not dirty', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Bewerk tijd'), prep_minutes: 25, total_minutes: 95 });
    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(prepField(page)).toHaveValue('25');
    await expect(totalField(page)).toHaveValue('95');
    await page
      .getByRole('navigation', { name: nl['nav.label'] })
      .getByRole('link', { name: nl['nav.recipes'] })
      .click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(nl['form.discardQuestion'])).toHaveCount(0);
  });

  test('changing a time and leaving asks "Wijzigingen weggooien?"', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Bewerk tijd 2'), prep_minutes: 25, total_minutes: 95 });
    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(prepField(page)).toHaveValue('25');
    await prepField(page).fill('26');
    await page
      .getByRole('navigation', { name: nl['nav.label'] })
      .getByRole('link', { name: nl['nav.recipes'] })
      .click();
    await expect(page.getByText(nl['form.discardQuestion'])).toBeVisible();
  });
});
