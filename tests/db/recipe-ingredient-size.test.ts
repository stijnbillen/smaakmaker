import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertSupabaseUp, createTestUser, deleteTestUser, type TestUser } from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';

// T-021 / R-020 against the local Supabase: size of an ingredient line, references that survive a rename.
const CHECK_VIOLATION = '23514';
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

describe('ingredient line size and references (R-020)', () => {
  let a: TestUser;
  const ids: string[] = [];
  let aardappel: string;
  const testItems: string[] = [];

  async function insert(title: string, ingredients: unknown): Promise<string> {
    const rows = await sql<{ id: string }>(
      `insert into public.recipes (title, author_id, ingredients, steps, prep_minutes, total_minutes, servings)
       values (${lit(title)}, ${lit(a.id)}, ${lit(JSON.stringify(ingredients))}::jsonb, '["Roer."]'::jsonb, 5, 10, 2) returning id`,
    );
    ids.push(rows[0].id);
    return rows[0].id;
  }

  const codeOf = async (ingredients: unknown): Promise<string | undefined> => {
    try {
      await insert(`Maat ${Date.now()}`, ingredients);
      return undefined;
    } catch (e) {
      return (e as { code?: string }).code;
    }
  };

  const lines = async (id: string) =>
    (await sql<{ ingredients: Array<Record<string, unknown>> }>(`select ingredients from public.recipes where id = ${lit(id)}`))[0].ingredients;

  const bytes = async (id: string) =>
    Number((await sql<{ b: string }>(`select public.recipe_text_bytes(r) as b from public.recipes r where id = ${lit(id)}`))[0].b);

  beforeAll(async () => {
    await assertSupabaseUp();
    a = await createTestUser('ingsize');
    aardappel = (await sql<{ id: string }>(`select ingredient_id as id from public.ingredient_keys where key = 'aardappel'`))[0].id;
  });

  afterAll(async () => {
    if (ids.length) await sql(`delete from public.recipes where id in (${ids.map(lit).join(',')})`).catch(() => undefined);
    if (testItems.length) await sql(`delete from public.ingredients where id in (${testItems.map(lit).join(',')})`).catch(() => undefined);
    if (a) await deleteTestUser(a);
  });

  it.each(['small', 'medium', 'large'])('accepts size %s (crit. 7)', async (size) => {
    expect(await codeOf([{ name: 'aardappel', quantity: 2, size }])).toBeUndefined();
  });

  it.each([['huge'], [1], [true]])('refuses size %j with 23514 (crit. 7)', async (size) => {
    expect(await codeOf([{ name: 'aardappel', size }])).toBe(CHECK_VIOLATION);
  });

  it('never stores an empty size: it is refused or left out (crit. 7; brief and plan differ for "")', async () => {
    for (const size of ['', null]) {
      let id: string | undefined;
      let code: string | undefined;
      try {
        id = await insert(`Leeg formaat ${Date.now()}`, [{ name: 'aardappel', size }]);
      } catch (e) {
        code = (e as { code?: string }).code;
      }
      if (id) expect(await lines(id)).toEqual([{ name: 'aardappel' }]);
      else expect(code).toBe(CHECK_VIOLATION);
    }
  });

  it('a line with size large and the item aardappel points to the same item as one without size (crit. 7)', async () => {
    const id = await insert(`Zelfde item ${Date.now()}`, [
      { name: 'aardappel', size: 'large', ingredient_id: aardappel },
      { name: 'aardappel', ingredient_id: aardappel },
    ]);
    const stored = await lines(id);
    expect(stored[0].ingredient_id).toBe(stored[1].ingredient_id);
    expect(stored[0].size).toBe('large');
    expect(stored[1]).not.toHaveProperty('size');
  });

  it('a line without ingredient_id/unit_id stays valid, as before this task (crit. 5)', async () => {
    expect(await codeOf([{ name: 'tempeh', quantity: 1, unit: 'handvol' }])).toBeUndefined();
  });

  it('recipe_text_bytes grows by exactly the UTF-8 length of the size code (crit. 8)', async () => {
    // The title counts in the text bytes too: every title has the same length ("Bytes " + 1 letter + timestamp).
    const stamp = Date.now();
    const plain = await bytes(await insert(`Bytes p ${stamp}`, [{ name: 'aardappel', quantity: 1, unit: 'g' }]));
    for (const [size, extra, letter] of [['small', 5, 's'], ['medium', 6, 'm'], ['large', 5, 'l']] as const) {
      const withSize = await bytes(await insert(`Bytes ${letter} ${stamp}`, [{ name: 'aardappel', quantity: 1, unit: 'g', size }]));
      expect(withSize - plain).toBe(extra);
    }
  });

  it('a rename by an admin shows through the reference and leaves the recipe row untouched (crit. 9)', async () => {
    const item = (
      await sql<{ id: string }>(`insert into public.ingredients (name_nl) values (${lit(`testitem-${Date.now()}`)}) returning id`)
    )[0].id;
    testItems.push(item);
    const id = await insert(`Hernoem ${Date.now()}`, [{ name: 'testitem', quantity: 1, ingredient_id: item }]);
    const rowOf = async () =>
      (await sql<{ j: unknown }>(`select to_jsonb(r) as j from public.recipes r where id = ${lit(id)}`))[0].j;
    const before = await rowOf();

    const newName = `hernoemd-${Date.now()}`;
    await sql(`update public.ingredients set name_nl = ${lit(newName)}, name_fr = 'renommé' where id = ${lit(item)}`);

    const joined = await sql<{ name_nl: string; name_fr: string }>(
      `select i.name_nl, i.name_fr from public.recipes r
       cross join lateral jsonb_array_elements(r.ingredients) l
       join public.ingredients i on i.id = (l->>'ingredient_id')::uuid where r.id = ${lit(id)}`,
    );
    expect(joined[0]).toEqual({ name_nl: newName, name_fr: 'renommé' });
    expect(await rowOf()).toEqual(before);
  });

  it('deleting a recipe with linked lines leaves the items (crit. 9)', async () => {
    const count = async () => Number((await sql<{ c: string }>(`select count(*) as c from public.ingredients`))[0].c);
    const id = await insert(`Verwijder ${Date.now()}`, [{ name: 'aardappel', size: 'small', ingredient_id: aardappel }]);
    const before = await count();
    await sql(`delete from public.recipes where id = ${lit(id)}`);
    expect(await count()).toBe(before);
  });

  it('add_ingredient refuses an empty name and a name of 81 characters with 23514 (crit. 11, regression)', async () => {
    for (const name of ['', 'a'.repeat(81)]) {
      let code: string | undefined;
      try {
        await sql(`select * from public.add_ingredient(${lit(name)}, 'nl')`);
      } catch (e) {
        code = (e as { code?: string }).code;
      }
      expect(code).toBe(CHECK_VIOLATION);
    }
  });
});
