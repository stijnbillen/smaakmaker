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
import { sql } from '../helpers/pg';

// T-011 / R-011 against the local Supabase: a second tag group ("trait") with its own start list, same rules as
// "dish" (R-010), and the same name may exist in both groups.
const CHECK_VIOLATION = '23514';
const INSUFFICIENT_PRIVILEGE = '42501';
const TRAIT_LIST = ['winter', 'zomer', 'lente', 'herfst', 'licht', 'vegetarisch', 'veganistisch', 'glutenvrij', 'snel'];
const DISH_LIST = ['dessert', 'soep', 'bijgerecht', 'tapas', 'hoofdgerecht', 'ontbijt', 'snack', 'saus'];

// Cleanup removes only exact names (matched through fold_key) that this run made, never a pattern,
// so the start tags always stay. Names carry a letters-only suffix, so they cannot be a start tag.
const usedNames: string[] = [];
const unique = (label: string) => {
  const s = Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6) || 'xyz';
  const name = `${label}${s}`;
  usedNames.push(name);
  return name;
};
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

describe('recipe trait tags (R-011)', () => {
  let a: TestUser;
  let b: TestUser;
  let admin: TestUser;

  beforeAll(async () => {
    await assertSupabaseUp(); // fails loudly, never skips
    a = await createTestUser('rtta');
    b = await createTestUser('rttb');
    admin = await createTestUser('rttadm');
    await makeAdmin(admin.id);
  });

  afterAll(async () => {
    for (const u of [a, b, admin]) if (u) await deleteTestUser(u);
    for (const n of usedNames) {
      await sql(`delete from public.tags where name_key = public.fold_key(${lit(n)})`);
    }
    // "snack" is a dish start tag; only the trait row made by the cross-group test is removed.
    await sql(`delete from public.tags where kind = 'trait' and name_key = 'snack'`);
  });

  const insert = (overrides: Record<string, unknown>) =>
    a.client.from('recipes').insert(validRecipe(overrides)).select('id,trait_tags,dish_tags').single();

  const rows = async (kind: string, key?: string) => {
    const q = adminClient().from('tags').select('name,name_key,kind').eq('kind', kind);
    const res = key ? await q.eq('name_key', key) : await q;
    if (res.error) throw res.error;
    return res.data ?? [];
  };

  describe('crit. 1: start list in the database', () => {
    it('the trait group holds exactly the nine start tags, each once', async () => {
      const names = (await rows('trait')).map((r) => r.name as string);
      expect([...names].sort()).toEqual([...TRAIT_LIST].sort());
    });

    it('is readable as a plain signed-in user', async () => {
      const res = await a.client.from('tags').select('name').eq('kind', 'trait');
      expect(res.error).toBeNull();
      for (const n of TRAIT_LIST) expect((res.data ?? []).filter((r) => r.name === n), n).toHaveLength(1);
    });

    it('the dish group keeps its eight names and gained none of the trait names', async () => {
      // Other test files add dish tags in parallel, so this checks "unchanged" as: all eight once, no trait name.
      const names = (await rows('dish')).map((r) => r.name as string);
      for (const n of DISH_LIST) expect(names.filter((x) => x === n), n).toHaveLength(1);
      for (const n of TRAIT_LIST) expect(names, n).not.toContain(n);
    });

    it('running the seed insert again makes no duplicates (on conflict do nothing)', async () => {
      const before = (await rows('trait')).length;
      const list = TRAIT_LIST.map((n) => `'${n}'`).join(',');
      await sql(
        `insert into public.tags (kind, name, name_key)
         select 'trait', n, public.fold_key(n) from unnest(array[${list}]) n
         on conflict (kind, name_key) do nothing`,
      );
      expect((await rows('trait')).length).toBe(before);
    });
  });

  describe('crit. 1: zero or more tags on a recipe', () => {
    it('accepts an insert without trait_tags and stores []', async () => {
      const res = await insert({});
      expect(res.error).toBeNull();
      expect(res.data?.trait_tags).toEqual([]);
    });

    it('stores ["vegetarisch","snel"]', async () => {
      const res = await insert({ trait_tags: ['vegetarisch', 'snel'] });
      expect(res.error).toBeNull();
      expect(res.data?.trait_tags).toEqual(['vegetarisch', 'snel']);
    });

    it('refuses 21 tags and accepts 20 (check violation)', async () => {
      const names = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag}${i}`);
      const base = unique('max');
      expect((await insert({ trait_tags: names(21, base) })).error?.code).toBe(CHECK_VIOLATION);
      const ok = await insert({ trait_tags: names(20, base) });
      expect(ok.error).toBeNull();
      expect(ok.data?.trait_tags).toHaveLength(20);
      // cleanup of the 21 generated names
      for (let i = 0; i < 21; i++) usedNames.push(`${base}${i}`);
    });

    it('the maximum is per group: 20 dish plus 20 trait tags in one recipe are accepted', async () => {
      const d = unique('dmax');
      const t = unique('tmax');
      const dish = Array.from({ length: 20 }, (_, i) => `${d}${i}`);
      const trait = Array.from({ length: 20 }, (_, i) => `${t}${i}`);
      for (const n of [...dish, ...trait]) usedNames.push(n);
      const res = await insert({ dish_tags: dish, trait_tags: trait });
      expect(res.error).toBeNull();
      expect(res.data?.dish_tags).toHaveLength(20);
      expect(res.data?.trait_tags).toHaveLength(20);
    });

    it('turns "Snel" and "snel" in one recipe into one tag', async () => {
      const res = await insert({ trait_tags: ['Snel', 'snel'] });
      expect(res.error).toBeNull();
      expect(res.data?.trait_tags).toEqual(['snel']);
    });

    it('checks the same rules on update (21 tags refused)', async () => {
      const row = await insertRecipe(a.client);
      const base = unique('upd');
      const many = Array.from({ length: 21 }, (_, i) => `${base}${i}`);
      for (const n of many) usedNames.push(n);
      const res = await a.client.from('recipes').update({ trait_tags: many }).eq('id', row.id).select('id');
      expect(res.error?.code).toBe(CHECK_VIOLATION);
    });
  });

  describe('crit. 1: rights', () => {
    it('lets the author change trait_tags (column right)', async () => {
      const row = await insertRecipe(a.client, { trait_tags: ['snel'] });
      const res = await a.client.from('recipes').update({ trait_tags: ['zomer', 'licht'] }).eq('id', row.id).select('trait_tags');
      expect(res.error).toBeNull();
      expect(res.data).toEqual([{ trait_tags: ['zomer', 'licht'] }]);
    });

    it.each([
      ['another user', () => b],
      ['an administrator', () => admin],
    ])('gives %s 0 rows on update and leaves the tags unchanged', async (_n, who) => {
      const row = await insertRecipe(a.client, { trait_tags: ['snel'] });
      const res = await who().client.from('recipes').update({ trait_tags: ['winter'] }).eq('id', row.id).select('id');
      expect(res.data ?? []).toHaveLength(0);
      const check = await adminClient().from('recipes').select('trait_tags').eq('id', row.id).single();
      expect(check.data).toEqual({ trait_tags: ['snel'] });
    });
  });

  describe('crit. 1: new tags and reuse', () => {
    it('reuses the first spelling for a case/accent variant from another user, with one trait row', async () => {
      const n = unique('Feestelijk');
      await insertRecipe(a.client, { trait_tags: [n] });
      const second = await b.client
        .from('recipes')
        .insert(validRecipe({ trait_tags: [n.replace('Feestelijk', 'féestelijk')] }))
        .select('trait_tags')
        .single();
      expect(second.error).toBeNull();
      expect(second.data?.trait_tags).toEqual([n]);
      const found = await rows('trait', n.toLowerCase());
      expect(found).toHaveLength(1);
      expect(found[0].kind).toBe('trait');
    });

    it.each([
      ['empty', ''],
      ['spaces only', '   '],
      ['31 characters', 'x'.repeat(31)],
    ])('refuses a tag name that is %s', async (_n, name) => {
      expect((await insert({ trait_tags: [name] })).error?.code).toBe(CHECK_VIOLATION);
    });

    it('two concurrent inserts of "Pikant" and "pikant" give one catalogue row and no error', async () => {
      const n = unique('Pikant');
      const [r1, r2] = await Promise.all([
        a.client.from('recipes').insert(validRecipe({ trait_tags: [n] })),
        b.client.from('recipes').insert(validRecipe({ trait_tags: [n.toLowerCase()] })),
      ]);
      expect(r1.error).toBeNull();
      expect(r2.error).toBeNull();
      expect(await rows('trait', n.toLowerCase())).toHaveLength(1);
    });
  });

  describe('crit. 1: the same name in both groups', () => {
    it('makes one catalogue row per kind and each group keeps the spelling that came first in it', async () => {
      const n = unique('Brunchtest');
      const res = await insert({ dish_tags: [n], trait_tags: [n.toLowerCase()] });
      expect(res.error).toBeNull();
      const key = n.toLowerCase();
      const dish = await rows('dish', key);
      const trait = await rows('trait', key);
      expect(dish.map((r) => r.name)).toEqual([n]);
      expect(trait.map((r) => r.name)).toEqual([key]);
    });

    it('creates a name that already exists in dish (snack) as a new row in trait, not taken over from dish', async () => {
      const res = await insert({ trait_tags: ['snack'] });
      expect(res.error).toBeNull();
      expect(res.data?.trait_tags).toEqual(['snack']);
      expect(await rows('trait', 'snack')).toHaveLength(1);
      expect(await rows('dish', 'snack')).toHaveLength(1);
    });
  });

  describe('crit. 1: nobody renames or removes tags', () => {
    it.each([
      ['a user', () => a],
      ['an administrator', () => admin],
    ])('refuses a direct insert with kind = trait for %s (42501)', async (_n, who) => {
      const ins = await who().client.from('tags').insert({ kind: 'trait', name: 'direct', name_key: 'direct' });
      expect(ins.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      const upd = await who().client.from('tags').update({ name: 'anders' }).eq('kind', 'trait').eq('name', 'snel');
      expect(upd.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      const del = await who().client.from('tags').delete().eq('kind', 'trait').eq('name', 'snel');
      expect(del.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      expect((await rows('trait', 'snel')).map((r) => r.name)).toEqual(['snel']);
    });
  });

  describe('crit. 2: combined filter in the database', () => {
    it('.overlaps on dish_tags and trait_tags as a plain user gives the intersection', async () => {
      const t = unique('Filt');
      const both = await insertRecipe(a.client, { title: `${t} beide`, dish_tags: ['soep'], trait_tags: ['vegetarisch'] });
      const dishOnly = await insertRecipe(a.client, { title: `${t} soep`, dish_tags: ['soep'] });
      const traitOnly = await insertRecipe(a.client, { title: `${t} veg`, trait_tags: ['vegetarisch'] });
      const res = await b.client
        .from('recipes')
        .select('id')
        .overlaps('dish_tags', ['soep'])
        .overlaps('trait_tags', ['vegetarisch'])
        .in('id', [both.id, dishOnly.id, traitOnly.id]);
      expect(res.error).toBeNull();
      expect((res.data ?? []).map((r) => r.id)).toEqual([both.id]);
    });
  });
});
