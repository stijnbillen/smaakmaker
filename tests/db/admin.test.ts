import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from '../helpers/pg';
import {
  adminClient,
  anonClient,
  assertSupabaseUp,
  createInvite,
  createTestUser,
  deleteTestUser,
  insertRecipe as insertValidRecipe,
  makeAdmin,
  type TestUser,
} from '../helpers/supabase-admin';

// T-004 / R-017. Everything runs against the local Supabase; grant_admin only through direct SQL.
const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/;
const DAY_MS = 24 * 3600 * 1000;

interface InviteRow {
  code: string;
  status: string;
  used_by_name: string | null;
  expires_at: string;
  created_at: string;
}

/** PostgREST returns a single composite as an object and a table as an array; accept both. */
const first = <T>(data: T | T[] | null): T => (Array.isArray(data) ? data[0] : (data as T));

async function inviteCount(): Promise<number> {
  const res = await adminClient().from('invites').select('id', { count: 'exact', head: true });
  if (res.error) throw res.error;
  return res.count ?? 0;
}

describe('administrator (R-017)', () => {
  let plain: TestUser;
  let other: TestUser;
  let boss: TestUser;
  const createdCodes: string[] = [];

  beforeAll(async () => {
    await assertSupabaseUp(); // fails loudly, never skips
    plain = await createTestUser('plain', { displayName: 'Gewone Gert' });
    other = await createTestUser('other');
    boss = await createTestUser('boss');
    await makeAdmin(boss.id);
  });

  afterAll(async () => {
    const admin = adminClient();
    if (createdCodes.length) await admin.from('invites').delete().in('code', createdCodes);
    if (boss) await admin.from('invites').delete().eq('created_by', boss.id);
    for (const u of [plain, other, boss]) if (u) await deleteTestUser(u);
  });

  describe('crit. 1: only an administrator may use the invite functions', () => {
    it('is_admin() is false for a normal user and true for an administrator', async () => {
      expect((await plain.client.rpc('is_admin')).data).toBe(false);
      expect((await boss.client.rpc('is_admin')).data).toBe(true);
    });

    it('refuses list_invites and create_invite for a normal user with 42501, and adds no row', async () => {
      const before = await inviteCount();
      const list = await plain.client.rpc('list_invites');
      const create = await plain.client.rpc('create_invite');
      expect(list.error?.code).toBe('42501');
      expect(create.error?.code).toBe('42501');
      expect(await inviteCount()).toBe(before);
    });

    it('refuses direct select and insert on invites for a normal user', async () => {
      const before = await inviteCount();
      const read = await plain.client.from('invites').select('code');
      expect(read.error?.message).toMatch(/permission denied/i);
      const write = await plain.client.from('invites').insert({ code: 'DIRECTINS1' });
      expect(write.error?.message).toMatch(/permission denied/i);
      expect(await inviteCount()).toBe(before);
    });

    it('refuses the same for the anonymous (public key only) role', async () => {
      const before = await inviteCount();
      const anon = anonClient();
      expect((await anon.rpc('list_invites')).error?.code).toBe('42501');
      expect((await anon.rpc('create_invite')).error?.code).toBe('42501');
      expect((await anon.from('invites').select('code')).error?.message).toMatch(/permission denied/i);
      expect((await anon.from('invites').insert({ code: 'ANONINSRT1' })).error?.message).toMatch(/permission denied/i);
      expect(await inviteCount()).toBe(before);
    });

    it('lets an administrator call the same functions', async () => {
      const list = await boss.client.rpc('list_invites');
      expect(list.error).toBeNull();
      expect(Array.isArray(list.data)).toBe(true);
      const create = await boss.client.rpc('create_invite');
      expect(create.error).toBeNull();
      createdCodes.push(first<InviteRow>(create.data).code);
    });
  });

  describe('crit. 2: create codes and see status, user and expiry', () => {
    it('create_invite returns a 10-character code from the safe alphabet that check_invite accepts', async () => {
      const res = await boss.client.rpc('create_invite');
      expect(res.error).toBeNull();
      const row = first<InviteRow>(res.data);
      createdCodes.push(row.code);
      expect(row.code).toMatch(CODE_PATTERN);
      expect(row.status).toBe('open');
      const check = await anonClient().rpc('check_invite', { code: row.code });
      expect(check.data).toBe(true);
    });

    it('50 calls give 50 different codes', async () => {
      const codes = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const res = await boss.client.rpc('create_invite');
        expect(res.error).toBeNull();
        const code = first<InviteRow>(res.data).code;
        createdCodes.push(code);
        codes.add(code);
      }
      expect(codes.size).toBe(50);
    });

    it('invite_status: open on the 7-day boundary, expired one second later, used wins over expiry', async () => {
      const q = async (created: string, used: string | null, at: string) =>
        (
          await sql<{ s: string }>(
            `select public.invite_status('${created}'::timestamptz, ${used ? `'${used}'::timestamptz` : 'null::timestamptz'}, '${at}'::timestamptz) as s`,
          )
        )[0].s;
      const c = '2026-01-01 12:00:00+00';
      expect(await q(c, null, '2026-01-08 12:00:00+00')).toBe('open'); // created_at + 7 days
      expect(await q(c, null, '2026-01-08 12:00:01+00')).toBe('verlopen');
      expect(await q(c, null, '2026-01-01 12:00:00+00')).toBe('open');
      expect(await q(c, '2026-01-02 12:00:00+00', '2026-01-02 12:00:00+00')).toBe('gebruikt');
      // used first, then past the 7 days: still "gebruikt"
      expect(await q(c, '2026-01-02 12:00:00+00', '2026-03-01 12:00:00+00')).toBe('gebruikt');
    });

    it('invite_status uses the same boundary as invite_is_valid_at', async () => {
      const code = await createInvite();
      createdCodes.push(code);
      const rows = await sql<{ s: string; v: boolean }>(
        `select public.invite_status(created_at, used_at, created_at + interval '7 days') as s,
                public.invite_is_valid_at(code, created_at + interval '7 days') as v
         from public.invites where code = '${code}'`,
      );
      expect(rows[0]).toEqual({ s: 'open', v: true });
      const later = await sql<{ s: string; v: boolean }>(
        `select public.invite_status(created_at, used_at, created_at + interval '7 days 1 second') as s,
                public.invite_is_valid_at(code, created_at + interval '7 days 1 second') as v
         from public.invites where code = '${code}'`,
      );
      expect(later[0]).toEqual({ s: 'verlopen', v: false });
    });

    it('list_invites gives status, user name, expiry and creation date, newest first', async () => {
      const openCode = await createInvite();
      const expiredCode = await createInvite({ createdAt: new Date(Date.now() - 8 * DAY_MS) });
      createdCodes.push(openCode, expiredCode);

      const res = await boss.client.rpc('list_invites');
      expect(res.error).toBeNull();
      const rows = res.data as InviteRow[];
      const by = (code: string) => rows.find((r) => r.code === code)!;

      // a code spent by a test user: "gebruikt" with that user's display name
      const used = by(plain.inviteCode);
      expect(used.status).toBe('gebruikt');
      expect(used.used_by_name).toBe('Gewone Gert');

      expect(by(openCode).status).toBe('open');
      expect(by(openCode).used_by_name).toBeNull();
      expect(by(expiredCode).status).toBe('verlopen');
      expect(by(expiredCode).used_by_name).toBeNull();

      for (const r of [used, by(openCode), by(expiredCode)]) {
        expect(new Date(r.expires_at).getTime() - new Date(r.created_at).getTime()).toBe(7 * DAY_MS);
      }

      const times = rows.map((r) => new Date(r.created_at).getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });
  });

  describe('crit. 3: deleting recipes (author or administrator)', () => {
    async function insertRecipe(owner: TestUser, title: string): Promise<string> {
      return (await insertValidRecipe(owner.client, { title })).id;
    }
    const exists = async (id: string) =>
      ((await adminClient().from('recipes').select('id').eq('id', id)).data ?? []).length === 1;

    it('an author deletes their own recipe', async () => {
      const id = await insertRecipe(plain, 'Eigen recept weg');
      const del = await plain.client.from('recipes').delete().eq('id', id).select('id');
      expect(del.error).toBeNull();
      expect(del.data).toHaveLength(1);
      expect(await exists(id)).toBe(false);
    });

    it('another normal user deletes nothing (0 rows) and the recipe stays', async () => {
      const id = await insertRecipe(plain, 'Blijft staan');
      const del = await other.client.from('recipes').delete().eq('id', id).select('id');
      expect(del.data ?? []).toHaveLength(0);
      expect(await exists(id)).toBe(true);
    });

    it('an administrator deletes the recipe of someone else', async () => {
      const id = await insertRecipe(other, 'Beheerder ruimt op');
      const del = await boss.client.from('recipes').delete().eq('id', id).select('id');
      expect(del.error).toBeNull();
      expect(del.data).toHaveLength(1);
      expect(await exists(id)).toBe(false);
    });

    it('an administrator may delete but not edit the recipe of someone else', async () => {
      const id = await insertRecipe(other, 'Alleen auteur wijzigt');
      const upd = await boss.client.from('recipes').update({ title: 'Door beheerder' }).eq('id', id).select('id');
      expect(upd.data ?? []).toHaveLength(0);
      const row = await adminClient().from('recipes').select('title').eq('id', id).single();
      expect(row.data?.title).toBe('Alleen auteur wijzigt');
    });

    it('anonymous visitors delete nothing', async () => {
      const id = await insertRecipe(plain, 'Niet voor anoniem');
      await anonClient().from('recipes').delete().eq('id', id);
      expect(await exists(id)).toBe(true);
    });
  });

  describe('crit. 4: the first administrator is set outside the app', () => {
    it('a normal user cannot insert into admins or read it', async () => {
      const ins = await plain.client.from('admins').insert({ user_id: plain.id });
      expect(ins.error).not.toBeNull();
      expect((await plain.client.rpc('is_admin')).data).toBe(false);
      const read = await plain.client.from('admins').select('user_id');
      expect(read.error?.message ?? '').toMatch(/permission denied/i);
    });

    it('grant_admin is refused for anon and authenticated', async () => {
      const a = await anonClient().rpc('grant_admin', { p_email: plain.email });
      expect(a.error).not.toBeNull();
      const b = await plain.client.rpc('grant_admin', { p_email: plain.email });
      expect(b.error).not.toBeNull();
      expect((await plain.client.rpc('is_admin')).data).toBe(false);
    });

    it('grant_admin through direct SQL makes that user administrator; unknown address fails', async () => {
      const target = await createTestUser('promoted');
      try {
        expect((await target.client.rpc('list_invites')).error?.code).toBe('42501');
        await sql(`select public.grant_admin('${target.email}')`);
        const list = await target.client.rpc('list_invites');
        expect(list.error).toBeNull();
        // running it twice is harmless
        await sql(`select public.grant_admin('${target.email}')`);
      } finally {
        await deleteTestUser(target);
      }
      await expect(sql(`select public.grant_admin('bestaat-niet-${Date.now()}@example.test')`)).rejects.toThrow();
    });
  });
});
