import { expect, test, type Page } from '@playwright/test';
import nlJson from '../../src/i18n/nl.json' with { type: 'json' };
import { signInForRoute, signInViaStorage } from '../helpers/session';
import { assertSupabaseUp, createTestUser, deleteTestUser, makeAdmin, type TestUser } from '../helpers/supabase-admin';
import { routesWithNav as routes } from './routes'; // sign-in and welcome screens have no navigation bar

const nl = nlJson as Record<string, string>;

// R-016 crit. 1: four entries, in this order, with the texts from nl.json.
const ENTRIES = [
  { text: 'Recepten', path: '/', h1: 'Recepten' },
  { text: 'Favorieten', path: '/favorieten', h1: 'Favorieten' },
  { text: 'Nieuw', path: '/nieuw', h1: 'Nieuw recept' },
  { text: 'Profiel', path: '/profiel', h1: 'Profiel' },
];

let user: TestUser;
let admin: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('nav');
  admin = await createTestUser('navadm');
  await makeAdmin(admin.id);
  // Many recipes so the overview is long enough to scroll.
  const rows = Array.from({ length: 40 }, (_, i) => ({ title: `Navigatietest recept ${i + 1}` }));
  const ins = await user.client.from('recipes').insert(rows);
  if (ins.error) throw ins.error;
});

test.afterAll(async () => {
  if (user) await deleteTestUser(user);
  if (admin) await deleteTestUser(admin);
});

test.beforeEach(async ({ page }) => {
  await signInViaStorage(page, user.session);
});

function navOf(page: Page) {
  return page.getByRole('navigation', { name: nl['nav.label'] });
}

for (const route of routes) {
  test.describe(`navigatiebalk op ${route.name} (${route.path})`, () => {
    test.beforeEach(async ({ page }) => {
      // Runs after the default sign-in, so the admin session wins on admin-only screens (T-004).
      if (route.auth === 'admin') {
        await signInForRoute(page, 'admin', { full: user.session, unnamed: user.session, admin: admin.session });
      }
    });

    test('exactly one nav with the accessible name from nl.json, four links in order (crit. 1)', async ({ page }) => {
      await page.goto(route.path);
      await expect(page.getByRole('navigation')).toHaveCount(1);
      expect(nl['nav.label']?.length ?? 0).toBeGreaterThan(0);
      const nav = navOf(page);
      await expect(nav).toHaveCount(1);
      const links = nav.getByRole('link');
      await expect(links).toHaveCount(4);
      await expect(links).toHaveText(ENTRIES.map((e) => e.text));
    });

    test('bar sits at the bottom of the viewport, also after scrolling (crit. 1)', async ({ page }) => {
      await page.goto(route.path);
      const nav = navOf(page);
      await expect(nav).toBeVisible();
      const height = page.viewportSize()!.height;
      const bottom = async () => {
        const box = await nav.boundingBox();
        return box!.y + box!.height;
      };
      expect(Math.abs((await bottom()) - height)).toBeLessThanOrEqual(1);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      expect(Math.abs((await bottom()) - height)).toBeLessThanOrEqual(1);
    });

    test('bar does not cover content at the end of the page (crit. 1)', async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const { contentBottom, navTop } = await page.evaluate(() => {
        const nav = document.querySelector('nav') as HTMLElement;
        let max = 0;
        for (const el of Array.from(document.body.querySelectorAll('*'))) {
          if (nav.contains(el) || el.contains(nav)) continue;
          if (['SCRIPT', 'STYLE', 'LINK', 'META'].includes(el.tagName)) continue;
          const cs = getComputedStyle(el);
          if (cs.position === 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          max = Math.max(max, r.bottom);
        }
        return { contentBottom: max, navTop: nav.getBoundingClientRect().top };
      });
      expect(contentBottom).toBeLessThanOrEqual(navTop + 1);
    });
  });
}

test('long overview: bar keeps its place after scrolling to the bottom (crit. 1)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Navigatietest recept 1', { exact: true })).toBeVisible();
  const scrollable = await page.evaluate(() => document.body.scrollHeight > window.innerHeight);
  expect(scrollable, 'overview must be scrollable for this test to mean something').toBe(true);
  const nav = navOf(page);
  const before = await nav.boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const after = await nav.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
});

test('aria-current="page" is on the link of the current screen only (crit. 1)', async ({ page }) => {
  for (const entry of ENTRIES) {
    await page.goto(entry.path);
    const links = navOf(page).getByRole('link');
    await expect(links).toHaveCount(4);
    for (const other of ENTRIES) {
      const link = links.filter({ hasText: other.text });
      if (other === entry) await expect(link, `${entry.path}: ${other.text}`).toHaveAttribute('aria-current', 'page');
      else await expect(link, `${entry.path}: ${other.text}`).not.toHaveAttribute('aria-current', /.+/);
    }
  }
});

test('tapping a link opens its screen (URL and h1) (crit. 1)', async ({ page }) => {
  await page.goto('/');
  for (const entry of ENTRIES.slice(1)) {
    await navOf(page).getByRole('link', { name: entry.text }).tap();
    await expect(page).toHaveURL(new RegExp(`${entry.path}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(entry.h1);
  }
  await navOf(page).getByRole('link', { name: 'Recepten' }).tap();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recepten');
});

// "Na het aanmelden": no sign-in screen yet (T-003). Session is set and the start URL opened.
// TODO T-003: add a test for the real flow (after sign-in the user lands on "/").
test('start URL after a session is set: "Recepten" is active (crit. 1)', async ({ page }) => {
  await page.goto('/');
  await expect(navOf(page).getByRole('link', { name: 'Recepten' })).toHaveAttribute('aria-current', 'page');
});
