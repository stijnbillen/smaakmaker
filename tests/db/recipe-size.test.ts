import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  removeRecipeFiles,
  setPhotoSize,
  uploadTestPhoto,
  validRecipe,
  type TestUser,
} from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';
import { SIZE_CASES } from '../fixtures/recipe-size-cases';

// T-013 / R-004 against the local Supabase: the database enforces the 2 MB limit.
// Real input never reaches 2 MB (text <= ~196.400 bytes, photos <= 3 x 512.000), so the boundary tests
// raise storage.objects.metadata.size through pg (setPhotoSize). All writes go through a normal user's
// client (public key + session = PostgREST), never the service client (crit. 3).
const LIMIT = 2_097_152;
const CHECK_VIOLATION = '23514';

describe('recipe size limit (R-004)', () => {
  let a: TestUser;
  let b: TestUser;
  const recipeIds: string[] = [];

  // Saving a recipe adds its tags/equipment to the shared catalogue (clients cannot write it directly).
  // Other test files and the e2e tab-order check read that catalogue, so this file removes what it added.
  const sqlLit = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const fixtureTags = SIZE_CASES.flatMap((c) => [...(c.dishTags ?? []), ...(c.traitTags ?? [])]);
  const fixtureEquipment = SIZE_CASES.flatMap((c) => c.equipment ?? []);
  const dynamicTags: string[] = [];
  const dynamicEquipment: string[] = [];
  let preTags = new Set<string>();
  let preEquipment = new Set<string>();

  const keysOf = async (table: 'tags' | 'equipment', names: string[]) =>
    new Set(
      (
        await sql<{ k: string }>(
          `select public.fold_key(n) as k from unnest(array[${names.map(sqlLit).join(',') || "''"}]::text[]) n
           where exists (select 1 from public.${table} t where t.name_key = public.fold_key(n))`,
        )
      ).map((r) => r.k),
    );

  beforeAll(async () => {
    await assertSupabaseUp();
    preTags = await keysOf('tags', fixtureTags);
    preEquipment = await keysOf('equipment', fixtureEquipment);
    a = await createTestUser('rsza');
    b = await createTestUser('rszb');
  });

  afterAll(async () => {
    for (const id of recipeIds) await removeRecipeFiles(id);
    for (const u of [a, b]) if (u) await deleteTestUser(u);
    const keys = (names: string[]) => `array[${names.map(sqlLit).join(',')}]::text[]`;
    const tagNames = [...fixtureTags, ...dynamicTags];
    const equipNames = [...fixtureEquipment, ...dynamicEquipment];
    // Max-length tags of crit. 6 (d00..d19, t00..t19, g00..g19 with 27 times "é").
    await sql(
      `delete from public.tags where (name_key in (select public.fold_key(n) from unnest(${keys(tagNames)}) n)
         and name_key <> all(${keys([...preTags])}))
       or name ~ '^[dt][0-9]{2}é{27}$'`,
    );
    await sql(
      `delete from public.equipment where (name_key in (select public.fold_key(n) from unnest(${keys(equipNames)}) n)
         and name_key <> all(${keys([...preEquipment])}))
       or name ~ '^g[0-9]{2}é{27}$'`,
    );
  });

  async function uploads(user: TestUser, id: string, n: number) {
    const photos: { path: string; main: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const up = await uploadTestPhoto(user.client, id);
      expect(up.error).toBeNull();
      photos.push({ path: up.path, main: i === 0 });
    }
    return photos;
  }

  /** Inserts a recipe (as `user`, through the API) with `n` real test photos. */
  async function create(user: TestUser, n: number, fields: Record<string, unknown> = {}) {
    const id = randomUUID();
    recipeIds.push(id);
    const photos = await uploads(user, id, n);
    const res = await user.client
      .from('recipes')
      .insert(validRecipe({ id, title: 'Grens', photos, ...fields }))
      .select('id');
    return { id, photos, res };
  }

  async function textBytes(id: string): Promise<number> {
    const rows = await sql<{ n: string }>(`select public.recipe_text_bytes(r)::text as n from public.recipes r where r.id = '${id}'`);
    return Number(rows[0].n);
  }

  /** Sets the one photo's size so that text + photo is exactly LIMIT + delta. */
  async function fillTo(id: string, path: string, delta = 0): Promise<void> {
    await setPhotoSize(path, LIMIT - (await textBytes(id)) + delta);
  }

  const update = (user: TestUser, id: string, fields: Record<string, unknown>) =>
    user.client.from('recipes').update(fields).eq('id', id).select('id');

  describe('crit. 1: what counts', () => {
    for (const c of SIZE_CASES) {
      it(`recipe_text_bytes gives the shared fixture number for "${c.name}" (${c.bytes})`, async () => {
        const { id, res } = await create(a, 0, {
          title: c.title,
          ingredients: c.ingredients,
          steps: c.steps,
          source: c.source ?? null,
          note: c.note ?? null,
          dish_tags: c.dishTags ?? [],
          trait_tags: c.traitTags ?? [],
          equipment: c.equipment ?? [],
        });
        expect(res.error).toBeNull();
        expect(await textBytes(id)).toBe(c.bytes);
      });
    }

    it('recipe_photo_bytes is the sum of the stored file sizes (2 test photos)', async () => {
      const { id, photos, res } = await create(a, 2);
      expect(res.error).toBeNull();
      const expected = 2 * 2048; // fakeJpegBytes default size
      const rows = await sql<{ n: string }>(
        `select public.recipe_photo_bytes(photos)::text as n from public.recipes where id = '${id}'`,
      );
      expect(Number(rows[0].n)).toBe(expected);
      const direct = await sql<{ n: string }>(
        `select public.recipe_photo_bytes('${JSON.stringify(photos)}'::jsonb)::text as n`,
      );
      expect(Number(direct[0].n)).toBe(expected);
    });

    it('a review changes nothing about the size, and a recipe exactly at the limit still gets one (R-012)', async () => {
      const { id, photos, res } = await create(a, 1);
      expect(res.error).toBeNull();
      await fillTo(id, photos[0].path);
      const before = await textBytes(id);
      const photoBefore = await sql<{ n: string }>(`select public.recipe_photo_bytes(photos)::text as n from public.recipes where id = '${id}'`);

      const review = await b.client.from('reviews').insert({ recipe_id: id, rating: 4, body: 'Lekker, met veel tekst é€🍅' }).select('id');
      expect(review.error).toBeNull();
      const edit = await b.client.from('reviews').update({ rating: 5, body: 'nog veel langer '.repeat(20) }).eq('recipe_id', id).select('id');
      expect(edit.error).toBeNull();

      expect(await textBytes(id)).toBe(before);
      const photoAfter = await sql<{ n: string }>(`select public.recipe_photo_bytes(photos)::text as n from public.recipes where id = '${id}'`);
      expect(photoAfter[0].n).toBe(photoBefore[0].n);
      expect(before + Number(photoBefore[0].n)).toBe(LIMIT);
    });
  });

  describe('crit. 2 and 3: the boundary, through the API', () => {
    it('an update to exactly 2.097.152 is accepted', async () => {
      // Insert with a real photo, the size is raised afterwards; an update to the same length is the exact boundary.
      const { id, photos, res } = await create(a, 1);
      expect(res.error).toBeNull();
      await fillTo(id, photos[0].path);
      const same = await update(a, id, { title: 'Grena' });
      expect(same.error).toBeNull();
      expect(same.data).toHaveLength(1);
    });

    it('an insert whose total is exactly 2.097.152 is accepted (photo size pre-set before the row exists)', async () => {
      const id = randomUUID();
      recipeIds.push(id);
      const photos = await uploads(a, id, 1);
      const title = 'Grens';
      const text = Buffer.byteLength(title) + Buffer.byteLength('Zout') + Buffer.byteLength('Meng alles.');
      await setPhotoSize(photos[0].path, LIMIT - text);
      const ok = await a.client.from('recipes').insert(validRecipe({ id, title, photos })).select('id');
      expect(ok.error).toBeNull();
      expect(await textBytes(id)).toBe(text);
    });

    it('an insert 1 byte over is refused with 23514 recipe_too_large, detail photos', async () => {
      const id = randomUUID();
      recipeIds.push(id);
      const photos = await uploads(a, id, 1);
      const text = Buffer.byteLength('Grens') + Buffer.byteLength('Zout') + Buffer.byteLength('Meng alles.');
      await setPhotoSize(photos[0].path, LIMIT - text + 1);
      const res = await a.client.from('recipes').insert(validRecipe({ id, title: 'Grens', photos })).select('id');
      expect(res.error?.code).toBe(CHECK_VIOLATION);
      expect(res.error?.message).toBe('recipe_too_large');
      expect(res.error?.details).toBe('photos');
      const rows = await adminClient().from('recipes').select('id').eq('id', id);
      expect(rows.data ?? []).toEqual([]);
    });

    it('an update 1 byte over (one extra character in the title) is refused, detail photos', async () => {
      const { id, photos } = await create(a, 1);
      await fillTo(id, photos[0].path);
      const res = await update(a, id, { title: 'Grensx' });
      expect(res.error?.code).toBe(CHECK_VIOLATION);
      expect(res.error?.message).toBe('recipe_too_large');
      expect(res.error?.details).toBe('photos');
    });

    it('an update refused because the photo metadata is 1 byte too large (same title)', async () => {
      const { id, photos } = await create(a, 1);
      await fillTo(id, photos[0].path, 1);
      const res = await update(a, id, { title: 'Grens' });
      expect(res.error?.code).toBe(CHECK_VIOLATION);
      expect(res.error?.details).toBe('photos');
    });

    it('recipe_size_problem is null at the limit, "photos" above it, "text" when the text alone is above it', async () => {
      const q = async (t: number, p: number) =>
        (await sql<{ r: string | null }>(`select public.recipe_size_problem(${t}, ${p}) as r`))[0].r;
      expect(await q(LIMIT, 0)).toBeNull();
      expect(await q(0, LIMIT)).toBeNull();
      expect(await q(1000, LIMIT - 1000)).toBeNull();
      expect(await q(LIMIT + 1, 0)).toBe('text');
      expect(await q(LIMIT + 1, 5)).toBe('text');
      expect(await q(LIMIT, 1)).toBe('photos');
      expect(await q(1000, LIMIT - 1000 + 1)).toBe('photos');
      expect(await q(0, 0)).toBeNull();
    });

    it('recipe_size_limit() is 2.097.152', async () => {
      const rows = await sql<{ n: string }>('select public.recipe_size_limit()::text as n');
      expect(Number(rows[0].n)).toBe(LIMIT);
    });
  });

  describe('crit. 3: enforced in the database, after the normalising triggers, on every update', () => {
    it('a title with leading spaces that fits once trimmed is accepted', async () => {
      const { id, photos } = await create(a, 1);
      await fillTo(id, photos[0].path);
      const res = await update(a, id, { title: '      Grens' });
      expect(res.error).toBeNull();
      expect(res.data).toHaveLength(1);
    });

    it('a tag is measured in its stored (canonical) spelling, not as typed', async () => {
      const s = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      const canonical = `Crème${s}`;
      dynamicTags.push(canonical);
      const first = await create(a, 0, { dish_tags: [canonical] });
      expect(first.res.error).toBeNull();

      // Same tag typed without the accent: the database stores the catalogue spelling (one byte longer).
      const { id, photos, res } = await create(a, 1, { dish_tags: [`creme${s}`] });
      expect(res.error).toBeNull();
      const stored = await adminClient().from('recipes').select('dish_tags').eq('id', id).single();
      expect(stored.data?.dish_tags).toEqual([canonical]);
      const measured = await textBytes(id);
      expect(measured).toBe(
        Buffer.byteLength('Grens') + Buffer.byteLength('Zout') + Buffer.byteLength('Meng alles.') + Buffer.byteLength(canonical),
      );

      await fillTo(id, photos[0].path);
      const ok = await update(a, id, { dish_tags: [`creme${s}`] });
      expect(ok.error).toBeNull();
      await fillTo(id, photos[0].path, 1);
      const over = await update(a, id, { dish_tags: [`creme${s}`] });
      expect(over.error?.code).toBe(CHECK_VIOLATION);
    });

    it('an update of only one column (note, dish_tags) is checked too', async () => {
      const { id, photos } = await create(a, 1, { note: 'x' });
      const tagName = `T${Date.now()}`;
      const gearName = `G${Date.now()}`;
      dynamicTags.push(tagName);
      dynamicEquipment.push(gearName);
      await fillTo(id, photos[0].path);
      const note = await update(a, id, { note: 'xx' });
      expect(note.error?.code).toBe(CHECK_VIOLATION);
      expect(note.error?.details).toBe('photos');
      const tags = await update(a, id, { dish_tags: [tagName] });
      expect(tags.error?.code).toBe(CHECK_VIOLATION);
      const equipment = await update(a, id, { equipment: [gearName] });
      expect(equipment.error?.code).toBe(CHECK_VIOLATION);
    });

    it('a file without metadata size counts as 512.000 bytes (cannot slip through as 0)', async () => {
      const { id, photos, res } = await create(a, 3);
      expect(res.error).toBeNull();
      for (const p of photos) await setPhotoSize(p.path, null);
      const rows = await sql<{ n: string }>(`select public.recipe_photo_bytes(photos)::text as n from public.recipes where id = '${id}'`);
      expect(Number(rows[0].n)).toBe(3 * 512_000);
    });

    it('a path without a file counts as 512.000 bytes too', async () => {
      const missing = `${randomUUID()}/${randomUUID()}.jpg`;
      const rows = await sql<{ n: string }>(
        `select public.recipe_photo_bytes('[{"path":"${missing}","main":true}]'::jsonb)::text as n`,
      );
      expect(Number(rows[0].n)).toBe(512_000);
    });

    it('the measuring function is not executable for anon', async () => {
      const rows = await sql<{ ok: boolean }>(
        `select has_function_privilege('anon', 'public.recipe_photo_bytes(jsonb)', 'execute') as ok`,
      );
      expect(rows[0].ok).toBe(false);
    });
  });

  describe('crit. 5: a refused update leaves the recipe as it was', () => {
    it('same title, photos and text after a refused update', async () => {
      const { id, photos } = await create(a, 1, { note: 'oud' });
      await fillTo(id, photos[0].path);
      const read = () => adminClient().from('recipes').select('title,photos,note,steps,ingredients,dish_tags').eq('id', id).single();
      const before = await read();
      const refused = await update(a, id, { title: 'Grens veranderd', note: 'nieuw', steps: ['Anders.'] });
      expect(refused.error?.code).toBe(CHECK_VIOLATION);
      const after = await read();
      expect(after.data).toEqual(before.data);
    });
  });

  describe('crit. 6: small or empty recipes are never refused', () => {
    it('zero photos with every text field at its maximum (4-byte characters) is accepted', async () => {
      const tom = (n: number) => '🍅'.repeat(n);
      const tag = (p: string, i: number) => `${p}${String(i).padStart(2, '0')}${'é'.repeat(30 - 3)}`;
      const { id, res } = await create(a, 0, {
        title: tom(100),
        ingredients: Array.from({ length: 60 }, () => ({ name: tom(80), unit: tom(20) })),
        steps: Array.from({ length: 40 }, () => tom(1000)),
        source: tom(200),
        note: tom(1000),
        dish_tags: Array.from({ length: 20 }, (_, i) => tag('d', i)),
        trait_tags: Array.from({ length: 20 }, (_, i) => tag('t', i)),
        equipment: Array.from({ length: 20 }, (_, i) => tag('g', i)),
      });
      expect(res.error).toBeNull();
      expect(await textBytes(id)).toBeLessThan(LIMIT - 3 * 512_000);
    });

    it('a minimal recipe with 3 photos of 512.000 bytes each is accepted', async () => {
      const id = randomUUID();
      recipeIds.push(id);
      const photos = await uploads(a, id, 3);
      for (const p of photos) await setPhotoSize(p.path, 512_000);
      const res = await a.client.from('recipes').insert(validRecipe({ id, photos })).select('id');
      expect(res.error).toBeNull();
    });
  });
});
