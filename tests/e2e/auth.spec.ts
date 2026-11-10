import { expect, test, type Page } from '@playwright/test';
import { waitForMail } from '../helpers/mailpit';
import { backdateCodes } from '../helpers/pg';
import { seedLanguage, signInViaStorage, storageKey } from '../helpers/session';
import fr from '../../src/i18n/fr.json' with { type: 'json' };
import nl from '../../src/i18n/nl.json' with { type: 'json' };
import { userIdByEmail } from '../helpers/pg';
import {
  adminClient,
  assertSupabaseUp,
  createTestUser,
  deleteInvitations,
  deleteTestUser,
  insertRecipe,
  inviteRpc,
  makeAdmin,
  requestInviteMail,
  setInvitationSentAt,
  uniqueEmail,
  type TestUser,
} from '../helpers/supabase-admin';

// T-003 / R-002 interface tests: signing in needs only an e-mail address (T-028: no invitation code on the screen).
// Mails come from the local Mailpit (supabase start).
const NOT_VALID = 'Deze code is niet geldig.';
const REQUEST_BUTTON = 'Stuur mij een code';
const TEXTS = { nl, fr } as Record<'nl' | 'fr', Record<string, string>>;

let named: TestUser;
let unnamed: TestUser;
let boss: TestUser;
const extraUsers: TestUser[] = [];
const invitedEmails: string[] = [];

test.beforeAll(async () => {
  await assertSupabaseUp();
  named = await createTestUser('auth', { displayName: 'Annemie' });
  unnamed = await createTestUser('authnn', { displayName: null });
  boss = await createTestUser('authboss', { displayName: 'Beheerder' });
  await makeAdmin(boss.id);
});

test.afterAll(async () => {
  for (const u of [named, unnamed, boss, ...extraUsers]) if (u) await deleteTestUser(u);
  for (const e of invitedEmails) {
    const id = await userIdByEmail(e);
    if (id) await adminClient().auth.admin.deleteUser(id);
  }
  await deleteInvitations(invitedEmails);
});

const emailField = (page: Page) => page.getByLabel('E-mailadres');
const mailCodeField = (page: Page) => page.getByLabel('Code uit de e-mail');

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

test.describe('ongeldig adres vraagt de databank niet (T-028, crit. 5)', () => {
  test('"piet@" sends no request to rpc/sign_in_status and none to /auth/v1/otp', async ({ page }) => {
    const seen: string[] = [];
    page.on('request', (r) => {
      if (/rpc\/sign_in_status|\/auth\/v1\/otp/.test(r.url())) seen.push(r.url());
    });
    await page.goto('/aanmelden');
    await emailField(page).fill('piet@');
    await page.getByRole('button', { name: REQUEST_BUTTON }).click();
    await expect(emailField(page)).toHaveAttribute('aria-invalid', 'true');
    expect(seen).toEqual([]);
  });
});

test.describe('geen veld of knop voor een uitnodigingscode (T-028, crit. 1)', () => {
  for (const lang of ['nl', 'fr'] as const) {
    test(`/aanmelden in ${lang}: one text field and the request button, nothing about a code`, async ({ page }) => {
      const T = TEXTS[lang];
      await seedLanguage(page, lang);
      await page.goto('/aanmelden');
      await expect(page.getByRole('textbox')).toHaveCount(1);
      await expect(page.getByRole('textbox', { name: T['auth.emailLabel'], exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: T['auth.requestCode'], exact: true })).toBeVisible();
      // the old texts are gone from both files, so look for their wording as well
      await expect(page.getByRole('button', { name: /uitnodigingscode|code d'invitation/i })).toHaveCount(0);
      await expect(page.getByLabel(/uitnodigingscode|code d'invitation/i)).toHaveCount(0);
      await expect(page.locator('input[name="invite"]')).toHaveCount(0);
    });
  }
});

test.describe('onbekend of verlopen adres krijgt geen mail (T-028, crit. 2)', () => {
  async function expectUnknown(page: Page, email: string, lang: 'nl' | 'fr' = 'nl') {
    const T = TEXTS[lang];
    const otp: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/auth/v1/otp')) otp.push(r.url());
    });
    await seedLanguage(page, lang);
    await page.goto('/aanmelden');
    await page.getByRole('textbox', { name: T['auth.emailLabel'], exact: true }).fill(email);
    await page.getByRole('button', { name: T['auth.requestCode'], exact: true }).click();
    const field = page.getByRole('textbox', { name: T['auth.emailLabel'], exact: true });
    await expect(page.locator('#email-error')).toHaveText(T['auth.unknownAddress']);
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel(T['auth.mailCodeLabel'], { exact: true })).toHaveCount(0); // still step 1
    expect(otp).toEqual([]);
  }

  test('(a) never invited, in Dutch', async ({ page }) => {
    await expectUnknown(page, uniqueEmail('onbekend'));
  });

  test('(a) never invited, in French', async ({ page }) => {
    await expectUnknown(page, uniqueEmail('inconnu'), 'fr');
  });

  test('(b) invitation 7 days and 1 second old, with the mail of the administrator sent', async ({ page }) => {
    const email = uniqueEmail('verlopen');
    invitedEmails.push(email);
    expect((await inviteRpc(boss.client, 'invite_user', email)).error).toBeNull();
    expect((await requestInviteMail(email)).error).toBeNull();
    await setInvitationSentAt(email, new Date(Date.now() - (7 * 24 * 3600 + 1) * 1000));
    await expectUnknown(page, email);
  });
});

test.describe('een uitgenodigde meldt zich aan met alleen zijn adres (T-028, crit. 3, 4, 7)', () => {
  async function signInInvited(browser: import('@playwright/test').Browser, email: string) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
    try {
      const page = await ctx.newPage();
      await page.goto('/aanmelden');
      const sent = Date.now();
      // upper case and spaces around the address count as the same address
      await emailField(page).fill(`  ${email.toUpperCase()}  `);
      await page.getByRole('button', { name: REQUEST_BUTTON }).click();
      await expect(mailCodeField(page)).toBeVisible();
      const mail = await waitForMail(email, { sinceMs: sent });
      // crit. 7: link and exactly one distinct 6-digit code
      expect(mail.link).not.toBeNull();
      expect(new Set(mail.codes).size).toBe(1);
      expect(mail.codes[0]).toMatch(/^\d{6}$/);

      const wrong = mail.codes[0].slice(0, 5) + String((Number(mail.codes[0][5]) + 1) % 10);
      await submitMailCode(page, wrong);
      await expect(page.getByText(nl['auth.codeInvalid'])).toBeVisible();
      await expect(page).toHaveURL(/\/aanmelden$/);

      await submitMailCode(page, mail.codes[0]);
      await expect(page).toHaveURL(/\/welkom$/);
    } finally {
      await ctx.close();
    }
  }

  test('invitation and mail of the administrator sent: a new mail, the code leads to /welkom', async ({ browser }) => {
    const email = uniqueEmail('uitgenodigd');
    invitedEmails.push(email);
    expect((await inviteRpc(boss.client, 'invite_user', email)).error).toBeNull();
    expect((await requestInviteMail(email)).error).toBeNull();
    await signInInvited(browser, email);
  });

  test('invitation only, the mail of the administrator never left: the same steps work', async ({ browser }) => {
    const email = uniqueEmail('zondermail');
    invitedEmails.push(email);
    expect((await inviteRpc(boss.client, 'invite_user', email)).error).toBeNull();
    await signInInvited(browser, email);
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
