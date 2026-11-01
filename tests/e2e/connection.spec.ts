import { expect, test } from '@playwright/test';
import { signInViaStorage, supabaseRoutePattern } from '../helpers/session';
import { assertSupabaseUp, createTestUser, deleteTestUser, type TestUser } from '../helpers/supabase-admin';

const MESSAGE = 'Geen verbinding. Probeer opnieuw.';
let user: TestUser;
const title = `Verbindingstest ${Date.now()}`;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('conn');
  const ins = await user.client.from('recipes').insert({ title });
  if (ins.error) throw ins.error;
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
  await page.getByRole('textbox').first().fill(abandoned);

  await page.route(supabaseRoutePattern(), (r) => r.abort());
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.getByText(MESSAGE)).toBeVisible();

  await page.getByRole('link', { name: 'Terug naar overzicht' }).click();
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
  const input = page.getByRole('textbox').first();
  await input.fill('Mijn halfaf recept');

  await page.route(supabaseRoutePattern(), (r) => r.abort());
  await page.getByRole('button', { name: 'Opslaan' }).click();

  await expect(page.getByText(MESSAGE)).toBeVisible();
  await expect(input).toHaveValue('Mijn halfaf recept');

  // retry while still offline: message stays, value stays
  await page.getByRole('button', { name: 'Opnieuw proberen' }).click();
  await expect(page.getByText(MESSAGE)).toBeVisible();
  await expect(input).toHaveValue('Mijn halfaf recept');
});
