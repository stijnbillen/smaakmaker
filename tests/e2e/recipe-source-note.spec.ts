import { expect, test, type Page } from '@playwright/test';
import { fillRecipe, isRecipePost, nl, noteField, saveButton, sourceField } from '../helpers/recipe-form';
import { signInViaStorage } from '../helpers/session';
import { adminClient, assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, type TestUser } from '../helpers/supabase-admin';

// T-008 / R-015: source and note on form and detail page. Local Supabase, viewport 360 x 640.
let user: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('rsrc', { displayName: 'Bea Bron' });
});

test.afterAll(async () => {
  if (user) await deleteTestUser(user);
});

test.beforeEach(async ({ page }) => {
  await signInViaStorage(page, user.session);
});

const unique = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const base = { ingredients: ['Zout'], steps: ['Roer.'] };

const sourceBox = (page: Page) => page.getByTestId('recipe-source');
const noteBox = (page: Page) => page.getByTestId('recipe-note');

async function messageOf(page: Page, field: ReturnType<typeof sourceField>): Promise<string> {
  const describedBy = await field.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  return page.evaluate(
    (ids) => ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '),
    describedBy!,
  );
}

test.describe('crit. 1: form fields', () => {
  for (const [label, key, length, message] of [
    ['source', 'source', 201, 'form.sourceTooLong'],
    ['note', 'note', 1001, 'form.noteTooLong'],
  ] as const) {
    test(`${length} characters in ${label} is refused at the field, without POST`, async ({ page }) => {
      const posts: string[] = [];
      page.on('request', (r) => {
        if (isRecipePost(r)) posts.push(r.url());
      });
      await page.goto('/nieuw');
      await fillRecipe(page, { title: unique('Te lang'), ...base, [key]: 'x'.repeat(length) });
      const field = key === 'source' ? sourceField(page) : noteField(page);
      // No maxlength, otherwise a pasted text is cut silently and the message never shows.
      await expect(field).not.toHaveAttribute('maxlength', /.*/);
      await saveButton(page).click();
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(await messageOf(page, field)).toContain(nl[message]);
      expect(posts).toEqual([]);
    });
  }

  test('200 characters source and 1000 characters note can be saved', async ({ page }) => {
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Op de grens'), ...base, source: 'x'.repeat(200), note: 'y'.repeat(1000) });
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
  });

  test('leaving both empty can be saved', async ({ page }) => {
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Zonder bron'), ...base });
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    await expect(sourceBox(page)).toHaveCount(0);
    await expect(noteBox(page)).toHaveCount(0);
  });

  test('edit shows stored values; changing one and leaving asks to discard', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Bewerk bron'), source: 'Oma', note: 'Met liefde' });
    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(sourceField(page)).toHaveValue('Oma');
    await expect(noteField(page)).toHaveValue('Met liefde');
    await noteField(page).fill('Anders');
    await page
      .getByRole('navigation', { name: nl['nav.label'] })
      .getByRole('link', { name: nl['nav.recipes'] })
      .click();
    await expect(page.getByText(nl['form.discardQuestion'])).toBeVisible();
  });

  test('saved values reach the database trimmed', async ({ page }) => {
    await page.goto('/nieuw');
    const title = unique('Getrimd');
    await fillRecipe(page, { title, ...base, source: '  Oma  ', note: '   ' });
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    const check = await adminClient().from('recipes').select('source,note').eq('title', title).single();
    expect(check.data).toEqual({ source: 'Oma', note: null });
  });
});

test.describe('crit. 2: empty fields are not shown', () => {
  test('a recipe without source and note shows neither label, heading nor element', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Leeg') });
    await page.goto(`/recept/${row.id}`);
    await expect(page.getByRole('heading', { level: 1, name: row.title })).toBeVisible();
    await expect(page.getByText(nl['recipe.source'], { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: nl['recipe.note'], exact: true })).toHaveCount(0);
    await expect(sourceBox(page)).toHaveCount(0);
    await expect(noteBox(page)).toHaveCount(0);
  });

  test('only a note: note shown, no source', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Alleen opmerking'), note: 'Pas op, heet.' });
    await page.goto(`/recept/${row.id}`);
    await expect(noteBox(page)).toContainText('Pas op, heet.');
    await expect(page.getByRole('heading', { name: nl['recipe.note'], exact: true })).toBeVisible();
    await expect(sourceBox(page)).toHaveCount(0);
    await expect(page.getByText(nl['recipe.source'], { exact: true })).toHaveCount(0);
  });

  test('only a source: source shown, no note', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Alleen bron'), source: 'Oma' });
    await page.goto(`/recept/${row.id}`);
    await expect(sourceBox(page)).toContainText('Oma');
    await expect(noteBox(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: nl['recipe.note'], exact: true })).toHaveCount(0);
  });

  test('a row with null source and note gives no error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const row = await insertRecipe(user.client, { title: unique('Null'), source: null, note: null });
    await page.goto(`/recept/${row.id}`);
    await expect(page.getByRole('heading', { level: 1, name: row.title })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('crit. 3: link or plain text', () => {
  test('an https source is a link that opens a new tab safely', async ({ page, context }) => {
    const url = 'https://example.com/soep';
    // No external request may leave the machine.
    await context.route('https://example.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
    const row = await insertRecipe(user.client, { title: unique('Link'), source: url });
    await page.goto(`/recept/${row.id}`);
    const link = sourceBox(page).locator('a');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('href', url);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toContainText(url);
    const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
    await popup.waitForLoadState();
    expect(popup.url()).toBe(url);
  });

  test('an http source is a link too', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Http'), source: 'http://example.com' });
    await page.goto(`/recept/${row.id}`);
    await expect(sourceBox(page).locator('a')).toHaveAttribute('href', 'http://example.com');
  });

  for (const source of ['Oma', 'javascript:alert(1)', 'www.example.com', 'mijn https://x.be']) {
    test(`"${source}" is plain text, no anchor`, async ({ page }) => {
      const row = await insertRecipe(user.client, { title: unique('Tekst'), source });
      await page.goto(`/recept/${row.id}`);
      await expect(sourceBox(page)).toContainText(source);
      await expect(sourceBox(page).locator('a')).toHaveCount(0);
    });
  }

  test('a 200 character URL fits in 360 px and the link is a 44 px tap target', async ({ page }) => {
    const url = `https://example.com/${'a'.repeat(180)}`.slice(0, 200);
    const row = await insertRecipe(user.client, { title: unique('Lange link'), source: url });
    await page.goto(`/recept/${row.id}`);
    const link = sourceBox(page).locator('a');
    await expect(link).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  });
});

test.describe('note is plain text (R-001, R-003, R-016)', () => {
  test('line breaks are kept and HTML is shown literally', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Regels'), note: 'Eerste regel\nTweede <b>vet</b> regel' });
    await page.goto(`/recept/${row.id}`);
    await expect(noteBox(page)).toContainText('<b>vet</b>');
    await expect(noteBox(page).locator('b')).toHaveCount(0);
    expect(await noteBox(page).evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('pre-line');
    const lines = await noteBox(page).evaluate((el) => (el as HTMLElement).innerText);
    expect(lines).toContain('Eerste regel\nTweede');
  });
});
