import { describe, expect, it } from 'vitest';
import nl from '../../src/i18n/nl.json';
import fr from '../../src/i18n/fr.json';
import { googleSearchUrl, parseFactor } from '../../src/lib/unitMeasure';
import { validateCatalogItem } from '../../src/lib/catalogAdminLogic';

// T-032 / R-033. Seam required from the developer (src/lib/unitMeasure.ts, no Supabase import):
//   parseFactor(text: string): number | null        // null = invalid
//   googleSearchUrl(unit: string, base: 'ml' | 'g', lang: 'nl' | 'fr'): string
// and in src/lib/catalogAdminLogic.ts:
//   validateCatalogItem(kind, { nameNl, nameFr, synonyms, measure?, factor? }) → 'invalidFactor' for a bad factor.
// Text keys (nl.json and fr.json, same keys): form.measureQuestion, form.measureVolume, form.measureWeight,
// form.measureNone, form.measureUnknown, form.factorQuestionVolume, form.factorQuestionWeight, form.factorInvalid,
// form.factorBack, form.googleLink, form.googleQueryVolume, form.googleQueryWeight,
// catalogAdmin.measure, catalogAdmin.measureVolume, catalogAdmin.measureWeight, catalogAdmin.measureNone,
// catalogAdmin.factor, catalogAdmin.error.factor.

describe('parseFactor (R-033 crit. 5)', () => {
  it.each(['', '0', '-1', '1,2345', '100000,001', 'abc', '1e3', ' ', '1,', ',5', '0,0', '1.2.3'])('"%s" is invalid', (text) => {
    expect(parseFactor(text)).toBeNull();
  });

  it.each([
    ['250', 250],
    ['0,5', 0.5],
    ['12.5', 12.5],
    ['100000', 100000],
    ['0,001', 0.001],
  ])('"%s" is valid and gives %d', (text, value) => {
    expect(parseFactor(text)).toBe(value);
  });
});

describe('googleSearchUrl (R-033 crit. 7)', () => {
  it('builds the Dutch search for volume (also for the kind question) and for weight', () => {
    expect(googleSearchUrl('beker', 'ml', 'nl')).toBe('https://www.google.com/search?q=1%20beker%20in%20ml');
    expect(googleSearchUrl('beker', 'g', 'nl')).toBe('https://www.google.com/search?q=1%20beker%20in%20g');
  });

  it('uses the French search text in French', () => {
    expect(googleSearchUrl('tasse', 'ml', 'fr')).toBe('https://www.google.com/search?q=1%20tasse%20en%20ml');
    expect(googleSearchUrl('tasse', 'g', 'fr')).toBe('https://www.google.com/search?q=1%20tasse%20en%20g');
  });

  it('encodes special characters in the unit name', () => {
    const url = googleSearchUrl('a&b #c', 'ml', 'nl');
    expect(url).toBe('https://www.google.com/search?q=1%20a%26b%20%23c%20in%20ml');
    expect(new URL(url).searchParams.get('q')).toBe('1 a&b #c in ml');
  });
});

describe('validateCatalogItem with a factor (R-033 crit. 9)', () => {
  const base = { nameNl: 'kop', nameFr: null, synonyms: [] };
  it('refuses a factor outside the range', () => {
    for (const factor of [0, -1, 100000.001, 1.2345]) {
      expect(validateCatalogItem('unit', { ...base, measure: 'volume', factor } as never), String(factor)).toBe('invalidFactor');
    }
  });
  it('refuses volume or weight without factor', () => {
    expect(validateCatalogItem('unit', { ...base, measure: 'weight', factor: null } as never)).toBe('invalidFactor');
  });
  it('accepts a valid factor and kind none without factor', () => {
    expect(validateCatalogItem('unit', { ...base, measure: 'volume', factor: 250 } as never)).toBeNull();
    expect(validateCatalogItem('unit', { ...base, measure: 'none', factor: null } as never)).toBeNull();
  });
});

describe('texts in both languages (R-033 crit. 11)', () => {
  const keys = [
    'form.measureQuestion',
    'form.measureVolume',
    'form.measureWeight',
    'form.measureNone',
    'form.measureUnknown',
    'form.factorQuestionVolume',
    'form.factorQuestionWeight',
    'form.factorInvalid',
    'form.factorBack',
    'form.googleLink',
    'form.googleQueryVolume',
    'form.googleQueryWeight',
    'catalogAdmin.measure',
    'catalogAdmin.measureVolume',
    'catalogAdmin.measureWeight',
    'catalogAdmin.measureNone',
    'catalogAdmin.factor',
    'catalogAdmin.error.factor',
  ];
  it.each(keys)('%s exists in nl.json and fr.json', (key) => {
    expect((nl as Record<string, string>)[key], `nl ${key}`).toBeTruthy();
    expect((fr as Record<string, string>)[key], `fr ${key}`).toBeTruthy();
  });
});
