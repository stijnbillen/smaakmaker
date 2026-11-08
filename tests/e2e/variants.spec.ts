import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { ingredientNameFields, nl, noteField, prepField, saveButton, servingsField, sourceField, stepFields, tagGroup, titleField, totalField } from '../helpers/recipe-form';
import { signInViaStorage } from '../helpers/session';
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
  removeRecipeFiles,
  setPhotoSize,
  uploadTestPhoto,
  validRecipe,
  type TestUser,
} from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';
import { photoGroup, photoRemoveButtons, photosOf, recipeIdFromUrl } from '../helpers/photos';
import { autoOpenFilters } from '../helpers/overview';

// T-029: filters sit behind the "Filters" button; open them after every visit of `/` or `/favorieten`.
test.beforeEach(({ page }) => autoOpenFilters(page));

// T-014 / R-006 (interface, 360 x 640, local Supabase). Recipes are made through the API (PostgREST + Storage),
// the app is only used for the screens under test.
const LIMIT = 2_097_152;
const RUN = Date.now();
let a: TestUser;
let b: TestUser;
let boss: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  a = await createTestUser('evara', { displayName: 'Anna Auteur' });
  b = await createTestUser('evarb', { displayName: 'Bea Bakker' });
  boss = await createTestUser('evarboss', { displayName: 'Bas Beheer' });
  await makeAdmin(boss.id);
});

test.afterAll(async () => {
  for (const u of [a, b, boss]) if (u) await deleteTestUser(u);
});

const as = async (page: Page, user: TestUser) => signInViaStorage(page, user.session);

const counter = (page: Page) => page.getByTestId('recipe-size');
const tooLarge = (page: Page) => page.getByRole('alert').filter({ hasText: nl['size.photosTooLarge'] });
const makeLink = (page: Page) => page.getByRole('link', { name: nl['variant.make'], exact: true });
const discardQuestion = (page: Page) => page.getByText(nl['form.discardQuestion']);
const discard = (page: Page) => page.getByRole('button', { name: nl['form.discard'], exact: true });

/** A recipe of `user` with `n` real test photos and, when asked, tags and equipment. */
async function stored(user: TestUser, n: number, fields: Record<string, unknown> = {}) {
  const id = randomUUID();
  const photos: { path: string; main: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const up = await uploadTestPhoto(user.client, id);
    expect(up.error).toBeNull();
    photos.push({ path: up.path, main: i === n - 1 }); // main = last, so order and main differ
  }
  const res = await user.client.from('recipes').insert(validRecipe({ id, title: `Bron ${RUN}-${id.slice(0, 4)}`, photos, ...fields })).select('id');
  expect(res.error).toBeNull();
  return { id, photos, title: (fields.title as string | undefined) ?? `Bron ${RUN}-${id.slice(0, 4)}` };
}

async function textBytes(id: string): Promise<number> {
  const rows = await sql<{ n: string }>(`select public.recipe_text_bytes(r)::text as n from public.recipes r where r.id = '${id}'`);
  return Number(rows[0].n);
}
const recipeCount = async (): Promise<number> =>
  Number((await sql<{ n: string }>('select count(*)::text as n from public.recipes'))[0].n);
const fileCount = async (): Promise<number> =>
  Number((await sql<{ n: string }>("select count(*)::text as n from storage.objects where bucket_id = 'recipe-photos'"))[0].n);

function watchWrites(page: Page): () => number {
  let n = 0;
  page.on('request', (r) => {
    if (['POST', 'PATCH', 'PUT'].includes(r.method()) && new URL(r.url()).pathname.endsWith('/rest/v1/recipes')) n++;
  });
  return () => n;
}

test.describe('crit. 1 and 4: the button and the copied form', () => {
  test('B opens the variant form of a recipe of A: all fields and 2 photos are filled; saving gives B as author and own files', async ({ page }) => {
    const src = await stored(a, 2, {
      title: `Soep ${RUN}`,
      ingredients: [{ name: 'Feta', quantity: 200, unit: 'g' }, { name: 'Water' }],
      steps: ['Kook.', 'Meng.'],
      prep_minutes: 15,
      total_minutes: 45,
      servings: 6,
      source: 'Oma',
      note: 'Met brood',
      equipment: ['Pan'],
      dish_tags: ['soep', 'tapas'], // dish start tags only: a trait name here would pollute the dish group
      trait_tags: ['snel', 'winter'],
    });
    await as(page, b);
    await page.goto(`/recept/${src.id}`);
    await expect(makeLink(page)).toBeVisible();
    await makeLink(page).click();
    await expect(page).toHaveURL(new RegExp(`/recept/${src.id}/variant$`));

    await expect(page.getByRole('heading', { name: nl['variant.formTitle'] })).toBeVisible();
    await expect(titleField(page)).toHaveValue(`Soep ${RUN}`);
    await expect(ingredientNameFields(page)).toHaveCount(2);
    await expect(ingredientNameFields(page).nth(0)).toHaveValue('Feta');
    await expect(stepFields(page).nth(1)).toHaveValue('Meng.');
    await expect(prepField(page)).toHaveValue('15');
    await expect(totalField(page)).toHaveValue('45');
    await expect(servingsField(page)).toHaveValue('6');
    await expect(sourceField(page)).toHaveValue('Oma');
    await expect(noteField(page)).toHaveValue('Met brood');
    // The shared tag catalogue may hold the same tag with other casing from other runs: match case-insensitively.
    const tagByName = (kind: 'dish' | 'trait', name: string) =>
      tagGroup(page, kind).getByRole('button', { name: new RegExp(`^${name}$`, 'i') });
    for (const name of ['soep', 'tapas']) await expect(tagByName('dish', name)).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['snel', 'winter']) await expect(tagByName('trait', name)).toHaveAttribute('aria-pressed', 'true');
    await expect(photoRemoveButtons(page)).toHaveCount(2);

    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    const newId = recipeIdFromUrl(page.url());
    expect(newId).not.toBe(src.id);
    await expect(page.getByText('Bea Bakker').first()).toBeVisible();

    const saved = await adminClient().from('recipes').select('author_id,variant_of,photos').eq('id', newId).single();
    expect(saved.data?.author_id).toBe(b.id);
    expect(saved.data?.variant_of).toBe(src.id);
    const copies = await photosOf(newId);
    expect(copies).toHaveLength(2);
    for (const p of copies) expect(p.path.startsWith(`${newId}/`)).toBe(true);
    expect(copies.map((p) => p.main)).toEqual(src.photos.map((p) => p.main)); // same order, same main photo
    expect((await listRecipeFiles(src.id)).length).toBe(2); // the source files are untouched
  });

  test('the button is there for the author and for an administrator too', async ({ page, browser }) => {
    const src = await stored(a, 0);
    await as(page, a);
    await page.goto(`/recept/${src.id}`);
    await expect(makeLink(page)).toBeVisible();

    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
    const adminPage = await ctx.newPage();
    await as(adminPage, boss);
    await adminPage.goto(`/recept/${src.id}`);
    await expect(makeLink(adminPage)).toBeVisible();
    await ctx.close();
  });
});

test.describe('crit. 2: cancelling leaves nothing behind', () => {
  test('a changed variant form left through "Weggooien" leaves no recipe and no files', async ({ page }) => {
    const src = await stored(a, 2);
    await as(page, b);
    const recipesBefore = await recipeCount();
    const filesBefore = await fileCount();
    await page.goto(`/recept/${src.id}`);
    await makeLink(page).click(); // in-app navigation, so the back button is a router step
    await expect(photoRemoveButtons(page)).toHaveCount(2);
    await titleField(page).fill(`Anders ${RUN}`);
    await page.goBack();
    await expect(discardQuestion(page)).toBeVisible();
    await discard(page).click();
    await expect(page).not.toHaveURL(/\/variant$/);
    expect(await recipeCount()).toBe(recipesBefore);
    expect(await fileCount()).toBe(filesBefore);
  });

  test('opening and leaving at once asks nothing (the copy is the starting value)', async ({ page }) => {
    const src = await stored(a, 1);
    await as(page, b);
    const filesBefore = await fileCount();
    await page.goto(`/recept/${src.id}`);
    await makeLink(page).click();
    await expect(photoRemoveButtons(page)).toHaveCount(1);
    await page.goBack();
    await expect(discardQuestion(page)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/recept/${src.id}$`));
    expect(await fileCount()).toBe(filesBefore);
  });
});

test.describe('crit. 3: copied photos count towards the limit', () => {
  test('the counter of the variant form equals the counter of the edit page of the source', async ({ page }) => {
    const src = await stored(a, 2);
    for (const p of src.photos) await setPhotoSize(p.path, 524_288);
    await as(page, a);
    await page.goto(`/recept/${src.id}/bewerken`);
    await expect(counter(page)).toHaveText(/^\d,\d van 2 MB$/);
    const edit = await counter(page).textContent();
    await page.goto(`/recept/${src.id}/variant`);
    await expect(counter(page)).toHaveText(edit!);
    expect(edit).toBe('1,1 van 2 MB');
  });

  test('the database refuses (size grew behind the back of the client): message, filled form, no recipe, empty new folder', async ({ page }) => {
    const src = await stored(a, 1, { title: 'Grens' });
    await as(page, b);
    await page.goto(`/recept/${src.id}/variant`);
    await expect(counter(page)).toHaveText(/^\d,\d van 2 MB$/); // sizes loaded: the client knows a low number
    // Behind the client's back the source file grows to exactly the limit (the copy takes the size along).
    await setPhotoSize(src.photos[0].path, LIMIT - (await textBytes(src.id)));
    let newId: string | undefined;
    await page.route('**/rest/v1/recipes*', async (route) => {
      const req = route.request();
      if (req.method() === 'POST') newId = (req.postDataJSON() as { id?: string }).id;
      await route.continue();
    });
    const recipesBefore = await recipeCount();
    await titleField(page).fill('Grensx');
    await saveButton(page).click();
    await expect(tooLarge(page)).toBeVisible();
    await expect(titleField(page)).toHaveValue('Grensx');
    expect(await recipeCount()).toBe(recipesBefore);
    expect(newId).toBeTruthy();
    await expect.poll(async () => await listRecipeFiles(newId!)).toEqual([]);
  });

  test('the client refuses before copying when the source is already over the limit after one extra character', async ({ page }) => {
    const src = await stored(a, 1, { title: 'Grens' });
    await setPhotoSize(src.photos[0].path, LIMIT - (await textBytes(src.id)));
    await as(page, b);
    const writes = watchWrites(page);
    const filesBefore = await fileCount();
    await page.goto(`/recept/${src.id}/variant`);
    await expect(counter(page)).toHaveText('2,0 van 2 MB');
    await titleField(page).fill('Grensx');
    await saveButton(page).click();
    await expect(tooLarge(page)).toBeVisible();
    expect(writes()).toBe(0);
    expect(await fileCount()).toBe(filesBefore);
  });
});

test.describe('crit. 5, 6, 7, 9 and 11: source line, lists, family and label', () => {
  // A -> B -> C and A -> D, created in this order so "oldest first" is testable.
  let A: { id: string; title: string };
  let B: { id: string; title: string };
  let C: { id: string; title: string };
  let D: { id: string; title: string };
  let alone: { id: string; title: string };

  test.beforeAll(async () => {
    const mk = async (user: TestUser, source: string | null, label: string) => {
      const title = `${label} ${RUN}`;
      const row = source ? await insertVariant(user.client, source, { title }) : await insertRecipe(user.client, { title });
      return { id: row.id, title };
    };
    A = await mk(a, null, 'Famwortel');
    B = await mk(b, A.id, 'Famkind');
    C = await mk(a, B.id, 'Famkleinkind');
    D = await mk(boss, A.id, 'Famtweede');
    alone = await mk(a, null, 'Famalleen');
  });

  const sourceLine = (page: Page) => page.getByText(nl['variant.of']);
  const variantsHeading = (page: Page) => page.getByRole('heading', { name: nl['variant.list'], exact: true });
  const familySummary = (page: Page, n: number) => page.getByText(nl['variant.family'].replace('{n}', String(n)), { exact: true });

  test('a variant shows "Variant van:" above the title with a link to the source; a non-variant shows no such line', async ({ page }) => {
    await as(page, a);
    await page.goto(`/recept/${B.id}`);
    await expect(sourceLine(page)).toBeVisible();
    const link = page.getByRole('link', { name: A.title, exact: true });
    await expect(link).toHaveAttribute('href', `/recept/${A.id}`);
    const lineBox = (await sourceLine(page).boundingBox())!;
    const titleBox = (await page.getByRole('heading', { name: B.title, level: 1 }).boundingBox())!;
    expect(lineBox.y).toBeLessThan(titleBox.y);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/recept/${A.id}$`));
    await expect(sourceLine(page)).toHaveCount(0);
  });

  test('the link follows a rename of the source', async ({ page }) => {
    const src = await insertRecipe(a.client, { title: `Oud ${RUN}` });
    const v = await insertVariant(b.client, src.id, { title: `Naam ${RUN}` });
    await a.client.from('recipes').update({ title: `Nieuw ${RUN}` }).eq('id', src.id);
    await as(page, b);
    await page.goto(`/recept/${v.id}`);
    await expect(page.getByRole('link', { name: `Nieuw ${RUN}`, exact: true })).toBeVisible();
  });

  test('A lists only its direct variants (B and D, oldest first, with author); B lists C; C has no list', async ({ page }) => {
    await as(page, a);
    await page.goto(`/recept/${A.id}`);
    await expect(variantsHeading(page)).toBeVisible();
    const section = page.locator('section, div').filter({ has: variantsHeading(page) }).last();
    await expect(section.getByRole('link', { name: B.title })).toBeVisible();
    await expect(section.getByRole('link', { name: D.title })).toBeVisible();
    await expect(section.getByRole('link', { name: C.title })).toHaveCount(0);
    await expect(section.getByText('Bea Bakker')).toBeVisible();
    await expect(section.getByText('Bas Beheer')).toBeVisible();
    const html = await section.innerText();
    expect(html.indexOf(B.title)).toBeLessThan(html.indexOf(D.title));

    await page.goto(`/recept/${B.id}`);
    await expect(sourceLine(page)).toBeVisible();
    await expect(variantsHeading(page)).toBeVisible();
    await expect(page.getByRole('link', { name: C.title })).toBeVisible();

    await page.goto(`/recept/${C.id}`);
    await expect(sourceLine(page)).toBeVisible();
    await expect(variantsHeading(page)).toHaveCount(0);
  });

  test('every member shows "Alle varianten (4)"; opened it lists all four, oldest first, the shown one as "(dit recept)" without link', async ({ page }) => {
    await as(page, a);
    for (const current of [A, B, C, D]) {
      await page.goto(`/recept/${current.id}`);
      await expect(familySummary(page, 4)).toBeVisible();
      await familySummary(page, 4).click();
      const details = page.locator('details').filter({ has: familySummary(page, 4) });
      const text = await details.innerText();
      const order = [A, B, C, D].map((r) => text.indexOf(r.title));
      expect(order.every((i) => i >= 0)).toBe(true);
      expect([...order].sort((x, y) => x - y)).toEqual(order);
      await expect(details.getByText(nl['variant.current'])).toHaveCount(1);
      await expect(details.getByRole('link', { name: current.title })).toHaveCount(0);
      await expect(details.getByRole('link')).toHaveCount(3);
    }
  });

  test('the family summary is a tap target of at least 44 px', async ({ page }) => {
    await as(page, a);
    await page.goto(`/recept/${A.id}`);
    const box = (await page.locator('summary').filter({ hasText: 'Alle varianten' }).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('a recipe without source and variants shows neither "Varianten" nor "Alle varianten"', async ({ page }) => {
    await as(page, a);
    await page.goto(`/recept/${alone.id}`);
    await expect(page.getByRole('heading', { name: alone.title, level: 1 })).toBeVisible();
    await expect(variantsHeading(page)).toHaveCount(0);
    await expect(page.getByText(/^Alle varianten/)).toHaveCount(0);
    await expect(sourceLine(page)).toHaveCount(0);
  });

  test('the overview labels B, C and D with "Variant" and A not; the label is text within 360 px and no tap target', async ({ page }) => {
    await as(page, a);
    await page.goto('/');
    const item = (r: { title: string }) => page.getByRole('listitem').filter({ hasText: r.title });
    for (const r of [B, C, D]) {
      await expect(item(r).getByTestId('variant-label')).toHaveText(nl['variant.label']);
    }
    await expect(item(A).getByTestId('variant-label')).toHaveCount(0);
    const label = item(B).getByTestId('variant-label');
    const box = (await label.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(await label.evaluate((e) => e.closest('a,button') === e || e.tagName === 'A' || e.tagName === 'BUTTON')).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });

  test('after the source is deleted: "Variant van een verwijderd recept" without link, family keeps the others, label stays', async ({ page }) => {
    const root = await insertRecipe(a.client, { title: `Weg ${RUN}` });
    const kid = await insertVariant(b.client, root.id, { title: `Kind ${RUN}` });
    const grandkid = await insertVariant(a.client, kid.id, { title: `Kleinkind ${RUN}` });
    const sibling = await insertVariant(boss.client, root.id, { title: `Broer ${RUN}` });
    await adminClient().from('recipes').delete().eq('id', root.id);

    await as(page, b);
    await page.goto(`/recept/${kid.id}`);
    await expect(page.getByText(nl['variant.ofDeleted'], { exact: true })).toBeVisible();
    await expect(page.getByText(nl['variant.of'], { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: `Weg ${RUN}` })).toHaveCount(0);
    await expect(familySummary(page, 3)).toBeVisible();
    await familySummary(page, 3).click();
    const details = page.locator('details').filter({ has: familySummary(page, 3) });
    for (const r of [kid, grandkid, sibling]) await expect(details.getByText(r.title, { exact: true })).toBeVisible();

    await page.goto('/');
    await expect(page.getByRole('listitem').filter({ hasText: new RegExp(`Kind ${RUN}`) }).getByTestId('variant-label')).toBeVisible();
  });

  test('a variant keeps its photos after the source (and its files) are deleted', async ({ page }) => {
    const src = await stored(a, 1);
    const id = randomUUID();
    const photos = await copyPhotos(b.client, src.photos, id);
    const ins = await b.client.from('recipes').insert(validRecipe({ id, title: `Eigen foto ${RUN}`, photos, variant_of: src.id }));
    expect(ins.error).toBeNull();
    await a.client.from('recipes').delete().eq('id', src.id);
    await removeRecipeFiles(src.id);
    await as(page, b);
    await page.goto(`/recept/${id}`);
    const img = page.getByTestId('recipe-photos').locator('img').first();
    await expect(img).toBeVisible();
    // Fixture bytes are not a decodable image: check the file is still served (200), not that it decodes.
    const srcUrl = (await img.getAttribute('src'))!;
    const res = await page.request.get(new URL(srcUrl, page.url()).toString());
    expect(res.status()).toBe(200);
  });
});

test.describe('extra: source disappears while the form is open, and connection errors', () => {
  test('saving after the source was deleted shows "Het bronrecept is intussen verwijderd...", keeps the form and leaves no files', async ({ page }) => {
    const src = await stored(a, 1);
    await as(page, b);
    await page.goto(`/recept/${src.id}/variant`);
    await expect(photoRemoveButtons(page)).toHaveCount(1);
    await titleField(page).fill(`Zonder bron ${RUN}`);
    let newId: string | undefined;
    await page.route('**/rest/v1/recipes*', async (route) => {
      if (route.request().method() === 'POST') newId = (route.request().postDataJSON() as { id?: string }).id;
      await route.continue();
    });
    await a.client.from('recipes').delete().eq('id', src.id); // files stay, so only the foreign key refuses
    await saveButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: nl['variant.sourceGone'] })).toBeVisible();
    await expect(titleField(page)).toHaveValue(`Zonder bron ${RUN}`);
    // Unconditional (crit. 2: nothing left behind): the row insert must have been attempted, and its folder must be empty.
    await expect.poll(() => newId).toBeDefined();
    await expect.poll(async () => await listRecipeFiles(newId!)).toEqual([]);
  });

  test('source deleted the way the app does (row and files) with 2 photos: shows sourceGone, keeps the form, leaves no files', async ({ page }) => {
    const src = await stored(a, 2);
    await as(page, b);
    await page.goto(`/recept/${src.id}/variant`);
    await expect(photoRemoveButtons(page)).toHaveCount(2);
    await titleField(page).fill(`Zonder bron en foto ${RUN}`);
    const copyTargets: string[] = [];
    await page.route('**/storage/v1/object/copy', async (route) => {
      const body = route.request().postDataJSON() as { destinationKey?: string };
      if (body?.destinationKey) copyTargets.push(body.destinationKey.split('/')[0]);
      await route.continue();
    });
    const writes = watchWrites(page);
    // Same as deleteRecipe: the row and the files of the source go.
    await a.client.from('recipes').delete().eq('id', src.id);
    await removeRecipeFiles(src.id);
    await saveButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: nl['variant.sourceGone'] })).toBeVisible();
    await expect(titleField(page)).toHaveValue(`Zonder bron en foto ${RUN}`);
    expect(writes()).toBe(0);
    // The copy was attempted (files were gone), and nothing was left in any new folder.
    expect(copyTargets.length).toBeGreaterThan(0);
    for (const folder of new Set(copyTargets)) expect(await listRecipeFiles(folder)).toEqual([]);
  });

  test('an unreachable source shows the connection banner and the page stays usable', async ({ page }) => {
    const src = await stored(a, 0);
    await as(page, b);
    await page.route('**/rest/v1/recipes*', (r) => r.abort());
    await page.goto(`/recept/${src.id}/variant`);
    await expect(page.getByText(nl['connection.error'])).toBeVisible();
  });

  test('an unknown source shows "Recept niet gevonden."', async ({ page }) => {
    await as(page, b);
    await page.goto(`/recept/${randomUUID()}/variant`);
    await expect(page.getByText(nl['recipe.notFound'])).toBeVisible();
  });
});

test('the variant form fits 360 px without sideways scroll', async ({ page }) => {
  const src = await stored(a, 2);
  await as(page, b);
  await page.goto(`/recept/${src.id}/variant`);
  await expect(photoGroup(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
