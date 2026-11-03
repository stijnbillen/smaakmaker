import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nlJson from '../../src/i18n/nl.json';
import {
  MAX_TERMS,
  SEARCH_DEBOUNCE_MS,
  clampMin,
  createDebouncer,
  hasSearch,
  parseSearch,
  parseTerms,
  toSearchParams,
} from '../../src/lib/ingredientSearch';

// T-015 / R-009: pure logic of the ingredient search. The module must load without Supabase env variables.
const nl = nlJson as Record<string, string>;

/** parseTerms may return the list itself (with a `tooMany` flag) or `{ terms, tooMany }`; both satisfy the brief. */
function terms(text: string): { terms: string[]; tooMany: boolean } {
  const r = parseTerms(text) as unknown;
  if (Array.isArray(r)) return { terms: [...(r as string[])], tooMany: Boolean((r as { tooMany?: boolean }).tooMany) };
  const o = r as { terms: string[]; tooMany?: boolean };
  return { terms: o.terms, tooMany: Boolean(o.tooMany) };
}

const letters = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${String.fromCharCode(97 + i)}`);

describe('constants', () => {
  it('crit. 2: at most 10 terms', () => expect(MAX_TERMS).toBe(10));
  it('crit. 7: the pause is 300 ms, so at most 400 ms', () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(300);
    expect(SEARCH_DEBOUNCE_MS).toBeLessThanOrEqual(400);
  });
});

describe('parseTerms (crit. 2 and 9)', () => {
  it('crit. 2: splits on commas, trims and drops empty terms', () => {
    expect(terms('feta, tomaat ,, ').terms).toEqual(['feta', 'tomaat']);
  });

  it('crit. 2: terms equal without case and accents count once', () => {
    expect(terms('Feta, feta').terms).toHaveLength(1);
    expect(terms('Crème, creme, CRÈME').terms).toHaveLength(1);
  });

  it('crit. 2: 11 terms give the first 10 and tooMany; 10 terms do not', () => {
    const eleven = letters(11, 'term');
    const r = terms(eleven.join(','));
    expect(r.terms).toEqual(eleven.slice(0, 10));
    expect(r.tooMany).toBe(true);
    const ten = terms(eleven.slice(0, 10).join(','));
    expect(ten.terms).toHaveLength(10);
    expect(ten.tooMany).toBe(false);
  });

  it('crit. 9: only commas and spaces give no terms; a term of 1 character is accepted', () => {
    expect(terms('  ,   , a').terms).toEqual(['a']);
    expect(terms('   ').terms).toEqual([]);
    expect(terms('').terms).toEqual([]);
  });
});

describe('clampMin (crit. 2)', () => {
  it('without a choice k = n', () => {
    expect(clampMin(null, 4)).toBe(4);
  });
  it('k above n becomes n; k below 1 becomes 1; a valid k stays', () => {
    expect(clampMin(9, 4)).toBe(4);
    expect(clampMin(0, 4)).toBe(1);
    expect(clampMin(-3, 4)).toBe(1);
    expect(clampMin(3, 4)).toBe(3);
    expect(clampMin(1, 4)).toBe(1);
    expect(clampMin(4, 4)).toBe(4);
  });
});

describe('parseSearch (crit. 2 and "URL from outside")', () => {
  const parse = (q: string) => parseSearch(new URLSearchParams(q));

  it('crit. 2: de-duplicates URL terms with the same key as parseTerms; min is clamped to 1', () => {
    const s = parse('met=Feta&met=feta&min=2');
    expect(s.with).toHaveLength(1);
    expect(s.min).toBe(1);
  });

  it('reads met and zonder (repeatable), trims and drops empty values', () => {
    const s = parse('met=feta&met=%20tomaat%20&met=&zonder=ui&zonder=%20');
    expect(s.with).toEqual(['feta', 'tomaat']);
    expect(s.without).toEqual(['ui']);
  });

  it('crit. 2: cuts at 10 terms per list', () => {
    const q = [...letters(12, 't').map((x) => `met=${x}`), ...letters(12, 'z').map((x) => `zonder=${x}`)].join('&');
    const s = parse(q);
    expect(s.with).toHaveLength(10);
    expect(s.without).toHaveLength(10);
  });

  it('crit. 2: min is clamped to 1..n; a missing or broken min means "all" (k = n)', () => {
    expect(parse('met=a&met=b&met=c&min=2').min).toBe(2);
    expect(parse('met=a&met=b&met=c&min=9').min).toBe(3);
    expect(parse('met=a&met=b&met=c&min=0').min).toBe(1);
    expect(parse('met=a&met=b&met=c').min ?? 3).toBe(3);
    expect(parse('met=a&met=b&met=c&min=abc').min ?? 3).toBe(3);
  });
});

describe('toSearchParams (crit. 6, 8)', () => {
  const base = (q: string) => new URLSearchParams(q);

  it('writes met and zonder as repeated parameters and keeps other parameters, also sorteer', () => {
    const out = toSearchParams({ with: ['feta', 'tomaat', 'ui'], without: ['olijf'], min: 2 }, base('sorteer=beoordeling&prep=15&soort=soep'));
    expect(out.getAll('met')).toEqual(['feta', 'tomaat', 'ui']);
    expect(out.getAll('zonder')).toEqual(['olijf']);
    expect(out.get('min')).toBe('2');
    expect(out.get('sorteer')).toBe('beoordeling');
    expect(out.get('prep')).toBe('15');
    expect(out.get('soort')).toBe('soep');
  });

  it('"all" (k = n or no choice) is a missing min', () => {
    expect(toSearchParams({ with: ['a', 'b'], without: [], min: 2 }, base('')).has('min')).toBe(false);
    expect(toSearchParams({ with: ['a', 'b'], without: [], min: null }, base('')).has('min')).toBe(false);
  });

  it('crit. 6: an empty search removes met, zonder and min and keeps the rest', () => {
    const out = toSearchParams({ with: [], without: [], min: null }, base('met=feta&zonder=ui&min=1&prep=15'));
    expect(out.has('met')).toBe(false);
    expect(out.has('zonder')).toBe(false);
    expect(out.has('min')).toBe(false);
    expect(out.get('prep')).toBe('15');
  });

  it('replaces earlier met values instead of adding to them', () => {
    const out = toSearchParams({ with: ['tomaat'], without: [], min: null }, base('met=feta&met=ui'));
    expect(out.getAll('met')).toEqual(['tomaat']);
  });

  it('round trip: parseSearch(toSearchParams(x)) gives x', () => {
    const x = { with: ['feta', 'tomaat', 'olijf'], without: ['ui'], min: 2 };
    expect(parseSearch(toSearchParams(x, new URLSearchParams()))).toEqual(x);
  });
});

describe('hasSearch (crit. 6)', () => {
  it('is true with a with-term or a without-term, false when both are empty', () => {
    expect(hasSearch({ with: ['a'], without: [], min: null })).toBe(true);
    expect(hasSearch({ with: [], without: ['a'], min: null })).toBe(true);
    expect(hasSearch({ with: [], without: [], min: null })).toBe(false);
  });
});

describe('createDebouncer (crit. 7)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('three quick changes call fn once, with the last value, after the pause', () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, SEARCH_DEBOUNCE_MS);
    d('f');
    vi.advanceTimersByTime(100);
    d('fe');
    vi.advanceTimersByTime(100);
    d('feta');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('feta');
  });

  it('cancel stops a pending call', () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, SEARCH_DEBOUNCE_MS);
    d('feta');
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('works again after a call has fired', () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, 50);
    d('a');
    vi.advanceTimersByTime(50);
    d('b');
    vi.advanceTimersByTime(50);
    expect(fn.mock.calls).toEqual([['a'], ['b']]);
  });
});

describe('nl.json keys (R-001: all visible text in nl.json)', () => {
  const keys = ['search.with', 'search.withHint', 'search.without', 'search.min', 'search.minAll', 'search.submit', 'search.tooMany', 'search.matches'];
  for (const key of keys) {
    it(`${key} exists and is not empty`, () => {
      expect(typeof nl[key], key).toBe('string');
      expect(nl[key].trim().length, key).toBeGreaterThan(0);
    });
  }
  it('the "k van n" text and "alle n" keep their placeholders', () => {
    expect(nl['search.matches']).toContain('{count}');
    expect(nl['search.matches']).toContain('{total}');
    expect(nl['search.minAll']).toContain('{n}');
  });
  it('labels match the brief', () => {
    expect(nl['search.with']).toBe('Met ingrediënten');
    expect(nl['search.without']).toBe('Zonder');
    expect(nl['search.min']).toBe('Minstens');
    expect(nl['search.submit']).toBe('Zoeken');
  });
});
