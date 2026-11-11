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

// T-034 / R-032 against the local Supabase: marks and own items are private, limited and wiped by clear_week_menu().
const UNIQUE_VIOLATION = '23505';
const INSUFFICIENT_PRIVILEGE = '42501';
const CHECK_VIOLATION = '23514';
const ITEMS_FULL = 'P0100';
const INVALID_PARAMETER = '22023';

describe('shopping list (R-032)', () => {
  let a: TestUser;
  let b: TestUser;
  let boss: TestUser;
  const recipeIds: string[] = [];

  beforeAll(async () => {
    await assertSupabaseUp();
    a = await createTestUser('sla');
    b = await createTestUser('slb');
    boss = await createTestUser('sladm');
    await makeAdmin(boss.id);
  });

  afterAll(async () => {
    const svc = adminClient();
    if (recipeIds.length) await svc.from('recipes').delete().in('id', recipeIds);
    for (const u of [a, b, boss]) if (u) await deleteTestUser(u);
  });

  const marksOf = (userId: string) =>
    sql<{ line_key: string; state: string }>(`select line_key, state from public.shopping_marks where user_id = '${userId}' order by line_key`);
  const itemsOf = (userId: string) => sql<{ id: string; text: string; bought: boolean }>(`select id, text, bought from public.shopping_items where user_id = '${userId}'`);
  const count = async (table: string, userId: string) =>
    Number((await sql<{ n: string }>(`select count(*) n from public.${table} where user_id = '${userId}'`))[0].n);
  const mark = (u: TestUser, key: string, state: 'bought' | 'have' = 'bought') => u.client.from('shopping_marks').insert({ line_key: key, state });
  const addItem = (u: TestUser, text: string) => u.client.from('shopping_items').insert({ text });
  async function fillItems(u: TestUser, n: number) {
    await sql(`insert into public.shopping_items (user_id, text) select '${u.id}', 'item ' || g from generate_series(1, ${n}) g`);
  }

  describe('crit. 8/9: marks table', () => {
    it('has primary key (user_id, line_key): a second insert of the same key gives 23505', async () => {
      const u = await createTestUser('slpk');
      try {
        expect((await mark(u, 'i:x|m:weight|s:-|q:1')).error).toBeNull();
        expect((await mark(u, 'i:x|m:weight|s:-|q:1', 'have')).error?.code).toBe(UNIQUE_VIOLATION);
        const pk = await sql<{ column_name: string }>(
          `select a.attname column_name from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
           where i.indrelid = 'public.shopping_marks'::regclass and i.indisprimary order by a.attname`,
        );
        expect(pk.map((c) => c.column_name)).toEqual(['line_key', 'user_id']);
      } finally {
        await deleteTestUser(u);
      }
    });

    it('state is "bought" or "have"; anything else is refused (check); upsert switches state in one row', async () => {
      const u = await createTestUser('slst');
      try {
        const bad = await u.client.from('shopping_marks').insert({ line_key: 'k1', state: 'maybe' });
        expect(bad.error?.code).toBe(CHECK_VIOLATION);
        expect((await mark(u, 'k1', 'bought')).error).toBeNull();
        const sw = await u.client.from('shopping_marks').update({ state: 'have' }).eq('line_key', 'k1').select();
        expect(sw.error).toBeNull();
        expect(await marksOf(u.id)).toEqual([{ line_key: 'k1', state: 'have' }]);
      } finally {
        await deleteTestUser(u);
      }
    });

    it('an empty or 401-character key is refused', async () => {
      const u = await createTestUser('slkey');
      try {
        expect((await mark(u, '')).error?.code).toBe(CHECK_VIOLATION);
        expect((await mark(u, 'k'.repeat(401))).error?.code).toBe(CHECK_VIOLATION);
        expect((await mark(u, 'k'.repeat(400))).error).toBeNull();
      } finally {
        await deleteTestUser(u);
      }
    });
  });

  describe('crit. 10: prune_shopping_marks', () => {
    it('removes only own rows whose key is not in the list', async () => {
      const u = await createTestUser('slpr');
      try {
        for (const k of ['k1', 'k2', 'k3']) await mark(u, k);
        await mark(b, 'prune-b-1');
        const res = await u.client.rpc('prune_shopping_marks', { p_keys: ['k1'] });
        expect(res.error).toBeNull();
        expect((await marksOf(u.id)).map((m) => m.line_key)).toEqual(['k1']);
        expect((await marksOf(b.id)).map((m) => m.line_key)).toContain('prune-b-1');
      } finally {
        await deleteTestUser(u);
      }
    });

    it('an empty list removes every own mark; null and more than 3000 keys are refused with 22023', async () => {
      const u = await createTestUser('slpr2');
      try {
        await mark(u, 'k1');
        const nul = await u.client.rpc('prune_shopping_marks', { p_keys: null });
        expect(nul.error).not.toBeNull();
        expect(nul.error?.code).toBe(INVALID_PARAMETER);
        const big = await u.client.rpc('prune_shopping_marks', { p_keys: Array.from({ length: 3001 }, (_, i) => `k${i}`) });
        expect(big.error?.code).toBe(INVALID_PARAMETER);
        expect(await marksOf(u.id)).toHaveLength(1);
        expect((await u.client.rpc('prune_shopping_marks', { p_keys: [] })).error).toBeNull();
        expect(await marksOf(u.id)).toEqual([]);
      } finally {
        await deleteTestUser(u);
      }
    });
  });

  describe('crit. 11: custom items', () => {
    it('text of 1..80 characters is accepted; empty and 81 characters are refused (check)', async () => {
      const u = await createTestUser('slit');
      try {
        expect((await addItem(u, 'melk')).error).toBeNull();
        expect((await addItem(u, 'm'.repeat(80))).error).toBeNull();
        expect((await addItem(u, '')).error?.code).toBe(CHECK_VIOLATION);
        expect((await addItem(u, 'm'.repeat(81))).error?.code).toBe(CHECK_VIOLATION);
        expect((await addItem(u, '   ')).error?.code).toBe(CHECK_VIOLATION);
        expect(await count('shopping_items', u.id)).toBe(2);
      } finally {
        await deleteTestUser(u);
      }
    });

    it('a user can change "bought" only; the text is refused', async () => {
      const u = await createTestUser('slup');
      try {
        await addItem(u, 'melk');
        const ok = await u.client.from('shopping_items').update({ bought: true }).eq('text', 'melk').select();
        expect(ok.error).toBeNull();
        expect(ok.data).toHaveLength(1);
        const bad = await u.client.from('shopping_items').update({ text: 'brood' }).eq('text', 'melk').select();
        expect(bad.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      } finally {
        await deleteTestUser(u);
      }
    });

    it('the 100th item is accepted and the 101st is refused with P0100; another user can still add', async () => {
      const u = await createTestUser('sl100');
      try {
        await fillItems(u, 99);
        expect((await addItem(u, 'honderd')).error).toBeNull();
        expect((await addItem(u, 'honderdeneen')).error?.code).toBe(ITEMS_FULL);
        expect(await count('shopping_items', u.id)).toBe(100);
        expect((await addItem(b, 'los')).error).toBeNull();
      } finally {
        await deleteTestUser(u);
      }
    });

    it('two parallel inserts at 99 items give at most 100 (advisory lock)', async () => {
      const u = await createTestUser('slpar');
      try {
        await fillItems(u, 99);
        const [r1, r2] = await Promise.all([addItem(u, 'een'), addItem(u, 'twee')]);
        const errors = [r1.error, r2.error].filter(Boolean);
        expect(errors).toHaveLength(1);
        expect(errors[0]?.code).toBe(ITEMS_FULL);
        expect(await count('shopping_items', u.id)).toBe(100);
      } finally {
        await deleteTestUser(u);
      }
    });
  });

  describe('Leegmaken: clear_week_menu() also wipes marks and custom items (crit. 11, completes T-033 crit. 8)', () => {
    it('removes menu rows, marks and items of the caller; leaves those of another user', async () => {
      const u = await createTestUser('slclr');
      try {
        const r = await insertRecipe(a.client, { title: 'Leeg ' + Date.now() });
        recipeIds.push(r.id);
        await u.client.from('week_menu_items').insert({ recipe_id: r.id });
        await b.client.from('week_menu_items').insert({ recipe_id: r.id });
        await mark(u, 'clr-u');
        await mark(b, 'clr-b');
        await addItem(u, 'weg');
        await addItem(b, 'blijft');
        const res = await u.client.rpc('clear_week_menu');
        expect(res.error).toBeNull();
        expect(await count('week_menu_items', u.id)).toBe(0);
        expect(await count('shopping_marks', u.id)).toBe(0);
        expect(await count('shopping_items', u.id)).toBe(0);
        expect((await marksOf(b.id)).map((m) => m.line_key)).toContain('clr-b');
        expect((await itemsOf(b.id)).map((i) => i.text)).toContain('blijft');
        expect(await count('week_menu_items', b.id)).toBe(1);
      } finally {
        await deleteTestUser(u);
      }
    });
  });

  describe('crit. 13: private to the owner', () => {
    it('B and an admin read 0 rows of A; A reads its own', async () => {
      await mark(a, 'priv-a');
      await addItem(a, 'prive');
      for (const other of [b, boss]) {
        const m = await other.client.from('shopping_marks').select('line_key').eq('user_id', a.id);
        expect(m.error).toBeNull();
        expect(m.data).toEqual([]);
        const i = await other.client.from('shopping_items').select('text').eq('user_id', a.id);
        expect(i.error).toBeNull();
        expect(i.data).toEqual([]);
      }
      expect((await a.client.from('shopping_marks').select('line_key').eq('line_key', 'priv-a')).data).toHaveLength(1);
      expect((await a.client.from('shopping_items').select('text').eq('text', 'prive')).data).toHaveLength(1);
    });

    it('B and an admin update and delete 0 rows of A; the rows are unchanged', async () => {
      const u = await createTestUser('slown');
      try {
        await mark(u, 'own-1');
        await addItem(u, 'eigen');
        for (const other of [b, boss]) {
          const um = await other.client.from('shopping_marks').update({ state: 'have' }).eq('user_id', u.id).select();
          expect(um.data ?? []).toEqual([]);
          const dm = await other.client.from('shopping_marks').delete().eq('user_id', u.id).select();
          expect(dm.data ?? []).toEqual([]);
          const ui = await other.client.from('shopping_items').update({ bought: true }).eq('user_id', u.id).select();
          expect(ui.data ?? []).toEqual([]);
          const di = await other.client.from('shopping_items').delete().eq('user_id', u.id).select();
          expect(di.data ?? []).toEqual([]);
        }
        expect(await marksOf(u.id)).toEqual([{ line_key: 'own-1', state: 'bought' }]);
        expect(await itemsOf(u.id)).toEqual([expect.objectContaining({ text: 'eigen', bought: false })]);
      } finally {
        await deleteTestUser(u);
      }
    });

    it('B and an admin cannot insert rows with user_id = A', async () => {
      for (const other of [b, boss]) {
        const m = await other.client.from('shopping_marks').insert({ user_id: a.id, line_key: 'forged-' + other.id, state: 'bought' });
        expect(m.error).not.toBeNull();
        const i = await other.client.from('shopping_items').insert({ user_id: a.id, text: 'forged' });
        expect(i.error).not.toBeNull();
      }
      expect((await marksOf(a.id)).filter((m) => m.line_key.startsWith('forged'))).toEqual([]);
      expect((await itemsOf(a.id)).filter((i) => i.text === 'forged')).toEqual([]);
    });

    it('prune_shopping_marks and clear_week_menu() of B leave the rows of A alone', async () => {
      const u = await createTestUser('slfun');
      try {
        await mark(u, 'fun-1');
        await addItem(u, 'fun');
        for (const other of [b, boss]) {
          expect((await other.client.rpc('prune_shopping_marks', { p_keys: [] })).error).toBeNull();
          expect((await other.client.rpc('clear_week_menu')).error).toBeNull();
        }
        expect(await marksOf(u.id)).toHaveLength(1);
        expect(await itemsOf(u.id)).toHaveLength(1);
      } finally {
        await deleteTestUser(u);
      }
    });

    it('anon is refused on both tables and both functions', async () => {
      const anon = anonClient();
      for (const table of ['shopping_marks', 'shopping_items']) {
        const read = await anon.from(table).select('*');
        if (read.error) expect(read.error.code).toBe(INSUFFICIENT_PRIVILEGE);
        else expect(read.data ?? []).toHaveLength(0);
        const del = await anon.from(table).delete().not('user_id', 'is', null).select();
        expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
      }
      expect((await anon.from('shopping_marks').insert({ line_key: 'anon', state: 'bought' })).error).not.toBeNull();
      expect((await anon.from('shopping_items').insert({ text: 'anon' })).error).not.toBeNull();
      expect((await anon.rpc('prune_shopping_marks', { p_keys: [] })).error).not.toBeNull();
      expect((await anon.rpc('clear_week_menu')).error).not.toBeNull();
    });
  });
});
