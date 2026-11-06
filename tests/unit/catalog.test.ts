import { describe, expect, it } from 'vitest';
import { itemKey } from '../../src/lib/catalog';

// T-019 / R-018 crit. 1: the key is lower case, without accents, with superfluous spaces removed.
describe('itemKey (R-018 key)', () => {
  it.each([
    ['Crème  Fraîche', 'creme fraiche'],
    ['  Broccoli ', 'broccoli'],
    ['BROCCOLI', 'broccoli'],
    ['Pomme   de\tterre', 'pomme de terre'],
    ['', ''],
    ['   ', ''],
  ])('%j -> %j', (input, expected) => {
    expect(itemKey(input)).toBe(expected);
  });

  it('is idempotent', () => {
    const once = itemKey('  Crème  Fraîche ');
    expect(itemKey(once)).toBe(once);
  });

  it('gives one key for spellings that differ only in case, accents and spacing (crit. 2 premise)', () => {
    expect(itemKey('Crème Brûlée')).toBe(itemKey('creme  brulee'));
  });
});
