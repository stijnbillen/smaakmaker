import { expect, test, type Page } from '@playwright/test';
import { signInForRoute, signInViaStorage, supabaseRoutePattern } from '../helpers/session';
import { assertSupabaseUp, createTestUser, deleteTestUser, makeAdmin, type TestUser } from '../helpers/supabase-admin';
import { routes } from './routes';

let user: TestUser;
let unnamed: TestUser;
let admin: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('a11y');
  unnamed = await createTestUser('a11ynn', { displayName: null });
  admin = await createTestUser('a11yadm');
  await makeAdmin(admin.id);
  const ins = await user.client.from('recipes').insert({ title: 'A11y testrecept' });
  if (ins.error) throw ins.error;
});

test.afterAll(async () => {
  if (user) await deleteTestUser(user);
  if (unnamed) await deleteTestUser(unnamed);
  if (admin) await deleteTestUser(admin);
});

const INTERACTIVE =
  'button, a[href], [role=button], input:not([type=hidden]), select, textarea';
const MAX_TABS = 80;

/** R-016 crit. 4: every visible field has a visible, non-empty label. aria-label alone does not count. */
async function fieldsWithoutVisibleLabel(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    const fields = Array.from(document.querySelectorAll('input, select, textarea')) as HTMLInputElement[];
    for (const el of fields) {
      if (el.type === 'hidden') continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if ((r.width === 0 && r.height === 0) || cs.display === 'none' || cs.visibility === 'hidden') continue;
      const labels = Array.from(el.labels ?? []);
      const ok = labels.some((l) => {
        const lr = l.getBoundingClientRect();
        const lcs = getComputedStyle(l);
        return (
          lr.width > 0 && lr.height > 0 && lcs.visibility !== 'hidden' && lcs.display !== 'none' &&
          (l.textContent ?? '').trim().length > 0
        );
      });
      if (!ok) bad.push(el.outerHTML.slice(0, 80));
    }
    return bad;
  });
}

/**
 * R-016 crit. 4: tab through the page; every focused element must look different when focused
 * (outline >= 2px, or a different box-shadow). Every interactive element must be reached.
 */
async function focusProblems(page: Page): Promise<string[]> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const problems: string[] = [];
  const focusedStyles: Record<string, { outline: string; shadow: string }> = {};
  let firstKey: string | null = null;
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      if (!el.dataset.tabKey) el.dataset.tabKey = `k${document.querySelectorAll('[data-tab-key]').length}`;
      const cs = getComputedStyle(el);
      return {
        key: el.dataset.tabKey,
        label: el.outerHTML.slice(0, 80),
        outline: `${cs.outlineStyle}|${cs.outlineWidth}`,
        shadow: cs.boxShadow,
      };
    });
    if (!info) continue;
    if (firstKey === null) firstKey = info.key;
    else if (info.key === firstKey) break;
    focusedStyles[info.key] = { outline: info.outline, shadow: info.shadow };
  }
  // Baseline: same elements without focus.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const baseline = await page.evaluate(() => {
    const out: Record<string, { outline: string; shadow: string; label: string }> = {};
    for (const el of Array.from(document.querySelectorAll('[data-tab-key]')) as HTMLElement[]) {
      const cs = getComputedStyle(el);
      out[el.dataset.tabKey as string] = {
        outline: `${cs.outlineStyle}|${cs.outlineWidth}`,
        shadow: cs.boxShadow,
        label: el.outerHTML.slice(0, 80),
      };
    }
    return out;
  });
  for (const [key, focused] of Object.entries(focusedStyles)) {
    const base = baseline[key];
    const [style, width] = focused.outline.split('|');
    const outlineVisible = style !== 'none' && parseFloat(width) >= 2;
    const shadowChanged = focused.shadow !== base.shadow;
    if (!outlineVisible && !shadowChanged) problems.push(`no visible focus: ${base.label}`);
  }
  // Coverage: every visible, enabled interactive element must have been reached.
  const unreached = await page.evaluate((sel) => {
    return (Array.from(document.querySelectorAll(sel)) as HTMLElement[])
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return (
          (r.width > 0 || r.height > 0) && cs.visibility !== 'hidden' && cs.display !== 'none' &&
          !(el as HTMLButtonElement).disabled && el.getAttribute('tabindex') !== '-1'
        );
      })
      .filter((el) => !el.dataset.tabKey)
      .map((el) => el.outerHTML.slice(0, 80));
  }, INTERACTIVE);
  for (const u of unreached) problems.push(`not reached with Tab: ${u}`);
  return problems;
}

test('focus check detects a button with outline: none (R-016 crit. 4, negative control)', async ({ page }) => {
  await signInViaStorage(page, user.session);
  await page.goto('/favorieten');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.textContent = 'Zonder focusring';
    b.id = 'no-ring';
    document.body.insertBefore(b, document.body.firstChild);
  });
  await page.addStyleTag({ content: '#no-ring, #no-ring:focus, #no-ring:focus-visible { outline: none !important; box-shadow: none !important; }' });
  const problems = await focusProblems(page);
  expect(problems.some((p) => p.includes('no-ring'))).toBe(true);
});

test('label check detects an input without visible label (R-016 crit. 4, negative control)', async ({ page }) => {
  await signInViaStorage(page, user.session);
  await page.goto('/favorieten');
  await page.evaluate(() => {
    const i = document.createElement('input');
    i.setAttribute('aria-label', 'alleen aria');
    document.body.appendChild(i);
  });
  expect((await fieldsWithoutVisibleLabel(page)).length).toBeGreaterThan(0);
});

for (const route of routes) {
  test.describe(`toegankelijkheid op ${route.name} (${route.path})`, () => {
    test.beforeEach(async ({ page }) => {
      await signInForRoute(page, route.auth, { full: user.session, unnamed: unnamed.session, admin: admin.session });
    });

    test('every input has a visible label (R-016 crit. 4)', async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      expect(await fieldsWithoutVisibleLabel(page)).toEqual([]);
    });

    test('every interactive element is reachable by Tab and shows visible focus (R-016 crit. 4)', async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      expect(await focusProblems(page)).toEqual([]);
    });

    test('with reduced motion nothing animates (R-016 crit. 5)', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      // Hover/focus a nav link so state transitions are included too.
      await page.keyboard.press('Tab');
      const moving = await page.evaluate(() => {
        const toSeconds = (list: string) =>
          list.split(',').map((s) => {
            const v = parseFloat(s);
            return s.trim().endsWith('ms') ? v / 1000 : v;
          });
        const bad: string[] = [];
        const els = [document.documentElement, ...Array.from(document.body.querySelectorAll('*'))];
        for (const el of els) {
          for (const pseudo of [null, '::before', '::after']) {
            const cs = getComputedStyle(el, pseudo);
            const animOk =
              cs.animationName === 'none' || toSeconds(cs.animationDuration).every((d) => d <= 0.00001);
            const transOk = toSeconds(cs.transitionDuration).every((d) => d <= 0.00001);
            if (!animOk || !transOk) {
              bad.push(`${el.tagName.toLowerCase()}${pseudo ?? ''} anim=${cs.animationName}/${cs.animationDuration} trans=${cs.transitionDuration}`);
            }
          }
        }
        return bad;
      });
      expect(moving).toEqual([]);
    });

    test('without reduced motion something does animate (control for the reduced-motion test)', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      await page.keyboard.press('Tab');
      const count = await page.evaluate(() => {
        const toSeconds = (list: string) => list.split(',').map((s) => (s.trim().endsWith('ms') ? parseFloat(s) / 1000 : parseFloat(s)));
        let n = 0;
        for (const el of [document.documentElement, ...Array.from(document.body.querySelectorAll('*'))]) {
          for (const pseudo of [null, '::before', '::after']) {
            const cs = getComputedStyle(el, pseudo);
            if (cs.animationName !== 'none' || toSeconds(cs.transitionDuration).some((d) => d > 0.00001)) n++;
          }
        }
        return n;
      });
      expect(count, 'at least one element should have a transition or animation').toBeGreaterThan(0);
    });
  });
}

test('connection banner: retry button has visible focus too (R-016 crit. 4)', async ({ page }) => {
  await signInViaStorage(page, user.session);
  await page.route(supabaseRoutePattern(), (r) => r.abort());
  await page.goto('/');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Opnieuw proberen' })).toBeVisible();
  expect(await focusProblems(page)).toEqual([]);
});
