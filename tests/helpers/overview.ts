// Test-only: the overview toolbar and the filters panel (T-029 / R-028).
// The search and every filter sit behind a "Filters" button; most older specs need them open.
import { expect, type Locator, type Page } from '@playwright/test';
import nlJson from '../../src/i18n/nl.json' with { type: 'json' };
import frJson from '../../src/i18n/fr.json' with { type: 'json' };

export type Lang = 'nl' | 'fr';
const texts: Record<Lang, Record<string, string>> = { nl: nlJson as Record<string, string>, fr: frJson as Record<string, string> };

/** A text of the interface in the given language, by its key in nl.json / fr.json. */
export const text = (lang: Lang, key: string): string => texts[lang][key];

/** The "Filters" button, found by the panel it controls (its name changes with the counter). */
export const filtersButton = (page: Page): Locator => page.locator('button[aria-controls="overview-filters"]');

/** The panel with the search and the filters. It stays mounted when closed (`hidden`). */
export const filtersPanel = (page: Page): Locator => page.locator('#overview-filters');

/** The sort list, found by its label "Sorteren" / "Trier". */
export const sortSelect = (page: Page, lang: Lang = 'nl'): Locator =>
  page.getByLabel(text(lang, 'overview.sort'), { exact: true });

/** The direction button; its name is the current direction ("Oplopend" or "Aflopend"). */
export const directionButton = (page: Page, lang: Lang = 'nl'): Locator =>
  page.getByRole('button', { name: new RegExp(`^(${text(lang, 'overview.sortAsc')}|${text(lang, 'overview.sortDesc')})$`) });

/** The "Alles wissen" button inside the panel. */
export const clearAllButton = (page: Page, lang: Lang = 'nl'): Locator =>
  filtersPanel(page).getByRole('button', { name: text(lang, 'overview.clearAll'), exact: true });

/** The label of the "Filters" button for a number of active filters. */
export const filtersLabel = (lang: Lang, count: number): string =>
  count === 0 ? text(lang, 'overview.filters') : text(lang, 'overview.filtersCount').replace('{n}', String(count));

/** The two time limits of the filters panel (T-030 / R-029): maximum prep time and maximum total time. */
export type TimeWhich = 'prep' | 'total';
const TIME_KEYS: Record<TimeWhich, { label: string; slider: string }> = {
  prep: { label: 'filter.maxPrep', slider: 'filter.maxPrepSlider' },
  total: { label: 'filter.maxTotal', slider: 'filter.maxTotalSlider' },
};

/** The text field of a time limit, found by its visible label. */
export const timeField = (page: Page, which: TimeWhich, lang: Lang = 'nl'): Locator =>
  page.getByLabel(text(lang, TIME_KEYS[which].label), { exact: true });

/** The range of a time limit, found by its own accessible name. */
export const timeRange = (page: Page, which: TimeWhich, lang: Lang = 'nl'): Locator =>
  page.getByRole('slider', { name: text(lang, TIME_KEYS[which].slider), exact: true });

/** The whole block of one time limit (label, field, range, button). */
export const timeBlock = (page: Page, which: TimeWhich, lang: Lang = 'nl'): Locator =>
  page.locator('.time-limit').filter({ has: timeField(page, which, lang) });

/** The "Geen limiet" button of one time limit; it only exists while that limit is on. */
export const noLimitButton = (page: Page, which: TimeWhich, lang: Lang = 'nl'): Locator =>
  timeBlock(page, which, lang).getByRole('button', { name: text(lang, 'filter.noLimit'), exact: true });

/** Types a number of minutes into the field (null empties it = limit off). Panel must be open. */
export async function setTimeLimit(page: Page, which: TimeWhich, minutes: number | null, lang: Lang = 'nl'): Promise<void> {
  const field = timeField(page, which, lang);
  await expect(field).toBeVisible();
  await field.fill(minutes === null ? '' : String(minutes));
}

/** Opens the panel when it is closed; does nothing when it is already open. */
export async function openFilters(page: Page): Promise<void> {
  const button = filtersButton(page);
  await expect(button).toBeVisible();
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
}

/** Closes the panel when it is open. */
export async function closeFilters(page: Page): Promise<void> {
  const button = filtersButton(page);
  await expect(button).toBeVisible();
  if ((await button.getAttribute('aria-expanded')) === 'true') await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
}

const isOverviewPath = (page: Page): boolean => {
  try {
    const path = new URL(page.url()).pathname;
    return path === '/' || path === '/favorieten';
  } catch {
    return false;
  }
};

async function openAfterVisit(page: Page): Promise<void> {
  if (!isOverviewPath(page)) return;
  // A visit that ends elsewhere (sign-in screen) or an overview without the button: leave it to the test.
  try {
    await filtersButton(page).waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    return;
  }
  await openFilters(page);
}

/**
 * Wraps `page.goto` and `page.reload`: after a visit of `/` or `/favorieten` the filters panel opens.
 * For older specs that operate filter fields; their expectations stay as they were.
 * Pages from `browser.newContext()` or `context.newPage()` are not wrapped: call `openFilters` there.
 */
export function autoOpenFilters(page: Page): void {
  const goto = page.goto.bind(page);
  const reload = page.reload.bind(page);
  page.goto = (async (...args: Parameters<Page['goto']>) => {
    const response = await goto(...args);
    await openAfterVisit(page);
    return response;
  }) as Page['goto'];
  page.reload = (async (...args: Parameters<Page['reload']>) => {
    const response = await reload(...args);
    await openAfterVisit(page);
    return response;
  }) as Page['reload'];
}
