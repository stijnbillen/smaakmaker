import { expect, test, type Page } from '@playwright/test';
import {
  catalogQuestion,
  factorField,
  factorSave,
  googleLink,
  ingredientNameFields,
  measureChoice,
  measureQuestion,
  quantityFields,
  saveButton,
  startNewUnit,
  stepFields,
  text,
  titleField,
  prepField,
  totalField,
  servingsField,
  unitFields,
} from '../helpers/recipe-form';
import { signInViaStorage } from '../helpers/session';
import { sql } from '../helpers/pg';
import { adminClient, assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, makeAdmin, type TestUser } from '../helpers/supabase-admin';

// T-032 / R-033 in the recipe form and in the catalogue administration, at 360 x 640.
// Texts are looked up by key (form.measure*, form.factor*, form.google*, catalogAdmin.measure*, catalogAdmin.factor).
let user: TestUser;
let boss: TestUser;
const titles: string[] = [];
const units: string[] = [];
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
// Random consonants: a near match would turn "new unit" into "Bedoelde u …?".
const rnd = () => Array.from({ length: 10 }, () => 'bcdfghjklmnpqrstvwxz'[Math.floor(Math.random() * 20)]).join('');
const newUnit = () => {
  const u = `zq${rnd()}`;
  units.push(u);
  return u;
};

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('measure', { displayName: 'Mia Maat' });
  boss = await createTestUser('measboss', { displayName: 'Bea Beheer' });
  await makeAdmin(boss.id);
});

test.afterAll(async () => {
  if (titles.length) await sql(`delete from public.recipes where title in (${titles.map(lit).join(',')})`).catch(() => undefined);
  if (units.length) await sql(`delete from public.units where name_nl in (${units.map(lit).join(',')}) or name_fr in (${units.map(lit).join(',')})`).catch(() => undefined);
  for (const u of [user, boss]) if (u) await deleteTestUser(u);
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await signInViaStorage(page, user.session);
});

async function openNew(page: Page, lang: 'nl' | 'fr' = 'nl') {
  await page.addInitScript((l) => window.localStorage.setItem('smaakmaker.lang', l), lang);
  await page.goto('/nieuw');
  await expect(titleField(page)).toBeVisible().catch(() => undefined);
}

const unitRows = (name: string) =>
  sql<{ measure: string; factor: string | null }>(
    `select measure, factor::text as factor from public.units where name_nl = ${lit(name)} or name_fr = ${lit(name)}`,
  );

/** Title, times, servings, one step and the first line ("zout", 2): only the unit under test is left. */
async function fillRest(page: Page, title: string) {
  titles.push(title);
  await titleField(page).fill(title);
  await prepField(page).fill('5');
  await totalField(page).fill('10');
  await servingsField(page).fill('2');
  await stepFields(page).first().fill('Roer.');
  await ingredientNameFields(page).first().fill('zout');
  await quantityFields(page).first().fill('2');
}

test.describe('kind question after "Ja" (crit. 4)', () => {
  test('"Ja" asks for the kind with four choices and creates nothing yet', async ({ page }) => {
    const unit = newUnit();
    await openNew(page);
    await startNewUnit(page, unit);
    const q = measureQuestion(page, unit);
    for (const k of ['Volume', 'Weight', 'None', 'Unknown'] as const) {
      await expect(q.getByRole('button', { name: text(`form.measure${k}`), exact: true })).toBeVisible();
    }
    expect(await unitRows(unit)).toHaveLength(0);
    // Tap targets of at least 44 px and no sideways scrolling at 360 px.
    for (const k of ['Volume', 'Weight', 'None', 'Unknown'] as const) {
      const box = await q.getByRole('button', { name: text(`form.measure${k}`), exact: true }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('the question is in French in a French run', async ({ page }) => {
    const unit = newUnit();
    await openNew(page, 'fr');
    await startNewUnit(page, unit, 'fr');
    await expect(measureQuestion(page, unit, 'fr')).toBeVisible();
    await expect(measureChoice(page, 'Volume', 'fr')).toBeVisible();
    await expect(measureChoice(page, 'None', 'fr')).toBeVisible();
    expect(await unitRows(unit)).toHaveLength(0);
  });

  test('"Nee" keeps the unit as free text: no kind question, nothing in the database (crit. 8)', async ({ page }) => {
    const unit = newUnit();
    await openNew(page);
    await unitFields(page).first().fill(unit);
    await quantityFields(page).first().click();
    await expect(catalogQuestion(page)).toBeVisible();
    await page.getByRole('button', { name: text('form.no'), exact: true }).click();
    await expect(catalogQuestion(page)).toHaveCount(0);
    await expect(page.getByRole('group', { name: text('form.measureQuestion', 'nl', { name: unit }), exact: true })).toHaveCount(0);
    expect(await unitRows(unit)).toHaveLength(0);
  });
});

test.describe('factor for volume and weight (crit. 5)', () => {
  test('an invalid factor shows a message at the field and stores nothing; "250" then creates the unit and links the line', async ({ page }) => {
    const unit = newUnit();
    const title = `Maat ${Date.now()}-${rnd()}`;
    await openNew(page);
    await fillRest(page, title);
    await startNewUnit(page, unit);
    await measureChoice(page, 'Volume').click();

    const field = factorField(page, unit, 'Volume');
    await expect(field).toBeVisible();
    await expect(field).toHaveAttribute('inputmode', 'decimal');
    for (const bad of ['0', '', '-1', '1,2345', '100000,001', 'abc']) {
      await field.fill(bad);
      await factorSave(page, field).click();
      await expect(field, `"${bad}"`).toHaveAttribute('aria-invalid', 'true');
      const describedBy = await field.getAttribute('aria-describedby');
      expect(describedBy, `"${bad}"`).toBeTruthy();
      await expect(page.locator(`#${describedBy}`)).toHaveText(text('form.factorInvalid'));
      expect(await unitRows(unit), `"${bad}"`).toHaveLength(0);
    }

    await field.fill('250');
    await factorSave(page, field).click();
    await expect.poll(async () => (await unitRows(unit)).length).toBe(1);
    expect(Number((await unitRows(unit))[0].factor)).toBe(250);
    expect((await unitRows(unit))[0].measure).toBe('volume');

    // The line is linked: saving the recipe stores the unit_id and the detail page shows the unit.
    await expect(catalogQuestion(page)).toHaveCount(0);
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    const saved = await adminClient().from('recipes').select('ingredients').eq('title', title).single();
    const unitId = (await sql<{ id: string }>(`select id from public.units where name_nl = ${lit(unit)}`))[0].id;
    expect((saved.data?.ingredients as Array<Record<string, unknown>>)[0].unit_id).toBe(unitId);
    await expect(page.getByRole('main')).toContainText(unit);
  });

  test('weight asks "Hoeveel g …" and stores kind weight', async ({ page }) => {
    const unit = newUnit();
    await openNew(page);
    await startNewUnit(page, unit);
    await measureChoice(page, 'Weight').click();
    const field = factorField(page, unit, 'Weight');
    await expect(field).toBeVisible();
    await field.fill('0,5');
    await factorSave(page, field).click();
    await expect.poll(async () => (await unitRows(unit)).length).toBe(1);
    const [stored] = await unitRows(unit);
    expect(stored.measure).toBe('weight');
    expect(Number(stored.factor)).toBe(0.5);
  });

  test('"Terug" returns to the kind question and stores nothing', async ({ page }) => {
    const unit = newUnit();
    await openNew(page);
    await startNewUnit(page, unit);
    await measureChoice(page, 'Volume').click();
    const field = factorField(page, unit, 'Volume');
    await page.getByRole('group').filter({ has: field }).getByRole('button', { name: text('form.factorBack'), exact: true }).click();
    await expect(measureQuestion(page, unit)).toBeVisible();
    expect(await unitRows(unit)).toHaveLength(0);
  });

  test('French run: the factor question is in French', async ({ page }) => {
    const unit = newUnit();
    await openNew(page, 'fr');
    await startNewUnit(page, unit, 'fr');
    await measureChoice(page, 'Volume', 'fr').click();
    await expect(factorField(page, unit, 'Volume', 'fr')).toBeVisible();
  });
});

test.describe('"Geen van beide" and "Ik weet het niet" (crit. 6)', () => {
  for (const choice of ['None', 'Unknown'] as const) {
    test(`${choice} stores the unit as none/null and links the line`, async ({ page }) => {
      const unit = newUnit();
      const title = `Maat ${choice} ${Date.now()}-${rnd()}`;
      await openNew(page);
      await fillRest(page, title);
      await startNewUnit(page, unit);
      await measureChoice(page, choice).click();
      await expect.poll(async () => (await unitRows(unit)).length).toBe(1);
      expect((await unitRows(unit))[0]).toEqual({ measure: 'none', factor: null });
      await expect(catalogQuestion(page)).toHaveCount(0);
      await saveButton(page).click();
      await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
      const saved = await adminClient().from('recipes').select('ingredients').eq('title', title).single();
      const unitId = (await sql<{ id: string }>(`select id from public.units where name_nl = ${lit(unit)}`))[0].id;
      expect((saved.data?.ingredients as Array<Record<string, unknown>>)[0].unit_id).toBe(unitId);
    });
  }
});

test.describe('"Zoek op Google" (crit. 7)', () => {
  test('links open a new tab with the right search, and nothing goes to Google before a tap', async ({ page }) => {
    const unit = newUnit();
    const toGoogle: string[] = [];
    page.on('request', (r) => {
      if (/(^|\.)google\./.test(new URL(r.url()).hostname)) toGoogle.push(r.url());
    });
    await openNew(page);
    await startNewUnit(page, unit);

    // Next to "Ik weet het niet": the search for ml.
    const q = measureQuestion(page, unit);
    const link = googleLink(q);
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAttribute('href', `https://www.google.com/search?q=${encodeURIComponent(`1 ${unit} in ml`)}`);

    // Next to the factor field: ml for volume, g for weight.
    await measureChoice(page, 'Volume').click();
    const field = factorField(page, unit, 'Volume');
    const volumeLink = googleLink(page.getByRole('group').filter({ has: field }));
    await expect(volumeLink).toHaveAttribute('target', '_blank');
    await expect(volumeLink).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(volumeLink).toHaveAttribute('href', `https://www.google.com/search?q=${encodeURIComponent(`1 ${unit} in ml`)}`);

    await page.getByRole('group').filter({ has: field }).getByRole('button', { name: text('form.factorBack'), exact: true }).click();
    await measureChoice(page, 'Weight').click();
    const weightField = factorField(page, unit, 'Weight');
    await expect(googleLink(page.getByRole('group').filter({ has: weightField }))).toHaveAttribute(
      'href',
      `https://www.google.com/search?q=${encodeURIComponent(`1 ${unit} in g`)}`,
    );

    await page.waitForTimeout(500);
    expect(toGoogle).toEqual([]);
  });

  test('in French the search text is French', async ({ page }) => {
    const unit = newUnit();
    await openNew(page, 'fr');
    await startNewUnit(page, unit, 'fr');
    await expect(googleLink(measureQuestion(page, unit, 'fr'), 'fr')).toHaveAttribute(
      'href',
      `https://www.google.com/search?q=${encodeURIComponent(`1 ${unit} en ml`)}`,
    );
  });
});

test.describe('administration (crit. 9)', () => {
  const choice = (page: Page, key: 'Volume' | 'Weight' | 'None') =>
    page.getByRole('radio', { name: text(`catalogAdmin.measure${key}`), exact: true }).or(
      page.getByRole('button', { name: text(`catalogAdmin.measure${key}`), exact: true }),
    );

  test('an administrator sets Volume and 250 on a unit; an invalid factor shows a message at the field', async ({ page }) => {
    const unit = newUnit();
    const row = await sql<{ id: string }>(`insert into public.units (name_nl) values (${lit(unit)}) returning id`);
    await signInViaStorage(page, boss.session);
    await page.goto('/databank');
    await page.getByRole('tab', { name: text('catalogAdmin.tab.units'), exact: true }).tap();
    await page.getByRole('searchbox').or(page.getByRole('textbox', { name: text('catalogAdmin.search') })).first().fill(unit);
    await page.getByRole('listitem').filter({ hasText: unit }).first().tap();

    await choice(page, 'Volume').first().tap();
    const factor = page.getByRole('textbox', { name: text('catalogAdmin.factor'), exact: true });
    await expect(factor).toBeVisible();
    await factor.fill('0');
    await page.getByRole('button', { name: text('form.save'), exact: true }).tap();
    await expect(factor).toHaveAttribute('aria-invalid', 'true');
    expect(await sql(`select 1 from public.units where id = ${lit(row[0].id)} and measure <> 'none'`)).toHaveLength(0);

    await factor.fill('250');
    await page.getByRole('button', { name: text('form.save'), exact: true }).tap();
    await expect
      .poll(async () => (await sql<{ measure: string; factor: string }>(`select measure, factor::text as factor from public.units where id = ${lit(row[0].id)}`))[0]?.measure)
      .toBe('volume');

    // After reloading the editor shows the saved values.
    await page.reload();
    await page.getByRole('tab', { name: text('catalogAdmin.tab.units'), exact: true }).tap();
    await page.getByRole('searchbox').or(page.getByRole('textbox', { name: text('catalogAdmin.search') })).first().fill(unit);
    await page.getByRole('listitem').filter({ hasText: unit }).first().tap();
    await expect(page.getByRole('textbox', { name: text('catalogAdmin.factor'), exact: true })).toHaveValue(/^250([.,]0+)?$/);
  });

  test('the kind and factor fields exist for units only, and the factor is hidden for "Geen van beide"', async ({ page }) => {
    const unit = newUnit();
    await sql(`insert into public.units (name_nl) values (${lit(unit)})`);
    await signInViaStorage(page, boss.session);
    await page.goto('/databank');
    await page.getByRole('searchbox').or(page.getByRole('textbox', { name: text('catalogAdmin.search') })).first().fill('broccoli');
    await page.getByRole('listitem').filter({ hasText: 'broccoli' }).first().tap();
    await expect(page.getByRole('textbox', { name: text('catalogAdmin.factor'), exact: true })).toHaveCount(0);

    await page.getByRole('tab', { name: text('catalogAdmin.tab.units'), exact: true }).tap();
    await page.getByRole('searchbox').or(page.getByRole('textbox', { name: text('catalogAdmin.search') })).first().fill(unit);
    await page.getByRole('listitem').filter({ hasText: unit }).first().tap();
    await expect(page.getByRole('textbox', { name: text('catalogAdmin.factor'), exact: true })).toHaveCount(0);
    await choice(page, 'Weight').first().tap();
    await expect(page.getByRole('textbox', { name: text('catalogAdmin.factor'), exact: true })).toBeVisible();
  });
});

test.describe('recipes unchanged (crit. 10)', () => {
  test('"2 el olie" scaled to 8 servings (x4) shows "8 el olie", never "60 ml"', async ({ page }) => {
    const row = await insertRecipe(user.client, {
      title: `Olie ${Date.now()}-${rnd()}`,
      servings: 2,
      ingredients: [{ name: 'olie', quantity: 2, unit: 'el' }],
    });
    titles.push(row.title);
    await page.goto(`/recept/${row.id}`);
    const more = page.getByRole('button', { name: text('servings.increase'), exact: true });
    for (let i = 0; i < 6; i++) await more.click();
    const list = page.locator('.ingredient-list');
    await expect(list).toContainText('8 el');
    await expect(list).toContainText('olie');
    await expect(list).not.toContainText('60');
    await expect(list).not.toContainText('ml');
  });

  test('a recipe with a linked "el" still shows "el" (kind and factor are not shown)', async ({ page }) => {
    const elId = (await sql<{ id: string }>(`select unit_id as id from public.unit_keys where key = 'el'`))[0].id;
    const row = await insertRecipe(user.client, {
      title: `Eenheid ${Date.now()}-${rnd()}`,
      ingredients: [{ name: 'olie', quantity: 3, unit: 'el', unit_id: elId }],
    });
    titles.push(row.title);
    await page.goto(`/recept/${row.id}`);
    await expect(page.locator('.ingredient-list')).toContainText('3 el');
    await expect(page.locator('.ingredient-list')).not.toContainText('45');
  });
});
