import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { waitForMail } from '../helpers/mailpit';
import { backdateCodes, inviteValidAt, inviteValidAtUnknown, userExists, userIdByEmail } from '../helpers/pg';
import {
  adminClient,
  anonClient,
  assertSupabaseUp,
  createInvite,
  createTestUser,
  deleteTestUser,
  uniqueEmail,
  validRecipe,
  type TestUser,
} from '../helpers/supabase-admin';

// T-003 / R-002. Everything runs against the local Supabase; mails come from the local Mailpit.
const createdEmails: string[] = [];
const createdCodes: string[] = [];
const users: TestUser[] = [];

function newEmail(label: string): string {
  const e = uniqueEmail(label);
  createdEmails.push(e);
  return e;
}

async function newInvite(opts: { createdAt?: Date } = {}): Promise<string> {
  const code = await createInvite(opts);
  createdCodes.push(code);
  return code;
}

/** Asks for a mail as the app does for a new account. */
function requestNewAccount(email: string, inviteCode?: string) {
  return anonClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, ...(inviteCode ? { data: { invite_code: inviteCode } } : {}) },
  });
}

async function codeUsedBy(code: string): Promise<string | null> {
  const r = await adminClient().from('invites').select('used_by').eq('code', code).single();
  expect(r.error).toBeNull();
  return (r.data as { used_by: string | null }).used_by;
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
  for (const c of createdCodes) await admin.from('invites').delete().eq('code', c);
});

describe('no account without a valid invite code (R-002 crit. 1)', () => {
  it('OTP request with an unknown code creates no user', async () => {
    const email = newEmail('unknown');
    await requestNewAccount(email, 'ONBEKENDE-CODE-123');
    expect(await userExists(email)).toBe(false);
  });

  it('OTP request without a code creates no user', async () => {
    const email = newEmail('nocode');
    await requestNewAccount(email);
    expect(await userExists(email)).toBe(false);
  });

  it('OTP request with an already used code creates no user', async () => {
    const owner = await createTestUser('owner'); // spends its own invite
    users.push(owner);
    const email = newEmail('used');
    await requestNewAccount(email, owner.inviteCode);
    expect(await userExists(email)).toBe(false);
  });

  it('the trigger also refuses admin.createUser without a valid code', async () => {
    const admin = adminClient();
    const noCode = newEmail('admin-nocode');
    const r1 = await admin.auth.admin.createUser({ email: noCode, email_confirm: true });
    expect(r1.error).not.toBeNull();
    expect(await userExists(noCode)).toBe(false);

    const bad = newEmail('admin-badcode');
    const r2 = await admin.auth.admin.createUser({
      email: bad,
      email_confirm: true,
      user_metadata: { invite_code: 'BESTAAT-NIET' },
    });
    expect(r2.error).not.toBeNull();
    expect(await userExists(bad)).toBe(false);
  });

  it('a valid code creates the user; after confirmation the code is used by that user', async () => {
    const code = await newInvite();
    const email = newEmail('valid');
    const sent = Date.now();
    const res = await requestNewAccount(email, code);
    expect(res.error).toBeNull();
    expect(await userExists(email)).toBe(true);
    // a typo in the address must not burn the code: still unused before confirmation
    expect(await codeUsedBy(code)).toBeNull();

    const mail = await waitForMail(email, { sinceMs: sent });
    const client = anonClient();
    const verified = await client.auth.verifyOtp({ email, token: mail.codes[0], type: 'email' });
    expect(verified.error).toBeNull();
    expect(verified.data.session).not.toBeNull();
    expect(await codeUsedBy(code)).toBe(verified.data.user!.id);
  });

  it('check_invite answers only yes or no, for the public roles', async () => {
    const fresh = await newInvite();
    const owner = await createTestUser('checkowner');
    users.push(owner);
    const anon = anonClient();
    const ok = await anon.rpc('check_invite', { code: fresh });
    expect(ok.error).toBeNull();
    expect(ok.data).toBe(true);
    const unknown = await anon.rpc('check_invite', { code: 'ONBEKEND-XYZ' });
    expect(unknown.data).toBe(false);
    const used = await anon.rpc('check_invite', { code: owner.inviteCode });
    expect(used.data).toBe(false);
  });
});

describe('invite is single use and expires after 7 days (R-002 crit. 2)', () => {
  it('invite_is_valid_at: exactly 7 x 24 h is still valid, 1 second later is not', async () => {
    const code = await newInvite();
    expect(await inviteValidAt(code, '7 days')).toBe(true);
    expect(await inviteValidAt(code, '7 days 1 second')).toBe(false);
    expect(await inviteValidAt(code, '0 seconds')).toBe(true);
  });

  it('invite_is_valid_at: unknown and used codes are never valid', async () => {
    expect(await inviteValidAtUnknown('ONBEKEND-XYZ')).toBe(false);
    const owner = await createTestUser('spent');
    users.push(owner);
    expect(await inviteValidAt(owner.inviteCode, '0 seconds')).toBe(false);
  });

  it('a code created 7 days and 1 second ago is refused when making an account', async () => {
    const code = await newInvite({ createdAt: new Date(Date.now() - (7 * 24 * 3600 + 1) * 1000) });
    const viaApi = newEmail('expired-otp');
    await requestNewAccount(viaApi, code);
    expect(await userExists(viaApi)).toBe(false);

    const viaAdmin = newEmail('expired-admin');
    const r = await adminClient().auth.admin.createUser({
      email: viaAdmin,
      email_confirm: true,
      user_metadata: { invite_code: code },
    });
    expect(r.error).not.toBeNull();
    expect(await userExists(viaAdmin)).toBe(false);
  });

  it('two requests with one code: the first to confirm gets the account, the second stays without session', async () => {
    const code = await newInvite();
    const first = newEmail('race1');
    const second = newEmail('race2');
    const sent = Date.now();
    expect((await requestNewAccount(first, code)).error).toBeNull();
    expect((await requestNewAccount(second, code)).error).toBeNull();
    const mail1 = await waitForMail(first, { sinceMs: sent });
    const mail2 = await waitForMail(second, { sinceMs: sent });

    const c1 = anonClient();
    const ok = await c1.auth.verifyOtp({ email: first, token: mail1.codes[0], type: 'email' });
    expect(ok.error).toBeNull();
    expect(ok.data.session).not.toBeNull();

    const c2 = anonClient();
    const late = await c2.auth.verifyOtp({ email: second, token: mail2.codes[0], type: 'email' });
    expect(late.error).not.toBeNull();
    expect(late.data.session).toBeNull();
    expect((await c2.auth.getSession()).data.session).toBeNull();
    expect(await codeUsedBy(code)).toBe(ok.data.user!.id);
  });

  // Review T-003 finding 1: the loser of a race (or anyone whose first code got spent/expired before
  // confirming) must not stay locked out; a new request with a new valid code must give an account.
  it('a loser of the race can still sign up later with a new valid code', async () => {
    const codeA = await newInvite();
    const codeB = await newInvite();
    const winner = newEmail('retry-winner');
    const loser = newEmail('retry-loser');
    const sent = Date.now();
    expect((await requestNewAccount(winner, codeA)).error).toBeNull();
    expect((await requestNewAccount(loser, codeA)).error).toBeNull();
    const winMail = await waitForMail(winner, { sinceMs: sent });
    const loseMail = await waitForMail(loser, { sinceMs: sent });

    const win = await anonClient().auth.verifyOtp({ email: winner, token: winMail.codes[0], type: 'email' });
    expect(win.error).toBeNull();
    const late = await anonClient().auth.verifyOtp({ email: loser, token: loseMail.codes[0], type: 'email' });
    expect(late.error).not.toBeNull();
    expect(await codeUsedBy(codeA)).toBe(win.data.user!.id);

    // second attempt with a fresh code
    const sent2 = Date.now();
    expect((await requestNewAccount(loser, codeB)).error).toBeNull();
    const mail2 = await waitForMail(loser, { sinceMs: sent2 });
    const retry = await anonClient().auth.verifyOtp({ email: loser, token: mail2.codes[0], type: 'email' });
    expect(retry.error).toBeNull();
    expect(retry.data.session).not.toBeNull();
    expect(await codeUsedBy(codeB)).toBe(retry.data.user!.id);
  });

  // Review T-003 round 2, finding A: expiry has no database event, so the invite must run out by time
  // alone (no UPDATE on invites: that would fire the cleanup trigger and hide the client path).
  // Code A is valid for ~7 s after its first request, then expires while the user is still unconfirmed.
  async function expireWithoutEvent(email: string) {
    const codeA = await newInvite({ createdAt: new Date(Date.now() - 7 * 24 * 3600 * 1000 + 7000) });
    const codeB = await newInvite();
    const sent = Date.now();
    expect((await requestNewAccount(email, codeA)).error).toBeNull();
    expect(await userExists(email)).toBe(true); // created while A was still valid
    await waitForMail(email, { sinceMs: sent });
    const wait = Date.now() - sent;
    await new Promise((r) => setTimeout(r, Math.max(0, 8000 - wait))); // past the 7-day edge
    return { codeA, codeB };
  }

  it('a code that expired between request and confirmation does not lock the address out (client path)', async () => {
    const email = newEmail('retry-expired');
    const { codeA, codeB } = await expireWithoutEvent(email);

    // exactly what requestCode in src/lib/auth.ts does: check, refresh_pending_invite, then the OTP request
    const anon = anonClient();
    expect((await anon.rpc('check_invite', { code: codeB })).data).toBe(true);
    const refresh = await anon.rpc('refresh_pending_invite', { p_email: email, p_code: codeB });
    expect(refresh.error).toBeNull();

    const sent2 = Date.now();
    expect((await requestNewAccount(email, codeB)).error).toBeNull();
    const mail2 = await waitForMail(email, { sinceMs: sent2 });
    const ok = await anonClient().auth.verifyOtp({ email, token: mail2.codes[0], type: 'email' });
    expect(ok.error).toBeNull();
    expect(ok.data.session).not.toBeNull();
    expect(await codeUsedBy(codeB)).toBe(ok.data.user!.id);
    expect(await codeUsedBy(codeA)).toBeNull();
  }, 40_000);

  // Review T-003 round 3, finding C: cleanup is per address. Another unconfirmed address whose code also
  // expired must stay untouched when someone else refreshes theirs.
  it('refresh_pending_invite leaves an unconfirmed user on another address alone', async () => {
    const other = newEmail('retry-expired-other');
    const mine = newEmail('retry-expired-mine');
    const codeOther = await newInvite({ createdAt: new Date(Date.now() - 7 * 24 * 3600 * 1000 + 7000) });
    const codeMine = await newInvite({ createdAt: new Date(Date.now() - 7 * 24 * 3600 * 1000 + 7000) });
    const codeNew = await newInvite();
    const sent = Date.now();
    expect((await requestNewAccount(other, codeOther)).error).toBeNull();
    expect((await requestNewAccount(mine, codeMine)).error).toBeNull();
    expect(await userExists(other)).toBe(true);
    expect(await userExists(mine)).toBe(true);
    await new Promise((r) => setTimeout(r, Math.max(0, 8000 - (Date.now() - sent)))); // both codes expired now

    const refresh = await anonClient().rpc('refresh_pending_invite', { p_email: mine, p_code: codeNew });
    expect(refresh.error).toBeNull();
    expect(await userExists(other)).toBe(true); // untouched: different address
  }, 40_000);

  // Negative control: proves the test above depends on refresh_pending_invite. Without the call the
  // stale pending user keeps code A and cannot confirm; that is the lock-out the fix removes.
  it('control: without refresh_pending_invite the expired pending address stays locked', async () => {
    const email = newEmail('retry-expired-ctl');
    const { codeB } = await expireWithoutEvent(email);
    const sent2 = Date.now();
    await requestNewAccount(email, codeB);
    const mail2 = await waitForMail(email, { sinceMs: sent2 });
    const r = await anonClient().auth.verifyOtp({ email, token: mail2.codes[0], type: 'email' });
    expect(r.data.session).toBeNull();
    expect(await codeUsedBy(codeB)).toBeNull();
  }, 40_000);
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

  it('invites is fully closed for the anonymous role', async () => {
    const anon = anonClient();
    expect((await anon.from('invites').select('*')).data ?? []).toHaveLength(0);
    expect((await anon.from('invites').insert({ code: 'ANONIEMECODE1' })).error).not.toBeNull();
    expect((await anon.from('invites').update({ used_by: u.id }).eq('code', u.inviteCode)).error).not.toBeNull();
    const check = await adminClient().from('invites').select('used_by').eq('code', u.inviteCode).single();
    expect(check.data?.used_by).toBe(u.id);
  });

  it('invites is closed for signed-in users too: no read, no insert', async () => {
    expect((await u.client.from('invites').select('*')).data ?? []).toHaveLength(0);
    const ins = await u.client.from('invites').insert({ code: 'EIGENCODE1234' });
    expect(ins.error).not.toBeNull();
  });
});

describe('the mail has the link and a 6-digit code (R-002 crit. 6)', () => {
  it('new user: confirmation mail with a /auth/v1/verify link and exactly one 6-digit code', async () => {
    const code = await newInvite();
    const email = newEmail('mail-new');
    const sent = Date.now();
    expect((await requestNewAccount(email, code)).error).toBeNull();
    const mail = await waitForMail(email, { sinceMs: sent });
    expect(mail.link).toMatch(/\/auth\/v1\/verify/);
    expect(mail.codes).toHaveLength(1);
    expect(mail.codes[0]).toMatch(/^\d{6}$/);
  });

  it('existing user: login mail with a /auth/v1/verify link and exactly one 6-digit code', async () => {
    const u = await createTestUser('mail-old');
    users.push(u);
    const sent = Date.now();
    const res = await anonClient().auth.signInWithOtp({ email: u.email, options: { shouldCreateUser: false } });
    expect(res.error).toBeNull();
    const mail = await waitForMail(u.email, { sinceMs: sent });
    expect(mail.link).toMatch(/\/auth\/v1\/verify/);
    expect(mail.codes).toHaveLength(1);
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
