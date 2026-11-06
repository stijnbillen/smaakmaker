import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import enJson from '../../src/i18n/en.json';
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

// T-018 / R-023 crit. 2, 3 and 4. The module state is shared between test files (vitest isolate:false),
// so every test ends with the language back on Dutch.

const nl = nlJson as Record<string, string>;
const en = enJson as Record<string, string>;
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

let doc: { documentElement: { lang: string }; title: string };

beforeEach(() => {
  doc = { documentElement: { lang: '' }, title: '' };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('localStorage', fakeStorage());
  vi.stubGlobal('navigator', { languages: ['nl-BE'], language: 'nl-BE' });
});

afterEach(() => {
  setLanguage('nl');
  vi.unstubAllGlobals();
});

describe('detectLanguage (crit. 3: browser language starting with "nl" -> Dutch, else English)', () => {
  it.each([
    [['nl-BE'], 'nl'],
    [['nl'], 'nl'],
    [['NL-nl'], 'nl'],
    [['en-US'], 'en'],
    [['fr-BE', 'nl-BE'], 'en'], // only the first language counts
    [[], 'en'],
  ])('%j -> %s', (languages, expected) => {
    expect(detectLanguage(languages as string[])).toBe(expected);
  });
});

describe('loadLanguage (crit. 2 and 3)', () => {
  it('uses the saved choice, which wins over the browser language', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [KEY]: 'en' }));
    vi.stubGlobal('navigator', { languages: ['nl-BE'], language: 'nl-BE' });
    expect(loadLanguage()).toBe('en');
    vi.stubGlobal('localStorage', fakeStorage({ [KEY]: 'nl' }));
    vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' });
    expect(loadLanguage()).toBe('nl');
  });

  it('follows the browser language without a saved choice', () => {
    vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' });
    expect(loadLanguage()).toBe('en');
    vi.stubGlobal('navigator', { languages: ['nl-BE'], language: 'nl-BE' });
    expect(loadLanguage()).toBe('nl');
  });

  it('falls back to navigator.language when navigator.languages is missing', () => {
    vi.stubGlobal('navigator', { language: 'nl-NL' });
    expect(loadLanguage()).toBe('nl');
    vi.stubGlobal('navigator', { language: 'de-DE' });
    expect(loadLanguage()).toBe('en');
  });

  it.each(['fr', 'NL', '', 'null', ' en'])('ignores an invalid saved value %j as "no choice"', (bad) => {
    vi.stubGlobal('localStorage', fakeStorage({ [KEY]: bad }));
    vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' });
    expect(loadLanguage()).toBe('en');
    vi.stubGlobal('navigator', { languages: ['nl-BE'], language: 'nl-BE' });
    expect(loadLanguage()).toBe('nl');
  });
});

describe('setLanguage (crit. 2 and 4)', () => {
  it('saves nl or en under smaakmaker.lang', () => {
    const store = fakeStorage();
    vi.stubGlobal('localStorage', store);
    setLanguage('en');
    expect(store.data.get(KEY)).toBe('en');
    setLanguage('nl');
    expect(store.data.get(KEY)).toBe('nl');
  });

  it('updates <html lang> and the page title to the chosen language', () => {
    setLanguage('en');
    expect(getLanguage()).toBe('en');
    expect(doc.documentElement.lang).toBe('en');
    expect(doc.title).toBe(en['app.title']);
    setLanguage('nl');
    expect(doc.documentElement.lang).toBe('nl');
    expect(doc.title).toBe(nl['app.title']);
  });

  it('tells subscribers at once, and stops after unsubscribing', () => {
    const seen: string[] = [];
    const off = subscribe(() => seen.push(getLanguage()));
    setLanguage('en');
    setLanguage('nl');
    expect(seen).toEqual(['en', 'nl']);
    off();
    setLanguage('en');
    expect(seen).toEqual(['en', 'nl']);
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
    expect(() => setLanguage('en')).not.toThrow();
    expect(getLanguage()).toBe('en');
    expect(() => loadLanguage()).not.toThrow();
  });
});

describe('initLanguage (crit. 3 and 4)', () => {
  it('sets the language from storage/browser, <html lang> and the title', () => {
    vi.stubGlobal('navigator', { languages: ['en-GB'], language: 'en-GB' });
    initLanguage();
    expect(getLanguage()).toBe('en');
    expect(doc.documentElement.lang).toBe('en');
    expect(doc.title).toBe(en['app.title']);
  });
});

describe('language state defaults', () => {
  it('is Dutch by default so unit tests in Node do not follow the language of Node itself', () => {
    // afterEach of the previous tests reset to nl; nothing here called initLanguage.
    expect(getLanguage()).toBe('nl');
    expect(t('auth.title')).toBe(nl['auth.title']);
  });
});

describe('locale (crit. 6)', () => {
  it('is nl-BE for Dutch and en-GB for English', () => {
    expect(locale()).toBe('nl-BE');
    setLanguage('en');
    expect(locale()).toBe('en-GB');
  });
});

describe('t and format follow the current language (crit. 4)', () => {
  it('t() returns the text of the chosen language straight after switching', () => {
    expect(t('auth.title')).toBe(nl['auth.title']);
    setLanguage('en');
    expect(t('auth.title')).toBe(en['auth.title']);
    expect(t('nav.recipes')).toBe(en['nav.recipes']);
    setLanguage('nl');
    expect(t('auth.title')).toBe(nl['auth.title']);
  });

  it('format() fills {name} placeholders, in both languages', () => {
    expect(format('time.hours', { h: 3 })).toBe('3 u');
    expect(format('form.step', { n: 2 })).toBe(nl['form.step'].replace('{n}', '2'));
    setLanguage('en');
    expect(format('time.hours', { h: 3 })).toBe('3 h');
    expect(format('photos.alt', { n: 1, title: 'Soep' })).toBe(en['photos.alt'].replace('{n}', '1').replace('{title}', 'Soep'));
  });

  it('format() fills a placeholder that occurs twice and leaves no braces behind', () => {
    const out = format('meta.byAuthorOn', { name: 'Jan', date: '1 november 2026' });
    expect(out).toBe('Jan · 1 november 2026');
    expect(out).not.toMatch(/[{}]/);
  });
});
