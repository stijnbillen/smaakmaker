import { describe, expect, it } from 'vitest';
import { applyTagFilter, hasTagFilter, parseTagFilter, toSearchParams } from '../../src/lib/tagFilter';

// T-010 / R-010 crit. 4: within one group any chosen tag matches ("or", one `overlaps`), no choice = no filter.
// URL parameters are Dutch (`soort`, `kenmerk`), repeatable. T-011 adds the second group `trait`.
const parse = (query: string) => parseTagFilter(new URLSearchParams(query));

describe('parseTagFilter (R-010 crit. 4)', () => {
  it('reads repeated parameters in order', () => {
    expect(parse('soort=soep&soort=tapas')).toEqual({ dish: ['soep', 'tapas'], trait: [] });
  });

  it('leaves empty values out and removes duplicates', () => {
    expect(parse('soort=&soort=soep&soort=soep')).toEqual({ dish: ['soep'], trait: [] });
  });

  it('no parameters means no choice', () => {
    expect(parse('')).toEqual({ dish: [], trait: [] });
  });
});

describe('hasTagFilter', () => {
  it('is false without a choice and true with one', () => {
    expect(hasTagFilter(parse(''))).toBe(false);
    expect(hasTagFilter(parse('soort=soep'))).toBe(true);
  });
});

describe('toSearchParams (R-010 crit. 4: URL keeps the choice)', () => {
  it('writes the choice back and keeps prep and totaal', () => {
    const base = new URLSearchParams('prep=30&totaal=60&soort=oud');
    const out = toSearchParams({ dish: ['soep', 'tapas'], trait: [] }, base);
    expect(out.getAll('soort')).toEqual(['soep', 'tapas']);
    expect(out.get('prep')).toBe('30');
    expect(out.get('totaal')).toBe('60');
  });

  it('removes the parameter on an empty choice', () => {
    const out = toSearchParams({ dish: [], trait: [] }, new URLSearchParams('soort=soep&prep=15'));
    expect(out.has('soort')).toBe(false);
    expect(out.get('prep')).toBe('15');
  });

  it('round-trips', () => {
    const filter = { dish: ['soep', 'Stoofpot & co'], trait: ['snel'] };
    expect(parseTagFilter(toSearchParams(filter))).toEqual(filter);
  });
});

// postgrest-js joins a string[] unquoted (`ov.{a,b}`), so a name with a comma or quote breaks. The filter
// must therefore pass a quoted Postgres array literal as a string; this parses it back to the elements.
function parseLiteral(literal: unknown): string[] {
  expect(typeof literal).toBe('string');
  const s = literal as string;
  expect(s.startsWith('{') && s.endsWith('}')).toBe(true);
  const out: string[] = [];
  let i = 1;
  while (i < s.length - 1) {
    expect(s[i]).toBe('"');
    i++;
    let el = '';
    while (s[i] !== '"') {
      if (s[i] === '\\') i++;
      el += s[i++];
    }
    i++;
    out.push(el);
    if (s[i] === ',') i++;
  }
  return out;
}

function fakeQuery() {
  const calls: Array<[string, string[]]> = [];
  const q = {
    calls,
    overlaps(column: string, values: unknown) {
      calls.push([column, parseLiteral(values)]);
      return q;
    },
  };
  return q;
}

describe('applyTagFilter (R-010 crit. 4: "or" inside a group, "and" with other filters)', () => {
  it('quotes names with commas, quotes, braces and backslashes (crit. 4)', () => {
    const q = fakeQuery();
    const names = ['zoet, zuur', 'a"b{', 'x}y', 'back\\slash'];
    applyTagFilter(q as never, { dish: names, trait: [] });
    expect(q.calls).toEqual([['dish_tags', names]]);
  });

  it('does nothing without a choice', () => {
    const q = fakeQuery();
    expect(applyTagFilter(q, { dish: [], trait: [] })).toBe(q);
    expect(q.calls).toEqual([]);
  });

  it('adds exactly one overlaps on dish_tags for the chosen names', () => {
    const q = fakeQuery();
    applyTagFilter(q, { dish: ['soep', 'tapas'], trait: [] });
    expect(q.calls).toEqual([['dish_tags', ['soep', 'tapas']]]);
  });
});

// T-011 / R-011 crit. 2 and 3: second group "trait" (URL `kenmerk`, column `trait_tags`), groups combine with "and".
describe('trait group (T-011 / R-011)', () => {
  it('parseTagFilter reads both groups from one URL (crit. 2)', () => {
    expect(parse('soort=soep&kenmerk=vegetarisch&kenmerk=snel')).toEqual({ dish: ['soep'], trait: ['vegetarisch', 'snel'] });
  });

  it('toSearchParams writes both groups and keeps prep, totaal and other parameters (crit. 2)', () => {
    // `pan=1` stands for the equipment parameter: whatever else is in the URL must survive.
    const base = new URLSearchParams('prep=30&totaal=60&pan=1&kenmerk=oud');
    const out = toSearchParams({ dish: ['soep'], trait: ['vegetarisch', 'snel'] }, base);
    expect(out.getAll('soort')).toEqual(['soep']);
    expect(out.getAll('kenmerk')).toEqual(['vegetarisch', 'snel']);
    expect(out.get('prep')).toBe('30');
    expect(out.get('totaal')).toBe('60');
    expect(out.get('pan')).toBe('1');
  });

  it('applyTagFilter gives two overlaps on the same builder when both groups have a choice ("and")', () => {
    const q = fakeQuery();
    const result = applyTagFilter(q, { dish: ['soep'], trait: ['vegetarisch', 'snel'] });
    expect(result).toBe(q);
    expect(q.calls).toEqual([
      ['dish_tags', ['soep']],
      ['trait_tags', ['vegetarisch', 'snel']],
    ]);
  });

  it('applyTagFilter gives one overlaps for one group and none without a choice', () => {
    const only = fakeQuery();
    applyTagFilter(only, { dish: [], trait: ['snel'] });
    expect(only.calls).toEqual([['trait_tags', ['snel']]]);
    const none = fakeQuery();
    applyTagFilter(none, { dish: [], trait: [] });
    expect(none.calls).toEqual([]);
  });

  it('hasTagFilter is true when only trait has a choice', () => {
    expect(hasTagFilter(parse('kenmerk=snel'))).toBe(true);
    expect(hasTagFilter({ dish: [], trait: [] })).toBe(false);
  });

  // crit. 3: "vegetarisch" is only a tag; the ingredients are never inspected.
  it('the vegetarian filter touches trait_tags only, no ingredient column', () => {
    const q = fakeQuery();
    applyTagFilter(q, parse('kenmerk=vegetarisch'));
    expect(q.calls.map(([column]) => column)).toEqual(['trait_tags']);
  });
});
