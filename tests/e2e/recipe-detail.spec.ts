import { expect, test, type Page } from '@playwright/test';
import { nl, titleField } from '../helpers/recipe-form';
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

// T-005 / R-003 crit. 6 and 7 and R-017 crit. 3 (interface): detail page, edit/delete buttons, confirmation, 0 rows.
let author: TestUser;
let other: TestUser;
let boss: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  author = await createTestUser('rdauthor', { displayName: 'Anke Auteur' });
  other = await createTestUser('rdother');
  boss = await createTestUser('rdboss');
  await makeAdmin(boss.id);
});

test.afterAll(async () => {
  for (const u of [author, other, boss]) if (u) await deleteTestUser(u);
});

const unique = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const dialog = (page: Page) => page.getByRole('alertdialog');
const confirmDelete = (page: Page) => dialog(page).getByRole('button', { name: nl['recipe.deleteConfirm'], exact: true });
const cancel = (page: Page) => dialog(page).getByRole('button', { name: nl['form.cancel'], exact: true });
const deleteButton = (page: Page) => page.getByRole('button', { name: nl['recipe.delete'], exact: true });
const editControl = (page: Page) => page.getByRole('link', { name: nl['recipe.edit'], exact: true }).or(
  page.getByRole('button', { name: nl['recipe.edit'], exact: true }),
);

const existsInDb = async (id: string) =>
  ((await adminClient().from('recipes').select('id').eq('id', id)).data ?? []).length === 1;

test.describe('detail page shows the recipe', () => {
  test('title, ingredients (quantity, unit, name), numbered steps and the author line', async ({ page }) => {
    const row = await insertRecipe(author.client, {
      title: unique('Detail'),
      ingredients: [{ name: 'Water', quantity: 0.5, unit: 'l' }, { name: 'Zout' }],
      steps: ['Kook.', 'Proef.'],
    });
    await signInViaStorage(page, author.session);
    await page.goto(`/recept/${row.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(row.title);
    await expect(page.getByText(/0,5\s*l\s*Water/)).toBeVisible();
    await expect(page.getByText('Zout')).toBeVisible();
    await expect(page.locator('ol > li')).toHaveCount(2);
    await expect(page.getByText(/Anke Auteur/)).toBeVisible();
  });
});

test.describe('author', () => {
  // Block the service worker: once it controls the page it answers requests itself, and page.route never sees
  // them, so the intercepted DELETE below would reach the database after all.
  test.use({ serviceWorkers: 'block' });

  test.beforeEach(async ({ page }) => {
    await signInViaStorage(page, author.session);
  });

  test('sees "Bewerken" and "Verwijderen" on own recipe', async ({ page }) => {
    const row = await insertRecipe(author.client, { title: unique('Eigen') });
    await page.goto(`/recept/${row.id}`);
    await expect(editControl(page)).toBeVisible();
    await expect(deleteButton(page)).toBeVisible();
  });

  test('"Verwijderen" asks "Dit recept verwijderen?"; "Annuleren" closes it and the recipe stays', async ({ page }) => {
    const row = await insertRecipe(author.client, { title: unique('Blijft') });
    await page.goto(`/recept/${row.id}`);
    await deleteButton(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText(nl['recipe.deleteQuestion']);
    await expect(cancel(page)).toBeFocused(); // safe button first
    await cancel(page).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/recept/${row.id}$`));
    expect(await existsInDb(row.id)).toBe(true);
  });

  test('Escape counts as cancelling', async ({ page }) => {
    const row = await insertRecipe(author.client, { title: unique('Escape') });
    await page.goto(`/recept/${row.id}`);
    await deleteButton(page).click();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    expect(await existsInDb(row.id)).toBe(true);
  });

  test('confirming deletes: back to the overview, gone from the list, detail says "Recept niet gevonden."', async ({ page }) => {
    const row = await insertRecipe(author.client, { title: unique('Weg') });
    await page.goto(`/recept/${row.id}`);
    await deleteButton(page).click();
    await confirmDelete(page).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(row.title)).toHaveCount(0);
    expect(await existsInDb(row.id)).toBe(false);
    await page.goto(`/recept/${row.id}`);
    await expect(page.getByText(nl['recipe.notFound'])).toBeVisible();
  });

  test('a DELETE that returns 0 rows is a failure: "Verwijderen mislukt.", stays on the page', async ({ page }) => {
    const row = await insertRecipe(author.client, { title: unique('Nul rijen') });
    await page.goto(`/recept/${row.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(row.title); // loaded before intercepting
    await page.route(/\/rest\/v1\/recipes/, async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      } else {
        await route.continue();
      }
    });
    await deleteButton(page).click();
    await confirmDelete(page).click();
    await expect(page.getByRole('alert').filter({ hasText: nl['recipe.deleteFailed'] })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/recept/${row.id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(row.title);
    expect(await existsInDb(row.id)).toBe(true); // the interception never reached the database
  });

  test('a connection error while deleting shows the banner with "Opnieuw proberen" (R-001 crit. 6)', async ({ page }) => {
    const row = await insertRecipe(author.client, { title: unique('Offline') });
    await page.goto(`/recept/${row.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(row.title); // loaded before aborting
    await page.route(supabaseRoutePattern(), (r) => r.abort());
    await deleteButton(page).click();
    await confirmDelete(page).click();
    await expect(page.getByText(nl['connection.error'])).toBeVisible();
    await expect(page.getByRole('button', { name: nl['connection.retry'] })).toBeVisible();
    await page.unroute(supabaseRoutePattern());
    expect(await existsInDb(row.id)).toBe(true);
  });
});

test.describe('another normal user', () => {
  test.beforeEach(async ({ page }) => {
    await signInViaStorage(page, other.session);
  });

  test("sees neither \"Bewerken\" nor \"Verwijderen\" on someone else's recipe", async ({ page }) => {
    const row = await insertRecipe(author.client, { title: unique('Van een ander') });
    await page.goto(`/recept/${row.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(row.title);
    await expect(deleteButton(page)).toHaveCount(0);
    await expect(editControl(page)).toHaveCount(0);
  });

  test('opening /bewerken of someone else lands on the detail page without a form', async ({ page }) => {
    const row = await insertRecipe(author.client, { title: unique('Niet van jou') });
    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(page).toHaveURL(new RegExp(`/recept/${row.id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(row.title);
    await expect(titleField(page)).toHaveCount(0);
  });
});

test.describe('administrator (R-017 crit. 3)', () => {
  test.beforeEach(async ({ page }) => {
    await signInViaStorage(page, boss.session);
  });

  test('sees "Verwijderen" but no "Bewerken" on a recipe of someone else, confirms, and it is gone', async ({ page }) => {
    const row = await insertRecipe(author.client, { title: unique('Ongewenst') });
    await page.goto(`/recept/${row.id}`);
    await expect(editControl(page)).toHaveCount(0);
    await expect(deleteButton(page)).toBeVisible();
    await deleteButton(page).click();
    await expect(dialog(page)).toBeVisible();
    await confirmDelete(page).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(row.title)).toHaveCount(0);
    expect(await existsInDb(row.id)).toBe(false);
  });

  test('opening /bewerken of someone else lands on the detail page: an administrator does not edit', async ({ page }) => {
    const row = await insertRecipe(author.client, { title: unique('Beheerder leest') });
    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(page).toHaveURL(new RegExp(`/recept/${row.id}$`));
    await expect(titleField(page)).toHaveCount(0);
  });
});
