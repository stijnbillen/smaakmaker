import { expect, test, type Page } from '@playwright/test';
import en from '../../src/i18n/en.json' with { type: 'json' };
import nl from '../../src/i18n/nl.json' with { type: 'json' };
import { signInForRoute, signInViaStorage, supabaseRoutePattern } from '../helpers/session';
import {
  adminClient,
  assertSupabaseUp,
  createTestUser,
  deleteTestUser,
  insertRecipe,
  makeAdmin,
  type TestUser,
} from '../helpers/supabase-admin';
import { prepareRoutes, routes } from './routes';

// T-018 / R-023: bilingual interface. Playwright runs with locale nl-BE (playwright.config.ts),
// so every test that needs another browser language says so with test.use.
const NL = nl as Record<string, string>;
const EN = en as Record<string, string>;
const TEXTS = { nl: NL, en: EN } as const;
type Lang = 'nl' | 'en';
const STORAGE_KEY = 'smaakmaker.lang';

let user: TestUser;
let unnamed: TestUser;
let admin: TestUser;
let reviewer: TestUser;

test.beforeAll(async () => {
  await assertSupabaseUp();
  user = await createTestUser('lang');
  unnamed = await createTestUser('langnn', { displayName: null });
  admin = await createTestUser('langadm');
  await makeAdmin(admin.id);
  reviewer = await createTestUser('langrev', { displayName: 'Jan' });
  await prepareRoutes(user.client);
});

test.afterAll(async () => {
  for (const u of [user, unnamed, admin, reviewer]) if (u) await deleteTestUser(u);
});

const unique = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/** Chooses the language before the app starts; only when the visitor has no choice yet, so reloads keep a later choice. */
async function seedLanguage(page: Page, lang: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
    },
    [STORAGE_KEY, lang],
  );
}

const switchGroup = (page: Page, lang: Lang) => page.getByRole('group', { name: TEXTS[lang]['language.label'], exact: true });
const langButton = (page: Page, lang: Lang, target: Lang) =>
  switchGroup(page, lang).getByRole('button', { name: target === 'nl' ? 'Nederlands' : 'English', exact: true });
const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const navLink = (page: Page, lang: Lang, key: string) =>
  page.getByRole('navigation', { name: TEXTS[lang]['nav.label'] }).getByRole('link', { name: TEXTS[lang][key], exact: true });

// ---------------------------------------------------------------------------------------------
// Crit. 2: choice on sign-in and profile, kept on the device.
// ---------------------------------------------------------------------------------------------
test.describe('language choice (crit. 2)', () => {
  for (const lang of ['nl', 'en'] as const) {
    test(`sign-in screen shows the choice with the accessible name "${TEXTS[lang]['language.label']}" and both language names, interface in ${lang}`, async ({ page }) => {
      await seedLanguage(page, lang);
      await page.goto('/aanmelden');
      await expect(switchGroup(page, lang)).toBeVisible();
      // Each language is shown in its own name, whatever the interface language is.
      await expect(langButton(page, lang, 'nl')).toBeVisible();
      await expect(langButton(page, lang, 'en')).toBeVisible();
      await expect(langButton(page, lang, lang)).toHaveAttribute('aria-pressed', 'true');
    });

    test(`profile shows the choice, interface in ${lang}`, async ({ page }) => {
      await signInViaStorage(page, user.session);
      await seedLanguage(page, lang);
      await page.goto('/profiel');
      await expect(switchGroup(page, lang)).toBeVisible();
      await expect(langButton(page, lang, 'nl')).toBeVisible();
      await expect(langButton(page, lang, 'en')).toBeVisible();
    });
  }

  test('English on /aanmelden survives a reload and a new page in the same context', async ({ page, context }) => {
    await page.goto('/aanmelden');
    await expect(heading(page)).toHaveText(NL['auth.title']);
    await langButton(page, 'nl', 'en').click();
    await expect(heading(page)).toHaveText(EN['auth.title']);
    expect(await page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY)).toBe('en');

    await page.reload();
    await expect(heading(page)).toHaveText(EN['auth.title']);

    const second = await context.newPage();
    await second.goto('/aanmelden');
    await expect(heading(second)).toHaveText(EN['auth.title']);
  });

  test('on /profiel: English survives a reload, and so does the way back to Dutch', async ({ page }) => {
    await signInViaStorage(page, user.session);
    await page.goto('/profiel');
    await expect(heading(page)).toHaveText(NL['profile.title']);
    await langButton(page, 'nl', 'en').click();
    await expect(heading(page)).toHaveText(EN['profile.title']);
    await page.reload();
    await expect(heading(page)).toHaveText(EN['profile.title']);

    await langButton(page, 'en', 'nl').click();
    await expect(heading(page)).toHaveText(NL['profile.title']);
    await page.reload();
    await expect(heading(page)).toHaveText(NL['profile.title']);
    expect(await page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY)).toBe('nl');
  });

  test('a choice made on the sign-in screen is still there on /profiel', async ({ page }) => {
    await page.goto('/aanmelden');
    await langButton(page, 'nl', 'en').click();
    await signInViaStorage(page, user.session);
    await page.goto('/profiel');
    await expect(heading(page)).toHaveText(EN['profile.title']);
  });
});

// ---------------------------------------------------------------------------------------------
// Crit. 3: first visit follows the browser language; a saved choice wins.
// ---------------------------------------------------------------------------------------------
test.describe('browser language en-US (crit. 3)', () => {
  test.use({ locale: 'en-US' });

  test('empty storage -> English', async ({ page }) => {
    await page.goto('/aanmelden');
    await expect(heading(page)).toHaveText(EN['auth.title']);
  });

  test('a saved Dutch choice wins over the browser language', async ({ page }) => {
    await page.addInitScript(([k]) => window.localStorage.setItem(k, 'nl'), [STORAGE_KEY]);
    await page.goto('/aanmelden');
    await expect(heading(page)).toHaveText(NL['auth.title']);
  });

  test('an invalid saved value counts as no choice', async ({ page }) => {
    await page.addInitScript(([k]) => window.localStorage.setItem(k, 'fr'), [STORAGE_KEY]);
    await page.goto('/aanmelden');
    await expect(heading(page)).toHaveText(EN['auth.title']);
  });
});

test.describe('browser language nl-BE (crit. 3)', () => {
  test.use({ locale: 'nl-BE' });

  test('empty storage -> Dutch', async ({ page }) => {
    await page.goto('/aanmelden');
    await expect(heading(page)).toHaveText(NL['auth.title']);
  });

  test('a saved English choice wins over the browser language', async ({ page }) => {
    await page.addInitScript(([k]) => window.localStorage.setItem(k, 'en'), [STORAGE_KEY]);
    await page.goto('/aanmelden');
    await expect(heading(page)).toHaveText(EN['auth.title']);
  });
});

// ---------------------------------------------------------------------------------------------
// Crit. 4: switching is immediate, without reload or rebuild; <html lang> and title follow.
// ---------------------------------------------------------------------------------------------
test.describe('live switching (crit. 4)', () => {
  test('typed e-mail address stays, no navigation, lang and title follow, both ways', async ({ page }) => {
    await page.goto('/aanmelden');
    const emailBox = (lang: Lang) => page.getByRole('textbox', { name: TEXTS[lang]['auth.emailLabel'], exact: true });
    await emailBox('nl').fill('anke@example.com');

    let navigations = 0;
    page.on('framenavigated', () => navigations++);

    await langButton(page, 'nl', 'en').click();
    await expect(heading(page)).toHaveText(EN['auth.title']);
    await expect(page.getByText(EN['auth.intro'])).toBeVisible();
    await expect(emailBox('en')).toHaveValue('anke@example.com');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
    expect(await page.title()).toBe(EN['app.title']);

    await langButton(page, 'en', 'nl').click();
    await expect(heading(page)).toHaveText(NL['auth.title']);
    await expect(emailBox('nl')).toHaveValue('anke@example.com');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('nl');
    expect(await page.title()).toBe(NL['app.title']);

    expect(navigations, 'navigations while switching').toBe(0);
  });

  test('on /profiel: switch, then go to / through the navigation: bar and overview are in the new language', async ({ page }) => {
    await signInViaStorage(page, user.session);
    await page.goto('/profiel');
    await langButton(page, 'nl', 'en').click();
    await expect(heading(page)).toHaveText(EN['profile.title']);
    await expect(page.getByRole('navigation', { name: EN['nav.label'] })).toBeVisible();
    await navLink(page, 'en', 'nav.recipes').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(heading(page)).toHaveText(EN['overview.title']);
    await expect(page.getByRole('navigation', { name: EN['nav.label'] })).toBeVisible();
    await expect(navLink(page, 'en', 'nav.favorites')).toBeVisible();
  });

  test('a message shown before switching is in the new language afterwards (invalid e-mail)', async ({ page }) => {
    await page.goto('/aanmelden');
    await page.getByRole('textbox', { name: NL['auth.emailLabel'], exact: true }).fill('geen-adres');
    await page.getByRole('button', { name: NL['auth.requestCode'], exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(NL['auth.emailInvalid']);
    await langButton(page, 'nl', 'en').click();
    await expect(page.getByRole('alert')).toHaveText(EN['auth.emailInvalid']);
    await langButton(page, 'en', 'nl').click();
    await expect(page.getByRole('alert')).toHaveText(NL['auth.emailInvalid']);
  });
});

// ---------------------------------------------------------------------------------------------
// Crit. 5: nothing Dutch is left in the English interface.
// ---------------------------------------------------------------------------------------------

/** Visible text nodes plus aria-label, placeholder, title and alt of everything on the page. */
async function visibleStrings(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
      if (el.getClientRects().length === 0) continue;
      const text = (n.textContent ?? '').trim();
      if (text) out.push(text);
    }
    for (const el of Array.from(document.body.querySelectorAll('[aria-label],[placeholder],[title],[alt]'))) {
      for (const a of ['aria-label', 'placeholder', 'title', 'alt']) {
        const v = el.getAttribute(a)?.trim();
        if (v) out.push(v);
      }
    }
    return out;
  });
}

// Dutch texts that differ from the English text of the same key, and that are no English text of another key.
const enValues = new Set(Object.values(EN));
const dutchOnly = Object.keys(NL)
  .filter((k) => NL[k] !== EN[k] && !enValues.has(NL[k]))
  .map((k) => {
    const pattern = NL[k]
      .split(/(\{\w+\})/)
      .map((part) => (/^\{\w+\}$/.test(part) ? '.+?' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('');
    return { key: k, re: new RegExp(`^${pattern}$`) };
  });

async function expectNoDutch(page: Page, where: string): Promise<void> {
  const strings = await visibleStrings(page);
  const leaked = strings.flatMap((s) => dutchOnly.filter((d) => d.re.test(s)).map((d) => `${d.key}: "${s}"`));
  expect(leaked, `Dutch text in the English interface (${where})`).toEqual([]);
}

test.describe('English interface has no Dutch left (crit. 5)', () => {
  test('the check itself finds a Dutch text (negative control)', async ({ page }) => {
    await seedLanguage(page, 'en');
    await page.goto('/aanmelden');
    await page.evaluate((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      document.body.appendChild(p);
    }, NL['auth.intro']);
    await expect(expectNoDutch(page, 'control')).rejects.toThrow();
  });

  for (const route of routes) {
    test(`screen ${route.name}`, async ({ page }) => {
      await signInForRoute(page, route.auth, { full: user.session, unnamed: unnamed.session, admin: admin.session });
      await seedLanguage(page, 'en');
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expectNoDutch(page, route.name);
    });
  }

  test('confirmation: delete recipe', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Wegdoen') });
    await signInViaStorage(page, user.session);
    await seedLanguage(page, 'en');
    await page.goto(`/recept/${row.id}`);
    await page.getByRole('button', { name: EN['recipe.delete'], exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText(EN['recipe.deleteQuestion'])).toBeVisible();
    await expect(dialog.getByRole('button', { name: EN['recipe.deleteConfirm'], exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: EN['form.cancel'], exact: true })).toBeVisible();
    await expectNoDutch(page, 'delete recipe dialog');
  });

  test('confirmation: discard changes', async ({ page }) => {
    await signInViaStorage(page, user.session);
    await seedLanguage(page, 'en');
    await page.goto('/nieuw');
    await page.getByRole('textbox', { name: EN['form.titleLabel'], exact: true }).fill('Half werk');
    await navLink(page, 'en', 'nav.recipes').click();
    await expect(page.getByText(EN['form.discardQuestion'])).toBeVisible();
    await expect(page.getByRole('button', { name: EN['form.discard'], exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: EN['form.stay'], exact: true })).toBeVisible();
    await expectNoDutch(page, 'discard dialog');
  });

  test('confirmation: delete review', async ({ page }) => {
    const row = await insertRecipe(reviewer.client, { title: unique('Beoordeeld') });
    const res = await adminClient()
      .from('reviews')
      .insert({ recipe_id: row.id, author_id: user.id, rating: 4, body: null });
    if (res.error) throw res.error;
    await signInViaStorage(page, user.session);
    await seedLanguage(page, 'en');
    await page.goto(`/recept/${row.id}`);
    await page.getByRole('button', { name: EN['reviews.delete'], exact: true }).click();
    await expect(page.getByText(EN['reviews.deleteQuestion'])).toBeVisible();
    await expectNoDutch(page, 'delete review dialog');
  });

  test('connection message (route aborted)', async ({ page }) => {
    await signInViaStorage(page, user.session);
    await seedLanguage(page, 'en');
    await page.route(supabaseRoutePattern(), (r) => r.abort());
    await page.goto('/');
    const banner = page.getByRole('alert');
    await expect(banner).toContainText(EN['connection.error']);
    await expect(page.getByRole('button', { name: EN['connection.retry'], exact: true })).toBeVisible();
    await expectNoDutch(page, 'connection banner');
  });

  test('field error: invalid invite code', async ({ page }) => {
    await seedLanguage(page, 'en');
    await page.goto('/aanmelden');
    await page.getByRole('textbox', { name: EN['auth.emailLabel'], exact: true }).fill('anke@example.com');
    await page.getByRole('button', { name: EN['auth.haveInvite'], exact: true }).click();
    await page.getByRole('button', { name: EN['auth.requestCode'], exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(EN['auth.codeInvalid']);
    await expectNoDutch(page, 'field error');
  });

  test('save error (recipe row not saved)', async ({ page }) => {
    const row = await insertRecipe(user.client, { title: unique('Opslagfout') });
    await signInViaStorage(page, user.session);
    await seedLanguage(page, 'en');
    await page.goto(`/recept/${row.id}/bewerken`);
    const title = page.getByRole('textbox', { name: EN['form.titleLabel'], exact: true });
    await expect(title).toHaveValue(row.title);
    await page.route(/\/rest\/v1\/recipes/, async (route) => {
      if (route.request().method() === 'PATCH') await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      else await route.continue();
    });
    await title.fill('Nieuwe titel die niet lukt');
    await page.getByRole('button', { name: EN['form.save'], exact: true }).click();
    await expect(page.getByText(EN['form.error'])).toBeVisible();
    await expectNoDutch(page, 'save error');
  });
});

// ---------------------------------------------------------------------------------------------
// Crit. 6: quantity input and display in English.
// ---------------------------------------------------------------------------------------------
test.describe('numbers in English (crit. 6)', () => {
  const field = (page: Page, key: string) => page.getByRole('textbox', { name: EN[key], exact: true });
  // T-021: the ingredient name and unit fields are comboboxes (suggestion list); the others stay textboxes.
  const byPrefix = (page: Page, key: string) =>
    page.getByRole(key === 'form.ingredientName' || key === 'form.unit' ? 'combobox' : 'textbox', {
      name: new RegExp(`^${EN[key].split('{')[0].trim()}`),
    });

  test('quantity "1,5" is saved and shown as 1.5 on the detail page and in the edit form', async ({ page }) => {
    const title = unique('Komma');
    await signInViaStorage(page, user.session);
    await seedLanguage(page, 'en');
    await page.goto('/nieuw');
    await field(page, 'form.titleLabel').fill(title);
    await field(page, 'form.prepMinutes').fill('10');
    await field(page, 'form.totalMinutes').fill('20');
    await field(page, 'form.servings').fill('4');
    await byPrefix(page, 'form.ingredientName').first().fill('ei');
    await byPrefix(page, 'form.quantity').first().fill('1,5');
    await byPrefix(page, 'form.step').first().fill('Roer.');
    await page.getByRole('button', { name: EN['form.save'], exact: true }).click();
    await expect(page).toHaveURL(/\/recept\/[0-9a-f-]+$/);
    await expect(page.locator('.ingredient-list')).toContainText('1.5');
    await expect(page.locator('.ingredient-list')).not.toContainText('1,5');

    await page.getByRole('link', { name: EN['recipe.edit'], exact: true }).or(page.getByRole('button', { name: EN['recipe.edit'], exact: true })).click();
    await expect(byPrefix(page, 'form.quantity').first()).toHaveValue('1.5');
  });

  test('scaling 200 g for 4 to 6 portions shows 300', async ({ page }) => {
    const row = await insertRecipe(user.client, {
      title: unique('Omrekenen'),
      ingredients: [{ name: 'bloem', quantity: 200, unit: 'g' }],
      servings: 4,
    });
    await signInViaStorage(page, user.session);
    await seedLanguage(page, 'en');
    await page.goto(`/recept/${row.id}`);
    const more = page.getByRole('button', { name: EN['servings.increase'], exact: true });
    await more.click();
    await more.click();
    await expect(page.locator('.ingredient-list')).toContainText('300');
  });

  test('a decimal quantity from the database is shown with a point in English and a comma in Dutch', async ({ page }) => {
    const row = await insertRecipe(user.client, {
      title: unique('Decimaal'),
      ingredients: [{ name: 'melk', quantity: 0.25, unit: 'l' }],
    });
    await signInViaStorage(page, user.session);
    await seedLanguage(page, 'en');
    await page.goto(`/recept/${row.id}`);
    await expect(page.locator('.ingredient-list')).toContainText('0.25');
    await page.goto('/profiel');
    await langButton(page, 'en', 'nl').click();
    await page.goto(`/recept/${row.id}`);
    await expect(page.locator('.ingredient-list')).toContainText('0,25');
  });
});

// ---------------------------------------------------------------------------------------------
// Crit. 10: user content is never translated.
// ---------------------------------------------------------------------------------------------
test.describe('user content stays as written (crit. 10)', () => {
  test('title, step, source, note, review, name and free ingredient/unit are literal in English', async ({ page }) => {
    const title = unique('Soep van oma');
    const row = await insertRecipe(user.client, {
      title,
      ingredients: [{ name: 'aardappel', quantity: 2, unit: 'el' }],
      steps: ['Snij de ui'],
      source: 'oma',
      note: 'Lekker',
    });
    const res = await adminClient()
      .from('reviews')
      .insert({ recipe_id: row.id, author_id: reviewer.id, rating: 5, body: 'Heerlijk' });
    if (res.error) throw res.error;

    await signInViaStorage(page, user.session);
    await seedLanguage(page, 'en');

    await page.goto('/');
    await expect(page.getByText(title).first()).toBeVisible();

    await page.goto(`/recept/${row.id}`);
    for (const text of ['Snij de ui', 'oma', 'Lekker', 'Heerlijk', 'Jan', 'aardappel', 'el']) {
      await expect(page.getByText(text, { exact: false }).first(), text).toBeVisible();
    }
    await expect(page.getByText('Snij de ui', { exact: true })).toBeVisible();
    await expect(page.getByText('Heerlijk', { exact: true })).toBeVisible();
    await expect(page.getByText('Lekker', { exact: true })).toBeVisible();
    // the author line holds more than the name, so no exact match here
    await expect(page.getByText('Jan').first()).toBeVisible();
    await expect(page.locator('.ingredient-list')).toContainText('2 el aardappel');
  });
});
