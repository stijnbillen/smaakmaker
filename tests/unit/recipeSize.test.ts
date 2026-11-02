import { describe, expect, it } from 'vitest';
import {
  checkRecipeSize,
  formatRecipeSize,
  PHOTO_MAX_BYTES,
  RECIPE_MAX_BYTES,
  recipeSizeBytes,
  recipeTextBytes,
  utf8Bytes,
} from '../../src/lib/recipeSize';
import { emptyDraft, type RecipeDraft } from '../../src/lib/recipe';
import { SIZE_CASES, type SizeCase } from '../fixtures/recipe-size-cases';
import nl from '../../src/i18n/nl.json';

// T-013 / R-004. The limit is 2 MB = 2.097.152 bytes.
const LIMIT = 2_097_152;

const draftOf = (c: Partial<SizeCase>): RecipeDraft => ({
  ...emptyDraft(),
  title: c.title ?? '',
  prepMinutes: '10',
  totalMinutes: '20',
  servings: '4',
  source: c.source ?? '',
  note: c.note ?? '',
  ingredients: (c.ingredients ?? []).map((i) => ({ name: i.name, quantity: '1,5', unit: i.unit ?? '' })),
  steps: c.steps ?? [],
  dishTags: c.dishTags ?? [],
  traitTags: c.traitTags ?? [],
  equipment: c.equipment ?? [],
});

describe('limit constants (R-004: 2 MB, one source of truth)', () => {
  it('RECIPE_MAX_BYTES is 2.097.152 and a photo is at most 512.000', () => {
    expect(RECIPE_MAX_BYTES).toBe(LIMIT);
    expect(PHOTO_MAX_BYTES).toBe(512_000);
  });
});

describe('crit. 1: utf8Bytes counts bytes, not characters', () => {
  it.each([
    ['a', 1],
    ['é', 2],
    ['€', 3],
    ['🍅', 4],
    ['', 0],
  ])('%j = %i', (s, n) => expect(utf8Bytes(s)).toBe(n));
});

describe('crit. 1: recipeTextBytes sums all text fields', () => {
  for (const c of SIZE_CASES) {
    it(`shared case "${c.name}" = ${c.bytes}`, () => {
      expect(recipeTextBytes(draftOf(c))).toBe(c.bytes);
    });
  }

  it('an empty or missing source and note count 0', () => {
    const base = draftOf({ title: 'abc', ingredients: [{ name: 'Zout' }], steps: ['x'] });
    expect(recipeTextBytes({ ...base, source: '', note: '' })).toBe(8);
    expect(recipeTextBytes({ ...base, source: undefined as unknown as string, note: undefined as unknown as string })).toBe(8);
  });

  it('missing tag/equipment lists count 0', () => {
    const d = draftOf({ title: 'abc', ingredients: [{ name: 'Zout' }], steps: ['x'] });
    delete d.dishTags;
    delete d.traitTags;
    delete d.equipment;
    expect(recipeTextBytes(d)).toBe(8);
  });

  it('leading and trailing spaces do not count (same trim as the database)', () => {
    const d = draftOf({
      title: '  abc  ',
      ingredients: [{ name: ' Zout ', unit: ' g ' }],
      steps: [' x '],
      source: ' é ',
      note: ' € ',
      dishTags: [' Soep '],
      traitTags: [' Snel '],
      equipment: [' Pan '],
    });
    // 3 + 4 + 1 + 1 + 2 + 3 + 4 + 4 + 3
    expect(recipeTextBytes(d)).toBe(25);
  });

  it('completely empty ingredient and step rows do not count (same pruneDraft as saving)', () => {
    const d = draftOf({ title: 'abc', ingredients: [{ name: 'Zout' }], steps: ['x'] });
    d.ingredients = [...d.ingredients, { name: '  ', quantity: '', unit: '' }];
    d.steps = ['x', '   ', ''];
    expect(recipeTextBytes(d)).toBe(8);
  });

  it('numbers do not count: times, servings and quantities', () => {
    const d = draftOf({ title: 'abc', ingredients: [{ name: 'Zout' }], steps: ['x'] });
    const other = { ...d, prepMinutes: '4320', totalMinutes: '4320', servings: '99' };
    other.ingredients = [{ name: 'Zout', quantity: '999999,99', unit: '' }];
    expect(recipeTextBytes(other)).toBe(recipeTextBytes(d));
  });

  it('an ingredient with only a quantity (no name, no unit) still counts only its text: 0 bytes', () => {
    const d = draftOf({ title: 'abc', steps: ['x'] });
    d.ingredients = [{ name: '', quantity: '2', unit: '' }];
    expect(recipeTextBytes(d)).toBe(4);
  });
});

describe('crit. 1: recipeSizeBytes', () => {
  it('is the sum of text and all photos', () => {
    expect(recipeSizeBytes(100, [])).toBe(100);
    expect(recipeSizeBytes(100, [1000, 2000, 3000])).toBe(6100);
    expect(recipeSizeBytes(0, [])).toBe(0);
  });
});

describe('crit. 2: checkRecipeSize boundary', () => {
  it('exactly 2.097.152 is ok', () => {
    expect(checkRecipeSize(LIMIT - 1_000_000, [1_000_000])).toBe('ok');
    expect(checkRecipeSize(1000, [LIMIT - 1000])).toBe('ok');
  });

  it('1 byte more with photos is photosTooLarge', () => {
    expect(checkRecipeSize(1000, [LIMIT - 1000 + 1])).toBe('photosTooLarge');
    expect(checkRecipeSize(LIMIT - 10, [5, 6])).toBe('photosTooLarge');
  });

  it('text alone over the limit is textTooLarge, with or without photos', () => {
    expect(checkRecipeSize(LIMIT + 1, [])).toBe('textTooLarge');
    expect(checkRecipeSize(LIMIT + 1, [100])).toBe('textTooLarge');
  });

  it('text of exactly the limit and no photos is ok; 1 byte of photo on top makes the photos too large', () => {
    expect(checkRecipeSize(LIMIT, [])).toBe('ok');
    expect(checkRecipeSize(LIMIT, [1])).toBe('photosTooLarge');
  });
});

describe('crit. 6: empty or small recipes are never refused by size', () => {
  it('checkRecipeSize(0, []) is ok', () => expect(checkRecipeSize(0, [])).toBe('ok'));

  it('the real maximum text without photos is ok', () => {
    // all R-003/R-008/R-010/R-011/R-015 maxima at 4 bytes per character is about 196.400 bytes
    expect(checkRecipeSize(200_000, [])).toBe('ok');
  });

  it('the real maximum text with three photos of 512.000 is ok', () => {
    expect(checkRecipeSize(200_000, [PHOTO_MAX_BYTES, PHOTO_MAX_BYTES, PHOTO_MAX_BYTES])).toBe('ok');
  });
});

describe('crit. 4: formatRecipeSize', () => {
  it.each([
    [0, '0,0 van 2 MB'],
    [1, '0,1 van 2 MB'], // rounds up
    [1_363_148, '1,3 van 2 MB'], // 1,2999998 MB
    [2_097_152, '2,0 van 2 MB'],
    [2_097_153, '2,1 van 2 MB'],
  ])('%i bytes -> %s', (bytes, text) => expect(formatRecipeSize(bytes)).toBe(text));

  // The brief lists 1.363.149 -> "1,3", but 1.363.149 / 1.048.576 = 1,30000019 and the stated rule is
  // "round up": that is 1,4. The rule wins (it is what makes 2.097.153 -> "2,1"). See T-013-tests.md.
  it('rounds up: just above 1,3 MB shows 1,4', () => {
    expect(formatRecipeSize(1_363_149)).toBe('1,4 van 2 MB');
  });

  it('uses a decimal comma', () => expect(formatRecipeSize(524_288)).toBe('0,5 van 2 MB'));
});

describe('nl.json texts (R-001 crit. 6)', () => {
  const flat = nl as Record<string, string>;
  it('has size.used with the {used} placeholder, and both messages', () => {
    expect(flat['size.used']).toBe('{used} van 2 MB');
    expect(flat['size.photosTooLarge']).toBe("Foto's zijn samen te groot.");
    expect(flat['size.textTooLarge']).toBe('De tekst van het recept is te groot.');
  });
});
