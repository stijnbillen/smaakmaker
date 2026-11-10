import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { countMails, waitForMail } from '../helpers/mailpit';
import { authUser, userIdByEmail } from '../helpers/pg';
import {
  adminClient,
  anonClient,
  assertSupabaseUp,
  createInvitation,
  createTestUser,
  deleteInvitations,
  deleteTestUser,
  getInvitation,
  inviteRpc,
  makeAdmin,
  requestCode,
  requestInviteMail,
  setInvitationSentAt,
  uniqueEmail,
  type TestUser,
} from '../helpers/supabase-admin';

// T-028 / R-002: signing in needs only an e-mail address. sign_in_status decides beforehand whether a mail may leave.
// Runs against the local Supabase; mails come from the local Mailpit.
const createdEmails: string[] = [];
const users: TestUser[] = [];
let boss: TestUser;

const newEmail = (label: string) => {
  const e = uniqueEmail(label);
  createdEmails.push(e);
  return e;
};
const status = async (email: string) => {
  const r = await anonClient().rpc('sign_in_status', { p_email: email });
  expect(r.error).toBeNull();
  return r.data as string;
};
const EIGHT_DAYS_AGO = () => new Date(Date.now() - (7 * 24 * 3600 + 1) * 1000);

beforeAll(async () => {
  await assertSupabaseUp();
  boss = await createTestUser('sisboss');
  await makeAdmin(boss.id);
  users.push(boss);
});

afterAll(async () => {
  for (const u of users) await deleteTestUser(u);
  for (const e of createdEmails) {
    const id = await userIdByEmail(e);
    if (id) await adminClient().auth.admin.deleteUser(id);
  }
  await deleteInvitations(createdEmails);
});

describe('unknown, expired or revoked address: no mail, no account (R-002 crit. 2)', () => {
  async function expectNothingHappened(email: string, mailsBefore: number) {
    const res = await requestCode(email);
    expect(res.status).toBe('unknown');
    expect(res.error).toBeNull();
    expect(await countMails(email)).toBe(mailsBefore);
    expect(await authUser(email)).toBeNull();
  }

  it('(a) an address that was never invited', async () => {
    const email = newEmail('nooit');
    expect(await status(email)).toBe('unknown');
    await expectNothingHappened(email, await countMails(email));
  });

  it('(b) an invitation 7 days and 1 second old, with an unconfirmed user from the mail of the administrator', async () => {
    const email = newEmail('verlopen');
    expect((await inviteRpc(boss.client, 'invite_user', email)).error).toBeNull();
    expect((await requestInviteMail(email)).error).toBeNull();
    expect(await authUser(email)).not.toBeNull(); // the administrator's mail left: unconfirmed user exists
    await setInvitationSentAt(email, EIGHT_DAYS_AGO());

    const mailsBefore = await countMails(email);
    expect(await status(email)).toBe('unknown');
    const res = await requestCode(email);
    expect(res.status).toBe('unknown');
    expect(await countMails(email)).toBe(mailsBefore);
    expect(await authUser(email), 'the unconfirmed user is cleaned up').toBeNull();
  });

  it('(c) an invitation revoked with revoke_invitation', async () => {
    const email = newEmail('ingetrokken');
    expect((await inviteRpc(boss.client, 'invite_user', email)).error).toBeNull();
    expect((await boss.client.rpc('revoke_invitation', { p_email: email })).error).toBeNull();
    expect(await status(email)).toBe('unknown');
    await expectNothingHappened(email, await countMails(email));
  });

  // The cleanup lets GoTrue refuse a direct request as well (otp_disabled), so no mail leaves that way either.
  it('after the check, a direct signInWithOtp without user creation sends no mail either', async () => {
    const email = newEmail('direct');
    expect((await inviteRpc(boss.client, 'invite_user', email)).error).toBeNull();
    expect((await requestInviteMail(email)).error).toBeNull();
    await setInvitationSentAt(email, EIGHT_DAYS_AGO());
    expect(await status(email)).toBe('unknown');
    const before = await countMails(email);
    const res = await anonClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    expect(res.error).not.toBeNull();
    expect(await countMails(email)).toBe(before);
    expect(await authUser(email)).toBeNull();
  });
});

describe('an invited address signs in like a member (R-002 crit. 3)', () => {
  it('open invitation without a user yet (mail of the administrator never left): code, sign-in, accepted', async () => {
    const email = newEmail('uitgenodigd');
    expect((await inviteRpc(boss.client, 'invite_user', email)).error).toBeNull();
    expect(await authUser(email)).toBeNull();
    expect(await status(email)).toBe('invited');

    const sent = Date.now();
    const res = await requestCode(`  ${email.toUpperCase()} `);
    expect(res.status).toBe('invited');
    expect(res.error).toBeNull();
    const mail = await waitForMail(email, { sinceMs: sent });
    // crit. 7: link and exactly one distinct 6-digit code
    expect(mail.link).toMatch(/\/auth\/v1\/verify/);
    expect(new Set(mail.codes).size).toBe(1);
    expect(mail.codes[0]).toMatch(/^\d{6}$/);

    const client = anonClient();
    const wrong = mail.codes[0].slice(0, 5) + String((Number(mail.codes[0][5]) + 1) % 10);
    const bad = await client.auth.verifyOtp({ email, token: wrong, type: 'email' });
    expect(bad.error).not.toBeNull();
    expect(bad.data.session).toBeNull();
    expect((await getInvitation(email))?.accepted_at, 'a wrong code does not burn the invitation').toBeNull();

    const ok = await client.auth.verifyOtp({ email, token: mail.codes[0], type: 'email' });
    expect(ok.error).toBeNull();
    expect(ok.data.session).not.toBeNull();

    const inv = await getInvitation(email);
    expect(inv?.accepted_at).not.toBeNull();
    expect(inv?.accepted_by).toBe(ok.data.user!.id);
    const list = await boss.client.rpc('list_invitations');
    expect((list.data as { email: string }[]).map((r) => r.email)).not.toContain(email);
    expect(await status(email)).toBe('member');

    // no second account for the same address
    const again = await requestCode(email);
    expect(again.status).toBe('member');
    expect(again.error).toBeNull();
    const all = await adminClient().auth.admin.listUsers({ perPage: 1000 });
    expect(all.data.users.filter((u) => u.email === email)).toHaveLength(1);
    const dup = await adminClient().auth.admin.createUser({ email, email_confirm: true });
    expect(dup.error).not.toBeNull();
  });

  it('invitation with the mail of the administrator already sent (unconfirmed user): the person gets a new mail with a code', async () => {
    const email = newEmail('metmail');
    expect((await inviteRpc(boss.client, 'invite_user', email)).error).toBeNull();
    expect((await requestInviteMail(email)).error).toBeNull();
    expect(await status(email)).toBe('invited');

    const sent = Date.now();
    const res = await requestCode(email);
    expect(res.error).toBeNull();
    const mail = await waitForMail(email, { sinceMs: sent });
    expect(mail.codes[0]).toMatch(/^\d{6}$/);
    const ok = await anonClient().auth.verifyOtp({ email, token: mail.codes[0], type: 'email' });
    expect(ok.error).toBeNull();
    expect((await getInvitation(email))?.accepted_at).not.toBeNull();
  });
});

describe('sign_in_status is safe for anyone (R-002 crit. 6)', () => {
  it('gives anon only member, invited or unknown for a member, an invited and an unknown address', async () => {
    const member = await createTestUser('sismember');
    users.push(member);
    const invited = newEmail('sisinv');
    await createInvitation(invited);
    const unknown = newEmail('sisunk');
    const anon = anonClient();
    const results: unknown[] = [];
    for (const e of [member.email, invited, unknown]) {
      const r = await anon.rpc('sign_in_status', { p_email: e });
      expect(r.error).toBeNull();
      results.push(r.data);
    }
    expect(results).toEqual(['member', 'invited', 'unknown']);
  });

  it('an invalid address gives unknown, also with odd input', async () => {
    for (const bad of ['geen-adres', '', '   ', 'piet@']) {
      const r = await anonClient().rpc('sign_in_status', { p_email: bad });
      expect(r.error, bad).toBeNull();
      expect(r.data, bad).toBe('unknown');
    }
  });

  it('normalises like the client: upper case and spaces around a member address still give member', async () => {
    const member = await createTestUser('sisnorm');
    users.push(member);
    expect(await status(`  ${member.email.toUpperCase()} `)).toBe('member');
  });

  it('gives a plain text value, not a row or a list of columns', async () => {
    const r = await anonClient().rpc('sign_in_status', { p_email: boss.email });
    expect(typeof r.data).toBe('string');
    expect(r.data).toBe('member');
  });

  it('recipes, reviews and invitations stay closed for anon after calling it', async () => {
    const anon = anonClient();
    await anon.rpc('sign_in_status', { p_email: boss.email });
    expect((await anon.from('recipes').select('id')).data ?? []).toHaveLength(0);
    expect((await anon.from('reviews').select('id')).data ?? []).toHaveLength(0);
    expect((await anon.from('invitations').select('*')).data ?? []).toHaveLength(0);
  });
});
