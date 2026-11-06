import { expect, test, type Page } from '@playwright/test';
import { ingredientNameFields, quantityFields, saveButton } from '../helpers/recipe-form';
import { signInViaStorage } from '../helpers/session';
import { adminClient, assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, type TestUser } from '../helpers/supabase-admin';
import { sql } from '../helpers/pg';

// T-019 / R-018 crit. 6: editing a linked recipe keeps the link, and the page shows the same text.
let user: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('ecat', { displayName: 'Cato Catalogus' });
});

test.afterAll(async () => {
  if (user) await deleteTestUser(user);
});

test.beforeEach(async ({ page }) => {
  await signInViaStorage(page, user.session);
});

// Reads the page text only after the async review section finished loading, so both reads are comparable.
async function stableMainText(page: Page): Promise<string> {
  await expect(page.getByText('Reviews laden…')).toHaveCount(0);
  await expect(page.getByText('Nog geen reviews')).toBeVisible();
  return page.getByRole('main').innerText();
}

test('editing a linked recipe without renaming keeps the link; renaming to another key drops it', async ({ page }) => {
  const key = await sql<{ id: string }>(`select ingredient_id as id from public.ingredient_keys where key = 'broccoli'`);
  const broccoli = key[0].id;
  const title = `Gekoppeld ${Date.now()}`;
  const row = await insertRecipe(user.client, {
    title,
    ingredients: [{ name: 'Brocolli', quantity: 200, unit: 'g', ingredient_id: broccoli }],
  });

  await page.goto(`/recept/${row.id}`);
  const textBefore = await stableMainText(page);

  await page.goto(`/recept/${row.id}/bewerken`);
  await quantityFields(page).first().fill('300');
  await saveButton(page).click();
  await expect(page).toHaveURL(new RegExp(`/recept/${row.id}$`));

  let stored = await adminClient().from('recipes').select('ingredients').eq('id', row.id).single();
  expect(stored.data?.ingredients[0]).toMatchObject({ name: 'Brocolli', quantity: 300, ingredient_id: broccoli });

  // The page text is the same, apart from the changed quantity.
  const textAfter = await stableMainText(page);
  expect(textAfter).toBe(textBefore.replace('200', '300'));

  await page.goto(`/recept/${row.id}/bewerken`);
  await ingredientNameFields(page).first().fill('Bloemkool');
  await saveButton(page).click();
  await expect(page).toHaveURL(new RegExp(`/recept/${row.id}$`));
  stored = await adminClient().from('recipes').select('ingredients').eq('id', row.id).single();
  expect(stored.data?.ingredients[0].name).toBe('Bloemkool');
  expect(stored.data?.ingredients[0].ingredient_id).toBeUndefined();
});
