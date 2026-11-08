import { describe, expect, it } from 'vitest';
import fr from '../../src/i18n/fr.json';
import nl from '../../src/i18n/nl.json';
import { activeFilterCount, clearFilters } from '../../src/lib/overviewFilters';

// T-029 / R-028: the counter on the "Filters" button and "Alles wissen".
const count = (query: string) => activeFilterCount(new URLSearchParams(query));

describe('activeFilterCount (crit. 3)', () => {
  it('is 0 without parameters', () => expect(count('')).toBe(0));

  it('counts the ingredient search as one filter, however many terms and options', () => {
    expect(count('met=a&met=b&zonder=c&min=1')).toBe(1);
  });
  it('counts "zonder" alone as one filter', () => expect(count('zonder=c')).toBe(1));
  it('counts every time limit as one filter', () => expect(count('prep=15&totaal=60')).toBe(2));
  it('counts a tag group once, however many tags', () => expect(count('soort=soep&soort=dessert')).toBe(1));
  it('counts the dish group and the trait group separately', () => expect(count('soort=soep&kenmerk=winter')).toBe(2));
  it('counts the equipment once, however many items', () => expect(count('gerief=oven&gerief=wok')).toBe(1));
  it('counts everything together as six', () => {
    expect(count('met=a&zonder=c&prep=15&totaal=60&soort=soep&kenmerk=winter&gerief=oven')).toBe(6);
  });
  it('ignores an invalid value, as the existing parsers do', () => expect(count('prep=7')).toBe(0));
  it('does not count the sort', () => expect(count('sorteer=titel&richting=af')).toBe(0));
});

describe('clearFilters (crit. 4)', () => {
  it('removes search, filters and equipment, and keeps the sort and unknown parameters', () => {
    const before = new URLSearchParams(
      'met=a&zonder=c&min=1&prep=15&totaal=60&soort=soep&kenmerk=winter&gerief=oven&sorteer=titel&richting=af&utm=x',
    );
    const after = clearFilters(before);
    for (const key of ['met', 'zonder', 'min', 'prep', 'totaal', 'soort', 'kenmerk', 'gerief']) {
      expect(after.has(key)).toBe(false);
    }
    expect(after.get('sorteer')).toBe('titel');
    expect(after.get('richting')).toBe('af');
    expect(after.get('utm')).toBe('x');
  });

  it('leaves a count of 0', () => {
    expect(activeFilterCount(clearFilters(new URLSearchParams('met=a&prep=15&gerief=oven')))).toBe(0);
  });
});

describe('texts (crit. 16)', () => {
  const keys = [
    'overview.filters',
    'overview.filtersCount',
    'overview.clearAll',
    'overview.sortCreated',
    'overview.sortTitle',
    'overview.sortTotal',
    'overview.sortPrep',
    'overview.sortAsc',
    'overview.sortDesc',
    'overview.sortRating',
  ];
  const nlMap = nl as Record<string, string>;
  const frMap = fr as Record<string, string>;

  it('every new key exists in nl.json and fr.json, not empty', () => {
    for (const key of keys) {
      expect(nlMap[key], `nl ${key}`).toBeTruthy();
      expect(frMap[key], `fr ${key}`).toBeTruthy();
    }
  });

  it('"overview.filtersCount" has {n} in both languages', () => {
    expect(nlMap['overview.filtersCount']).toContain('{n}');
    expect(frMap['overview.filtersCount']).toContain('{n}');
  });

  it('has the agreed Dutch and French texts', () => {
    expect(nlMap['overview.filters']).toBe('Filters');
    expect(frMap['overview.filters']).toBe('Filtres');
    expect(nlMap['overview.filtersCount']).toBe('Filters ({n})');
    expect(frMap['overview.filtersCount']).toBe('Filtres ({n})');
    expect(nlMap['overview.clearAll']).toBe('Alles wissen');
    expect(frMap['overview.clearAll']).toBe('Tout effacer');
    expect(nlMap['overview.sortRating']).toBe('Aantal sterren');
    expect(frMap['overview.sortRating']).toBe("Nombre d'étoiles");
  });

  it('"overview.sortNewest" is gone', () => {
    expect('overview.sortNewest' in nlMap).toBe(false);
    expect('overview.sortNewest' in frMap).toBe(false);
  });
});
