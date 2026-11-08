import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fr from '../../src/i18n/fr.json' with { type: 'json' };
import nl from '../../src/i18n/nl.json' with { type: 'json' };
import { waitForMail } from '../helpers/mailpit';
import { authUser, backdateCodes, userExists, userIdByEmail } from '../helpers/pg';
import {
  adminClient,
  anonClient,
  assertSupabaseUp,
  createInvitation,
  createTestUser,
  deleteInvitations,
  deleteTestUser,
  getInvitation,
  requestInviteMail,
  uniqueEmail,
  validRecipe,
  type TestUser,
} from '../helpers/supabase-admin';

// T-003 / R-002, changed by T-027 / R-027: the invite codes are gone, an invitation is a row per e-mail address.
// Everything runs against the local Supabase; mails come from the local Mailpit.
const createdEmails: string[] = [];
const users: TestUser[] = [];

function newEmail(label: string): string {
  const e = uniqueEmail(label);
  createdEmails.push(e);
  return e;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Subject is "{nl} / {fr}"; the Dutch heading comes first in the body; link and code are there. */
function expectBilingual(mail: Awaited<ReturnType<typeof waitForMail>>) {
  expect(mail.subject).toBe(`${nl['email.subject']} / ${fr['email.subject']}`);
  const html = mail.html;
  const h = (s: string) => Math.max(html.indexOf(s), html.indexOf(escapeHtml(s)));
  expect(h(nl['email.heading'])).toBeGreaterThanOrEqual(0);
  expect(h(fr['email.heading'])).toBeGreaterThanOrEqual(0);
  expect(h(nl['email.heading'])).toBeLessThan(h(fr['email.heading']));
  expect(mail.link).not.toBeNull();
  expect(mail.codes.length).toBeGreaterThan(0);
}

beforeAll(async () => {
  await assertSupabaseUp(); // fails loudly, never skips
});

afterAll(async () => {
  const admin = adminClient();
  for (const u of users) await deleteTestUser(u);
  for (const e of createdEmails) {
    const id = await userIdByEmail(e);
    if (id) await admin.auth.admin.deleteUser(id);
  }
  await deleteInvitations(createdEmails);
});

describe('no account without a valid invitation (R-002 crit. 1, R-027)', () => {
  it('OTP request for an address without invitation creates no user', async () => {
    const email = newEmail('zonder');
    await requestInviteMail(email);
    expect(await userExists(email)).toBe(false);
  });

  it('OTP request for an address whose invitation is 7 days and 1 second old creates no user', async () => {
    const email = newEmail('verlopen');
    await createInvitation(email, { sentAt: new Date(Date.now() - (7 * 24 * 3600 + 1) * 1000) });
    await requestInviteMail(email);
    expect(await userExists(email)).toBe(false);
  });

  it('the trigger also refuses admin.createUser without an invitation, and with an expired one', async () => {
    const admin = adminClient();
    const none = newEmail('admin-zonder');
    const r1 = await admin.auth.admin.createUser({ email: none, email_confirm: true });
    expect(r1.error).not.toBeNull();
    expect(await userExists(none)).toBe(false);

    const old = newEmail('admin-oud');
    await createInvitation(old, { sentAt: new Date(Date.now() - (7 * 24 * 3600 + 1) * 1000) });
    const r2 = await admin.auth.admin.createUser({ email: old, email_confirm: true });
    expect(r2.error).not.toBeNull();
    expect(await userExists(old)).toBe(false);
  });

  it('a valid invitation creates an unconfirmed user; after confirmation the invitation counts as accepted by that user', async () => {
    const email = newEmail('geldig');
    await createInvitation(email);
    const sent = Date.now();
    const res = await requestInviteMail(email);
    expect(res.error).toBeNull();
    expect(await userExists(email)).toBe(true);
    // a typo in the address must not burn the invitation: still open before confirmation
    expect((await getInvitation(email))?.accepted_at).toBeNull();

    const mail = await waitForMail(email, { sinceMs: sent });
    const verified = await anonClient().auth.verifyOtp({ email, token: mail.codes[0], type: 'email' });
    expect(verified.error).toBeNull();
    expect(verified.data.session).not.toBeNull();
    const row = await getInvitation(email);
    expect(row?.accepted_at).not.toBeNull();
    expect(row?.accepted_by).toBe(verified.data.user!.id);
  });

  it('an invitation can be accepted once: a second confirmation for the same address makes no second account', async () => {
    const email = newEmail('eenmalig');
    await createInvitation(email);
    const sent = Date.now();
    expect((await requestInviteMail(email)).error).toBeNull();
    const mail = await waitForMail(email, { sinceMs: sent });
    const ok = await anonClient().auth.verifyOtp({ email, token: mail.codes[0], type: 'email' });
    expect(ok.error).toBeNull();
    const accounts = await adminClient().auth.admin.listUsers({ perPage: 1000 });
    expect(accounts.data.users.filter((u) => u.email === email)).toHaveLength(1);
  });

  // R-026 crit. 6: the mail is bilingual, Dutch first; subject "{nl} / {fr}" (for users without a language).
  it('the mail for an existing account (magic link template) is bilingual: Dutch heading before the French one', async () => {
    const user = await createTestUser('bilingualold');
    users.push(user);
    const sent = Date.now();
    const res = await anonClient().auth.signInWithOtp({ email: user.email, options: { shouldCreateUser: false } });
    expect(res.error).toBeNull();
    const mail = await waitForMail(user.email, { sinceMs: sent });
    expectBilingual(mail);
  });

  // R-027 crit. 3: the template follows user_metadata.lang; the invited user has it from the invitation mail.
  it('a new invited user with lang fr gets a mail with the French block and without the Dutch heading', async () => {
    const email = newEmail('frmail');
    await createInvitation(email, { lang: 'fr' });
    const sent = Date.now();
    expect((await requestInviteMail(email, 'fr')).error).toBeNull();
    expect((await authUser(email))?.lang).toBe('fr');
    const mail = await waitForMail(email, { sinceMs: sent });
    const has = (s: string) => mail.html.includes(s) || mail.html.includes(escapeHtml(s));
    expect(has(fr['email.heading'])).toBe(true);
    expect(has(nl['email.heading'])).toBe(false);
  });
});

describe('display name 2 to 40 characters (R-002 crit. 3)', () => {
  let u: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    u = await createTestUser('naam', { displayName: null });
    other = await createTestUser('ander', { displayName: 'Andere Gebruiker' });
    users.push(u, other);
  });

  const setName = (name: string) => u.client.from('profiles').update({ display_name: name }).eq('id', u.id);

  it('a new user has a profile without a name yet', async () => {
    const r = await adminClient().from('profiles').select('display_name').eq('id', u.id).single();
    expect(r.error).toBeNull();
    expect(r.data?.display_name).toBeNull();
  });

  it('refuses 1 and 41 characters, accepts 2 and 40', async () => {
    expect((await setName('a')).error).not.toBeNull();
    expect((await setName('a'.repeat(41))).error).not.toBeNull();
    expect((await setName('ab')).error).toBeNull();
    expect((await setName('a'.repeat(40))).error).toBeNull();
  });

  it('counts after trimming spaces at both ends, and stores the trimmed name', async () => {
    expect((await setName('  a  ')).error).not.toBeNull();
    expect((await setName(` ${'a'.repeat(41)} `)).error).not.toBeNull();
    expect((await setName(`  ${'b'.repeat(40)}  `)).error).toBeNull();
    expect((await setName('  Annemie  ')).error).toBeNull();
    const r = await u.client.from('profiles').select('display_name').eq('id', u.id).single();
    expect(r.data?.display_name).toBe('Annemie');
  });

  it('a user cannot change someone else\'s name, nor insert or delete profiles', async () => {
    await u.client.from('profiles').update({ display_name: 'Gekaapt' }).eq('id', other.id);
    const check = await adminClient().from('profiles').select('display_name').eq('id', other.id).single();
    expect(check.data?.display_name).toBe('Andere Gebruiker');

    const ins = await u.client.from('profiles').insert({ id: crypto.randomUUID(), display_name: 'Nep' });
    expect(ins.error).not.toBeNull();

    await u.client.from('profiles').delete().eq('id', other.id);
    const still = await adminClient().from('profiles').select('id').eq('id', other.id);
    expect(still.data).toHaveLength(1);
  });

  it('a user can only change display_name, no other column', async () => {
    const r = await u.client.from('profiles').update({ created_at: '2000-01-01T00:00:00Z' }).eq('id', u.id);
    expect(r.error).not.toBeNull();
  });

  it('every signed-in user can read all profiles (needed for the author name)', async () => {
    const r = await other.client.from('profiles').select('id,display_name').eq('id', u.id);
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(1);
  });
});

describe('nothing readable or writable without signing in (R-002 crit. 5)', () => {
  let u: TestUser;

  beforeAll(async () => {
    u = await createTestUser('prive');
    users.push(u);
    const ins = await u.client.from('recipes').insert(validRecipe({ title: 'Privé testrecept' }));
    expect(ins.error).toBeNull();
  });

  it('anonymous select on recipes and profiles returns nothing', async () => {
    const anon = anonClient();
    expect((await anon.from('recipes').select('id')).data ?? []).toHaveLength(0);
    expect((await anon.from('profiles').select('id')).data ?? []).toHaveLength(0);
  });

  it('anonymous insert into recipes is refused', async () => {
    const r = await anonClient().from('recipes').insert(validRecipe({ title: 'Anoniem' }));
    expect(r.error).not.toBeNull();
  });

  it('invitations is closed for the anonymous role: no read, no insert, no update', async () => {
    const anon = anonClient();
    const before = await getInvitation(u.email);
    expect((await anon.from('invitations').select('*')).data ?? []).toHaveLength(0);
    expect((await anon.from('invitations').insert({ email: newEmail('anoniem') })).error).not.toBeNull();
    const upd = await anon.from('invitations').update({ accepted_by: null }).eq('email', u.email).select();
    expect(upd.data ?? []).toHaveLength(0);
    expect(await getInvitation(u.email)).toEqual(before);
  });

  it('invitations is closed for signed-in users too: no read, no insert', async () => {
    expect((await u.client.from('invitations').select('*')).data ?? []).toHaveLength(0);
    const ins = await u.client.from('invitations').insert({ email: newEmail('eigen') });
    expect(ins.error).not.toBeNull();
  });
});

describe('the mail has the link and a 6-digit code (R-002 crit. 6)', () => {
  it('new user: confirmation mail with a /auth/v1/verify link and one distinct 6-digit code', async () => {
    const email = newEmail('mail-new');
    await createInvitation(email);
    const sent = Date.now();
    expect((await requestInviteMail(email)).error).toBeNull();
    const mail = await waitForMail(email, { sinceMs: sent });
    expect(mail.link).toMatch(/\/auth\/v1\/verify/);
    expect(new Set(mail.codes).size).toBe(1);
    expect(mail.codes[0]).toMatch(/^\d{6}$/);
  });

  it('existing user: login mail with a /auth/v1/verify link and one distinct 6-digit code', async () => {
    const u = await createTestUser('mail-old');
    users.push(u);
    const sent = Date.now();
    const res = await anonClient().auth.signInWithOtp({ email: u.email, options: { shouldCreateUser: false } });
    expect(res.error).toBeNull();
    const mail = await waitForMail(u.email, { sinceMs: sent });
    expect(mail.link).toMatch(/\/auth\/v1\/verify/);
    // the bilingual mail repeats the same code once per language
    expect(new Set(mail.codes).size).toBe(1);
    expect(mail.codes[0]).toMatch(/^\d{6}$/);
  });

  it('a right code signs in; a wrong code and an expired code do not', async () => {
    const u = await createTestUser('mail-code');
    users.push(u);
    const sent = Date.now();
    await anonClient().auth.signInWithOtp({ email: u.email, options: { shouldCreateUser: false } });
    const mail = await waitForMail(u.email, { sinceMs: sent });
    const good = mail.codes[0];
    const last = Number(good[5]);
    const wrong = good.slice(0, 5) + String((last + 1) % 10);

    const c1 = anonClient();
    const bad = await c1.auth.verifyOtp({ email: u.email, token: wrong, type: 'email' });
    expect(bad.error).not.toBeNull();
    expect(bad.data.session).toBeNull();

    // expired: send time moved back past otp_expiry
    await backdateCodes(u.email);
    const c2 = anonClient();
    const expired = await c2.auth.verifyOtp({ email: u.email, token: good, type: 'email' });
    expect(expired.error).not.toBeNull();
    expect(expired.data.session).toBeNull();

    // control: a fresh code does sign in
    const sent2 = Date.now();
    await anonClient().auth.signInWithOtp({ email: u.email, options: { shouldCreateUser: false } });
    const mail2 = await waitForMail(u.email, { sinceMs: sent2 });
    const c3 = anonClient();
    const ok = await c3.auth.verifyOtp({ email: u.email, token: mail2.codes[0], type: 'email' });
    expect(ok.error).toBeNull();
    expect(ok.data.session).not.toBeNull();
  });
});
