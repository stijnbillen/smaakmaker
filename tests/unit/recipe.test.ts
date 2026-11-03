import { describe, expect, it } from 'vitest';
import {
  formatQuantity,
  isDirty,
  draftFromRecord,
  emptyDraft,
  sourceLink,
  moveItem,
  ingredientLine,
  parseMinutes,
  parseServings,
  scaleQuantity,
  parseQuantity,
  pruneDraft,
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
  prepMinutes: string;
  totalMinutes: string;
  servings: string;
  source: string;
  note: string;
}

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    title: 'Soep',
    prepMinutes: '10',
    totalMinutes: '20',
    servings: '4',
    source: '',
    note: '',
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

// T-006 / R-007 crit. 1: the parse result shape is {ok, value} like parseQuantity; read tolerantly.
function minutes(input: string): { ok: boolean; value: number | null } {
  let res: unknown;
  try {
    res = parseMinutes(input);
  } catch {
    return { ok: false, value: null };
  }
  if (typeof res === 'number') return { ok: !Number.isNaN(res), value: res };
  if (res === null || res === undefined) return { ok: false, value: null };
  const r = res as Record<string, unknown>;
  const failed = Boolean(r.error) || r.ok === false || r.valid === false;
  return { ok: !failed, value: failed ? null : ((r.value ?? r.minutes ?? null) as number | null) };
}

describe('parseMinutes (R-007 crit. 1)', () => {
  it.each([
    ['0', 0],
    ['45', 45],
    ['4320', 4320],
    [' 30 ', 30],
    ['045', 45],
  ])('"%s" gives %s', (input, value) => {
    expect(minutes(input)).toEqual({ ok: true, value });
  });

  it.each(['', '   ', '4321', '-1', '1,5', '1.5', 'abc', '1e3', '+5', '99999999999'])('"%s" is an error', (input) => {
    expect(minutes(input).ok).toBe(false);
  });
});

describe('validateRecipe: times (R-007 crit. 1 and 2)', () => {
  const t = (prepMinutes: string, totalMinutes: string) => draft({ prepMinutes, totalMinutes });

  it.each([
    ['empty prep', t('', '20'), 'prepMinutes'],
    ['empty total', t('10', ''), 'totalMinutes'],
    ['prep 4321', t('4321', '4321'), 'prepMinutes'],
    ['total 4321', t('10', '4321'), 'totalMinutes'],
    ['negative prep', t('-1', '20'), 'prepMinutes'],
    ['non-numeric total', t('10', 'abc'), 'totalMinutes'],
  ])('gives an error on the field for %s', (_n, d, field) => {
    expect(hasErrorOn(d, field)).toBe(true);
  });

  it('accepts 0/0 and 4320/4320 without any error', () => {
    expect(errorLeaves(t('0', '0'))).toEqual([]);
    expect(errorLeaves(t('4320', '4320'))).toEqual([]);
  });

  it('crit. 2: total equal to prep is valid, one minute less is an error on totalMinutes', () => {
    expect(errorLeaves(t('30', '30'))).toEqual([]);
    expect(errorLeaves(t('30', '29'))).toEqual([['totalMinutes', 'totalBeforePrep']]);
  });

  it('crit. 2: the comparison is left out when one of the two is invalid, only per-field errors remain', () => {
    const leavesOf = errorLeaves(t('abc', '5'));
    expect(leavesOf.some(([, v]) => v === 'totalBeforePrep')).toBe(false);
    expect(hasErrorOn(t('abc', '5'), 'prepMinutes')).toBe(true);
    const other = errorLeaves(t('30', ''));
    expect(other.some(([, v]) => v === 'totalBeforePrep')).toBe(false);
    expect(hasErrorOn(t('30', ''), 'totalMinutes')).toBe(true);
  });
});

describe('times in pruneDraft, toRow and draftFromRecord (R-007 risks)', () => {
  it('pruneDraft keeps the times (else the form silently saves without them)', () => {
    const pruned = pruneDraft(draft({ prepMinutes: '15', totalMinutes: '90' }) as never).draft as unknown as Draft;
    expect(pruned.prepMinutes).toBe('15');
    expect(pruned.totalMinutes).toBe('90');
  });

  it('toRow writes the times as numbers', () => {
    const row = toRow(draft({ prepMinutes: ' 15 ', totalMinutes: '90' }) as never) as unknown as Record<string, unknown>;
    expect(row.prep_minutes).toBe(15);
    expect(row.total_minutes).toBe(90);
  });

  it('draftFromRecord gives the times back as text, so a fresh edit form is not dirty', () => {
    const record = {
      title: 'Soep',
      ingredients: [{ name: 'Water' }],
      steps: ['Kook.'],
      prep_minutes: 30,
      total_minutes: 60,
    };
    const d = draftFromRecord(record as never) as unknown as Draft;
    expect(d.prepMinutes).toBe('30');
    expect(d.totalMinutes).toBe('60');
    expect(isDirty(d as never, draftFromRecord(record as never))).toBe(false);
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

  it('is true after a time changes (R-007)', () => {
    expect(isDirty(draft(), draft({ prepMinutes: '11' }))).toBe(true);
    expect(isDirty(draft(), draft({ totalMinutes: '21' }))).toBe(true);
  });

  it('is true after servings change (R-013)', () => {
    expect(isDirty(draft(), draft({ servings: '5' }))).toBe(true);
  });
});

// T-007 / R-013
function servingsResult(input: string): { ok: boolean; value?: number; reason?: string } {
  return parseServings(input) as never;
}

describe('parseServings (R-013 crit. 1)', () => {
  it.each([
    ['1', 1],
    ['4', 4],
    ['99', 99],
    [' 6 ', 6],
    ['04', 4],
  ])('"%s" gives %s', (input, value) => {
    expect(servingsResult(input)).toEqual({ ok: true, value });
  });

  it.each(['', '   '])('"%s" is required', (input) => {
    expect(servingsResult(input)).toEqual({ ok: false, reason: 'required' });
  });

  it.each(['0', '100', '-1', '1,5', '1.5', 'abc', '1e1', '+4', '99999999999'])('"%s" is invalid', (input) => {
    expect(servingsResult(input)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('validateRecipe: servings (R-013 crit. 1)', () => {
  it.each([
    ['empty', '', 'servingsRequired'],
    ['0', '0', 'servingsInvalid'],
    ['100', '100', 'servingsInvalid'],
    ['text', 'abc', 'servingsInvalid'],
  ])('gives an error on servings for %s', (_n, servings, code) => {
    expect(errorLeaves(draft({ servings }))).toEqual([['servings', code]]);
  });

  it('accepts 1 and 99', () => {
    expect(errorLeaves(draft({ servings: '1' }))).toEqual([]);
    expect(errorLeaves(draft({ servings: '99' }))).toEqual([]);
  });
});

describe('servings in pruneDraft, toRow, draftFromRecord (R-013 risks)', () => {
  const base = { title: 'Soep', ingredients: [{ name: 'Water' }], steps: ['Kook.'], prep_minutes: 1, total_minutes: 2 };

  it('pruneDraft keeps servings', () => {
    expect((pruneDraft(draft({ servings: '6' }) as never).draft as unknown as Draft).servings).toBe('6');
  });

  it('toRow writes servings as a number', () => {
    expect((toRow(draft({ servings: ' 6 ' }) as never) as unknown as Record<string, unknown>).servings).toBe(6);
  });

  it('draftFromRecord gives servings as text, so a fresh edit form is not dirty', () => {
    const d = draftFromRecord({ ...base, servings: 4 } as never) as unknown as Draft;
    expect(d.servings).toBe('4');
    expect(isDirty(d as never, draftFromRecord({ ...base, servings: 4 } as never))).toBe(false);
  });

  it('draftFromRecord gives an empty text for an old row without servings', () => {
    expect((draftFromRecord({ ...base, servings: null } as never) as unknown as Draft).servings).toBe('');
    expect((draftFromRecord(base as never) as unknown as Draft).servings).toBe('');
  });
});

describe('scaleQuantity + formatQuantity (R-013 crit. 3)', () => {
  it.each([
    [200, 4, 6, '300'],
    [1, 4, 1, '0,25'],
    [1, 3, 1, '0,33'],
    [2, 3, 1, '0,67'],
    [0.5, 4, 6, '0,75'],
    [1.5, 2, 3, '2,25'],
    [2.5, 2, 4, '5'],
    [0.25, 2, 1, '0,13'], // exact half rounds up
    [0.1, 7, 7, '0,1'], // desired = original returns the stored quantity
    [999999.99, 1, 99, '98999999,01'], // no exponent notation
  ])('%s for %s -> %s portions shows "%s"', (q, original, desired, text) => {
    expect(formatQuantity(scaleQuantity(q, original, desired))).toBe(text);
  });
});

describe('ingredientLine (R-013 crit. 3 and 4)', () => {
  it('scales the quantity and keeps unit and name', () => {
    expect(ingredientLine({ name: 'bloem', quantity: 200, unit: 'g' }, 4, 6)).toBe('300 g bloem');
    expect(ingredientLine({ name: 'ei', quantity: 1 }, 4, 6)).toBe('1,5 ei');
    expect(ingredientLine({ name: 'melk', quantity: 0.5, unit: 'l' }, 4, 1)).toBe('0,13 l melk');
  });

  it.each([1, 4, 6, 99])('leaves an ingredient without quantity unchanged at %s portions', (desired) => {
    expect(ingredientLine({ name: 'zout', unit: 'snuf' }, 4, desired)).toBe('snuf zout');
    expect(ingredientLine({ name: 'peper' }, 4, desired)).toBe('peper');
  });

  it('shows "< 0,01" when the result rounds to 0', () => {
    const line = ingredientLine({ name: 'zout', quantity: 0.01 }, 99, 1);
    expect(line).toContain('< 0,01');
    expect(line).toContain('zout');
  });
});

// T-008 / R-015
describe('validateRecipe: source and note (R-015 crit. 1)', () => {
  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['200 characters', chars(200)],
    ['200 x é', chars(200, 'é')],
    ['200 emoji (1 code point each)', chars(200, '😀')],
    ['200 characters with spaces around', `  ${chars(200)}  `],
  ])('source %s is valid', (_n, source) => {
    expect(errorLeaves(draft({ source }))).toEqual([]);
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['1000 characters', chars(1000)],
    ['1000 emoji', chars(1000, '😀')],
    ['1000 characters with spaces around', `  ${chars(1000)}  `],
  ])('note %s is valid', (_n, note) => {
    expect(errorLeaves(draft({ note }))).toEqual([]);
  });

  it('201 characters source gives sourceTooLong, also for 201 emoji', () => {
    expect(errorLeaves(draft({ source: chars(201) }))).toEqual([['source', 'sourceTooLong']]);
    expect(errorLeaves(draft({ source: chars(201, '😀') }))).toEqual([['source', 'sourceTooLong']]);
  });

  it('1001 characters note gives noteTooLong', () => {
    expect(errorLeaves(draft({ note: chars(1001) }))).toEqual([['note', 'noteTooLong']]);
  });
});

describe('source and note in toRow, draftFromRecord, emptyDraft, pruneDraft (R-015)', () => {
  const base = { title: 'Soep', ingredients: [{ name: 'Water' }], steps: ['Kook.'], prep_minutes: 1, total_minutes: 2, servings: 4 };

  it('toRow trims source and note', () => {
    const row = toRow(draft({ source: '  Oma  ', note: '  lekker  ' }) as never) as unknown as Record<string, unknown>;
    expect(row.source).toBe('Oma');
    expect(row.note).toBe('lekker');
  });

  it('toRow turns empty and whitespace-only values into null', () => {
    const row = toRow(draft({ source: '   ', note: '' }) as never) as unknown as Record<string, unknown>;
    expect(row.source).toBeNull();
    expect(row.note).toBeNull();
  });

  it('draftFromRecord turns null (and a missing column) into "", so a fresh edit form is not dirty', () => {
    const d = draftFromRecord({ ...base, source: null, note: null } as never) as unknown as Draft;
    expect(d.source).toBe('');
    expect(d.note).toBe('');
    expect((draftFromRecord(base as never) as unknown as Draft).source).toBe('');
    expect(isDirty(d as never, draftFromRecord({ ...base, source: null, note: null } as never))).toBe(false);
  });

  it('draftFromRecord keeps stored values', () => {
    const d = draftFromRecord({ ...base, source: 'Oma', note: 'Lekker' } as never) as unknown as Draft;
    expect(d.source).toBe('Oma');
    expect(d.note).toBe('Lekker');
  });

  it('emptyDraft has empty source and note', () => {
    const d = emptyDraft() as unknown as Draft;
    expect(d.source).toBe('');
    expect(d.note).toBe('');
  });

  it('pruneDraft keeps source and note', () => {
    const pruned = pruneDraft(draft({ source: 'Oma', note: 'Lekker' }) as never).draft as unknown as Draft;
    expect(pruned.source).toBe('Oma');
    expect(pruned.note).toBe('Lekker');
  });

  it('isDirty is true after source or note changes', () => {
    expect(isDirty(draft(), draft({ source: 'Oma' }))).toBe(true);
    expect(isDirty(draft(), draft({ note: 'x' }))).toBe(true);
  });
});

describe('sourceLink (R-015 crit. 3)', () => {
  it.each([
    ['https://example.com/soep', 'https://example.com/soep'],
    ['http://example.com', 'http://example.com'],
    ['HTTPS://Example.com', 'HTTPS://Example.com'],
    [' https://x.be ', 'https://x.be'],
  ])('"%s" is a link', (input, url) => {
    expect(sourceLink(input)).toBe(url);
  });

  it.each([
    'Oma',
    'Ons Kookboek p. 12',
    'www.example.com',
    'ftp://x',
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'mijn https://x',
    '',
    '   ',
  ])('"%s" is plain text', (input) => {
    expect(sourceLink(input)).toBeNull();
  });

  it('null is plain text', () => {
    expect(sourceLink(null)).toBeNull();
  });
});

describe('dish tags in the draft (T-010 / R-010 crit. 2)', () => {
  const base = { title: 'Soep', ingredients: [{ name: 'Water' }], steps: ['Kook.'], prep_minutes: 1, total_minutes: 2, servings: 4 };
  const withTags = (dishTags: string[]) => draft({ dishTags } as never) as never;
  const check = (dishTags: string[]) =>
    validateRecipe(withTags(dishTags)) as unknown as { ok?: boolean; errors?: Record<string, unknown> };
  const names = (n: number) => Array.from({ length: n }, (_, i) => `tag${i}`);

  it('accepts zero tags', () => {
    const r = check([]);
    expect(r.errors?.dishTags).toBeUndefined();
    expect(r.ok).toBe(true);
  });

  it('accepts 20 tags and refuses 21 with tagsTooMany', () => {
    expect(check(names(20)).errors?.dishTags).toBeUndefined();
    const over = check(names(21));
    expect(over.errors?.dishTags).toBe('tagsTooMany');
    expect(over.ok).toBe(false);
  });

  it('toRow writes dish_tags as an array of trimmed names', () => {
    const row = toRow(withTags([' soep ', 'tapas'])) as unknown as Record<string, unknown>;
    expect(row.dish_tags).toEqual(['soep', 'tapas']);
  });

  it('draftFromRecord takes the tags over and defaults to []', () => {
    const tags = (r: unknown) => (draftFromRecord(r as never) as unknown as { dishTags: string[] }).dishTags;
    expect(tags({ ...base, dishTags: ['soep'] })).toEqual(['soep']);
    expect(tags(base)).toEqual([]);
  });

  it('emptyDraft starts without tags', () => {
    expect((emptyDraft() as unknown as { dishTags: string[] }).dishTags).toEqual([]);
  });

  it('a fresh edit form with tags is not dirty; removing a tag is (R-003 crit. 8)', () => {
    const record = { ...base, dishTags: ['soep', 'tapas'] };
    const fresh = draftFromRecord(record as never);
    expect(isDirty(draftFromRecord(record as never), fresh)).toBe(false);
    const changed = { ...(fresh as object), dishTags: ['soep'] } as never;
    expect(isDirty(changed, fresh)).toBe(true);
  });
});

describe('trait tags in the draft (T-011 / R-011 crit. 1)', () => {
  const base = { title: 'Soep', ingredients: [{ name: 'Water' }], steps: ['Kook.'], prep_minutes: 1, total_minutes: 2, servings: 4 };
  const withTags = (traitTags: string[]) => draft({ traitTags } as never) as never;
  const check = (traitTags: string[]) =>
    validateRecipe(withTags(traitTags)) as unknown as { ok?: boolean; errors?: Record<string, unknown> };
  const names = (n: number) => Array.from({ length: n }, (_, i) => `kenmerk${i}`);

  it('accepts zero tags', () => {
    const r = check([]);
    expect(r.errors?.traitTags).toBeUndefined();
    expect(r.ok).toBe(true);
  });

  it('accepts 20 tags and refuses 21 with tagsTooMany', () => {
    expect(check(names(20)).errors?.traitTags).toBeUndefined();
    const over = check(names(21));
    expect(over.errors?.traitTags).toBe('tagsTooMany');
    expect(over.ok).toBe(false);
  });

  it('the limit is per group: 20 dish plus 20 trait tags give no error', () => {
    const r = validateRecipe(draft({ dishTags: names(20), traitTags: names(20) } as never) as never) as unknown as {
      errors?: Record<string, unknown>;
    };
    expect(r.errors?.dishTags).toBeUndefined();
    expect(r.errors?.traitTags).toBeUndefined();
  });

  it('toRow writes trait_tags as an array of trimmed names', () => {
    const row = toRow(withTags([' vegetarisch ', 'snel'])) as unknown as Record<string, unknown>;
    expect(row.trait_tags).toEqual(['vegetarisch', 'snel']);
  });

  it('draftFromRecord takes the tags over and defaults to []', () => {
    const tags = (r: unknown) => (draftFromRecord(r as never) as unknown as { traitTags: string[] }).traitTags;
    expect(tags({ ...base, traitTags: ['snel'] })).toEqual(['snel']);
    expect(tags(base)).toEqual([]);
  });

  it('emptyDraft starts without trait tags', () => {
    expect((emptyDraft() as unknown as { traitTags: string[] }).traitTags).toEqual([]);
  });

  it('removing a trait tag makes the form dirty (R-003 crit. 8)', () => {
    const record = { ...base, traitTags: ['vegetarisch', 'snel'] };
    const fresh = draftFromRecord(record as never);
    expect(isDirty(draftFromRecord(record as never), fresh)).toBe(false);
    expect(isDirty({ ...(fresh as object), traitTags: ['snel'] } as never, fresh)).toBe(true);
  });
});

// T-014 / R-006 crit. 2: a copy-to-do photo (copyFrom) must not make an untouched variant form "changed".
describe('isDirty ignores copyFrom (T-014 / R-006 crit. 2)', () => {
  const photo = { key: 'k1', previewUrl: '', main: true, bytes: 10 };
  const start = { ...emptyDraft(), photos: [photo] };

  it('is false when only copyFrom or bytes differ', () => {
    const other = { ...start, photos: [{ ...photo, copyFrom: 'x/y.jpg', bytes: 99 }] };
    expect(isDirty(start, other)).toBe(false);
  });

  it('is true when the order or the number of copied photos differs', () => {
    const two = { ...emptyDraft(), photos: [{ ...photo, copyFrom: 'a' }, { ...photo, key: 'k2', main: false, copyFrom: 'b' }] };
    expect(isDirty(two, { ...two, photos: [...two.photos].reverse() })).toBe(true);
    expect(isDirty(two, { ...two, photos: two.photos.slice(0, 1) })).toBe(true);
  });
});
