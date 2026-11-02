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

// T-007 / R-013 crit. 1 against the local Supabase: the database enforces servings.
const CHECK_VIOLATION = '23514';

describe('recipe servings (R-013)', () => {
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    await assertSupabaseUp();
    a = await createTestUser('rsa');
    b = await createTestUser('rsb');
  });

  afterAll(async () => {
    for (const u of [a, b]) if (u) await deleteTestUser(u);
  });

  const insert = (overrides: Record<string, unknown>) => a.client.from('recipes').insert(validRecipe(overrides));

  it('refuses an insert without servings (recipes_servings_required)', async () => {
    const res = await insert({ servings: undefined });
    expect(res.error?.code).toBe(CHECK_VIOLATION);
    expect(res.error?.message).toContain('recipes_servings_required');
  });

  it.each([0, 100, -1])('refuses %s (recipes_servings_range)', async (servings) => {
    const res = await insert({ servings });
    expect(res.error?.code).toBe(CHECK_VIOLATION);
    expect(res.error?.message).toContain('recipes_servings_range');
  });

  it.each([
    ['text "abc"', 'abc'],
    ['1.5', 1.5],
  ])('refuses %s (type error; brief expects 22P02)', async (_n, servings) => {
    const res = await insert({ servings });
    expect(res.error).not.toBeNull();
    expect(res.error?.code).toBe('22P02');
  });

  it('accepts 1 and 99', async () => {
    expect((await insert({ servings: 1 })).error).toBeNull();
    expect((await insert({ servings: 99 })).error).toBeNull();
  });

  it('checks the same on update by the author', async () => {
    const row = await insertRecipe(a.client);
    const upd = (servings: unknown) => a.client.from('recipes').update({ servings }).eq('id', row.id).select('servings');
    expect((await upd(0)).error?.code).toBe(CHECK_VIOLATION);
    expect((await upd(100)).error?.code).toBe(CHECK_VIOLATION);
    expect((await upd(null)).error?.code).toBe(CHECK_VIOLATION);
    expect((await upd('abc')).error).not.toBeNull();
    expect((await upd(1.5)).error).not.toBeNull();
    const ok = await upd(99);
    expect(ok.error).toBeNull();
    expect(ok.data).toEqual([{ servings: 99 }]);
    expect((await upd(1)).error).toBeNull();
  });

  it('gives another user 0 rows on update and leaves servings unchanged', async () => {
    const row = await insertRecipe(a.client, { servings: 4 });
    const res = await b.client.from('recipes').update({ servings: 7 }).eq('id', row.id).select('id');
    expect(res.data ?? []).toHaveLength(0);
    const check = await adminClient().from('recipes').select('servings').eq('id', row.id).single();
    expect(check.data).toEqual({ servings: 4 });
  });
});
