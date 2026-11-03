import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { nl, saveButton, titleField } from '../helpers/recipe-form';
import { signInViaStorage, supabaseRoutePattern } from '../helpers/session';
import {
  adminClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  listRecipeFiles,
  removeRecipeFiles,
  setPhotoSize,
  type TestUser,
  uploadTestPhoto,
  validRecipe,
} from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';
import { canvasImage, galleryInput, photoGroup, photoRemove, photoRemoveButtons, photosOf, recipeIdFromUrl } from '../helpers/photos';
import { fillRecipe } from '../helpers/recipe-form';

// T-013 / R-004 (interface, 360 x 640, local Supabase). Real input never reaches 2 MB, so the boundary is
// reached by raising the stored file size through pg (setPhotoSize), as the brief prescribes.
const LIMIT = 2_097_152;
let user: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('rsize', { displayName: 'Sam Size' });
});

test.afterAll(async () => {
  if (user) await deleteTestUser(user);
});

test.beforeEach(async ({ page }) => {
  await signInViaStorage(page, user.session);
});

const counter = (page: Page) => page.getByTestId('recipe-size');
const tooLarge = (page: Page) => page.getByRole('alert').filter({ hasText: nl['size.photosTooLarge'] });
const base = { ingredients: ['Zout'], steps: ['Roer.'] };

/** A stored recipe (title "Grens") with `n` real test photos, made through the user's client. */
async function stored(n: number) {
  const id = randomUUID();
  const photos: { path: string; main: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const up = await uploadTestPhoto(user.client, id);
    expect(up.error).toBeNull();
    photos.push({ path: up.path, main: i === 0 });
  }
  const res = await user.client.from('recipes').insert(validRecipe({ id, title: 'Grens', photos })).select('id');
  expect(res.error).toBeNull();
  return { id, photos };
}

async function textBytes(id: string): Promise<number> {
  const rows = await sql<{ n: string }>(`select public.recipe_text_bytes(r)::text as n from public.recipes r where r.id = '${id}'`);
  return Number(rows[0].n);
}

/** Photo size such that text + photo is exactly LIMIT + delta. */
async function fillTo(id: string, path: string, delta = 0): Promise<void> {
  await setPhotoSize(path, LIMIT - (await textBytes(id)) + delta);
}

/** Counts writes to the recipes table (insert/update) so "without a database call" can be proven. */
function watchWrites(page: Page): () => number {
  let n = 0;
  page.on('request', (r) => {
    if (['POST', 'PATCH', 'PUT'].includes(r.method()) && new URL(r.url()).pathname.endsWith('/rest/v1/recipes')) n++;
  });
  return () => n;
}

const jpeg = (page: Page, name = 'p.jpg') => canvasImage(page, name, 640, 480, 'image/jpeg');
/** 1280 x 1280 random-noise JPEG (hard to compress, so well over 110 KB). */
async function noisyJpeg(page: Page, name = 'noise.jpg') {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1280;
    c.height = 1280;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(1280, 1280);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = Math.random() * 256;
      img.data[i + 1] = Math.random() * 256;
      img.data[i + 2] = Math.random() * 256;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.9));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
  return { name, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}
const parseUsed =(text: string | null): number => Number((/^(\d+,\d) van 2 MB$/.exec(text ?? '') ?? [])[1]?.replace(',', '.'));

test.describe('crit. 4: the used size while editing', () => {
  test('"Nieuw recept" shows 0,0 van 2 MB', async ({ page }) => {
    await page.goto('/nieuw');
    await expect(counter(page)).toHaveText('0,0 van 2 MB');
  });

  test('typing text raises the number (rounded up), adding a photo raises it more, removing it sets it back', async ({ page }) => {
    await page.goto('/nieuw');
    await fillRecipe(page, { title: 'Soep', ...base });
    await expect(counter(page)).toHaveText('0,1 van 2 MB'); // a few bytes of text round up to 0,1
    const textOnly = parseUsed(await counter(page).textContent());

    // A gradient JPEG stays below 0,1 MB and would not move the rounded number; noise is large enough to prove
    // the photo counts (the app shrinks it to at most 512.000 bytes, still well above 110 KB).
    await galleryInput(page).setInputFiles([await noisyJpeg(page)]);
    await expect(photoRemoveButtons(page)).toHaveCount(1);
    await expect.poll(async () => parseUsed(await counter(page).textContent())).toBeGreaterThan(textOnly);

    await photoRemove(page, 1).click();
    await expect(photoRemoveButtons(page)).toHaveCount(0);
    await expect(counter(page)).toHaveText('0,1 van 2 MB');
  });

  test('on the edit page the number includes the stored file sizes from storage', async ({ page }) => {
    const { id, photos } = await stored(2);
    // Two files of 512.288 bytes... total 1 MB + a bit: with the text it is just over 1,0 -> shows 1,1.
    for (const p of photos) await setPhotoSize(p.path, 524_288);
    await page.goto(`/recept/${id}/bewerken`);
    await expect(counter(page)).toHaveText('1,1 van 2 MB');
  });

  test('the counter fits within 360 px and is not a live region', async ({ page }) => {
    await page.goto('/nieuw');
    const el = counter(page);
    await expect(el).toBeVisible();
    const box = (await el.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(await el.evaluate((e) => e.closest('[aria-live]') !== null)).toBe(false);
    expect(await el.evaluate((e) => ['status', 'alert', 'log'].includes(e.getAttribute('role') ?? ''))).toBe(false);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test('a failing size lookup for stored photos shows the connection banner and the form stays usable', async ({ page }) => {
    const { id } = await stored(1);
    await page.route('**/storage/v1/object/list/**', (r) => r.abort());
    await page.goto(`/recept/${id}/bewerken`);
    await expect(page.getByText(nl['connection.error'])).toBeVisible();
    await expect(titleField(page)).toBeEnabled();
    await titleField(page).fill('Nog bruikbaar');
    await expect(titleField(page)).toHaveValue('Nog bruikbaar');
    await expect(saveButton(page)).toBeEnabled();
  });
});

test.describe('crit. 2: the boundary in the interface (check in the client, no database call)', () => {
  test('one character too many: "Foto\'s zijn samen te groot." without a database call; one less: saving works', async ({ page }) => {
    const { id, photos } = await stored(1);
    await fillTo(id, photos[0].path); // exactly at the limit
    const writes = watchWrites(page);
    await page.goto(`/recept/${id}/bewerken`);
    await expect(counter(page)).toHaveText('2,0 van 2 MB');

    await titleField(page).fill('Grensx');
    await expect(counter(page)).toHaveText('2,1 van 2 MB');
    await saveButton(page).click();
    await expect(tooLarge(page)).toBeVisible();
    expect(writes()).toBe(0);

    await titleField(page).fill('Gren');
    await saveButton(page).click();
    await expect(page).toHaveURL(new RegExp(`/recept/${id}$`));
    const row = await adminClient().from('recipes').select('title').eq('id', id).single();
    expect(row.data?.title).toBe('Gren');
  });

  test('exactly at the limit saving is accepted', async ({ page }) => {
    const { id, photos } = await stored(1);
    await fillTo(id, photos[0].path);
    await page.goto(`/recept/${id}/bewerken`);
    await expect(counter(page)).toHaveText('2,0 van 2 MB');
    await titleField(page).fill('Grena'); // same length
    await saveButton(page).click();
    await expect(page).toHaveURL(new RegExp(`/recept/${id}$`));
  });
});

test.describe('crit. 5: a refused save leaves recipe and storage as they were', () => {
  test('refused by the client check: nothing is uploaded and nothing is written', async ({ page }) => {
    const { id, photos } = await stored(1);
    await fillTo(id, photos[0].path);
    const writes = watchWrites(page);
    await page.goto(`/recept/${id}/bewerken`);
    await expect(counter(page)).toHaveText('2,0 van 2 MB');
    const before = await listRecipeFiles(id);

    await galleryInput(page).setInputFiles([await jpeg(page)]);
    await expect(photoRemoveButtons(page)).toHaveCount(2);
    await saveButton(page).click();
    await expect(tooLarge(page)).toBeVisible();
    expect(writes()).toBe(0);
    expect(await listRecipeFiles(id)).toEqual(before);
    expect(await photosOf(id)).toEqual(photos);
  });

  test('refused by the database (the client knew a too low size): message, filled form, old recipe, new file gone', async ({ page }) => {
    const { id, photos } = await stored(1);
    await page.goto(`/recept/${id}/bewerken`);
    await expect(counter(page)).toHaveText(/^\d,\d van 2 MB$/); // sizes loaded: the client now knows a low number
    const filesBefore = (await listRecipeFiles(id)).sort();
    const rowBefore = await adminClient().from('recipes').select('title,photos,note').eq('id', id).single();

    // Behind the client's back the stored file "grows" to exactly the limit.
    await fillTo(id, photos[0].path);

    await titleField(page).fill('Grens nieuw');
    await galleryInput(page).setInputFiles([await jpeg(page)]);
    await expect(photoRemoveButtons(page)).toHaveCount(2);
    await saveButton(page).click();

    await expect(tooLarge(page)).toBeVisible();
    await expect(page.getByText(nl['form.error'], { exact: true })).toHaveCount(0); // not the general failure text
    await expect(titleField(page)).toHaveValue('Grens nieuw');
    await expect(photoRemoveButtons(page)).toHaveCount(2);

    await expect.poll(async () => (await listRecipeFiles(id)).sort()).toEqual(filesBefore);
    await page.goto(`/recept/${id}`);
    await expect(page.getByRole('heading', { name: 'Grens', exact: true })).toBeVisible();
    const rowAfter = await adminClient().from('recipes').select('title,photos,note').eq('id', id).single();
    expect(rowAfter.data).toEqual(rowBefore.data);
  });

  test('a new recipe refused by the database (insert intercepted): message, form kept, the new folder is empty, retry works', async ({ page }) => {
    const title = `Nieuw groot ${Date.now()}`;
    await page.goto('/nieuw');
    await fillRecipe(page, { title, ...base });
    await galleryInput(page).setInputFiles([await jpeg(page, 'a.jpg'), await jpeg(page, 'b.jpg')]);
    await expect(photoRemoveButtons(page)).toHaveCount(2);

    let newId: string | undefined;
    const handler = async (route: import('@playwright/test').Route) => {
      const req = route.request();
      if (req.method() === 'POST' && new URL(req.url()).pathname.endsWith('/rest/v1/recipes')) {
        newId = (req.postDataJSON() as { id?: string }).id;
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ code: '23514', message: 'recipe_too_large', details: 'photos', hint: null }),
        });
        return;
      }
      await route.continue();
    };
    await page.route(supabaseRoutePattern(), handler);

    await saveButton(page).click();
    await expect(tooLarge(page)).toBeVisible();
    await expect(titleField(page)).toHaveValue(title);
    await expect(photoRemoveButtons(page)).toHaveCount(2);
    expect(newId).toBeTruthy();
    await expect.poll(async () => await listRecipeFiles(newId!)).toEqual([]);

    // Clean session: after an adjustment (and without the interception) saving works again.
    await page.unroute(supabaseRoutePattern(), handler);
    await photoRemove(page, 2).click();
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    const savedId = recipeIdFromUrl(page.url());
    const savedPhotos = await photosOf(savedId);
    expect(savedPhotos).toHaveLength(1);
    expect((await listRecipeFiles(savedId)).sort()).toEqual(savedPhotos.map((p) => p.path.split('/')[1]).sort());
    await removeRecipeFiles(newId!);
  });
});

test.describe('extra: layout (R-001, R-016)', () => {
  test('the error message does not make the page scroll sideways at 360 px', async ({ page }) => {
    const { id, photos } = await stored(1);
    await fillTo(id, photos[0].path, 1); // 1 byte over
    await page.goto(`/recept/${id}/bewerken`);
    await expect(counter(page)).toHaveText('2,1 van 2 MB');
    await saveButton(page).click();
    await expect(tooLarge(page)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    expect(await photoGroup(page).count()).toBe(1);
  });
});
