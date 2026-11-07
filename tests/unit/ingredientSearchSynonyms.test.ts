import { describe, expect, it } from 'vitest';
import { dedupeByItem, replaceTerm, type TermInfo } from '../../src/lib/ingredientSearch';

// T-024 / R-021: pure helpers for "Bedoelde u" and "Al toegevoegd.". No Supabase needed.

describe('replaceTerm (crit. 3)', () => {
  it('replaces the term and keeps the others and their order', () => {
    expect(replaceTerm('feta, paprica, ui', 'paprica', 'paprika')).toBe('feta, paprika, ui');
  });

  it('replaces a term with the same key but other case or accents', () => {
    expect(replaceTerm('feta, PAPRICÀ, ui', 'paprica', 'paprika')).toBe('feta, paprika, ui');
    expect(replaceTerm('Crème, ui', 'creme', 'crème fraîche')).toBe('crème fraîche, ui');
  });

  it('leaves the text alone when the term is not there', () => {
    expect(replaceTerm('feta, ui', 'paprica', 'paprika')).toBe('feta, ui');
  });
});

describe('dedupeByItem (crit. 5)', () => {
  const info = (term: string, itemId: string | null): TermInfo => ({ term, itemId });

  it('keeps the first term of each item and reports the ones that drop out', () => {
    const terms = ['broccoli', 'feta', 'brocoli'];
    const result = dedupeByItem(terms, [info('broccoli', 'i1'), info('feta', 'i2'), info('brocoli', 'i1')]);
    expect(result.terms).toEqual(['broccoli', 'feta']);
    expect(result.duplicates).toEqual(['brocoli']);
  });

  it('terms without an item are de-duplicated on their key, as before', () => {
    const result = dedupeByItem(['qzvk', 'QZVK', 'other'], [info('qzvk', null), info('QZVK', null), info('other', null)]);
    expect(result.terms).toEqual(['qzvk', 'other']);
    expect(result.duplicates).toEqual(['QZVK']);
  });

  it('nothing to report when every item is different', () => {
    const result = dedupeByItem(['a', 'b'], [info('a', 'i1'), info('b', 'i2')]);
    expect(result.terms).toEqual(['a', 'b']);
    expect(result.duplicates).toEqual([]);
  });
});
