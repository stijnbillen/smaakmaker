import { expect, test, type Page } from '@playwright/test';
import {
  autoOpenFilters,
  filtersButton,
  filtersLabel,
  noLimitButton,
  openFilters,
  clearAllButton,
  filtersPanel,
  setTimeLimit,
  text,
  timeBlock,
  timeField,
  timeRange,
  type Lang,
  type TimeWhich,
} from '../helpers/overview';
import { sql } from '../helpers/pg';
import {
  fillRecipe,
  isRecipePost,
  nl,
  prepField,
  saveButton,
  titleField,
  totalField,
} from '../helpers/recipe-form';
import { seedLanguage, signInViaStorage, supabaseRoutePattern } from '../helpers/session';
import { adminClient, assertSupabaseUp, createTestUser, deleteTestUser, insertRecipe, type TestUser } from '../helpers/supabase-admin';

// T-006 / R-007: time fields in the form, display, and the overview filter. Local Supabase, viewport 360 x 640.
let user: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('rtime', { displayName: 'Tim Tijd' });
});

test.afterAll(async () => {
  if (user) await deleteTestUser(user);
});

test.beforeEach(async ({ page }) => {
  autoOpenFilters(page); // T-029: filters sit behind the "Filters" button
  await signInViaStorage(page, user.session);
});

const unique = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const base = { ingredients: ['Zout'], steps: ['Roer.'] };

const prepFilter = (page: Page) => timeField(page, 'prep');
const totalFilter = (page: Page) => timeField(page, 'total');
const item = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title });

function collectPosts(page: Page): string[] {
  const posts: string[] = [];
  page.on('request', (r) => {
    if (isRecipePost(r)) posts.push(r.url());
  });
  return posts;
}

async function expectMessageAt(page: Page, field: ReturnType<typeof prepField>, message: string) {
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await field.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  const text = await page.evaluate(
    (ids) => ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '),
    describedBy!,
  );
  expect(text).toContain(message);
}

test.describe('crit. 1: both times are required and bounded', () => {
  test('empty times give a message at each field, aria-invalid, and no POST', async ({ page }) => {
    const posts = collectPosts(page);
    await page.goto('/nieuw');
    await titleField(page).fill(unique('Leeg'));
    await expect(prepField(page)).toHaveAttribute('inputmode', 'numeric');
    await expect(totalField(page)).toHaveAttribute('inputmode', 'numeric');
    await saveButton(page).click();
    await expectMessageAt(page, prepField(page), nl['form.minutesRequired']);
    await expectMessageAt(page, totalField(page), nl['form.minutesRequired']);
    expect(posts).toEqual([]);
    await expect(page).toHaveURL(/\/nieuw$/);
  });

  for (const [label, value] of [
    ['4321', '4321'],
    ['a text', 'abc'],
  ] as const) {
    test(`${label} in the prep field is refused with a message at that field and no POST`, async ({ page }) => {
      const posts = collectPosts(page);
      await page.goto('/nieuw');
      await fillRecipe(page, { title: unique('Grens'), ...base, prepMinutes: value, totalMinutes: '4320' });
      await saveButton(page).click();
      await expectMessageAt(page, prepField(page), nl['form.minutesInvalid']);
      expect(posts).toEqual([]);
    });

    test(`${label} in the total field is refused with a message at that field and no POST`, async ({ page }) => {
      const posts = collectPosts(page);
      await page.goto('/nieuw');
      await fillRecipe(page, { title: unique('Grens'), ...base, prepMinutes: '0', totalMinutes: value });
      await saveButton(page).click();
      await expectMessageAt(page, totalField(page), nl['form.minutesInvalid']);
      expect(posts).toEqual([]);
    });
  }

  test('0 and 4320 can be saved', async ({ page }) => {
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Uiterst'), ...base, prepMinutes: '0', totalMinutes: '4320' });
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
  });
});

test.describe('crit. 2: total >= prep', () => {
  test('30 / 29 shows the literal message at the total field, sends nothing and focuses that field', async ({ page }) => {
    const posts = collectPosts(page);
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Te kort'), ...base, prepMinutes: '30', totalMinutes: '29' });
    await saveButton(page).click();
    await expect(page.getByText('Totale tijd kan niet korter zijn dan de preptijd.')).toBeVisible();
    await expectMessageAt(page, totalField(page), 'Totale tijd kan niet korter zijn dan de preptijd.');
    await expect(totalField(page)).toBeFocused();
    expect(posts).toEqual([]);
  });

  test('30 / 30 can be saved', async ({ page }) => {
    await page.goto('/nieuw');
    await fillRecipe(page, { title: unique('Gelijk'), ...base, prepMinutes: '30', totalMinutes: '30' });
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);
  });
});

test.describe('crit. 3: display', () => {
  test('a saved 90 / 4320 shows "1 u 30 min" and "72 u" on the detail page and in the overview', async ({ page }) => {
    const title = unique('Weergave');
    await page.goto('/nieuw');
    await fillRecipe(page, { title, ...base, prepMinutes: '90', totalMinutes: '4320' });
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]{36}$/);

    await expect(page.getByText(nl['time.prep'], { exact: true })).toBeVisible();
    await expect(page.getByText('1 u 30 min', { exact: true })).toBeVisible();
    await expect(page.getByText(nl['time.total'], { exact: true })).toBeVisible();
    await expect(page.getByText('72 u', { exact: true })).toBeVisible();

    await page.goto('/');
    const row = item(page, title);
    await expect(row).toContainText('1 u 30 min');
    await expect(row).toContainText('72 u');
  });
});

test.describe('crit. 4: overview filter', () => {
  async function seed() {
    const tag = unique('Tijdfilter');
    const a = await insertRecipe(user.client, { title: `${tag} A`, prep_minutes: 30, total_minutes: 60 });
    const b = await insertRecipe(user.client, { title: `${tag} B`, prep_minutes: 31, total_minutes: 61 });
    const c = await insertRecipe(user.client, { title: `${tag} C`, prep_minutes: 15, total_minutes: 120 });
    return { tag, a: a.title, b: b.title, c: c.title };
  }

  test('max prep 30: exactly 30 counts, 31 does not; max total 60; both together use "and"; "Alle" resets', async ({ page }) => {
    const { a, b, c } = await seed();
    await page.goto('/');
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, b)).toBeVisible();
    await expect(item(page, c)).toBeVisible();

    await setTimeLimit(page, 'prep', 30);
    await expect(item(page, b)).toHaveCount(0);
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, c)).toBeVisible();

    await noLimitButton(page, 'prep').click();
    await setTimeLimit(page, 'total', 60);
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, b)).toHaveCount(0);
    await expect(item(page, c)).toHaveCount(0);

    await setTimeLimit(page, 'prep', 15);
    await setTimeLimit(page, 'total', 120);
    await expect(item(page, c)).toBeVisible();
    await expect(item(page, a)).toHaveCount(0);
    await expect(item(page, b)).toHaveCount(0);

    await noLimitButton(page, 'prep').click();
    await noLimitButton(page, 'total').click();
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, b)).toBeVisible();
    await expect(item(page, c)).toBeVisible();
  });

  test('the choice is in the URL and survives reload and back from a detail page; newest first stays', async ({ page }) => {
    const { a, b, c } = await seed();
    await page.goto('/');
    await setTimeLimit(page, 'prep', 30);
    await setTimeLimit(page, 'total', 60);
    await expect(page).toHaveURL(/[?&]prep=30/);
    await expect(page).toHaveURL(/[?&]totaal=60/);
    await expect(item(page, a)).toBeVisible();

    await page.reload();
    await expect(prepFilter(page)).toHaveValue('30');
    await expect(totalFilter(page)).toHaveValue('60');
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, b)).toHaveCount(0);
    await expect(item(page, c)).toHaveCount(0);

    await item(page, a).getByText(a).click();
    await expect(page).toHaveURL(/\/recept\//);
    await page.goBack();
    await expect(page).toHaveURL(/prep=30/);
    await expect(prepFilter(page)).toHaveValue('30');
    await expect(item(page, a)).toBeVisible();

    // Sorting: with prep <= 120 all three match; C was inserted last, so it is the newest of the three.
    await page.goto('/?prep=30');
    // Wait for the list to be loaded before reading it, else the order check races the fetch.
    await expect(item(page, a)).toBeVisible();
    await expect(item(page, c)).toBeVisible();
    const titles = await page.getByRole('listitem').allInnerTexts();
    const idx = (t: string) => titles.findIndex((x) => x.includes(t));
    expect(idx(c)).toBeGreaterThanOrEqual(0);
    expect(idx(c)).toBeLessThan(idx(a));
  });

  test('a filter without matches shows "Niets gevonden." and not "Nog geen recepten."', async ({ page }) => {
    await page.route(/\/rest\/v1\/recipes/, (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: '[]',
      });
    });
    await page.goto('/?prep=15');
    await expect(page.getByText('Niets gevonden.')).toBeVisible();
    await expect(page.getByText('Nog geen recepten.')).toHaveCount(0);
  });

  test('a connection error while filtering shows the banner; "Opnieuw proberen" reloads with the same filter', async ({ page }) => {
    await page.goto('/');
    // Wait for the filter to be visible so the select is interactive before requests are aborted.
    await expect(prepFilter(page)).toBeVisible();
    await expect(prepFilter(page)).toBeEnabled();
    await page.route(supabaseRoutePattern(), (r) => r.abort());
    await setTimeLimit(page, 'prep', 30);
    const retry = page.getByRole('button', { name: 'Opnieuw proberen' });
    await expect(retry).toBeVisible();
    await page.unroute(supabaseRoutePattern());
    const reload = page.waitForRequest(
      (r) => r.method() === 'GET' && r.url().includes('/rest/v1/recipes') && /prep_minutes=lte\.30/.test(r.url()),
    );
    await retry.click();
    await reload;
    await expect(retry).toHaveCount(0);
    await expect(prepFilter(page)).toHaveValue('30');
  });
});

// ---- T-030 / R-029: slider + field for the two time limits. Viewport 360 x 640. ----
const LANGS: Lang[] = ['nl', 'fr'];
const WHICH: TimeWhich[] = ['prep', 'total'];
const PARAM: Record<TimeWhich, string> = { prep: 'prep', total: 'totaal' };
const params = (page: Page) => new URL(page.url()).searchParams;

/** Three recipes for the boundary checks: prep 0/45/46 and total 0/120/121. */
async function seedBoundaries() {
  const tag = unique('Grens');
  const r0 = await insertRecipe(user.client, { title: `${tag} nul`, prep_minutes: 0, total_minutes: 0 });
  const r45 = await insertRecipe(user.client, { title: `${tag} vijfenveertig`, prep_minutes: 45, total_minutes: 120 });
  const r46 = await insertRecipe(user.client, { title: `${tag} zesenveertig`, prep_minutes: 46, total_minutes: 121 });
  return { r0: r0.title, r45: r45.title, r46: r46.title };
}

test.describe('R-029 crit. 1: slider and field show the same value', () => {
  test('sliding to 45 puts 45 in the field; typing 90 puts 90 on the slider; one range and one numeric field each', async ({ page }) => {
    await page.goto('/');
    for (const which of WHICH) {
      await expect(timeBlock(page, which).locator('input[type=range]')).toHaveCount(1);
      await expect(timeBlock(page, which).locator('input[inputmode=numeric]')).toHaveCount(1);
    }
    await timeRange(page, 'prep').fill('45');
    await expect(timeField(page, 'prep')).toHaveValue('45');
    await expect(page).toHaveURL(/[?&]prep=45/);
    await setTimeLimit(page, 'total', 90);
    await expect(timeRange(page, 'total')).toHaveValue('90');
  });
});

test.describe('R-029 crit. 2: ranges of slider and field', () => {
  test('the range is 0-240 in steps of 5', async ({ page }) => {
    await page.goto('/');
    for (const which of WHICH) {
      const range = timeRange(page, which);
      await expect(range).toHaveAttribute('min', '0');
      await expect(range).toHaveAttribute('max', '240');
      await expect(range).toHaveAttribute('step', '5');
    }
  });

  test('4320 is accepted and the slider sits at the far end', async ({ page }) => {
    await page.goto('/');
    await setTimeLimit(page, 'prep', 4320);
    await expect(prepFilter(page)).toHaveValue('4320');
    await expect(timeRange(page, 'prep')).toHaveValue('240');
    await expect(page).toHaveURL(/[?&]prep=4320/);
  });

  test('a 1 after 432 is refused: the field keeps 432 and the URL stays prep=432', async ({ page }) => {
    await page.goto('/');
    await setTimeLimit(page, 'prep', 432);
    await expect(page).toHaveURL(/[?&]prep=432(&|$)/);
    await prepFilter(page).pressSequentially('1');
    await expect(prepFilter(page)).toHaveValue('432');
    expect(params(page).get('prep')).toBe('432');
  });

  test('37 stays 37 in the field and the URL; 37 counts, 38 does not', async ({ page }) => {
    const tag = unique('Zevenendertig');
    const in37 = await insertRecipe(user.client, { title: `${tag} a`, prep_minutes: 37, total_minutes: 40 });
    const in38 = await insertRecipe(user.client, { title: `${tag} b`, prep_minutes: 38, total_minutes: 40 });
    await page.goto('/');
    await setTimeLimit(page, 'prep', 37);
    await expect(prepFilter(page)).toHaveValue('37');
    await expect(page).toHaveURL(/[?&]prep=37/);
    await expect(item(page, in37.title)).toBeVisible();
    await expect(item(page, in38.title)).toHaveCount(0);
  });
});

test.describe('R-029 crit. 3: off by default, "Geen limiet" switches off', () => {
  for (const lang of LANGS) {
    test(`${lang}: empty field with placeholder, slider at 240 with valuetext, no button`, async ({ page }) => {
      await seedLanguage(page, lang);
      await page.goto('/');
      for (const which of WHICH) {
        const field = timeField(page, which, lang);
        await expect(field).toHaveValue('');
        await expect(field).toHaveAttribute('placeholder', text(lang, 'filter.noLimit'));
        await expect(timeRange(page, which, lang)).toHaveValue('240');
        await expect(timeRange(page, which, lang)).toHaveAttribute('aria-valuetext', text(lang, 'filter.noLimit'));
        await expect(noLimitButton(page, which, lang)).toHaveCount(0);
      }
    });
  }

  test('"Geen limiet" at the prep time clears it, resets the slider and keeps totaal', async ({ page }) => {
    const { r0, r45, r46 } = await seedBoundaries();
    await page.goto('/?prep=30&totaal=4320');
    await expect(item(page, r0)).toBeVisible();
    await expect(item(page, r46)).toHaveCount(0);
    await noLimitButton(page, 'prep').click();
    await expect(prepFilter(page)).toHaveValue('');
    await expect(timeRange(page, 'prep')).toHaveValue('240');
    await expect(noLimitButton(page, 'prep')).toHaveCount(0);
    await expect(item(page, r46)).toBeVisible();
    await expect(item(page, r45)).toBeVisible();
    expect(params(page).has('prep')).toBe(false);
    expect(params(page).get('totaal')).toBe('4320');
  });
});

test.describe('R-029 crit. 4: the chosen value counts, one minute above does not', () => {
  test('prep=45, totaal=120 and prep=0 on the URL', async ({ page }) => {
    const { r0, r45, r46 } = await seedBoundaries();
    await page.goto('/?prep=45');
    await expect(item(page, r0)).toBeVisible();
    await expect(item(page, r45)).toBeVisible();
    await expect(item(page, r46)).toHaveCount(0);

    await page.goto('/?totaal=120');
    await expect(item(page, r0)).toBeVisible();
    await expect(item(page, r45)).toBeVisible();
    await expect(item(page, r46)).toHaveCount(0);

    // 0 is a real value, not "off".
    await page.goto('/?prep=0');
    await expect(item(page, r0)).toBeVisible();
    await expect(item(page, r45)).toHaveCount(0);
    await expect(item(page, r46)).toHaveCount(0);
    await expect(prepFilter(page)).toHaveValue('0');
  });

  test('typing 0 shows only the 0-minute recipe', async ({ page }) => {
    const { r0, r45 } = await seedBoundaries();
    await page.goto('/');
    await setTimeLimit(page, 'prep', 0);
    await expect(item(page, r45)).toHaveCount(0);
    await expect(item(page, r0)).toBeVisible();
    await expect(page).toHaveURL(/[?&]prep=0/);
  });
});

test.describe('R-029 crit. 5: invalid input is refused, empty switches off', () => {
  test('a whole entry with a comma or dot ("30,5", "30.5") is refused as one: the field keeps 30', async ({ page }) => {
    await page.goto('/?prep=30');
    await expect(prepFilter(page)).toHaveValue('30');
    for (const typed of ['30,5', '30.5', '-30', '30a']) {
      await prepFilter(page).fill(typed);
      await expect(prepFilter(page)).toHaveValue('30');
      expect(params(page).get('prep')).toBe('30');
    }
  });

  test('a refused character changes neither field nor URL', async ({ page }) => {
    await page.goto('/?prep=30');
    for (const key of ['a', '-', '.', ',']) {
      await prepFilter(page).focus();
      await page.keyboard.press('End');
      await page.keyboard.type(key);
      await expect(prepFilter(page)).toHaveValue('30');
      expect(params(page).get('prep')).toBe('30');
    }
  });

  test('emptying the field removes prep and puts the slider at 240', async ({ page }) => {
    await page.goto('/?prep=30');
    await prepFilter(page).fill('');
    await expect(page).not.toHaveURL(/prep=/);
    await expect(timeRange(page, 'prep')).toHaveValue('240');
  });
});

test.describe('R-029 crit. 6: recipes without times fall outside an active filter', () => {
  test('visible without a filter; gone with prep=4320 and with totaal=4320', async ({ page }) => {
    const tag = unique('Zonder tijd');
    const row = await insertRecipe(user.client, { title: tag });
    // An old sample row without times: lift the NOT VALID checks in one transaction and add them again.
    await sql(`begin;
      alter table public.recipes drop constraint recipes_prep_required, drop constraint recipes_total_required;
      update public.recipes set prep_minutes = null, total_minutes = null where id = '${row.id}';
      alter table public.recipes
        add constraint recipes_prep_required check (prep_minutes is not null) not valid,
        add constraint recipes_total_required check (total_minutes is not null) not valid;
      commit;`);
    await page.goto('/');
    await expect(item(page, tag)).toBeVisible();
    await page.goto('/?prep=4320');
    await expect(filtersButton(page)).toHaveText(filtersLabel('nl', 1));
    await expect(item(page, tag)).toHaveCount(0);
    await page.goto('/?totaal=4320');
    await expect(item(page, tag)).toHaveCount(0);
  });
});

test.describe('R-029 crit. 7: the URL holds the value', () => {
  test('/?prep=60&totaal=120 shows 60 and 120 in the fields', async ({ page }) => {
    await page.goto('/?prep=60&totaal=120');
    await expect(prepFilter(page)).toHaveValue('60');
    await expect(totalFilter(page)).toHaveValue('120');
  });

  test('/?prep=abc is no filter: empty field, bare "Filters" button, all recipes', async ({ page }) => {
    const { r0, r46 } = await seedBoundaries();
    await page.goto('/?prep=abc');
    await expect(prepFilter(page)).toHaveValue('');
    await expect(filtersButton(page)).toHaveText(filtersLabel('nl', 0));
    await expect(item(page, r0)).toBeVisible();
    await expect(item(page, r46)).toBeVisible();
  });
});

test.describe('R-029 crit. 8: together with search and favourites', () => {
  test('/favorieten: a search term and prep=37 leave only favourites that pass both; the button says "Filters (2)"', async ({ page }) => {
    const s = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
    const ing = (name: string) => ({ name, quantity: 1, unit: 'stuk' });
    const hit = await insertRecipe(user.client, { title: `Raak ${s}`, ingredients: [ing(`feta${s}`)], prep_minutes: 37, total_minutes: 40 });
    const slow = await insertRecipe(user.client, { title: `Traag ${s}`, ingredients: [ing(`feta${s}`)], prep_minutes: 38, total_minutes: 40 });
    const other = await insertRecipe(user.client, { title: `Andere ${s}`, ingredients: [ing(`kaas${s}`)], prep_minutes: 37, total_minutes: 40 });
    const notFav = await insertRecipe(user.client, { title: `Geen hart ${s}`, ingredients: [ing(`feta${s}`)], prep_minutes: 37, total_minutes: 40 });
    const res = await adminClient()
      .from('favorites')
      .insert([hit, slow, other].map((r) => ({ user_id: user.id, recipe_id: r.id })));
    expect(res.error).toBeNull();
    await page.goto(`/favorieten?met=feta${s}&prep=37`);
    await expect(item(page, hit.title)).toBeVisible();
    await expect(item(page, slow.title)).toHaveCount(0);
    await expect(item(page, other.title)).toHaveCount(0);
    await expect(item(page, notFav.title)).toHaveCount(0);
    await expect(filtersButton(page)).toHaveText(filtersLabel('nl', 2));
  });

  test('the counter counts each time limit once; "Alles wissen" empties both fields', async ({ page }) => {
    await page.goto('/?prep=0&totaal=4320');
    await expect(filtersButton(page)).toHaveText(filtersLabel('nl', 2));
    await clearAllButton(page).click();
    for (const which of WHICH) {
      await expect(timeField(page, which)).toHaveValue('');
      await expect(timeRange(page, which)).toHaveValue('240');
      await expect(noLimitButton(page, which)).toHaveCount(0);
    }
    await expect(filtersButton(page)).toHaveText(filtersLabel('nl', 0));
    await expect(page).not.toHaveURL(/prep=|totaal=/);
  });
});

test.describe('R-029 crit. 9: label, keyboard, tap targets, no sideways scroll', () => {
  for (const lang of LANGS) {
    test(`${lang}: label above field, accessible slider, targets >= 44 px, fits 360 px`, async ({ page }) => {
      await seedLanguage(page, lang);
      await page.goto('/?prep=30&totaal=60');
      await openFilters(page);
      const boxes = [];
      for (const which of WHICH) {
        const field = timeField(page, which, lang);
        const id = await field.getAttribute('id');
        expect(id).toBeTruthy();
        const label = page.locator(`label[for="${id}"]`);
        await expect(label).toBeVisible();
        const l = (await label.boundingBox())!;
        const f = (await field.boundingBox())!;
        expect(l.y + l.height, `${which} label above the field`).toBeLessThanOrEqual(f.y + 0.5);
        boxes.push(f);
        await expect(timeRange(page, which, lang)).toBeVisible();
        const r = (await timeRange(page, which, lang).boundingBox())!;
        const b = (await noLimitButton(page, which, lang).boundingBox())!;
        expect(f.height, `${which} field height`).toBeGreaterThanOrEqual(44);
        expect(r.height, `${which} range height`).toBeGreaterThanOrEqual(44);
        expect(b.height, `${which} button height`).toBeGreaterThanOrEqual(44);
        for (const box of [f, r, b]) expect(box.x + box.width).toBeLessThanOrEqual(360);
      }
      const inner = await filtersPanel(page).evaluate((el) => {
        const style = getComputedStyle(el);
        return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      });
      for (const b of boxes) {
        expect(Math.abs(b.x - boxes[0].x), 'same x').toBeLessThanOrEqual(1);
        expect(Math.abs(b.width - inner), 'full panel width').toBeLessThanOrEqual(1);
      }
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(360);
    });
  }

  test('keyboard: ArrowLeft from "Geen limiet" gives 235 and prep=235; Home gives 0', async ({ page }) => {
    await page.goto('/');
    await timeRange(page, 'prep').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(prepFilter(page)).toHaveValue('235');
    await expect(page).toHaveURL(/[?&]prep=235/);
    await page.keyboard.press('Home');
    await expect(prepFilter(page)).toHaveValue('0');
    await expect(page).toHaveURL(/[?&]prep=0(&|$)/);
  });
});

test.describe('editing keeps the times (R-001, R-003)', () => {
  test('the edit form shows the stored times and a fresh form is not dirty', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Bewerk tijd'), prep_minutes: 25, total_minutes: 95 });
    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(prepField(page)).toHaveValue('25');
    await expect(totalField(page)).toHaveValue('95');
    await page
      .getByRole('navigation', { name: nl['nav.label'] })
      .getByRole('link', { name: nl['nav.recipes'] })
      .click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(nl['form.discardQuestion'])).toHaveCount(0);
  });

  test('changing a time and leaving asks "Wijzigingen weggooien?"', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Bewerk tijd 2'), prep_minutes: 25, total_minutes: 95 });
    await page.goto(`/recept/${row.id}/bewerken`);
    await expect(prepField(page)).toHaveValue('25');
    await prepField(page).fill('26');
    await page
      .getByRole('navigation', { name: nl['nav.label'] })
      .getByRole('link', { name: nl['nav.recipes'] })
      .click();
    await expect(page.getByText(nl['form.discardQuestion'])).toBeVisible();
  });
});
