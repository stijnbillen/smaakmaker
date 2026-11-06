import { describe, expect, it } from 'vitest';
import { draftFromRecord, toRow, type RecipeRecord } from '../../src/lib/recipe';
import { variantDraft } from '../../src/lib/variant';

// T-019 / R-018 crit. 6: a link to the catalogue survives an edit as long as the key of the text is the same.
const ING = '11111111-1111-4111-8111-111111111111';
const UNIT = '22222222-2222-4222-8222-222222222222';

const record = {
  id: 'r1',
  authorId: 'u',
  authorName: 'A',
  createdAt: '2026-01-01T00:00:00Z',
  title: 'Gekoppeld',
  ingredients: [
    { name: 'Brocolli', quantity: 200, unit: 'G', ingredient_id: ING, unit_id: UNIT },
    { name: 'Water', quantity: 1 },
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

const saved = (draft: ReturnType<typeof draftFromRecord>) => toRow(draft).ingredients as unknown as Array<Record<string, unknown>>;

describe('linked ingredient lines in the form (crit. 6)', () => {
  it('saving without touching the name keeps both links and the text', () => {
    const rows = saved(draftFromRecord(record));
    expect(rows[0]).toEqual({ name: 'Brocolli', quantity: 200, unit: 'G', ingredient_id: ING, unit_id: UNIT });
    expect(rows[1]).toEqual({ name: 'Water', quantity: 1 });
  });

  it('keeps the links when only the quantity changes', () => {
    const d = draftFromRecord(record);
    d.ingredients[0] = { ...d.ingredients[0], quantity: '300' };
    expect(saved(d)[0]).toMatchObject({ quantity: 300, ingredient_id: ING, unit_id: UNIT });
  });

  it('keeps the links when the name changes only in case or spacing (same key)', () => {
    const d = draftFromRecord(record);
    d.ingredients[0] = { ...d.ingredients[0], name: '  BROCOLLI ', unit: ' g ' };
    expect(saved(d)[0]).toMatchObject({ name: 'BROCOLLI', unit: 'g', ingredient_id: ING, unit_id: UNIT });
  });

  it('drops the ingredient link when the name gets another key, and keeps the unit link', () => {
    const d = draftFromRecord(record);
    d.ingredients[0] = { ...d.ingredients[0], name: 'Bloemkool' };
    const row = saved(d)[0];
    expect(row.name).toBe('Bloemkool');
    expect(row.ingredient_id).toBeUndefined();
    expect(row.unit_id).toBe(UNIT);
  });

  it('drops the unit link when the unit gets another key, and keeps the ingredient link', () => {
    const d = draftFromRecord(record);
    d.ingredients[0] = { ...d.ingredients[0], unit: 'kg' };
    const row = saved(d)[0];
    expect(row.unit).toBe('kg');
    expect(row.unit_id).toBeUndefined();
    expect(row.ingredient_id).toBe(ING);
  });

  it('does not invent links for lines that had none', () => {
    const row = saved(draftFromRecord(record))[1];
    expect(row).not.toHaveProperty('ingredient_id');
    expect(row).not.toHaveProperty('unit_id');
  });

  it('does not carry a link over to another line when lines are removed or reordered', () => {
    const d = draftFromRecord(record);
    d.ingredients = [d.ingredients[1], d.ingredients[0]];
    const rows = saved(d);
    expect(rows[0]).toEqual({ name: 'Water', quantity: 1 });
    expect(rows[1]).toMatchObject({ ingredient_id: ING, unit_id: UNIT });
  });

  it('a variant draft takes the links over', () => {
    const rows = saved(variantDraft(record, new Map()));
    expect(rows[0]).toMatchObject({ name: 'Brocolli', ingredient_id: ING, unit_id: UNIT });
  });
});
