import { expect, test, type Page, type Route } from '@playwright/test';
import frJson from '../../src/i18n/fr.json' with { type: 'json' };
import nlJson from '../../src/i18n/nl.json' with { type: 'json' };
import { countMails, waitForMail } from '../helpers/mailpit';
import { seedLanguage, signInViaStorage, storageKey } from '../helpers/session';
import {
  adminClient,
  anonClient,
  assertSupabaseUp,
  createInvitation,
  createTestUser,
  deleteInvitations,
  deleteTestUser,
  getInvitation,
  makeAdmin,
  seedInvitationSends,
  setInvitationSentAt,
  uniqueEmail,
  type TestUser,
} from '../helpers/supabase-admin';
import { authUser } from '../helpers/pg';

// T-027 / R-027 (screen "Uitnodigingen", R-017). Texts come from nl.json / fr.json, never typed out.
// Mails come from the local Mailpit; the service role is used only here in the test, never in the browser.
const TEXTS = { nl: nlJson as Record<string, string>, fr: frJson as Record<string, string> } as const;
type Lang = 'nl' | 'fr';
const LANGS: Lang[] = ['nl', 'fr'];
const LOCALES = { nl: 'nl-BE', fr: 'fr-BE' } as const;
const LIST_INVITATIONS = /\/rest\/v1\/rpc\/list_invitations/;
const INVITE_USER = /\/rest\/v1\/rpc\/invite_user/;
const DAY_MS = 24 * 3600 * 1000;

let boss: TestUser;
let plain: TestUser;
let member: TestUser;
const emails: string[] = [];
const extraUsers: TestUser[] = [];

function newEmail(label: string): string {
  const e = uniqueEmail(label);
  emails.push(e);
  return e;
}

test.beforeAll(async () => {
  await assertSupabaseUp();
  boss = await createTestUser('invboss', { displayName: 'Bea Beheer' });
  await makeAdmin(boss.id);
  plain = await createTestUser('invplain');
  member = await createTestUser('invlid');
});

test.afterAll(async () => {
  const admin = adminClient();
  for (const e of emails) {
    const u = await authUser(e);
    if (u) await admin.auth.admin.deleteUser(u.id);
  }
  await deleteInvitations(emails);
  for (const u of [boss, plain, member, ...extraUsers]) if (u) await deleteTestUser(u);
});

const field = (page: Page, lang: Lang) => page.getByLabel(TEXTS[lang]['invites.emailLabel'], { exact: true });
const submit = (page: Page, lang: Lang) => page.getByRole('button', { name: TEXTS[lang]['invites.submit'], exact: true });
const rowOf = (page: Page, email: string) => page.getByRole('listitem').filter({ hasText: email });
const cancelLabel = (lang: Lang) => TEXTS[lang]['invites.cancel'] ?? TEXTS[lang]['form.cancel'];
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function openScreen(page: Page, user: TestUser, lang: Lang = 'nl') {
  await seedLanguage(page, lang);
  await signInViaStorage(page, user.session);
  await page.goto('/uitnodigingen');
  await expect(field(page, lang)).toBeVisible();
}

async function invite(page: Page, email: string, lang: Lang = 'nl') {
  await field(page, lang).fill(email);
  await submit(page, lang).tap();
}

const sessionStored = (page: Page) => page.evaluate((k) => window.localStorage.getItem(k), storageKey());

// R-017 crit. 1 (interface).
test.describe('administrator', () => {
  test('sees the link "Uitnodigingen" on Profiel and opens the screen', async ({ page }) => {
    await signInViaStorage(page, boss.session);
    await page.goto('/profiel');
    const link = page.getByRole('link', { name: TEXTS.nl['profile.invitesLink'] });
    await expect(link).toBeVisible();
    await link.tap();
    await expect(page).toHaveURL(/\/uitnodigingen$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(TEXTS.nl['invites.title']);
  });

  test('keeps "Profiel" active in the navigation bar on /uitnodigingen (R-016 nav, T-004 plan 11)', async ({ page }) => {
    await signInViaStorage(page, boss.session);
    await page.goto('/uitnodigingen');
    const nav = page.getByRole('navigation', { name: TEXTS.nl['nav.label'] });
    await expect(nav.getByRole('link', { name: 'Profiel' })).toHaveAttribute('aria-current', 'page');
  });

  test('the field is made for e-mail on a phone and the screen has no code, copy or status parts any more', async ({ page }) => {
    await openScreen(page, boss);
    const input = field(page, 'nl');
    await expect(input).toHaveAttribute('type', 'email');
    await expect(input).toHaveAttribute('inputmode', 'email');
    await expect(input).toHaveAttribute('autocapitalize', 'none');
    await expect(page.getByRole('button', { name: /kopieer|nieuwe code/i })).toHaveCount(0);
  });

  test('shows a loading status while the list loads, then the list (ListState)', async ({ page }) => {
    const open = newEmail('laden');
    await createInvitation(open, { invitedBy: boss.id });
    let held: Route | undefined;
    let arrive: () => void = () => {};
    const arrived = new Promise<void>((r) => (arrive = r));
    await page.route(LIST_INVITATIONS, (route) => {
      if (route.request().method() === 'POST' && !held) {
        held = route;
        arrive();
      } else {
        void route.continue();
      }
    });
    await seedLanguage(page, 'nl');
    await signInViaStorage(page, boss.session);
    await page.goto('/uitnodigingen');
    await arrived;
    const status = page.getByRole('status').filter({ hasText: TEXTS.nl['invites.loading'] });
    await expect(status).toBeVisible();
    await expect(page.getByText(TEXTS.nl['invites.empty'])).toHaveCount(0);
    await held!.continue();
    await expect(status).toHaveCount(0);
    await expect(rowOf(page, open)).toBeVisible();
  });

  test('shows "Geen openstaande uitnodigingen." for an empty list', async ({ page }) => {
    await page.route(LIST_INVITATIONS, (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: '[]',
      });
    });
    await openScreen(page, boss);
    await expect(page.getByText('Geen openstaande uitnodigingen.')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: TEXTS.nl['invites.loading'] })).toHaveCount(0);
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

  test('shows an error alert when loading the list fails with a 500 (no silent failure)', async ({ page }) => {
    await page.route(LIST_INVITATIONS, fail500);
    await seedLanguage(page, 'nl');
    await signInViaStorage(page, boss.session);
    await page.goto('/uitnodigingen');
    await expect(page.getByRole('alert').filter({ hasText: TEXTS.nl['invites.error'] })).toBeVisible();
  });

  test('shows an error alert when inviting fails with a 500, sends no mail and the button works again', async ({ page }) => {
    const otp: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/auth/v1/otp')) otp.push(r.url());
    });
    await page.route(INVITE_USER, fail500);
    await openScreen(page, boss);
    await invite(page, newEmail('fout500'));
    await expect(page.getByRole('alert').filter({ hasText: TEXTS.nl['invites.error'] })).toBeVisible();
    await expect(submit(page, 'nl')).toBeEnabled();
    expect(otp).toEqual([]);
  });

  // crit. 2
  for (const lang of LANGS) {
    test(`an invalid address shows the message at the field and sends no request (${lang})`, async ({ page }) => {
      const calls: string[] = [];
      page.on('request', (r) => {
        if (INVITE_USER.test(r.url()) || r.url().includes('/auth/v1/otp')) calls.push(r.url());
      });
      await openScreen(page, boss, lang);
      for (const bad of ['jan@', 'jan mail.be', '']) {
        await field(page, lang).fill(bad);
        await submit(page, lang).tap();
        const input = field(page, lang);
        await expect(input, `"${bad}"`).toHaveAttribute('aria-invalid', 'true');
        const describedBy = await input.getAttribute('aria-describedby');
        expect(describedBy ?? '', 'field points to its message').toContain('invite-email-error');
        await expect(page.locator('#invite-email-error')).toHaveText(TEXTS[lang]['invites.invalidEmail']);
      }
      expect(calls).toEqual([]);
    });
  }

  // crit. 3, 11, 12: one mail with link and 6 digits, in the language of the administrator, and still signed in.
  for (const lang of LANGS) {
    test(`a valid address sends one mail with link and 6-digit code in ${lang}, and the administrator stays signed in`, async ({ page }) => {
      const other = lang === 'nl' ? 'fr' : 'nl';
      const email = newEmail(`mail-${lang}`);
      await openScreen(page, boss, lang);
      const sent = Date.now();
      // typed with capitals and spaces: crit. 11
      await invite(page, `  ${email.toUpperCase()} `, lang);

      const mail = await waitForMail(email, { sinceMs: sent });
      expect(mail.link).not.toBeNull();
      expect(new Set(mail.codes).size).toBe(1);
      expect(mail.codes[0]).toMatch(/^\d{6}$/);
      const has = (value: string) => mail.html.includes(value) || mail.html.includes(escapeHtml(value));
      expect(has(TEXTS[lang]['email.heading'])).toBe(true);
      expect(has(TEXTS[other]['email.heading'])).toBe(false);
      expect(await countMails(email)).toBe(1);

      await expect(page.getByRole('status').filter({ hasText: email })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(TEXTS[lang]['invites.title']);
      expect(await sessionStored(page)).not.toBeNull();
      await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(TEXTS[lang]['invites.title']);
      await expect(rowOf(page, email)).toHaveCount(1);
    });
  }

  // crit. 5: address and date in the language of the reader.
  for (const lang of LANGS) {
    test(`the list shows the address and the sent date in ${lang}; accepting removes it after a reload`, async ({ page }) => {
      const email = newEmail(`lijst-${lang}`);
      await openScreen(page, boss, lang);
      await invite(page, email, lang);
      const row = rowOf(page, email);
      await expect(row).toBeVisible();

      const sentAt = new Date((await getInvitation(email))!.sent_at);
      const day = new Intl.DateTimeFormat(LOCALES[lang], {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Brussels',
      }).format(sentAt);
      await expect(row).toContainText(day);

      // the invited person signs in elsewhere with the code from the mail (no browser needed for that part)
      const mail = await waitForMail(email, { sinceMs: sentAt.getTime() - 5000 });
      const ok = await anonClient().auth.verifyOtp({ email, token: mail.codes[0], type: 'email' });
      expect(ok.error).toBeNull();

      await page.reload();
      await expect(field(page, lang)).toBeVisible();
      await expect(rowOf(page, email)).toHaveCount(0);
    });
  }

  test('an expired invitation is not in the list', async ({ page }) => {
    const email = newEmail('verlopen');
    await createInvitation(email, { invitedBy: boss.id, sentAt: new Date(Date.now() - 7 * DAY_MS - 1000) });
    const fresh = newEmail('vers');
    await createInvitation(fresh, { invitedBy: boss.id });
    await openScreen(page, boss);
    await expect(rowOf(page, fresh)).toBeVisible();
    await expect(rowOf(page, email)).toHaveCount(0);
  });

  // crit. 6
  test('"Intrekken" asks for confirmation: Annuleren keeps the row, bevestigen removes it and the address cannot sign in', async ({ page }) => {
    const email = newEmail('intrekken');
    await openScreen(page, boss);
    const sent = Date.now();
    await invite(page, email);
    const mail = await waitForMail(email, { sinceMs: sent });
    const row = rowOf(page, email);
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: TEXTS.nl['invites.revoke'], exact: true }).tap();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: cancelLabel('nl'), exact: true }).tap();
    await expect(dialog).toHaveCount(0);
    await expect(row).toBeVisible();
    expect(await getInvitation(email)).not.toBeNull();

    await row.getByRole('button', { name: TEXTS.nl['invites.revoke'], exact: true }).tap();
    await page.getByRole('alertdialog').getByRole('button', { name: TEXTS.nl['invites.revokeConfirm'], exact: true }).tap();
    await expect(rowOf(page, email)).toHaveCount(0);
    expect(await getInvitation(email)).toBeNull();

    const verified = await anonClient().auth.verifyOtp({ email, token: mail.codes[0], type: 'email' });
    expect(verified.error).not.toBeNull();
  });

  // crit. 7
  test('"Opnieuw mailen" sends a second mail with another code; the new code signs in, the old one no longer', async ({ page }) => {
    const email = newEmail('opnieuw');
    await openScreen(page, boss);
    const first = Date.now();
    await invite(page, email);
    const mail1 = await waitForMail(email, { sinceMs: first });
    const row = rowOf(page, email);
    await expect(row).toBeVisible();

    const second = Date.now();
    await row.getByRole('button', { name: TEXTS.nl['invites.resend'], exact: true }).tap();
    const mail2 = await waitForMail(email, { sinceMs: second });
    expect(mail2.codes[0]).not.toBe(mail1.codes[0]);
    expect(await countMails(email)).toBe(2);

    const old = await anonClient().auth.verifyOtp({ email, token: mail1.codes[0], type: 'email' });
    expect(old.error).not.toBeNull();
    const fresh = await anonClient().auth.verifyOtp({ email, token: mail2.codes[0], type: 'email' });
    expect(fresh.error).toBeNull();
  });

  // crit. 8
  for (const lang of LANGS) {
    test(`an address that already has an account shows the message at the field and sends no mail (${lang})`, async ({ page }) => {
      const before = await countMails(member.email);
      await openScreen(page, boss, lang);
      await invite(page, member.email, lang);
      await expect(page.locator('#invite-email-error')).toHaveText(TEXTS[lang]['invites.alreadyMember']);
      await expect(field(page, lang)).toHaveAttribute('aria-invalid', 'true');
      await new Promise((r) => setTimeout(r, 1500));
      expect(await countMails(member.email)).toBe(before);
    });
  }

  // crit. 9
  test('inviting an open address again sends a second mail and shows the address once', async ({ page }) => {
    const email = newEmail('dubbel');
    await openScreen(page, boss);
    const first = Date.now();
    await invite(page, email);
    await waitForMail(email, { sinceMs: first });
    await expect(rowOf(page, email)).toHaveCount(1);

    const second = Date.now();
    await invite(page, email);
    await waitForMail(email, { sinceMs: second });
    expect(await countMails(email)).toBe(2);
    await page.reload();
    await expect(rowOf(page, email)).toHaveCount(1);
  });

  // crit. 10
  for (const lang of LANGS) {
    test(`the 21st invitation within 24 hours shows the rate-limit message and sends no mail (${lang})`, async ({ page }) => {
      const full = await createTestUser('invvol');
      await makeAdmin(full.id);
      extraUsers.push(full);
      await seedInvitationSends(full.id, 20);
      const email = newEmail(`limiet-${lang}`);
      await openScreen(page, full, lang);
      await invite(page, email, lang);
      await expect(page.getByText(TEXTS[lang]['invites.rateLimited'])).toBeVisible();
      await new Promise((r) => setTimeout(r, 1500));
      expect(await countMails(email)).toBe(0);
      expect(await getInvitation(email)).toBeNull();
    });
  }

  test('a back-dated invitation shows its sent date, not today', async ({ page }) => {
    const email = newEmail('datum');
    await createInvitation(email, { invitedBy: boss.id });
    const sentAt = new Date(Date.now() - 3 * DAY_MS);
    await setInvitationSentAt(email, sentAt);
    await openScreen(page, boss);
    const day = new Intl.DateTimeFormat('nl-BE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Brussels',
    }).format(sentAt);
    await expect(rowOf(page, email)).toContainText(day);
  });
});

// R-017 crit. 1: a normal user sees nothing and is sent away.
test.describe('normal user', () => {
  test.beforeEach(async ({ page }) => {
    await signInViaStorage(page, plain.session);
  });

  test('does not see the link "Uitnodigingen" on Profiel', async ({ page }) => {
    await page.goto('/profiel');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Profiel');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: TEXTS.nl['profile.invitesLink'] })).toHaveCount(0);
  });

  test('opening /uitnodigingen directly lands on /profiel and shows no invitation or form', async ({ page }) => {
    const secret = newEmail('geheim');
    await createInvitation(secret, { invitedBy: boss.id });
    await page.goto('/uitnodigingen');
    await expect(page).toHaveURL(/\/profiel$/);
    await page.waitForLoadState('networkidle');
    expect(await page.locator('body').innerText()).not.toContain(secret);
    await expect(submit(page, 'nl')).toHaveCount(0);
    await expect(field(page, 'nl')).toHaveCount(0);
  });
});
