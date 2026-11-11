import { expect, test, type Page } from '@playwright/test';
import { seedLanguage, signInViaStorage } from '../helpers/session';
import { sql } from '../helpers/pg';
import { assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, type TestUser } from '../helpers/supabase-admin';
import {
  customAdd,
  customInput,
  expectTapTarget,
  haveSection,
  lineButton,
  lineRow,
  lineTexts,
  removeButton,
  seedIngredient,
  seedMenu,
  text,
  unitId,
  type Lang,
} from '../helpers/shopping';

// T-034 / R-032: the shopping list tab of the week menu. Local Supabase, viewport 360 x 640.
// Texts come from nl.json / fr.json by key. Every test has its own user and its own ingredient names (suffix `s`).
let author: TestUser;
const users: TestUser[] = [];
let s = '';
let g = '';
let kg = '';
let stuk = '';

test.beforeAll(async () => {
  await assertSupabaseUp();
  author = await createTestUser('slAuthor', { displayName: 'Mia Markt' });
  [g, kg, stuk] = await Promise.all([unitId('g'), unitId('kg'), unitId('stuk')]);
});

test.afterAll(async () => {
  for (const u of [author, ...users]) if (u) await deleteTestUser(u);
});

test.beforeEach(() => {
  s = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
});

async function freshUser(): Promise<TestUser> {
  const u = await createTestUser('slUser', { displayName: 'Wim Winkel' });
  users.push(u);
  return u;
}

async function open(page: Page, user: TestUser, lang: Lang, path = '/weekmenu/boodschappen') {
  await seedLanguage(page, lang);
  await signInViaStorage(page, user.session);
  await page.goto(path);
}

/** A recipe with ingredients from the database; `quantity` and unit given as ids. */
async function recipe(label: string, ingredients: Record<string, unknown>[], servings = 4) {
  const title = `${label} ${s}`;
  const row = await insertRecipe(author.client, { title, servings, ingredients });
  return { ...row, title };
}
const dbLine = (name: string, id: string, quantity: number | undefined, unit?: { id: string; name: string }) => ({
  name,
  ingredient_id: id,
  ...(quantity === undefined ? {} : { quantity }),
  ...(unit ? { unit: unit.name, unit_id: unit.id } : {}),
});
const marksOf = (u: TestUser) => sql<{ line_key: string; state: string }>(`select line_key, state from public.shopping_marks where user_id = '${u.id}'`);
const count = async (table: string, u: TestUser) =>
  Number((await sql<{ n: string }>(`select count(*) n from public.${table} where user_id = '${u.id}'`))[0].n);

test.describe('crit. 1, 2: amounts', () => {
  test('4 servings, 400 g meel, menu 2 -> "200 g meel"; "+" to 6 -> "600 g meel"', async ({ page }) => {
    const me = await freshUser();
    const meel = await seedIngredient('meel' + s);
    const r = await recipe('Brood', [dbLine('meel' + s, meel, 400, { id: g, name: 'g' })], 4);
    await seedMenu(me.id, [r.id], 2);
    await open(page, me, 'nl', '/weekmenu');
    const card = page.getByRole('listitem').filter({ hasText: r.title });
    for (let i = 0; i < 4; i++) await card.getByRole('button', { name: text('nl', 'servings.increase') }).click();
    await expect(card.locator('output')).toHaveText('6');
    await expect.poll(async () => (await sql<{ servings: number }>(`select servings from public.week_menu_items where user_id = '${me.id}'`))[0].servings).toBe(6);
    await page.getByRole('tab', { name: text('nl', 'weekMenu.tabShopping'), exact: true }).click();
    await expect(lineButton(page, `600 g meel${s}`)).toBeVisible();
    await seedMenuServings(me, r.id, 2);
    await page.reload();
    await expect(lineButton(page, `200 g meel${s}`)).toBeVisible();
  });

  test('200 g meel and 1 kg meel from two recipes show one line "1,2 kg meel"', async ({ page }) => {
    const me = await freshUser();
    const meel = await seedIngredient('meel' + s);
    const r1 = await recipe('Een', [dbLine('meel' + s, meel, 200, { id: g, name: 'g' })], 1);
    const r2 = await recipe('Twee', [dbLine('meel' + s, meel, 1, { id: kg, name: 'kg' })], 1);
    await seedMenu(me.id, [r1.id, r2.id], 1);
    await open(page, me, 'nl');
    await expect(lineButton(page, `1,2 kg meel${s}`)).toHaveCount(1);
    expect(await lineTexts(page)).toHaveLength(1);
  });
});

async function seedMenuServings(user: TestUser, recipeId: string, n: number) {
  await sql(`update public.week_menu_items set servings = ${n} where user_id = '${user.id}' and recipe_id = '${recipeId}'`);
}

for (const lang of ['nl', 'fr'] as const) {
  const t = (key: string) => text(lang, key);

  test.describe(`crit. 7: names and order (${lang})`, () => {
    test('nl: aardappel before ui; fr: oignon before pomme de terre; switching language reorders without reload', async ({ page }) => {
      const me = await freshUser();
      const pot = await seedIngredient('aardappel' + s, 'pomme de terre ' + s);
      const ui = await seedIngredient('ui' + s, 'oignon ' + s);
      const r = await recipe('Soep', [dbLine('aardappel' + s, pot, 2, { id: stuk, name: 'stuk' }), dbLine('ui' + s, ui, 1, { id: stuk, name: 'stuk' })]);
      await seedMenu(me.id, [r.id], 4);
      await open(page, me, lang);
      // Positions of the two names in the list, whatever the quantity and unit in front of them.
      const order = async (names: string[]) => {
        const lines = await lineTexts(page);
        return names.map((n) => lines.findIndex((l) => l.includes(n)));
      };
      const inOrder = async (names: string[]) => {
        const i = await order(names);
        return i[0] >= 0 && i[1] >= 0 && i[0] < i[1];
      };
      const first = lang === 'nl' ? [`aardappel${s}`, `ui${s}`] : [`oignon ${s}`, `pomme de terre ${s}`];
      await expect(page.locator('main button[aria-pressed]').first()).toBeVisible();
      await expect.poll(() => inOrder(first)).toBe(true);

      // Switch language in the profile with in-app navigation only (no reload), then come back.
      const other: Lang = lang === 'nl' ? 'fr' : 'nl';
      await page.getByRole('navigation', { name: t('nav.label') }).getByRole('link', { name: t('nav.profile'), exact: true }).click();
      await page.getByRole('button', { name: text(other, `language.${other}`), exact: true }).click();
      await page.getByRole('navigation', { name: text(other, 'nav.label') }).getByRole('link', { name: text(other, 'nav.weekMenu'), exact: true }).click();
      await page.getByRole('tab', { name: text(other, 'weekMenu.tabShopping'), exact: true }).click();
      const swapped = lang === 'nl' ? [`oignon ${s}`, `pomme de terre ${s}`] : [`aardappel${s}`, `ui${s}`];
      await expect.poll(() => inOrder(swapped)).toBe(true);
    });
  });

  test.describe(`crit. 8, 9, 10: marks (${lang})`, () => {
    test('a tap marks "bought" (aria-pressed, line-through, below the open lines), survives reload, a second tap undoes', async ({ page }) => {
      const me = await freshUser();
      const meel = await seedIngredient('meel' + s, 'farine ' + s);
      const zout = await seedIngredient('zout' + s, 'sel ' + s);
      const r1 = await recipe('Een', [dbLine('meel' + s, meel, 200, { id: g, name: 'g' }), dbLine('zout' + s, zout, 5, { id: g, name: 'g' })], 4);
      const r2 = await recipe('Twee', [dbLine('meel' + s, meel, 1, { id: kg, name: 'kg' })], 4);
      await seedMenu(me.id, [r1.id, r2.id], 4);
      await open(page, me, lang);
      const name = lang === 'nl' ? `meel${s}` : `farine ${s}`;
      const bought = lineButton(page, `1,2 kg ${name}`);
      await expect(bought).toHaveAttribute('aria-pressed', 'false');
      await bought.click();
      await expect(bought).toHaveAttribute('aria-pressed', 'true');
      await expect(bought).toHaveCSS('text-decoration-line', 'line-through');
      // bought lines sit below the open ones
      const all = await lineTexts(page);
      expect(all[all.length - 1]).toContain('1,2 kg');
      await expect.poll(async () => (await marksOf(me)).map((m) => m.state)).toEqual(['bought']);

      await page.reload();
      await expect(lineButton(page, `1,2 kg ${name}`)).toHaveAttribute('aria-pressed', 'true');
      await lineButton(page, `1,2 kg ${name}`).click();
      await expect(lineButton(page, `1,2 kg ${name}`)).toHaveAttribute('aria-pressed', 'false');
      await expect.poll(async () => (await marksOf(me)).length).toBe(0);
    });

    test('"Heb ik al" moves a line to a closed <details>; Restore brings it back, not bought; bought -> have -> restore is not bought', async ({ page }) => {
      const me = await freshUser();
      const meel = await seedIngredient('meel' + s, 'farine ' + s);
      const olie = await seedIngredient('olie' + s, 'huile ' + s);
      const r = await recipe('Een', [dbLine('meel' + s, meel, 200, { id: g, name: 'g' }), dbLine('olie' + s, olie, 100, { id: g, name: 'g' })]);
      await seedMenu(me.id, [r.id], 4);
      await open(page, me, lang);
      const mName = lang === 'nl' ? `meel${s}` : `farine ${s}`;
      const line = `200 g ${mName}`;
      await lineButton(page, line).click(); // bought first
      await expect(lineButton(page, line)).toHaveAttribute('aria-pressed', 'true');
      await lineRow(page, line).getByRole('button', { name: t('shopping.have') }).click();
      await expect(lineButton(page, line)).toHaveCount(0);
      const details = haveSection(page, lang, 1);
      await expect(details).toHaveCount(1);
      await expect(details).not.toHaveAttribute('open', /.*/);
      await details.locator('summary').click();
      await expect(details.getByText(line)).toBeVisible();
      await expect.poll(async () => (await marksOf(me)).map((m) => m.state)).toEqual(['have']);
      await details.getByRole('button', { name: t('shopping.restore') }).click();
      await expect(lineButton(page, line)).toHaveAttribute('aria-pressed', 'false');
      await expect(haveSection(page, lang, 1)).toHaveCount(0);
      await expect.poll(async () => (await marksOf(me)).length).toBe(0);
    });
  });
}

test.describe('crit. 10: changes in the menu', () => {
  test('a mark stays on a line that still exists (with the new amount); marks of vanished lines expire', async ({ page }) => {
    const me = await freshUser();
    const meel = await seedIngredient('meel' + s);
    const rozijn = await seedIngredient('rozijnen' + s);
    const a = await recipe('A', [dbLine('meel' + s, meel, 100, { id: g, name: 'g' })], 2);
    const b = await recipe('B', [dbLine('meel' + s, meel, 50, { id: g, name: 'g' }), dbLine('rozijnen' + s, rozijn, 30, { id: g, name: 'g' })], 2);
    await seedMenu(me.id, [a.id, b.id], 2);
    await open(page, me, 'nl');
    await lineButton(page, `150 g meel${s}`).click();
    await lineButton(page, `30 g rozijnen${s}`).click();
    await expect.poll(async () => (await marksOf(me)).length).toBe(2);

    await sql(`delete from public.week_menu_items where user_id = '${me.id}' and recipe_id = '${b.id}'`);
    await seedMenuServings(me, a.id, 4);
    await page.reload();
    await expect(lineButton(page, `200 g meel${s}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(lineButton(page, `30 g rozijnen${s}`)).toHaveCount(0);
    await expect.poll(async () => (await marksOf(me)).length).toBe(1);

    await seedMenu(me.id, [b.id], 2);
    await page.reload();
    await expect(lineButton(page, `30 g rozijnen${s}`)).toHaveAttribute('aria-pressed', 'false');
  });
});

for (const lang of ['nl', 'fr'] as const) {
  const t = (key: string) => text(lang, key);

  test.describe(`crit. 11: custom items (${lang})`, () => {
    test('empty input and 81 characters show the message at the field and add nothing; "melk" is added, bought after reload, removable', async ({ page }) => {
      const me = await freshUser();
      const meel = await seedIngredient('meel' + s);
      const r = await recipe('Een', [dbLine('meel' + s, meel, 200, { id: g, name: 'g' })]);
      await seedMenu(me.id, [r.id], 4);
      await open(page, me, lang);
      const input = customInput(page, lang);
      for (const value of ['', 'm'.repeat(81)]) {
        await input.fill(value);
        await customAdd(page, lang).click();
        await expect(page.getByText(t('shopping.customInvalid'))).toBeVisible();
        await expect(input).toHaveAttribute('aria-invalid', 'true');
        const described = await input.getAttribute('aria-describedby');
        expect(described).toBeTruthy();
        await expect(page.locator(`#${described!.split(' ')[0]}`)).toContainText(t('shopping.customInvalid'));
        expect(await count('shopping_items', me)).toBe(0);
      }
      await input.fill('  melk  ');
      await customAdd(page, lang).click();
      await expect(lineButton(page, 'melk')).toBeVisible();
      await lineButton(page, 'melk').click();
      await expect(lineButton(page, 'melk')).toHaveAttribute('aria-pressed', 'true');
      await page.reload();
      await expect(lineButton(page, 'melk')).toHaveAttribute('aria-pressed', 'true');
      await removeButton(lineRow(page, 'melk'), lang, 'melk').click();
      await expect(lineButton(page, 'melk')).toHaveCount(0);
      await expect.poll(async () => count('shopping_items', me)).toBe(0);
    });
  });
}

test.describe('crit. 11: custom item limit and Leegmaken', () => {
  test('with 100 items, adding shows the "full" message', async ({ page }) => {
    const me = await freshUser();
    const meel = await seedIngredient('meel' + s);
    const r = await recipe('Een', [dbLine('meel' + s, meel, 200, { id: g, name: 'g' })]);
    await seedMenu(me.id, [r.id]);
    await sql(`insert into public.shopping_items (user_id, text) select '${me.id}', 'item ' || g from generate_series(1, 100) g`);
    await open(page, me, 'nl');
    await customInput(page, 'nl').fill('te veel');
    await customAdd(page, 'nl').click();
    await expect(page.getByText(text('nl', 'shopping.customFull'))).toBeVisible();
    expect(await count('shopping_items', me)).toBe(100);
  });

  test('Leegmaken on the Menu tab wipes menu, marks and items of this user only', async ({ page }) => {
    const me = await freshUser();
    const other = await freshUser();
    const meel = await seedIngredient('meel' + s);
    const r = await recipe('Een', [dbLine('meel' + s, meel, 200, { id: g, name: 'g' })]);
    await seedMenu(me.id, [r.id]);
    await seedMenu(other.id, [r.id]);
    for (const u of [me, other]) {
      await sql(`insert into public.shopping_marks (user_id, line_key, state) values ('${u.id}', 'k', 'bought')`);
      await sql(`insert into public.shopping_items (user_id, text) values ('${u.id}', 'melk')`);
    }
    await open(page, me, 'nl', '/weekmenu');
    await page.getByRole('button', { name: text('nl', 'weekMenu.clear'), exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: text('nl', 'weekMenu.clearConfirm'), exact: true }).click();
    await expect(page.getByText(text('nl', 'weekMenu.empty'))).toBeVisible();
    for (const table of ['week_menu_items', 'shopping_marks', 'shopping_items']) {
      expect(await count(table, me), table).toBe(0);
      expect(await count(table, other), table).toBe(1);
    }
  });

  test('an empty menu shows only "Je weekmenu is leeg." even when custom items are stored', async ({ page }) => {
    const me = await freshUser();
    await sql(`insert into public.shopping_items (user_id, text) values ('${me.id}', 'melk')`);
    await open(page, me, 'nl');
    await expect(page.getByText(text('nl', 'weekMenu.empty'))).toBeVisible();
    await expect(page.locator('button[aria-pressed]')).toHaveCount(0);
    await expect(page.getByText('melk')).toHaveCount(0);
    expect(await count('shopping_items', me)).toBe(1);
  });
});

test.describe('crit. 12: copy the list', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('copies the open lines in screen order, without bought and "have"; role=status says "Gekopieerd"', async ({ page }) => {
    const me = await freshUser();
    const meel = await seedIngredient('meel' + s);
    const olie = await seedIngredient('olie' + s);
    const zout = await seedIngredient('zout' + s);
    const ui = await seedIngredient('ui' + s);
    const r = await recipe('Een', [
      dbLine('meel' + s, meel, 200, { id: g, name: 'g' }),
      dbLine('olie' + s, olie, 100, { id: g, name: 'g' }),
      dbLine('zout' + s, zout, 5, { id: g, name: 'g' }),
      dbLine('ui' + s, ui, 1, { id: stuk, name: 'stuk' }),
    ], 4);
    await seedMenu(me.id, [r.id], 4);
    await sql(`insert into public.shopping_items (user_id, text) values ('${me.id}', 'melk')`);
    await open(page, me, 'nl');
    await lineButton(page, `200 g meel${s}`).click(); // bought
    await lineRow(page, `5 g zout${s}`).getByRole('button', { name: text('nl', 'shopping.have') }).click(); // have
    await expect(lineButton(page, `5 g zout${s}`)).toHaveCount(0);
    const open_ = (await lineTexts(page)).filter((x) => !x.includes(`meel${s}`));
    await page.getByRole('button', { name: text('nl', 'shopping.copy') }).click();
    await expect(page.getByRole('status').filter({ hasText: text('nl', 'shopping.copied') })).toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip.split(/\r?\n/)).toEqual(open_);
    expect(clip).toContain('melk');
    expect(clip).not.toContain(`meel${s}`);
    expect(clip).not.toContain(`zout${s}`);
  });

  test('when writing fails: "Kopiëren is niet gelukt." and a readonly textarea with the text', async ({ page }) => {
    const me = await freshUser();
    const meel = await seedIngredient('meel' + s);
    const r = await recipe('Een', [dbLine('meel' + s, meel, 200, { id: g, name: 'g' })]);
    await seedMenu(me.id, [r.id], 4);
    await page.addInitScript(() => {
      Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('denied')), configurable: true });
    });
    await open(page, me, 'nl');
    await page.getByRole('button', { name: text('nl', 'shopping.copy') }).click();
    await expect(page.getByText(text('nl', 'shopping.copyFailed'))).toBeVisible();
    const area = page.locator('textarea[readonly]');
    await expect(area).toHaveCount(1);
    await expect(area).toHaveValue(`200 g meel${s}`);
  });
});

for (const lang of ['nl', 'fr'] as const) {
  test.describe(`crit. 14: 50 dishes and 100 own items at 360 px (${lang})`, () => {
    test('no horizontal scroll, all buttons >= 44 px, list within 3 s', async ({ page }) => {
      test.setTimeout(120_000);
      const t = (key: string) => text(lang, key);
      const me = await freshUser();
      const ids: string[] = [];
      for (let batch = 0; batch < 2; batch++) {
        const rows = Array.from({ length: 25 }, (_, i) => {
          const r = batch * 25 + i;
          return {
            title: `Vol ${s} ${r}`,
            ingredients: Array.from({ length: 10 }, (_, j) => ({ name: `Ingrediënt ${r}-${j} met een heel lange naam voor het scherm`, quantity: j + 1, unit: 'stuk' })),
            steps: ['Meng.'],
            prep_minutes: 10,
            total_minutes: 20,
            servings: 4,
          };
        });
        const ins = await author.client.from('recipes').insert(rows).select('id');
        expect(ins.error).toBeNull();
        ids.push(...(ins.data ?? []).map((x) => x.id as string));
      }
      await seedMenu(me.id, ids, 4);
      await sql(
        `insert into public.shopping_items (user_id, text)
         select '${me.id}', left('Eigen item ' || g || ' ' || repeat('woordje ', 20), 79) || 'x' from generate_series(1, 100) g`,
      );
      await open(page, me, lang, '/weekmenu');
      await expect(page.getByRole('tab', { name: t('weekMenu.tabShopping'), exact: true })).toBeVisible();
      const started = Date.now();
      await page.getByRole('tab', { name: t('weekMenu.tabShopping'), exact: true }).click();
      await expect(page.locator('main button[aria-pressed]').first()).toBeVisible({ timeout: 3000 });
      expect(Date.now() - started).toBeLessThan(3000);

      // one line in "have", opened, so Restore is measured too
      // own items have no "have" button, so pick the first row that does
      await page.getByRole('button', { name: t('shopping.have') }).first().click();
      await page.locator('details summary').first().click();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('main button')]
          .map((b) => ({ r: b.getBoundingClientRect(), name: (b.textContent ?? '').trim().slice(0, 30) }))
          .filter(({ r }) => r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44))
          .map(({ r, name }) => `${name} ${Math.round(r.width)}x${Math.round(r.height)}`),
      );
      expect(small).toEqual([]);
      await expectTapTarget(page.getByRole('button', { name: t('shopping.copy') }), 'copy');
      await expectTapTarget(customAdd(page, lang), 'add');
    });
  });
}

test.describe('no connection', () => {
  const MARKS = /\/rest\/v1\/shopping_marks/;
  const ITEMS = /\/rest\/v1\/shopping_items/;
  const banner = (page: Page) => page.getByText(text('nl', 'connection.error'));
  const retry = (page: Page) => page.getByRole('button', { name: text('nl', 'connection.retry') });

  async function setup() {
    const me = await freshUser();
    const meel = await seedIngredient('meel' + s);
    const r = await recipe('Een', [dbLine('meel' + s, meel, 200, { id: g, name: 'g' })]);
    await seedMenu(me.id, [r.id], 4);
    return me;
  }

  test('loading: banner; retry shows the list', async ({ page }) => {
    const me = await setup();
    await seedLanguage(page, 'nl');
    await signInViaStorage(page, me.session);
    await page.route(MARKS, (route) => route.abort());
    await page.goto('/weekmenu/boodschappen');
    await expect(banner(page)).toBeVisible();
    await page.unroute(MARKS);
    await retry(page).click();
    await expect(lineButton(page, `200 g meel${s}`)).toBeVisible();
    await expect(banner(page)).toBeHidden();
  });

  test('ticking: banner; retry stores the mark', async ({ page }) => {
    const me = await setup();
    await open(page, me, 'nl');
    await expect(lineButton(page, `200 g meel${s}`)).toBeVisible();
    await page.route(MARKS, (route) => (route.request().method() === 'GET' ? route.continue() : route.abort()));
    await lineButton(page, `200 g meel${s}`).click();
    await expect(banner(page)).toBeVisible();
    await page.unroute(MARKS);
    await retry(page).click();
    await expect.poll(async () => (await marksOf(me)).map((m) => m.state)).toEqual(['bought']);
  });

  test('"Heb ik al": banner; retry stores it', async ({ page }) => {
    const me = await setup();
    await open(page, me, 'nl');
    await expect(lineButton(page, `200 g meel${s}`)).toBeVisible();
    await page.route(MARKS, (route) => (route.request().method() === 'GET' ? route.continue() : route.abort()));
    await lineRow(page, `200 g meel${s}`).getByRole('button', { name: text('nl', 'shopping.have') }).click();
    await expect(banner(page)).toBeVisible();
    await page.unroute(MARKS);
    await retry(page).click();
    await expect.poll(async () => (await marksOf(me)).map((m) => m.state)).toEqual(['have']);
  });

  test('adding an item: banner; retry adds it', async ({ page }) => {
    const me = await setup();
    await open(page, me, 'nl');
    await expect(lineButton(page, `200 g meel${s}`)).toBeVisible();
    await page.route(ITEMS, (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
    await customInput(page, 'nl').fill('melk');
    await customAdd(page, 'nl').click();
    await expect(banner(page)).toBeVisible();
    await page.unroute(ITEMS);
    await retry(page).click();
    await expect.poll(async () => count('shopping_items', me)).toBe(1);
  });

  test('removing an item: banner; retry removes it', async ({ page }) => {
    const me = await setup();
    await sql(`insert into public.shopping_items (user_id, text) values ('${me.id}', 'melk')`);
    await open(page, me, 'nl');
    await expect(lineButton(page, 'melk')).toBeVisible();
    await page.route(ITEMS, (route) => (route.request().method() === 'DELETE' ? route.abort() : route.continue()));
    await removeButton(lineRow(page, 'melk'), 'nl', 'melk').click();
    await expect(banner(page)).toBeVisible();
    await page.unroute(ITEMS);
    await retry(page).click();
    await expect.poll(async () => count('shopping_items', me)).toBe(0);
  });
});
