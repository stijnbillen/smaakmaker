import { expect, test } from '@playwright/test';
import { signInViaStorage, supabaseRoutePattern } from '../helpers/session';
import { fillRecipe, ingredientNameFields, stepFields, titleField } from '../helpers/recipe-form';
import { assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, type TestUser } from '../helpers/supabase-admin';

const MESSAGE = 'Geen verbinding. Probeer opnieuw.';
let user: TestUser;
const title = `Verbindingstest ${Date.now()}`;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('conn');
  await insertRecipe(user.client, { title });
});

test.afterAll(async () => {
  if (user) await deleteTestUser(user);
});

test.beforeEach(async ({ page }) => {
  await signInViaStorage(page, user.session);
});

// T-001 criterion 6, overview
test('overview shows connection error and recovers without page reload (R-001 crit. 6)', async ({ page }) => {
  await page.route(supabaseRoutePattern(), (r) => r.abort());
  await page.goto('/');
  await expect(page.getByText(MESSAGE)).toBeVisible();
  const retry = page.getByRole('button', { name: 'Opnieuw proberen' });
  await expect(retry).toBeVisible();

  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
  await page.unroute(supabaseRoutePattern());
  await retry.click();

  await expect(page.getByText(MESSAGE)).toBeHidden();
  await expect(page.getByText(title)).toBeVisible();
  const survived = await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload);
  expect(survived, 'page must not have reloaded').toBe(true);
});

// T-001 criterion 6: an abandoned form must not be saved by a stale retry (review finding 3)
test('retry after leaving the form inserts no recipe (R-001 crit. 6)', async ({ page }) => {
  const abandoned = `Verlaten ${Date.now()}`;
  await page.goto('/nieuw');
  await fillRecipe(page, { title: abandoned, ingredients: ['Zout'], steps: ['Roer.'] });

  await page.route(supabaseRoutePattern(), (r) => r.abort());
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.getByText(MESSAGE)).toBeVisible();

  await page.getByRole('link', { name: 'Terug naar overzicht' }).click();
  // The form is dirty (R-003 crit. 8): confirm leaving it.
  await page.getByRole('button', { name: 'Weggooien', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.unroute(supabaseRoutePattern());

  // The banner may be gone (correct) or still there; tapping retry must never insert.
  const retry = page.getByRole('button', { name: 'Opnieuw proberen' });
  // No isVisible()-then-click: the banner can vanish in between (overview reloads fine after unroute),
  // so click with a short timeout and ignore a button that is already gone.
  const insert = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/rest/v1/recipes'), {
    timeout: 1500,
  });
  insert.catch(() => undefined);
  await retry.click({ timeout: 1000 }).catch(() => undefined);
  await page.waitForTimeout(1500);

  const { data, error } = await user.client.from('recipes').select('id').eq('title', abandoned);
  expect(error).toBeNull();
  expect(data).toEqual([]);
});

// T-001 criterion 6, form
test('typed form input survives a connection error and retry (R-001 crit. 6)', async ({ page }) => {
  await page.goto('/nieuw');
  await fillRecipe(page, { title: 'Mijn halfaf recept', ingredients: ['Zout'], steps: ['Roer goed.'] });
  const expectInputKept = async () => {
    await expect(titleField(page)).toHaveValue('Mijn halfaf recept');
    await expect(ingredientNameFields(page).first()).toHaveValue('Zout');
    await expect(stepFields(page).first()).toHaveValue('Roer goed.');
  };

  await page.route(supabaseRoutePattern(), (r) => r.abort());
  await page.getByRole('button', { name: 'Opslaan' }).click();

  await expect(page.getByText(MESSAGE)).toBeVisible();
  await expectInputKept();

  // retry while still offline: message stays, value stays
  await page.getByRole('button', { name: 'Opnieuw proberen' }).click();
  await expect(page.getByText(MESSAGE)).toBeVisible();
  await expectInputKept();
});
