import { describe, expect, it, vi } from 'vitest';
import {
  applyEquipmentFilter,
  hasEquipmentFilter,
  parseEquipmentFilter,
  toSearchParams,
} from '../../src/lib/equipmentFilter';

// T-009 / R-008 crit. 4: "at least one of the chosen items"; no choice, no filter. URL parameter `gerief`, repeated.
// The filter is a plain list of canonical names (string[]), like the brief's examples.
const parse = (query: string) => parseEquipmentFilter(new URLSearchParams(query));

describe('parseEquipmentFilter (R-008 crit. 4)', () => {
  it('reads repeated parameters in order', () => {
    expect(parse('gerief=Oven&gerief=Wok')).toEqual(['Oven', 'Wok']);
  });

  it('leaves out empty values', () => {
    expect(parse('gerief=&gerief=Oven&gerief=')).toEqual(['Oven']);
  });

  it('removes duplicates', () => {
    expect(parse('gerief=Oven&gerief=Wok&gerief=Oven')).toEqual(['Oven', 'Wok']);
  });

  it('no parameter means no filter', () => {
    expect(parse('')).toEqual([]);
    expect(parse('prep=30')).toEqual([]);
  });
});

describe('toSearchParams (R-008 crit. 4)', () => {
  it('writes the names back as repeated parameters', () => {
    expect(toSearchParams(['Oven', 'Wok']).getAll('gerief')).toEqual(['Oven', 'Wok']);
  });

  it('keeps other parameters (prep, totaal) and replaces old gerief values', () => {
    const base = new URLSearchParams('prep=30&gerief=Oud&totaal=60');
    const out = toSearchParams(['Wok'], base);
    expect(out.get('prep')).toBe('30');
    expect(out.get('totaal')).toBe('60');
    expect(out.getAll('gerief')).toEqual(['Wok']);
  });

  it('an empty choice removes the parameter', () => {
    expect(toSearchParams([], new URLSearchParams('gerief=Oven&prep=15')).has('gerief')).toBe(false);
  });

  it('round-trips names with spaces, accents and ampersands', () => {
    const names = ['Crème brûlée-brander', 'A&B oven'];
    expect(parse(toSearchParams(names).toString())).toEqual(names);
  });

  it('does not change the base params', () => {
    const base = new URLSearchParams('gerief=Oven');
    toSearchParams([], base);
    expect(base.getAll('gerief')).toEqual(['Oven']);
  });
});

describe('hasEquipmentFilter', () => {
  it('is false without a choice and true with one', () => {
    expect(hasEquipmentFilter([])).toBe(false);
    expect(hasEquipmentFilter(['Oven'])).toBe(true);
  });
});

describe('applyEquipmentFilter (R-008 crit. 4: "at least one" = overlaps)', () => {
  it('calls nothing for an empty choice and returns the query as is', () => {
    const query = { overlaps: vi.fn() };
    expect(applyEquipmentFilter(query, [])).toBe(query);
    expect(query.overlaps).not.toHaveBeenCalled();
  });

  it('calls overlaps once on the equipment column with the names', () => {
    const next = { overlaps: vi.fn() };
    const query = { overlaps: vi.fn().mockReturnValue(next) };
    const result = applyEquipmentFilter(query, ['Oven', 'Wok']);
    expect(query.overlaps).toHaveBeenCalledTimes(1);
    expect(query.overlaps).toHaveBeenCalledWith('equipment', ['Oven', 'Wok']);
    expect(result).toBe(next);
  });
});
