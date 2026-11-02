import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT_MAX_ITEMS,
  EQUIPMENT_NAME_MAX,
  addEquipment,
  equipmentKey,
  toggleEquipment,
  validateEquipmentName,
} from '../../src/lib/equipment';
import { draftFromRecord, emptyDraft, isDirty, pruneDraft, toRow, validateRecipe } from '../../src/lib/recipe';

// T-009 / R-008. The brief fixes names and boundaries, not the exact result shape of validateEquipmentName,
// so "invalid" is read tolerantly: a string, `{ ok: false }`, `{ valid: false }`, `{ error }` or `false`.
function invalid(result: unknown): boolean {
  if (result == null) return false;
  if (typeof result === 'string') return result !== '';
  if (typeof result === 'boolean') return !result;
  const r = result as Record<string, unknown>;
  return r.ok === false || r.valid === false || Boolean(r.error);
}

const chars = (n: number, c = 'a') => c.repeat(n);

describe('validateEquipmentName (R-008 crit. 1: 1-30 characters)', () => {
  it('has the limits 30 and 20', () => {
    expect(EQUIPMENT_NAME_MAX).toBe(30);
    expect(EQUIPMENT_MAX_ITEMS).toBe(20);
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['31 characters', chars(31)],
    ['31 characters with spaces around (trimmed length stays 31)', `  ${chars(31)}  `],
  ])('refuses %s', (_n, name) => {
    expect(invalid(validateEquipmentName(name))).toBe(true);
  });

  it.each([
    ['1 character', 'a'],
    ['30 characters', chars(30)],
    ['30 x "é" (code points, not bytes)', chars(30, 'é')],
    ['30 characters with spaces around (trimmed first)', `  ${chars(30)}  `],
  ])('accepts %s', (_n, name) => {
    expect(invalid(validateEquipmentName(name))).toBe(false);
  });
});

describe('equipmentKey (R-008 crit. 2: case and accent insensitive)', () => {
  it('gives one key for "Oven", "oven" and " OVEN "', () => {
    expect(equipmentKey('oven')).toBe(equipmentKey('Oven'));
    expect(equipmentKey(' OVEN ')).toBe(equipmentKey('Oven'));
  });

  it('ignores accents', () => {
    expect(equipmentKey('Crème-oven')).toBe(equipmentKey('creme-oven'));
  });

  it('keeps different names apart', () => {
    expect(equipmentKey('Oven')).not.toBe(equipmentKey('Ovens'));
  });
});

describe('addEquipment (R-008 crit. 2: reuse an existing item)', () => {
  it('returns the catalogue spelling for a name that exists in another case', () => {
    expect(addEquipment([], ['Thermomix'], 'thermomix')).toEqual(['Thermomix']);
  });

  it('reuses the catalogue spelling for an accent difference', () => {
    expect(addEquipment([], ['Airfryer'], 'airfrýer')).toEqual(['Airfryer']);
  });

  it('does not add a second one when it is already selected', () => {
    const selected = ['Thermomix'];
    expect(addEquipment(selected, ['Thermomix'], 'THERMOMIX')).toEqual(['Thermomix']);
  });

  it('adds an unknown name trimmed, after the selected ones', () => {
    expect(addEquipment(['Oven'], ['Oven'], '  Sous-vide ')).toEqual(['Oven', 'Sous-vide']);
  });

  it('does not change its input', () => {
    const selected = ['Oven'];
    addEquipment(selected, [], 'Wok');
    expect(selected).toEqual(['Oven']);
  });
});

describe('toggleEquipment (R-008 crit. 2: tap selects, tap again deselects)', () => {
  it('adds a name that is not selected', () => {
    expect(toggleEquipment(['Oven'], 'Wok')).toEqual(['Oven', 'Wok']);
  });

  it('removes a name that is selected', () => {
    expect(toggleEquipment(['Oven', 'Wok'], 'Oven')).toEqual(['Wok']);
  });

  it('does not change its input', () => {
    const selected = ['Oven'];
    toggleEquipment(selected, 'Oven');
    expect(selected).toEqual(['Oven']);
  });
});

describe('equipment in validateRecipe, toRow, draftFromRecord, emptyDraft, pruneDraft (R-008 crit. 1)', () => {
  const draft = (equipment: string[]) => ({
    title: 'Soep',
    prepMinutes: '10',
    totalMinutes: '20',
    servings: '4',
    source: '',
    note: '',
    equipment,
    ingredients: [{ name: 'Water', quantity: '', unit: '' }],
    steps: ['Kook het water.'],
  });
  const stored = {
    title: 'Soep',
    ingredients: [{ name: 'Water' }],
    steps: ['Kook.'],
    prep_minutes: 1,
    total_minutes: 2,
    servings: 4,
  };

  it('zero items is fine (equipment is optional)', () => {
    const result = validateRecipe(draft([]) as never);
    expect(result.ok).toBe(true);
    expect((result.errors as { equipment?: string }).equipment).toBeUndefined();
  });

  it('20 items is fine, 21 gives equipmentTooMany', () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `Item ${i}`);
    expect(validateRecipe(draft(names(EQUIPMENT_MAX_ITEMS)) as never).ok).toBe(true);
    const over = validateRecipe(draft(names(EQUIPMENT_MAX_ITEMS + 1)) as never);
    expect(over.ok).toBe(false);
    expect((over.errors as { equipment?: string }).equipment).toBe('equipmentTooMany');
  });

  it('toRow writes the trimmed names', () => {
    const row = toRow(draft(['  Oven ', 'Wok']) as never) as unknown as { equipment: string[] };
    expect(row.equipment).toEqual(['Oven', 'Wok']);
  });

  it('draftFromRecord takes over the stored names', () => {
    const d = draftFromRecord({ ...stored, equipment: ['Oven', 'Wok'] } as never) as unknown as { equipment: string[] };
    expect(d.equipment).toEqual(['Oven', 'Wok']);
  });

  it('draftFromRecord gives [] for an old row without the column, so a fresh edit form is not dirty', () => {
    const d = draftFromRecord(stored as never) as unknown as { equipment: string[] };
    expect(d.equipment).toEqual([]);
    expect(isDirty(d as never, draftFromRecord(stored as never))).toBe(false);
  });

  it('emptyDraft has no equipment', () => {
    expect((emptyDraft() as unknown as { equipment: string[] }).equipment).toEqual([]);
  });

  it('pruneDraft keeps the equipment (else the form silently saves without it)', () => {
    const pruned = pruneDraft(draft(['Oven']) as never).draft as unknown as { equipment: string[] };
    expect(pruned.equipment).toEqual(['Oven']);
  });

  it('isDirty is true after adding or removing an item (R-003 crit. 8: leaving asks to discard)', () => {
    expect(isDirty(draft(['Oven']) as never, draft(['Oven', 'Wok']) as never)).toBe(true);
    expect(isDirty(draft(['Oven']) as never, draft([]) as never)).toBe(true);
  });
});
