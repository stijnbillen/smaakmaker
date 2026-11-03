import { describe, expect, it } from 'vitest';
import { TIME_FILTER_CHOICES, parseTimeFilter } from '../../src/lib/timeFilter';

// T-006 / R-007 crit. 4: only the choices 15, 30, 60 and 120 are filters; URL params are `prep` and `totaal`.
const parse = (query: string) => parseTimeFilter(new URLSearchParams(query));

describe('TIME_FILTER_CHOICES (R-007 crit. 4)', () => {
  it('offers 15, 30, 60 and 120 minutes', () => {
    expect([...TIME_FILTER_CHOICES]).toEqual([15, 30, 60, 120]);
  });
});

describe('parseTimeFilter (R-007 crit. 4)', () => {
  it('reads both maxima from the URL', () => {
    expect(parse('prep=30&totaal=60')).toEqual({ maxPrep: 30, maxTotal: 60 });
  });

  it.each([15, 30, 60, 120])('accepts %s for each parameter', (n) => {
    expect(parse(`prep=${n}`)).toEqual({ maxPrep: n, maxTotal: null });
    expect(parse(`totaal=${n}`)).toEqual({ maxPrep: null, maxTotal: n });
  });

  it('no parameters means no filter', () => {
    expect(parse('')).toEqual({ maxPrep: null, maxTotal: null });
  });

  it.each(['31', 'abc', '', '0', '-15', '15.5', '1e2', '240'])('"%s" is no filter', (value) => {
    expect(parse(`prep=${value}&totaal=${value}`)).toEqual({ maxPrep: null, maxTotal: null });
  });

  it('an invalid value on one parameter leaves the other intact', () => {
    expect(parse('prep=31&totaal=60')).toEqual({ maxPrep: null, maxTotal: 60 });
  });
});
