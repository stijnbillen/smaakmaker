import { expect, test, type Page } from '@playwright/test';
import { fillRecipe, isRecipePost, nl, saveButton, servingsField } from '../helpers/recipe-form';
import { sql } from '../helpers/pg';
import { signInViaStorage } from '../helpers/session';
import { adminClient, assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, type TestUser } from '../helpers/supabase-admin';

// T-007 / R-013: servings field, stepper and scaling. Local Supabase, viewport 360 x 640.
let user: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('rserv', { displayName: 'Pia Portie' });
});

test.afterAll(async () => {
  if (user) await deleteTestUser(user);
});

test.beforeEach(async ({ page }) => {
  await signInViaStorage(page, user.session);
});

const unique = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const base = { ingredients: ['Zout'], steps: ['Roer.'] };

const more = (page: Page) => page.getByRole('button', { name: nl['servings.increase'], exact: true });
const less = (page: Page) => page.getByRole('button', { name: nl['servings.decrease'], exact: true });
const shown = (page: Page) => page.locator('output[aria-live="polite"]');
const ingredientList = (page: Page) => page.locator('.ingredient-list');

function collectWrites(page: Page): string[] {
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/rest/v1/recipes') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method())) {
      writes.push(`${r.method()} ${r.url()}`);
    }
  });
  return writes;
}

const seedScaling = (servings = 4, title = unique('Schaal')) =>
  insertRecipe(user.client, {
    title,
    servings,
    ingredients: [
      { name: 'bloem', quantity: 200, unit: 'g' },
      { name: 'ei', quantity: 1 },
      { name: 'melk', quantity: 0.5, unit: 'l' },
      { name: 'zout' },
    ],
  });

test.describe('crit. 1: form field', () => {
  for (const [label, value] of [
    ['empty', ''],
    ['0', '0'],
    ['100', '100'],
    ['text', 'abc'],
  ] as const) {
    test(`${label} is refused with a message at the field and no POST`, async ({ page }) => {
      const posts: string[] = [];
      page.on('request', (r) => {
        if (isRecipePost(r)) posts.push(r.url());
      });
      await page.goto('/nieuw');
      await fillRecipe(page, { title: unique('Porties'), ...base, servings: value });
      await expect(servingsField(page)).toHaveAttribute('inputmode', 'numeric');
      await saveButton(page).click();
      const field = servingsField(page);
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      const describedBy = await field.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      const text = await page.evaluate(
        (ids) => ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '),
        describedBy!,
      );
      expect(text).toContain(value === '' ? nl['form.servingsRequired'] : nl['form.servingsInvalid']);
      expect(posts).toEqual([]);
    });
  }

  test('4 can be saved', async ({ page }) => {
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Vier'), ...base, servings: '4' });
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    await expect(shown(page)).toHaveText('4');
  });

  test('edit shows the stored value; changing it and leaving asks to discard', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Bewerk porties'), servings: 6 });
    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(servingsField(page)).toHaveValue('6');
    await servingsField(page).fill('7');
    await page
      .getByRole('navigation', { name: nl['nav.label'] })
      .getByRole('link', { name: nl['nav.recipes'] })
      .click();
    await expect(page.getByText(nl['form.discardQuestion'])).toBeVisible();
  });
});

test.describe('crit. 2: stepper', () => {
  test('steps of exactly 1 up and down, and nothing is written', async ({ page }) => {
    const row = await seedScaling(4);
    const writes = collectWrites(page);
    await page.goto(`/recept/${row.id}`);
    await expect(shown(page)).toHaveText('4');
    await more(page).click();
    await expect(shown(page)).toHaveText('5');
    await less(page).click();
    await less(page).click();
    await expect(shown(page)).toHaveText('3');
    expect(writes).toEqual([]);

    await page.reload();
    await expect(shown(page)).toHaveText('4');
    const check = await adminClient().from('recipes').select('servings').eq('id', row.id).single();
    expect(check.data).toEqual({ servings: 4 });
  });

  test('"Minder porties" is disabled at 1, "Meer porties" at 99', async ({ page }) => {
    const one = await seedScaling(1);
    await page.goto(`/recept/${one.id}`);
    await expect(less(page)).toBeDisabled();
    await less(page).click({ force: true });
    await expect(shown(page)).toHaveText('1');
    await expect(more(page)).toBeEnabled();

    const max = await seedScaling(99);
    await page.goto(`/recept/${max.id}`);
    await expect(more(page)).toBeDisabled();
    await more(page).click({ force: true });
    await expect(shown(page)).toHaveText('99');
  });

  test('buttons are at least 44 x 44 px and everything fits in 360 px', async ({ page }) => {
    const row = await seedScaling(4);
    await page.goto(`/recept/${row.id}`);
    for (const button of [more(page), less(page)]) {
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    }
    await expect(shown(page)).toHaveAttribute('aria-live', 'polite');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('crit. 3 and 4: scaling', () => {
  test('4 -> 6 -> 1 portions rescales, an ingredient without quantity stays "zout"', async ({ page }) => {
    const row = await seedScaling(4);
    await page.goto(`/recept/${row.id}`);
    const list = ingredientList(page);
    await expect(list).toContainText('200 g bloem');
    await expect(list).toContainText('1 ei');
    await expect(list).toContainText('0,5 l melk');

    await more(page).click();
    await more(page).click();
    await expect(shown(page)).toHaveText('6');
    await expect(list).toContainText('300 g bloem');
    await expect(list).toContainText('1,5 ei');
    await expect(list).toContainText('0,75 l melk');
    await expect(list.getByText('zout', { exact: true })).toBeVisible();
    await expect(page.getByText(nl['servings.original'].replace('{n}', '4'))).toBeVisible();

    for (let i = 0; i < 5; i++) await less(page).click();
    await expect(shown(page)).toHaveText('1');
    await expect(list).toContainText('50 g bloem');
    await expect(list).toContainText('0,25 ei');
    await expect(list).toContainText('0,13 l melk');
    await expect(list.getByText('zout', { exact: true })).toBeVisible();
  });
});

test.describe('crit. 5: opening starts at the stored value', () => {
  test('after navigating away, back and reload it shows the stored value again', async ({ page }) => {
    const row = await seedScaling(4);
    await page.goto(`/recept/${row.id}`);
    await more(page).click();
    await more(page).click();
    await expect(shown(page)).toHaveText('6');

    await page.getByRole('link', { name: nl['nav.recipes'] }).first().click();
    await expect(page).toHaveURL(/\/$/);
    // Wait until the overview is rendered, otherwise goBack races the route change.
    await expect(page.getByRole('heading', { level: 1, name: nl['overview.title'] })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/recept/${row.id}$`));
    await expect(shown(page)).toHaveText('4');
    await expect(ingredientList(page)).toContainText('200 g bloem');

    await more(page).click();
    await page.reload();
    await expect(shown(page)).toHaveText('4');
    await expect(ingredientList(page)).toContainText('200 g bloem');
  });

  test('moving to another recipe in the same route component resets to its own servings', async ({ page }) => {
    const first = await seedScaling(4);
    const second = await insertRecipe(user.client, { title: unique('Twee porties'), servings: 2 });
    await page.goto(`/recept/${first.id}`);
    await more(page).click();
    await more(page).click();
    await expect(shown(page)).toHaveText('6');
    // Client-side navigation (React Router listens to popstate), so the page component stays mounted.
    await page.evaluate((id) => {
      window.history.pushState({}, '', `/recept/${id}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, second.id);
    await expect(page.getByRole('heading', { level: 1, name: second.title })).toBeVisible();
    await expect(shown(page)).toHaveText('2');
  });
});

test.describe('old rows without servings', () => {
  test('show no stepper and the stored quantities, without error', async ({ page }) => {
    const row = await insertRecipe(user.client, {
      title: unique('Oud'),
      ingredients: [{ name: 'bloem', quantity: 200, unit: 'g' }],
    });
    // Simulate an old sample row. NOT VALID checks still apply to every new write, so null the column
    // in one transaction that lifts the checks and re-adds them as NOT VALID (as the migration does).
    await sql(`begin;
      alter table public.recipes drop constraint recipes_servings_required, drop constraint recipes_servings_range;
      update public.recipes set servings = null where id = '${row.id}';
      alter table public.recipes
        add constraint recipes_servings_required check (servings is not null) not valid,
        add constraint recipes_servings_range check (servings between 1 and 99) not valid;
      commit;`);
    await page.goto(`/recept/${row.id}`);
    await expect(page.getByText('200 g bloem')).toBeVisible();
    await expect(more(page)).toHaveCount(0);
    await expect(less(page)).toHaveCount(0);
  });
});
