import { describe, expect, it } from 'vitest';
import { displayName, itemKey } from '../../src/lib/catalog';

// T-019 / R-018 crit. 1: the key is lower case, without accents, with superfluous spaces removed.
describe('itemKey (R-018 key)', () => {
  it.each([
    ['Crème  Fraîche', 'creme fraiche'],
    ['  Broccoli ', 'broccoli'],
    ['BROCCOLI', 'broccoli'],
    ['Pomme   de\tterre', 'pomme de terre'],
    ['', ''],
    ['   ', ''],
  ])('%j -> %j', (input, expected) => {
    expect(itemKey(input)).toBe(expected);
  });

  it('is idempotent', () => {
    const once = itemKey('  Crème  Fraîche ');
    expect(itemKey(once)).toBe(once);
  });

  it('gives one key for spellings that differ only in case, accents and spacing (crit. 2 premise)', () => {
    expect(itemKey('Crème Brûlée')).toBe(itemKey('creme  brulee'));
  });
});

// T-021 / R-020 crit. 9: the shown name follows the interface language, with the other name as fallback.
describe('displayName (R-020 crit. 9)', () => {
  const both = { id: '1', nameNl: 'aardappel', nameEn: 'potato' };

  it('gives the name of the interface language', () => {
    expect(displayName(both, 'nl')).toBe('aardappel');
    expect(displayName(both, 'en')).toBe('potato');
  });

  it('falls back to the other name when the language has none', () => {
    expect(displayName({ ...both, nameEn: null }, 'en')).toBe('aardappel');
    expect(displayName({ ...both, nameNl: null }, 'nl')).toBe('potato');
  });
});
