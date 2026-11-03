import { expect, test, type Page } from '@playwright/test';
import { fillRecipe, nl, saveButton, titleField } from '../helpers/recipe-form';
import { signInViaStorage, supabaseRoutePattern } from '../helpers/session';
import {
  adminClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  insertRecipe,
  listRecipeFiles,
  makeAdmin,
  type TestUser,
  uploadTestPhoto,
} from '../helpers/supabase-admin';
import {
  animGif,
  brokenPng,
  cameraButton,
  cameraInput,
  canvasImage,
  downloadPhoto,
  fakeJpg,
  galleryButton,
  galleryInput,
  heicFixture,
  jpegSize,
  noisePng,
  NOT_A_PHOTO,
  photoDown,
  photoError,
  photoGroup,
  photoMain,
  photoRemove,
  photoRemoveButtons,
  photosOf,
  photoUp,
  recipeIdFromUrl,
  TOO_MANY,
  withExifOrientation,
  type UploadFile,
} from '../helpers/photos';

// T-012 / R-005 (interface, 360 x 640, local Supabase). The conversion is the real one, in Chromium.
// Camera hardware cannot be driven: only the `capture` attribute and setInputFiles are checked (crit. 4).
let user: TestUser;
let other: TestUser;
let boss: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('rphoto', { displayName: 'Fien Foto' });
  other = await createTestUser('rphoto2', { displayName: 'Otto Ander' });
  boss = await createTestUser('rphoto3', { displayName: 'Bo Beheer' });
  await makeAdmin(boss.id);
});

test.afterAll(async () => {
  for (const u of [user, other, boss]) if (u) await deleteTestUser(u);
});

test.beforeEach(async ({ page }) => {
  await signInViaStorage(page, user.session);
});

const unique = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const base = { ingredients: ['Zout'], steps: ['Roer.'] };
const item = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title });
const dialog = (page: Page) => page.getByRole('alertdialog');

async function jpeg(page: Page, name = 'photo.jpg', w = 640, h = 480): Promise<UploadFile> {
  return canvasImage(page, name, w, h, 'image/jpeg');
}

async function addToGallery(page: Page, files: UploadFile[]): Promise<void> {
  await galleryInput(page).setInputFiles(files);
}

async function expectCount(page: Page, n: number): Promise<void> {
  await expect(photoRemoveButtons(page)).toHaveCount(n);
  await expect(photoGroup(page).locator('img')).toHaveCount(n);
}

/** Opens /nieuw, fills the form, adds photos, saves and returns the new recipe id. */
async function createWithPhotos(page: Page, title: string, files: UploadFile[]): Promise<string> {
  await page.goto('/nieuw');
  await fillRecipe(page, { title, ...base });
  if (files.length > 0) {
    await addToGallery(page, files);
    await expectCount(page, files.length);
  }
  await saveButton(page).click();
  await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
  return recipeIdFromUrl(page.url());
}

test.describe("crit. 1: at most 3 photos", () => {
  test('3 chosen, then one more: the message shows at the group and 3 previews stay', async ({ page }) => {
    await page.goto('/nieuw');
    await addToGallery(page, [await jpeg(page, 'a.jpg'), await jpeg(page, 'b.jpg'), await jpeg(page, 'c.jpg')]);
    await expectCount(page, 3);
    await addToGallery(page, [await jpeg(page, 'd.jpg')]);
    await expect(photoError(page)).toHaveText(TOO_MANY);
    await expectCount(page, 3);
  });

  test('4 at once (multiple): the first 3 are added and the message shows', async ({ page }) => {
    await page.goto('/nieuw');
    await expect(galleryInput(page)).toHaveAttribute('multiple', '');
    await addToGallery(page, [
      await jpeg(page, 'a.jpg'),
      await jpeg(page, 'b.jpg'),
      await jpeg(page, 'c.jpg'),
      await jpeg(page, 'd.jpg'),
    ]);
    await expectCount(page, 3);
    await expect(photoError(page)).toHaveText(TOO_MANY);
  });

  test('after removing one photo another fits and the message disappears', async ({ page }) => {
    await page.goto('/nieuw');
    await addToGallery(page, [await jpeg(page, 'a.jpg'), await jpeg(page, 'b.jpg'), await jpeg(page, 'c.jpg')]);
    await addToGallery(page, [await jpeg(page, 'd.jpg')]);
    await expect(photoError(page)).toHaveText(TOO_MANY);
    await photoRemove(page, 3).click();
    await addToGallery(page, [await jpeg(page, 'e.jpg')]);
    await expectCount(page, 3);
    await expect(photoError(page)).toHaveCount(0);
  });
});

test.describe('crit. 2: accepted input', () => {
  test('JPEG, PNG and WebP are accepted and show a preview', async ({ page }) => {
    await page.goto('/nieuw');
    await addToGallery(page, [await jpeg(page, 'photo.jpg')]);
    await addToGallery(page, [await canvasImage(page, 'photo.png', 640, 480, 'image/png')]);
    await addToGallery(page, [await canvasImage(page, 'photo.webp', 640, 480, 'image/webp')]);
    await expectCount(page, 3);
    await expect(photoError(page)).toHaveCount(0);
  });

  // Crit. 2: a real HEIC is accepted and decoded (lazy heic-to) into a preview.
  test('HEIC is accepted and decoded', async ({ page }) => {
    await page.goto('/nieuw');
    await addToGallery(page, [heicFixture()]);
    await expectCount(page, 1);
    await expect(photoError(page)).toHaveCount(0);
  });

  for (const [label, make] of [
    ['text named fake.jpg', fakeJpg],
    ['a GIF', animGif],
  ] as const) {
    test(`${label} is refused with the not-a-photo message and adds nothing`, async ({ page }) => {
      await page.goto('/nieuw');
      await addToGallery(page, [make()]);
      await expect(photoError(page)).toHaveText(NOT_A_PHOTO);
      await expectCount(page, 0);
    });
  }

  test('correct magic bytes but broken content gives the same message', async ({ page }) => {
    await page.goto('/nieuw');
    await addToGallery(page, [brokenPng()]);
    await expect(photoError(page)).toHaveText(NOT_A_PHOTO);
    await expectCount(page, 0);
  });
});

test.describe('crit. 3: converted to JPEG <= 1280 px and <= 512.000 bytes before upload', () => {
  async function storedSizes(id: string) {
    const photos = await photosOf(id);
    const out: Array<{ bytes: Uint8Array; size: ReturnType<typeof jpegSize> }> = [];
    for (const p of photos) {
      const bytes = await downloadPhoto(p.path);
      out.push({ bytes, size: jpegSize(bytes) });
    }
    return out;
  }

  test('a 4000 x 3000 JPEG becomes 1280 x 960; a portrait PNG gets longest side 1280; 800 x 600 is not enlarged', async ({ page }) => {
    await page.goto('/nieuw');
    const files = [
      await canvasImage(page, 'large.jpg', 4000, 3000, 'image/jpeg'),
      await canvasImage(page, 'portrait.png', 1500, 2000, 'image/png'),
      await canvasImage(page, 'small.png', 800, 600, 'image/png'),
    ];
    const id = await createWithPhotos(page, unique('Formaten'), files);
    const stored = await storedSizes(id);
    expect(stored).toHaveLength(3);
    for (const s of stored) {
      expect([...s.bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
      expect(s.bytes.length).toBeLessThanOrEqual(512_000);
    }
    expect(stored[0].size).toEqual({ width: 1280, height: 960 });
    expect(stored[1].size).toEqual({ width: 960, height: 1280 });
    expect(stored[2].size).toEqual({ width: 800, height: 600 });
  });

  test('1280 x 1280 incompressible noise still ends up <= 512.000 bytes', async ({ page }) => {
    test.setTimeout(90_000);
    const id = await createWithPhotos(page, unique('Ruis'), [noisePng(1280)]);
    const [only] = await storedSizes(id);
    expect([...only.bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(only.bytes.length).toBeLessThanOrEqual(512_000);
    expect(only.size!.width).toBeLessThanOrEqual(1280);
    expect(only.size!.height).toBeLessThanOrEqual(1280);
  });

  test('EXIF rotation is applied before drawing (orientation 6 turns 400 x 200 into 200 x 400)', async ({ page }) => {
    await page.goto('/nieuw');
    const plain = await jpeg(page, 'exif.jpg', 400, 200);
    const rotated: UploadFile = { ...plain, buffer: withExifOrientation(plain.buffer, 6) };
    const id = await createWithPhotos(page, unique('Exif'), [rotated]);
    const [only] = await storedSizes(id);
    expect(only.size).toEqual({ width: 200, height: 400 });
  });
});

test.describe('crit. 4: gallery or camera', () => {
  test('two buttons >= 44 x 44 px, each with its own input and attributes', async ({ page }) => {
    await page.goto('/nieuw');
    for (const button of [cameraButton(page), galleryButton(page)]) {
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await expect(cameraInput(page)).toHaveCount(1);
    await expect(cameraInput(page)).toHaveAttribute('accept', 'image/*');
    await expect(cameraInput(page)).toHaveAttribute('capture', 'environment');
    await expect(galleryInput(page)).toHaveCount(1);
    await expect(galleryInput(page)).not.toHaveAttribute('capture', /.*/);
    const accept = (await galleryInput(page).getAttribute('accept'))!;
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', '.heic', '.heif']) {
      expect(accept.split(',').map((s) => s.trim())).toContain(t);
    }
  });

  test('setInputFiles on the camera input and on the gallery input each add a photo', async ({ page }) => {
    await page.goto('/nieuw');
    await cameraInput(page).setInputFiles(await jpeg(page, 'camera.jpg'));
    await expectCount(page, 1);
    await galleryInput(page).setInputFiles(await jpeg(page, 'galerij.jpg'));
    await expectCount(page, 2);
  });
});

test.describe('crit. 5: main photo and placeholder', () => {
  test('the first photo is labelled "Hoofdfoto"; after "Maak hoofdfoto" on the second the overview shows that one', async ({ page }) => {
    const title = unique('Hoofd');
    await page.goto('/nieuw');
    await fillRecipe(page, { title, ...base });
    await addToGallery(page, [await jpeg(page, 'een.jpg', 640, 480), await jpeg(page, 'twee.jpg', 320, 240)]);
    await expectCount(page, 2);
    await expect(photoGroup(page).getByText('Hoofdfoto', { exact: true })).toHaveCount(1);
    await expect(photoMain(page, 1)).toHaveAttribute('aria-pressed', 'true');
    await expect(photoMain(page, 2)).toHaveAttribute('aria-pressed', 'false');
    await photoMain(page, 2).click();
    await expect(photoMain(page, 2)).toHaveAttribute('aria-pressed', 'true');
    await expect(photoMain(page, 1)).toHaveAttribute('aria-pressed', 'false');
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    const id = recipeIdFromUrl(page.url());
    const photos = await photosOf(id);
    expect(photos.filter((p) => p.main)).toHaveLength(1);
    const mainPath = photos.find((p) => p.main)!.path;
    expect(mainPath).toBe(photos[1].path);

    await page.goto('/');
    const img = item(page, title).getByTestId('recipe-main-photo');
    await expect(img).toHaveCount(1);
    // The signed URL points at the main photo's path.
    await expect(img).toHaveAttribute('src', new RegExp(mainPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(item(page, title).getByTestId('recipe-photo-placeholder')).toHaveCount(0);
  });

  test('a recipe without photos shows the decorative placeholder in the overview', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Kaal') });
    await page.goto('/');
    const placeholder = item(page, row.title).getByTestId('recipe-photo-placeholder');
    await expect(placeholder).toHaveCount(1);
    await expect(placeholder).toHaveAttribute('aria-hidden', 'true');
    await expect(item(page, row.title).getByTestId('recipe-main-photo')).toHaveCount(0);
  });

  test('the detail page shows all photos in saved order with alt "Foto n van <titel>"', async ({ page }) => {
    const title = unique('Linzensoep');
    const id = await createWithPhotos(page, title, [await jpeg(page, 'a.jpg', 640, 480), await jpeg(page, 'b.jpg', 320, 240)]);
    await page.goto(`/recept/${id}`);
    await expect(page.getByRole('img', { name: `Foto 1 van ${title}` })).toBeVisible();
    await expect(page.getByRole('img', { name: `Foto 2 van ${title}` })).toBeVisible();
    await expect(page.getByRole('img', { name: new RegExp(`^Foto \\d+ van ${title}$`) })).toHaveCount(2);
  });
});

test.describe('crit. 6: remove, reorder, delete with the recipe', () => {
  test('"Foto 2 omhoog" and save: the stored order is reversed', async ({ page }) => {
    const title = unique('Omhoog');
    const id = await createWithPhotos(page, title, [await jpeg(page, 'a.jpg', 640, 480), await jpeg(page, 'b.jpg', 320, 240)]);
    const before = await photosOf(id);
    await page.goto(`/recept/${id}/bewerken`);
    await expectCount(page, 2);
    await photoUp(page, 2).click();
    await saveButton(page).click();
    await expect(page).toHaveURL(new RegExp(`/recept/${id}$`));
    const after = await photosOf(id);
    expect(after.map((p) => p.path)).toEqual([before[1].path, before[0].path]);
    // The main photo did not move with the order.
    expect(after.find((p) => p.main)!.path).toBe(before.find((p) => p.main)!.path);
  });

  test('up is disabled on the first photo and down on the last', async ({ page }) => {
    await page.goto('/nieuw');
    await addToGallery(page, [await jpeg(page, 'a.jpg'), await jpeg(page, 'b.jpg')]);
    await expect(photoUp(page, 1)).toBeDisabled();
    await expect(photoDown(page, 2)).toBeDisabled();
    await expect(photoDown(page, 1)).toBeEnabled();
  });

  test('"Foto 1 verwijderen" and save: one photo left and the file is gone from storage', async ({ page }) => {
    const id = await createWithPhotos(page, unique('Weg'), [await jpeg(page, 'a.jpg', 640, 480), await jpeg(page, 'b.jpg', 320, 240)]);
    const before = await photosOf(id);
    expect(await listRecipeFiles(id)).toHaveLength(2);
    await page.goto(`/recept/${id}/bewerken`);
    await photoRemove(page, 1).click();
    await expectCount(page, 1);
    await saveButton(page).click();
    await expect(page).toHaveURL(new RegExp(`/recept/${id}$`));
    const after = await photosOf(id);
    expect(after.map((p) => p.path)).toEqual([before[1].path]);
    expect(after[0].main).toBe(true);
    await expect.poll(async () => (await listRecipeFiles(id)).length).toBe(1);
  });

  test('removing a photo and then leaving, "Weggooien": the file stays and the recipe is unchanged', async ({ page }) => {
    const id = await createWithPhotos(page, unique('Blijf'), [await jpeg(page, 'a.jpg'), await jpeg(page, 'b.jpg')]);
    const before = await photosOf(id);
    await page.goto(`/recept/${id}/bewerken`);
    await photoRemove(page, 1).click();
    await page.getByRole('navigation', { name: nl['nav.label'] }).getByRole('link', { name: nl['nav.recipes'] }).click();
    await expect(page.getByText(nl['form.discardQuestion'])).toBeVisible();
    // "Blijven" first: the form keeps its state.
    await page.getByRole('button', { name: nl['form.stay'], exact: true }).click();
    await expectCount(page, 1);
    await page.getByRole('navigation', { name: nl['nav.label'] }).getByRole('link', { name: nl['nav.recipes'] }).click();
    await page.getByRole('button', { name: nl['form.discard'], exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(await photosOf(id)).toEqual(before);
    expect(await listRecipeFiles(id)).toHaveLength(2);
  });

  test('adding, removing and reordering a photo each make the form "changed"', async ({ page }) => {
    const id = await createWithPhotos(page, unique('Gewijzigd'), [await jpeg(page, 'a.jpg'), await jpeg(page, 'b.jpg')]);
    const nav = () => page.getByRole('navigation', { name: nl['nav.label'] }).getByRole('link', { name: nl['nav.recipes'] });
    const question = page.getByText(nl['form.discardQuestion']);
    const stay = page.getByRole('button', { name: nl['form.stay'], exact: true });

    const actions: Array<(p: Page) => Promise<void>> = [
      async (p) => addToGallery(p, [await jpeg(p, 'c.jpg')]),
      async (p) => photoRemove(p, 2).click(),
      async (p) => photoDown(p, 1).click(),
    ];
    for (const act of actions) {
      await page.goto(`/recept/${id}/bewerken`);
      await expectCount(page, 2);
      await expect(titleField(page)).not.toHaveValue('');
      await act(page);
      await nav().click();
      await expect(question).toBeVisible();
      await stay.click();
    }
  });

  test('the author deletes a recipe with 3 photos: the folder in the bucket is empty', async ({ page }) => {
    const id = await createWithPhotos(page, unique('Auteur weg'), [await jpeg(page, 'a.jpg'), await jpeg(page, 'b.jpg'), await jpeg(page, 'c.jpg')]);
    expect(await listRecipeFiles(id)).toHaveLength(3);
    await page.getByRole('button', { name: nl['recipe.delete'], exact: true }).click();
    await dialog(page).getByRole('button', { name: nl['recipe.deleteConfirm'], exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(async () => (await listRecipeFiles(id)).length).toBe(0);
    expect((await adminClient().from('recipes').select('id').eq('id', id)).data).toEqual([]);
  });

  test("an administrator deletes someone else's recipe with photos: the folder is empty too", async ({ page }) => {
    // Rows and files made with the clients, so only the admin's delete is under test.
    const row = await insertRecipe(other.client, { title: unique('Ander weg') });
    const up = await uploadTestPhoto(other.client, row.id);
    expect(up.error).toBeNull();
    const upd = await other.client.from('recipes').update({ photos: [{ path: up.path, main: true }] }).eq('id', row.id);
    expect(upd.error).toBeNull();
    expect(await listRecipeFiles(row.id)).toHaveLength(1);

    const adminPage = page;
    await adminPage.addInitScript(() => window.localStorage.clear());
    await signInViaStorage(adminPage, boss.session);
    await adminPage.goto(`/recept/${row.id}`);
    await adminPage.getByRole('button', { name: nl['recipe.delete'], exact: true }).click();
    await dialog(adminPage).getByRole('button', { name: nl['recipe.deleteConfirm'], exact: true }).click();
    await expect(adminPage).toHaveURL(/\/$/);
    await expect.poll(async () => (await listRecipeFiles(row.id)).length).toBe(0);
  });
});

test.describe('crit. 7: not visible after signing out', () => {
  test('after sign-out no photo URL is left in the DOM', async ({ page }) => {
    const title = unique('Afmelden');
    const id = await createWithPhotos(page, title, [await jpeg(page, 'a.jpg')]);
    await page.goto('/');
    await expect(item(page, title).getByTestId('recipe-main-photo')).toHaveCount(1);
    // Signing out: the screen is needed for it (R-002); drop the session the way the app does on sign-out.
    await page.getByRole('link', { name: nl['nav.profile'] }).click();
    await page.getByRole('button', { name: nl['profile.signOut'], exact: true }).click();
    await expect(page).toHaveURL(/\/aanmelden/);
    await expect(page.locator('img[src*="recipe-photos"]')).toHaveCount(0);
    await expect(page.locator('img[src*="/storage/v1/"]')).toHaveCount(0);
    expect(id).toBeTruthy();
  });
});

test.describe('extra: layout and robustness (R-001, R-016)', () => {
  test('form with 3 photos: no horizontal scroll and all photo buttons >= 44 x 44 px', async ({ page }) => {
    await page.goto('/nieuw');
    await addToGallery(page, [await jpeg(page, 'a.jpg'), await jpeg(page, 'b.jpg'), await jpeg(page, 'c.jpg')]);
    await expectCount(page, 3);
    const buttons = photoGroup(page).getByRole('button');
    const n = await buttons.count();
    for (let i = 0; i < n; i++) {
      const button = buttons.nth(i);
      if (!(await button.isVisible())) continue;
      const box = (await button.boundingBox())!;
      expect(box.width, await button.innerText()).toBeGreaterThanOrEqual(44);
      expect(box.height, await button.innerText()).toBeGreaterThanOrEqual(44);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test('overview and detail page with photos do not scroll horizontally at 360 px', async ({ page }) => {
    const id = await createWithPhotos(page, unique('Breed'), [await jpeg(page, 'a.jpg', 1200, 400), await jpeg(page, 'b.jpg', 1200, 400), await jpeg(page, 'c.jpg')]);
    for (const path of [`/recept/${id}`, '/']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, path).toBe(false);
    }
  });

  test('a connection error while saving shows the banner and keeps the form and the chosen photos', async ({ page }) => {
    const title = unique('Offline');
    await page.goto('/nieuw');
    await fillRecipe(page, { title, ...base });
    await addToGallery(page, [await jpeg(page, 'a.jpg'), await jpeg(page, 'b.jpg')]);
    await expectCount(page, 2);
    await page.route(supabaseRoutePattern(), (r) => r.abort());
    await saveButton(page).click();
    await expect(page.getByText(nl['connection.error'])).toBeVisible();
    await expect(titleField(page)).toHaveValue(title);
    await expectCount(page, 2);
  });

  // Review finding 1: the server stores the row but the answer is lost (common on a phone).
  // "Try again" must succeed and the uploaded files must still exist (no cleanup, no duplicate-key loop).
  test('the insert is stored but its answer is lost: "try again" succeeds and the files remain', async ({ page }) => {
    const title = unique('Antwoord weg');
    await page.goto('/nieuw');
    await fillRecipe(page, { title, ...base });
    await addToGallery(page, [await jpeg(page, 'a.jpg'), await jpeg(page, 'b.jpg')]);
    await expectCount(page, 2);

    let dropped = false;
    await page.route(supabaseRoutePattern(), async (route) => {
      const req = route.request();
      if (!dropped && req.method() === 'POST' && new URL(req.url()).pathname.endsWith('/rest/v1/recipes')) {
        dropped = true;
        await route.fetch(); // the server processes the insert...
        await route.abort('connectionreset'); // ...but the answer never arrives
        return;
      }
      await route.continue();
    });

    await saveButton(page).click();
    await expect(page.getByText(nl['connection.error'])).toBeVisible();
    expect(dropped).toBe(true);

    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    const id = recipeIdFromUrl(page.url());
    expect(await photosOf(id)).toHaveLength(2);
    expect(await listRecipeFiles(id)).toHaveLength(2);
    await expect(page.getByRole('img', { name: `Foto 1 van ${title}` })).toBeVisible();
    await expect(page.getByRole('img', { name: `Foto 2 van ${title}` })).toBeVisible();
  });
});
