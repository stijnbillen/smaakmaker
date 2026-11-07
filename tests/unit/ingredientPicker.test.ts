import { describe, expect, it } from 'vitest';
import { suggestionLabel } from '../../src/lib/catalog';
import { resolveOnLeave, shouldFetch } from '../../src/lib/ingredientPicker';
import type { Suggestion } from '../../src/lib/suggest';

// T-021 / R-020. Pure logic of the picker in the recipe form.
// Assumption (documented in docs/taken/T-021-tests.md): the third argument of resolveOnLeave is the maximum
// text length (80 for a name, 20 for a unit); the options are capped at 5 (R-019) inside the function.
const row = (over: Partial<Suggestion> & { id: string }): Suggestion => ({
  nameNl: 'broccoli',
  nameFr: 'brocoli',
  matched: 'broccoli',
  matchKind: 'similar',
  distance: 1,
  similarity: 0.6,
  ...over,
});

describe('suggestionLabel (crit. 1)', () => {
  it('shows "synonym → name" when the hit comes from a synonym', () => {
    expect(suggestionLabel(row({ id: '1', matched: 'brocoli' }), 'nl')).toBe('brocoli → broccoli');
  });

  it('shows only the name when the hit is the shown name itself (same key)', () => {
    expect(suggestionLabel(row({ id: '1', matched: 'Broccoli' }), 'nl')).toBe('broccoli');
  });

  it('uses the French name in French, and falls back to the Dutch name without one', () => {
    const potato = row({ id: '2', nameNl: 'aardappel', nameFr: 'pomme de terre', matched: 'aardappel' });
    expect(suggestionLabel(potato, 'fr')).toBe('aardappel → pomme de terre');
    expect(suggestionLabel({ ...potato, nameFr: null, matched: 'aardappel' }, 'fr')).toBe('aardappel');
  });
});

describe('shouldFetch (crit. 1: from 2 typed characters)', () => {
  it.each([
    ['', false],
    ['b', false],
    [' b ', false],
    ['br', true],
    [' br ', true],
    ['  b', false],
  ])('%j -> %j', (term, expected) => {
    expect(shouldFetch(term)).toBe(expected);
  });
});

describe('resolveOnLeave', () => {
  it('links on an exact hit, also when similar and prefix rows are there too (crit. 2)', () => {
    const rows = [
      row({ id: 'p', matchKind: 'prefix', nameNl: 'broccolisoep', matched: 'broccolisoep' }),
      row({ id: 'e', matchKind: 'exact' }),
      row({ id: 's', matchKind: 'similar', nameNl: 'broccoflower', matched: 'broccoflower' }),
    ];
    const result = resolveOnLeave('broccoli', rows, 80);
    expect(result.action).toBe('link');
    expect((result as { item: { id: string } }).item.id).toBe('e');
  });

  it('asks "did you mean" with the similar rows when there is no exact hit; prefix rows do not count (crit. 3)', () => {
    const rows = [
      row({ id: 'p', matchKind: 'prefix' }),
      row({ id: 's1', matchKind: 'similar' }),
      row({ id: 's2', matchKind: 'similar', nameNl: 'paprika', matched: 'paprika' }),
    ];
    const result = resolveOnLeave('paprica', rows, 80);
    expect(result.action).toBe('didYouMean');
    expect((result as { options: Array<{ id: string }> }).options.map((o) => o.id)).toEqual(['s1', 's2']);
  });

  it('offers at most 5 options, in the given (R-019) order (crit. 3)', () => {
    const rows = Array.from({ length: 7 }, (_, i) => row({ id: `s${i}`, matchKind: 'similar' }));
    const result = resolveOnLeave('xx', rows, 80);
    expect(result.action).toBe('didYouMean');
    expect((result as { options: Array<{ id: string }> }).options.map((o) => o.id)).toEqual(['s0', 's1', 's2', 's3', 's4']);
  });

  it('asks to save a new item when there are no rows (crit. 4)', () => {
    expect(resolveOnLeave('tempeh', [], 80)).toEqual({ action: 'askNew' });
  });

  it('asks to save a new item when there are only prefix rows (no real suggestion)', () => {
    expect(resolveOnLeave('tempe', [row({ id: 'p', matchKind: 'prefix' })], 80)).toEqual({ action: 'askNew' });
  });

  it('does nothing for an empty or blank text (crit. 6: an empty unit stays allowed)', () => {
    expect(resolveOnLeave('', [], 20)).toEqual({ action: 'none' });
    expect(resolveOnLeave('   ', [row({ id: 'x', matchKind: 'exact' })], 20)).toEqual({ action: 'none' });
  });

  it('is invalid for a name of 81 characters and a unit of 21, never a question (crit. 11)', () => {
    expect(resolveOnLeave('a'.repeat(81), [], 80)).toEqual({ action: 'invalid' });
    expect(resolveOnLeave('a'.repeat(21), [], 20)).toEqual({ action: 'invalid' });
  });

  it('accepts exactly the maximum length (crit. 5 boundary)', () => {
    expect(resolveOnLeave('a'.repeat(80), [], 80).action).toBe('askNew');
    expect(resolveOnLeave('a'.repeat(20), [], 20).action).toBe('askNew');
  });

  it('trims the text before measuring', () => {
    expect(resolveOnLeave(` ${'a'.repeat(80)} `, [], 80).action).toBe('askNew');
  });
});
