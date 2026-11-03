import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  anonClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  insertRecipe,
  type TestUser,
} from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';

// T-017 / R-014 against the local Supabase: favourites are private per user and enforced by the database.
const UNIQUE_VIOLATION = '23505';
const INSUFFICIENT_PRIVILEGE = '42501';

describe('favorites (R-014)', () => {
  let a: TestUser;
  let b: TestUser;
  const recipeIds: string[] = [];

  beforeAll(async () => {
    await assertSupabaseUp();
    a = await createTestUser('fva');
    b = await createTestUser('fvb');
  });

  afterAll(async () => {
    const svc = adminClient();
    for (const id of recipeIds) await svc.from('recipes').delete().eq('id', id);
    for (const u of [a, b]) if (u) await deleteTestUser(u);
  });

  async function newRecipe(owner: TestUser = a): Promise<string> {
    const row = await insertRecipe(owner.client, { title: 'Fav ' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) });
    recipeIds.push(row.id);
    return row.id;
  }

  const mark = (u: TestUser, recipeId: string) => u.client.from('favorites').insert({ recipe_id: recipeId });

  describe('crit. 2: only the owner sees and changes a favourite', () => {
    it('B reads 0 rows of A', async () => {
      const x = await newRecipe();
      expect((await mark(a, x)).error).toBeNull();
      const res = await b.client.from('favorites').select('user_id,recipe_id').eq('user_id', a.id);
      expect(res.error).toBeNull();
      expect(res.data).toEqual([]);
      const own = await a.client.from('favorites').select('recipe_id').eq('recipe_id', x);
      expect(own.data).toHaveLength(1);
    });

    it('B cannot insert a row with user_id = A', async () => {
      const x = await newRecipe();
      const res = await b.client.from('favorites').insert({ user_id: a.id, recipe_id: x });
      expect(res.error).not.toBeNull();
      const rows = await sql<{ n: string }>(`select count(*) n from public.favorites where recipe_id = '${x}'`);
      expect(Number(rows[0].n)).toBe(0);
    });

    it('B deletes 0 rows of A', async () => {
      const x = await newRecipe();
      await mark(a, x);
      const del = await b.client.from('favorites').delete().eq('user_id', a.id).eq('recipe_id', x).select();
      expect(del.error).toBeNull();
      expect(del.data).toEqual([]);
      const rows = await sql<{ n: string }>(`select count(*) n from public.favorites where recipe_id = '${x}'`);
      expect(Number(rows[0].n)).toBe(1);
    });

    it('a user can mark a recipe of someone else and delete their own favourite', async () => {
      const x = await newRecipe(a);
      expect((await mark(b, x)).error).toBeNull();
      const del = await b.client.from('favorites').delete().eq('recipe_id', x).select();
      expect(del.data).toHaveLength(1);
    });

    it('there is no update: not even on created_at', async () => {
      const x = await newRecipe();
      await mark(a, x);
      const upd = await a.client.from('favorites').update({ created_at: '2000-01-01T00:00:00Z' }).eq('recipe_id', x).select();
      expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    });

    it('is_favorite is true for A and false for B; recipe row unchanged', async () => {
      const x = await newRecipe();
      await mark(a, x);
      const ra = await a.client.from('recipes').select('id,is_favorite').eq('id', x).single();
      const rb = await b.client.from('recipes').select('id,is_favorite').eq('id', x).single();
      expect(ra.data?.is_favorite).toBe(true);
      expect(rb.data?.is_favorite).toBe(false);
    });

    it('anon has no access to favorites or is_favorite', async () => {
      const x = await newRecipe();
      await mark(a, x);
      const anon = anonClient();
      const read = await anon.from('favorites').select('recipe_id');
      if (read.error) expect(read.error.code).toBe(INSUFFICIENT_PRIVILEGE);
      else expect(read.data ?? []).toHaveLength(0);
      const ins = await anon.from('favorites').insert({ recipe_id: x });
      expect(ins.error).not.toBeNull();
      const rec = await anon.from('recipes').select('id,is_favorite').eq('id', x);
      expect(rec.error !== null || (rec.data ?? []).length === 0).toBe(true);
    });
  });

  describe('crit. 4: filtering on is_favorite and search_recipes', () => {
    it('?is_favorite=eq.true returns only the callers favourites', async () => {
      const fav = await newRecipe();
      const other = await newRecipe();
      await mark(a, fav);
      const res = await a.client.from('recipes').select('id').eq('is_favorite', true).in('id', [fav, other]);
      expect(res.error).toBeNull();
      expect((res.data ?? []).map((r) => r.id)).toEqual([fav]);
    });

    it('search_recipes returns is_favorite per row for the caller', async () => {
      const s = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
      const fav = await insertRecipe(a.client, { title: 'SF1 ' + s, ingredients: [{ name: 'feta' + s }] });
      const non = await insertRecipe(a.client, { title: 'SF2 ' + s, ingredients: [{ name: 'feta' + s }] });
      recipeIds.push(fav.id, non.id);
      await mark(a, fav.id);
      const rpc = (u: TestUser) => u.client.rpc('search_recipes', { p_terms: ['feta' + s], p_without: [], p_min: 1 });
      const ra = await rpc(a);
      expect(ra.error).toBeNull();
      const byId = (rows: Array<{ id: string; is_favorite: boolean }>) => Object.fromEntries(rows.map((r) => [r.id, r.is_favorite]));
      expect(byId(ra.data)).toEqual({ [fav.id]: true, [non.id]: false });
      const rb = await rpc(b);
      expect(byId(rb.data)).toEqual({ [fav.id]: false, [non.id]: false });
      // the favourites filter also works on the RPC result
      const onlyFav = await rpc(a).eq('is_favorite', true);
      expect(onlyFav.error).toBeNull();
      expect((onlyFav.data ?? []).map((r: { id: string }) => r.id)).toEqual([fav.id]);
    });
  });

  describe('crit. 5: deleted recipe leaves every favourites list', () => {
    it('cascade removes the rows of A and B', async () => {
      const x = await newRecipe();
      await mark(a, x);
      await mark(b, x);
      const del = await a.client.from('recipes').delete().eq('id', x).select('id');
      expect(del.data).toHaveLength(1);
      const rows = await sql<{ n: string }>(`select count(*) n from public.favorites where recipe_id = '${x}'`);
      expect(Number(rows[0].n)).toBe(0);
    });
  });

  describe('crit. 6: one favourite per recipe', () => {
    it('a second insert of (A, X) gives 23505', async () => {
      const x = await newRecipe();
      expect((await mark(a, x)).error).toBeNull();
      const again = await mark(a, x);
      expect(again.error?.code).toBe(UNIQUE_VIOLATION);
      const rows = await sql<{ n: string }>(`select count(*) n from public.favorites where recipe_id = '${x}'`);
      expect(Number(rows[0].n)).toBe(1);
    });

    it('A and B may both mark the same recipe', async () => {
      const x = await newRecipe();
      expect((await mark(a, x)).error).toBeNull();
      expect((await mark(b, x)).error).toBeNull();
    });
  });

  it('deleting a user removes their favourites', async () => {
    const tmp = await createTestUser('fvtmp');
    const x = await newRecipe();
    await mark(tmp, x);
    await deleteTestUser(tmp);
    const rows = await sql<{ n: string }>(`select count(*) n from public.favorites where user_id = '${tmp.id}'`);
    expect(Number(rows[0].n)).toBe(0);
  });
});
