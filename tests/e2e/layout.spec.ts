import { expect, test, type Page } from '@playwright/test';
import { signInViaStorage, supabaseRoutePattern } from '../helpers/session';
import { assertSupabaseUp, createTestUser, deleteTestUser, type TestUser } from '../helpers/supabase-admin';
import { routes } from './routes';

// Long unbroken title: would overflow 360 px without overflow-wrap.
const LONG_TITLE = 'Superlangeaaneengeschrevenrecepttitelzonderspaties'.repeat(3);

let user: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('layout');
  const ins = await user.client.from('recipes').insert({ title: LONG_TITLE });
  if (ins.error) throw ins.error;
});

test.afterAll(async () => {
  if (user) await deleteTestUser(user);
});

const VIEWPORT_WIDTH = 360;

// Compares with the fixed width, not window.innerWidth: mobile emulation shrinks to fit
// wide content, which would make innerWidth grow along with scrollWidth.
async function measureOverflow(page: Page) {
  return page.evaluate((max) => {
    const root = document.documentElement;
    const wide: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > max + 0.5) wide.push(`${el.tagName.toLowerCase()} right=${Math.round(r.right)}`);
    }
    return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, wide };
  }, VIEWPORT_WIDTH);
}

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth, wide } = await measureOverflow(page);
  expect(scrollWidth, 'scrollWidth').toBeLessThanOrEqual(VIEWPORT_WIDTH);
  expect(clientWidth, 'clientWidth').toBeLessThanOrEqual(VIEWPORT_WIDTH);
  expect(wide, 'elements sticking out past 360 px').toEqual([]);
}

async function expectTapTargets(page: Page) {
  const selector =
    'button, a[href], [role=button], input[type=checkbox], input[type=radio], [data-tap-target]';
  const small: string[] = [];
  for (const el of await page.locator(selector).all()) {
    if (!(await el.isVisible())) continue;
    const box = await el.boundingBox();
    if (!box) continue;
    if (box.width < 44 || box.height < 44) {
      const label = (await el.evaluate((n) => n.outerHTML)).slice(0, 80);
      small.push(`${Math.round(box.width)}x${Math.round(box.height)} ${label}`);
    }
  }
  expect(small, 'tap targets smaller than 44x44').toEqual([]);
}

// Proves the overflow check can fail (R-001 crit. 4): a 500 px wide element must be caught.
test('overflow check detects a 500 px wide element (R-001 crit. 4, negative control)', async ({ page }) => {
  await signInViaStorage(page, user.session);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.style.cssText = 'width:500px;height:20px;';
    document.body.appendChild(el);
  });
  const { wide } = await measureOverflow(page);
  expect(wide.length).toBeGreaterThan(0);
  await expect(expectNoHorizontalScroll(page)).rejects.toThrow();
});

for (const route of routes) {
  test.describe(`scherm ${route.name} (${route.path})`, () => {
    test.beforeEach(async ({ page }) => {
      await signInViaStorage(page, user.session);
    });

    test('no horizontal scroll at 360 px (R-001 crit. 4)', async ({ page }) => {
      expect(page.viewportSize()?.width).toBe(360);
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalScroll(page);
    });

    test('tap targets at least 44x44 (R-001 crit. 5)', async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      await expectTapTargets(page);
    });

    test('connection error state: no horizontal scroll, retry button big enough (crit. 4, 5, 6)', async ({ page }) => {
      await page.route(supabaseRoutePattern(), (r) => r.abort());
      await page.goto(route.path);
      // Only screens that talk to the database at load show the banner; on others, trigger nothing.
      const banner = page.getByRole('alert');
      if (route.path === '/') await expect(banner).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectTapTargets(page);
    });
  });
}
