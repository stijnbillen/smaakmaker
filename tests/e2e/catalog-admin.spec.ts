import { expect, test, type Page } from '@playwright/test';
import { signInViaStorage } from '../helpers/session';
import { sql } from '../helpers/pg';
import { assertSupabaseUp, createTestUser, deleteTestUser, makeAdmin, type TestUser } from '../helpers/supabase-admin';

// T-025 / R-022 interface. Seeded items are only read; everything that changes uses invented "qzvk..." items.
// Accessible names follow the texts in the task brief (Ingrediënten, Eenheden, Samenvoegen, Verwijderen, Annuleren).
const STORAGE_KEY = 'smaakmaker.lang';
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

let boss: TestUser;
let plain: TestUser;
const items: Array<{ table: 'ingredients' | 'units'; id: string }> = [];
const recipes: string[] = [];

async function addItem(table: 'ingredients' | 'units', nl: string | null, fr: string | null, syn: string[] = []): Promise<string> {
  const rows = await sql<{ id: string }>(
    `insert into public.${table} (name_nl, name_fr, synonyms)
     values (${nl ? lit(nl) : 'null'}, ${fr ? lit(fr) : 'null'}, array[${syn.map(lit).join(',')}]::text[]) returning id`,
  );
  items.push({ table, id: rows[0].id });
  return rows[0].id;
}

async function addRecipe(title: string, ingredientId: string, name: string): Promise<string> {
  const rows = await sql<{ id: string }>(
    `insert into public.recipes (title, author_id, ingredients, steps, prep_minutes, total_minutes, servings)
     values (${lit(title)}, ${lit(boss.id)}, ${lit(JSON.stringify([{ name, ingredient_id: ingredientId }]))}::jsonb, '["Roer."]'::jsonb, 5, 10, 2) returning id`,
  );
  recipes.push(rows[0].id);
  return rows[0].id;
}

test.beforeAll(async () => {
  await assertSupabaseUp();
  boss = await createTestUser('catboss', { displayName: 'Bea Beheer' });
  await makeAdmin(boss.id);
  plain = await createTestUser('catgewoon');
});

test.afterAll(async () => {
  if (recipes.length) await sql(`delete from public.recipes where id in (${recipes.map(lit).join(',')})`).catch(() => undefined);
  for (const i of items.reverse()) await sql(`delete from public.${i.table} where id = ${lit(i.id)}`).catch(() => undefined);
  for (const u of [boss, plain]) if (u) await deleteTestUser(u);
});

async function open(page: Page, lang: 'nl' | 'fr' = 'nl'): Promise<void> {
  await signInViaStorage(page, boss.session);
  await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [STORAGE_KEY, lang]);
  await page.goto('/databank');
}

const search = (page: Page) => page.getByRole('searchbox').or(page.getByRole('textbox', { name: /zoek|cherch/i })).first();
const row = (page: Page, text: string) => page.getByRole('listitem').filter({ hasText: text });

// crit. 1
test('administrator sees the link on Profiel and opens the page (crit. 1)', async ({ page }) => {
  await signInViaStorage(page, boss.session);
  await page.goto('/profiel');
  const link = page.getByRole('link', { name: 'Ingrediënten en eenheden' });
  await expect(link).toBeVisible();
  await link.tap();
  await expect(page).toHaveURL(/\/databank$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ingrediënten en eenheden');
});

test('normal user sees no link and is sent from /databank to /profiel (crit. 1)', async ({ page }) => {
  await signInViaStorage(page, plain.session);
  await page.goto('/profiel');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Profiel');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('link', { name: 'Ingrediënten en eenheden' })).toHaveCount(0);
  await page.goto('/databank');
  await expect(page).toHaveURL(/\/profiel$/);
});

// crit. 2
test('search finds a misspelling with the right count; the Eenheden tab shows units only (crit. 2)', async ({ page }) => {
  const id = await addItem('ingredients', 'qzvkbroccolie', 'qzvkbrocolie');
  await addRecipe('telrecept 1', id, 'qzvkbroccolie');
  await addRecipe('telrecept 2', id, 'qzvkbroccolie');
  await open(page);
  await search(page).fill('qzvkbrocollie');
  const hit = row(page, 'qzvkbroccolie');
  await expect(hit).toBeVisible();
  await expect(hit).toContainText('qzvkbrocolie');
  await expect(hit).toContainText('2 recepten');

  await page.getByRole('tab', { name: 'Eenheden' }).tap();
  await search(page).fill('el');
  await expect(page.getByText('el', { exact: true }).first()).toBeVisible();
  await expect(row(page, 'qzvkbroccolie')).toHaveCount(0);
});

// crit. 3 (R-020 crit. 9): filling in the French name shows in the recipe at once
test('filling in the French name updates the list and the recipe in French (crit. 3)', async ({ page }) => {
  const id = await addItem('ingredients', 'qzvknaamitem', null);
  const r = await addRecipe('naamrecept', id, 'qzvknaamitem');
  await open(page);
  await search(page).fill('qzvknaamitem');
  await row(page, 'qzvknaamitem').first().tap();
  await page.getByLabel('Franse naam', { exact: true }).fill('qzvknomfr');
  await page.getByRole('button', { name: 'Opslaan' }).tap();
  await expect(row(page, 'qzvknomfr').first()).toBeVisible();
  const saved = await sql<{ name_fr: string }>(`select name_fr from public.ingredients where id = ${lit(id)}`);
  expect(saved[0].name_fr).toBe('qzvknomfr');

  await open(page, 'fr');
  await page.goto(`/recept/${r}`);
  await expect(page.getByRole('listitem').filter({ hasText: 'qzvknomfr' })).toBeVisible();
});

// crit. 3
for (const [lang, message] of [
  ['nl', 'Bestaat al bij qzvktomaatnl.'],
  ['fr', 'Existe déjà chez qzvktomatefr.'],
] as const) {
  test(`adding a synonym that belongs to another item shows "${message}" (crit. 3, ${lang})`, async ({ page }) => {
    const a = await addItem('ingredients', `qzvkaard${lang}`, null);
    // Own "other" item per language so the two variants never share state.
    await addItem('ingredients', `qzvktomaat${lang}`, `qzvktomate${lang}`);
    await open(page, lang);
    await search(page).fill(`qzvkaard${lang}`);
    await row(page, `qzvkaard${lang}`).first().tap();
    await page.getByRole('textbox', { name: /synoni|synonym/i }).fill(`qzvktomate${lang}`);
    await page.getByRole('button', { name: /toevoegen|ajouter/i }).tap();
    await page.getByRole('button', { name: /opslaan|enregistrer/i }).tap();
    await expect(page.getByText(message)).toBeVisible();
    const after = await sql<{ synonyms: string[] }>(`select synonyms from public.ingredients where id = ${lit(a)}`);
    expect(after[0].synonyms).toEqual([]);
  });
}

// crit. 4
test('merge asks for confirmation; Annuleren changes nothing; confirming merges A into B (crit. 4)', async ({ page }) => {
  const a = await addItem('ingredients', 'qzvkbrocolli-test', null);
  const b = await addItem('ingredients', 'qzvkbroccoli-doel', null);
  const r = await addRecipe('samenvoegrecept', a, 'qzvkbrocolli-test');
  await open(page);
  await search(page).fill('qzvkbrocolli-test');
  await row(page, 'qzvkbrocolli-test').first().tap();
  await page.getByRole('button', { name: /samenvoegen/i }).tap();
  await search(page).last().fill('qzvkbroccoli-doel');
  await page.getByRole('option', { name: /qzvkbroccoli-doel/ }).or(row(page, 'qzvkbroccoli-doel')).last().tap();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Annuleren' }).tap();
  expect((await sql(`select 1 from public.ingredients where id = ${lit(a)}`)).length).toBe(1);
  const untouched = await sql<{ ingredients: Array<{ ingredient_id: string }> }>(`select ingredients from public.recipes where id = ${lit(r)}`);
  expect(untouched[0].ingredients[0].ingredient_id).toBe(a);

  await page.getByRole('button', { name: /samenvoegen/i }).first().tap();
  await dialog.getByRole('button', { name: /samenvoegen/i }).tap();
  await expect(dialog).toHaveCount(0);
  // Interface must reload: A gone from the list, B now shows the recipe.
  await search(page).first().fill('qzvkbrocolli-test');
  // A's name becomes a synonym of B (crit. 4), so a search on it may still match B's row,
  // but no separate row for A may remain: every match must be B's row.
  await expect(row(page, 'qzvkbrocolli-test').filter({ hasNotText: 'qzvkbroccoli-doel' })).toHaveCount(0);
  await search(page).first().fill('qzvkbroccoli-doel');
  await expect(row(page, 'qzvkbroccoli-doel').first()).toContainText('1 recept');
  // Merge is async: poll until the item is gone instead of checking once.
  await expect
    .poll(async () => (await sql(`select 1 from public.ingredients where id = ${lit(a)}`)).length)
    .toBe(0);
  const lines = await sql<{ ingredients: Array<{ ingredient_id: string }> }>(`select ingredients from public.recipes where id = ${lit(r)}`);
  expect(lines[0].ingredients[0].ingredient_id).toBe(b);
});

// crit. 5
test('deleting an item in use shows the count in Dutch and French; an unused item disappears (crit. 5)', async ({ page }) => {
  const used = await addItem('ingredients', 'qzvkgebruiktitem', null);
  await addRecipe('gebruik 1', used, 'qzvkgebruiktitem');
  await addRecipe('gebruik 2', used, 'qzvkgebruiktitem');
  const free = await addItem('ingredients', 'qzvkvrijitem', null);
  const messages = { nl: 'In gebruik door 2 recepten; voeg het samen met een ander item.', fr: 'Utilisé dans 2 recettes ; fusionnez-le avec un autre élément.' } as const;
  for (const lang of ['nl', 'fr'] as const) {
    await open(page, lang);
    await search(page).fill('qzvkgebruiktitem');
    await row(page, 'qzvkgebruiktitem').first().tap();
    await page.getByRole('button', { name: /verwijderen|supprimer/i }).tap();
    await page.getByRole('alertdialog').getByRole('button', { name: /verwijderen|supprimer/i }).tap();
    await expect(page.getByText(messages[lang])).toBeVisible();
  }
  expect((await sql(`select 1 from public.ingredients where id = ${lit(used)}`)).length).toBe(1);

  await open(page);
  await search(page).fill('qzvkvrijitem');
  await row(page, 'qzvkvrijitem').first().tap();
  await page.getByRole('button', { name: /verwijderen/i }).tap();
  await page.getByRole('alertdialog').getByRole('button', { name: /verwijderen/i }).tap();
  await expect(row(page, 'qzvkvrijitem')).toHaveCount(0);
  expect((await sql(`select 1 from public.ingredients where id = ${lit(free)}`)).length).toBe(0);
});

// crit. 7
test('the page has no tab or field for sizes (crit. 7)', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tab', { name: /formaat|taille/i })).toHaveCount(0);
  await expect(page.getByText(/middelgroot/i)).toHaveCount(0);
});
