import { expect, test, type Locator, type Page } from '@playwright/test';
import nlJson from '../../src/i18n/nl.json' with { type: 'json' };
import frJson from '../../src/i18n/fr.json' with { type: 'json' };
import { seedLanguage, signInViaStorage, storageKey } from '../helpers/session';
import { sql } from '../helpers/pg';
import {
  anonClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  insertRecipe,
  uploadTestPhoto,
  type TestUser,
} from '../helpers/supabase-admin';

// T-033 / R-030: week menu on the recipe page, /weekmenu and the navigation. Local Supabase, viewport 360 x 640.
// Texts come from nl.json / fr.json, never typed out. Every test has its own user, so menus never mix.
const texts = { nl: nlJson as Record<string, string>, fr: frJson as Record<string, string> };
type Lang = 'nl' | 'fr';

let author: TestUser;
const users: TestUser[] = [];
let s = '';

test.beforeAll(async () => {
  await assertSupabaseUp();
  author = await createTestUser('wmAuthor', { displayName: 'Mia Menu' });
});

test.afterAll(async () => {
  for (const u of [author, ...users]) if (u) await deleteTestUser(u);
});

test.beforeEach(() => {
  s = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
});

async function freshUser(): Promise<TestUser> {
  const u = await createTestUser('wmUser', { displayName: 'Wim Week' });
  users.push(u);
  return u;
}

async function open(page: Page, user: TestUser, lang: Lang, path: string) {
  await seedLanguage(page, lang);
  await signInViaStorage(page, user.session);
  await page.goto(path);
}

async function make(label: string, extra: Record<string, unknown> = {}) {
  const title = `${label} ${s}`;
  const row = await insertRecipe(author.client, { title, ...extra });
  return { ...row, title };
}

/** Puts recipes in a user's menu through SQL, oldest first (created_at one minute apart). */
async function seedMenu(user: TestUser, recipeIds: string[], servings = 4) {
  for (const [i, id] of recipeIds.entries()) {
    await sql(
      `insert into public.week_menu_items (user_id, recipe_id, servings, created_at)
       values ('${user.id}', '${id}', ${servings}, now() - interval '${recipeIds.length - i} minutes')`,
    );
  }
}

const menuRows = (user: TestUser) =>
  sql<{ recipe_id: string; servings: number }>(`select recipe_id, servings from public.week_menu_items where user_id = '${user.id}' order by created_at desc`);

const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const card = (page: Page, title: string): Locator => page.getByRole('listitem').filter({ hasText: title });
const toggle = (page: Page, lang: Lang): Locator =>
  page.getByRole('button', { name: new RegExp(`^(${esc(texts[lang]['weekMenu.add'])}|${esc(texts[lang]['weekMenu.added'])})$`) });
/** "Verwijderen" is either the plain text or an aria-label with the title; accept both. */
const removeButton = (scope: Locator, lang: Lang, title: string): Locator => {
  const t = texts[lang];
  const labelled = esc(t['weekMenu.removeLabel'] ?? t['weekMenu.remove']).replace(esc('{title}'), esc(title));
  return scope.getByRole('button', { name: new RegExp(`^(${esc(t['weekMenu.remove'])}|${labelled})$`) });
};
const banner = (page: Page, lang: Lang) => page.getByText(texts[lang]['connection.error']);

async function expectTapTarget(locator: Locator, what: string) {
  const box = await locator.boundingBox();
  expect(box, what).not.toBeNull();
  expect(box!.width, `${what} width`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${what} height`).toBeGreaterThanOrEqual(44);
}

test.describe('crit. 1: access', () => {
  test('/weekmenu without sign-in redirects to the sign-in screen', async ({ page }) => {
    await page.goto('/weekmenu');
    await expect(page).toHaveURL(/\/aanmelden/);
    await page.goto('/weekmenu/boodschappen');
    await expect(page).toHaveURL(/\/aanmelden/);
  });

  test('another user does not see my dishes on /weekmenu', async ({ page }) => {
    const me = await freshUser();
    const other = await freshUser();
    const r = await make('Privé');
    await seedMenu(me, [r.id]);
    await open(page, other, 'nl', '/weekmenu');
    await expect(page.getByText(texts.nl['weekMenu.empty']).first()).toBeVisible();
    await expect(page.getByText(r.title)).toHaveCount(0);
  });
});

test.describe('crit. 2: the menu stays after signing out and in', () => {
  test('two dishes with the same servings are still there after sign-out and sign-in', async ({ page }) => {
    const me = await freshUser();
    const r1 = await make('Eerste', { servings: 3 });
    const r2 = await make('Tweede', { servings: 6 });
    await seedLanguage(page, 'nl');
    // Seed the session once (not on every navigation), so a later sign-in is not overwritten.
    await page.goto('/aanmelden');
    await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [storageKey(), JSON.stringify(me.session)] as [string, string]);
    await page.goto('/recept/' + r1.id);
    await toggle(page, 'nl').click();
    await expect(toggle(page, 'nl')).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/recept/' + r2.id);
    await toggle(page, 'nl').click();
    await expect(toggle(page, 'nl')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await menuRows(me)).length).toBe(2);

    await page.goto('/profiel');
    await page.getByRole('button', { name: texts.nl['profile.signOut'], exact: true }).click();
    await expect(page).toHaveURL(/\/aanmelden/);

    const again = await anonClient().auth.signInWithPassword({ email: me.email, password: me.password });
    expect(again.error).toBeNull();
    await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [storageKey(), JSON.stringify(again.data.session)] as [string, string]);
    await page.goto('/weekmenu');
    await expect(card(page, r1.title)).toHaveCount(1);
    await expect(card(page, r2.title)).toHaveCount(1);
    await expect(card(page, r1.title).locator('output')).toHaveText('3');
    await expect(card(page, r2.title).locator('output')).toHaveText('6');
  });
});

for (const lang of ['nl', 'fr'] as const) {
  const t = texts[lang];

  test.describe(`crit. 3, 4, 5: the button on the recipe page (${lang})`, () => {
    test('toggle: add, shows "in menu", survives reload, second tap removes; target >= 44 x 44', async ({ page }) => {
      const me = await freshUser();
      const r = await make('Knop', { servings: 4 });
      await open(page, me, lang, '/recept/' + r.id);
      const btn = toggle(page, lang);
      await expect(btn).toHaveCount(1);
      await expect(btn).toHaveText(t['weekMenu.add']);
      await expect(btn).toHaveAttribute('aria-pressed', 'false');
      await expectTapTarget(btn, 'weekmenu button');

      await btn.click();
      await expect(btn).toHaveText(t['weekMenu.added']);
      await expect(btn).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(async () => (await menuRows(me)).map((x) => x.recipe_id)).toEqual([r.id]);

      await page.reload();
      await expect(toggle(page, lang)).toHaveText(t['weekMenu.added']);
      await expect(toggle(page, lang)).toHaveAttribute('aria-pressed', 'true');

      await page.goto('/weekmenu');
      await expect(card(page, r.title)).toHaveCount(1);

      await page.goBack();
      await toggle(page, lang).click();
      await expect(toggle(page, lang)).toHaveText(t['weekMenu.add']);
      await expect(toggle(page, lang)).toHaveAttribute('aria-pressed', 'false');
      await expect.poll(async () => (await menuRows(me)).length).toBe(0);
    });

    test('a double tap on "add" leaves one row and ends on "in menu"', async ({ page }) => {
      const me = await freshUser();
      const r = await make('Dubbel');
      await open(page, me, lang, '/recept/' + r.id);
      await toggle(page, lang).dblclick();
      await expect(toggle(page, lang)).toHaveText(t['weekMenu.added']);
      await page.waitForTimeout(500);
      expect(await menuRows(me)).toHaveLength(1);
      await page.goto('/weekmenu');
      await expect(card(page, r.title)).toHaveCount(1);
    });

    test('servings start at the recipe servings, change with + and survive reload; the recipe stays', async ({ page }) => {
      const me = await freshUser();
      const r = await make('Porties', { servings: 4 });
      await open(page, me, lang, '/recept/' + r.id);
      await toggle(page, lang).click();
      await expect(toggle(page, lang)).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(async () => (await menuRows(me)).length).toBe(1);

      await page.goto('/weekmenu');
      const item = card(page, r.title);
      await expect(item.locator('output')).toHaveText('4');
      await item.getByRole('button', { name: t['servings.increase'] }).click();
      await expect(item.locator('output')).toHaveText('5');
      await expect.poll(async () => (await menuRows(me))[0]?.servings).toBe(5);
      await page.reload();
      await expect(card(page, r.title).locator('output')).toHaveText('5');

      await page.goto('/recept/' + r.id);
      await expect(page.locator('output').first()).toHaveText('4');
      const rec = await sql<{ servings: number }>(`select servings from public.recipes where id = '${r.id}'`);
      expect(rec[0].servings).toBe(4);
    });

    test('"-" is disabled at 1 and "+" is disabled at 99', async ({ page }) => {
      const me = await freshUser();
      const low = await make('Laag');
      const high = await make('Hoog');
      await seedMenu(me, [low.id], 1);
      await seedMenu(me, [high.id], 99);
      await open(page, me, lang, '/weekmenu');
      await expect(card(page, low.title).getByRole('button', { name: t['servings.decrease'] })).toBeDisabled();
      await expect(card(page, low.title).getByRole('button', { name: t['servings.increase'] })).toBeEnabled();
      await expect(card(page, high.title).getByRole('button', { name: t['servings.increase'] })).toBeDisabled();
      await expect(card(page, high.title).getByRole('button', { name: t['servings.decrease'] })).toBeEnabled();
    });
  });

  test.describe(`crit. 10: navigation and tabs (${lang})`, () => {
    test('five entries in order, each >= 44 x 44, no horizontal scroll, no cut-off label at 360 px', async ({ page }) => {
      const me = await freshUser();
      await open(page, me, lang, '/weekmenu');
      const nav = page.getByRole('navigation', { name: t['nav.label'] });
      const links = nav.getByRole('link');
      await expect(links).toHaveCount(5);
      await expect(links).toHaveText([t['nav.recipes'], t['nav.favorites'], t['nav.new'], t['nav.weekMenu'], t['nav.profile']]);
      for (let i = 0; i < 5; i++) await expectTapTarget(links.nth(i), `nav ${i}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      // The label fits in its box: no word is wider than the link it sits in.
      const cut = await links.evaluateAll((els) =>
        els.filter((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const text = range.getBoundingClientRect();
          const box = el.getBoundingClientRect();
          return text.left < box.left - 0.5 || text.right > box.right + 0.5 || el.scrollWidth > el.clientWidth + 1;
        }).length,
      );
      expect(cut).toBe(0);
    });

    test('tablist with two tabs; Menu selected; Boodschappen opens its route; nav stays current', async ({ page }) => {
      const me = await freshUser();
      await open(page, me, lang, '/weekmenu');
      await expect(page.getByRole('tablist')).toHaveCount(1);
      const tabs = page.getByRole('tab');
      await expect(tabs).toHaveText([t['weekMenu.tabMenu'], t['weekMenu.tabShopping']]);
      const menuTab = page.getByRole('tab', { name: t['weekMenu.tabMenu'], exact: true });
      const shopTab = page.getByRole('tab', { name: t['weekMenu.tabShopping'], exact: true });
      await expect(menuTab).toHaveAttribute('aria-selected', 'true');
      await expect(shopTab).toHaveAttribute('aria-selected', 'false');
      const navEntry = page.getByRole('navigation', { name: t['nav.label'] }).getByRole('link', { name: t['nav.weekMenu'], exact: true });
      await expect(navEntry).toHaveAttribute('aria-current', 'page');
      for (const tab of [menuTab, shopTab]) {
        const box = await tab.boundingBox();
        expect(box!.height, 'tab height').toBeGreaterThanOrEqual(44);
      }
      await shopTab.click();
      await expect(page).toHaveURL(/\/weekmenu\/boodschappen$/);
      await expect(shopTab).toHaveAttribute('aria-selected', 'true');
      await expect(navEntry).toHaveAttribute('aria-current', 'page');
    });
  });
}

test.describe('crit. 6: at most 50', () => {
  test('a 51st dish shows the "full" message and the button stays on "add"', async ({ page }) => {
    const me = await freshUser();
    const rows = Array.from({ length: 50 }, (_, i) => ({
      title: `Vol ${s} ${i}`,
      ingredients: [{ name: 'Zout' }],
      steps: ['Meng.'],
      prep_minutes: 10,
      total_minutes: 20,
      servings: 4,
    }));
    const ins = await author.client.from('recipes').insert(rows).select('id');
    expect(ins.error).toBeNull();
    const ids = (ins.data ?? []).map((r) => r.id as string);
    await seedMenu(me, ids);
    const extra = await make('Eenenvijftig');
    await open(page, me, 'nl', '/recept/' + extra.id);
    await toggle(page, 'nl').click();
    await expect(page.getByRole('alert').filter({ hasText: texts.nl['weekMenu.full'] })).toBeVisible();
    await expect(toggle(page, 'nl')).toHaveText(texts.nl['weekMenu.add']);
    await expect(toggle(page, 'nl')).toHaveAttribute('aria-pressed', 'false');
    expect(await menuRows(me)).toHaveLength(50);
  });
});

test.describe('crit. 7: a dish in the menu', () => {
  test('main photo with alt text, or the placeholder; title opens the recipe', async ({ page }) => {
    const me = await freshUser();
    const withPhoto = await make('Metfoto');
    const up = await uploadTestPhoto(author.client, withPhoto.id);
    expect(up.error).toBeNull();
    const upd = await author.client.from('recipes').update({ photos: [{ path: up.path, main: true }] }).eq('id', withPhoto.id);
    expect(upd.error).toBeNull();
    const bare = await make('Zonderfoto');
    await seedMenu(me, [withPhoto.id, bare.id]);
    await open(page, me, 'nl', '/weekmenu');
    const photoCard = card(page, withPhoto.title);
    await expect(photoCard.locator('img[alt]:not([alt=""])')).toHaveCount(1);
    await expect(photoCard.getByTestId('recipe-photo-placeholder')).toHaveCount(0);
    await expect(card(page, bare.title).getByTestId('recipe-photo-placeholder')).toHaveCount(1);
    await card(page, bare.title).getByRole('link', { name: bare.title }).click();
    await expect(page).toHaveURL(new RegExp(`/recept/${bare.id}$`));
  });

  test('the newest addition is on top', async ({ page }) => {
    const me = await freshUser();
    const old = await make('Oud');
    const mid = await make('Midden');
    const fresh = await make('Nieuwste');
    await seedMenu(me, [old.id, mid.id, fresh.id]);
    await open(page, me, 'nl', '/weekmenu');
    // wait until the list is loaded, else allTextContents() returns [] early
    await expect(card(page, fresh.title)).toHaveCount(1);
    await expect(card(page, old.title)).toHaveCount(1);
    const titles = await page.getByRole('listitem').filter({ has: page.getByRole('link', { name: new RegExp(s) }) }).getByRole('link', { name: new RegExp(s) }).allTextContents();
    expect(titles.map((x) => x.trim())).toEqual([fresh.title, mid.title, old.title]);
  });

  test('Remove takes the dish away at once, without a question, and it stays gone', async ({ page }) => {
    const me = await freshUser();
    const keep = await make('Blijft');
    const gone = await make('Weg');
    await seedMenu(me, [keep.id, gone.id]);
    await open(page, me, 'nl', '/weekmenu');
    await removeButton(card(page, gone.title), 'nl', gone.title).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(card(page, gone.title)).toHaveCount(0);
    await page.reload();
    await expect(card(page, gone.title)).toHaveCount(0);
    await expect(card(page, keep.title)).toHaveCount(1);
  });
});

test.describe('crit. 8: Clear', () => {
  test('cancel keeps all 3 dishes (also after reload); confirm empties the menu', async ({ page }) => {
    const me = await freshUser();
    const rs = [await make('Een'), await make('Twee'), await make('Drie')];
    await seedMenu(me, rs.map((r) => r.id));
    await open(page, me, 'nl', '/weekmenu');
    const clear = page.getByRole('button', { name: texts.nl['weekMenu.clear'], exact: true });
    await clear.click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: texts.nl['form.cancel'] }).click();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    for (const r of rs) await expect(card(page, r.title)).toHaveCount(1);
    expect(await menuRows(me)).toHaveLength(3);

    await page.getByRole('button', { name: texts.nl['weekMenu.clear'], exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: texts.nl['weekMenu.clearConfirm'], exact: true }).click();
    await expect(page.getByText(texts.nl['weekMenu.empty'])).toBeVisible();
    expect(await menuRows(me)).toHaveLength(0);
  });

  test('an empty menu shows the empty text on both tabs, no list and no Clear button', async ({ page }) => {
    const me = await freshUser();
    await open(page, me, 'nl', '/weekmenu');
    await expect(page.getByText(texts.nl['weekMenu.empty'])).toBeVisible();
    // only the five navigation entries are list items: no dishes, no shopping list
    await expect(page.getByRole('listitem')).toHaveCount(5);
    await expect(page.getByRole('button', { name: texts.nl['weekMenu.clear'], exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: texts.nl['weekMenu.tabShopping'], exact: true }).click();
    await expect(page.getByText(texts.nl['weekMenu.empty'])).toBeVisible();
    await expect(page.getByRole('button', { name: texts.nl['weekMenu.clear'], exact: true })).toHaveCount(0);
  });
});

test.describe('crit. 9: a deleted recipe leaves the menus', () => {
  test('after the author deletes it, it is gone from the menu of another user', async ({ page }) => {
    const me = await freshUser();
    const doomed = await make('Verdwijnt');
    const stays = await make('Blijftstaan');
    await seedMenu(me, [doomed.id, stays.id]);
    const del = await author.client.from('recipes').delete().eq('id', doomed.id).select('id');
    expect(del.data).toHaveLength(1);
    await open(page, me, 'nl', '/weekmenu');
    await expect(card(page, stays.title)).toHaveCount(1);
    await expect(page.getByText(doomed.title)).toHaveCount(0);
  });
});

test.describe('crit. 11: no connection', () => {
  const ANY = /\/rest\/v1\/(week_menu_items|rpc\/clear_week_menu)/;

  test('loading /weekmenu: banner; retry shows the dishes', async ({ page }) => {
    const me = await freshUser();
    const r = await make('Laden');
    await seedMenu(me, [r.id]);
    await seedLanguage(page, 'nl');
    await signInViaStorage(page, me.session);
    await page.route(ANY, (route) => route.abort());
    await page.goto('/weekmenu');
    await expect(banner(page, 'nl')).toBeVisible();
    await page.unroute(ANY);
    await page.getByRole('button', { name: texts.nl['connection.retry'] }).click();
    await expect(card(page, r.title)).toHaveCount(1);
    await expect(banner(page, 'nl')).toBeHidden();
  });

  test('adding: banner; retry adds it and the button shows "in menu"', async ({ page }) => {
    const me = await freshUser();
    const r = await make('Toevoegen');
    await open(page, me, 'nl', '/recept/' + r.id);
    await expect(toggle(page, 'nl')).toBeVisible();
    await page.route(ANY, (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
    await toggle(page, 'nl').click();
    await expect(banner(page, 'nl')).toBeVisible();
    await page.unroute(ANY);
    await page.getByRole('button', { name: texts.nl['connection.retry'] }).click();
    await expect.poll(async () => (await menuRows(me)).length).toBe(1);
    await expect(toggle(page, 'nl')).toHaveAttribute('aria-pressed', 'true');
  });

  test('changing servings: banner; retry saves the new value', async ({ page }) => {
    const me = await freshUser();
    const r = await make('Porties');
    await seedMenu(me, [r.id], 4);
    await open(page, me, 'nl', '/weekmenu');
    await expect(card(page, r.title)).toHaveCount(1);
    await page.route(ANY, (route) => (route.request().method() === 'PATCH' ? route.abort() : route.continue()));
    await card(page, r.title).getByRole('button', { name: texts.nl['servings.increase'] }).click();
    await expect(banner(page, 'nl')).toBeVisible();
    await page.unroute(ANY);
    await page.getByRole('button', { name: texts.nl['connection.retry'] }).click();
    await expect.poll(async () => (await menuRows(me))[0]?.servings).toBe(5);
    await expect(card(page, r.title).locator('output')).toHaveText('5');
  });

  test('Remove: banner; retry removes the dish', async ({ page }) => {
    const me = await freshUser();
    const r = await make('Wegmet');
    await seedMenu(me, [r.id]);
    await open(page, me, 'nl', '/weekmenu');
    await expect(card(page, r.title)).toHaveCount(1);
    await page.route(ANY, (route) => (route.request().method() === 'DELETE' ? route.abort() : route.continue()));
    await removeButton(card(page, r.title), 'nl', r.title).click();
    await expect(banner(page, 'nl')).toBeVisible();
    await page.unroute(ANY);
    await page.getByRole('button', { name: texts.nl['connection.retry'] }).click();
    await expect.poll(async () => (await menuRows(me)).length).toBe(0);
    await expect(card(page, r.title)).toHaveCount(0);
  });

  test('Clear: banner; retry empties the menu', async ({ page }) => {
    const me = await freshUser();
    const r = await make('Leegmet');
    await seedMenu(me, [r.id]);
    await open(page, me, 'nl', '/weekmenu');
    await expect(card(page, r.title)).toHaveCount(1);
    await page.route(ANY, (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
    await page.getByRole('button', { name: texts.nl['weekMenu.clear'], exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: texts.nl['weekMenu.clearConfirm'], exact: true }).click();
    await expect(banner(page, 'nl')).toBeVisible();
    await page.unroute(ANY);
    await page.getByRole('button', { name: texts.nl['connection.retry'] }).click();
    await expect.poll(async () => (await menuRows(me)).length).toBe(0);
  });
});
