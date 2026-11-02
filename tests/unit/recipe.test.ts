import { describe, expect, it } from 'vitest';
import {
  formatQuantity,
  isDirty,
  moveItem,
  parseQuantity,
  removeItem,
  toRow,
  validateRecipe,
} from '../../src/lib/recipe';

// T-005 / R-003. The brief fixes the function names and the boundaries, not the exact result shapes.
// The helpers below therefore read the results in a shape-tolerant way:
// - validateRecipe: "has an error" = a truthy leaf in `result.errors ?? result` (booleans ok/valid are ignored);
// - parseQuantity: a number, null/undefined (no quantity) or an object with value/quantity and error/ok/valid.

const chars = (n: number, c = 'a') => c.repeat(n);

interface Draft {
  title: string;
  ingredients: Array<{ name: string; quantity: string; unit: string }>;
  steps: string[];
}

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    title: 'Soep',
    ingredients: [{ name: 'Water', quantity: '', unit: '' }],
    steps: ['Kook het water.'],
    ...overrides,
  };
}

const ing = (name: string, quantity = '', unit = '') => ({ name, quantity, unit });

function leaves(value: unknown, path = ''): Array<[string, unknown]> {
  if (value === null || value === undefined || value === false || value === '') return [];
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      leaves(v, path ? `${path}.${k}` : k),
    );
  }
  return [[path, value]];
}

function errorLeaves(draftValue: Draft): Array<[string, unknown]> {
  const res = validateRecipe(draftValue as never) as unknown as Record<string, unknown>;
  const errors = (res && typeof res === 'object' && 'errors' in res ? res.errors : res) as Record<string, unknown>;
  const { ok: _ok, valid: _valid, ...rest } = (errors ?? {}) as Record<string, unknown>;
  return leaves(rest);
}

const isInvalid = (d: Draft) => errorLeaves(d).length > 0;
const hasErrorOn = (d: Draft, field: string) => errorLeaves(d).some(([p]) => p === field || p.startsWith(`${field}.`) || p.startsWith(`${field}[`));

function parsed(input: string): { ok: boolean; value: number | null } {
  let res: unknown;
  try {
    res = parseQuantity(input);
  } catch {
    return { ok: false, value: null };
  }
  if (typeof res === 'number') return { ok: !Number.isNaN(res), value: res };
  if (res === null || res === undefined) return { ok: true, value: null };
  const r = res as Record<string, unknown>;
  const failed = Boolean(r.error) || r.ok === false || r.valid === false;
  const value = (r.value ?? r.quantity ?? null) as number | null;
  return { ok: !failed, value: failed ? null : value };
}

describe('validateRecipe: title (R-003 crit. 1)', () => {
  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['101 characters', chars(101)],
  ])('gives an error on title for %s', (_n, title) => {
    expect(hasErrorOn(draft({ title }), 'title')).toBe(true);
  });

  it.each([
    ['1 character', 'a'],
    ['"  a  " counts as 1', '  a  '],
    ['100 characters', chars(100)],
    ['100 characters with spaces around', `  ${chars(100)}  `],
    ['100 code points (emoji, 2 UTF-16 units each)', chars(100, '😀')],
  ])('accepts %s', (_n, title) => {
    expect(hasErrorOn(draft({ title }), 'title')).toBe(false);
  });

  it('rejects 101 code points', () => {
    expect(hasErrorOn(draft({ title: chars(101, '😀') }), 'title')).toBe(true);
  });

  it('accepts a complete minimal recipe without any error', () => {
    expect(errorLeaves(draft())).toEqual([]);
  });
});

describe('validateRecipe: lists (R-003 crit. 1 and 2)', () => {
  it('gives an error on ingredients when there are none', () => {
    expect(hasErrorOn(draft({ ingredients: [] }), 'ingredients')).toBe(true);
  });

  it('gives an error on steps when there are none', () => {
    expect(hasErrorOn(draft({ steps: [] }), 'steps')).toBe(true);
  });

  it('ingredient name: 0 and 81 characters are wrong, 1 and 80 are right', () => {
    // A completely empty row is dropped on save by the form, so "0" is tested with a quantity present.
    expect(isInvalid(draft({ ingredients: [ing('', '2')] }))).toBe(true);
    expect(isInvalid(draft({ ingredients: [ing(chars(81))] }))).toBe(true);
    expect(isInvalid(draft({ ingredients: [ing('a')] }))).toBe(false);
    expect(isInvalid(draft({ ingredients: [ing(chars(80))] }))).toBe(false);
  });

  it('unit: 21 characters is wrong, 20 and empty are right', () => {
    expect(isInvalid(draft({ ingredients: [ing('Meel', '', chars(21))] }))).toBe(true);
    expect(isInvalid(draft({ ingredients: [ing('Meel', '', chars(20))] }))).toBe(false);
    expect(isInvalid(draft({ ingredients: [ing('Meel', '', '')] }))).toBe(false);
  });

  it('quantity: a bad value in the form is an error, a good one is not', () => {
    expect(isInvalid(draft({ ingredients: [ing('Meel', '0')] }))).toBe(true);
    expect(isInvalid(draft({ ingredients: [ing('Meel', '1,234')] }))).toBe(true);
    expect(isInvalid(draft({ ingredients: [ing('Meel', '0,25', 'kg')] }))).toBe(false);
  });

  it('step: 0 and 1001 characters are wrong, 1 and 1000 are right', () => {
    expect(isInvalid(draft({ steps: [''] }))).toBe(true);
    expect(isInvalid(draft({ steps: [chars(1001)] }))).toBe(true);
    expect(isInvalid(draft({ steps: ['a'] }))).toBe(false);
    expect(isInvalid(draft({ steps: [chars(1000)] }))).toBe(false);
  });

  it('counts: 60 ingredients and 40 steps are right, 61 and 41 are wrong', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ing(`Ingrediënt ${i}`));
    const steps = (n: number) => Array.from({ length: n }, (_, i) => `Stap ${i}`);
    expect(isInvalid(draft({ ingredients: many(60) }))).toBe(false);
    expect(hasErrorOn(draft({ ingredients: many(61) }), 'ingredients')).toBe(true);
    expect(isInvalid(draft({ steps: steps(40) }))).toBe(false);
    expect(hasErrorOn(draft({ steps: steps(41) }), 'steps')).toBe(true);
  });
});

describe('parseQuantity (R-003 crit. 2)', () => {
  it.each([
    ['2', 2],
    ['0,25', 0.25],
    ['1.5', 1.5],
  ])('"%s" gives %s', (input, value) => {
    expect(parsed(input)).toEqual({ ok: true, value });
  });

  it('an empty text means no quantity, which is valid', () => {
    expect(parsed('')).toEqual({ ok: true, value: null });
  });

  it.each(['0', '-1', '1,234', 'abc', '1e3'])('"%s" is an error', (input) => {
    expect(parsed(input).ok).toBe(false);
  });
});

describe('formatQuantity (decimal comma, no trailing zeros)', () => {
  it.each([
    [2, '2'],
    [0.25, '0,25'],
    [1.5, '1,5'],
    [10, '10'],
  ])('%s is shown as "%s"', (value, text) => {
    expect(formatQuantity(value)).toBe(text);
  });
});

describe('moveItem / removeItem (R-003 crit. 3)', () => {
  it('moves an item up and down without touching the original list', () => {
    const list = ['A', 'B', 'C'];
    const copy = [...list];
    expect(moveItem(list, 1, -1)).toEqual(['B', 'A', 'C']);
    expect(moveItem(list, 0, 1)).toEqual(['B', 'A', 'C']);
    expect(moveItem(list, 1, 1)).toEqual(['A', 'C', 'B']);
    expect(list).toEqual(copy);
  });

  it('leaves the list unchanged when moving the first item up or the last item down', () => {
    expect(moveItem(['A', 'B', 'C'], 0, -1)).toEqual(['A', 'B', 'C']);
    expect(moveItem(['A', 'B', 'C'], 2, 1)).toEqual(['A', 'B', 'C']);
  });

  it('removes an item without touching the original list', () => {
    const list = ['A', 'B', 'C'];
    expect(removeItem(list, 1)).toEqual(['A', 'C']);
    expect(list).toEqual(['A', 'B', 'C']);
  });
});

describe('toRow (what is stored)', () => {
  it('trims, turns the quantity into a number and leaves empty quantity/unit out', () => {
    const row = toRow(
      draft({
        title: '  Soep  ',
        ingredients: [ing(' Water ', '0,5', ' l '), ing('Zout', '', '  ')],
        steps: ['  Kook.  '],
      }),
    ) as unknown as { title: string; ingredients: Array<Record<string, unknown>>; steps: string[] };
    expect(row.title).toBe('Soep');
    expect(row.steps).toEqual(['Kook.']);
    expect(row.ingredients[0]).toEqual({ name: 'Water', quantity: 0.5, unit: 'l' });
    expect(row.ingredients[1]).toEqual({ name: 'Zout' });
  });
});

describe('isDirty (R-003 crit. 8)', () => {
  it('is false for an identical draft', () => {
    expect(isDirty(draft(), draft())).toBe(false);
  });

  it('is true after a change', () => {
    expect(isDirty(draft(), draft({ title: 'Soepje' }))).toBe(true);
    expect(isDirty(draft(), draft({ steps: ['Kook het water.', 'Eet.'] }))).toBe(true);
  });

  it('is false again when a change is set back to the initial value', () => {
    const initial = draft();
    const typed = draft({ title: 'Soepje' });
    expect(isDirty(initial, typed)).toBe(true);
    expect(isDirty(initial, draft({ title: 'Soep' }))).toBe(false);
  });
});
