import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';
import { RETIRED_LANG } from '../helpers/retired-lang';
import { ENGLISH_INGREDIENT_TERMS, ENGLISH_UNIT_TERMS } from '../helpers/english-terms';

// T-019 / R-018 against the local Supabase: ingredient and unit catalogues.
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const INSUFFICIENT_PRIVILEGE = '42501';
const INVALID_PARAMETER = '22023';

const suffix = () => Math.random().toString(36).slice(2, 8);
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (items: string[]) => `array[${items.map(lit).join(',')}]::text[]`;
const nul = (s: string | null) => (s === null ? 'null' : lit(s));

type Kind = 'ingredients' | 'units';

/** Admin insert through pg (the only way to set synonyms). Returns the error code, or null. */
async function adminInsert(
  table: Kind,
  nameNl: string | null,
  nameFr: string | null,
  synonyms: string[] = [],
): Promise<string | null> {
  try {
    await sql(
      `insert into public.${table} (name_nl, name_fr, synonyms) values (${nul(nameNl)}, ${nul(nameFr)}, ${arr(synonyms)})`,
    );
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown';
  }
}

const cleanup: Array<() => Promise<unknown>> = [];
/** Removes every item whose Dutch name starts with the marker (keys cascade). */
const track = (table: Kind, marker: string) =>
  cleanup.push(() => sql(`delete from public.${table} where name_nl like ${lit(marker + '%')} or name_fr like ${lit(marker + '%')}`));

describe('ingredient and unit catalogue (R-018)', () => {
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    await assertSupabaseUp();
    a = await createTestUser('cata');
    b = await createTestUser('catb');
  });

  afterAll(async () => {
    for (const fn of cleanup) await fn().catch(() => undefined);
    for (const u of [a, b]) if (u) await deleteTestUser(u);
  });

  describe('crit. 1: names and synonyms', () => {
    for (const [table, max] of [
      ['ingredients', 80],
      ['units', 20],
    ] as const) {
      describe(table, () => {
        it(`accepts a name of ${max} characters and refuses ${max + 1} (23514)`, async () => {
          const s = suffix();
          track(table, s);
          expect(await adminInsert(table, s + 'x'.repeat(max - s.length), null)).toBeNull();
          expect(await adminInsert(table, s + 'y'.repeat(max + 1 - s.length), null)).toBe(CHECK_VIOLATION);
          expect(await adminInsert(table, null, s + 'z'.repeat(max + 1 - s.length))).toBe(CHECK_VIOLATION);
        });

        it('treats a name that is empty after trimming as empty', async () => {
          const s = suffix();
          track(table, s);
          expect(await adminInsert(table, '   ', '')).toBe(CHECK_VIOLATION);
          expect(await adminInsert(table, '   ', '   ')).toBe(CHECK_VIOLATION);
          // One real name next to a blank one is fine, and the blank one is stored as null.
          expect(await adminInsert(table, '   ', s)).toBeNull();
          const rows = await sql<{ name_nl: string | null }>(`select name_nl from public.${table} where name_fr = ${lit(s)}`);
          expect(rows[0].name_nl).toBeNull();
        });

        it('refuses both names null (23514) and accepts exactly one', async () => {
          const s = suffix();
          track(table, s);
          expect(await adminInsert(table, null, null)).toBe(CHECK_VIOLATION);
          expect(await adminInsert(table, s + 'a', null)).toBeNull();
          expect(await adminInsert(table, null, s + 'b')).toBeNull();
        });

        it('accepts 20 synonyms and refuses 21 (23514)', async () => {
          const s = suffix();
          track(table, s);
          const syn = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${s}${i}`);
          expect(await adminInsert(table, s + 'twintig', null, syn(20, 'a'))).toBeNull();
          expect(await adminInsert(table, s + 'eenentwintig', null, syn(21, 'b'))).toBe(CHECK_VIOLATION);
        });

        it(`refuses an empty synonym and one of ${max + 1} characters (23514)`, async () => {
          const s = suffix();
          track(table, s);
          expect(await adminInsert(table, s + 'leeg', null, [''])).toBe(CHECK_VIOLATION);
          expect(await adminInsert(table, s + 'spaties', null, ['   '])).toBe(CHECK_VIOLATION);
          expect(await adminInsert(table, s + 'lang', null, ['q'.repeat(max + 1)])).toBe(CHECK_VIOLATION);
          expect(await adminInsert(table, s + 'grens', null, [s + 'r'.repeat(max - s.length)])).toBeNull();
        });

        it('counts characters, not bytes: accented letters and emoji', async () => {
          const s = suffix();
          track(table, s);
          // "é" is 2 bytes and the emoji 4: only a character count accepts max of them.
          expect(await adminInsert(table, s + 'é'.repeat(max - s.length), null)).toBeNull();
          expect(await adminInsert(table, s + '😀'.repeat(max - s.length), null)).toBeNull();
          expect(await adminInsert(table, s + '😀'.repeat(max + 1 - s.length), null)).toBe(CHECK_VIOLATION);
        });
      });
    }

    it('public.item_key gives the same keys as the client (crit. 1)', async () => {
      const rows = await sql<{ a: string; b: string }>(
        `select public.item_key('Crème  Fraîche') as a, public.item_key('  Broccoli ') as b`,
      );
      expect(rows[0]).toEqual({ a: 'creme fraiche', b: 'broccoli' });
    });
  });

  describe('crit. 2: one item per key', () => {
    const insertAs = (u: TestUser, table: Kind, row: Record<string, unknown>) => u.client.from(table).insert(row);

    it.each([['Broccoli'], ['BROCCOLI'], ['Brocolli']])('refuses a second ingredient "%s" (23505)', async (name) => {
      const res = await insertAs(a, 'ingredients', { name_nl: name });
      expect(res.error?.code).toBe(UNIQUE_VIOLATION);
    });

    it('refuses a French name equal to the Dutch key of another item ("tomaat")', async () => {
      const res = await insertAs(a, 'ingredients', { name_fr: 'tomaat' });
      expect(res.error?.code).toBe(UNIQUE_VIOLATION);
    });

    it('accepts "Pomme de terre" (new key)', async () => {
      const name = `Pomme de terre ${suffix()}`;
      track('ingredients', name);
      expect((await insertAs(a, 'ingredients', { name_nl: name })).error).toBeNull();
    });

    it('lets one item have the same key in Dutch and French', async () => {
      const s = suffix();
      track('ingredients', s);
      track('units', s);
      expect((await insertAs(a, 'ingredients', { name_nl: s + 'ab', name_fr: s + 'AB' })).error).toBeNull();
      expect((await insertAs(a, 'units', { name_nl: s + 'u', name_fr: s + 'U' })).error).toBeNull();
    });

    it('refuses an administrator synonym that is already the name of another item (23505)', async () => {
      expect(await adminInsert('ingredients', `Nieuw${suffix()}`, null, ['tomaat'])).toBe(UNIQUE_VIOLATION);
      expect(await adminInsert('units', `Nieuw${suffix()}`, null, ['gram'])).toBe(UNIQUE_VIOLATION);
    });

    it('lets the same key exist once as ingredient and once as unit', async () => {
      const s = suffix();
      track('ingredients', s);
      track('units', s);
      expect((await insertAs(a, 'ingredients', { name_nl: `${s}blik` })).error).toBeNull();
      expect((await insertAs(a, 'units', { name_nl: `${s}blik` })).error).toBeNull();
    });

    it('race: two users add the same name through add_ingredient and get one item', async () => {
      const name = `tempeh${suffix()}`;
      track('ingredients', name);
      const [r1, r2] = await Promise.all([
        a.client.rpc('add_ingredient', { p_name: name, p_lang: 'nl' }),
        b.client.rpc('add_ingredient', { p_name: name, p_lang: 'nl' }),
      ]);
      expect(r1.error).toBeNull();
      expect(r2.error).toBeNull();
      const id1 = (r1.data as Array<{ id: string }>)[0].id;
      const id2 = (r2.data as Array<{ id: string }>)[0].id;
      expect(id1).toBe(id2);
      const created = [r1, r2].filter((r) => (r.data as Array<{ created: boolean }>)[0].created);
      expect(created).toHaveLength(1);
      const n = await sql<{ n: string }>(`select count(*) as n from public.ingredient_keys where key = public.item_key(${lit(name)})`);
      expect(Number(n[0].n)).toBe(1);
    });

    it('race: two direct inserts give one success and one 23505, and one item', async () => {
      const name = `seitan${suffix()}`;
      track('ingredients', name);
      const [r1, r2] = await Promise.all([
        insertAs(a, 'ingredients', { name_nl: name }),
        insertAs(b, 'ingredients', { name_nl: name }),
      ]);
      const codes = [r1.error?.code ?? null, r2.error?.code ?? null].sort();
      expect(codes).toEqual([null, UNIQUE_VIOLATION].sort());
      const n = await sql<{ n: string }>(`select count(*) as n from public.ingredients where name_nl = ${lit(name)}`);
      expect(Number(n[0].n)).toBe(1);
    });
  });

  describe('crit. 3: the starting list', () => {
    it('has at least 150 ingredients and 25 units with both names', async () => {
      const i = await sql<{ n: string }>(`select count(*) as n from public.ingredients where name_nl is not null and name_fr is not null`);
      const u = await sql<{ n: string }>(`select count(*) as n from public.units where name_nl is not null and name_fr is not null`);
      expect(Number(i[0].n)).toBeGreaterThanOrEqual(150);
      expect(Number(u[0].n)).toBeGreaterThanOrEqual(25);
    });

    // R-026 crit. 4: Dutch + French names; Dutch spelling variants stay synonyms, no English left.
    it('has broccoli / brocoli with the spellings "broccolli" and "brocolli" as synonyms, under one key', async () => {
      const rows = await sql<{ name_nl: string; name_fr: string; synonyms: string[] }>(
        `select i.name_nl, i.name_fr, i.synonyms from public.ingredient_keys k join public.ingredients i on i.id = k.ingredient_id where k.key = 'broccoli'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].name_nl).toBe('broccoli');
      expect(rows[0].name_fr).toBe('brocoli');
      expect(rows[0].synonyms).toEqual(expect.arrayContaining(['brocolli', 'broccolli']));
    });

    it.each([
      ['broccoli', 'brocoli'],
      ['aardappel', 'pomme de terre'],
      ['tomaat', 'tomate'],
    ])('has %s / %s as one row', async (nlName, frName) => {
      const rows = await sql(`select 1 from public.ingredients where name_nl = ${lit(nlName)} and name_fr = ${lit(frName)}`);
      expect(rows).toHaveLength(1);
    });

    it.each([
      ['tomate', 'tomaat'],
      ['pomme de terre', 'aardappel'],
    ])('the French key "%s" points to the item "%s"', async (frKey, nlName) => {
      const rows = await sql<{ name_nl: string }>(
        `select i.name_nl from public.ingredient_keys k join public.ingredients i on i.id = k.ingredient_id where k.key = public.item_key(${lit(frKey)})`,
      );
      expect(rows.map((r) => r.name_nl)).toEqual([nlName]);
    });

    it.each([
      ['el', 'c. à soupe'],
      ['tl', 'c. à café'],
      ['stuk', 'pièce'],
      ['snuf', 'pincée'],
      ['teentje', 'gousse'],
      ['takje', 'brin'],
      ['blik', 'boîte'],
      ['bosje', 'botte'],
    ])('has the unit %s / %s as one row, also found by its French key', async (nlName, frName) => {
      const rows = await sql<{ name_nl: string }>(
        `select u.name_nl from public.unit_keys k join public.units u on u.id = k.unit_id where k.key = public.item_key(${lit(frName)})`,
      );
      expect(rows.map((r) => r.name_nl)).toEqual([nlName]);
      const own = await sql(`select 1 from public.units where name_nl = ${lit(nlName)} and name_fr = ${lit(frName)}`);
      expect(own).toHaveLength(1);
    });

    // No English left in the starting lists (R-026 crit. 4): neither as a key nor as a name.
    it.each(ENGLISH_INGREDIENT_TERMS)('has no English ingredient key "%s"', async (key) => {
      expect(await sql(`select 1 from public.ingredient_keys where key = ${lit(key)}`)).toHaveLength(0);
    });

    it.each(ENGLISH_UNIT_TERMS)('has no English unit key "%s"', async (key) => {
      expect(await sql(`select 1 from public.unit_keys where key = ${lit(key)}`)).toHaveLength(0);
    });

    it('has name_fr and no column ending in _en on ingredients and units (crit. 3)', async () => {
      for (const table of ['ingredients', 'units']) {
        const cols = await sql<{ column_name: string }>(
          `select column_name from information_schema.columns where table_schema = 'public' and table_name = ${lit(table)}`,
        );
        const names = cols.map((c) => c.column_name);
        expect(names, table).toContain('name_fr');
        expect(names.filter((n) => n.endsWith('_en')), table).toEqual([]);
      }
    });

    it.each(['zout', 'paprika'])('has %s (needed by R-019)', async (key) => {
      expect(await sql(`select 1 from public.ingredient_keys where key = ${lit(key)}`)).toHaveLength(1);
    });

    it.each(['tomaten', 'paprica', 'tomaaat'])('does not have "%s" as a key (R-019 must suggest, not match)', async (key) => {
      expect(await sql(`select 1 from public.ingredient_keys where key = ${lit(key)}`)).toHaveLength(0);
    });

    it('has the required units, each with a French name', async () => {
      const required = ['g', 'kg', 'ml', 'dl', 'l', 'el', 'tl', 'stuk', 'snuf', 'teentje', 'takje', 'blik', 'bosje'];
      for (const key of required) {
        const rows = await sql<{ name_fr: string | null }>(
          `select u.name_fr from public.unit_keys k join public.units u on u.id = k.unit_id where k.key = ${lit(key)}`,
        );
        expect(rows, key).toHaveLength(1);
        expect(rows[0].name_fr, key).toBeTruthy();
      }
    });

    it('gives "el" the synonym "eetlepel" and "tl" the synonym "theelepel"', async () => {
      const rows = await sql<{ key: string; synonyms: string[] }>(
        `select k.key, u.synonyms from public.unit_keys k join public.units u on u.id = k.unit_id where k.key in ('el','tl')`,
      );
      const by = Object.fromEntries(rows.map((r) => [r.key, r.synonyms]));
      expect(by.el).toContain('eetlepel');
      expect(by.tl).toContain('theelepel');
    });

    it('add_ingredient(tempeh, fr) fills name_fr and leaves name_nl empty (R-026 crit. 3)', async () => {
      const name = `tempeh${suffix()}`;
      track('ingredients', name);
      expect((await a.client.rpc('add_ingredient', { p_name: name, p_lang: 'fr' })).error).toBeNull();
      const rows = await sql<{ name_nl: string | null; name_fr: string | null }>(`select name_nl, name_fr from public.ingredients where name_fr = ${lit(name)}`);
      expect(rows).toEqual([{ name_nl: null, name_fr: name }]);
    });

    it('a plain user can insert name_fr directly (column right) but not update it', async () => {
      const name = `direct${suffix()}`;
      track('ingredients', name);
      expect((await a.client.from('ingredients').insert({ name_fr: name })).error).toBeNull();
      await a.client.from('ingredients').update({ name_fr: 'gekaapt' }).eq('name_fr', name).select();
      expect(await sql(`select 1 from public.ingredients where name_fr = ${lit(name)}`)).toHaveLength(1);
    });

    it('is in a migration, not in seed.sql', async () => {
      const { readFileSync, readdirSync, existsSync } = await import('node:fs');
      const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
      const inMigration = migrations.some((f) => /brocolli/i.test(readFileSync(`supabase/migrations/${f}`, 'utf8')));
      expect(inMigration).toBe(true);
      if (existsSync('supabase/seed.sql')) expect(readFileSync('supabase/seed.sql', 'utf8')).not.toMatch(/ingredients/i);
    });
  });

  describe('crit. 4: reading', () => {
    it.each(['ingredients', 'units', 'ingredient_keys', 'unit_keys'])('anon gets nothing from %s', async (table) => {
      const res = await anonClient().from(table).select('*');
      expect(res.error !== null || (res.data ?? []).length === 0).toBe(true);
    });

    it('a signed-in user sees the starting list and items added by someone else', async () => {
      const name = `zichtbaar${suffix()}`;
      track('ingredients', name);
      expect((await a.client.rpc('add_ingredient', { p_name: name, p_lang: 'nl' })).error).toBeNull();
      const seen = await b.client.from('ingredients').select('name_nl').eq('name_nl', name);
      expect(seen.data).toEqual([{ name_nl: name }]);
      const broccoli = await b.client.from('ingredients').select('name_nl').eq('name_nl', 'broccoli');
      expect(broccoli.data).toHaveLength(1);
      const keys = await b.client.from('ingredient_keys').select('key').eq('key', 'broccoli');
      expect(keys.data).toHaveLength(1);
    });

    it('anon cannot execute add_ingredient or add_unit (42501)', async () => {
      const i = await anonClient().rpc('add_ingredient', { p_name: `x${suffix()}`, p_lang: 'nl' });
      const u = await anonClient().rpc('add_unit', { p_name: `x${suffix()}`, p_lang: 'nl' });
      expect(i.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      expect(u.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  describe('crit. 5: adding and not changing', () => {
    for (const [table, rpc, max] of [
      ['ingredients', 'add_ingredient', 80],
      ['units', 'add_unit', 20],
    ] as const) {
      describe(rpc, () => {
        it('stores the name in the Dutch column for nl, with the rest empty', async () => {
          const name = `nl${suffix()}`;
          track(table, name);
          const res = await a.client.rpc(rpc, { p_name: name, p_lang: 'nl' });
          expect(res.error).toBeNull();
          const rows = await sql<Record<string, unknown>>(`select * from public.${table} where name_nl = ${lit(name)}`);
          expect(rows).toHaveLength(1);
          expect(rows[0].name_fr).toBeNull();
          expect(rows[0].synonyms).toEqual([]);
          expect(rows[0].created_by).toBe(a.id);
        });

        it('stores the name in the French column for fr', async () => {
          const name = `fr${suffix()}`;
          track(table, name);
          expect((await a.client.rpc(rpc, { p_name: name, p_lang: 'fr' })).error).toBeNull();
          const rows = await sql<Record<string, unknown>>(`select * from public.${table} where name_fr = ${lit(name)}`);
          expect(rows).toHaveLength(1);
          expect(rows[0].name_nl).toBeNull();
        });

        it('refuses another language code with 22023', async () => {
          // The retired code is refused too (R-026 crit. 3).
          const res = await a.client.rpc(rpc, { p_name: `xx${suffix()}`, p_lang: RETIRED_LANG });
          expect(res.error?.code).toBe(INVALID_PARAMETER);
        });

        it('makes the item visible to another user at once', async () => {
          const name = `meteen${suffix()}`;
          track(table, name);
          await a.client.rpc(rpc, { p_name: name, p_lang: 'nl' });
          const seen = await b.client.from(table).select('name_nl').eq('name_nl', name);
          expect(seen.data).toHaveLength(1);
        });

        it(`refuses an empty name and a name of ${max + 1} characters (23514), adding nothing`, async () => {
          const s = suffix();
          const before = await sql<{ n: string }>(`select count(*) as n from public.${table}`);
          const empty = await a.client.rpc(rpc, { p_name: '   ', p_lang: 'nl' });
          const long = await a.client.rpc(rpc, { p_name: s + 'x'.repeat(max + 1 - s.length), p_lang: 'nl' });
          expect(empty.error?.code).toBe(CHECK_VIOLATION);
          expect(long.error?.code).toBe(CHECK_VIOLATION);
          const after = await sql<{ n: string }>(`select count(*) as n from public.${table}`);
          expect(after[0].n).toBe(before[0].n);
        });

        it('returns the existing id with created = false for a known key', async () => {
          const name = `bekend${suffix()}`;
          track(table, name);
          const first = await a.client.rpc(rpc, { p_name: name, p_lang: 'nl' });
          const again = await b.client.rpc(rpc, { p_name: name.toUpperCase(), p_lang: 'nl' });
          expect(again.error).toBeNull();
          const f = (first.data as Array<{ id: string; created: boolean }>)[0];
          const g = (again.data as Array<{ id: string; created: boolean }>)[0];
          expect(f.created).toBe(true);
          expect(g.created).toBe(false);
          expect(g.id).toBe(f.id);
        });
      });

      describe(`${table}: a plain user cannot change or remove`, () => {
        it('update of the names or synonyms changes nothing, on a starting item and an own item', async () => {
          const own = `eigen${suffix()}`;
          track(table, own);
          await a.client.rpc(rpc, { p_name: own, p_lang: 'nl' });
          const startKey = table === 'ingredients' ? 'broccoli' : 'g';
          const targets = await sql<{ id: string }>(
            `select id from public.${table} where name_nl = ${lit(own)} or id = (select ${table === 'ingredients' ? 'ingredient_id' : 'unit_id'} from public.${table === 'ingredients' ? 'ingredient_keys' : 'unit_keys'} where key = ${lit(startKey)})`,
          );
          expect(targets).toHaveLength(2);
          const snapshot = () => sql(`select to_jsonb(t) as j from public.${table} t where id in (${targets.map((t) => lit(t.id)).join(',')}) order by id`);
          const before = await snapshot();
          for (const patch of [{ name_nl: 'gekaapt' }, { name_fr: 'gekaapt-fr' }, { synonyms: ['x'] }]) {
            for (const t of targets) await a.client.from(table).update(patch).eq('id', t.id).select();
          }
          expect(await snapshot()).toEqual(before);
        });

        it('delete removes nothing', async () => {
          const own = `wis${suffix()}`;
          track(table, own);
          await a.client.rpc(rpc, { p_name: own, p_lang: 'nl' });
          await a.client.from(table).delete().eq('name_nl', own).select();
          const left = await sql(`select 1 from public.${table} where name_nl = ${lit(own)}`);
          expect(left).toHaveLength(1);
          const del = await a.client.from(table).delete().neq('name_nl', '').select();
          expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
          const n = await sql<{ n: string }>(`select count(*) as n from public.${table}`);
          expect(Number(n[0].n)).toBeGreaterThan(10);
        });

        it('a direct insert with synonyms, created_by or id is refused (column right)', async () => {
          const s = suffix();
          for (const extra of [{ synonyms: ['x' + s] }, { created_by: b.id }, { id: '00000000-0000-4000-8000-000000000001' }]) {
            const res = await a.client.from(table).insert({ name_nl: `col${s}`, ...extra });
            expect(res.error?.code, JSON.stringify(extra)).toBe(INSUFFICIENT_PRIVILEGE);
          }
          expect(await sql(`select 1 from public.${table} where name_nl = ${lit('col' + s)}`)).toHaveLength(0);
        });
      });
    }

    it.each(['ingredient_keys', 'unit_keys'])('refuses insert, update and delete on %s', async (table) => {
      const col = table === 'ingredient_keys' ? 'ingredient_id' : 'unit_id';
      const src = table === 'ingredient_keys' ? 'ingredients' : 'units';
      const any = await sql<{ id: string }>(`select id from public.${src} limit 1`);
      const ins = await a.client.from(table).insert({ key: `sleutel${suffix()}`, [col]: any[0].id });
      expect(ins.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      const before = await sql<{ n: string }>(`select count(*) as n from public.${table}`);
      const upd = await a.client.from(table).update({ key: 'gekaapt' }).neq('key', '').select();
      expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
      const del = await a.client.from(table).delete().neq('key', '').select();
      expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
      const after = await sql<{ n: string }>(`select count(*) as n from public.${table}`);
      expect(after[0].n).toBe(before[0].n);
    });
  });
});
