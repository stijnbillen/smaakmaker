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

// T-011 / R-011: trait tags ("Kenmerken") in the form, on the detail page and as an overview filter, next to the
// dish group of T-010. Local Supabase, viewport 360 x 640. Every locator is scoped to its own group, because
// the same name ("snack") can live in both groups.
let user: TestUser;
let other: TestUser;

// Exact names made by this run; afterAll removes those catalogue rows (nobody can delete tags through the API).
// Matching is on the full folded name, never a pattern, so the start tags stay.
const usedNames: string[] = [];
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('rtrt', { displayName: 'Tess Trait' });
  other = await createTestUser('rtrt2', { displayName: 'Olaf Ander' });
});

test.afterAll(async () => {
  for (const u of [user, other]) if (u) await deleteTestUser(u);
  for (const n of usedNames) await sql(`delete from public.tags where name_key = public.fold_key(${lit(n)})`);
});

test.beforeEach(async ({ page }) => {
  autoOpenFilters(page); // T-029: filters sit behind the "Filters" button
  await signInViaStorage(page, user.session);
});

const unique = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const tagName = (label: string) => {
  const s = Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6) || 'abc';
  const name = `${label}${s}`;
  usedNames.push(name);
  return name;
};
const base = { ingredients: ['Zout'], steps: ['Roer.'] };
const TRAIT_LIST = ['winter', 'zomer', 'lente', 'herfst', 'licht', 'vegetarisch', 'veganistisch', 'glutenvrij', 'snel'];
const item = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title });
const leaveForOverview = (page: Page) =>
  page.getByRole('navigation', { name: nl['nav.label'] }).getByRole('link', { name: nl['nav.recipes'] }).click();
const trait = (page: Page, name: string) => tagButton(page, name, 'trait');
const dish = (page: Page, name: string) => tagButton(page, name, 'dish');

function collectPosts(page: Page): string[] {
  const posts: string[] = [];
  page.on('request', (r) => {
    if (isRecipePost(r)) posts.push(r.url());
  });
  return posts;
}

test.describe('crit. 1: start list in the form', () => {
  test('a new form shows a group "Kenmerken" with the nine start tags, none pressed, apart from "Soort gerecht"', async ({ page }) => {
    await page.goto('/nieuw');
    await expect(tagGroup(page, 'trait')).toBeVisible();
    await expect(tagGroup(page, 'dish')).toBeVisible();
    for (const name of TRAIT_LIST) {
      await expect(trait(page, name), name).toBeVisible();
      await expect(trait(page, name), name).toHaveAttribute('aria-pressed', 'false');
      // the trait names are not in the dish group
      await expect(dish(page, name), `${name} in dish`).toHaveCount(0);
    }
    await expect(trait(page, 'soep')).toHaveCount(0);
  });
});

test.describe('crit. 1: zero or more tags on a recipe', () => {
  test('a recipe without trait tags saves and the detail page has no "Kenmerken" heading', async ({ page }) => {
    await page.goto('/nieuw');
    const title = unique('Zonder kenmerken');
    await fillRecipe(page, { title, ...base });
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    // Wait until the page is loaded (title h1 present), otherwise the absence checks below pass vacuously.
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
    // exact: the title itself contains "kenmerken" and must not match the group heading.
    await expect(page.getByRole('heading', { name: nl['tags.trait'], exact: true })).toHaveCount(0);
    await expect(page.getByText(nl['tags.trait'], { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('recipe-trait-tags')).toHaveCount(0);
  });

  test('"vegetarisch" and "snel" are saved, shown under "Kenmerken" apart from the dish tags, and pressed when editing', async ({ page }) => {
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Met kenmerken'), ...base, dishTags: ['soep'], traitTags: ['vegetarisch', 'snel'] });
    await expect(trait(page, 'vegetarisch')).toHaveAttribute('aria-pressed', 'true');
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    const traits = page.getByTestId('recipe-trait-tags');
    await expect(traits).toContainText('vegetarisch');
    await expect(traits).toContainText('snel');
    await expect(traits).not.toContainText('soep');
    await expect(page.getByTestId('recipe-dish-tags')).not.toContainText('vegetarisch');
    await expect(page.getByText(nl['tags.trait'], { exact: true })).toBeVisible();

    const id = /\/recept\/([0-9a-f-]{36})/.exec(page.url())![1];
    await page.goto(`/recept/${id}/bewerken`);
    await expect(trait(page, 'vegetarisch')).toHaveAttribute('aria-pressed', 'true');
    await expect(trait(page, 'snel')).toHaveAttribute('aria-pressed', 'true');
    await expect(trait(page, 'zomer')).toHaveAttribute('aria-pressed', 'false');
  });

  test('unpressing a trait tag and leaving asks "Wijzigingen weggooien?"; an untouched form does not', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Kenmerk dirty'), trait_tags: ['vegetarisch', 'snel'] });
    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(trait(page, 'vegetarisch')).toHaveAttribute('aria-pressed', 'true');
    await leaveForOverview(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(nl['form.discardQuestion'])).toHaveCount(0);

    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(trait(page, 'vegetarisch')).toHaveAttribute('aria-pressed', 'true');
    await trait(page, 'vegetarisch').click();
    await expect(trait(page, 'vegetarisch')).toHaveAttribute('aria-pressed', 'false');
    await leaveForOverview(page);
    await expect(page.getByText(nl['form.discardQuestion'])).toBeVisible();
  });

  test('a 21st trait tag is refused with the "too many" message', async ({ page }) => {
    const s = tagName('m');
    await page.goto('/nieuw');
    for (let i = 0; i < 20; i++) {
      usedNames.push(`${s}${i}`);
      await newTagField(page, 'trait').fill(`${s}${i}`);
      await addTagButton(page, 'trait').click();
      await expect(trait(page, `${s}${i}`)).toHaveAttribute('aria-pressed', 'true');
    }
    usedNames.push(`${s}20`);
    await newTagField(page, 'trait').fill(`${s}20`);
    await addTagButton(page, 'trait').click();
    await expect(page.getByText(nl['form.tagsTooMany'])).toBeVisible();
  });
});

test.describe('crit. 1: adding a new tag', () => {
  test('typing "VEGETARISCH" in the Kenmerken field selects the existing button and makes no second one', async ({ page }) => {
    await page.goto('/nieuw');
    await expect(trait(page, 'vegetarisch')).toBeVisible();
    const before = await tagGroup(page, 'trait').getByRole('button').count();
    await newTagField(page, 'trait').fill('VEGETARISCH');
    await addTagButton(page, 'trait').click();
    await expect(trait(page, 'vegetarisch')).toHaveAttribute('aria-pressed', 'true');
    await expect(tagGroup(page, 'trait').getByRole('button')).toHaveCount(before);
    await expect(tagGroup(page, 'trait').getByRole('button', { name: /^vegetarisch$/i })).toHaveCount(1);
  });

  test('a new tag in Kenmerken does not appear in "Soort gerecht", and the other way round', async ({ page }) => {
    const t = tagName('Kenm');
    const d = tagName('Gerecht');
    await page.goto('/nieuw');
    await newTagField(page, 'trait').fill(t);
    await addTagButton(page, 'trait').click();
    await newTagField(page, 'dish').fill(d);
    await addTagButton(page, 'dish').click();
    await expect(trait(page, t)).toHaveAttribute('aria-pressed', 'true');
    await expect(dish(page, d)).toHaveAttribute('aria-pressed', 'true');
    await expect(dish(page, t)).toHaveCount(0);
    await expect(trait(page, d)).toHaveCount(0);
  });

  for (const [label, value] of [
    ['31 characters', 'x'.repeat(31)],
    ['an empty name', ''],
  ] as const) {
    test(`${label} gives a message at the field of its own group and adds nothing`, async ({ page }) => {
      await page.goto('/nieuw');
      await expect(trait(page, 'snel')).toBeVisible();
      const before = await tagGroup(page, 'trait').getByRole('button').count();
      await newTagField(page, 'trait').fill(value);
      await addTagButton(page, 'trait').click();
      const field = newTagField(page, 'trait');
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      const describedBy = await field.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      const text = await page.evaluate(
        (ids) => ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '),
        describedBy!,
      );
      expect(text).toContain(nl['form.tagInvalid']);
      // the other group's field is untouched and points to its own message
      await expect(newTagField(page, 'dish')).not.toHaveAttribute('aria-invalid', 'true');
      const dishDescribed = await newTagField(page, 'dish').getAttribute('aria-describedby');
      expect(dishDescribed ?? '').not.toBe(describedBy);
      await expect(tagGroup(page, 'trait').getByRole('button')).toHaveCount(before);
    });
  }

  test('Enter in "Nieuwe tag" of Kenmerken adds the tag and does not submit the form', async ({ page }) => {
    const posts = collectPosts(page);
    await page.goto('/nieuw');
    await titleField(page).fill(unique('Enter'));
    await newTagField(page, 'trait').fill('snel');
    await newTagField(page, 'trait').press('Enter');
    await expect(trait(page, 'snel')).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/\/nieuw$/);
    expect(posts).toEqual([]);
  });

  test('a trait tag added by another user appears in this user\'s form and filter', async ({ page }) => {
    const name = tagName('Pittig');
    await insertRecipe(other.client, { title: unique('Pittig'), trait_tags: [name] });
    await page.goto('/nieuw');
    await expect(trait(page, name)).toBeVisible();
    await page.goto('/');
    await expect(trait(page, name)).toBeVisible();
  });

  test('a new trait tag typed in the form is saved and shown on the detail page', async ({ page }) => {
    const name = tagName('Feestelijk');
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Nieuw kenmerk'), ...base, traitTags: [name] });
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('recipe-trait-tags')).toContainText(name);
  });
});

test.describe('crit. 1: no renaming or removing', () => {
  test('form and filter have no rename/delete control in Kenmerken; unpressing keeps the button', async ({ page }) => {
    const forbidden = /verwijder|hernoem|wijzig|bewerk/i;
    await page.goto('/nieuw');
    await expect(trait(page, 'snel')).toBeVisible();
    await expect(tagGroup(page, 'trait').getByRole('button', { name: forbidden })).toHaveCount(0);
    await trait(page, 'snel').click();
    await trait(page, 'snel').click();
    await expect(trait(page, 'snel')).toHaveCount(1);
    await expect(trait(page, 'snel')).toHaveAttribute('aria-pressed', 'false');

    await page.goto('/');
    await expect(trait(page, 'snel')).toBeVisible();
    await expect(tagGroup(page, 'trait').getByRole('button', { name: forbidden })).toHaveCount(0);
  });
});

test.describe('crit. 2: filters of both groups combine', () => {
  // A soep + vegetarisch, B soep, C vegetarisch, D no tags.
  async function seed() {
    const a = await insertRecipe(user.client, { title: unique('Comb A'), dish_tags: ['soep'], trait_tags: ['vegetarisch'], prep_minutes: 10, total_minutes: 20 });
    const b = await insertRecipe(user.client, { title: unique('Comb B'), dish_tags: ['soep'] });
    const c = await insertRecipe(user.client, { title: unique('Comb C'), trait_tags: ['vegetarisch'] });
    const d = await insertRecipe(user.client, { title: unique('Comb D') });
    return { a: a.title, b: b.title, c: c.title, d: d.title };
  }

  test('"soep" + "vegetarisch" shows only A; "vegetarisch" alone shows A and C', async ({ page }) => {
    const { a, b, c, d } = await seed();
    await page.goto('/');
    await expect(item(page, d)).toBeVisible();

    await dish(page, 'soep').click();
    await trait(page, 'vegetarisch').click();
    await expect(trait(page, 'vegetarisch')).toHaveAttribute('aria-pressed', 'true');
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, b)).toHaveCount(0);
    await expect(item(page, c)).toHaveCount(0);
    await expect(item(page, d)).toHaveCount(0);

    await dish(page, 'soep').click();
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, c)).toBeVisible();
    await expect(item(page, b)).toHaveCount(0);
    await expect(item(page, d)).toHaveCount(0);
  });

  test('"vegetarisch" + "snel" inside one group is "or": A and C stay', async ({ page }) => {
    const { a, b, c } = await seed();
    await page.goto('/');
    await trait(page, 'vegetarisch').click();
    await trait(page, 'snel').click();
    await expect(trait(page, 'snel')).toHaveAttribute('aria-pressed', 'true');
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, c)).toBeVisible();
    await expect(item(page, b)).toHaveCount(0);
  });

  test('the choice of both groups is in the URL and survives a reload; two quick taps both hold', async ({ page }) => {
    const { a, b, c } = await seed();
    await page.goto('/');
    await expect(dish(page, 'soep')).toBeVisible();
    await dish(page, 'soep').click();
    await trait(page, 'vegetarisch').click(); // straight after, without waiting
    await expect(page).toHaveURL(/[?&]soort=soep/);
    await expect(page).toHaveURL(/[?&]kenmerk=vegetarisch/);
    await page.reload();
    await expect(dish(page, 'soep')).toHaveAttribute('aria-pressed', 'true');
    await expect(trait(page, 'vegetarisch')).toHaveAttribute('aria-pressed', 'true');
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, b)).toHaveCount(0);
    await expect(item(page, c)).toHaveCount(0);
  });

  test('combined with the time filter only recipes that meet everything remain', async ({ page }) => {
    const quick = await insertRecipe(user.client, { title: unique('Veg snel'), trait_tags: ['vegetarisch'], prep_minutes: 10, total_minutes: 20 });
    const slow = await insertRecipe(user.client, { title: unique('Veg traag'), trait_tags: ['vegetarisch'], prep_minutes: 10, total_minutes: 90 });
    await page.goto('/?kenmerk=vegetarisch&totaal=30');
    await expect(item(page, quick.title)).toBeVisible();
    await expect(item(page, slow.title)).toHaveCount(0);
  });

  test('no hits shows "Niets gevonden."; an unknown trait in the URL is no error', async ({ page }) => {
    await page.goto('/?kenmerk=Bestaatniet');
    await expect(page.getByText('Niets gevonden.')).toBeVisible();
    await expect(page.getByText('Nog geen recepten.')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

test.describe('crit. 3: "vegetarisch" only uses the tag', () => {
  test('a recipe with "spek" and the tag shows, one with only vegetables and no tag does not', async ({ page }) => {
    const e = await insertRecipe(user.client, {
      title: unique('Spek met tag'),
      ingredients: [{ name: 'spek' }],
      trait_tags: ['vegetarisch'],
    });
    const f = await insertRecipe(user.client, {
      title: unique('Groenten zonder tag'),
      ingredients: [{ name: 'wortel' }, { name: 'prei' }],
    });
    await page.goto('/?kenmerk=vegetarisch');
    await expect(item(page, e.title)).toBeVisible();
    await expect(item(page, f.title)).toHaveCount(0);
  });
});

test.describe('R-001 / R-016: layout', () => {
  test('trait tag buttons are tap targets of at least 44 x 44 px in form and filter', async ({ page }) => {
    for (const url of ['/nieuw', '/']) {
      await page.goto(url);
      await expect(trait(page, 'snel')).toBeVisible();
      for (const name of TRAIT_LIST) {
        const button = trait(page, name);
        await expect(button, `${url} ${name} data-tap-target`).toHaveAttribute('data-tap-target', /.*/);
        const box = await button.boundingBox();
        expect(box, name).not.toBeNull();
        expect(box!.height, `${url} ${name} height`).toBeGreaterThanOrEqual(44);
        expect(box!.width, `${url} ${name} width`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('two groups of 20 tags of 30 characters fit in 360 px without horizontal scrolling', async ({ page }) => {
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
      await expect(trait(page, long[19])).toBeVisible();
      await expect(dish(page, long[19])).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, url).toBeLessThanOrEqual(0);
    }
  });

  test('long trait labels on the detail page wrap instead of overflowing', async ({ page }) => {
    const name = tagName(`k${'v'.repeat(20)}`).slice(0, 30);
    usedNames.push(name);
    const row = await insertRecipe(user.client, { title: unique('Lang kenmerk'), trait_tags: [name] });
    await page.goto(`/recept/${row.id}`);
    await expect(page.getByTestId('recipe-trait-tags')).toContainText(name);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
