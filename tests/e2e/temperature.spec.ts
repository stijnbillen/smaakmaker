import { expect, test, type Page } from '@playwright/test';
import fr from '../../src/i18n/fr.json' with { type: 'json' };
import nl from '../../src/i18n/nl.json' with { type: 'json' };
import { noteField, saveButton, stepFields, titleField } from '../helpers/recipe-form';
import { seedLanguage, signInViaStorage } from '../helpers/session';
import { adminClient, assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, type TestUser } from '../helpers/supabase-admin';

// T-031 / R-031: temperature unit choice on Profile and conversion on the detail page. Local Supabase, 360 px.
const TEXTS = { nl: nl as Record<string, string>, fr: fr as Record<string, string> } as const;
type Lang = 'nl' | 'fr';
const KEY = 'smaakmaker.tempUnit';

let user: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('temp', { displayName: 'Tom Temp' });
});

test.afterAll(async () => {
  if (user) await deleteTestUser(user);
});

const unique = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const group = (page: Page, lang: Lang) => page.getByRole('group', { name: TEXTS[lang]['temperature.label'], exact: true });
const celsius = (page: Page, lang: Lang) => group(page, lang).getByRole('button', { name: TEXTS[lang]['temperature.celsius'], exact: true });
const fahrenheit = (page: Page, lang: Lang) => group(page, lang).getByRole('button', { name: TEXTS[lang]['temperature.fahrenheit'], exact: true });
const steps = (page: Page) => page.locator('.step-list');
const note = (page: Page) => page.getByTestId('recipe-note');

async function signIn(page: Page, lang: Lang = 'nl', unit?: 'C' | 'F') {
  await signInViaStorage(page, user.session);
  await seedLanguage(page, lang);
  if (unit) await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [KEY, unit] as [string, string]);
}

test.describe('crit. 1: choice on Profile', () => {
  for (const lang of ['nl', 'fr'] as const) {
    test(`default °C, choice survives reload and changes the recipe, ${lang}`, async ({ page }) => {
      const row = await insertRecipe(user.client, { title: unique('Oven'), steps: ['Verwarm op 180 °C.'] });
      await signIn(page, lang);
      await page.goto('/profiel');
      await expect(group(page, lang)).toBeVisible();
      await expect(celsius(page, lang)).toHaveAttribute('aria-pressed', 'true');
      await expect(fahrenheit(page, lang)).toHaveAttribute('aria-pressed', 'false');
      await fahrenheit(page, lang).click();
      await page.reload();
      await expect(fahrenheit(page, lang)).toHaveAttribute('aria-pressed', 'true');
      await page.goto(`/recept/${row.id}`);
      await expect(steps(page)).toContainText('356 °F');
    });

    test(`both buttons are >= 44 x 44 px and Profile does not scroll sideways, ${lang}`, async ({ page }) => {
      await signIn(page, lang);
      await page.goto('/profiel');
      for (const button of [celsius(page, lang), fahrenheit(page, lang)]) {
        const box = await button.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('the choice stays on the device: a new browser context with the same user starts on °C', async ({ page, browser }) => {
    await signIn(page);
    await page.goto('/profiel');
    await fahrenheit(page, 'nl').click();
    await expect(fahrenheit(page, 'nl')).toHaveAttribute('aria-pressed', 'true');
    const other = await browser.newContext({ viewport: { width: 360, height: 640 }, locale: 'nl-BE' });
    try {
      const page2 = await other.newPage();
      await signIn(page2);
      await page2.goto('/profiel');
      await expect(celsius(page2, 'nl')).toHaveAttribute('aria-pressed', 'true');
    } finally {
      await other.close();
    }
  });
});

test.describe('crit. 2 and 4: conversion in steps and note', () => {
  test('°F: step and note converted, line breaks in the note stay', async ({ page }) => {
    const row = await insertRecipe(user.client, {
      title: unique('Omzetten'),
      steps: ['Verwarm de oven voor op 180 °C.'],
      note: 'Of 160°C hetelucht.\nTweede regel',
    });
    await signIn(page, 'nl', 'F');
    await page.goto(`/recept/${row.id}`);
    await expect(steps(page)).toContainText('Verwarm de oven voor op 356 °F.');
    await expect(note(page)).toContainText('Of 320 °F hetelucht.');
    const text = await note(page).evaluate((el) => (el as HTMLElement).innerText);
    expect(text).toContain('hetelucht.\nTweede regel');
  });

  test('default °C shows "180°C" exactly as written', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Gelijk'), steps: ['Bak op 180°C.'] });
    await signIn(page);
    await page.goto(`/recept/${row.id}`);
    await expect(steps(page)).toContainText('Bak op 180°C.');
  });
});

test.describe('crit. 6: only the display changes', () => {
  test('edit and variant show the original text; saving keeps the original in the database', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Origineel'), steps: ['Bak op 180 °C.'], note: 'Of 180 °C hetelucht.' });
    await signIn(page, 'nl', 'F');
    await page.goto(`/recept/${row.id}`);
    await expect(steps(page)).toContainText('356 °F');
    await expect(note(page)).toContainText('356 °F');

    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(stepFields(page).first()).toHaveValue('Bak op 180 °C.');
    await expect(noteField(page)).toHaveValue('Of 180 °C hetelucht.');
    await saveButton(page).click();
    await expect(page).toHaveURL(new RegExp(`/recept/${row.id}$`));
    const saved = await adminClient().from('recipes').select('steps,note').eq('id', row.id).single();
    expect(saved.data).toEqual({ steps: ['Bak op 180 °C.'], note: 'Of 180 °C hetelucht.' });

    await page.goto(`/recept/${row.id}/variant`);
    await expect(stepFields(page).first()).toHaveValue('Bak op 180 °C.');
    await expect(noteField(page)).toHaveValue('Of 180 °C hetelucht.');
    const title = unique('Variantje');
    await titleField(page).fill(title);
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
    const variant = await adminClient().from('recipes').select('steps,note').eq('title', title).single();
    expect(variant.data).toEqual({ steps: ['Bak op 180 °C.'], note: 'Of 180 °C hetelucht.' });
  });
});

test.describe('crit. 7: hostile text and many temperatures', () => {
  test('tags and "&" are shown literally next to the converted value', async ({ page }) => {
    let dialogs = 0;
    page.on('dialog', async (d) => {
      dialogs++;
      await d.dismiss();
    });
    const raw = '<script>alert(1)</script> 180 °C & <b>x</b>';
    const row = await insertRecipe(user.client, { title: unique('Gevaar'), steps: [raw] });
    await signIn(page, 'nl', 'F');
    await page.goto(`/recept/${row.id}`);
    await expect(steps(page)).toHaveText('<script>alert(1)</script> 356 °F & <b>x</b>');
    await expect(steps(page).locator('b, script')).toHaveCount(0);
    expect(dialogs).toBe(0);
  });

  test('a step with 50 temperatures shows 50 times °F and no °C', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Vijftig'), steps: ['180 °C, '.repeat(50).trim()] });
    await signIn(page, 'nl', 'F');
    await page.goto(`/recept/${row.id}`);
    const text = (await steps(page).textContent()) ?? '';
    expect(text.match(/°F/g)).toHaveLength(50);
    expect(text).not.toContain('°C');
  });
});
