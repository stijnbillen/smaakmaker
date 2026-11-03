import { expect, test, type Page } from '@playwright/test';
import { countMails, waitForMail } from '../helpers/mailpit';
import { backdateCodes } from '../helpers/pg';
import { signInViaStorage, storageKey } from '../helpers/session';
import {
  adminClient,
  assertSupabaseUp,
  createInvite,
  createTestUser,
  deleteTestUser,
  insertRecipe,
  uniqueEmail,
  type TestUser,
} from '../helpers/supabase-admin';

// T-003 / R-002 interface tests. Mails come from the local Mailpit (supabase start).
const NOT_VALID = 'Deze code is niet geldig.';
const REQUEST_BUTTON = 'Stuur mij een code';

let named: TestUser;
let unnamed: TestUser;
const extraUsers: TestUser[] = [];

test.beforeAll(async () => {
  await assertSupabaseUp();
  named = await createTestUser('auth', { displayName: 'Annemie' });
  unnamed = await createTestUser('authnn', { displayName: null });
});

test.afterAll(async () => {
  for (const u of [named, unnamed, ...extraUsers]) if (u) await deleteTestUser(u);
});

const emailField = (page: Page) => page.getByLabel('E-mailadres');
const inviteField = (page: Page) => page.getByLabel('Uitnodigingscode', { exact: true });
const mailCodeField = (page: Page) => page.getByLabel('Code uit de e-mail');

/** Opens the "new account" mode: either a switch/tab or the field is already there. */
async function openInviteMode(page: Page) {
  if (await inviteField(page).isVisible()) return;
  const toggle = page
    .getByRole('switch', { name: /uitnodigingscode|nieuw account/i })
    .or(page.getByRole('checkbox', { name: /uitnodigingscode|nieuw account/i }))
    .or(page.getByRole('tab', { name: /nieuw account/i }))
    .or(page.getByRole('radio', { name: /nieuw account/i }))
    .or(page.getByRole('button', { name: /uitnodigingscode|nieuw account/i }));
  await toggle.first().click();
  await expect(inviteField(page)).toBeVisible();
}

async function requestCode(page: Page, email: string) {
  await emailField(page).fill(email);
  await page.getByRole('button', { name: REQUEST_BUTTON }).click();
  await expect(mailCodeField(page)).toBeVisible();
}

async function submitMailCode(page: Page, code: string) {
  await mailCodeField(page).fill(code);
  await page.getByRole('button', { name: 'Aanmelden', exact: true }).click();
}

async function storedSession(page: Page): Promise<string | null> {
  return page.evaluate((k) => window.localStorage.getItem(k), storageKey());
}

test.describe('geen account zonder geldige code (crit. 1)', () => {
  test('a made-up code and a used code give "Deze code is niet geldig." and send no mail', async ({ page }) => {
    await page.goto('/aanmelden');
    await openInviteMode(page);

    for (const code of ['VERZONNEN12345', named.inviteCode]) {
      const email = uniqueEmail('geenmail');
      await emailField(page).fill(email);
      await inviteField(page).fill(code);
      await page.getByRole('button', { name: REQUEST_BUTTON }).click();
      await expect(page.getByText(NOT_VALID)).toBeVisible();
      await expect(inviteField(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(mailCodeField(page)).toHaveCount(0);
      expect(await countMails(email), `no mail for code ${code}`).toBe(0);
    }
  });
});

test.describe('ongeldig e-mailadres (crit. 4)', () => {
  test('"piet@" shows a message at the field and sends no request to /auth/v1/otp', async ({ page }) => {
    const otpRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/auth/v1/otp')) otpRequests.push(r.url());
    });
    await page.goto('/aanmelden');
    await emailField(page).fill('piet@');
    await page.getByRole('button', { name: REQUEST_BUTTON }).click();

    const field = emailField(page);
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await field.getAttribute('aria-describedby');
    expect(describedBy, 'field must point to its message').toBeTruthy();
    await expect(page.locator(`#${describedBy!.split(/\s+/)[0]}`)).toHaveText('Vul een geldig e-mailadres in.');
    expect(otpRequests).toEqual([]);
  });
});

test.describe('zonder aanmelding naar het aanmeldscherm (crit. 5)', () => {
  for (const path of ['/', '/nieuw', '/favorieten', '/profiel']) {
    test(`${path} without a session redirects to /aanmelden`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/aanmelden$/);
    });
  }
});

test.describe('naam kiezen bij het eerste aanmelden (crit. 3)', () => {
  test('new user lands on /welkom; 1 and 41 characters are refused, 2 gets to "Recepten"', async ({ page }) => {
    await signInViaStorage(page, unnamed.session);
    await page.goto('/');
    await expect(page).toHaveURL(/\/welkom$/);

    const name = page.getByLabel('Weergavenaam');
    const next = page.getByRole('button', { name: 'Verder' });
    for (const bad of ['a', 'a'.repeat(41)]) {
      await name.fill(bad);
      await next.click();
      await expect(page.getByText('Je naam moet 2 tot 40 tekens hebben.')).toBeVisible();
      await expect(name).toHaveAttribute('aria-invalid', 'true');
      await expect(page).toHaveURL(/\/welkom$/);
    }
    await name.fill('ab');
    await next.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Recepten' })).toBeVisible();
  });

  test('a user who already has a name does not see /welkom', async ({ page }) => {
    await signInViaStorage(page, named.session);
    await page.goto('/welkom');
    await expect(page).not.toHaveURL(/\/welkom/);
    await expect(page.getByRole('heading', { level: 1, name: 'Recepten' })).toBeVisible();
  });
});

test.describe('aanmelden met de code uit de e-mail (crit. 6)', () => {
  test('the code field is made for one-time codes on a phone', async ({ page }) => {
    await page.goto('/aanmelden');
    await requestCode(page, named.email);
    await expect(mailCodeField(page)).toHaveAttribute('inputmode', 'numeric');
    await expect(mailCodeField(page)).toHaveAttribute('autocomplete', 'one-time-code');
  });

  test('the right code signs in and leads to "Recepten"', async ({ page }) => {
    await page.goto('/aanmelden');
    const sent = Date.now();
    await requestCode(page, named.email);
    const mail = await waitForMail(named.email, { sinceMs: sent });
    await submitMailCode(page, mail.codes[0]);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Recepten' })).toBeVisible();
  });

  test('a user without a name goes to /welkom after the code', async ({ page }) => {
    // Own user: the shared `unnamed` gets a name in the /welkom test, which would make this order-dependent.
    const fresh = await createTestUser('authnn2', { displayName: null });
    extraUsers.push(fresh);
    await page.goto('/aanmelden');
    const sent = Date.now();
    await requestCode(page, fresh.email);
    const mail = await waitForMail(fresh.email, { sinceMs: sent });
    await submitMailCode(page, mail.codes[0]);
    await expect(page).toHaveURL(/\/welkom$/);
  });

  test('a wrong code gives "Deze code is niet geldig.", no session, stays on /aanmelden', async ({ page }) => {
    await page.goto('/aanmelden');
    const sent = Date.now();
    await requestCode(page, named.email);
    const good = (await waitForMail(named.email, { sinceMs: sent })).codes[0];
    const wrong = good.slice(0, 5) + String((Number(good[5]) + 1) % 10);
    await submitMailCode(page, wrong);
    await expect(page.getByText(NOT_VALID)).toBeVisible();
    await expect(page).toHaveURL(/\/aanmelden$/);
    expect(await storedSession(page)).toBeNull();
  });

  test('an expired code gives "Deze code is niet geldig." and does not sign in', async ({ page }) => {
    await page.goto('/aanmelden');
    const sent = Date.now();
    await requestCode(page, named.email);
    const good = (await waitForMail(named.email, { sinceMs: sent })).codes[0];
    await backdateCodes(named.email);
    await submitMailCode(page, good);
    await expect(page.getByText(NOT_VALID)).toBeVisible();
    await expect(page).toHaveURL(/\/aanmelden$/);
    expect(await storedSession(page)).toBeNull();
  });

  test('a new account with a valid invite code and the code from the mail signs in', async ({ page }) => {
    const invite = await createInvite();
    const email = uniqueEmail('nieuw');
    await page.goto('/aanmelden');
    await openInviteMode(page);
    await inviteField(page).fill(invite);
    const sent = Date.now();
    await requestCode(page, email);
    const mail = await waitForMail(email, { sinceMs: sent });
    await submitMailCode(page, mail.codes[0]);
    await expect(page).toHaveURL(/\/welkom$/); // brand-new user has no name yet
    // clean up through the test helper's service client
    const admin = adminClient();
    const id = (await page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) ?? '{}').user?.id, storageKey())) as
      | string
      | undefined;
    if (id) await admin.auth.admin.deleteUser(id);
    await admin.from('invites').delete().eq('code', invite);
  });

  test('the login link from the mail signs in inside a new browser context', async ({ page, browser }) => {
    await page.goto('/aanmelden');
    const sent = Date.now();
    await requestCode(page, named.email);
    const mail = await waitForMail(named.email, { sinceMs: sent });
    expect(mail.link).not.toBeNull();

    const other = await browser.newContext({ viewport: { width: 360, height: 640 } });
    try {
      const otherPage = await other.newPage();
      await otherPage.goto(mail.link!);
      await expect(otherPage.getByRole('heading', { level: 1, name: 'Recepten' })).toBeVisible();
      expect(await storedSession(otherPage)).not.toBeNull();
    } finally {
      await other.close();
    }
  });
});

test.describe('afmelden (crit. 7)', () => {
  test('Profiel > Afmelden leads to /aanmelden, clears the session and stays signed out', async ({ page }) => {
    // Seed the session once (not on every navigation), so a reload cannot bring it back.
    await page.goto('/aanmelden');
    await page.evaluate(
      ([k, v]) => window.localStorage.setItem(k, v),
      [storageKey(), JSON.stringify(named.session)] as [string, string],
    );
    await page.goto('/profiel');
    await expect(page.getByRole('heading', { level: 1, name: 'Profiel' })).toBeVisible();
    await expect(page.getByText('Annemie')).toBeVisible(); // profile shows the display name

    await page.getByRole('button', { name: 'Afmelden' }).click();
    await expect(page).toHaveURL(/\/aanmelden$/);
    expect(await storedSession(page)).toBeNull();

    await page.goto('/');
    await expect(page).toHaveURL(/\/aanmelden$/);
  });
});

test.describe('auteur en datum bij een recept (crit. 8)', () => {
  test.use({ timezoneId: 'Europe/Brussels' });

  test('user B sees "Annemie" and the Dutch date next to A\'s recipe', async ({ page }) => {
    const a = await createTestUser('auteur', { displayName: 'Annemie' });
    const b = await createTestUser('lezer', { displayName: 'Bart' });
    extraUsers.push(a, b);
    const title = `Auteurtest ${Date.now()}`;
    const ins = { data: await insertRecipe(a.client, { title }) };
    const date = new Intl.DateTimeFormat('nl-BE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Brussels',
    }).format(new Date(ins.data!.created_at as string));

    await signInViaStorage(page, b.session);
    await page.goto('/');
    const row = page.locator('li, article').filter({ hasText: title });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Annemie');
    await expect(row).toContainText(date);
  });
});
