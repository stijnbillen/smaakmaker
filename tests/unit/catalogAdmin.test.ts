import { describe, expect, it } from 'vitest';
import { mapCatalogError, validateCatalogItem } from '../../src/lib/catalogAdminLogic';

// T-025 / R-022 crit. 3 and 5: on-device validation (same limits as R-018 crit. 1) and mapping of database errors.
// Seam required from the developer (src/lib/catalogAdminLogic.ts, no Supabase import):
//   validateCatalogItem(kind: 'ingredient' | 'unit', { nameNl, nameFr, synonyms }): null | 'noName' | 'nameTooLong'
//     | 'synonymTooLong' | 'tooManySynonyms' | 'duplicateKey'
//   mapCatalogError({ code?, details?, message? }): { kind: 'exists'; itemId: string } | { kind: 'inUse'; count: number }
//     | { kind: 'invalid' } | { kind: 'forbidden' } | { kind: 'unknown' }
const item = (nameNl: string | null, nameFr: string | null, synonyms: string[] = []) => ({ nameNl, nameFr, synonyms });

describe('validateCatalogItem (R-022 crit. 3, R-018 crit. 1)', () => {
  it('accepts one name or two', () => {
    expect(validateCatalogItem('ingredient', item('aardappel', null))).toBeNull();
    expect(validateCatalogItem('ingredient', item(null, 'pomme de terre'))).toBeNull();
  });

  it('needs at least one name', () => {
    expect(validateCatalogItem('ingredient', item(null, null))).toBe('noName');
    expect(validateCatalogItem('ingredient', item('  ', ''))).toBe('noName');
  });

  it('limits names to 80 characters for an ingredient and 20 for a unit', () => {
    expect(validateCatalogItem('ingredient', item('a'.repeat(80), null))).toBeNull();
    expect(validateCatalogItem('ingredient', item('a'.repeat(81), null))).toBe('nameTooLong');
    expect(validateCatalogItem('unit', item('a'.repeat(20), null))).toBeNull();
    expect(validateCatalogItem('unit', item(null, 'a'.repeat(21)))).toBe('nameTooLong');
  });

  it('limits synonyms to the same length and to 20 per item', () => {
    expect(validateCatalogItem('unit', item('el', null, ['a'.repeat(21)]))).toBe('synonymTooLong');
    const twenty = Array.from({ length: 20 }, (_, i) => `syn${i}`);
    expect(validateCatalogItem('ingredient', item('x', null, twenty))).toBeNull();
    expect(validateCatalogItem('ingredient', item('x', null, [...twenty, 'extra']))).toBe('tooManySynonyms');
  });

  it('rejects two entries with the same key inside the item (case and accents ignored)', () => {
    expect(validateCatalogItem('ingredient', item('crème', null, ['Creme']))).toBe('duplicateKey');
  });
});

describe('mapCatalogError (R-022 crit. 3 and 5)', () => {
  const id = '0b6f4a0e-1111-4222-8333-444455556666';

  it('maps 23505 with an id to "exists"', () => {
    expect(mapCatalogError({ code: '23505', details: id })).toEqual({ kind: 'exists', itemId: id });
  });

  it('maps 23503 with a number to "in use"', () => {
    expect(mapCatalogError({ code: '23503', details: '2' })).toEqual({ kind: 'inUse', count: 2 });
  });

  it('maps 23514 to invalid and 42501 to forbidden; anything else is unknown', () => {
    expect(mapCatalogError({ code: '23514' }).kind).toBe('invalid');
    expect(mapCatalogError({ code: '42501' }).kind).toBe('forbidden');
    expect(mapCatalogError({ code: 'XX000', message: 'boom' }).kind).toBe('unknown');
  });
});
