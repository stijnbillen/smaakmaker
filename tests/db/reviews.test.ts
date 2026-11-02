import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  anonClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  insertRecipe,
  makeAdmin,
  type TestUser,
} from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';

// T-016 / R-012 against the local Supabase: the database enforces every review rule.
const CHECK_VIOLATION = '23514';
const NOT_NULL_VIOLATION = '23502';
const UNIQUE_VIOLATION = '23505';
const INSUFFICIENT_PRIVILEGE = '42501';
const INVALID_TEXT = '22P02';

describe('reviews (R-012)', () => {
  let a: TestUser;
  let b: TestUser;
  let c: TestUser;
  let admin: TestUser;
  const recipeIds: string[] = [];

  beforeAll(async () => {
    await assertSupabaseUp();
    a = await createTestUser('rva');
    b = await createTestUser('rvb');
    c = await createTestUser('rvc');
    admin = await createTestUser('rvadm');
    await makeAdmin(admin.id);
  });

  afterAll(async () => {
    const svc = adminClient();
    for (const id of recipeIds) await svc.from('recipes').delete().eq('id', id);
    for (const u of [a, b, c, admin]) if (u) await deleteTestUser(u);
  });

  async function newRecipe(owner: TestUser = a): Promise<string> {
    const row = await insertRecipe(owner.client, { title: 'Review ' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) });
    recipeIds.push(row.id);
    return row.id;
  }

  const review = (u: TestUser, recipeId: string, fields: Record<string, unknown>) =>
    u.client.from('reviews').insert({ recipe_id: recipeId, ...fields }).select('id,rating,body,author_id').single();

  describe('crit. 1: score 1..5, required', () => {
    it('accepts 1 and 5', async () => {
      const r1 = await newRecipe();
      const r5 = await newRecipe();
      expect((await review(b, r1, { rating: 1 })).error).toBeNull();
      expect((await review(b, r5, { rating: 5 })).error).toBeNull();
    });

    for (const bad of [0, 6]) {
      it('refuses ' + bad, async () => {
        const res = await review(b, await newRecipe(), { rating: bad });
        expect(res.error?.code).toBe(CHECK_VIOLATION);
      });
    }

    it('refuses a null score', async () => {
      const res = await review(b, await newRecipe(), { rating: null });
      expect([NOT_NULL_VIOLATION, CHECK_VIOLATION]).toContain(res.error?.code);
    });

    it('refuses 3.5 (smallint)', async () => {
      const res = await review(b, await newRecipe(), { rating: 3.5 });
      expect(res.error?.code).toBe(INVALID_TEXT);
    });

    it('refuses an update to 0 or 6', async () => {
      const id = await newRecipe();
      expect((await review(b, id, { rating: 3 })).error).toBeNull();
      for (const bad of [0, 6]) {
        const upd = await b.client.from('reviews').update({ rating: bad }).eq('recipe_id', id).select('id');
        expect(upd.error?.code).toBe(CHECK_VIOLATION);
      }
    });
  });

  describe('crit. 2: optional body, max 500 characters', () => {
    it('accepts null body', async () => {
      const res = await review(b, await newRecipe(), { rating: 3, body: null });
      expect(res.error).toBeNull();
      expect(res.data?.body).toBeNull();
    });

    it('accepts 500 characters, also with emoji and accents (code points)', async () => {
      for (const unit of ['a', '😀', 'é']) {
        const res = await review(b, await newRecipe(), { rating: 3, body: unit.repeat(500) });
        expect(res.error, unit).toBeNull();
        expect([...(res.data?.body ?? '')]).toHaveLength(500);
      }
    });

    it('refuses 501 characters', async () => {
      const res = await review(b, await newRecipe(), { rating: 3, body: 'a'.repeat(501) });
      expect(res.error?.code).toBe(CHECK_VIOLATION);
    });

    it('stores whitespace-only as null', async () => {
      const res = await review(b, await newRecipe(), { rating: 3, body: '    ' });
      expect(res.error).toBeNull();
      expect(res.data?.body).toBeNull();
    });

    it('trims before the check: 500 characters with spaces around is fine', async () => {
      const res = await review(b, await newRecipe(), { rating: 3, body: '  ' + 'a'.repeat(500) + '  ' });
      expect(res.error).toBeNull();
      expect(res.data?.body).toBe('a'.repeat(500));
    });

    it('applies the same limit on update', async () => {
      const id = await newRecipe();
      await review(b, id, { rating: 3 });
      const upd = await b.client.from('reviews').update({ body: 'a'.repeat(501) }).eq('recipe_id', id).select('id');
      expect(upd.error?.code).toBe(CHECK_VIOLATION);
    });
  });

  describe('crit. 3: one review per user per recipe', () => {
    it('refuses a second insert on the same recipe (23505)', async () => {
      const id = await newRecipe();
      expect((await review(b, id, { rating: 3 })).error).toBeNull();
      expect((await review(b, id, { rating: 4 })).error?.code).toBe(UNIQUE_VIOLATION);
    });

    it('allows the same user on another recipe and another user on the same recipe', async () => {
      const id1 = await newRecipe();
      const id2 = await newRecipe();
      expect((await review(b, id1, { rating: 3 })).error).toBeNull();
      expect((await review(b, id2, { rating: 3 })).error).toBeNull();
      expect((await review(c, id1, { rating: 3 })).error).toBeNull();
    });

    it('lets the recipe author review their own recipe', async () => {
      const id = await newRecipe(a);
      expect((await review(a, id, { rating: 5 })).error).toBeNull();
    });

    it('lets the author update (1 row) and delete, then insert again', async () => {
      const id = await newRecipe();
      await review(b, id, { rating: 3, body: 'ok' });
      const upd = await b.client.from('reviews').update({ rating: 4, body: 'beter' }).eq('recipe_id', id).select('rating,body');
      expect(upd.error).toBeNull();
      expect(upd.data).toEqual([{ rating: 4, body: 'beter' }]);
      const del = await b.client.from('reviews').delete().eq('recipe_id', id).select('id');
      expect(del.error).toBeNull();
      expect(del.data).toHaveLength(1);
      expect((await review(b, id, { rating: 2 })).error).toBeNull();
    });

    it('refuses changing recipe_id or author_id (column privilege 42501)', async () => {
      const id = await newRecipe();
      const other = await newRecipe();
      await review(b, id, { rating: 3 });
      const moveRecipe = await b.client.from('reviews').update({ recipe_id: other }).eq('recipe_id', id).select('id');
      expect(moveRecipe.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      const moveAuthor = await b.client.from('reviews').update({ author_id: c.id }).eq('recipe_id', id).select('id');
      expect(moveAuthor.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  describe('crit. 4 and 5: computed average and count', () => {
    // Seeds with the service client; the four test users supply distinct authors.
    async function seed(scores: number[]): Promise<string> {
      const id = await newRecipe();
      const users = [a, b, c, admin];
      const rows = scores.map((rating, i) => ({ recipe_id: id, author_id: users[i].id, rating }));
      if (rows.length > 0) {
        const res = await adminClient().from('reviews').insert(rows);
        if (res.error) throw res.error;
      }
      return id;
    }

    const cases: Array<[number[], number | null, number]> = [
      [[4, 4, 5], 4.3, 3],
      [[4, 5], 4.5, 2],
      [[1, 2, 2, 2], 1.8, 4],
      [[4, 4, 4, 5], 4.3, 4], // 4.25 rounds up
      [[], null, 0],
    ];
    for (const [scores, avg, count] of cases) {
      it('scores {' + scores.join(', ') + '} give avg ' + avg + ' and count ' + count, async () => {
        const id = await seed(scores);
        const res = await a.client.from('recipes').select('id,rating_avg,rating_count').eq('id', id).single();
        expect(res.error).toBeNull();
        expect(res.data?.rating_count).toBe(count);
        expect(res.data?.rating_avg === null ? null : Number(res.data?.rating_avg)).toBe(avg);
      });
    }

    it('orders by rating_avg descending with null last, combined with an existing filter', async () => {
      const low = await seed([2]);
      const high = await seed([5]);
      const none = await newRecipe();
      const res = await a.client
        .from('recipes')
        .select('id,rating_avg,rating_count')
        .in('id', [low, high, none])
        .lte('total_minutes', 9999)
        .order('rating_avg', { ascending: false, nullsFirst: false });
      expect(res.error).toBeNull();
      expect(res.data?.map((r) => r.id)).toEqual([high, low, none]);
    });
  });

  describe('crit. 6: list with author, newest first', () => {
    it('returns the author name via the embed and orders by created_at desc', async () => {
      const id = await newRecipe();
      const rows = [
        { recipe_id: id, author_id: a.id, rating: 3, created_at: '2026-01-01T10:00:00Z' },
        { recipe_id: id, author_id: b.id, rating: 4, created_at: '2026-01-02T10:00:00Z' },
        { recipe_id: id, author_id: c.id, rating: 5, created_at: '2026-01-03T10:00:00Z' },
      ];
      expect((await adminClient().from('reviews').insert(rows)).error).toBeNull();
      const res = await a.client
        .from('reviews')
        .select('author_id,created_at,author:profiles(display_name)')
        .eq('recipe_id', id)
        .order('created_at', { ascending: false });
      expect(res.error).toBeNull();
      expect(res.data?.map((r) => r.author_id)).toEqual([c.id, b.id, a.id]);
      const first = res.data?.[0] as unknown as { author: { display_name: string } };
      expect(first.author.display_name).toBe(c.displayName);
    });
  });

  describe('crit. 7: rights', () => {
    it('another user cannot update or delete a review (0 rows, unchanged)', async () => {
      const id = await newRecipe();
      await review(a, id, { rating: 3, body: 'mijn' });
      const upd = await b.client.from('reviews').update({ rating: 1 }).eq('recipe_id', id).select('id');
      expect(upd.data ?? []).toHaveLength(0);
      const del = await b.client.from('reviews').delete().eq('recipe_id', id).select('id');
      expect(del.data ?? []).toHaveLength(0);
      const still = await adminClient().from('reviews').select('rating,body').eq('recipe_id', id).single();
      expect(still.data).toEqual({ rating: 3, body: 'mijn' });
    });

    it('refuses an insert with someone else as author (42501)', async () => {
      const res = await review(b, await newRecipe(), { rating: 3, author_id: a.id });
      expect(res.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    });

    it('lets an administrator delete (1 row) but not update (0 rows)', async () => {
      const id = await newRecipe();
      await review(a, id, { rating: 3, body: 'x' });
      const upd = await admin.client.from('reviews').update({ rating: 1 }).eq('recipe_id', id).select('id');
      expect(upd.data ?? []).toHaveLength(0);
      const del = await admin.client.from('reviews').delete().eq('recipe_id', id).select('id');
      expect(del.error).toBeNull();
      expect(del.data).toHaveLength(1);
    });

    it('anonymous reads 0 reviews and cannot insert', async () => {
      const id = await newRecipe();
      await review(a, id, { rating: 3 });
      const anon = anonClient();
      const read = await anon.from('reviews').select('id');
      expect(read.data ?? []).toHaveLength(0);
      const ins = await anon.from('reviews').insert({ recipe_id: id, rating: 3 });
      expect(ins.error).not.toBeNull();
    });

    it('deleting the recipe deletes its reviews (cascade)', async () => {
      const id = await newRecipe(a);
      await review(b, id, { rating: 3 });
      await review(c, id, { rating: 4 });
      const del = await a.client.from('recipes').delete().eq('id', id).select('id');
      expect(del.data).toHaveLength(1);
      const left = await adminClient().from('reviews').select('id').eq('recipe_id', id);
      expect(left.data).toEqual([]);
    });
  });

  describe('crit. 8: reviews do not count towards the recipe size', () => {
    it('recipes has no rating* or review* column', async () => {
      const rows = await sql<{ column_name: string }>(
        "select column_name from information_schema.columns where table_schema='public' and table_name='recipes'",
      );
      const names = rows.map((r) => r.column_name);
      expect(names.length).toBeGreaterThan(0);
      expect(names.filter((n) => /^(rating|review)/.test(n))).toEqual([]);
    });
  });
});
