import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { assertSupabaseUp, createTestUser, deleteTestUser, anonClient, type TestUser } from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';

// T-019 / R-018 crit. 6: linking existing recipe lines to the catalogue. Nothing may be lost.
const INSUFFICIENT_PRIVILEGE = '42501';
const FOREIGN_KEY = '23503';
const CHECK_VIOLATION = '23514';

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

interface Line {
  name: string;
  quantity?: number;
  unit?: string;
  ingredient_id?: string;
  unit_id?: string;
}

describe('link_recipes_to_catalog (R-018 crit. 6)', () => {
  let a: TestUser;
  const ids: string[] = [];
  let broccoli: string;
  let aardappel: string;
  let tomaat: string;
  let g: string;
  let stuk: string;

  const keyId = async (table: 'ingredient_keys' | 'unit_keys', col: string, key: string) =>
    (await sql<{ id: string }>(`select ${col} as id from public.${table} where key = ${lit(key)}`))[0].id;

  async function insertPlain(title: string, ingredients: unknown): Promise<string> {
    const rows = await sql<{ id: string }>(
      `insert into public.recipes (title, author_id, ingredients, steps, prep_minutes, total_minutes, servings)
       values (${lit(title)}, ${lit(a.id)}, ${lit(JSON.stringify(ingredients))}::jsonb, '["Roer."]'::jsonb, 5, 10, 2) returning id`,
    );
    ids.push(rows[0].id);
    return rows[0].id;
  }

  const readLines = async (id: string) =>
    (await sql<{ ingredients: Line[] }>(`select ingredients from public.recipes where id = ${lit(id)}`))[0].ingredients;

  const rest = async (id: string) =>
    (await sql<{ j: unknown; bytes: string }>(
      `select to_jsonb(r) - 'ingredients' as j, public.recipe_text_bytes(r) as bytes from public.recipes r where id = ${lit(id)}`,
    ))[0];

  beforeAll(async () => {
    await assertSupabaseUp();
    a = await createTestUser('catlink');
    broccoli = await keyId('ingredient_keys', 'ingredient_id', 'broccoli');
    aardappel = await keyId('ingredient_keys', 'ingredient_id', 'aardappel');
    tomaat = await keyId('ingredient_keys', 'ingredient_id', 'tomaat');
    g = await keyId('unit_keys', 'unit_id', 'g');
    stuk = await keyId('unit_keys', 'unit_id', 'stuk');
  });

  afterAll(async () => {
    if (ids.length) await sql(`delete from public.recipes where id in (${ids.map(lit).join(',')})`).catch(() => undefined);
    if (a) await deleteTestUser(a);
  });

  it('links matching lines, leaves the rest as free text, and changes nothing else', async () => {
    const original: Line[] = [
      { name: 'Brocolli', quantity: 200, unit: 'G' },
      { name: '  aardappel ' },
      { name: 'tempeh-xyz', quantity: 2, unit: 'handvol' },
      { name: 'Tomato', quantity: 1, unit: 'stuk' },
    ];
    const id = await insertPlain('Koppel mij', original);
    const beforeRest = await rest(id);
    const countBefore = await sql<{ n: string }>(`select count(*) as n from public.recipes`);

    await sql(`select public.link_recipes_to_catalog()`);

    const lines = await readLines(id);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({ ingredient_id: broccoli, unit_id: g });
    expect(lines[1].ingredient_id).toBe(aardappel);
    expect(lines[1].unit_id).toBeUndefined();
    expect(lines[2].ingredient_id).toBeUndefined();
    expect(lines[2].unit_id).toBeUndefined();
    expect(lines[3]).toMatchObject({ ingredient_id: tomaat, unit_id: stuk });

    // The text stays as stored, in the same order. recipes_normalize already trims names on insert,
    // so the expected text is the trimmed input; linking itself must not change it further.
    lines.forEach((line, i) => {
      expect(line.name).toBe(original[i].name.trim());
      expect(line.quantity).toBe(original[i].quantity);
      expect(line.unit).toBe(original[i].unit);
    });

    const afterRest = await rest(id);
    expect(afterRest.j).toEqual(beforeRest.j);
    expect(afterRest.bytes).toBe(beforeRest.bytes);
    const countAfter = await sql<{ n: string }>(`select count(*) as n from public.recipes`);
    expect(countAfter[0].n).toBe(countBefore[0].n);
  });

  it('is idempotent: a second call changes nothing', async () => {
    const id = await insertPlain('Twee keer', [{ name: 'Broccoli', quantity: 1, unit: 'kg' }]);
    await sql(`select public.link_recipes_to_catalog()`);
    const first = await sql(`select to_jsonb(r) as j from public.recipes r where id = ${lit(id)}`);
    await sql(`select public.link_recipes_to_catalog()`);
    const second = await sql(`select to_jsonb(r) as j from public.recipes r where id = ${lit(id)}`);
    expect(second).toEqual(first);
  });

  it('skips a row that fails a check (old sample row) and leaves it untouched', async () => {
    // Build the old row the way it came to be: a "not valid" check lets existing rows break it.
    const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
    await client.connect();
    try {
      await client.query('begin');
      await client.query('alter table public.recipes drop constraint recipes_prep_required');
      const ins = await client.query(
        `insert into public.recipes (title, author_id, ingredients, steps, total_minutes, servings)
         values ('Oude proefrij', $1, '[{"name":"Broccoli"}]'::jsonb, '["x"]'::jsonb, 10, 2) returning id`,
        [a.id],
      );
      await client.query('alter table public.recipes add constraint recipes_prep_required check (prep_minutes is not null) not valid');
      const id = ins.rows[0].id as string;
      const before = await client.query('select to_jsonb(r) as j from public.recipes r where id = $1', [id]);
      await client.query('select public.link_recipes_to_catalog()'); // must not raise
      const after = await client.query('select to_jsonb(r) as j from public.recipes r where id = $1', [id]);
      expect(after.rows[0].j).toEqual(before.rows[0].j);
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.end();
    }
  });

  it('is not executable for anon or authenticated', async () => {
    const anon = await anonClient().rpc('link_recipes_to_catalog');
    expect(anon.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    const user = await a.client.rpc('link_recipes_to_catalog');
    expect(user.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  describe('lines in the recipe table', () => {
    const save = (ingredients: unknown) =>
      a.client.from('recipes').insert({
        title: `Ref ${Math.random()}`,
        ingredients,
        steps: ['Roer.'],
        prep_minutes: 1,
        total_minutes: 2,
        servings: 1,
      }).select('id,ingredients');

    it('stores a valid ingredient_id and unit_id next to the text', async () => {
      const res = await save([{ name: 'Broccoli', quantity: 1, unit: 'g', ingredient_id: broccoli, unit_id: g }]);
      expect(res.error).toBeNull();
      if (res.data) ids.push(res.data[0].id);
      expect(res.data?.[0].ingredients[0]).toEqual({ name: 'Broccoli', quantity: 1, unit: 'g', ingredient_id: broccoli, unit_id: g });
    });

    it('refuses an id that does not exist (23503)', async () => {
      const res = await save([{ name: 'Spook', ingredient_id: '00000000-0000-4000-8000-0000000000aa' }]);
      expect(res.error?.code).toBe(FOREIGN_KEY);
      const res2 = await save([{ name: 'Spook', unit: 'g', unit_id: '00000000-0000-4000-8000-0000000000aa' }]);
      expect(res2.error?.code).toBe(FOREIGN_KEY);
    });

    it('refuses an id that is not a uuid (23514) and keeps refusing unknown keys', async () => {
      expect((await save([{ name: 'X', ingredient_id: 'geen-uuid' }])).error?.code).toBe(CHECK_VIOLATION);
      expect((await save([{ name: 'X', extra: 1 }])).error?.code).toBe(CHECK_VIOLATION);
    });

    it('still demands the name, also for a linked line', async () => {
      expect((await save([{ ingredient_id: broccoli }])).error?.code).toBe(CHECK_VIOLATION);
    });

    it('does not count the ids in the text size', async () => {
      const plain = await save([{ name: 'Broccoli', unit: 'g' }]);
      const linked = await save([{ name: 'Broccoli', unit: 'g', ingredient_id: broccoli, unit_id: g }]);
      for (const r of [plain, linked]) if (r.data) ids.push(r.data[0].id);
      const bytes = async (id: string) => (await sql<{ b: string }>(`select public.recipe_text_bytes(r) as b from public.recipes r where id = ${lit(id)}`))[0].b;
      const [p, l] = [await bytes(plain.data![0].id), await bytes(linked.data![0].id)];
      // Titles differ in length by nothing meaningful: compare the ingredient part only.
      const pt = (await sql<{ t: string }>(`select octet_length(title) as t from public.recipes where id = ${lit(plain.data![0].id)}`))[0].t;
      const lt = (await sql<{ t: string }>(`select octet_length(title) as t from public.recipes where id = ${lit(linked.data![0].id)}`))[0].t;
      expect(Number(p) - Number(pt)).toBe(Number(l) - Number(lt));
    });
  });
});
