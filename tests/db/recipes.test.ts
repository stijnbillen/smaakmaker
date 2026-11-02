import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  insertRecipe,
  makeAdmin,
  validRecipe,
  type TestUser,
} from '../helpers/supabase-admin';

// T-005 / R-003, against the local Supabase. Check violations are SQLSTATE 23514, missing column rights 42501.
const CHECK_VIOLATION = '23514';
const chars = (n: number) => 'a'.repeat(n);
const ings = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Ingrediënt ${i}` }));
const steps = (n: number) => Array.from({ length: n }, (_, i) => `Stap ${i}`);

describe('recipes content and rights (R-003)', () => {
  let a: TestUser;
  let b: TestUser;
  let boss: TestUser;

  beforeAll(async () => {
    await assertSupabaseUp(); // fails loudly, never skips
    a = await createTestUser('rca');
    b = await createTestUser('rcb');
    boss = await createTestUser('rcboss');
    await makeAdmin(boss.id);
  });

  afterAll(async () => {
    for (const u of [a, b, boss]) if (u) await deleteTestUser(u);
  });

  const insert = (overrides: Record<string, unknown>) => a.client.from('recipes').insert(validRecipe(overrides));

  describe('crit. 1: title, ingredients and steps are required', () => {
    it.each([
      ['a title of 101 characters', { title: chars(101) }],
      ['a title of only spaces', { title: '   ' }],
      ['an empty title', { title: '' }],
      ['no ingredients', { ingredients: [] }],
      ['no steps', { steps: [] }],
    ])('refuses %s with a check violation', async (_n, overrides) => {
      const res = await insert(overrides);
      expect(res.error?.code).toBe(CHECK_VIOLATION);
    });

    it('accepts titles of 1 and 100 characters', async () => {
      expect((await insert({ title: 'a' })).error).toBeNull();
      expect((await insert({ title: chars(100) })).error).toBeNull();
    });

    it('stores "  Soep  " as "Soep"', async () => {
      const row = await insertRecipe(a.client, { title: '  Soep  ' });
      expect(row.title).toBe('Soep');
    });

    it('trims the title after the check too: spaces around 100 characters are fine', async () => {
      expect((await insert({ title: `  ${chars(100)}  ` })).error).toBeNull();
    });
  });

  describe('crit. 2: field boundaries', () => {
    it('ingredient name: 0 and 81 characters refused, 1 and 80 accepted', async () => {
      expect((await insert({ ingredients: [{ name: '' }] })).error?.code).toBe(CHECK_VIOLATION);
      expect((await insert({ ingredients: [{ name: chars(81) }] })).error?.code).toBe(CHECK_VIOLATION);
      expect((await insert({ ingredients: [{ name: 'a' }] })).error).toBeNull();
      expect((await insert({ ingredients: [{ name: chars(80) }] })).error).toBeNull();
    });

    it('unit: 21 characters refused, 20 accepted', async () => {
      expect((await insert({ ingredients: [{ name: 'Meel', unit: chars(21) }] })).error?.code).toBe(CHECK_VIOLATION);
      expect((await insert({ ingredients: [{ name: 'Meel', unit: chars(20) }] })).error).toBeNull();
    });

    it('step: 0 and 1001 characters refused, 1 and 1000 accepted', async () => {
      expect((await insert({ steps: [''] })).error?.code).toBe(CHECK_VIOLATION);
      expect((await insert({ steps: [chars(1001)] })).error?.code).toBe(CHECK_VIOLATION);
      expect((await insert({ steps: ['a'] })).error).toBeNull();
      expect((await insert({ steps: [chars(1000)] })).error).toBeNull();
    });

    it('counts: 60 ingredients and 40 steps accepted, 61 and 41 refused', async () => {
      expect((await insert({ ingredients: ings(60) })).error).toBeNull();
      expect((await insert({ ingredients: ings(61) })).error?.code).toBe(CHECK_VIOLATION);
      expect((await insert({ steps: steps(40) })).error).toBeNull();
      expect((await insert({ steps: steps(41) })).error?.code).toBe(CHECK_VIOLATION);
    });

    it.each([
      ['0', 0],
      ['-1', -1],
      ['1.234 (3 decimals)', 1.234],
      ['a text instead of a number', 'veel'],
    ])('quantity %s is refused', async (_n, quantity) => {
      const res = await insert({ ingredients: [{ name: 'Meel', quantity }] });
      expect(res.error?.code).toBe(CHECK_VIOLATION);
    });

    it('quantity 0.25 and 2 are accepted, and an ingredient without quantity/unit too', async () => {
      expect((await insert({ ingredients: [{ name: 'Meel', quantity: 0.25, unit: 'kg' }] })).error).toBeNull();
      expect((await insert({ ingredients: [{ name: 'Meel', quantity: 2 }] })).error).toBeNull();
      expect((await insert({ ingredients: [{ name: 'Zout' }] })).error).toBeNull();
    });

    it('also checks on update (same boundaries as insert)', async () => {
      const row = await insertRecipe(a.client);
      const bad = await a.client.from('recipes').update({ steps: [chars(1001)] }).eq('id', row.id).select('id');
      expect(bad.error?.code).toBe(CHECK_VIOLATION);
      const worse = await a.client.from('recipes').update({ title: chars(101) }).eq('id', row.id).select('id');
      expect(worse.error?.code).toBe(CHECK_VIOLATION);
    });
  });

  describe('crit. 4: editing keeps the place in the overview', () => {
    it('does not change created_at', async () => {
      const row = await insertRecipe(a.client);
      const upd = await a.client.from('recipes').update({ title: 'Anders' }).eq('id', row.id).select('created_at,title');
      expect(upd.error).toBeNull();
      expect(upd.data?.[0].title).toBe('Anders');
      expect(new Date(upd.data![0].created_at).getTime()).toBe(new Date(row.created_at).getTime());
    });
  });

  describe('crit. 6: only the author edits', () => {
    const original = { title: 'Van A', ingredients: [{ name: 'Origineel' }], steps: ['Origineel.'] };

    async function expectUntouched(id: string) {
      const check = await adminClient().from('recipes').select('title,ingredients,steps').eq('id', id).single();
      expect(check.data).toEqual(original);
    }

    it('lets the author change title, ingredients and steps', async () => {
      const row = await insertRecipe(a.client, original);
      const upd = await a.client
        .from('recipes')
        .update({ title: 'Nieuw', ingredients: [{ name: 'Nieuw' }], steps: ['Nieuw.'] })
        .eq('id', row.id)
        .select('title,ingredients,steps');
      expect(upd.error).toBeNull();
      expect(upd.data).toEqual([{ title: 'Nieuw', ingredients: [{ name: 'Nieuw' }], steps: ['Nieuw.'] }]);
    });

    it('gives another user 0 rows and leaves the recipe unchanged', async () => {
      const row = await insertRecipe(a.client, original);
      const upd = await b.client.from('recipes').update({ title: 'Gehackt' }).eq('id', row.id).select('id');
      expect(upd.data ?? []).toHaveLength(0);
      await expectUntouched(row.id);
    });

    it('gives an administrator 0 rows too (admins delete, they do not edit)', async () => {
      const row = await insertRecipe(a.client, original);
      const upd = await boss.client.from('recipes').update({ title: 'Beheerder' }).eq('id', row.id).select('id');
      expect(upd.data ?? []).toHaveLength(0);
      await expectUntouched(row.id);
    });

    it('refuses the author to change author_id or created_at (no column right, 42501)', async () => {
      const row = await insertRecipe(a.client, original);
      const author = await a.client.from('recipes').update({ author_id: b.id }).eq('id', row.id).select('id');
      expect(author.error?.code).toBe('42501');
      const created = await a.client
        .from('recipes')
        .update({ created_at: new Date(0).toISOString() })
        .eq('id', row.id)
        .select('id');
      expect(created.error?.code).toBe('42501');
      const check = await adminClient().from('recipes').select('author_id').eq('id', row.id).single();
      expect(check.data?.author_id).toBe(a.id);
    });
  });
});
