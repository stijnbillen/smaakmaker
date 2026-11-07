import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  anonClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  insertRecipe,
  type TestUser,
} from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';

// T-023 / R-024 (tags and equipment part) against the local Supabase: Dutch canonical name + optional French name.
const INSUFFICIENT_PRIVILEGE = '42501';
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const suffix = () => Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6) || 'abc';

const DISH: Array<[string, string]> = [
  ['dessert', 'dessert'],
  ['soep', 'soupe'],
  ['bijgerecht', 'accompagnement'],
  ['tapas', 'tapas'],
  ['hoofdgerecht', 'plat principal'],
  ['ontbijt', 'petit-déjeuner'],
  ['snack', 'en-cas'],
  ['saus', 'sauce'],
];
const TRAIT: Array<[string, string]> = [
  ['winter', 'hiver'],
  ['zomer', 'été'],
  ['lente', 'printemps'],
  ['herfst', 'automne'],
  ['licht', 'léger'],
  ['vegetarisch', 'végétarien'],
  ['veganistisch', 'végan'],
  ['glutenvrij', 'sans gluten'],
  ['snel', 'rapide'],
];
const EQUIPMENT: Array<[string, string]> = [
  ['oven', 'four'],
  ['kookplaat', 'plaque de cuisson'],
  ['microgolfoven', 'micro-ondes'],
  ['airfryer', 'friteuse à air chaud'],
  ['Thermomix', 'Thermomix'],
  ['staafmixer', 'mixeur plongeant'],
  ['blender', 'blender'],
  ['keukenrobot', 'robot de cuisine'],
  ['slowcooker', 'mijoteuse'],
  ['barbecue', 'barbecue'],
];

describe('bilingual tags and equipment (R-024)', () => {
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    await assertSupabaseUp();
    a = await createTestUser('bda');
    b = await createTestUser('bdb');
  });

  afterAll(async () => {
    for (const u of [a, b]) if (u) await deleteTestUser(u);
  });

  describe('crit. 2: every start tag has a French name', () => {
    it.each([
      ['dish', DISH],
      ['trait', TRAIT],
    ] as const)('group %s has name_fr for each start tag', async (kind, list) => {
      const res = await b.client.from('tags').select('name,name_fr').eq('kind', kind);
      expect(res.error).toBeNull();
      const byName = new Map((res.data ?? []).map((r) => [r.name as string, r.name_fr as string | null]));
      for (const [nl, fr] of list) expect(byName.get(nl), nl).toBe(fr);
    });
  });

  describe('crit. 3: start list of equipment', () => {
    it('has the ten items with both names, marked as seeded', async () => {
      const res = await b.client.from('equipment').select('name,name_fr,seeded').eq('seeded', true);
      expect(res.error).toBeNull();
      const byName = new Map((res.data ?? []).map((r) => [r.name as string, r.name_fr as string | null]));
      for (const [nl, fr] of EQUIPMENT) expect(byName.get(nl), nl).toBe(fr);
    });

    it('equipment_choices() returns them, also when no recipe uses them, and skips unused user items', async () => {
      const unused = `Ongebruikt${suffix()}`;
      try {
        await sql(`insert into public.equipment (name, name_key) values (${lit(unused)}, public.fold_key(${lit(unused)}))`);
        const res = await b.client.rpc('equipment_choices');
        expect(res.error).toBeNull();
        const rows = res.data as Array<{ name: string; name_fr: string | null }>;
        const byName = new Map(rows.map((r) => [r.name, r.name_fr]));
        for (const [nl, fr] of EQUIPMENT) expect(byName.get(nl), nl).toBe(fr);
        expect(byName.has(unused)).toBe(false);
      } finally {
        await sql(`delete from public.equipment where name = ${lit(unused)}`);
      }
    });

    it('equipment_choices() lists a user item once a recipe uses it', async () => {
      const name = `Gebruikt${suffix()}`;
      await insertRecipe(a.client, { equipment: [name] });
      const res = await b.client.rpc('equipment_choices');
      expect((res.data as Array<{ name: string }>).map((r) => r.name)).toContain(name);
    });

    it('equipment_choices() is not executable for anon', async () => {
      const res = await anonClient().rpc('equipment_choices');
      expect(res.error).not.toBeNull();
    });
  });

  describe('crit. 4: user-added names have one name', () => {
    it('a new tag and a new equipment item get name_fr = null', async () => {
      const tag = `Fondue${suffix()}`;
      const gear = `Raclette${suffix()}`;
      const res = await a.client.from('recipes').insert({
        title: `Eigen ${Date.now()}`,
        ingredients: [{ name: 'Kaas' }],
        steps: ['Smelt.'],
        prep_minutes: 5,
        total_minutes: 10,
        servings: 2,
        dish_tags: [tag],
        equipment: [gear],
      });
      expect(res.error).toBeNull();
      const t = await adminClient().from('tags').select('name,name_fr').eq('name', tag);
      expect(t.data).toEqual([{ name: tag, name_fr: null }]);
      const e = await adminClient().from('equipment').select('name,name_fr').eq('name', gear);
      expect(e.data).toEqual([{ name: gear, name_fr: null }]);
    });
  });

  describe('crit. 6: "exists already" compares with both names', () => {
    it("saving dish_tags ['Soupe'] stores ['soep'] and adds no tag row", async () => {
      const res = await a.client
        .from('recipes')
        .insert({
          title: `Soupe ${Date.now()}`,
          ingredients: [{ name: 'Water' }],
          steps: ['Kook.'],
          prep_minutes: 5,
          total_minutes: 10,
          servings: 2,
          dish_tags: ['Soupe'],
        })
        .select('dish_tags');
      expect(res.error).toBeNull();
      expect(res.data?.[0].dish_tags).toEqual(['soep']);
      // Other test files may add tags in parallel, so the count proves nothing; only the French key query counts.
      const rows = await sql(`select 1 from public.tags where kind = 'dish' and name_key = 'soupe'`);
      expect(rows).toHaveLength(0);
    });

    it("saving equipment ['micro-ondes'] stores ['microgolfoven']", async () => {
      const res = await a.client.from('recipes').insert({
        title: `Micro ${Date.now()}`,
        ingredients: [{ name: 'Water' }],
        steps: ['Warm.'],
        prep_minutes: 5,
        total_minutes: 10,
        servings: 2,
        equipment: ['micro-ondes'],
      }).select('equipment');
      expect(res.error).toBeNull();
      expect(res.data?.[0].equipment).toEqual(['microgolfoven']);
      const rows = await sql(`select 1 from public.equipment where name_key = 'micro-ondes'`);
      expect(rows).toHaveLength(0);
    });

    it('a trait tag also resolves through the French name ("Végétarien" gives "vegetarisch")', async () => {
      const res = await a.client.from('recipes').insert({
        title: `Veg ${Date.now()}`,
        ingredients: [{ name: 'Sla' }],
        steps: ['Snij.'],
        prep_minutes: 5,
        total_minutes: 10,
        servings: 2,
        trait_tags: ['Végétarien'],
      }).select('trait_tags');
      expect(res.error).toBeNull();
      expect(res.data?.[0].trait_tags).toEqual(['vegetarisch']);
    });

    it('the database refuses a name whose key is the French key of another item (23505)', async () => {
      await expect(
        sql(`insert into public.equipment (name, name_key) values ('Four', public.fold_key('Four'))`),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  describe('rights: the client cannot write the catalogues', () => {
    it('refuses name_fr updates by authenticated (42501)', async () => {
      const t = await a.client.from('tags').update({ name_fr: 'gekaapt' }).eq('name', 'soep');
      expect(t.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      const e = await a.client.from('equipment').update({ name_fr: 'gekaapt' }).eq('name', 'oven');
      expect(e.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    });

    it('merge_seeded_names() is not executable for authenticated or anon', async () => {
      expect((await a.client.rpc('merge_seeded_names')).error).not.toBeNull();
      expect((await anonClient().rpc('merge_seeded_names')).error).not.toBeNull();
    });
  });

  describe('crit. 3: migration merges existing "Oven" and "Four" into the start item', () => {
    it('leaves one "oven" row, rewrites both recipes to "oven" and keeps the other fields', async () => {
      const other = `Zoutpan${suffix()}`;
      const r1 = await insertRecipe(a.client, { title: `Merge A ${Date.now()}`, equipment: [other] });
      const r2 = await insertRecipe(a.client, { title: `Merge B ${Date.now()}`, equipment: [other] });
      const r3 = await insertRecipe(a.client, { title: `Merge C ${Date.now()}`, equipment: [other] });
      const fields = 'id,title,author_id,created_at,ingredients,steps,photos,prep_minutes,total_minutes,servings';
      const snapshot = async () => {
        const res = await adminClient().from('recipes').select(fields).in('id', [r1.id, r2.id, r3.id]).order('id');
        expect(res.error).toBeNull();
        return res.data;
      };
      const before = await snapshot();

      // Reproduce the state before the migration: raw names, no resolver (replica role skips the triggers in this session).
      await sql(`
        set session_replication_role = replica;
        insert into public.equipment (name, name_key) values ('Four', 'four') on conflict do nothing;
        update public.equipment set name = 'Oven' where name_key = 'oven';
        update public.recipes set equipment = array['Oven'] where id = ${lit(r1.id)};
        update public.recipes set equipment = array['Four'] where id = ${lit(r2.id)};
        update public.recipes set equipment = array['Four', 'Oven', ${lit(other)}, 'oven'] where id = ${lit(r3.id)};
        reset session_replication_role;
      `);
      await sql(`select public.merge_seeded_names()`);

      const rows = await adminClient().from('recipes').select('id,equipment').in('id', [r1.id, r2.id, r3.id]);
      const eq = new Map((rows.data ?? []).map((r) => [r.id as string, r.equipment as string[]]));
      expect(eq.get(r1.id)).toEqual(['oven']);
      expect(eq.get(r2.id)).toEqual(['oven']);
      expect(eq.get(r3.id)).toEqual(['oven', other]); // de-duplicated, first position kept

      const oven = await sql<{ name: string; name_fr: string }>(
        `select name, name_fr from public.equipment where name_key = 'oven' or name_key = 'four'`,
      );
      expect(oven).toEqual([{ name: 'oven', name_fr: 'four' }]);

      expect(await snapshot()).toEqual(before); // no recipe lost, other fields equal
    });

    it('merges a stale tag row "Soupe" into "soep" in the recipes', async () => {
      const r = await insertRecipe(a.client, { title: `Merge tag ${Date.now()}` });
      await sql(`
        set session_replication_role = replica;
        insert into public.tags (kind, name, name_key) values ('dish', 'Soupe', 'soupe') on conflict do nothing;
        update public.recipes set dish_tags = array['Soupe', 'soep'] where id = ${lit(r.id)};
        reset session_replication_role;
      `);
      await sql(`select public.merge_seeded_names()`);
      const res = await adminClient().from('recipes').select('dish_tags').eq('id', r.id).single();
      expect(res.data?.dish_tags).toEqual(['soep']);
      expect(await sql(`select 1 from public.tags where kind = 'dish' and name_key = 'soupe'`)).toHaveLength(0);
    });
  });
});
