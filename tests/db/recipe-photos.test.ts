import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  anonClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  insertRecipe,
  listRecipeFiles,
  makeAdmin,
  PHOTO_BUCKET,
  removeRecipeFiles,
  supabaseUrl,
  uploadTestPhoto,
  validRecipe,
  type TestUser,
} from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';

// T-012 / R-005 against the local Supabase: the database and the bucket enforce the rules.
const CHECK_VIOLATION = '23514';

describe('recipe photos (R-005)', () => {
  let a: TestUser;
  let b: TestUser;
  let admin: TestUser;
  const recipeIds: string[] = [];

  beforeAll(async () => {
    await assertSupabaseUp();
    a = await createTestUser('rpha');
    b = await createTestUser('rphb');
    admin = await createTestUser('rphadm');
    await makeAdmin(admin.id);
  });

  afterAll(async () => {
    for (const id of recipeIds) await removeRecipeFiles(id);
    for (const u of [a, b, admin]) if (u) await deleteTestUser(u);
  });

  /** Uploads `n` files for a new recipe id (the client picks the id, like the app does) and returns id and photo list. */
  async function prepare(user: TestUser, n: number, mainIndex = 0) {
    const id = randomUUID();
    recipeIds.push(id);
    const photos: { path: string; main: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const up = await uploadTestPhoto(user.client, id);
      expect(up.error).toBeNull();
      photos.push({ path: up.path, main: i === mainIndex });
    }
    return { id, photos };
  }

  const insertWith = (user: TestUser, id: string, photos: unknown) =>
    user.client.from('recipes').insert(validRecipe({ id, photos })).select('id,photos').single();

  describe('crit. 1: at most 3 photos', () => {
    it('without photos an insert gives []', async () => {
      const row = await insertRecipe(a.client);
      const res = await a.client.from('recipes').select('photos').eq('id', row.id).single();
      expect(res.data?.photos).toEqual([]);
    });

    it('accepts an explicit empty list', async () => {
      const { id } = await prepare(a, 0);
      const res = await insertWith(a, id, []);
      expect(res.error).toBeNull();
      expect(res.data?.photos).toEqual([]);
    });

    it('accepts 3 photos', async () => {
      const { id, photos } = await prepare(a, 3);
      const res = await insertWith(a, id, photos);
      expect(res.error).toBeNull();
      expect(res.data?.photos).toHaveLength(3);
    });

    it('refuses an insert with 4 photos (23514)', async () => {
      const { id, photos } = await prepare(a, 4);
      const res = await insertWith(a, id, photos);
      expect(res.error?.code).toBe(CHECK_VIOLATION);
    });

    it('refuses an update to 4 photos (23514), accepts an update to 3', async () => {
      const { id, photos } = await prepare(a, 3);
      expect((await insertWith(a, id, photos)).error).toBeNull();
      const extra = await uploadTestPhoto(a.client, id);
      expect(extra.error).toBeNull();
      const four = await a.client
        .from('recipes')
        .update({ photos: [...photos, { path: extra.path, main: false }] })
        .eq('id', id)
        .select('id');
      expect(four.error?.code).toBe(CHECK_VIOLATION);
      const two = await a.client.from('recipes').update({ photos: photos.slice(0, 2) }).eq('id', id).select('photos');
      expect(two.error).toBeNull();
      expect(two.data?.[0].photos).toHaveLength(2);
    });
  });

  describe('crit. 5: exactly one main photo', () => {
    it('refuses two main photos (23514)', async () => {
      const { id, photos } = await prepare(a, 2);
      const res = await insertWith(a, id, photos.map((p) => ({ ...p, main: true })));
      expect(res.error?.code).toBe(CHECK_VIOLATION);
    });

    it('repairs "no main" by marking the first photo', async () => {
      const { id, photos } = await prepare(a, 2);
      const res = await insertWith(a, id, photos.map((p) => ({ ...p, main: false })));
      expect(res.error).toBeNull();
      expect(res.data?.photos).toEqual([
        { path: photos[0].path, main: true },
        { path: photos[1].path, main: false },
      ]);
    });

    it('keeps the order and the main flag as given', async () => {
      const { id, photos } = await prepare(a, 3, 2);
      const res = await insertWith(a, id, photos);
      expect(res.data?.photos).toEqual(photos);
    });
  });

  describe('element shape and paths', () => {
    it('refuses an element with extra keys, a non-boolean main or a path outside <id>/<uuid>.jpg', async () => {
      const { id, photos } = await prepare(a, 1);
      const bad: unknown[] = [
        [{ ...photos[0], extra: 1 }],
        [{ path: photos[0].path, main: 'true' }],
        [{ path: `${id}/not-a-uuid.jpg`, main: true }],
        [{ path: `${randomUUID()}/${randomUUID()}.jpg`, main: true }], // folder of another recipe id
        'not an array',
      ];
      for (const value of bad) {
        const res = await insertWith(a, id, value);
        expect(res.error?.code, JSON.stringify(value)).toBe(CHECK_VIOLATION);
      }
    });

    it('refuses the same path twice', async () => {
      const { id, photos } = await prepare(a, 1);
      const res = await insertWith(a, id, [photos[0], { ...photos[0], main: false }]);
      expect(res.error?.code).toBe(CHECK_VIOLATION);
    });

    it('refuses a path to a file that does not exist', async () => {
      const id = randomUUID();
      recipeIds.push(id);
      const res = await insertWith(a, id, [{ path: `${id}/${randomUUID()}.jpg`, main: true }]);
      expect(res.error?.code).toBe(CHECK_VIOLATION);
    });

    it("refuses a path to someone else's file (the trigger checks the owner)", async () => {
      // b uploads into the folder of a recipe id that does not exist yet (allowed: upload comes before the row).
      // a then creates that recipe and points at b's file: the owner check in the trigger must refuse.
      const { id, photos } = await prepare(b, 1);
      const res = await insertWith(a, id, photos);
      expect(res.error?.code).toBe(CHECK_VIOLATION);
    });

    it('only the author can change photos on a recipe (update policy)', async () => {
      const { id, photos } = await prepare(a, 2);
      expect((await insertWith(a, id, photos)).error).toBeNull();
      for (const other of [b, admin]) {
        const res = await other.client
          .from('recipes')
          .update({ photos: [{ path: photos[1].path, main: true }] })
          .eq('id', id)
          .select('id');
        expect(res.data ?? []).toHaveLength(0);
      }
      const check = await a.client.from('recipes').select('photos').eq('id', id).single();
      expect(check.data?.photos).toEqual(photos);
    });
  });

  describe('crit. 2 and 3: bucket limits', () => {
    it('the bucket is private, 512000 bytes, image/jpeg only', async () => {
      const rows = await sql<{ public: boolean; file_size_limit: string | number; allowed_mime_types: string[] }>(
        `select public, file_size_limit, allowed_mime_types from storage.buckets where id = '${PHOTO_BUCKET}'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].public).toBe(false);
      expect(Number(rows[0].file_size_limit)).toBe(512000);
      expect(rows[0].allowed_mime_types).toEqual(['image/jpeg']);
    });

    it('refuses an upload of type image/png', async () => {
      const id = randomUUID();
      recipeIds.push(id);
      const up = await uploadTestPhoto(a.client, id, { contentType: 'image/png' });
      expect(up.error).not.toBeNull();
      expect(await listRecipeFiles(id)).toEqual([]);
    });

    it('accepts 512000 bytes and refuses 512001 bytes', async () => {
      const id = randomUUID();
      recipeIds.push(id);
      const ok = await uploadTestPhoto(a.client, id, { size: 512000 });
      expect(ok.error).toBeNull();
      const tooBig = await uploadTestPhoto(a.client, id, { size: 512001 });
      expect(tooBig.error).not.toBeNull();
      expect(await listRecipeFiles(id)).toHaveLength(1);
    });

    it('refuses a name that does not follow <uuid>/<uuid>.jpg', async () => {
      const id = randomUUID();
      recipeIds.push(id);
      for (const path of [`${id}/foto.jpg`, `${id}/${randomUUID()}.png`, `${randomUUID()}.jpg`, `${id}/sub/${randomUUID()}.jpg`]) {
        const up = await uploadTestPhoto(a.client, id, { path });
        expect(up.error, path).not.toBeNull();
      }
    });
  });

  describe('crit. 6: who may change files', () => {
    it("nobody can upload into another author's existing recipe folder", async () => {
      const { id, photos } = await prepare(a, 1);
      expect((await insertWith(a, id, photos)).error).toBeNull();
      const intruder = await uploadTestPhoto(b.client, id);
      expect(intruder.error).not.toBeNull();
      expect(await listRecipeFiles(id)).toHaveLength(1);
    });

    it('nobody can overwrite an existing file (upsert refused), not even the owner', async () => {
      const { id, photos } = await prepare(a, 1);
      const res = await a.client.storage
        .from(PHOTO_BUCKET)
        .upload(photos[0].path, new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), { contentType: 'image/jpeg', upsert: true });
      expect(res.error).not.toBeNull();
      const dl = await adminClient().storage.from(PHOTO_BUCKET).download(photos[0].path);
      expect(dl.data?.size).toBe(2048);
      expect(id).toBeTruthy();
    });

    it('another ordinary user cannot remove a file: no error, the file stays', async () => {
      const { id, photos } = await prepare(a, 1);
      await b.client.storage.from(PHOTO_BUCKET).remove([photos[0].path]);
      expect(await listRecipeFiles(id)).toHaveLength(1);
    });

    it('the owner can remove a file', async () => {
      const { id, photos } = await prepare(a, 1);
      const res = await a.client.storage.from(PHOTO_BUCKET).remove([photos[0].path]);
      expect(res.error).toBeNull();
      expect(await listRecipeFiles(id)).toEqual([]);
    });

    it("an administrator can remove someone else's file", async () => {
      const { id, photos } = await prepare(a, 1);
      const res = await admin.client.storage.from(PHOTO_BUCKET).remove([photos[0].path]);
      expect(res.error).toBeNull();
      expect(await listRecipeFiles(id)).toEqual([]);
    });
  });

  describe('crit. 7: readable only when signed in', () => {
    it('anonymous download and signed URL fail; the public URL is not 200', async () => {
      const { photos } = await prepare(a, 1);
      const anon = anonClient();
      const dl = await anon.storage.from(PHOTO_BUCKET).download(photos[0].path);
      expect(dl.error).not.toBeNull();
      const signed = await anon.storage.from(PHOTO_BUCKET).createSignedUrl(photos[0].path, 60);
      expect(signed.error).not.toBeNull();
      const res = await fetch(`${supabaseUrl()}/storage/v1/object/public/${PHOTO_BUCKET}/${photos[0].path}`);
      expect(res.status).not.toBe(200);
    });

    it('another signed-in user can download and sign the file', async () => {
      const { photos } = await prepare(a, 1);
      const dl = await b.client.storage.from(PHOTO_BUCKET).download(photos[0].path);
      expect(dl.error).toBeNull();
      expect(dl.data?.size).toBe(2048);
      const signed = await b.client.storage.from(PHOTO_BUCKET).createSignedUrl(photos[0].path, 60);
      expect(signed.error).toBeNull();
      expect(signed.data?.signedUrl).toBeTruthy();
    });

    it('an anonymous select on recipes.photos returns nothing', async () => {
      const { id, photos } = await prepare(a, 1);
      expect((await insertWith(a, id, photos)).error).toBeNull();
      const res = await anonClient().from('recipes').select('photos').eq('id', id);
      expect(res.data ?? []).toEqual([]);
    });
  });
});
