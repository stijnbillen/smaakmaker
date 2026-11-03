import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  insertRecipe,
  validRecipe,
  type TestUser,
} from '../helpers/supabase-admin';

// T-006 / R-007 against the local Supabase: the database enforces every rule about the two times.
const CHECK_VIOLATION = '23514';

describe('recipe times (R-007)', () => {
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    await assertSupabaseUp(); // fails loudly, never skips
    a = await createTestUser('rta');
    b = await createTestUser('rtb');
  });

  afterAll(async () => {
    for (const u of [a, b]) if (u) await deleteTestUser(u);
  });

  const insert = (overrides: Record<string, unknown>) => a.client.from('recipes').insert(validRecipe(overrides));

  describe('crit. 1: required, whole minutes 0..4320', () => {
    it('refuses an insert without prep_minutes', async () => {
      const res = await insert({ prep_minutes: undefined });
      expect(res.error?.code).toBe(CHECK_VIOLATION);
    });

    it('refuses an insert without total_minutes', async () => {
      const res = await insert({ total_minutes: undefined });
      expect(res.error?.code).toBe(CHECK_VIOLATION);
    });

    it.each([
      ['prep -1', { prep_minutes: -1, total_minutes: 20 }],
      ['prep 4321', { prep_minutes: 4321, total_minutes: 4321 }],
      ['total -1', { prep_minutes: 0, total_minutes: -1 }],
      ['total 4321', { prep_minutes: 10, total_minutes: 4321 }],
    ])('refuses %s with a check violation', async (_n, overrides) => {
      const res = await insert(overrides);
      expect(res.error?.code).toBe(CHECK_VIOLATION);
    });

    it.each([
      ['a text "abc" as prep', { prep_minutes: 'abc' }],
      ['a text "abc" as total', { total_minutes: 'abc' }],
      ['1.5 as prep', { prep_minutes: 1.5, total_minutes: 20 }],
      ['1.5 as total', { total_minutes: 1.5 }],
    ])('refuses %s (type error; the exact code is PostgREST-version dependent)', async (_n, overrides) => {
      const res = await insert(overrides);
      expect(res.error).not.toBeNull();
      expect(res.error?.code).toBeTruthy();
    });

    it('accepts 0/0 and 4320/4320', async () => {
      expect((await insert({ prep_minutes: 0, total_minutes: 0 })).error).toBeNull();
      expect((await insert({ prep_minutes: 4320, total_minutes: 4320 })).error).toBeNull();
    });

    it('accepts a number in a string ("30"), which PostgREST turns into an integer', async () => {
      expect((await insert({ prep_minutes: '30', total_minutes: '60' })).error).toBeNull();
    });

    it('checks the same on update by the author', async () => {
      const row = await insertRecipe(a.client);
      const upd = (patch: Record<string, unknown>) =>
        a.client.from('recipes').update(patch).eq('id', row.id).select('prep_minutes,total_minutes');
      expect((await upd({ total_minutes: 4321 })).error?.code).toBe(CHECK_VIOLATION);
      expect((await upd({ prep_minutes: -1 })).error?.code).toBe(CHECK_VIOLATION);
      expect((await upd({ prep_minutes: null })).error?.code).toBe(CHECK_VIOLATION);
      expect((await upd({ total_minutes: null })).error?.code).toBe(CHECK_VIOLATION);
      expect((await upd({ prep_minutes: 'abc' })).error).not.toBeNull();
      expect((await upd({ total_minutes: 1.5 })).error).not.toBeNull();
      const ok = await upd({ prep_minutes: 0, total_minutes: 4320 });
      expect(ok.error).toBeNull();
      expect(ok.data).toEqual([{ prep_minutes: 0, total_minutes: 4320 }]);
    });
  });

  describe('crit. 2: total >= prep', () => {
    it('refuses 30/29 (check recipes_total_ge_prep) and accepts 30/30', async () => {
      const bad = await insert({ prep_minutes: 30, total_minutes: 29 });
      expect(bad.error?.code).toBe(CHECK_VIOLATION);
      expect(bad.error?.message).toContain('recipes_total_ge_prep');
      expect((await insert({ prep_minutes: 30, total_minutes: 30 })).error).toBeNull();
    });

    it('refuses an update that raises only prep_minutes above the stored total', async () => {
      const row = await insertRecipe(a.client, { prep_minutes: 10, total_minutes: 20 });
      const res = await a.client.from('recipes').update({ prep_minutes: 21 }).eq('id', row.id).select('id');
      expect(res.error?.code).toBe(CHECK_VIOLATION);
      const check = await adminClient().from('recipes').select('prep_minutes,total_minutes').eq('id', row.id).single();
      expect(check.data).toEqual({ prep_minutes: 10, total_minutes: 20 });
    });

    it('refuses an update that lowers only total_minutes below the stored prep', async () => {
      const row = await insertRecipe(a.client, { prep_minutes: 10, total_minutes: 20 });
      const res = await a.client.from('recipes').update({ total_minutes: 9 }).eq('id', row.id).select('id');
      expect(res.error?.code).toBe(CHECK_VIOLATION);
    });
  });

  describe('only the author edits the times', () => {
    it('lets the author update both columns (column right)', async () => {
      const row = await insertRecipe(a.client, { prep_minutes: 10, total_minutes: 20 });
      const res = await a.client
        .from('recipes')
        .update({ prep_minutes: 15, total_minutes: 90 })
        .eq('id', row.id)
        .select('prep_minutes,total_minutes');
      expect(res.error).toBeNull();
      expect(res.data).toEqual([{ prep_minutes: 15, total_minutes: 90 }]);
    });

    it('gives another user 0 rows and leaves the times unchanged', async () => {
      const row = await insertRecipe(a.client, { prep_minutes: 10, total_minutes: 20 });
      const res = await b.client
        .from('recipes')
        .update({ prep_minutes: 1, total_minutes: 2 })
        .eq('id', row.id)
        .select('id');
      expect(res.data ?? []).toHaveLength(0);
      const check = await adminClient().from('recipes').select('prep_minutes,total_minutes').eq('id', row.id).single();
      expect(check.data).toEqual({ prep_minutes: 10, total_minutes: 20 });
    });
  });
});
