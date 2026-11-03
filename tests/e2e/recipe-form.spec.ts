import { expect, test, type Page } from '@playwright/test';
import {
  addIngredientButton,
  addStepButton,
  expectIngredientOrder,
  expectStepOrder,
  fillRecipe,
  ingredientNameFields,
  isRecipePost,
  nl,
  quantityFields,
  saveButton,
  stepFields,
  titleField,
} from '../helpers/recipe-form';
import { signInViaStorage } from '../helpers/session';
import { assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, type TestUser } from '../helpers/supabase-admin';

// T-005 / R-003 form: validation, limits, reordering, saving. Local Supabase, viewport 360 x 640.
let user: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('rform', { displayName: 'Vera Vorm' });
});

test.afterAll(async () => {
  if (user) await deleteTestUser(user);
});

test.beforeEach(async ({ page }) => {
  await signInViaStorage(page, user.session);
});

const unique = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function saveAndWaitForDetail(page: Page): Promise<string> {
  await saveButton(page).click();
  await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname.split('/')[2];
}

test.describe('crit. 1: required fields', () => {
  test('tapping "Opslaan" on an empty form shows messages at title, ingredients and steps and sends nothing', async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (r) => {
      if (isRecipePost(r)) posts.push(r.url());
    });
    await page.goto('/nieuw');
    await saveButton(page).click();

    await expect(page.getByText(nl['form.titleInvalid'])).toBeVisible();
    await expect(page.getByText(nl['form.ingredientsRequired'])).toBeVisible();
    await expect(page.getByText(nl['form.stepsRequired'])).toBeVisible();

    // The title field points to its message (aria-invalid + aria-describedby).
    const title = titleField(page);
    await expect(title).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await title.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const messageText = await page.evaluate(
      (ids) => ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '),
      describedBy!,
    );
    expect(messageText).toContain(nl['form.titleInvalid']);

    // Ingredients and steps are flagged too.
    expect(await page.locator('[aria-invalid="true"]').count()).toBeGreaterThanOrEqual(3);

    expect(posts).toEqual([]);
    await expect(page).toHaveURL(/\/nieuw$/);
  });

  test('a title of 101 characters is refused with a message, 100 characters (with spaces around) is saved', async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (r) => {
      if (isRecipePost(r)) posts.push(r.url());
    });
    await page.goto('/nieuw');
    await fillRecipe(page, { title: 'a'.repeat(101), ingredients: ['Zout'], steps: ['Roer.'] });
    await saveButton(page).click();
    await expect(page.getByText(nl['form.titleInvalid'])).toBeVisible();
    expect(posts).toEqual([]);

    await titleField(page).fill(`  ${'b'.repeat(100)}  `);
    await saveAndWaitForDetail(page);
    expect(posts).toHaveLength(1);
  });
});

test.describe('crit. 2: field rules and limits', () => {
  test('a wrong quantity gives a message at that field and nothing is sent', async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (r) => {
      if (isRecipePost(r)) posts.push(r.url());
    });
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Hoeveelheid'), ingredients: [{ name: 'Meel', quantity: '1,234' }], steps: ['Roer.'] });
    await saveButton(page).click();
    await expect(page.getByText(nl['form.quantityInvalid'])).toBeVisible();
    await expect(quantityFields(page).first()).toHaveAttribute('aria-invalid', 'true');
    expect(posts).toEqual([]);
  });

  test('"Ingrediënt toevoegen" is disabled at 60 ingredients', async ({ page }) => {
    await page.goto('/nieuw');
    const add = addIngredientButton(page);
    for (let i = 1; i < 60; i++) await add.click();
    await expect(ingredientNameFields(page)).toHaveCount(60);
    await expect(add).toBeDisabled();
  });

  test('"Stap toevoegen" is disabled at 40 steps', async ({ page }) => {
    await page.goto('/nieuw');
    const add = addStepButton(page);
    for (let i = 1; i < 40; i++) await add.click();
    await expect(stepFields(page)).toHaveCount(40);
    await expect(add).toBeDisabled();
  });
});

test.describe('crit. 3: reorder and remove', () => {
  test('moves and removes ingredients and steps; the detail page keeps that order, steps numbered', async ({ page }) => {
    const title = unique('Volgorde');
    await page.goto('/nieuw');
    await fillRecipe(page, { title, ingredients: ['A', 'B', 'C'], steps: ['Eerst', 'Dan', 'Laatst'] });

    // Ingredients
    await page.getByRole('button', { name: 'Ingrediënt 1 omlaag' }).click();
    await expectIngredientOrder(page, ['B', 'A', 'C']);
    await page.getByRole('button', { name: 'Ingrediënt 1 verwijderen' }).click(); // removes B
    await expectIngredientOrder(page, ['A', 'C']);

    // Steps
    await page.getByRole('button', { name: 'Stap 1 omlaag' }).click();
    await expectStepOrder(page, ['Dan', 'Eerst', 'Laatst']);
    await page.getByRole('button', { name: 'Stap 1 verwijderen' }).click(); // removes "Dan"
    await expectStepOrder(page, ['Eerst', 'Laatst']);

    await saveAndWaitForDetail(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    const ingredients = page.getByRole('listitem').filter({ hasText: /^(A|C)$/ });
    await expect(ingredients).toHaveCount(2);
    await expect(ingredients.nth(0)).toHaveText('A');
    await expect(ingredients.nth(1)).toHaveText('C');
    const steps = page.locator('ol > li');
    await expect(steps).toHaveCount(2);
    await expect(steps.nth(0)).toContainText('Eerst');
    await expect(steps.nth(1)).toContainText('Laatst');
  });

  test('move up on the first and move down on the last row change nothing', async ({ page }) => {
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Rand'), ingredients: ['A', 'B'], steps: ['x'] });
    // Disabled or a no-op: either way the order stays.
    await page.getByRole('button', { name: 'Ingrediënt 1 omhoog' }).click({ force: true }).catch(() => undefined);
    await page.getByRole('button', { name: 'Ingrediënt 2 omlaag' }).click({ force: true }).catch(() => undefined);
    await expectIngredientOrder(page, ['A', 'B']);
  });

  test('the buttons are at least 44 x 44 px and have an accessible name with the number', async ({ page }) => {
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Tikdoel'), ingredients: ['A', 'B'], steps: ['x', 'y'] });
    for (const name of ['Ingrediënt 2 omhoog', 'Ingrediënt 1 omlaag', 'Ingrediënt 2 verwijderen', 'Stap 2 omhoog', 'Stap 1 omlaag', 'Stap 2 verwijderen']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('crit. 4 and 5: save, overview, detail', () => {
  test('saves via /nieuw, shows the detail page, and the overview lists it first with title and author', async ({ page }) => {
    const title = unique('Tomatensoep');
    await page.goto('/nieuw');
    await fillRecipe(page, {
      title,
      ingredients: [{ name: 'Tomaten', quantity: '0,5', unit: 'kg' }, { name: 'Zout' }],
      steps: ['Snijd de tomaten.', 'Kook de soep.'],
    });
    const id = await saveAndWaitForDetail(page);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.getByText(/0,5\s*kg\s*Tomaten/)).toBeVisible();
    await expect(page.getByText('Zout')).toBeVisible();
    const steps = page.locator('ol > li');
    await expect(steps).toHaveCount(2);
    await expect(steps.nth(0)).toContainText('Snijd de tomaten.');
    await expect(page.getByText(/Vera Vorm/)).toBeVisible(); // AuthorLine

    // Overview: newest first, whole item opens the detail page.
    await page.goto('/');
    const first = page.getByRole('listitem').first();
    await expect(first).toContainText(title);
    await expect(first).toContainText('Vera Vorm'); // crit. 5: author next to the title
    await first.getByText(title).click();
    await expect(page).toHaveURL(new RegExp(`/recept/${id}$`));
  });

  test('the new form was left behind: after saving, going on to the detail page is not blocked', async ({ page }) => {
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Niet blokkeren'), ingredients: ['Zout'], steps: ['Roer.'] });
    await saveButton(page).click();
    await expect(page.getByText(nl['form.discardQuestion'])).toHaveCount(0);
    await expect(page).toHaveURL(/\/recept\//);
  });

  test.describe('unknown recipes', () => {
    for (const [label, path] of [
      ['an unknown uuid', '/recept/00000000-0000-4000-8000-000000000000'],
      ['an invalid uuid', '/recept/geen-uuid'],
    ] as const) {
      test(`${label} shows "Recept niet gevonden." with a link back, without a connection banner`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByText(nl['recipe.notFound'])).toBeVisible();
        await expect(page.getByRole('link', { name: nl['recipe.backToList'] })).toBeVisible();
        await expect(page.getByText(nl['connection.error'] ?? 'Geen verbinding')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Opnieuw proberen' })).toHaveCount(0);
      });
    }
  });
});

test.describe('crit. 6: editing', () => {
  test('the author edits the title; it shows on the detail page and in the overview, in the same place', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Voor bewerking') });
    const newTitle = unique('Na bewerking');
    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(titleField(page)).toHaveValue(row.title);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(nl['form.editTitle']);
    await titleField(page).fill(newTitle);
    await saveButton(page).click();
    await expect(page).toHaveURL(new RegExp(`/recept/${row.id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(newTitle);
    await page.goto('/');
    await expect(page.getByRole('listitem').filter({ hasText: newTitle })).toBeVisible();
  });

  test('an update that returns 0 rows shows "Opslaan mislukt." and keeps the input', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Verdwenen') });
    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(titleField(page)).toHaveValue(row.title);
    await page.route(/\/rest\/v1\/recipes/, async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      } else {
        await route.continue();
      }
    });
    await titleField(page).fill('Nieuwe titel die niet lukt');
    await saveButton(page).click();
    await expect(page.getByText(nl['form.error'])).toBeVisible();
    await expect(page).toHaveURL(/\/bewerken$/);
    await expect(titleField(page)).toHaveValue('Nieuwe titel die niet lukt');
  });
});
