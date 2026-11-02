import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  assertSupabaseUp,
  copyPhotos,
  createTestUser,
  deleteTestUser,
  insertRecipe,
  insertVariant,
  listRecipeFiles,
  makeAdmin,
  PHOTO_BUCKET,
  removeRecipeFiles,
  setPhotoSize,
  uploadTestPhoto,
  validRecipe,
  type TestUser,
} from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';

// T-014 / R-006 against the local Supabase: variants are plain recipes with a fixed link to the source.
const LIMIT = 2_097_152;
const CHECK_VIOLATION = '23514';
const FK_VIOLATION = '23503';
const NO_PRIVILEGE = '42501';

describe('recipe variants (R-006)', () => {
  let a: TestUser;
  let b: TestUser;
  let c: TestUser;
  let boss: TestUser;
  const recipeIds: string[] = [];

  beforeAll(async () => {
    await assertSupabaseUp();
    a = await createTestUser('rvara');
    b = await createTestUser('rvarb');
    c = await createTestUser('rvarc');
    boss = await createTestUser('rvarboss');
    await makeAdmin(boss.id);
  });

  afterAll(async () => {
    for (const id of recipeIds) await removeRecipeFiles(id);
    for (const u of [a, b, c, boss]) if (u) await deleteTestUser(u);
  });

  const track = <T extends { id: string }>(row: T): T => {
    recipeIds.push(row.id);
    return row;
  };

  /** A recipe of `user` with `n` real test photos in its own folder. */
  async function sourceWithPhotos(user: TestUser, n: number, fields: Record<string, unknown> = {}) {
    const id = randomUUID();
    recipeIds.push(id);
    const photos: { path: string; main: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const up = await uploadTestPhoto(user.client, id);
      expect(up.error).toBeNull();
      photos.push({ path: up.path, main: i === 0 });
    }
    const res = await user.client.from('recipes').insert(validRecipe({ id, title: 'Bron', photos, ...fields })).select('id');
    expect(res.error).toBeNull();
    return { id, photos };
  }

  const row = async (id: string) => {
    const res = await adminClient().from('recipes').select('*').eq('id', id).single();
    expect(res.error).toBeNull();
    return res.data as Record<string, unknown>;
  };

  async function textBytes(id: string): Promise<number> {
    const rows = await sql<{ n: string }>(`select public.recipe_text_bytes(r)::text as n from public.recipes r where r.id = '${id}'`);
    return Number(rows[0].n);
  }

  describe('crit. 1 and 4: anyone makes a variant, as themselves', () => {
    it('inserts a variant with variant_of and author_id = the own user', async () => {
      const src = track(await insertRecipe(a.client, { title: 'Soep' }));
      const v = track(await insertVariant(b.client, src.id, { title: 'Soep met room' }));
      expect(v.variant_of).toBe(src.id);
      expect(v.author_id).toBe(b.id);
    });

    it('refuses an insert with the author_id of someone else (policy "recipes insert as author")', async () => {
      const src = track(await insertRecipe(a.client));
      const res = await b.client.from('recipes').insert(validRecipe({ variant_of: src.id, author_id: a.id }));
      expect(res.error).not.toBeNull();
    });

    it('B (no admin) makes a variant of A with copied photos through the Storage API with B\'s session', async () => {
      const src = await sourceWithPhotos(a, 2);
      const id = randomUUID();
      recipeIds.push(id);
      const photos = await copyPhotos(b.client, src.photos, id);
      const res = await b.client.from('recipes').insert(validRecipe({ id, title: 'Kopie', photos, variant_of: src.id })).select('id,author_id,variant_of');
      expect(res.error).toBeNull();
      expect(res.data?.[0].author_id).toBe(b.id);

      const owners = await sql<{ owner_id: string }>(
        `select owner_id::text as owner_id from storage.objects where bucket_id = '${PHOTO_BUCKET}' and name like '${id}/%'`,
      );
      expect(owners).toHaveLength(2);
      for (const o of owners) expect(o.owner_id).toBe(b.id);

      // The files of A are untouched and the copy is readable with B's session.
      expect((await listRecipeFiles(src.id)).sort()).toEqual(src.photos.map((p) => p.path.split('/')[1]).sort());
      const dl = await b.client.storage.from(PHOTO_BUCKET).download(photos[0].path);
      expect(dl.error).toBeNull();
    });

    it('an admin and the author themselves can also make a variant', async () => {
      const src = track(await insertRecipe(a.client));
      const own = track(await insertVariant(a.client, src.id));
      const byAdmin = track(await insertVariant(boss.client, src.id));
      expect(own.author_id).toBe(a.id);
      expect(byAdmin.author_id).toBe(boss.id);
    });
  });

  describe('crit. 3: copied photos count towards the 2 MB limit', () => {
    it('refuses a variant 1 byte over the limit with recipe_too_large / detail photos', async () => {
      const src = await sourceWithPhotos(a, 1, { title: 'Grens' });
      const id = randomUUID();
      recipeIds.push(id);
      const photos = await copyPhotos(b.client, src.photos, id);
      await setPhotoSize(photos[0].path, LIMIT - (await textBytes(src.id)) + 1);
      const res = await b.client.from('recipes').insert(validRecipe({ id, title: 'Grens', photos, variant_of: src.id }));
      expect(res.error?.code).toBe(CHECK_VIOLATION);
      expect(res.error?.message).toContain('recipe_too_large');
      expect(res.error?.details).toBe('photos');
    });

    it('accepts a variant exactly at the limit', async () => {
      const src = await sourceWithPhotos(a, 1, { title: 'Grens' });
      const id = randomUUID();
      recipeIds.push(id);
      const photos = await copyPhotos(b.client, src.photos, id);
      await setPhotoSize(photos[0].path, LIMIT - (await textBytes(src.id)));
      const res = await b.client.from('recipes').insert(validRecipe({ id, title: 'Grens', photos, variant_of: src.id })).select('id');
      expect(res.error).toBeNull();
    });

    it('refuses photo paths that lie in the folder of the source (a variant needs its own files)', async () => {
      const src = await sourceWithPhotos(a, 1);
      const res = await b.client.from('recipes').insert(validRecipe({ photos: src.photos, variant_of: src.id }));
      expect(res.error).not.toBeNull();
    });
  });

  describe('crit. 6: chains and family_id', () => {
    it('A -> B -> C: variant_of is the direct source, A has one direct variant, family_id is A for all', async () => {
      const A = track(await insertRecipe(a.client, { title: 'Keten A' }));
      const B = track(await insertVariant(b.client, A.id, { title: 'Keten B' }));
      const C = track(await insertVariant(c.client, B.id, { title: 'Keten C' }));
      expect(C.variant_of).toBe(B.id);
      const direct = await adminClient().from('recipes').select('id').eq('variant_of', A.id);
      expect((direct.data ?? []).map((r) => r.id)).toEqual([B.id]);
      expect((await row(A.id)).family_id).toBe(A.id);
      expect((await row(B.id)).family_id).toBe(A.id);
      expect((await row(C.id)).family_id).toBe(A.id);
    });
  });

  describe('crit. 8: a variant is independent of its source', () => {
    it('updating the source leaves every column of the variant as it was', async () => {
      const src = await sourceWithPhotos(a, 1, { dish_tags: ['soep'], trait_tags: ['snel'], equipment: ['Pan'] });
      const id = randomUUID();
      recipeIds.push(id);
      const photos = await copyPhotos(b.client, src.photos, id);
      const ins = await b.client.from('recipes').insert(validRecipe({ id, title: 'Var', photos, variant_of: src.id, dish_tags: ['soep'] }));
      expect(ins.error).toBeNull();
      const before = await row(id);

      const upd = await a.client
        .from('recipes')
        .update({ title: 'Hernoemd', ingredients: [{ name: 'Peper' }], dish_tags: [], photos: [] })
        .eq('id', src.id)
        .select('id');
      expect(upd.error).toBeNull();
      expect(upd.data).toHaveLength(1);
      expect(await row(id)).toEqual(before);
    });

    it('deleting the source (and its files) leaves the variant and its files readable', async () => {
      const src = await sourceWithPhotos(a, 1);
      const id = randomUUID();
      recipeIds.push(id);
      const photos = await copyPhotos(b.client, src.photos, id);
      const ins = await b.client.from('recipes').insert(validRecipe({ id, photos, variant_of: src.id }));
      expect(ins.error).toBeNull();

      expect((await a.client.from('recipes').delete().eq('id', src.id).select('id')).data).toHaveLength(1);
      await removeRecipeFiles(src.id);

      expect(await listRecipeFiles(id)).toHaveLength(1);
      const dl = await b.client.storage.from(PHOTO_BUCKET).download(photos[0].path);
      expect(dl.error).toBeNull();
    });
  });

  describe('crit. 9: deleting the source', () => {
    it('sets variant_of to null, keeps family_id and the variant', async () => {
      const A = track(await insertRecipe(a.client));
      const B = track(await insertVariant(b.client, A.id));
      const before = await row(B.id);
      expect((await a.client.from('recipes').delete().eq('id', A.id).select('id')).data).toHaveLength(1);
      const after = await row(B.id);
      expect(after.variant_of).toBeNull();
      expect(after.family_id).toBe(A.id);
      expect({ ...after, variant_of: null }).toEqual({ ...before, variant_of: null });
    });

    it('an admin deletes the source of a variant by a third user; the variant stays with variant_of null', async () => {
      const A = track(await insertRecipe(a.client));
      const B = track(await insertVariant(c.client, A.id));
      const del = await boss.client.from('recipes').delete().eq('id', A.id).select('id');
      expect(del.error).toBeNull();
      expect(del.data).toHaveLength(1);
      expect((await row(B.id)).variant_of).toBeNull();
    });

    it('A -> B, A -> D, B -> C: after deleting A, B, C and D still share the family_id', async () => {
      const A = track(await insertRecipe(a.client));
      const B = track(await insertVariant(b.client, A.id));
      const C = track(await insertVariant(c.client, B.id));
      const D = track(await insertVariant(c.client, A.id));
      await a.client.from('recipes').delete().eq('id', A.id);
      const rows = await adminClient().from('recipes').select('id').eq('family_id', A.id);
      expect((rows.data ?? []).map((r) => r.id).sort()).toEqual([B.id, C.id, D.id].sort());
    });
  });

  describe('crit. 10: no own source, no cycles, no tampering', () => {
    it('refuses variant_of = own id (recipes_not_own_source, 23514)', async () => {
      const id = randomUUID();
      const res = await a.client.from('recipes').insert(validRecipe({ id, variant_of: id }));
      expect(res.error?.code).toBe(CHECK_VIOLATION);
      expect(res.error?.message).toContain('recipes_not_own_source');
    });

    it('refuses an unknown variant_of with 23503', async () => {
      const res = await a.client.from('recipes').insert(validRecipe({ variant_of: randomUUID() }));
      expect(res.error?.code).toBe(FK_VIOLATION);
    });

    it('the author cannot update variant_of or family_id (no column privilege, 42501)', async () => {
      const A = track(await insertRecipe(a.client));
      const other = track(await insertRecipe(a.client));
      const B = track(await insertVariant(a.client, A.id));
      const v = await a.client.from('recipes').update({ variant_of: other.id }).eq('id', B.id).select('id');
      expect(v.error?.code).toBe(NO_PRIVILEGE);
      const f = await a.client.from('recipes').update({ family_id: other.id }).eq('id', B.id).select('id');
      expect(f.error?.code).toBe(NO_PRIVILEGE);
      expect((await row(B.id)).variant_of).toBe(A.id);
    });

    it('even the service role cannot change variant_of to another recipe or change family_id (trigger, 23514)', async () => {
      const A = track(await insertRecipe(a.client));
      const other = track(await insertRecipe(a.client));
      const B = track(await insertVariant(b.client, A.id));
      const svc = adminClient();
      const v = await svc.from('recipes').update({ variant_of: other.id }).eq('id', B.id);
      expect(v.error?.code).toBe(CHECK_VIOLATION);
      const f = await svc.from('recipes').update({ family_id: other.id }).eq('id', B.id);
      expect(f.error?.code).toBe(CHECK_VIOLATION);
      // Making a cycle (A becomes a variant of B) is refused too.
      const cycle = await svc.from('recipes').update({ variant_of: B.id }).eq('id', A.id);
      expect(cycle.error?.code).toBe(CHECK_VIOLATION);
      const after = await row(B.id);
      expect(after.variant_of).toBe(A.id);
      expect(after.family_id).toBe(A.id);
    });

    it('allows the move to null (the foreign key action is an update too)', async () => {
      const A = track(await insertRecipe(a.client));
      const B = track(await insertVariant(b.client, A.id));
      const res = await adminClient().from('recipes').update({ variant_of: null }).eq('id', B.id);
      expect(res.error).toBeNull();
    });

    it('ignores a family_id chosen by the client on insert', async () => {
      const A = track(await insertRecipe(a.client));
      const stranger = randomUUID();
      const asVariant = track(await insertVariant(b.client, A.id, { family_id: stranger }));
      expect(asVariant.family_id).toBe(A.id);
      const root = track(await insertRecipe(b.client, { family_id: stranger }));
      const res = await adminClient().from('recipes').select('family_id').eq('id', root.id).single();
      expect(res.data?.family_id).toBe(root.id);
    });
  });
});
