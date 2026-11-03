import { expect, test, type Route } from '@playwright/test';
import nlJson from '../../src/i18n/nl.json' with { type: 'json' };
import { signInViaStorage, supabaseRoutePattern } from '../helpers/session';
import { assertSupabaseUp, createTestUser, deleteTestUser, type TestUser } from '../helpers/supabase-admin';

const nl = nlJson as Record<string, string>;
const RECIPES = /\/rest\/v1\/recipes/;

let user: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('list');
});

test.afterAll(async () => {
  if (user) await deleteTestUser(user);
});

test.beforeEach(async ({ page }) => {
  await signInViaStorage(page, user.session);
});

// R-016 crit. 6: loading state while the request is pending.
test('overview shows a loading status while recipes load, then it disappears', async ({ page }) => {
  let held: Route | undefined;
  let heldResolve: () => void = () => {};
  const arrived = new Promise<void>((r) => (heldResolve = r));
  await page.route(RECIPES, (route) => {
    if (route.request().method() === 'GET' && !held) {
      held = route;
      heldResolve();
    } else {
      void route.continue();
    }
  });
  await page.goto('/');
  await arrived;
  const loadingText = nl['overview.loading'];
  expect(loadingText?.length ?? 0).toBeGreaterThan(0);
  const status = page.getByRole('status').filter({ hasText: loadingText });
  await expect(status).toBeVisible();
  await expect(page.getByText(nl['overview.empty'])).toHaveCount(0);

  await held!.continue();
  await expect(status).toHaveCount(0);
});

// R-016 crit. 6: empty state with the Dutch text.
test('overview shows "Nog geen recepten." for an empty list, and no loading indicator', async ({ page }) => {
  await page.route(RECIPES, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: '[]',
    });
  });
  await page.goto('/');
  await expect(page.getByText('Nog geen recepten.')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: nl['overview.loading'] })).toHaveCount(0);
});

// No favourites table yet: the screen shows the empty state (T-017 adds fetching + loading).
test('favourites screen shows "Nog geen favorieten."', async ({ page }) => {
  await page.goto('/favorieten');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Favorieten');
  await expect(page.getByText('Nog geen favorieten.')).toBeVisible();
});

// Loading must not be confused with a connection error: with aborted requests there is no endless spinner.
test('with a failed request the loading indicator does not stay forever', async ({ page }) => {
  await page.route(supabaseRoutePattern(), (r) => r.abort());
  await page.goto('/');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: nl['overview.loading'] })).toHaveCount(0);
});
