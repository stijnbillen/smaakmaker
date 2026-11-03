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

// T-009 / R-008 against the local Supabase: the database validates, normalises and de-duplicates the equipment.
const CHECK_VIOLATION = '23514';
const INSUFFICIENT_PRIVILEGE = '42501';

// The catalogue is shared and persists between runs, so every test uses names with a unique suffix.
const suffix = () => Math.random().toString(36).slice(2, 8);

describe('recipe equipment (R-008)', () => {
  let a: TestUser;
  let b: TestUser;
  let admin: TestUser;

  beforeAll(async () => {
    await assertSupabaseUp(); // fails loudly, never skips
    a = await createTestUser('rea');
    b = await createTestUser('reb');
    admin = await createTestUser('readm');
    await makeAdmin(admin.id);
  });

  afterAll(async () => {
    for (const u of [a, b, admin]) if (u) await deleteTestUser(u);
  });

  const insert = (client: TestUser['client'], equipment: unknown) =>
    client.from('recipes').insert(validRecipe({ equipment })).select('id,equipment');

  describe('crit. 1: zero or more items, 1-30 characters', () => {
    it('accepts an insert without equipment and stores []', async () => {
      const res = await a.client.from('recipes').insert(validRecipe()).select('equipment').single();
      expect(res.error).toBeNull();
      expect(res.data?.equipment).toEqual([]);
    });

    it('accepts names of 1 and of 30 characters', async () => {
      const one = `z${suffix()}`.slice(0, 1);
      const thirty = `${suffix()}${'x'.repeat(30)}`.slice(0, 30);
      const res = await insert(a.client, [one, thirty]);
      expect(res.error).toBeNull();
      expect(res.data?.[0].equipment).toHaveLength(2);
    });

    it.each([
      ['an empty name', ''],
      ['a name of only spaces', '   '],
      ['a name of 31 characters', 'y'.repeat(31)],
    ])('refuses %s with a check violation', async (_n, name) => {
      const res = await insert(a.client, [name]);
      expect(res.error?.code).toBe(CHECK_VIOLATION);
    });

    it('accepts 20 items and refuses 21', async () => {
      const s = suffix();
      const names = (n: number) => Array.from({ length: n }, (_, i) => `Item${s}${i}`);
      expect((await insert(a.client, names(20))).error).toBeNull();
      expect((await insert(a.client, names(21))).error?.code).toBe(CHECK_VIOLATION);
    });

    it('trims: "  Oven  " is stored as "Oven"', async () => {
      const name = `Oven${suffix()}`;
      const res = await insert(a.client, [`  ${name}  `]);
      expect(res.error).toBeNull();
      expect(res.data?.[0].equipment).toEqual([name]);
    });

    it('turns the same item twice into one, also when only the case differs', async () => {
      const name = `Oven${suffix()}`;
      const res = await insert(a.client, [name, name.toLowerCase(), name]);
      expect(res.error).toBeNull();
      expect(res.data?.[0].equipment).toEqual([name]);
    });

    it('checks the same on update by the author', async () => {
      const row = await insertRecipe(a.client);
      const upd = (equipment: unknown) =>
        a.client.from('recipes').update({ equipment }).eq('id', row.id).select('equipment');
      expect((await upd(['y'.repeat(31)])).error?.code).toBe(CHECK_VIOLATION);
      expect((await upd([''])).error?.code).toBe(CHECK_VIOLATION);
      const name = `Wok${suffix()}`;
      const ok = await upd([`  ${name} `]);
      expect(ok.error).toBeNull();
      expect(ok.data).toEqual([{ equipment: [name] }]);
    });
  });

  describe('rights: only the author edits the equipment', () => {
    it('lets the author change it (column right)', async () => {
      const row = await insertRecipe(a.client, { equipment: [] });
      const name = `Mixer${suffix()}`;
      const res = await a.client.from('recipes').update({ equipment: [name] }).eq('id', row.id).select('equipment');
      expect(res.error).toBeNull();
      expect(res.data).toEqual([{ equipment: [name] }]);
    });

    it.each([
      ['another user', () => b],
      ['an administrator', () => admin],
    ])('gives %s 0 rows and leaves the value unchanged', async (_n, who) => {
      const name = `Grill${suffix()}`;
      const row = await insertRecipe(a.client, { equipment: [name] });
      const res = await who().client.from('recipes').update({ equipment: [] }).eq('id', row.id).select('id');
      expect(res.data ?? []).toHaveLength(0);
      const check = await adminClient().from('recipes').select('equipment').eq('id', row.id).single();
      expect(check.data?.equipment).toEqual([name]);
    });
  });

  describe('the catalogue table equipment is read-only for the client', () => {
    it('is readable for a signed-in user', async () => {
      const name = `Leesbaar${suffix()}`;
      await insertRecipe(a.client, { equipment: [name] });
      const res = await b.client.from('equipment').select('name').eq('name', name);
      expect(res.error).toBeNull();
      expect(res.data).toEqual([{ name }]);
    });

    it('is not readable for anon', async () => {
      const res = await anonClient().from('equipment').select('name');
      expect(res.error !== null || (res.data ?? []).length === 0).toBe(true);
    });

    it('refuses a direct insert, update and delete by authenticated (42501)', async () => {
      const name = `Direct${suffix()}`;
      const ins = await a.client.from('equipment').insert({ name, name_key: name.toLowerCase() });
      expect(ins.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      await insertRecipe(a.client, { equipment: [`Bestaand${suffix()}`] });
      const upd = await a.client.from('equipment').update({ name: 'Gekaapt' }).neq('name', '');
      expect(upd.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      const del = await a.client.from('equipment').delete().neq('name', '');
      expect(del.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  describe('crit. 2: an existing name (case and accent insensitive) reuses the existing item', () => {
    it('fold_key gives one key for "Crème Brûlée", "creme brulee" and "CREME BRULEE"', async () => {
      const rows = await sql<{ a: string; b: string; c: string }>(
        `select public.fold_key('Crème Brûlée') as a, public.fold_key('creme brulee') as b, public.fold_key('CREME BRULEE') as c`,
      );
      expect(rows[0].a).toBe(rows[0].b);
      expect(rows[0].b).toBe(rows[0].c);
    });

    it('a second user saving "airfrýer" gets the stored spelling "Airfryer", and the catalogue has one row', async () => {
      const s = suffix();
      const first = await insert(a.client, [`Airfryer${s}`]);
      expect(first.error).toBeNull();
      const second = await insert(b.client, [`airfrýer${s}`]);
      expect(second.error).toBeNull();
      expect(second.data?.[0].equipment).toEqual([`Airfryer${s}`]);
      const catalogue = await adminClient().from('equipment').select('name').ilike('name', `%fr%er${s}`);
      expect(catalogue.data).toEqual([{ name: `Airfryer${s}` }]);
    });

    it('two concurrent inserts of "Wok" and "wok" give one catalogue row', async () => {
      const s = suffix();
      const [r1, r2] = await Promise.all([insert(a.client, [`Wok${s}`]), insert(b.client, [`wok${s}`])]);
      expect(r1.error).toBeNull();
      expect(r2.error).toBeNull();
      const catalogue = await adminClient().from('equipment').select('name').ilike('name', `wok${s}`);
      expect(catalogue.data).toHaveLength(1);
      // Both recipes carry the one canonical spelling.
      expect(r1.data?.[0].equipment).toEqual(r2.data?.[0].equipment);
    });
  });

  describe('equipment_in_use (the choices in the form and the filter)', () => {
    it('lists a name that is in a recipe, for a signed-in user', async () => {
      const name = `Inuse${suffix()}`;
      await insertRecipe(a.client, { equipment: [name] });
      const res = await b.client.rpc('equipment_in_use');
      expect(res.error).toBeNull();
      const names = (res.data as Array<string | { name: string }>).map((r) => (typeof r === 'string' ? r : r.name));
      expect(names).toContain(name);
    });

    it('does not list a name that no recipe uses any more', async () => {
      const name = `Weg${suffix()}`;
      const row = await insertRecipe(a.client, { equipment: [name] });
      await a.client.from('recipes').update({ equipment: [] }).eq('id', row.id);
      const res = await b.client.rpc('equipment_in_use');
      const names = (res.data as Array<string | { name: string }>).map((r) => (typeof r === 'string' ? r : r.name));
      expect(names).not.toContain(name);
    });
  });

  describe('crit. 4: the filter `overlaps` selects recipes with at least one chosen item', () => {
    it('finds recipes with either item and not the others', async () => {
      const s = suffix();
      const ra = await insertRecipe(a.client, { equipment: [`FOven${s}`] });
      const rb = await insertRecipe(a.client, { equipment: [`FWok${s}`] });
      const rc = await insertRecipe(a.client, { equipment: [] });
      const res = await b.client
        .from('recipes')
        .select('id')
        .overlaps('equipment', [`FOven${s}`, `FWok${s}`]);
      const ids = (res.data ?? []).map((r) => r.id);
      expect(ids).toContain(ra.id);
      expect(ids).toContain(rb.id);
      expect(ids).not.toContain(rc.id);
    });
  });
});
