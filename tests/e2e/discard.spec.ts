import { expect, test, type Page } from '@playwright/test';
import { fillRecipe, ingredientNameFields, nl, saveButton, titleField } from '../helpers/recipe-form';
import { signInViaStorage } from '../helpers/session';
import { adminClient, assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, type TestUser } from '../helpers/supabase-admin';

// T-005 / R-003 crit. 8: leaving the form with unsaved changes asks "Wijzigingen weggooien?".
let user: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('rdisc');
});

test.afterAll(async () => {
  if (user) await deleteTestUser(user);
});

test.beforeEach(async ({ page }) => {
  await signInViaStorage(page, user.session);
});

const question = (page: Page) => page.getByText(nl['form.discardQuestion']);
const discard = (page: Page) => page.getByRole('button', { name: nl['form.discard'], exact: true });
const stay = (page: Page) => page.getByRole('button', { name: nl['form.stay'], exact: true });
const recipesNav = (page: Page) =>
  page.getByRole('navigation', { name: nl['nav.label'] }).getByRole('link', { name: nl['nav.recipes'] });

const savedWithTitle = async (title: string) =>
  ((await adminClient().from('recipes').select('id').eq('title', title)).data ?? []).length;

test('on /nieuw: a typed title and a tap on "Recepten" asks; "Blijven" keeps the input', async ({ page }) => {
  await page.goto('/nieuw');
  await titleField(page).fill('Half werk');
  await recipesNav(page).click();
  await expect(question(page)).toBeVisible();
  await expect(discard(page)).toBeVisible();
  await stay(page).click();
  await expect(page).toHaveURL(/\/nieuw$/);
  await expect(titleField(page)).toHaveValue('Half werk');
});

test('on /nieuw: "Weggooien" goes to the overview and saves nothing', async ({ page }) => {
  const title = `Weggegooid ${Date.now()}`;
  await page.goto('/nieuw');
  await titleField(page).fill(title);
  await recipesNav(page).click();
  await expect(question(page)).toBeVisible();
  await discard(page).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await savedWithTitle(title)).toBe(0);
});

test('the browser back button asks too (blocked, input stays on "Blijven")', async ({ page }) => {
  // Navigate in-app: page.goto is a full page load, which the router blocker does not see as a history entry of its own.
  await page.goto('/');
  await page.getByRole('navigation', { name: nl['nav.label'] }).getByRole('link', { name: nl['nav.new'] }).click();
  await expect(page).toHaveURL(/\/nieuw$/);
  await titleField(page).fill('Terugknop');
  await page.goBack();
  await expect(question(page)).toBeVisible();
  await stay(page).click();
  await expect(page).toHaveURL(/\/nieuw$/);
  await expect(titleField(page)).toHaveValue('Terugknop');
  await page.goBack();
  await expect(question(page)).toBeVisible();
  await discard(page).click();
  await expect(page).not.toHaveURL(/\/nieuw$/);
});

test('on /bewerken: the question appears after a change', async ({ page }) => {
  const row = await insertRecipe(user.client, { title: `Bewerkbaar ${Date.now()}` });
  await page.goto(`/recept/${row.id}/bewerken`);
  await expect(titleField(page)).toHaveValue(row.title);
  await titleField(page).fill('Gewijzigd');
  await recipesNav(page).click();
  await expect(question(page)).toBeVisible();
  await discard(page).click();
  await expect(page).toHaveURL(/\/$/);
  const check = await adminClient().from('recipes').select('title').eq('id', row.id).single();
  expect(check.data?.title).toBe(row.title);
});

test('no question without changes', async ({ page }) => {
  await page.goto('/nieuw');
  await recipesNav(page).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(question(page)).toHaveCount(0);
});

test('a change set back to the initial value does not count as a change', async ({ page }) => {
  await page.goto('/nieuw');
  await titleField(page).fill('tijdelijk');
  await titleField(page).fill('');
  await recipesNav(page).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(question(page)).toHaveCount(0);
});

test('no question after a successful save', async ({ page }) => {
  await page.goto('/nieuw');
  await fillRecipe(page, { title: `Bewaard ${Date.now()}`, ingredients: ['Zout'], steps: ['Roer.'] });
  await saveButton(page).click();
  await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
  await expect(question(page)).toHaveCount(0);
});

test('with changes, a beforeunload handler calls preventDefault; without changes it does not', async ({ page }) => {
  const probe = () =>
    page.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
  await page.goto('/nieuw');
  expect(await probe()).toBe(false);
  await ingredientNameFields(page).first().fill('Iets');
  expect(await probe()).toBe(true);
});
