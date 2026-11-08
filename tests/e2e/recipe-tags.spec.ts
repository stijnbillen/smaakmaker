import { expect, test, type Page } from '@playwright/test';
import { autoOpenFilters } from '../helpers/overview';
import {
  addTagButton,
  fillRecipe,
  isRecipePost,
  newTagField,
  nl,
  saveButton,
  tagButton,
  tagGroup,
  titleField,
} from '../helpers/recipe-form';
import { sql } from '../helpers/pg';
import { signInViaStorage } from '../helpers/session';
import { assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, type TestUser } from '../helpers/supabase-admin';

// T-010 / R-010: dish tags in the form, on the detail page and as an overview filter. Local Supabase, viewport 360 x 640.
let user: TestUser;
let other: TestUser;

// Letters-only suffixes of this run; afterAll removes the catalogue rows they created
// (nobody can delete tags through the API, so this goes through direct SQL).
const usedSuffixes: string[] = [];

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('rtag', { displayName: 'Tess Tag' });
  other = await createTestUser('rtag2', { displayName: 'Olaf Ander' });
});

test.afterAll(async () => {
  for (const u of [user, other]) if (u) await deleteTestUser(u);
  for (const s of usedSuffixes) {
    if (/^[a-z]+$/.test(s)) await sql(`delete from public.tags where kind = 'dish' and name_key like '%${s}%'`);
  }
});

test.beforeEach(async ({ page }) => {
  autoOpenFilters(page); // T-029: filters sit behind the "Filters" button
  await signInViaStorage(page, user.session);
});

const unique = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const letters = () => {
  const s = Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6) || 'abc';
  usedSuffixes.push(s);
  return s;
};
const base = { ingredients: ['Zout'], steps: ['Roer.'] };
const START_LIST = ['dessert', 'soep', 'bijgerecht', 'tapas', 'hoofdgerecht', 'ontbijt', 'snack', 'saus'];
const item = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title });
const leaveForOverview = (page: Page) =>
  page.getByRole('navigation', { name: nl['nav.label'] }).getByRole('link', { name: nl['nav.recipes'] }).click();

function collectPosts(page: Page): string[] {
  const posts: string[] = [];
  page.on('request', (r) => {
    if (isRecipePost(r)) posts.push(r.url());
  });
  return posts;
}

test.describe('crit. 1: start list in the form', () => {
  test('a new form shows the eight start tags as buttons, none pressed', async ({ page }) => {
    await page.goto('/nieuw');
    await expect(tagGroup(page)).toBeVisible();
    for (const name of START_LIST) {
      await expect(tagButton(page, name), name).toBeVisible();
      await expect(tagButton(page, name), name).toHaveAttribute('aria-pressed', 'false');
    }
  });
});

test.describe('crit. 2: zero or more tags on a recipe', () => {
  test('a recipe without tags can be saved and the detail page has no "Soort gerecht" heading', async ({ page }) => {
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Zonder tags'), ...base });
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: nl['tags.dish'] })).toHaveCount(0);
    await expect(page.getByText(nl['tags.dish'], { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('recipe-dish-tags')).toHaveCount(0);
  });

  test('"soep" and "tapas" are pressed, saved, shown on the detail page and pressed again when editing', async ({ page }) => {
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Met tags'), ...base, dishTags: ['soep', 'tapas'] });
    await expect(tagButton(page, 'soep')).toHaveAttribute('aria-pressed', 'true');
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    const tags = page.getByTestId('recipe-dish-tags');
    await expect(tags).toContainText('soep');
    await expect(tags).toContainText('tapas');
    await expect(page.getByText(nl['tags.dish'], { exact: true })).toBeVisible();

    const id = /\/recept\/([0-9a-f-]{36})/.exec(page.url())![1];
    await page.goto(`/recept/${id}/bewerken`);
    await expect(tagButton(page, 'soep')).toHaveAttribute('aria-pressed', 'true');
    await expect(tagButton(page, 'tapas')).toHaveAttribute('aria-pressed', 'true');
    await expect(tagButton(page, 'snack')).toHaveAttribute('aria-pressed', 'false');
  });

  test('unpressing a tag and leaving asks "Wijzigingen weggooien?"; an untouched form does not', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Tags dirty'), dish_tags: ['soep', 'tapas'] });
    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(tagButton(page, 'soep')).toHaveAttribute('aria-pressed', 'true');
    await leaveForOverview(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(nl['form.discardQuestion'])).toHaveCount(0);

    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(tagButton(page, 'soep')).toHaveAttribute('aria-pressed', 'true');
    await tagButton(page, 'soep').click();
    await expect(tagButton(page, 'soep')).toHaveAttribute('aria-pressed', 'false');
    await leaveForOverview(page);
    await expect(page.getByText(nl['form.discardQuestion'])).toBeVisible();
  });

  test('tapping a 21st tag is refused with the "too many" message', async ({ page }) => {
    const s = letters();
    await page.goto('/nieuw');
    for (let i = 0; i < 20; i++) {
      await newTagField(page).fill(`m${i}${s}`);
      await addTagButton(page).click();
      await expect(tagButton(page, `m${i}${s}`)).toHaveAttribute('aria-pressed', 'true');
    }
    await newTagField(page).fill(`m20${s}`);
    await addTagButton(page).click();
    await expect(page.getByText(nl['form.tagsTooMany'])).toBeVisible();
  });
});

test.describe('crit. 3: adding a new tag', () => {
  test('typing "SOEP" selects the existing "soep" button and makes no second button', async ({ page }) => {
    await page.goto('/nieuw');
    await expect(tagButton(page, 'soep')).toBeVisible();
    const before = await tagGroup(page).getByRole('button').count();
    await newTagField(page).fill('SOEP');
    await addTagButton(page).click();
    await expect(tagButton(page, 'soep')).toHaveAttribute('aria-pressed', 'true');
    await expect(tagGroup(page).getByRole('button')).toHaveCount(before);
    await expect(tagGroup(page).getByRole('button', { name: /^soep$/i })).toHaveCount(1);
  });

  for (const [label, value] of [
    ['31 characters', 'x'.repeat(31)],
    ['an empty name', ''],
  ] as const) {
    test(`${label} gives a message at the field and adds nothing`, async ({ page }) => {
      await page.goto('/nieuw');
      await expect(tagButton(page, 'soep')).toBeVisible();
      const before = await tagGroup(page).getByRole('button').count();
      await newTagField(page).fill(value);
      await addTagButton(page).click();
      const field = newTagField(page);
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      const describedBy = await field.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      const text = await page.evaluate(
        (ids) => ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '),
        describedBy!,
      );
      expect(text).toContain(nl['form.tagInvalid']);
      await expect(tagGroup(page).getByRole('button')).toHaveCount(before);
    });
  }

  test('Enter in "Nieuwe tag" adds the tag and does not submit the form', async ({ page }) => {
    const posts = collectPosts(page);
    await page.goto('/nieuw');
    await titleField(page).fill(unique('Enter'));
    await newTagField(page).fill('soep');
    await newTagField(page).press('Enter');
    await expect(tagButton(page, 'soep')).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/\/nieuw$/);
    expect(posts).toEqual([]);
  });

  test('a tag added by another user appears in this user\'s form and filter', async ({ page }) => {
    const name = `Stoofpot${letters()}`;
    await insertRecipe(other.client, { title: unique('Stoof'), dish_tags: [name] });
    await page.goto('/nieuw');
    await expect(tagButton(page, name)).toBeVisible();
    await page.goto('/');
    await expect(tagButton(page, name)).toBeVisible();
  });

  test('a new tag typed in the form is saved on the recipe and shown on the detail page', async ({ page }) => {
    const name = `Wok${letters()}`;
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Nieuwe tag'), ...base, dishTags: [name] });
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('recipe-dish-tags')).toContainText(name);
  });
});

test.describe('crit. 4: overview filter', () => {
  async function seed() {
    const a = await insertRecipe(user.client, { title: unique('Tagfilter A'), dish_tags: ['soep'], prep_minutes: 10, total_minutes: 20 });
    const b = await insertRecipe(user.client, { title: unique('Tagfilter B'), dish_tags: ['tapas'] });
    const c = await insertRecipe(user.client, { title: unique('Tagfilter C'), dish_tags: [] });
    return { a: a.title, b: b.title, c: c.title };
  }

  test('no choice shows all; "soep" only A; "soep" + "tapas" shows A and B once each, not C', async ({ page }) => {
    const { a, b, c } = await seed();
    await page.goto('/');
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, b)).toBeVisible();
    await expect(item(page, c)).toBeVisible();

    await tagButton(page, 'soep').click();
    await expect(tagButton(page, 'soep')).toHaveAttribute('aria-pressed', 'true');
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, b)).toHaveCount(0);
    await expect(item(page, c)).toHaveCount(0);

    await tagButton(page, 'tapas').click();
    await expect(item(page, a)).toHaveCount(1);
    await expect(item(page, b)).toHaveCount(1);
    await expect(item(page, c)).toHaveCount(0);

    await tagButton(page, 'soep').click();
    await tagButton(page, 'tapas').click();
    await expect(item(page, c)).toBeVisible();
  });

  test('two quick taps do not wipe each other and the choice survives a reload via the URL', async ({ page }) => {
    const { a, b, c } = await seed();
    await page.goto('/');
    await expect(tagButton(page, 'soep')).toBeVisible();
    await tagButton(page, 'soep').click();
    await tagButton(page, 'tapas').click();
    await expect(page).toHaveURL(/[?&]soort=soep/);
    await expect(page).toHaveURL(/[?&]soort=tapas/);
    await page.reload();
    await expect(tagButton(page, 'soep')).toHaveAttribute('aria-pressed', 'true');
    await expect(tagButton(page, 'tapas')).toHaveAttribute('aria-pressed', 'true');
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, b)).toBeVisible();
    await expect(item(page, c)).toHaveCount(0);
  });

  test('"soep" with a maximum total time is the intersection ("and")', async ({ page }) => {
    const quick = await insertRecipe(user.client, { title: unique('Soep snel'), dish_tags: ['soep'], prep_minutes: 10, total_minutes: 20 });
    const slow = await insertRecipe(user.client, { title: unique('Soep traag'), dish_tags: ['soep'], prep_minutes: 10, total_minutes: 90 });
    await page.goto('/?soort=soep&totaal=30');
    await expect(item(page, quick.title)).toBeVisible();
    await expect(item(page, slow.title)).toHaveCount(0);
  });

  test('a filter without hits shows "Niets gevonden."; an unknown tag in the URL is no error', async ({ page }) => {
    await page.goto('/?soort=Bestaatniet');
    await expect(page.getByText('Niets gevonden.')).toBeVisible();
    await expect(page.getByText('Nog geen recepten.')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  // crit. 4: tag names may hold any character; a comma must not split the name into two filter values.
  test('a tag with a comma is found by its own filter and not confused with a tag equal to one of its parts', async ({ page }) => {
    const l = letters();
    const comma = `zoet${l}, zuur${l}`;
    const part = `zuur${l}`;
    const a = await insertRecipe(user.client, { title: unique('Komma A'), dish_tags: [comma] });
    const b = await insertRecipe(user.client, { title: unique('Komma B'), dish_tags: [part] });
    await page.goto(`/?${new URLSearchParams({ soort: comma })}`);
    await expect(item(page, a.title)).toBeVisible();
    await expect(item(page, b.title)).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  // crit. 4: "unknown tag gives no error", also for characters that are special in a Postgres array literal.
  for (const value of ['a"b{', 'x}y', 'back\\slash', 'q"', '{"a"}']) {
    test(`?soort=${value} gives "Niets gevonden." without an error`, async ({ page }) => {
      await page.goto(`/?${new URLSearchParams({ soort: value })}`);
      await expect(page.getByText('Niets gevonden.')).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
    });
  }
});

test.describe('crit. 5: no renaming or removing', () => {
  test('form and filter have no rename/delete control; unpressing keeps the button', async ({ page }) => {
    const forbidden = /verwijder|hernoem|wijzig|bewerk/i;
    await page.goto('/nieuw');
    await expect(tagButton(page, 'soep')).toBeVisible();
    await expect(tagGroup(page).getByRole('button', { name: forbidden })).toHaveCount(0);
    await tagButton(page, 'soep').click();
    await tagButton(page, 'soep').click();
    await expect(tagButton(page, 'soep')).toHaveCount(1);
    await expect(tagButton(page, 'soep')).toHaveAttribute('aria-pressed', 'false');

    await page.goto('/');
    await expect(tagButton(page, 'soep')).toBeVisible();
    await expect(tagGroup(page).getByRole('button', { name: forbidden })).toHaveCount(0);
  });
});

test.describe('R-001 / R-016: layout', () => {
  test('tag buttons are tap targets of at least 44 x 44 px in form and filter', async ({ page }) => {
    for (const url of ['/nieuw', '/']) {
      await page.goto(url);
      await expect(tagButton(page, 'soep')).toBeVisible();
      for (const name of START_LIST) {
        const button = tagButton(page, name);
        await expect(button, `${url} ${name} data-tap-target`).toHaveAttribute('data-tap-target', /.*/);
        const box = await button.boundingBox();
        expect(box, name).not.toBeNull();
        expect(box!.height, `${url} ${name} height`).toBeGreaterThanOrEqual(44);
        expect(box!.width, `${url} ${name} width`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('20 tags of 30 characters without spaces fit in 360 px without horizontal scrolling', async ({ page }) => {
    const long = Array.from({ length: 20 }, (_, i) => `${String(i).padStart(2, '0')}${'w'.repeat(28)}`);
    await page.route(/\/rest\/v1\/tags/, (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(long.map((name) => ({ name, name_key: name }))),
      });
    });
    for (const url of ['/nieuw', '/']) {
      await page.goto(url);
      await expect(tagButton(page, long[19])).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, url).toBeLessThanOrEqual(0);
    }
  });

  test('long tag labels on the detail page wrap instead of overflowing', async ({ page }) => {
    const name = `d${'v'.repeat(29)}`;
    const row = await insertRecipe(user.client, { title: unique('Lange tag'), dish_tags: [name] });
    await page.goto(`/recept/${row.id}`);
    await expect(page.getByTestId('recipe-dish-tags')).toContainText(name);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
