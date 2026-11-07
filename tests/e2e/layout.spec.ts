import { expect, test, type Page } from '@playwright/test';
import { signInForRoute, signInViaStorage, supabaseRoutePattern } from '../helpers/session';
import { assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, makeAdmin, type TestUser } from '../helpers/supabase-admin';
import { prepareRoutes, routes } from './routes';

// Long unbroken title (100 chars = the title limit): would overflow 360 px without overflow-wrap.
const LONG_TITLE = 'Superlangeaaneengeschrevenrecepttitelzonderspaties'.repeat(2);

let user: TestUser;
let unnamed: TestUser;
let admin: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('layout');
  unnamed = await createTestUser('layoutnn', { displayName: null });
  admin = await createTestUser('layoutadm');
  await makeAdmin(admin.id);
  await insertRecipe(user.client, { title: LONG_TITLE });
  await prepareRoutes(user.client); // recipe for /recept/:id and /recept/:id/bewerken
});

test.afterAll(async () => {
  if (user) await deleteTestUser(user);
  if (unnamed) await deleteTestUser(unnamed);
  if (admin) await deleteTestUser(admin);
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

// T-018 / R-023 crit. 9, R-026 crit. 8: French texts are longer; every `button`, link and [role=button] must show its whole text.
async function expectNoClippedText(page: Page) {
  const clipped = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, a[href], [role=button]'))) {
      if (el.getClientRects().length === 0) continue;
      const style = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1) out.push(`scrollWidth ${el.scrollWidth} > ${el.clientWidth}: ${(el.textContent ?? '').trim().slice(0, 40)}`);
      if (style.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth) out.push(`ellipsis: ${(el.textContent ?? '').trim().slice(0, 40)}`);
    }
    return out;
  });
  expect(clipped, 'clipped button or link text').toEqual([]);
}

for (const lang of ['nl', 'fr'] as const) {
for (const route of routes) {
  test.describe(`scherm ${route.name} [${lang}]` /* no route.path: it changes after beforeAll (prepareRoutes) */, () => {
    test.beforeEach(async ({ page }) => {
      await signInForRoute(page, route.auth, { full: user.session, unnamed: unnamed.session, admin: admin.session });
      await page.addInitScript((l) => window.localStorage.setItem('smaakmaker.lang', l), lang);
    });

    test('no clipped button text (R-023 crit. 9)', async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expectNoClippedText(page);
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
}
