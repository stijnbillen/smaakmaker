import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertSupabaseUp, createTestUser, deleteTestUser, makeAdmin, adminClient, type TestUser } from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';

// T-032 / R-033 against the local Supabase: kind (volume / weight / none) and factor of a unit.
// Database values are English (`volume`, `weight`, `none`); the user-facing words live in nl.json / fr.json.
// Test units use invented names ("qzvm..."), at most 20 characters, and are removed afterwards.
const CHECK_VIOLATION = '23514';
const INSUFFICIENT_PRIVILEGE = '42501';
const INVALID_PARAMETER = '22023';
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

interface UnitRow {
  id: string;
  measure: string;
  factor: string | null;
}

describe('unit measure and factor (R-033)', () => {
  let boss: TestUser;
  let plain: TestUser;
  const created: string[] = [];
  let n = 0;
  const name = () => `qzvm${Date.now().toString(36)}${n++}`.slice(0, 20);

  /** Direct insert as the superuser connection; returns the error code or the new id. */
  async function insertUnit(measure: string, factor: string | null): Promise<{ code?: string; id?: string }> {
    try {
      const rows = await sql<{ id: string }>(
        `insert into public.units (name_nl, measure, factor) values (${lit(name())}, ${lit(measure)}, ${factor === null ? 'null' : factor}) returning id`,
      );
      created.push(rows[0].id);
      return { id: rows[0].id };
    } catch (e) {
      return { code: (e as { code?: string }).code };
    }
  }

  const read = async (id: string): Promise<UnitRow> =>
    (await sql<UnitRow>(`select id, measure, factor::text as factor from public.units where id = ${lit(id)}`))[0];

  const unitByKey = async (key: string): Promise<UnitRow | undefined> =>
    (
      await sql<UnitRow>(
        `select u.id, u.measure, u.factor::text as factor from public.unit_keys k join public.units u on u.id = k.unit_id where k.key = ${lit(key)}`,
      )
    )[0];

  const num = (v: string | null) => (v === null ? null : Number(v));

  beforeAll(async () => {
    await assertSupabaseUp();
    boss = await createTestUser('measboss');
    await makeAdmin(boss.id);
    plain = await createTestUser('measplain');
  });

  afterAll(async () => {
    for (const id of created) await sql(`delete from public.units where id = ${lit(id)}`).catch(() => undefined);
    for (const u of [boss, plain]) if (u) await deleteTestUser(u);
  });

  // crit. 1
  describe('check constraint (crit. 1)', () => {
    it.each([
      ['none', '5'],
      ['volume', null],
      ['weight', '0'],
      ['volume', '-1'],
      ['volume', '100000.001'],
      ['volume', '1.2345'],
      ['cup', '5'],
      ['cup', null],
    ])('refuses %s + %s with 23514', async (measure, factor) => {
      expect((await insertUnit(measure, factor)).code).toBe(CHECK_VIOLATION);
    });

    it('accepts volume + 100000, weight + 0.001 and none + null', async () => {
      expect((await insertUnit('volume', '100000')).code).toBeUndefined();
      expect((await insertUnit('weight', '0.001')).code).toBeUndefined();
      expect((await insertUnit('none', null)).code).toBeUndefined();
    });

    it('does not silently round 1.2345 to 1.235: nothing is stored', async () => {
      const nm = name();
      await sql(`insert into public.units (name_nl, measure, factor) values (${lit(nm)}, 'volume', 1.2345)`).catch(() => undefined);
      expect(await sql(`select 1 from public.units where name_nl = ${lit(nm)}`)).toHaveLength(0);
    });

    it('a plain update to an invalid combination is refused too (check holds for update)', async () => {
      const ok = await insertUnit('volume', '10');
      await expect(sql(`update public.units set factor = 1.2345 where id = ${lit(ok.id!)}`)).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(sql(`update public.units set measure = 'none' where id = ${lit(ok.id!)}`)).rejects.toMatchObject({ code: CHECK_VIOLATION });
      expect(num((await read(ok.id!)).factor)).toBe(10);
    });

    it('add_unit(name, lang, measure, factor) as a user: valid is stored, invalid gives 23514 and stores nothing', async () => {
      const good = name();
      const res = await plain.client.rpc('add_unit', { p_name: good, p_lang: 'nl', p_measure: 'volume', p_factor: 250 });
      expect(res.error).toBeNull();
      const row = (res.data as Array<{ id: string; created: boolean }>)[0];
      created.push(row.id);
      expect(row.created).toBe(true);
      const stored = await read(row.id);
      expect(stored.measure).toBe('volume');
      expect(num(stored.factor)).toBe(250);

      const bad = name();
      for (const [measure, factor] of [
        ['none', 5],
        ['volume', null],
        ['weight', 0],
        ['volume', 1.2345],
        ['cup', 3],
      ] as const) {
        const r = await plain.client.rpc('add_unit', { p_name: bad, p_lang: 'nl', p_measure: measure, p_factor: factor });
        expect(r.error?.code, `${measure}/${factor}`).toBe(CHECK_VIOLATION);
      }
      expect(await sql(`select 1 from public.units where name_nl = ${lit(bad)}`)).toHaveLength(0);
    });

    it('the old add_unit(name, lang) still works and makes a unit of kind none', async () => {
      const res = await plain.client.rpc('add_unit', { p_name: name(), p_lang: 'nl' });
      expect(res.error).toBeNull();
      const row = (res.data as Array<{ id: string }>)[0];
      created.push(row.id);
      expect(await read(row.id)).toMatchObject({ measure: 'none', factor: null });
    });

    it('add_unit on an existing key returns the existing unit and leaves its kind unchanged', async () => {
      const first = await insertUnit('volume', '7');
      const nm = (await sql<{ name_nl: string }>(`select name_nl from public.units where id = ${lit(first.id!)}`))[0].name_nl;
      const res = await plain.client.rpc('add_unit', { p_name: nm, p_lang: 'nl', p_measure: 'weight', p_factor: 99 });
      expect(res.error).toBeNull();
      const row = (res.data as Array<{ id: string; created: boolean }>)[0];
      expect(row).toMatchObject({ id: first.id, created: false });
      expect(await read(first.id!)).toMatchObject({ measure: 'volume' });
      expect(num((await read(first.id!)).factor)).toBe(7);
    });
  });

  // crit. 2
  describe('starting list (crit. 2)', () => {
    const expected: Array<[string, string, number]> = [
      ['g', 'weight', 1],
      ['kg', 'weight', 1000],
      ['ml', 'volume', 1],
      ['cl', 'volume', 10],
      ['dl', 'volume', 100],
      ['l', 'volume', 1000],
      ['el', 'volume', 15],
      ['tl', 'volume', 5],
    ];
    it.each(expected)('%s is %s with factor %d', async (key, measure, factor) => {
      const u = await unitByKey(key);
      expect(u, key).toBeDefined();
      expect(u!.measure).toBe(measure);
      expect(num(u!.factor)).toBe(factor);
    });

    it('the other 22 units of the starting list are none with a null factor, including mg and koffielepel', async () => {
      const others = [
        'mg', 'koffielepel', 'stuk', 'snuf', 'teentje', 'takje', 'blik', 'bosje', 'pot', 'pak', 'zakje', 'plak',
        'blaadje', 'kop', 'scheut', 'mespunt', 'stengel', 'doos', 'fles', 'bakje', 'rol', 'bol',
      ];
      expect(others).toHaveLength(22);
      for (const key of others) {
        const u = await unitByKey(key);
        expect(u, key).toBeDefined();
        expect({ key, measure: u!.measure, factor: u!.factor }).toEqual({ key, measure: 'none', factor: null });
      }
    });
  });

  // crit. 3
  describe('existing data (crit. 3)', () => {
    it('a unit added by a user before the feature ("kopje" pattern, the old add_unit) is none/null and its recipe line is untouched', async () => {
      const rows = await sql<{ id: string }>(
        `select (public.add_unit(${lit(name())}, 'nl')).id as id`,
      ).catch(async () => [] as Array<{ id: string }>);
      // add_unit is security invoker; as superuser it works too. Fall back to a plain insert when it does not.
      const id = rows[0]?.id ?? (await insertUnit('none', null)).id!;
      if (rows[0]) created.push(id);
      const lines = [
        { name: 'water', quantity: 1, unit: 'kopje', unit_id: id },
        { name: 'zout', quantity: 2, unit: 'vrije tekst' },
      ];
      const r = await sql<{ id: string }>(
        `insert into public.recipes (title, author_id, ingredients, steps, prep_minutes, total_minutes, servings)
         values ('meas migratie', ${lit(boss.id)}, ${lit(JSON.stringify(lines))}::jsonb, '["Roer."]'::jsonb, 5, 10, 2) returning id`,
      );
      try {
        expect(await read(id)).toMatchObject({ measure: 'none', factor: null });
        const stored = await sql<{ ingredients: unknown }>(`select ingredients from public.recipes where id = ${lit(r[0].id)}`);
        expect(stored[0].ingredients).toEqual(lines);
      } finally {
        await sql(`delete from public.recipes where id = ${lit(r[0].id)}`);
      }
    });

    it('the migration adds the columns with default none, and never touches the recipes table', () => {
      const dir = 'supabase/migrations';
      const file = readdirSync(dir).find((f) => /unit_measure/.test(f));
      expect(file, 'migration file with "unit_measure" in its name').toBeDefined();
      const text = readFileSync(`${dir}/${file}`, 'utf8').toLowerCase();
      expect(text).toMatch(/measure\s+text\s+not\s+null\s+default\s+'none'/);
      expect(text).not.toMatch(/update\s+public\.recipes/);
      expect(text).not.toMatch(/alter\s+table\s+public\.recipes/);
    });
  });

  // crit. 9
  describe('administration (crit. 9)', () => {
    const upd = (id: string, measure: string | null, factor: number | null, c = boss.client) =>
      c.rpc('admin_update_catalog', {
        p_kind: 'unit',
        p_id: id,
        p_name_nl: null,
        p_name_fr: null,
        p_synonyms: [],
        p_measure: measure,
        p_factor: factor,
      });

    /** admin_update_catalog needs a name; reads the current one so the call only changes kind and factor. */
    async function updWithName(id: string, measure: string | null, factor: number | null, c = boss.client) {
      const nm = (await sql<{ name_nl: string }>(`select name_nl from public.units where id = ${lit(id)}`))[0].name_nl;
      return c.rpc('admin_update_catalog', {
        p_kind: 'unit',
        p_id: id,
        p_name_nl: nm,
        p_name_fr: null,
        p_synonyms: [],
        p_measure: measure,
        p_factor: factor,
      });
    }

    it('an administrator sets kind and factor; invalid combinations give 23514 and change nothing', async () => {
      const u = (await insertUnit('none', null)).id!;
      expect((await updWithName(u, 'volume', 250)).error).toBeNull();
      expect(await read(u)).toMatchObject({ measure: 'volume' });
      expect(num((await read(u)).factor)).toBe(250);

      for (const [m, f] of [
        ['none', 5],
        ['volume', null],
        ['weight', 0],
        ['volume', -1],
        ['volume', 100000.001],
        ['volume', 1.2345],
        ['cup', 3],
      ] as const) {
        const r = await updWithName(u, m, f);
        expect(r.error?.code, `${m}/${f}`).toBe(CHECK_VIOLATION);
      }
      expect(num((await read(u)).factor)).toBe(250);
      expect((await read(u)).measure).toBe('volume');
    });

    it('an administrator can set a kind back to none with a null factor', async () => {
      const u = (await insertUnit('weight', '3')).id!;
      expect((await updWithName(u, 'none', null)).error).toBeNull();
      expect(await read(u)).toMatchObject({ measure: 'none', factor: null });
    });

    it('p_measure null means "leave the kind alone"', async () => {
      const u = (await insertUnit('volume', '40')).id!;
      expect((await updWithName(u, null, null)).error).toBeNull();
      expect(await read(u)).toMatchObject({ measure: 'volume' });
      expect(num((await read(u)).factor)).toBe(40);
    });

    it('a kind for an ingredient is refused with 22023', async () => {
      const ing = await sql<{ id: string }>(`select ingredient_id as id from public.ingredient_keys where key = 'broccoli'`);
      const r = await boss.client.rpc('admin_update_catalog', {
        p_kind: 'ingredient',
        p_id: ing[0].id,
        p_name_nl: 'broccoli',
        p_name_fr: null,
        p_synonyms: [],
        p_measure: 'volume',
        p_factor: 5,
      });
      expect(r.error?.code).toBe(INVALID_PARAMETER);
    });

    it('a plain user gets 42501 from admin_update_catalog and nothing changes', async () => {
      const u = (await insertUnit('volume', '12')).id!;
      const r = await updWithName(u, 'weight', 2, plain.client);
      expect(r.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await read(u)).toMatchObject({ measure: 'volume' });
      expect(num((await read(u)).factor)).toBe(12);
    });

    it('a direct update on units with a plain user session changes nothing', async () => {
      const u = (await insertUnit('volume', '12')).id!;
      const r = await plain.client.from('units').update({ measure: 'weight', factor: 2 }).eq('id', u).select();
      expect(r.error !== null || (r.data ?? []).length === 0).toBe(true);
      expect(await read(u)).toMatchObject({ measure: 'volume' });
      expect(num((await read(u)).factor)).toBe(12);
      void upd;
    });

    it('admin_list_catalog returns measure and factor for units and null for ingredients', async () => {
      const u = (await insertUnit('weight', '0.5')).id!;
      const nm = (await sql<{ name_nl: string }>(`select name_nl from public.units where id = ${lit(u)}`))[0].name_nl;
      const list = await boss.client.rpc('admin_list_catalog', { p_kind: 'unit', p_term: nm, p_lang: 'nl' });
      expect(list.error).toBeNull();
      const hit = (list.data as Array<{ id: string; measure: string | null; factor: number | string | null }>).find((r) => r.id === u);
      expect(hit?.measure).toBe('weight');
      expect(Number(hit?.factor)).toBe(0.5);

      const ing = await boss.client.rpc('admin_list_catalog', { p_kind: 'ingredient', p_term: 'broccoli', p_lang: 'nl' });
      expect(ing.error).toBeNull();
      const row = (ing.data as Array<{ measure: unknown; factor: unknown }>)[0];
      expect(row.measure ?? null).toBeNull();
      expect(row.factor ?? null).toBeNull();
    });

    it('a plain user cannot read the admin list (42501)', async () => {
      const r = await plain.client.rpc('admin_list_catalog', { p_kind: 'unit', p_term: 'g', p_lang: 'nl' });
      expect(r.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it('the service client can read the new columns through the API (schema cache reloaded)', async () => {
    const r = await adminClient().from('units').select('id,measure,factor').limit(1);
    expect(r.error).toBeNull();
  });
});
