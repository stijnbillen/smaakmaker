import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  anonClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  insertRecipe,
  makeAdmin,
  validRecipe,
  type TestUser,
} from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';

// T-033 / R-030 against the local Supabase: the week menu is private per user and its rules live in the database.
const UNIQUE_VIOLATION = '23505';
const INSUFFICIENT_PRIVILEGE = '42501';
const CHECK_VIOLATION = '23514';
const INVALID_TEXT = '22P02';
const MENU_FULL = 'P0050';

describe('week menu (R-030)', () => {
  let a: TestUser;
  let b: TestUser;
  let boss: TestUser;
  let author: TestUser;
  const recipeIds: string[] = [];

  beforeAll(async () => {
    await assertSupabaseUp();
    a = await createTestUser('wma');
    b = await createTestUser('wmb');
    boss = await createTestUser('wmadm');
    author = await createTestUser('wmaut');
    await makeAdmin(boss.id);
  });

  afterAll(async () => {
    const svc = adminClient();
    for (let i = 0; i < recipeIds.length; i += 100) await svc.from('recipes').delete().in('id', recipeIds.slice(i, i + 100));
    for (const u of [a, b, boss, author]) if (u) await deleteTestUser(u);
  });

  async function newRecipe(owner: TestUser = a, extra: Record<string, unknown> = {}): Promise<string> {
    const row = await insertRecipe(owner.client, { title: 'Menu ' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), ...extra });
    recipeIds.push(row.id);
    return row.id;
  }

  const add = (u: TestUser, recipeId: string, servings?: number) =>
    u.client.from('week_menu_items').insert(servings === undefined ? { recipe_id: recipeId } : { recipe_id: recipeId, servings });
  const rowsOf = (userId: string) =>
    sql<{ recipe_id: string; servings: number }>(`select recipe_id, servings from public.week_menu_items where user_id = '${userId}'`);

  /** Fills the menu of a user to `n` rows through SQL (the API path is tested separately). */
  async function fillMenu(user: TestUser, n: number): Promise<string[]> {
    const rows = Array.from({ length: n }, (_, i) => validRecipe({ title: `Vol ${Date.now()}-${i}` }));
    const ins = await user.client.from('recipes').insert(rows).select('id');
    if (ins.error) throw ins.error;
    const ids = (ins.data ?? []).map((r) => r.id as string);
    recipeIds.push(...ids);
    await sql(
      `insert into public.week_menu_items (user_id, recipe_id, servings)
       select '${user.id}', id, 4 from public.recipes where id in (${ids.map((i) => `'${i}'`).join(',')})`,
    );
    return ids;
  }

  describe('crit. 1: only the owner sees and changes the menu', () => {
    it('B and an admin read 0 rows of A; A reads its own', async () => {
      const x = await newRecipe();
      expect((await add(a, x)).error).toBeNull();
      for (const other of [b, boss]) {
        const res = await other.client.from('week_menu_items').select('user_id,recipe_id').eq('user_id', a.id);
        expect(res.error).toBeNull();
        expect(res.data).toEqual([]);
      }
      const own = await a.client.from('week_menu_items').select('recipe_id').eq('recipe_id', x);
      expect(own.data).toHaveLength(1);
    });

    it('B and an admin update 0 rows and delete 0 rows of A; the row is unchanged', async () => {
      const x = await newRecipe();
      await add(a, x, 3);
      for (const other of [b, boss]) {
        const upd = await other.client.from('week_menu_items').update({ servings: 9 }).eq('user_id', a.id).eq('recipe_id', x).select();
        expect(upd.data ?? []).toEqual([]);
        const del = await other.client.from('week_menu_items').delete().eq('user_id', a.id).eq('recipe_id', x).select();
        expect(del.data ?? []).toEqual([]);
      }
      const rows = await sql<{ servings: number }>(`select servings from public.week_menu_items where user_id = '${a.id}' and recipe_id = '${x}'`);
      expect(rows).toEqual([{ servings: 3 }]);
    });

    it('B and an admin cannot insert a row with user_id = A', async () => {
      const x = await newRecipe();
      for (const other of [b, boss]) {
        const res = await other.client.from('week_menu_items').insert({ user_id: a.id, recipe_id: x, servings: 2 });
        expect(res.error).not.toBeNull();
      }
      const rows = await sql<{ n: string }>(`select count(*) n from public.week_menu_items where recipe_id = '${x}'`);
      expect(Number(rows[0].n)).toBe(0);
    });

    it('clear_week_menu() by B or an admin leaves the menu of A alone', async () => {
      const x = await newRecipe();
      await add(a, x);
      await add(b, x);
      for (const other of [b, boss]) {
        const res = await other.client.rpc('clear_week_menu');
        expect(res.error).toBeNull();
      }
      expect((await rowsOf(a.id)).map((r) => r.recipe_id)).toContain(x);
      expect((await rowsOf(b.id)).filter((r) => r.recipe_id === x)).toEqual([]);
    });

    it('anon is refused: select, insert, delete and clear_week_menu', async () => {
      const x = await newRecipe();
      await add(a, x);
      const anon = anonClient();
      const read = await anon.from('week_menu_items').select('recipe_id');
      if (read.error) expect(read.error.code).toBe(INSUFFICIENT_PRIVILEGE);
      else expect(read.data ?? []).toHaveLength(0);
      expect((await anon.from('week_menu_items').insert({ recipe_id: x })).error).not.toBeNull();
      const del = await anon.from('week_menu_items').delete().eq('recipe_id', x).select();
      expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
      expect((await anon.rpc('clear_week_menu')).error).not.toBeNull();
      expect((await rowsOf(a.id)).map((r) => r.recipe_id)).toContain(x);
    });
  });

  describe('crit. 2: a list of dishes without days', () => {
    it('the table has no column for a day or a meal', async () => {
      const cols = await sql<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'week_menu_items'`,
      );
      const names = cols.map((c) => c.column_name).sort();
      expect(names).toEqual(['created_at', 'recipe_id', 'servings', 'user_id']);
    });
  });

  describe('crit. 4: a recipe at most once', () => {
    it('a second insert of the same recipe by the same user gives 23505', async () => {
      const x = await newRecipe();
      expect((await add(a, x)).error).toBeNull();
      const second = await add(a, x);
      expect(second.error?.code).toBe(UNIQUE_VIOLATION);
      expect((await rowsOf(a.id)).filter((r) => r.recipe_id === x)).toHaveLength(1);
    });

    it('another user can have the same recipe', async () => {
      const x = await newRecipe();
      expect((await add(a, x)).error).toBeNull();
      expect((await add(b, x)).error).toBeNull();
    });
  });

  describe('crit. 5: servings', () => {
    it('an insert without servings takes the servings of the recipe (trigger)', async () => {
      const x = await newRecipe(a, { servings: 6 });
      expect((await add(a, x)).error).toBeNull();
      const row = (await rowsOf(a.id)).find((r) => r.recipe_id === x);
      expect(row?.servings).toBe(6);
    });

    it('1 and 99 are accepted; 0, 100, -1 and 2.5 are refused', async () => {
      const ok1 = await newRecipe();
      const ok99 = await newRecipe();
      expect((await add(a, ok1, 1)).error).toBeNull();
      expect((await add(a, ok99, 99)).error).toBeNull();
      for (const bad of [0, 100, -1, 2.5]) {
        const x = await newRecipe();
        const res = await add(a, x, bad);
        expect(res.error, `servings ${bad}`).not.toBeNull();
        expect([CHECK_VIOLATION, INVALID_TEXT], `servings ${bad}`).toContain(res.error?.code);
        expect((await rowsOf(a.id)).filter((r) => r.recipe_id === x)).toEqual([]);
      }
    });

    it('an update of servings to 0 or 100 is refused, to 5 accepted', async () => {
      const x = await newRecipe();
      await add(a, x, 2);
      for (const bad of [0, 100]) {
        const res = await a.client.from('week_menu_items').update({ servings: bad }).eq('recipe_id', x).select();
        expect(res.error, `servings ${bad}`).not.toBeNull();
      }
      const ok = await a.client.from('week_menu_items').update({ servings: 5 }).eq('recipe_id', x).select();
      expect(ok.error).toBeNull();
      expect(ok.data).toHaveLength(1);
    });

    it('changing menu servings leaves recipes.servings alone', async () => {
      const x = await newRecipe(a, { servings: 4 });
      await add(a, x);
      await a.client.from('week_menu_items').update({ servings: 8 }).eq('recipe_id', x);
      const rows = await sql<{ servings: number }>(`select servings from public.recipes where id = '${x}'`);
      expect(rows[0].servings).toBe(4);
    });

    it('a user can change servings only: recipe_id and user_id are refused', async () => {
      const x = await newRecipe();
      const y = await newRecipe();
      await add(a, x);
      const moveRecipe = await a.client.from('week_menu_items').update({ recipe_id: y }).eq('recipe_id', x).select();
      expect(moveRecipe.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      const moveUser = await a.client.from('week_menu_items').update({ user_id: b.id }).eq('recipe_id', x).select();
      expect(moveUser.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      expect((await rowsOf(a.id)).map((r) => r.recipe_id)).toContain(x);
    });
  });

  describe('crit. 6: at most 50 dishes', () => {
    it('the 51st insert is refused with P0050; another user can still add', async () => {
      const full = await createTestUser('wmfull');
      try {
        await fillMenu(full, 50);
        const extra = await newRecipe();
        const res = await add(full, extra);
        expect(res.error?.code).toBe(MENU_FULL);
        expect((await rowsOf(full.id)).length).toBe(50);
        expect((await add(b, extra)).error).toBeNull();
      } finally {
        await deleteTestUser(full);
      }
    });

    it('two parallel inserts at 49 rows give at most 50 rows (lock per user)', async () => {
      const u = await createTestUser('wmpar');
      try {
        await fillMenu(u, 49);
        const x = await newRecipe();
        const y = await newRecipe();
        const [r1, r2] = await Promise.all([add(u, x), add(u, y)]);
        const errors = [r1.error, r2.error].filter(Boolean);
        expect(errors).toHaveLength(1);
        expect(errors[0]?.code).toBe(MENU_FULL);
        expect((await rowsOf(u.id)).length).toBe(50);
      } finally {
        await deleteTestUser(u);
      }
    });
  });

  describe('crit. 8: clear_week_menu', () => {
    it('removes all rows of the caller and no one elses', async () => {
      const u = await createTestUser('wmclr');
      try {
        const x = await newRecipe();
        const y = await newRecipe();
        await add(u, x);
        await add(u, y);
        await add(b, x);
        // T-034 / R-032: "Leegmaken" also wipes the shopping list data (marks and own items) of the caller.
        await u.client.from('shopping_marks').insert({ line_key: 'wm-clear', state: 'bought' });
        await u.client.from('shopping_items').insert({ text: 'wm-clear' });
        const res = await u.client.rpc('clear_week_menu');
        expect(res.error).toBeNull();
        expect(await rowsOf(u.id)).toEqual([]);
        for (const table of ['shopping_marks', 'shopping_items']) {
          const left = await sql<{ n: string }>(`select count(*) n from public.${table} where user_id = '${u.id}'`);
          expect(Number(left[0].n), table).toBe(0);
        }
        expect((await rowsOf(b.id)).map((r) => r.recipe_id)).toContain(x);
      } finally {
        await deleteTestUser(u);
      }
    });
  });

  describe('crit. 9: a deleted recipe leaves every menu', () => {
    it('deleting by the author removes the rows of A and B', async () => {
      const x = await newRecipe(author);
      await add(a, x);
      await add(b, x);
      const del = await author.client.from('recipes').delete().eq('id', x).select('id');
      expect(del.data).toHaveLength(1);
      const rows = await sql<{ n: string }>(`select count(*) n from public.week_menu_items where recipe_id = '${x}'`);
      expect(Number(rows[0].n)).toBe(0);
    });

    it('deleting by an admin removes the rows too', async () => {
      const x = await newRecipe(author);
      await add(a, x);
      await add(b, x);
      const del = await boss.client.from('recipes').delete().eq('id', x).select('id');
      expect(del.data).toHaveLength(1);
      const rows = await sql<{ n: string }>(`select count(*) n from public.week_menu_items where recipe_id = '${x}'`);
      expect(Number(rows[0].n)).toBe(0);
    });
  });

  describe('crit. 3: in_week_menu on the recipe', () => {
    it('is true for the user who added it and false for another user', async () => {
      const x = await newRecipe();
      await add(a, x);
      const ra = await a.client.from('recipes').select('id,in_week_menu').eq('id', x).single();
      const rb = await b.client.from('recipes').select('id,in_week_menu').eq('id', x).single();
      expect(ra.data?.in_week_menu).toBe(true);
      expect(rb.data?.in_week_menu).toBe(false);
    });
  });
});
