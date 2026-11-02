import { describe, expect, it } from 'vitest';
import { applyTagFilter, hasTagFilter, parseTagFilter, toSearchParams } from '../../src/lib/tagFilter';

// T-010 / R-010 crit. 4: within one group any chosen tag matches ("or", one `overlaps`), no choice = no filter.
// URL parameter is Dutch (`soort`), repeatable.
const parse = (query: string) => parseTagFilter(new URLSearchParams(query));

describe('parseTagFilter (R-010 crit. 4)', () => {
  it('reads repeated parameters in order', () => {
    expect(parse('soort=soep&soort=tapas')).toEqual({ dish: ['soep', 'tapas'] });
  });

  it('leaves empty values out and removes duplicates', () => {
    expect(parse('soort=&soort=soep&soort=soep')).toEqual({ dish: ['soep'] });
  });

  it('no parameters means no choice', () => {
    expect(parse('')).toEqual({ dish: [] });
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
    const out = toSearchParams({ dish: ['soep', 'tapas'] }, base);
    expect(out.getAll('soort')).toEqual(['soep', 'tapas']);
    expect(out.get('prep')).toBe('30');
    expect(out.get('totaal')).toBe('60');
  });

  it('removes the parameter on an empty choice', () => {
    const out = toSearchParams({ dish: [] }, new URLSearchParams('soort=soep&prep=15'));
    expect(out.has('soort')).toBe(false);
    expect(out.get('prep')).toBe('15');
  });

  it('round-trips', () => {
    const filter = { dish: ['soep', 'Stoofpot & co'] };
    expect(parseTagFilter(toSearchParams(filter))).toEqual(filter);
  });
});

describe('applyTagFilter (R-010 crit. 4: "or" inside a group, "and" with other filters)', () => {
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

  it('quotes names with commas, quotes, braces and backslashes (crit. 4)', () => {
    const q = fakeQuery();
    const names = ['zoet, zuur', 'a"b{', 'x}y', 'back\\slash'];
    applyTagFilter(q as never, { dish: names });
    expect(q.calls).toEqual([['dish_tags', names]]);
  });

  it('does nothing without a choice', () => {
    const q = fakeQuery();
    expect(applyTagFilter(q, { dish: [] })).toBe(q);
    expect(q.calls).toEqual([]);
  });

  it('adds exactly one overlaps on dish_tags for the chosen names', () => {
    const q = fakeQuery();
    applyTagFilter(q, { dish: ['soep', 'tapas'] });
    expect(q.calls).toEqual([['dish_tags', ['soep', 'tapas']]]);
  });
});
