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

// T-010 / R-010 against the local Supabase: the database holds the catalogue and enforces every rule about tags.
// The catalogue is shared and other tests (and earlier runs) add tags, so tests use unique names and
// check the start list as "each name exactly once", not "nothing else".
const CHECK_VIOLATION = '23514';
const INSUFFICIENT_PRIVILEGE = '42501';
const START_LIST = ['dessert', 'soep', 'bijgerecht', 'tapas', 'hoofdgerecht', 'ontbijt', 'snack', 'saus'];

// Every unique suffix of this run is remembered so afterAll can remove the catalogue rows again
// (nobody can delete tags through the API, so the cleanup goes through direct SQL).
const usedSuffixes: string[] = [];
const suffix = () => {
  const s = Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6) || 'xyz';
  usedSuffixes.push(s);
  return s;
};

describe('recipe dish tags (R-010)', () => {
  let a: TestUser;
  let b: TestUser;
  let admin: TestUser;

  beforeAll(async () => {
    await assertSupabaseUp(); // fails loudly, never skips
    a = await createTestUser('rtga');
    b = await createTestUser('rtgb');
    admin = await createTestUser('rtgadm');
    await makeAdmin(admin.id);
  });

  afterAll(async () => {
    for (const u of [a, b, admin]) if (u) await deleteTestUser(u);
    // Remove the tags this run made, so the form and filter do not grow with every run.
    for (const s of usedSuffixes) {
      if (/^[a-z]+$/.test(s)) await sql(`delete from public.tags where kind = 'dish' and name_key like '%${s}%'`);
    }
  });

  const insert = (overrides: Record<string, unknown>) =>
    a.client.from('recipes').insert(validRecipe(overrides)).select('id,dish_tags').single();

  const dishRows = async (key?: string) => {
    const q = adminClient().from('tags').select('name,name_key,kind').eq('kind', 'dish');
    const res = key ? await q.eq('name_key', key) : await q;
    if (res.error) throw res.error;
    return res.data ?? [];
  };

  describe('crit. 1: start list in the database', () => {
    it('has the eight start tags, each once, readable as a plain signed-in user', async () => {
      const res = await a.client.from('tags').select('name').eq('kind', 'dish');
      expect(res.error).toBeNull();
      const names = (res.data ?? []).map((r) => r.name as string);
      for (const n of START_LIST) expect(names.filter((x) => x === n), n).toHaveLength(1);
    });

    it('running the seed insert again makes no duplicates (on conflict do nothing)', async () => {
      const before = (await dishRows()).length;
      const list = START_LIST.map((n) => `'${n}'`).join(',');
      await sql(
        `insert into public.tags (kind, name, name_key)
         select 'dish', n, public.fold_key(n) from unnest(array[${list}]) n
         on conflict (kind, name_key) do nothing`,
      );
      expect((await dishRows()).length).toBe(before);
    });
  });

  describe('crit. 2: zero or more tags on a recipe', () => {
    it('accepts an insert without dish_tags and stores []', async () => {
      const res = await insert({});
      expect(res.error).toBeNull();
      expect(res.data?.dish_tags).toEqual([]);
    });

    it('stores ["soep","tapas"]', async () => {
      const res = await insert({ dish_tags: ['soep', 'tapas'] });
      expect(res.error).toBeNull();
      expect(res.data?.dish_tags).toEqual(['soep', 'tapas']);
    });

    it('refuses 21 tags and accepts 20 (check violation)', async () => {
      const s = suffix();
      const names = (n: number) => Array.from({ length: n }, (_, i) => `max${i}${s}`);
      expect((await insert({ dish_tags: names(21) })).error?.code).toBe(CHECK_VIOLATION);
      const ok = await insert({ dish_tags: names(20) });
      expect(ok.error).toBeNull();
      expect(ok.data?.dish_tags).toHaveLength(20);
    });

    it('turns "Soep" and "soep" in one recipe into one tag', async () => {
      const res = await insert({ dish_tags: ['Soep', 'soep'] });
      expect(res.error).toBeNull();
      expect(res.data?.dish_tags).toEqual(['soep']);
    });

    it('lets the author change dish_tags (column right)', async () => {
      const row = await insertRecipe(a.client, { dish_tags: ['soep'] });
      const res = await a.client.from('recipes').update({ dish_tags: ['tapas', 'snack'] }).eq('id', row.id).select('dish_tags');
      expect(res.error).toBeNull();
      expect(res.data).toEqual([{ dish_tags: ['tapas', 'snack'] }]);
    });

    it('checks the same rules on update (21 tags refused)', async () => {
      const row = await insertRecipe(a.client);
      const s = suffix();
      const many = Array.from({ length: 21 }, (_, i) => `upd${i}${s}`);
      const res = await a.client.from('recipes').update({ dish_tags: many }).eq('id', row.id).select('id');
      expect(res.error?.code).toBe(CHECK_VIOLATION);
    });

    it.each([
      ['another user', () => b],
      ['an administrator', () => admin],
    ])('gives %s 0 rows on update and leaves the tags unchanged', async (_n, who) => {
      const row = await insertRecipe(a.client, { dish_tags: ['soep'] });
      const res = await who().client.from('recipes').update({ dish_tags: ['tapas'] }).eq('id', row.id).select('id');
      expect(res.data ?? []).toHaveLength(0);
      const check = await adminClient().from('recipes').select('dish_tags').eq('id', row.id).single();
      expect(check.data).toEqual({ dish_tags: ['soep'] });
    });
  });

  describe('crit. 3: new tags and reuse', () => {
    it('fold_key("Crème Brûlée") equals fold_key("creme brulee")', async () => {
      const rows = await sql<{ eq: boolean }>(`select public.fold_key('Crème Brûlée') = public.fold_key('creme brulee') as eq`);
      expect(rows[0].eq).toBe(true);
    });

    it('reuses the existing spelling for a case/accent variant from another user, with one catalogue row', async () => {
      const s = suffix();
      const first = await insertRecipe(a.client, { dish_tags: [`Stoofpot${s}`] });
      expect(first.id).toBeTruthy();
      const second = await b.client
        .from('recipes')
        .insert(validRecipe({ dish_tags: [`stóofpot${s}`] }))
        .select('dish_tags')
        .single();
      expect(second.error).toBeNull();
      expect(second.data?.dish_tags).toEqual([`Stoofpot${s}`]);
      const rows = await dishRows(`stoofpot${s}`);
      expect(rows).toHaveLength(1);
      expect(rows[0].kind).toBe('dish');
    });

    it('stores "  Wok  " trimmed as "Wok"', async () => {
      const s = suffix();
      const res = await insert({ dish_tags: [`  Wok${s}  `] });
      expect(res.error).toBeNull();
      expect(res.data?.dish_tags).toEqual([`Wok${s}`]);
    });

    it.each([
      ['empty', ''],
      ['spaces only', '   '],
      ['31 characters', 'x'.repeat(31)],
    ])('refuses a tag name that is %s', async (_n, name) => {
      expect((await insert({ dish_tags: [name] })).error?.code).toBe(CHECK_VIOLATION);
    });

    it('accepts a name of exactly 30 characters', async () => {
      const name = `z${suffix()}`.padEnd(30, 'z').slice(0, 30);
      const res = await insert({ dish_tags: [name] });
      expect(res.error).toBeNull();
      expect(res.data?.dish_tags).toEqual([name]);
    });

    it('two concurrent inserts of "Brunch" and "brunch" give one catalogue row and no error', async () => {
      // Fresh suffix per run: a leftover row from an earlier run would hide the race.
      const s = suffix();
      const [r1, r2] = await Promise.all([
        a.client.from('recipes').insert(validRecipe({ dish_tags: [`Brunch${s}`] })),
        b.client.from('recipes').insert(validRecipe({ dish_tags: [`brunch${s}`] })),
      ]);
      expect(r1.error).toBeNull();
      expect(r2.error).toBeNull();
      expect(await dishRows(`brunch${s}`)).toHaveLength(1);
    });
  });

  describe('crit. 5: nobody renames or removes tags', () => {
    it.each([
      ['a user', () => a],
      ['an administrator', () => admin],
    ])('refuses a direct insert, update and delete on tags for %s (42501)', async (_n, who) => {
      const client = who().client;
      const ins = await client.from('tags').insert({ kind: 'dish', name: 'direct', name_key: 'direct' });
      expect(ins.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      const upd = await client.from('tags').update({ name: 'anders' }).eq('name', 'soep');
      expect(upd.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      const del = await client.from('tags').delete().eq('name', 'soep');
      expect(del.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      expect((await dishRows('soep')).map((r) => r.name)).toEqual(['soep']);
    });

    it('does not let anon read tags', async () => {
      const res = await anonClient().from('tags').select('name');
      expect(res.error?.code ?? null).toBe(INSUFFICIENT_PRIVILEGE);
      expect(res.data ?? []).toHaveLength(0);
    });
  });
});
