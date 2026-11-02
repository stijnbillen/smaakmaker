import { expect, test } from '@playwright/test';
import { signInViaStorage } from '../helpers/session';
import { assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, type TestUser } from '../helpers/supabase-admin';

let a: TestUser;
let b: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  a = await createTestUser('ea');
  b = await createTestUser('eb');
});

test.afterAll(async () => {
  if (a) await deleteTestUser(a);
  if (b) await deleteTestUser(b);
});

// T-001 criterion 3 (interface level)
test('recipe added by A shows for B after reload, not hidden by a cache (R-001 crit. 3)', async ({ page }) => {
  const title = `Vers van A ${Date.now()}`;
  await signInViaStorage(page, b.session);
  // Wait until the first load finished, so "not there yet" is a real observation.
  const firstLoad = page.waitForResponse((r) => r.url().includes('/rest/v1/recipes'));
  await page.goto('/');
  expect((await firstLoad).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Recepten' })).toBeVisible();
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) await navigator.serviceWorker.ready;
  });
  await expect(page.getByText(title)).toHaveCount(0);

  await insertRecipe(a.client, { title });

  const recipesRequest = page.waitForRequest((r) => r.url().includes('/rest/v1/recipes'));
  await page.reload();
  const req = await recipesRequest;
  const res = await req.response();
  expect(res?.status()).toBe(200);
  expect(res?.fromServiceWorker(), 'answer must come from the network, not the service worker').toBe(false);
  await expect(page.getByText(title)).toBeVisible();
});

test('service worker does not cache Supabase responses (R-001 crit. 3)', async ({ page }) => {
  await signInViaStorage(page, b.session);
  await page.goto('/');
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForLoadState('networkidle');

  const cachedUrls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) urls.push(req.url);
    }
    return urls;
  });
  expect(cachedUrls.filter((u) => u.includes('/rest/v1/') || u.includes('/auth/v1/'))).toEqual([]);
});
