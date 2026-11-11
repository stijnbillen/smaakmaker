import { expect, test, type Page } from '@playwright/test';
import { autoOpenFilters, openFilters, setTimeLimit } from '../helpers/overview';
import {
  equipmentAddButton,
  equipmentChoice,
  equipmentGroup,
  equipmentNewField,
  fillRecipe,
  isRecipePost,
  nl,
  saveButton,
  titleField,
} from '../helpers/recipe-form';
import { signInViaStorage } from '../helpers/session';
import { assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, type TestUser } from '../helpers/supabase-admin';

// T-009 / R-008: equipment in the form, on the detail page, in the overview and as a filter. Viewport 360 x 640.
let user: TestUser;
let other: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('reqp', { displayName: 'Gert Gerief' });
  other = await createTestUser('reqp2', { displayName: 'Ine Ander' });
});

test.afterAll(async () => {
  for (const u of [user, other]) if (u) await deleteTestUser(u);
});

test.beforeEach(async ({ page }) => {
  autoOpenFilters(page); // T-029: filters sit behind the "Filters" button
  await signInViaStorage(page, user.session);
});

const rand = () => Math.random().toString(36).slice(2, 7);
const unique = (label: string) => `${label} ${Date.now()}-${rand()}`;
const base = { ingredients: ['Zout'], steps: ['Roer.'] };
const item = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title });
const filterButton = (page: Page, name: string) =>
  page.getByRole('group', { name: nl['filter.equipment'], exact: true }).getByRole('button', { name, exact: true });

async function expectMessageAt(page: Page, field: ReturnType<typeof equipmentNewField>, message: string) {
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await field.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  const text = await page.evaluate(
    (ids) => ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '),
    describedBy!,
  );
  expect(text).toContain(message);
}

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('crit. 1: zero or more items, 1-30 characters', () => {
  test('a recipe without equipment can be saved', async ({ page }) => {
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Zonder'), ...base });
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
  });

  for (const [label, value] of [
    ['31 characters', 'x'.repeat(31)],
    ['an empty name', ''],
  ] as const) {
    test(`${label} gives a message at the field and adds nothing`, async ({ page }) => {
      await page.goto('/nieuw');
      await equipmentNewField(page).fill(value);
      const before = await equipmentGroup(page).getByRole('button', { pressed: true }).count();
      await equipmentAddButton(page).click();
      await expectMessageAt(page, equipmentNewField(page), nl['form.equipmentInvalid']);
      await expect(equipmentGroup(page).getByRole('button', { pressed: true })).toHaveCount(before);
    });
  }

  test('a name of 30 characters can be added and saved', async ({ page }) => {
    const name = `${rand()}${'q'.repeat(30)}`.slice(0, 30);
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Dertig'), ...base, equipment: [name] });
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('recipe-equipment')).toContainText(name);
  });

  test('editing shows the stored items selected; changing them and leaving asks to discard', async ({ page }) => {
    const oven = `Oven${rand()}`;
    const wok = `Wok${rand()}`;
    const row = await insertRecipe(user.client, { title: unique('Bewerk gerief'), equipment: [oven] });
    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(equipmentChoice(page, oven)).toHaveAttribute('aria-pressed', 'true');

    // A fresh form is not dirty.
    await page.getByRole('navigation', { name: nl['nav.label'] }).getByRole('link', { name: nl['nav.recipes'] }).click();
    await expect(page.getByText(nl['form.discardQuestion'])).toHaveCount(0);

    await page.goto(`/recept/${row.id}/bewerken`);
    await equipmentNewField(page).fill(wok);
    await equipmentAddButton(page).click();
    await page.getByRole('navigation', { name: nl['nav.label'] }).getByRole('link', { name: nl['nav.recipes'] }).click();
    await expect(page.getByText(nl['form.discardQuestion'])).toBeVisible();
  });

  test('deselecting a stored item and leaving asks to discard', async ({ page }) => {
    const oven = `Oven${rand()}`;
    const row = await insertRecipe(user.client, { title: unique('Weghalen'), equipment: [oven] });
    await page.goto(`/recept/${row.id}/bewerken`);
    await equipmentChoice(page, oven).click();
    await page.getByRole('navigation', { name: nl['nav.label'] }).getByRole('link', { name: nl['nav.recipes'] }).click();
    await expect(page.getByText(nl['form.discardQuestion'])).toBeVisible();
  });

  test('Enter in "Nieuw kookgerief" adds the item and does not send the form', async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (r) => {
      if (isRecipePost(r)) posts.push(r.url());
    });
    const name = `Enter${rand()}`;
    await page.goto('/nieuw');
    await titleField(page).fill(unique('Enter'));
    await equipmentNewField(page).fill(name);
    await equipmentNewField(page).press('Enter');
    await expect(equipmentChoice(page, name)).toHaveAttribute('aria-pressed', 'true');
    expect(posts).toEqual([]);
  });
});

test.describe('crit. 2: choose existing or add new; an existing name is reused', () => {
  test('choice buttons are toggles of at least 44 x 44 px with data-tap-target', async ({ page }) => {
    const name = `Knop${rand()}`;
    await insertRecipe(user.client, { title: unique('Knop'), equipment: [name] });
    await page.goto('/nieuw');
    const button = equipmentChoice(page, name);
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button).toHaveAttribute('data-tap-target', /.*/);
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  test('typing "OVEN" while "Oven" exists selects the existing button and makes no second one', async ({ page }) => {
    const s = rand();
    await insertRecipe(user.client, { title: unique('Hergebruik'), equipment: [`Oven${s}`] });
    await page.goto('/nieuw');
    await equipmentNewField(page).fill(`OVEN${s.toUpperCase()}`);
    await equipmentAddButton(page).click();
    await expect(equipmentChoice(page, `Oven${s}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(equipmentGroup(page).getByRole('button', { name: new RegExp(`^oven${s}$`, 'i') })).toHaveCount(1);
  });

  test('a saved item shows on the detail page; a new item is choosable by another user in form and filter', async ({
    page,
    browser,
  }) => {
    const name = `Sous-vide${rand()}`;
    const title = unique('Nieuw gerief');
    await page.goto('/nieuw');
    await fillRecipe(page, { title, ...base, equipment: [name] });
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('recipe-equipment')).toContainText(name);

    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
    try {
      const p2 = await ctx.newPage();
      await signInViaStorage(p2, other.session);
      await p2.goto('/nieuw');
      await expect(equipmentChoice(p2, name)).toHaveAttribute('aria-pressed', 'false');
      await p2.goto('/');
      await openFilters(p2); // a page from newContext() is not wrapped by autoOpenFilters
      await expect(filterButton(p2, name)).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});

test.describe('crit. 3: visible on the detail page and in the overview', () => {
  test('shows "Kookgerief" with both names on the detail page and in the overview', async ({ page }) => {
    const s = rand();
    const title = unique('Zichtbaar');
    const row = await insertRecipe(user.client, { title, equipment: [`Oven${s}`, `Airfryer${s}`] });
    await page.goto(`/recept/${row.id}`);
    await expect(page.getByRole('heading', { name: nl['recipe.equipment'], exact: true })).toBeVisible();
    const detail = page.getByTestId('recipe-equipment');
    await expect(detail).toContainText(`Oven${s}`);
    await expect(detail).toContainText(`Airfryer${s}`);

    await page.goto('/');
    const inList = item(page, title).getByTestId('recipe-equipment');
    await expect(inList).toContainText(`Oven${s}`);
    await expect(inList).toContainText(`Airfryer${s}`);
  });

  test('a recipe without equipment shows no heading and no empty element', async ({ page }) => {
    const title = unique('Kaal');
    const row = await insertRecipe(user.client, { title });
    await page.goto(`/recept/${row.id}`);
    await expect(page.getByText(title).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: nl['recipe.equipment'], exact: true })).toHaveCount(0);
    await expect(page.getByTestId('recipe-equipment')).toHaveCount(0);
    await page.goto('/');
    await expect(item(page, title)).toBeVisible();
    await expect(item(page, title).getByTestId('recipe-equipment')).toHaveCount(0);
  });

  test('a 30-character name without spaces and 20 items fit in 360 px without horizontal scroll', async ({ page }) => {
    const s = rand();
    const long = `${s}${'W'.repeat(30)}`.slice(0, 30);
    const names = [long, ...Array.from({ length: 19 }, (_, i) => `Gerief${s}${i}`)];
    const title = unique('Breed');
    const row = await insertRecipe(user.client, { title, equipment: names });
    await page.goto(`/recept/${row.id}`);
    await expect(page.getByTestId('recipe-equipment')).toContainText(long);
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
    await page.goto('/');
    await expect(item(page, title).getByTestId('recipe-equipment')).toContainText(long);
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(equipmentChoice(page, long)).toBeVisible();
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('crit. 4: overview filter "at least one of the chosen items"', () => {
  async function seed() {
    const s = rand();
    const tag = unique('Geriefsfilter');
    const oven = `Oven${s}`;
    const wok = `Wok${s}`;
    const a = await insertRecipe(user.client, { title: `${tag} A`, equipment: [oven], prep_minutes: 10, total_minutes: 20 });
    const b = await insertRecipe(user.client, { title: `${tag} B`, equipment: [wok], prep_minutes: 50, total_minutes: 90 });
    const c = await insertRecipe(user.client, { title: `${tag} C`, equipment: [], prep_minutes: 10, total_minutes: 20 });
    return { oven, wok, a: a.title, b: b.title, c: c.title };
  }

  test('no choice shows all; one item filters; two items use "or" and show each recipe once', async ({ page }) => {
    const { oven, wok, a, b, c } = await seed();
    await page.goto('/');
    for (const t of [a, b, c]) await expect(item(page, t)).toHaveCount(1);

    await filterButton(page, oven).click();
    await expect(item(page, a)).toHaveCount(1);
    await expect(item(page, b)).toHaveCount(0);
    await expect(item(page, c)).toHaveCount(0);

    await filterButton(page, wok).click();
    await expect(item(page, a)).toHaveCount(1);
    await expect(item(page, b)).toHaveCount(1);
    await expect(item(page, c)).toHaveCount(0);

    await filterButton(page, oven).click();
    await filterButton(page, wok).click();
    for (const t of [a, b, c]) await expect(item(page, t)).toHaveCount(1);
  });

  test('the choice is in the URL (`gerief`) and survives a reload', async ({ page }) => {
    const { oven, a, b } = await seed();
    await page.goto('/');
    await filterButton(page, oven).click();
    await expect(page).toHaveURL(new RegExp(`[?&]gerief=${encodeURIComponent(oven)}`));
    await page.reload();
    await expect(filterButton(page, oven)).toHaveAttribute('aria-pressed', 'true');
    await expect(item(page, a)).toHaveCount(1);
    await expect(item(page, b)).toHaveCount(0);
  });

  test('combined with the time filter it gives the intersection', async ({ page }) => {
    const { oven, wok, a, b } = await seed();
    await page.goto('/');
    await filterButton(page, oven).click();
    await filterButton(page, wok).click();
    await setTimeLimit(page, 'prep', 15);
    await expect(item(page, a)).toHaveCount(1);
    await expect(item(page, b)).toHaveCount(0);
  });

  test('a filter without hits shows "Niets gevonden."', async ({ page }) => {
    // Oven recipe A has prep 10, so a wok-only recipe B (prep 50) cannot pass "max 15 min": empty intersection.
    const { wok, b } = await seed();
    await page.goto('/');
    await filterButton(page, wok).click();
    await expect(item(page, b)).toHaveCount(1);
    await setTimeLimit(page, 'prep', 15);
    await expect(page.getByText('Niets gevonden.')).toBeVisible();
  });

  test('an unknown name in the URL gives no error but "Niets gevonden."', async ({ page }) => {
    await page.goto('/?gerief=Bestaatniet');
    await expect(page.getByText('Niets gevonden.')).toBeVisible();
    await expect(page.getByText('Nog geen recepten.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Opnieuw proberen' })).toHaveCount(0);
  });

  test('the filter buttons are toggles of at least 44 px and fit in 360 px', async ({ page }) => {
    const { oven } = await seed();
    await page.goto('/');
    const button = filterButton(page, oven);
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
  });
});
