import { expect, test, type Page, type Route } from '@playwright/test';
import nlJson from '../../src/i18n/nl.json' with { type: 'json' };
import { signInViaStorage } from '../helpers/session';
import {
  adminClient,
  assertSupabaseUp,
  createInvite,
  createTestUser,
  deleteTestUser,
  makeAdmin,
  type TestUser,
} from '../helpers/supabase-admin';

const nl = nlJson as Record<string, string>;
const LIST_INVITES = /\/rest\/v1\/rpc\/list_invites/;
const DAY_MS = 24 * 3600 * 1000;

let boss: TestUser;
let plain: TestUser;
let usedCode: string;
let expiredCode: string;
let openCode: string;

test.beforeAll(async () => {
  await assertSupabaseUp();
  boss = await createTestUser('invboss', { displayName: 'Bea Beheer' });
  await makeAdmin(boss.id);
  plain = await createTestUser('invplain');
  usedCode = boss.inviteCode; // already spent on Bea Beheer
  expiredCode = await createInvite({ createdAt: new Date(Date.now() - 8 * DAY_MS) });
  openCode = await createInvite();
});

test.afterAll(async () => {
  const admin = adminClient();
  await admin.from('invites').delete().in('code', [expiredCode, openCode].filter(Boolean));
  if (boss) await admin.from('invites').delete().eq('created_by', boss.id);
  for (const u of [boss, plain]) if (u) await deleteTestUser(u);
});

/** One row of the list, found by its code (the markup is free, the code text is not). */
const rowOf = (page: Page, code: string) => page.getByRole('listitem').filter({ hasText: code });

// R-017 crit. 1 (interface).
test.describe('administrator', () => {
  test.beforeEach(async ({ page }) => {
    await signInViaStorage(page, boss.session);
  });

  test('sees the link "Uitnodigingen" on Profiel and opens the screen (crit. 1)', async ({ page }) => {
    await page.goto('/profiel');
    const link = page.getByRole('link', { name: nl['profile.invitesLink'] });
    await expect(link).toBeVisible();
    await link.tap();
    await expect(page).toHaveURL(/\/uitnodigingen$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(nl['invites.title']);
  });

  test('keeps "Profiel" active in the navigation bar on /uitnodigingen (R-016 nav, T-004 plan 11)', async ({ page }) => {
    await page.goto('/uitnodigingen');
    const nav = page.getByRole('navigation', { name: nl['nav.label'] });
    await expect(nav.getByRole('link', { name: 'Profiel' })).toHaveAttribute('aria-current', 'page');
  });

  // crit. 2: status, user and expiry for prepared codes.
  test('shows "Gebruikt" with the user name, "Verlopen" and "Open" with an expiry (crit. 2)', async ({ page }) => {
    await page.goto('/uitnodigingen');
    const used = rowOf(page, usedCode);
    await expect(used).toContainText(nl['invites.status.used']);
    await expect(used).toContainText('Bea Beheer');
    await expect(used).toContainText(/\d{1,2} \w+ 2\d{3} om \d{1,2}:\d{2}/);

    const expired = rowOf(page, expiredCode);
    await expect(expired).toContainText(nl['invites.status.expired']);
    await expect(expired).not.toContainText(nl['invites.status.open']);

    const open = rowOf(page, openCode);
    await expect(open).toContainText(nl['invites.status.open']);
    await expect(open).toContainText(/\d{1,2} \w+ 2\d{3} om \d{1,2}:\d{2}/);
  });

  test('"Nieuwe code" adds a code at the top with "Open" and its expiry (crit. 2)', async ({ page }) => {
    await page.goto('/uitnodigingen');
    await expect(rowOf(page, openCode)).toBeVisible();
    const before = await page.getByRole('listitem').count();

    await page.getByRole('button', { name: nl['invites.new'] }).tap();
    await expect(page.getByRole('listitem')).toHaveCount(before + 1);

    // The new code is the newest invite created by this administrator.
    const made = await adminClient()
      .from('invites')
      .select('code,created_at')
      .eq('created_by', boss.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    expect(made.error).toBeNull();
    const code = made.data!.code as string;
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);

    const top = page.getByRole('listitem').first();
    await expect(top).toContainText(code);
    await expect(top).toContainText(nl['invites.status.open']);
    await expect(top).toContainText(/vervalt op \d{1,2} \w+ 2\d{3} om \d{1,2}:\d{2}/);

    // expiry = created_at + 7 days, in Brussels time
    const expiry = new Date(new Date(made.data!.created_at as string).getTime() + 7 * DAY_MS);
    const day = new Intl.DateTimeFormat('nl-BE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Brussels',
    }).format(expiry);
    await expect(top).toContainText(day);
  });

  test('"Kopieer" puts the code on the clipboard and says "Gekopieerd" (crit. 2)', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/uitnodigingen');
    const row = rowOf(page, openCode);
    await row.getByRole('button', { name: nl['invites.copy'] }).tap();
    await expect(row).toContainText(nl['invites.copied']);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(openCode);
  });

  test('shows a loading status while the list loads, then the list (crit. 2, ListState)', async ({ page }) => {
    let held: Route | undefined;
    let arrive: () => void = () => {};
    const arrived = new Promise<void>((r) => (arrive = r));
    await page.route(LIST_INVITES, (route) => {
      if (route.request().method() === 'POST' && !held) {
        held = route;
        arrive();
      } else {
        void route.continue();
      }
    });
    await page.goto('/uitnodigingen');
    await arrived;
    const status = page.getByRole('status').filter({ hasText: nl['invites.loading'] });
    await expect(status).toBeVisible();
    await expect(page.getByText(nl['invites.empty'])).toHaveCount(0);
    await held!.continue();
    await expect(status).toHaveCount(0);
    await expect(rowOf(page, openCode)).toBeVisible();
  });

  test('shows "Nog geen uitnodigingen." for an empty list (crit. 2, ListState)', async ({ page }) => {
    await page.route(LIST_INVITES, (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: '[]',
      });
    });
    await page.goto('/uitnodigingen');
    await expect(page.getByText('Nog geen uitnodigingen.')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: nl['invites.loading'] })).toHaveCount(0);
  });

  // Review T-004 finding 1: a non-connection error must never leave the only admin screen silent.
  const fail500 = (route: Route) =>
    route.request().method() !== 'POST'
      ? route.continue()
      : route.fulfill({
          status: 500,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ code: 'XX000', message: 'boom', details: null, hint: null }),
        });

  test('shows an error alert when loading the list fails with a 500 (crit. 2, no silent failure)', async ({ page }) => {
    await page.route(LIST_INVITES, fail500);
    await page.goto('/uitnodigingen');
    await expect(page.getByRole('alert').filter({ hasText: nl['invites.error'] })).toBeVisible();
  });

  test('shows an error alert when "Nieuwe code" fails with a 500 and adds no code (crit. 2)', async ({ page }) => {
    await page.goto('/uitnodigingen');
    await expect(rowOf(page, openCode)).toBeVisible();
    const before = await page.getByRole('listitem').count();
    await page.route(/\/rest\/v1\/rpc\/create_invite/, fail500);
    await page.getByRole('button', { name: nl['invites.new'] }).tap();
    await expect(page.getByRole('alert').filter({ hasText: nl['invites.error'] })).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(before);
    await expect(page.getByRole('button', { name: nl['invites.new'] })).toBeEnabled();
  });
});

// R-017 crit. 1: a normal user sees nothing and is sent away.
test.describe('normal user', () => {
  test.beforeEach(async ({ page }) => {
    await signInViaStorage(page, plain.session);
  });

  test('does not see the link "Uitnodigingen" on Profiel (crit. 1)', async ({ page }) => {
    await page.goto('/profiel');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Profiel');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: nl['profile.invitesLink'] })).toHaveCount(0);
  });

  test('opening /uitnodigingen directly lands on /profiel and shows no code (crit. 1)', async ({ page }) => {
    await page.goto('/uitnodigingen');
    await expect(page).toHaveURL(/\/profiel$/);
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').innerText();
    expect(body).not.toContain(openCode);
    expect(body).not.toContain(expiredCode);
    expect(body).not.toContain(usedCode);
    await expect(page.getByRole('button', { name: nl['invites.new'] })).toHaveCount(0);
  });
});
