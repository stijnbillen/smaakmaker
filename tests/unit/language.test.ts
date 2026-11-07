import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import frJson from '../../src/i18n/fr.json';
import nlJson from '../../src/i18n/nl.json';
import {
  detectLanguage,
  getLanguage,
  initLanguage,
  loadLanguage,
  locale,
  setLanguage,
  subscribe,
} from '../../src/i18n/language';
import { format, t } from '../../src/i18n/t';
import { RETIRED_BROWSER_GB, RETIRED_BROWSER_US, RETIRED_LANG } from '../helpers/retired-lang';

// T-018 / R-023 crit. 2, 3 and 4, changed by T-022 / R-026 crit. 2: the second language is French.
// The module state is shared between test files (vitest isolate:false), so every test ends with the language back on Dutch.

const nl = nlJson as Record<string, string>;
const fr = frJson as Record<string, string>;
const KEY = 'smaakmaker.lang';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const browser = (...languages: string[]) => vi.stubGlobal('navigator', { languages, language: languages[0] });

let doc: { documentElement: { lang: string }; title: string };

beforeEach(() => {
  doc = { documentElement: { lang: '' }, title: '' };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('localStorage', fakeStorage());
  browser('nl-BE');
});

afterEach(() => {
  setLanguage('nl');
  vi.unstubAllGlobals();
});

describe('detectLanguage (R-026 crit. 2: browser language starting with "fr" -> French, else Dutch)', () => {
  it.each([
    [['fr-BE'], 'fr'],
    [['FR'], 'fr'],
    [['fr'], 'fr'],
    [['nl-BE'], 'nl'],
    [['nl'], 'nl'],
    [[RETIRED_BROWSER_US], 'nl'],
    [['de'], 'nl'],
    [['nl-BE', 'fr-BE'], 'nl'], // only the first language counts
    [[], 'nl'],
  ])('%j -> %s', (languages, expected) => {
    expect(detectLanguage(languages as string[])).toBe(expected);
  });
});

describe('loadLanguage (R-026 crit. 2)', () => {
  it('uses the saved choice, which wins over the browser language', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [KEY]: 'fr' }));
    browser('nl-BE');
    expect(loadLanguage()).toBe('fr');
    vi.stubGlobal('localStorage', fakeStorage({ [KEY]: 'nl' }));
    browser('fr-BE');
    expect(loadLanguage()).toBe('nl');
  });

  it('follows the browser language without a saved choice', () => {
    browser('fr-FR');
    expect(loadLanguage()).toBe('fr');
    browser('nl-BE');
    expect(loadLanguage()).toBe('nl');
    browser(RETIRED_BROWSER_GB);
    expect(loadLanguage()).toBe('nl');
  });

  it('falls back to navigator.language when navigator.languages is missing', () => {
    vi.stubGlobal('navigator', { language: 'fr-BE' });
    expect(loadLanguage()).toBe('fr');
    vi.stubGlobal('navigator', { language: 'de-DE' });
    expect(loadLanguage()).toBe('nl');
  });

  // The old choice from before T-022 must not break anything: it counts as "no choice".
  it('treats a retired saved choice as "no choice" and does not throw', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [KEY]: RETIRED_LANG }));
    browser('fr-FR');
    expect(() => loadLanguage()).not.toThrow();
    expect(loadLanguage()).toBe('fr');
    browser(RETIRED_BROWSER_GB);
    expect(loadLanguage()).toBe('nl');
  });

  it.each(['NL', '', 'null', ' fr', 'FR'])('ignores an invalid saved value %j as "no choice"', (bad) => {
    vi.stubGlobal('localStorage', fakeStorage({ [KEY]: bad }));
    browser('fr-BE');
    expect(loadLanguage()).toBe('fr');
    browser('nl-BE');
    expect(loadLanguage()).toBe('nl');
  });

  it('initLanguage with a retired saved choice follows the browser and leaves <html lang> valid', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [KEY]: RETIRED_LANG }));
    browser('fr-BE');
    initLanguage();
    expect(getLanguage()).toBe('fr');
    expect(doc.documentElement.lang).toBe('fr');
  });
});

describe('setLanguage (crit. 2 and 4)', () => {
  it('saves nl or fr under smaakmaker.lang', () => {
    const store = fakeStorage();
    vi.stubGlobal('localStorage', store);
    setLanguage('fr');
    expect(store.data.get(KEY)).toBe('fr');
    setLanguage('nl');
    expect(store.data.get(KEY)).toBe('nl');
  });

  it('updates <html lang> and the page title to the chosen language', () => {
    setLanguage('fr');
    expect(getLanguage()).toBe('fr');
    expect(doc.documentElement.lang).toBe('fr');
    expect(doc.title).toBe(fr['app.title']);
    setLanguage('nl');
    expect(doc.documentElement.lang).toBe('nl');
    expect(doc.title).toBe(nl['app.title']);
  });

  it('tells subscribers at once, and stops after unsubscribing', () => {
    const seen: string[] = [];
    const off = subscribe(() => seen.push(getLanguage()));
    setLanguage('fr');
    setLanguage('nl');
    expect(seen).toEqual(['fr', 'nl']);
    off();
    setLanguage('fr');
    expect(seen).toEqual(['fr', 'nl']);
  });

  it('still switches when the storage cannot be used (private mode), without throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => setLanguage('fr')).not.toThrow();
    expect(getLanguage()).toBe('fr');
    expect(() => loadLanguage()).not.toThrow();
  });
});

describe('initLanguage (crit. 3 and 4)', () => {
  it('sets the language from storage/browser, <html lang> and the title', () => {
    browser('fr-BE');
    initLanguage();
    expect(getLanguage()).toBe('fr');
    expect(doc.documentElement.lang).toBe('fr');
    expect(doc.title).toBe(fr['app.title']);
  });
});

describe('language state defaults', () => {
  it('is Dutch by default so unit tests in Node do not follow the language of Node itself', () => {
    // afterEach of the previous tests reset to nl; nothing here called initLanguage.
    expect(getLanguage()).toBe('nl');
    expect(t('auth.title')).toBe(nl['auth.title']);
  });
});

describe('locale (R-026 crit. 6)', () => {
  it('is nl-BE for Dutch and fr-BE for French', () => {
    expect(locale()).toBe('nl-BE');
    setLanguage('fr');
    expect(locale()).toBe('fr-BE');
  });
});

describe('t and format follow the current language (crit. 4)', () => {
  it('t() returns the text of the chosen language straight after switching', () => {
    expect(t('auth.title')).toBe(nl['auth.title']);
    setLanguage('fr');
    expect(t('auth.title')).toBe(fr['auth.title']);
    expect(t('nav.recipes')).toBe(fr['nav.recipes']);
    setLanguage('nl');
    expect(t('auth.title')).toBe(nl['auth.title']);
  });

  it('format() fills {name} placeholders, in both languages', () => {
    expect(format('time.hours', { h: 3 })).toBe('3 u');
    expect(format('form.step', { n: 2 })).toBe(nl['form.step'].replace('{n}', '2'));
    setLanguage('fr');
    expect(format('time.hours', { h: 3 })).toBe('3 h');
    expect(format('photos.alt', { n: 1, title: 'Soep' })).toBe(fr['photos.alt'].replace('{n}', '1').replace('{title}', 'Soep'));
  });

  it('format() fills a placeholder that occurs twice and leaves no braces behind', () => {
    const out = format('meta.byAuthorOn', { name: 'Jan', date: '1 november 2026' });
    expect(out).toBe('Jan · 1 november 2026');
    expect(out).not.toMatch(/[{}]/);
  });
});
