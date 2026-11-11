import { describe, expect, it, vi } from 'vitest';
import {
  SLIDER_MAX,
  SLIDER_STEP,
  TIME_MAX_MINUTES,
  applyTimeFilter,
  clampToSlider,
  parseTimeFilter,
  parseTypedMinutes,
  toSearchParams,
} from '../../src/lib/timeFilter';

// T-030 / R-029: slider 0-240 step 5, typed minutes 0-4320; URL params stay `prep` and `totaal`.
const parse = (query: string) => parseTimeFilter(new URLSearchParams(query));

describe('constants (R-029 crit. 2)', () => {
  it('the slider runs 0-240 in steps of 5, typing goes up to 4320', () => {
    expect(SLIDER_MAX).toBe(240);
    expect(SLIDER_STEP).toBe(5);
    expect(TIME_MAX_MINUTES).toBe(4320);
  });
});

describe('parseTimeFilter (crit. 7)', () => {
  it('reads both maxima from the URL', () => {
    expect(parse('prep=30&totaal=60')).toEqual({ maxPrep: 30, maxTotal: 60 });
  });

  // Existing links with the old choices keep working.
  it.each([15, 30, 60, 120])('accepts the old choice %s for each parameter', (n) => {
    expect(parse(`prep=${n}`)).toEqual({ maxPrep: n, maxTotal: null });
    expect(parse(`totaal=${n}`)).toEqual({ maxPrep: null, maxTotal: n });
  });

  it.each([0, 7, 240, 4320])('accepts %s (any whole number 0-4320)', (n) => {
    expect(parse(`prep=${n}&totaal=${n}`)).toEqual({ maxPrep: n, maxTotal: n });
  });

  it('no parameters means no filter', () => {
    expect(parse('')).toEqual({ maxPrep: null, maxTotal: null });
  });

  it.each(['4321', '-5', '15.5', '1e2', 'abc', '', '030', ' 30', '+30'])('"%s" is no filter', (value) => {
    expect(parse(`prep=${encodeURIComponent(value)}&totaal=${encodeURIComponent(value)}`)).toEqual({
      maxPrep: null,
      maxTotal: null,
    });
  });

  it('an invalid value on one parameter leaves the other intact', () => {
    expect(parse('prep=4321&totaal=60')).toEqual({ maxPrep: null, maxTotal: 60 });
  });
});

describe('toSearchParams round trip (crit. 7)', () => {
  it.each([0, 7, 240, 4320])('%s goes there and back without loss', (n) => {
    const params = toSearchParams({ maxPrep: n, maxTotal: n });
    expect(parseTimeFilter(params)).toEqual({ maxPrep: n, maxTotal: n });
  });

  it('keeps other parameters and drops a limit that is off', () => {
    const out = toSearchParams({ maxPrep: 0, maxTotal: null }, new URLSearchParams('soort=soep&prep=15&totaal=60&utm=x'));
    expect(out.get('prep')).toBe('0');
    expect(out.has('totaal')).toBe(false);
    expect(out.get('soort')).toBe('soep');
    expect(out.get('utm')).toBe('x');
  });
});

describe('parseTypedMinutes (crit. 5)', () => {
  it('an empty field means the limit is off', () => {
    expect(parseTypedMinutes('')).toEqual({ kind: 'empty' });
  });

  it.each([
    ['0', 0],
    ['45', 45],
    ['4320', 4320],
  ])('"%s" is a value', (text, minutes) => {
    expect(parseTypedMinutes(text)).toEqual({ kind: 'value', minutes });
  });

  it.each(['abc', '-5', '1.5', '1,5', '4321', ' 30', '1e2'])('"%s" is invalid', (text) => {
    expect(parseTypedMinutes(text)).toEqual({ kind: 'invalid' });
  });
});

describe('clampToSlider (crit. 2)', () => {
  it.each([
    [0, 0],
    [240, 240],
    [241, 240],
    [4320, 240],
  ])('%s gives %s', (input, expected) => {
    expect(clampToSlider(input)).toBe(expected);
  });
});

describe('applyTimeFilter (crit. 4)', () => {
  const builder = () => {
    const calls: Array<[string, number]> = [];
    const q = {
      lte: vi.fn((column: string, value: number) => {
        calls.push([column, value]);
        return q;
      }),
    };
    return { q, calls };
  };

  // 0 is a valid limit, not "off".
  it('calls lte(prep_minutes, 0) for maxPrep 0', () => {
    const { q, calls } = builder();
    applyTimeFilter(q, { maxPrep: 0, maxTotal: null });
    expect(calls).toEqual([['prep_minutes', 0]]);
  });

  it('applies both limits, and nothing when both are off', () => {
    const both = builder();
    applyTimeFilter(both.q, { maxPrep: 45, maxTotal: 0 });
    expect(both.calls).toEqual([
      ['prep_minutes', 45],
      ['total_minutes', 0],
    ]);
    const none = builder();
    applyTimeFilter(none.q, { maxPrep: null, maxTotal: null });
    expect(none.calls).toEqual([]);
  });
});
