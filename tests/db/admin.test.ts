import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from '../helpers/pg';
import {
  adminClient,
  anonClient,
  assertSupabaseUp,
  countInvitations,
  createTestUser,
  deleteInvitations,
  deleteTestUser,
  insertRecipe as insertValidRecipe,
  inviteRpc,
  makeAdmin,
  uniqueEmail,
  type TestUser,
} from '../helpers/supabase-admin';

// T-004 / R-017, invite part replaced by T-027 / R-027. Everything runs against the local Supabase;
// grant_admin only through direct SQL.

describe('administrator (R-017)', () => {
  let plain: TestUser;
  let other: TestUser;
  let boss: TestUser;
  const invited: string[] = [];

  beforeAll(async () => {
    await assertSupabaseUp(); // fails loudly, never skips
    plain = await createTestUser('plain', { displayName: 'Gewone Gert' });
    other = await createTestUser('other');
    boss = await createTestUser('boss');
    await makeAdmin(boss.id);
  });

  afterAll(async () => {
    await deleteInvitations(invited);
    for (const u of [plain, other, boss]) if (u) await deleteTestUser(u);
  });

  describe('crit. 1: only an administrator may use the invite functions', () => {
    it('is_admin() is false for a normal user and true for an administrator', async () => {
      expect((await plain.client.rpc('is_admin')).data).toBe(false);
      expect((await boss.client.rpc('is_admin')).data).toBe(true);
    });

    it('refuses list_invitations and invite_user for a normal user with 42501, and adds no row', async () => {
      const before = await countInvitations();
      const target = uniqueEmail('geweigerd');
      const list = await plain.client.rpc('list_invitations');
      const create = await inviteRpc(plain.client, 'invite_user', target);
      expect(list.error?.code).toBe('42501');
      expect(create.error?.code).toBe('42501');
      expect(await countInvitations()).toBe(before);
    });

    it('refuses direct select and insert on invitations for a normal user', async () => {
      const before = await countInvitations();
      const read = await plain.client.from('invitations').select('email');
      expect(read.error?.message ?? '').toMatch(/permission denied/i);
      const write = await plain.client.from('invitations').insert({ email: uniqueEmail('direct') });
      expect(write.error?.message ?? '').toMatch(/permission denied/i);
      expect(await countInvitations()).toBe(before);
    });

    it('refuses the same for the anonymous (public key only) role', async () => {
      const before = await countInvitations();
      const anon = anonClient();
      expect((await anon.rpc('list_invitations')).error?.code).toBe('42501');
      expect((await inviteRpc(anon, 'invite_user', uniqueEmail('anon'))).error?.code).toBe('42501');
      expect((await anon.from('invitations').select('email')).error?.message ?? '').toMatch(/permission denied/i);
      expect((await anon.from('invitations').insert({ email: uniqueEmail('anon2') })).error?.message ?? '').toMatch(
        /permission denied/i,
      );
      expect(await countInvitations()).toBe(before);
    });

    it('lets an administrator call the same functions', async () => {
      const list = await boss.client.rpc('list_invitations');
      expect(list.error).toBeNull();
      expect(Array.isArray(list.data)).toBe(true);
      const email = uniqueEmail('beheerder');
      invited.push(email);
      expect((await inviteRpc(boss.client, 'invite_user', email)).error).toBeNull();
    });

    it('the old code functions no longer exist (R-027: codes replaced by e-mail invitations)', async () => {
      const calls: [string, Record<string, string>][] = [
        ['create_invite', {}],
        ['list_invites', {}],
      ];
      for (const [fn, args] of calls) {
        const res = await boss.client.rpc(fn, args);
        expect(res.error, fn).not.toBeNull();
        expect(res.data, fn).toBeNull();
      }
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
        expect((await target.client.rpc('list_invitations')).error?.code).toBe('42501');
        await sql(`select public.grant_admin('${target.email}')`);
        const list = await target.client.rpc('list_invitations');
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
