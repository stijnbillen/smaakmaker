import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { countMails, waitForMail } from '../helpers/mailpit';
import {
  authUser,
  invitationValidAt,
  invitationValidAtMoment,
  invitationValidAtUnknown,
} from '../helpers/pg';
import {
  adminClient,
  anonClient,
  assertSupabaseUp,
  countInvitationSends,
  countInvitations,
  countSendsTo,
  createTestUser,
  deleteInvitations,
  deleteTestUser,
  getInvitation,
  inviteRpc,
  makeAdmin,
  requestInviteMail,
  seedInvitationSends,
  setInvitationSentAt,
  uniqueEmail,
  type TestUser,
} from '../helpers/supabase-admin';

// T-027 / R-027. Everything runs against the local Supabase; mails come from the local Mailpit.
// The 42501 code means "not allowed"; every other refusal has its own code, which the tests only require to
// be present and different per cause (the exact values are the developer's, written down in the migration).
const DAY = 24 * 3600 * 1000;
const NOT_ALLOWED = '42501';

const emails: string[] = [];
const users: TestUser[] = [];
let boss: TestUser;
let plain: TestUser;

function newEmail(label: string): string {
  const e = uniqueEmail(label);
  emails.push(e);
  return e;
}

async function newAdmin(label: string): Promise<TestUser> {
  const u = await createTestUser(label);
  await makeAdmin(u.id);
  users.push(u);
  return u;
}

const code = (res: { error: { code?: string } | null }): string | undefined => res.error?.code;

/** Waits briefly, then says how many mails an address has: for "no mail goes out" checks. */
async function mailsAfterWait(email: string): Promise<number> {
  await new Promise((r) => setTimeout(r, 1500));
  return countMails(email);
}

beforeAll(async () => {
  await assertSupabaseUp(); // fails loudly, never skips
  boss = await newAdmin('invboss');
  plain = await createTestUser('invplain');
  users.push(plain);
});

afterAll(async () => {
  const admin = adminClient();
  for (const e of emails) {
    const u = await authUser(e);
    if (u) await admin.auth.admin.deleteUser(u.id);
  }
  await deleteInvitations(emails);
  for (const u of users) await deleteTestUser(u);
});

describe('only an administrator can invite (R-027 crit. 1)', () => {
  it('anon and a normal user get 42501 on all four functions, and no row is added', async () => {
    const before = await countInvitations();
    const target = newEmail('nietmag');
    for (const [who, client] of [
      ['anon', anonClient()],
      ['plain', plain.client],
    ] as const) {
      expect(code(await inviteRpc(client, 'invite_user', target)), `${who} invite_user`).toBe(NOT_ALLOWED);
      expect(code(await inviteRpc(client, 'resend_invitation', target)), `${who} resend_invitation`).toBe(NOT_ALLOWED);
      expect(code(await client.rpc('revoke_invitation', { p_email: target })), `${who} revoke_invitation`).toBe(NOT_ALLOWED);
      expect(code(await client.rpc('list_invitations')), `${who} list_invitations`).toBe(NOT_ALLOWED);
    }
    expect(await countInvitations()).toBe(before);
    expect(await getInvitation(target)).toBeNull();
    expect(await countSendsTo(target)).toBe(0);
  });

  it('an administrator can call list_invitations (control: the refusals above are about the role)', async () => {
    const res = await boss.client.rpc('list_invitations');
    expect(res.error).toBeNull();
    expect(Array.isArray(res.data)).toBe(true);
  });

  it('invitations and invitation_sends are closed for anon and authenticated: select, insert, update, delete', async () => {
    const seeded = newEmail('dicht');
    expect((await inviteRpc(boss.client, 'invite_user', seeded)).error).toBeNull();
    const before = await getInvitation(seeded);
    expect(before).not.toBeNull();
    const sendsBefore = await countSendsTo(seeded);

    for (const [who, client] of [
      ['anon', anonClient()],
      ['plain', plain.client],
      ['boss', boss.client], // an administrator goes through the functions, not through the tables
    ] as const) {
      for (const table of ['invitations', 'invitation_sends']) {
        const read = await client.from(table).select('*');
        expect(read.error !== null || (read.data ?? []).length === 0, `${who} select ${table}`).toBe(true);
        const ins = await client.from(table).insert({ email: newEmail('direct') });
        expect(ins.error, `${who} insert ${table}`).not.toBeNull();
        const upd = await client.from(table).update({ sent_at: new Date(0).toISOString() }).eq('email', seeded).select();
        expect(upd.error !== null || (upd.data ?? []).length === 0, `${who} update ${table}`).toBe(true);
        const del = await client.from(table).delete().eq('email', seeded).select();
        expect(del.error !== null || (del.data ?? []).length === 0, `${who} delete ${table}`).toBe(true);
      }
    }
    expect(await getInvitation(seeded)).toEqual(before);
    expect(await countSendsTo(seeded)).toBe(sendsBefore);
  });

  it('signInWithOtp with shouldCreateUser for an address without invitation creates no user and sends no mail', async () => {
    const email = newEmail('zonder');
    await requestInviteMail(email);
    expect(await authUser(email)).toBeNull();
    expect(await mailsAfterWait(email)).toBe(0);
  });
});

describe('invalid address (R-027 crit. 2)', () => {
  it('invite_user refuses an invalid address with an own error code and writes nothing', async () => {
    const before = await countInvitations();
    for (const bad of ['geen-adres', 'jan@', 'jan mail.be', '', '   ', '@mail.be', 'jan@mail']) {
      const res = await inviteRpc(boss.client, 'invite_user', bad);
      expect(res.error, `"${bad}"`).not.toBeNull();
      expect(code(res), `"${bad}" is not a rights problem`).not.toBe(NOT_ALLOWED);
    }
    expect(await countInvitations()).toBe(before);
  });

  it('a valid address is accepted (control for the list above)', async () => {
    const res = await inviteRpc(boss.client, 'invite_user', newEmail('geldig'));
    expect(res.error).toBeNull();
  });

  it('the cause codes differ: invalid address, already a member and rate limit are three different codes', async () => {
    const invalid = code(await inviteRpc(boss.client, 'invite_user', 'geen-adres'));
    const member = code(await inviteRpc(boss.client, 'invite_user', plain.email));
    const limited = await newAdmin('invcodes');
    await seedInvitationSends(limited.id, 20);
    const limit = code(await inviteRpc(limited.client, 'invite_user', newEmail('codes')));
    for (const c of [invalid, member, limit]) {
      expect(c).toBeTruthy();
      expect(c).not.toBe(NOT_ALLOWED);
    }
    expect(new Set([invalid, member, limit]).size).toBe(3);
  });
});

describe('a valid invitation lasts 7 x 24 hours (R-027 crit. 4)', () => {
  it('invitation_is_valid_at: exactly sent_at + 7 days is valid, 1 second later is not', async () => {
    const email = newEmail('grens');
    expect((await inviteRpc(boss.client, 'invite_user', email)).error).toBeNull();
    expect(await invitationValidAt(email, '0 seconds')).toBe(true);
    expect(await invitationValidAt(email, '7 days')).toBe(true);
    expect(await invitationValidAt(email, '7 days 1 second')).toBe(false);
  });

  it('invitation_is_valid_at: an address without invitation is never valid', async () => {
    expect(await invitationValidAtUnknown(newEmail('onbekend'))).toBe(false);
  });

  async function inviteAndRequestMail(email: string) {
    expect((await inviteRpc(boss.client, 'invite_user', email)).error).toBeNull();
    const sent = Date.now();
    expect((await requestInviteMail(email)).error).toBeNull();
    return waitForMail(email, { sinceMs: sent });
  }

  it('at sent_at + 7 days minus 30 s the code from the mail still signs in', async () => {
    const email = newEmail('nogtijd');
    const mail = await inviteAndRequestMail(email);
    await setInvitationSentAt(email, new Date(Date.now() - 7 * DAY + 30_000));
    const verified = await anonClient().auth.verifyOtp({ email, token: mail.codes[0], type: 'email' });
    expect(verified.error).toBeNull();
    expect(verified.data.session).not.toBeNull();
  });

  it('at sent_at + 7 days + 1 s the code no longer signs in and the address stays unconfirmed', async () => {
    const email = newEmail('teLaat');
    const mail = await inviteAndRequestMail(email);
    await setInvitationSentAt(email, new Date(Date.now() - 7 * DAY - 1000));
    const verified = await anonClient().auth.verifyOtp({ email, token: mail.codes[0], type: 'email' });
    expect(verified.error).not.toBeNull();
    expect(verified.data.session).toBeNull();
    expect((await authUser(email))?.confirmed).not.toBe(true);
  });
});

describe('list of open invitations (R-027 crit. 5)', () => {
  interface ListRow {
    email: string;
    sent_at: string;
    expires_at: string;
  }

  it('list_invitations gives open ones only, newest first, with email, sent_at and expires_at = sent_at + 7 days', async () => {
    const older = newEmail('lijst-a');
    const newer = newEmail('lijst-b');
    const expired = newEmail('lijst-verlopen');
    const accepted = newEmail('lijst-aanvaard');
    for (const e of [older, expired, accepted, newer]) expect((await inviteRpc(boss.client, 'invite_user', e)).error).toBeNull();
    await setInvitationSentAt(older, new Date(Date.now() - 2 * DAY));
    await setInvitationSentAt(expired, new Date(Date.now() - 7 * DAY - 1000));

    const sent = Date.now();
    expect((await requestInviteMail(accepted)).error).toBeNull();
    const mail = await waitForMail(accepted, { sinceMs: sent });
    const ok = await anonClient().auth.verifyOtp({ email: accepted, token: mail.codes[0], type: 'email' });
    expect(ok.error).toBeNull();

    const res = await boss.client.rpc('list_invitations');
    expect(res.error).toBeNull();
    const rows = res.data as ListRow[];
    const mine = rows.filter((r) => [older, newer, expired, accepted].includes(r.email));
    expect(mine.map((r) => r.email)).toEqual([newer, older]);
    for (const r of mine) {
      expect(new Date(r.expires_at).getTime() - new Date(r.sent_at).getTime()).toBe(7 * DAY);
    }
    const times = rows.map((r) => new Date(r.sent_at).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('an invitation that is exactly 7 days old is still listed (boundary included)', async () => {
    const email = newEmail('lijst-grens');
    expect((await inviteRpc(boss.client, 'invite_user', email)).error).toBeNull();
    // 30 s of margin: the check runs a moment after the update
    await setInvitationSentAt(email, new Date(Date.now() - 7 * DAY + 30_000));
    const rows = (await boss.client.rpc('list_invitations')).data as ListRow[];
    expect(rows.map((r) => r.email)).toContain(email);
  });
});

describe('revoking (R-027 crit. 6)', () => {
  it('after revoke_invitation the earlier code fails, a new request makes no user and no mail, the unconfirmed user is gone', async () => {
    const email = newEmail('intrekken');
    expect((await inviteRpc(boss.client, 'invite_user', email)).error).toBeNull();
    const sent = Date.now();
    expect((await requestInviteMail(email)).error).toBeNull();
    const mail = await waitForMail(email, { sinceMs: sent });
    expect(await authUser(email)).not.toBeNull();

    const revoked = await boss.client.rpc('revoke_invitation', { p_email: email });
    expect(revoked.error).toBeNull();
    expect(await getInvitation(email)).toBeNull();
    expect(await authUser(email)).toBeNull();
    const rows = (await boss.client.rpc('list_invitations')).data as { email: string }[];
    expect(rows.map((r) => r.email)).not.toContain(email);

    const verified = await anonClient().auth.verifyOtp({ email, token: mail.codes[0], type: 'email' });
    expect(verified.error).not.toBeNull();
    expect(verified.data.session).toBeNull();

    const mailsBefore = await countMails(email);
    await requestInviteMail(email);
    expect(await authUser(email)).toBeNull();
    expect(await mailsAfterWait(email)).toBe(mailsBefore);
  });
});

describe('sending again (R-027 crit. 7)', () => {
  it('resend_invitation sets sent_at to now; the old sent_at + 7 days + 1 s is valid again', async () => {
    const email = newEmail('opnieuw');
    expect((await inviteRpc(boss.client, 'invite_user', email)).error).toBeNull();
    const oldSentAt = new Date(Date.now() - 6 * DAY);
    await setInvitationSentAt(email, oldSentAt);
    // control: from the old moment the invitation runs out 1 s after 7 days
    expect(await invitationValidAtMoment(email, new Date(oldSentAt.getTime() + 7 * DAY + 1000).toISOString())).toBe(false);

    const before = Date.now();
    const res = await inviteRpc(boss.client, 'resend_invitation', email);
    expect(res.error).toBeNull();
    const row = await getInvitation(email);
    const sentAt = new Date(row!.sent_at).getTime();
    expect(sentAt).toBeGreaterThanOrEqual(before - 5000);
    expect(sentAt).toBeLessThanOrEqual(Date.now() + 5000);
    expect(await invitationValidAtMoment(email, new Date(oldSentAt.getTime() + 7 * DAY + 1000).toISOString())).toBe(true);
  });

  it('resend_invitation for an address without invitation is refused with an own error code', async () => {
    const email = newEmail('opnieuw-onbekend');
    const res = await inviteRpc(boss.client, 'resend_invitation', email);
    expect(res.error).not.toBeNull();
    expect(code(res)).not.toBe(NOT_ALLOWED);
    expect(await getInvitation(email)).toBeNull();
  });

  it('a new code after resending signs in, the older code does not', async () => {
    const email = newEmail('opnieuw-code');
    expect((await inviteRpc(boss.client, 'invite_user', email)).error).toBeNull();
    const first = Date.now();
    expect((await requestInviteMail(email)).error).toBeNull();
    const mail1 = await waitForMail(email, { sinceMs: first });

    expect((await inviteRpc(boss.client, 'resend_invitation', email)).error).toBeNull();
    const second = Date.now();
    expect((await requestInviteMail(email)).error).toBeNull();
    const mail2 = await waitForMail(email, { sinceMs: second });
    expect(mail2.codes[0]).not.toBe(mail1.codes[0]);

    const old = await anonClient().auth.verifyOtp({ email, token: mail1.codes[0], type: 'email' });
    expect(old.error).not.toBeNull();
    const fresh = await anonClient().auth.verifyOtp({ email, token: mail2.codes[0], type: 'email' });
    expect(fresh.error).toBeNull();
    expect(fresh.data.session).not.toBeNull();
  });
});

describe('an address that already has an account (R-027 crit. 8)', () => {
  it('invite_user gives an own error code, changes no invitation and writes no send record', async () => {
    const member = await createTestUser('lid');
    users.push(member);
    const before = await getInvitation(member.email);
    const res = await inviteRpc(boss.client, 'invite_user', member.email);
    expect(res.error).not.toBeNull();
    expect(code(res)).not.toBe(NOT_ALLOWED);
    expect(await getInvitation(member.email)).toEqual(before);
    expect(await countSendsTo(member.email)).toBe(0);
  });

  it('resend_invitation for a member is refused as well', async () => {
    const member = await createTestUser('lid2');
    users.push(member);
    const res = await inviteRpc(boss.client, 'resend_invitation', member.email);
    expect(res.error).not.toBeNull();
    expect(await countSendsTo(member.email)).toBe(0);
  });
});

describe('inviting an open address again is sending again (R-027 crit. 9)', () => {
  it('two times invite_user: one row with a newer sent_at, two send records', async () => {
    const email = newEmail('dubbel');
    expect((await inviteRpc(boss.client, 'invite_user', email)).error).toBeNull();
    const first = (await getInvitation(email))!.sent_at;
    await new Promise((r) => setTimeout(r, 50));
    expect((await inviteRpc(boss.client, 'invite_user', email)).error).toBeNull();
    const second = (await getInvitation(email))!.sent_at;
    expect(new Date(second).getTime()).toBeGreaterThan(new Date(first).getTime());
    const all = await adminClient().from('invitations').select('email').eq('email', email);
    expect(all.data).toHaveLength(1);
    expect(await countSendsTo(email)).toBe(2);
  });
});

describe('at most 20 invitations per administrator per 24 hours (R-027 crit. 10)', () => {
  it('20 calls (invite_user and resend_invitation mixed) work, the 21st is refused and writes nothing', async () => {
    const admin = await newAdmin('invlimiet');
    const list = Array.from({ length: 10 }, (_, i) => newEmail(`lim${i}`));
    for (const e of list) expect((await inviteRpc(admin.client, 'invite_user', e)).error, e).toBeNull();
    for (const e of list) expect((await inviteRpc(admin.client, 'resend_invitation', e)).error, e).toBeNull();
    expect(await countInvitationSends(admin.id)).toBe(20);

    const extra = newEmail('lim21');
    const res = await inviteRpc(admin.client, 'invite_user', extra);
    expect(res.error).not.toBeNull();
    expect(code(res)).not.toBe(NOT_ALLOWED);
    expect(await getInvitation(extra)).toBeNull();
    expect(await countInvitationSends(admin.id)).toBe(20);

    // resending is refused too
    const again = await inviteRpc(admin.client, 'resend_invitation', list[0]);
    expect(again.error).not.toBeNull();
    expect(await countInvitationSends(admin.id)).toBe(20);
  });

  it('a send older than 24 hours and 1 second does not count; one a few seconds inside the window does', async () => {
    const outside = await newAdmin('invbuiten');
    await seedInvitationSends(outside.id, 20, new Date(Date.now() - DAY - 1000));
    expect((await inviteRpc(outside.client, 'invite_user', newEmail('buiten'))).error).toBeNull();

    // The exact edge (24 h to the second) cannot be hit through the API: time passes between seeding and calling.
    const inside = await newAdmin('invbinnen');
    await seedInvitationSends(inside.id, 20, new Date(Date.now() - DAY + 10_000));
    const extra = newEmail('binnen');
    expect((await inviteRpc(inside.client, 'invite_user', extra)).error).not.toBeNull();
    expect(await getInvitation(extra)).toBeNull();
  });

  it('the limit is per administrator: a second administrator can still send', async () => {
    const full = await newAdmin('invvol');
    await seedInvitationSends(full.id, 20);
    expect((await inviteRpc(full.client, 'invite_user', newEmail('vol'))).error).not.toBeNull();
    const other = await newAdmin('invander');
    expect((await inviteRpc(other.client, 'invite_user', newEmail('ander'))).error).toBeNull();
  });

  it('two simultaneous calls at 19 give exactly one success; the other gets the limit error (crit. 10)', async () => {
    const admin = await newAdmin('invrace');
    await seedInvitationSends(admin.id, 19);
    const results = await Promise.all([
      inviteRpc(admin.client, 'invite_user', newEmail('race1')),
      inviteRpc(admin.client, 'invite_user', newEmail('race2')),
    ]);
    const ok = results.filter((r) => r.error === null);
    const failed = results.filter((r) => r.error !== null);
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(code(failed[0])).not.toBe(NOT_ALLOWED);
    expect(await countInvitationSends(admin.id)).toBe(20);
  });
});

describe('capitals and spaces (R-027 crit. 11)', () => {
  it('"  Jan@Mail.be " and "jan@mail.be" are one row, stored lowercase, the second call is sending again', async () => {
    const lower = newEmail('hoofd').toLowerCase();
    const messy = `  ${lower.replace(/^./, (c) => c.toUpperCase())} `;
    expect((await inviteRpc(boss.client, 'invite_user', messy)).error).toBeNull();
    expect((await inviteRpc(boss.client, 'invite_user', lower)).error).toBeNull();
    const rows = await adminClient().from('invitations').select('email').ilike('email', lower);
    expect(rows.data).toEqual([{ email: lower }]);
    expect(await countSendsTo(lower)).toBe(2);
  });

  it('a confirmed user jan@mail.be makes invite_user("JAN@mail.be") a "has an account" refusal', async () => {
    const member = await createTestUser('hoofdlid');
    users.push(member);
    const sendsBefore = await countSendsTo(member.email);
    const res = await inviteRpc(boss.client, 'invite_user', ` ${member.email.toUpperCase()} `);
    expect(res.error).not.toBeNull();
    expect(code(res)).toBe(code(await inviteRpc(boss.client, 'invite_user', member.email)));
    expect(await countSendsTo(member.email)).toBe(sendsBefore);
  });
});

// Plan risk: the database must not refuse what the client allows, or the other way round.
describe('database and client agree on what a valid address is (R-027 crit. 2)', () => {
  const EXAMPLES = [
    '{u}@mail.be',
    '{u}.x@mail.co.uk',
    '{u}+tag@mail.be',
    '{u}@sub.mail.be',
    'jan@',
    'jan mail.be',
    '@mail.be',
    'jan@mail',
    'jan@@mail.be',
    'jan@mail..be',
    'jan@.mail.be',
    'jan@mail.',
    'jan @mail.be',
    'jan@ma il.be',
  ];

  it('invite_user accepts exactly the addresses that isValidEmail accepts', async () => {
    const { isValidEmail } = await import('../../src/lib/validation');
    const admin = await newAdmin('invpariteit');
    const token = Math.random().toString(36).slice(2, 10);
    const mismatches: string[] = [];
    for (const example of EXAMPLES) {
      const address = example.replace('{u}', `pariteit${token}`);
      const normalized = address.trim().toLowerCase();
      const client = isValidEmail(normalized);
      const res = await inviteRpc(admin.client, 'invite_user', address);
      if (res.error === null) emails.push(normalized);
      if (client !== (res.error === null)) mismatches.push(`${address}: client ${client}, database ${res.error === null}`);
    }
    expect(mismatches).toEqual([]);
  });
});

describe('the language of the administrator goes into the user (R-027 crit. 3)', () => {
  it('signInWithOtp with data.lang gives the new user raw_user_meta_data.lang, so the mail has that language', async () => {
    const email = newEmail('taal');
    expect((await inviteRpc(boss.client, 'invite_user', email, 'fr')).error).toBeNull();
    expect((await getInvitation(email))?.lang).toBe('fr');
    expect((await requestInviteMail(email, 'fr')).error).toBeNull();
    expect((await authUser(email))?.lang).toBe('fr');
  });
});
