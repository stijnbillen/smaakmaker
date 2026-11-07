import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  makeAdmin,
  type TestUser,
} from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';

// T-025 / R-022 against the local Supabase: catalogue administration through admin_* functions.
// Test items use invented keys ("qzvk..."), so the starting list is never touched; every test removes its items.
const INSUFFICIENT_PRIVILEGE = '42501';
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY = '23503';
const INVALID_PARAMETER = '22023';

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (items: string[]) => `array[${items.map(lit).join(',')}]::text[]`;

type Kind = 'ingredient' | 'unit';
const tableOf = (k: Kind) => (k === 'ingredient' ? 'ingredients' : 'units');
const keysOf = (k: Kind) => (k === 'ingredient' ? 'ingredient_keys' : 'unit_keys');
const colOf = (k: Kind) => (k === 'ingredient' ? 'ingredient_id' : 'unit_id');

interface Item {
  nl?: string | null;
  fr?: string | null;
  syn?: string[];
}

interface ListRow {
  id: string;
  name_nl: string | null;
  name_fr: string | null;
  synonyms: string[];
  use_count: number;
}

describe('catalogue administration (R-022)', () => {
  let boss: TestUser;
  let plain: TestUser;
  let author2: TestUser;
  const items: Array<{ kind: Kind; id: string }> = [];
  const recipeIds: string[] = [];

  async function addItem(kind: Kind, it: Item): Promise<string> {
    const rows = await sql<{ id: string }>(
      `insert into public.${tableOf(kind)} (name_nl, name_fr, synonyms)
       values (${it.nl == null ? 'null' : lit(it.nl)}, ${it.fr == null ? 'null' : lit(it.fr)}, ${arr(it.syn ?? [])}) returning id`,
    );
    items.push({ kind, id: rows[0].id });
    return rows[0].id;
  }

  async function addRecipe(author: TestUser, title: string, lines: unknown[]): Promise<string> {
    const rows = await sql<{ id: string }>(
      `insert into public.recipes (title, author_id, ingredients, steps, prep_minutes, total_minutes, servings)
       values (${lit(title)}, ${lit(author.id)}, ${lit(JSON.stringify(lines))}::jsonb, '["Roer."]'::jsonb, 5, 10, 2) returning id`,
    );
    recipeIds.push(rows[0].id);
    return rows[0].id;
  }

  const linesOf = async (id: string) =>
    (await sql<{ ingredients: Array<Record<string, unknown>> }>(`select ingredients from public.recipes where id = ${lit(id)}`))[0]
      .ingredients;

  const exists = async (kind: Kind, id: string) =>
    (await sql(`select 1 from public.${tableOf(kind)} where id = ${lit(id)}`)).length > 0;

  const keyOwner = async (kind: Kind, key: string) =>
    (await sql<{ id: string }>(`select ${colOf(kind)} as id from public.${keysOf(kind)} where key = ${lit(key)}`))[0]?.id;

  /** Everything the catalogue and the test recipes hold, for before/after comparisons. */
  const snapshot = async (kinds: Kind[] = ['ingredient', 'unit']) => {
    const out: unknown[] = [];
    for (const k of kinds) {
      out.push(await sql(`select * from public.${tableOf(k)} order by id`));
      out.push(await sql(`select key, ${colOf(k)} from public.${keysOf(k)} order by key`));
    }
    out.push(await sql(`select id, to_jsonb(r) as j from public.recipes r where id in (${recipeIds.map(lit).join(',') || "''"}) order by id`));
    return JSON.stringify(out);
  };

  const list = async (kind: Kind, term: string, lang: 'nl' | 'fr' = 'nl') => {
    const res = await boss.client.rpc('admin_list_catalog', { p_kind: kind, p_term: term, p_lang: lang });
    expect(res.error, `list ${term}`).toBeNull();
    return (res.data ?? []) as ListRow[];
  };

  const update = (kind: Kind, id: string, nl: string | null, fr: string | null, syn: string[], c = boss.client) =>
    c.rpc('admin_update_catalog', { p_kind: kind, p_id: id, p_name_nl: nl, p_name_fr: fr, p_synonyms: syn });
  const merge = (kind: Kind, from: string, into: string, c = boss.client) =>
    c.rpc('admin_merge_catalog', { p_kind: kind, p_from: from, p_into: into });
  const remove = (kind: Kind, id: string, c = boss.client) => c.rpc('admin_delete_catalog', { p_kind: kind, p_id: id });

  beforeAll(async () => {
    await assertSupabaseUp();
    boss = await createTestUser('catadm');
    await makeAdmin(boss.id);
    plain = await createTestUser('catplain');
    author2 = await createTestUser('catauth2');
  });

  afterAll(async () => {
    if (recipeIds.length) await sql(`delete from public.recipes where id in (${recipeIds.map(lit).join(',')})`).catch(() => undefined);
    for (const i of items.reverse()) {
      await sql(`delete from public.${tableOf(i.kind)} where id = ${lit(i.id)}`).catch(() => undefined);
    }
    for (const u of [boss, plain, author2]) if (u) await deleteTestUser(u);
  });

  // crit. 2
  describe('admin_list_catalog (crit. 2)', () => {
    it('finds a misspelled term and counts each recipe once, however many lines use the item', async () => {
      const id = await addItem('ingredient', { nl: 'qzvkbroccolix', fr: 'qzvkbrocolix' });
      await addRecipe(boss, 'twee regels', [
        { name: 'qzvkbroccolix', ingredient_id: id },
        { name: 'qzvkbroccolix', ingredient_id: id },
      ]);
      await addRecipe(author2, 'een regel', [{ name: 'qzvkbroccolix', ingredient_id: id }]);
      await addRecipe(author2, 'geen regel', [{ name: 'zout' }]);
      const rows = await list('ingredient', 'qzvkbrocollix');
      const hit = rows.find((r) => r.id === id);
      expect(hit).toBeDefined();
      expect(Number(hit!.use_count)).toBe(2);
    });

    it('counts units by unit_id', async () => {
      const u = await addItem('unit', { nl: 'qzvkunit', fr: 'qzvkunite' });
      await addRecipe(boss, 'eenheid', [{ name: 'zout', unit: 'qzvkunit', unit_id: u }]);
      const hit = (await list('unit', 'qzvkunit')).find((r) => r.id === u);
      expect(Number(hit?.use_count)).toBe(1);
    });

    it('finds items by a French name and by a synonym, and lists ingredients apart from units', async () => {
      const id = await addItem('ingredient', { nl: 'qzvkaarde', fr: 'qzvkterre', syn: ['qzvkpatat'] });
      expect((await list('ingredient', 'qzvkterre', 'fr')).map((r) => r.id)).toContain(id);
      expect((await list('ingredient', 'qzvkpatat')).map((r) => r.id)).toContain(id);
      expect((await list('unit', 'qzvkpatat')).map((r) => r.id)).not.toContain(id);
    });

    it('returns all items alphabetically for an empty term', async () => {
      const all = await list('ingredient', '');
      expect(all.length).toBeGreaterThanOrEqual(150);
      const names = all.map((r) => (r.name_nl || r.name_fr || '').toLowerCase());
      const sorted = [...names].sort((x, y) => x.localeCompare(y, 'nl'));
      expect(names).toEqual(sorted);
    });

    it('does not cap the result at 5 (administration shows all hits)', async () => {
      for (let i = 0; i < 7; i++) await addItem('ingredient', { nl: `qzvkmassa${i}` });
      expect((await list('ingredient', 'qzvkmassa')).length).toBeGreaterThanOrEqual(7);
    });
  });

  // crit. 3
  describe('admin_update_catalog (crit. 3)', () => {
    it('a synonym added by the administrator becomes an exact hit of suggest_ingredients', async () => {
      const id = await addItem('ingredient', { nl: 'qzvkknol' });
      const res = await update('ingredient', id, 'qzvkknol', null, ['qzvkfrietje']);
      expect(res.error).toBeNull();
      const s = await boss.client.rpc('suggest_ingredients', { p_term: 'qzvkfrietje', p_autocomplete: false, p_lang: 'nl' });
      expect(s.error).toBeNull();
      const rows = s.data as Array<{ id: string; match_kind: string }>;
      expect(rows.find((r) => r.id === id)?.match_kind).toBe('exact');
    });

    it('refuses a synonym whose key belongs to another item: 23505 with that id; nothing changes', async () => {
      const a = await addItem('ingredient', { nl: 'qzvkeen', syn: ['qzvksyn1'] });
      const b = await addItem('ingredient', { nl: 'qzvktwee' });
      const before = await snapshot(['ingredient']);
      const res = await update('ingredient', a, 'qzvkeen', null, ['qzvksyn1', 'QZVKTWEE']);
      expect(res.error?.code).toBe(UNIQUE_VIOLATION);
      expect(res.error?.details ?? '').toContain(b);
      expect(await snapshot(['ingredient'])).toBe(before);
    });

    it('allows keeping own keys and changing only the case of own name', async () => {
      const a = await addItem('ingredient', { nl: 'qzvkhoofd', syn: ['qzvkbijnaam'] });
      expect((await update('ingredient', a, 'QZVKHOOFD', 'qzvkfrans', ['qzvkbijnaam'])).error).toBeNull();
      expect(await keyOwner('ingredient', 'qzvkfrans')).toBe(a);
    });

    it('rejects two empty names, a name over 80 characters (ingredient) or 20 (unit): 23514', async () => {
      const a = await addItem('ingredient', { nl: 'qzvklang' });
      const u = await addItem('unit', { nl: 'qzvku' });
      expect((await update('ingredient', a, null, null, [])).error?.code).toBe(CHECK_VIOLATION);
      expect((await update('ingredient', a, '', '  ', [])).error?.code).toBe(CHECK_VIOLATION);
      expect((await update('ingredient', a, 'q'.repeat(81), null, [])).error?.code).toBe(CHECK_VIOLATION);
      expect((await update('ingredient', a, 'q'.repeat(80), null, [])).error).toBeNull();
      expect((await update('unit', u, 'q'.repeat(21), null, [])).error?.code).toBe(CHECK_VIOLATION);
      expect((await update('unit', u, 'q'.repeat(20), null, [])).error).toBeNull();
    });

    it('rejects more than 20 synonyms, accepts 20: 23514', async () => {
      const a = await addItem('ingredient', { nl: 'qzvkveel' });
      const syn = (n: number) => Array.from({ length: n }, (_, i) => `qzvkveel${i}x`);
      expect((await update('ingredient', a, 'qzvkveel', null, syn(21))).error?.code).toBe(CHECK_VIOLATION);
      expect((await update('ingredient', a, 'qzvkveel', null, syn(20))).error).toBeNull();
    });

    it('a new French name is what a recipe line shows at once (keys follow)', async () => {
      const a = await addItem('ingredient', { nl: 'qzvkdutch' });
      expect((await update('ingredient', a, 'qzvkdutch', 'qzvkfrench', [])).error).toBeNull();
      const rows = await list('ingredient', 'qzvkfrench', 'fr');
      expect(rows.find((r) => r.id === a)?.name_fr).toBe('qzvkfrench');
    });
  });

  // crit. 4
  describe('admin_merge_catalog (crit. 4)', () => {
    it('re-points recipes of different authors, moves keys to B, removes A and leaves all else byte for byte', async () => {
      const a = await addItem('ingredient', { nl: 'qzvkmerga', fr: 'qzvkmergafr', syn: ['qzvkmergsyn'] });
      const b = await addItem('ingredient', { nl: 'qzvkmergb' });
      const l1 = { name: 'qzvkmerga', quantity: 2, unit: 'stuk', size: 'large', ingredient_id: a };
      const l2 = { name: 'zout' };
      const r1 = await addRecipe(boss, 'merge 1', [l2, l1]);
      const r2 = await addRecipe(author2, 'merge 2', [l1]);
      const rest = async (id: string) =>
        (await sql<{ j: unknown }>(`select to_jsonb(r) - 'ingredients' as j from public.recipes r where id = ${lit(id)}`))[0].j;
      const rest1 = await rest(r1);
      const rest2 = await rest(r2);

      const res = await merge('ingredient', a, b);
      expect(res.error).toBeNull();

      expect(await linesOf(r1)).toEqual([l2, { ...l1, ingredient_id: b }]);
      expect(await linesOf(r2)).toEqual([{ ...l1, ingredient_id: b }]);
      expect(await rest(r1)).toEqual(rest1);
      expect(await rest(r2)).toEqual(rest2);
      expect(await exists('ingredient', a)).toBe(false);
      for (const k of ['qzvkmerga', 'qzvkmergafr', 'qzvkmergsyn', 'qzvkmergb']) {
        expect(await keyOwner('ingredient', k), k).toBe(b);
      }
    });

    it('merges units through unit_id', async () => {
      const a = await addItem('unit', { nl: 'qzvkua' });
      const b = await addItem('unit', { nl: 'qzvkub' });
      const r = await addRecipe(boss, 'unit merge', [{ name: 'zout', unit: 'qzvkua', unit_id: a }]);
      expect((await merge('unit', a, b)).error).toBeNull();
      expect((await linesOf(r))[0].unit_id).toBe(b);
      expect(await keyOwner('unit', 'qzvkua')).toBe(b);
    });

    it('refuses to merge an item into itself and changes nothing', async () => {
      const a = await addItem('ingredient', { nl: 'qzvkself' });
      const before = await snapshot();
      const res = await merge('ingredient', a, a);
      expect(res.error?.code).toBe(INVALID_PARAMETER);
      expect(await snapshot()).toBe(before);
    });

    it('rolls everything back when B would exceed 20 synonyms', async () => {
      const bSyn = Array.from({ length: 20 }, (_, i) => `qzvkfull${i}x`);
      const a = await addItem('ingredient', { nl: 'qzvkrolla', syn: ['qzvkrollsyn'] });
      const b = await addItem('ingredient', { nl: 'qzvkrollb', syn: bSyn });
      await addRecipe(boss, 'rollback', [{ name: 'qzvkrolla', ingredient_id: a }]);
      await addRecipe(author2, 'rollback 2', [{ name: 'qzvkrolla', ingredient_id: a }]);
      const before = await snapshot();
      const res = await merge('ingredient', a, b);
      expect(res.error?.code).toBe(CHECK_VIOLATION);
      expect(await snapshot()).toBe(before);
    });

  });

  // crit. 5
  describe('admin_delete_catalog (crit. 5)', () => {
    it('deletes an unused item together with its keys', async () => {
      const a = await addItem('ingredient', { nl: 'qzvkweg', syn: ['qzvkwegsyn'] });
      expect((await remove('ingredient', a)).error).toBeNull();
      expect(await exists('ingredient', a)).toBe(false);
      expect(await keyOwner('ingredient', 'qzvkweg')).toBeUndefined();
      expect(await keyOwner('ingredient', 'qzvkwegsyn')).toBeUndefined();
    });

    it('refuses an item that 2 recipes use: 23503 with the number 2; the item stays', async () => {
      const a = await addItem('ingredient', { nl: 'qzvkgebruikt' });
      await addRecipe(boss, 'gebruik 1', [{ name: 'qzvkgebruikt', ingredient_id: a }]);
      await addRecipe(author2, 'gebruik 2', [
        { name: 'qzvkgebruikt', ingredient_id: a },
        { name: 'qzvkgebruikt', ingredient_id: a },
      ]);
      const res = await remove('ingredient', a);
      expect(res.error?.code).toBe(FOREIGN_KEY);
      expect(res.error?.details ?? '').toMatch(/\b2\b/);
      expect(await exists('ingredient', a)).toBe(true);
      expect(await keyOwner('ingredient', 'qzvkgebruikt')).toBe(a);
    });

    it('refuses a unit in use as well', async () => {
      const u = await addItem('unit', { nl: 'qzvkugebr' });
      await addRecipe(boss, 'unit gebruik', [{ name: 'zout', unit: 'qzvkugebr', unit_id: u }]);
      const res = await remove('unit', u);
      expect(res.error?.code).toBe(FOREIGN_KEY);
      expect(await exists('unit', u)).toBe(true);
    });
  });

  // crit. 6
  describe('enforced in the database (crit. 6)', () => {
    it('refuses a normal user and anon on all four functions, and changes nothing', async () => {
      const a = await addItem('ingredient', { nl: 'qzvkbeveiligd' });
      const b = await addItem('ingredient', { nl: 'qzvkbeveiligd2' });
      const before = await snapshot();
      for (const c of [plain.client, anonClient()]) {
        const who = c === plain.client ? 'user' : 'anon';
        const calls = {
          list: await c.rpc('admin_list_catalog', { p_kind: 'ingredient', p_term: '', p_lang: 'nl' }),
          update: await update('ingredient', a, 'gekraakt', null, [], c),
          merge: await merge('ingredient', a, b, c),
          delete: await remove('ingredient', a, c),
        };
        for (const [name, res] of Object.entries(calls)) {
          expect(res.error, `${who} ${name}`).not.toBeNull();
          if (who === 'user') expect(res.error?.code, `${who} ${name}`).toBe(INSUFFICIENT_PRIVILEGE);
        }
      }
      expect(await snapshot()).toBe(before);
    });

    it('refuses direct update and delete on the four tables, for a normal user and for an administrator', async () => {
      const a = await addItem('ingredient', { nl: 'qzvkdirect' });
      const u = await addItem('unit', { nl: 'qzvkdirectu' });
      const before = await snapshot();
      for (const c of [plain.client, boss.client]) {
        for (const [table, id, col] of [
          ['ingredients', a, 'id'],
          ['units', u, 'id'],
        ] as const) {
          const up = await c.from(table).update({ name_nl: 'gekraakt' }).eq(col, id).select();
          expect(up.error !== null || (up.data ?? []).length === 0, `update ${table}`).toBe(true);
          const del = await c.from(table).delete().eq(col, id).select();
          expect(del.error !== null || (del.data ?? []).length === 0, `delete ${table}`).toBe(true);
        }
        for (const [table, col] of [
          ['ingredient_keys', 'ingredient_id'],
          ['unit_keys', 'unit_id'],
        ] as const) {
          const up = await c.from(table).update({ key: 'gekraakt' }).eq(col, col === 'ingredient_id' ? a : u).select();
          expect(up.error !== null || (up.data ?? []).length === 0, `update ${table}`).toBe(true);
          const del = await c.from(table).delete().eq(col, col === 'ingredient_id' ? a : u).select();
          expect(del.error !== null || (del.data ?? []).length === 0, `delete ${table}`).toBe(true);
        }
      }
      expect(await snapshot()).toBe(before);
    });

    it('gives an administrator no right to update recipes of others directly', async () => {
      const r = await addRecipe(author2, 'van een ander', [{ name: 'zout' }]);
      const res = await boss.client.from('recipes').update({ title: 'gekraakt' }).eq('id', r).select();
      expect(res.error !== null || (res.data ?? []).length === 0).toBe(true);
      expect((await sql<{ title: string }>(`select title from public.recipes where id = ${lit(r)}`))[0].title).toBe('van een ander');
    });
  });

  // crit. 7
  describe('size stays fixed (crit. 7)', () => {
    it('still accepts only small, medium and large; there is no size table or function', async () => {
      const bad = await boss.client
        .from('recipes')
        .insert({
          title: 'formaat',
          ingredients: [{ name: 'aardappel', size: 'huge' }],
          steps: ['x'],
          prep_minutes: 1,
          total_minutes: 2,
          servings: 2,
        })
        .select();
      expect(bad.error).not.toBeNull();
      const found = await sql<{ n: string }>(
        `select (
           (select count(*) from information_schema.tables where table_schema = 'public' and table_name ~ '(size|format)')
         + (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname ~ '^admin_.*(size|format)')) as n`,
      );
      expect(Number(found[0].n)).toBe(0);
    });
  });
});
