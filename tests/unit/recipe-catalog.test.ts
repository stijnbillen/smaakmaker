import { afterEach, describe, expect, it } from 'vitest';
import { resetLanguage, useLanguage } from '../helpers/language';
import {
  draftFromRecord,
  emptyDraft,
  ingredientLine,
  isDirty,
  pruneDraft,
  toRow,
  validateRecipe,
  type RecipeDraft,
  type RecipeRecord,
} from '../../src/lib/recipe';
import type { CatalogItem } from '../../src/lib/catalog';
import { recipeTextBytes } from '../../src/lib/recipeSize';
import { variantDraft } from '../../src/lib/variant';
import nlJson from '../../src/i18n/nl.json';
import enJson from '../../src/i18n/en.json';

// T-021 / R-020 (replaces the R-018 key comparison of T-019: the link now hangs on "field not touched").
const ING = '11111111-1111-4111-8111-111111111111';
const UNIT = '22222222-2222-4222-8222-222222222222';
const potato = { id: ING, nameNl: 'aardappel', nameEn: 'potato' };
const gram = { id: UNIT, nameNl: 'gram', nameEn: 'gram' };

afterEach(resetLanguage);

const record = {
  id: 'r1',
  authorId: 'u',
  authorName: 'A',
  createdAt: '2026-01-01T00:00:00Z',
  title: 'Gekoppeld',
  ingredients: [
    { name: 'Brocolli', quantity: 200, unit: 'G', ingredient_id: ING, unit_id: UNIT, size: 'large' },
    { name: 'Water', quantity: 1 },
    { name: 'tempeh', quantity: 2, unit: 'handvol' },
  ],
  steps: ['Kook.'],
  prepMinutes: 5,
  totalMinutes: 10,
  servings: 2,
  source: null,
  note: null,
  equipment: [],
  dishTags: [],
  traitTags: [],
  photos: [],
  variantOf: null,
  familyId: 'r1',
  sourceTitle: null,
} as unknown as RecipeRecord;

const rowsOf = (draft: RecipeDraft) => toRow(draft).ingredients as unknown as Array<Record<string, unknown>>;

describe('draft lines and toRow (crit. 2, 5, 7, 9)', () => {
  it('a linked line writes the id and the shown name of the item (snapshot) in the interface language', () => {
    const d = emptyDraft();
    d.ingredients = [{ name: 'potato', quantity: '2', unit: 'gram', ingredient: potato, unitItem: gram, size: 'large' }];
    useLanguage('en');
    expect(rowsOf(d)[0]).toEqual({ name: 'potato', quantity: 2, unit: 'gram', ingredient_id: ING, unit_id: UNIT, size: 'large' });
    useLanguage('nl');
    expect(rowsOf(d)[0]).toMatchObject({ name: 'aardappel', ingredient_id: ING });
  });

  it('a free-text line (no item) writes no ids; size is only written when filled', () => {
    const d = emptyDraft();
    d.ingredients = [{ name: 'tempeh', quantity: '', unit: 'handvol' }, { name: 'ei', quantity: '1', unit: '', size: undefined }];
    expect(rowsOf(d)[0]).toEqual({ name: 'tempeh', unit: 'handvol' });
    expect(rowsOf(d)[1]).toEqual({ name: 'ei', quantity: 1 });
  });

  it('saving a stored line without touching it keeps ids, text and size (no catalogue loaded)', () => {
    const rows = rowsOf(draftFromRecord(record));
    expect(rows[0]).toEqual({ name: 'Brocolli', quantity: 200, unit: 'G', ingredient_id: ING, unit_id: UNIT, size: 'large' });
    expect(rows[1]).toEqual({ name: 'Water', quantity: 1 });
    expect(rows[2]).toEqual({ name: 'tempeh', quantity: 2, unit: 'handvol' });
  });

  it('shows the current item name in the form when the catalogue is loaded (crit. 9: reference, not copy)', () => {
    useLanguage('nl');
    const catalog = new Map<string, CatalogItem>([
      [ING, { id: ING, nameNl: 'broccoli', nameEn: 'broccoli' }],
      [UNIT, { id: UNIT, nameNl: 'gram', nameEn: 'gram' }],
    ]);
    const d = draftFromRecord(record, undefined, catalog);
    expect(d.ingredients[0].name).toBe('broccoli');
    expect(d.ingredients[0].unit).toBe('gram');
    expect(rowsOf(d)[0]).toMatchObject({ name: 'broccoli', ingredient_id: ING, unit_id: UNIT, size: 'large' });
  });

  it('a fresh form from a record is not "changed" (the stable line id is not part of isDirty)', () => {
    expect(isDirty(draftFromRecord(record), draftFromRecord(record))).toBe(false);
  });

  it('a size counts as content: a line with only a size is not pruned as empty', () => {
    const d = emptyDraft();
    d.ingredients = [{ name: '', quantity: '', unit: '', size: 'small' }];
    expect(pruneDraft(d).draft.ingredients).toHaveLength(1);
  });
});

describe('free text stays valid (crit. 5)', () => {
  const withLine = (name: string, unit: string): RecipeDraft => ({
    ...emptyDraft(),
    title: 't',
    prepMinutes: '1',
    totalMinutes: '2',
    servings: '2',
    steps: ['s'],
    ingredients: [{ name, quantity: '1', unit }],
  });

  it('accepts a name of 80 and a unit of 20 characters', () => {
    expect(validateRecipe(withLine('a'.repeat(80), 'b'.repeat(20))).ok).toBe(true);
  });

  it('refuses 81 and 21 with the existing messages', () => {
    const { errors } = validateRecipe(withLine('a'.repeat(81), 'b'.repeat(21)));
    expect(errors.ingredientRows[0]).toEqual({ name: 'nameInvalid', unit: 'unitInvalid' });
  });
});

describe('ingredientLine with item and size (crit. 7, 8, 9)', () => {
  // Assumed signature: ingredientLine(ingredient, original, desired, item?, lang?).
  const line = { name: 'aardappel', quantity: 2, size: 'large' as const };

  it('shows "2 aardappel (groot)" in Dutch and "2 potato (large)" in English', () => {
    useLanguage('nl');
    expect(ingredientLine(line, 2, 2, potato, 'nl')).toBe('2 aardappel (groot)');
    useLanguage('en');
    expect(ingredientLine(line, 2, 2, potato, 'en')).toBe('2 potato (large)');
  });

  it('has no brackets without a size, and puts the size last after a unit', () => {
    useLanguage('nl');
    expect(ingredientLine({ name: 'aardappel', quantity: 2 }, 2, 2, potato, 'nl')).toBe('2 aardappel');
    expect(ingredientLine({ name: 'aardappel', quantity: 200, unit: 'g', size: 'large' }, 2, 2, potato, 'nl')).toBe('200 g aardappel (groot)');
  });

  it('keeps the size when scaling 4 -> 6 servings', () => {
    useLanguage('nl');
    expect(ingredientLine({ name: 'aardappel', quantity: 2, size: 'large' }, 4, 6, potato, 'nl')).toBe('3 aardappel (groot)');
  });

  it('falls back to the stored name when the item could not be loaded', () => {
    useLanguage('nl');
    expect(ingredientLine({ name: 'oude naam', quantity: 1, ingredient_id: ING }, 1, 1, undefined, 'nl')).toBe('1 oude naam');
  });

  it('has the three sizes and the label in both language files, with the same keys', () => {
    for (const json of [nlJson, enJson] as Array<Record<string, string>>) {
      expect(json['form.size']).toBeTruthy();
    }
    expect(Object.keys(nlJson).sort()).toEqual(Object.keys(enJson).sort());
  });
});

describe('recipeTextBytes counts the size code (crit. 8)', () => {
  const base = (size?: 'small' | 'medium' | 'large'): RecipeDraft => ({
    ...emptyDraft(),
    title: 't',
    steps: ['s'],
    ingredients: [{ name: 'aardappel', quantity: '1', unit: 'g', ...(size ? { size } : {}) }],
  });

  it.each([
    ['small', 5],
    ['medium', 6],
    ['large', 5],
  ] as const)('size %s adds %i bytes (UTF-8 length of the stored code)', (size, bytes) => {
    expect(recipeTextBytes(base(size)) - recipeTextBytes(base())).toBe(bytes);
  });
});

describe('variantDraft copies references, free text and sizes (crit. 10)', () => {
  it('gives the same ids, sizes, names and units in toRow as the source', () => {
    const rows = rowsOf(variantDraft(record, new Map()));
    expect(rows).toEqual(rowsOf(draftFromRecord(record)));
    expect(rows[0]).toMatchObject({ ingredient_id: ING, unit_id: UNIT, size: 'large', name: 'Brocolli', unit: 'G' });
    expect(rows[2]).toEqual({ name: 'tempeh', quantity: 2, unit: 'handvol' });
  });
});
