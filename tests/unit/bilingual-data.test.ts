import { describe, expect, it } from 'vitest';
import { addEquipment, shownName as shownEquipment, sortByShownName as sortEquipment } from '../../src/lib/equipment';
import { addTag, shownName, sortByShownName } from '../../src/lib/tags';
import { parseTagFilter } from '../../src/lib/tagFilter';
import { parseEquipmentFilter } from '../../src/lib/equipmentFilter';

// T-023 / R-024: tags and equipment have a Dutch (canonical) and an optional French name.
const soup = { name: 'soep', nameFr: 'soupe' };
const side = { name: 'bijgerecht', nameFr: 'accompagnement' };
const dessert = { name: 'dessert', nameFr: 'dessert' };
const custom = { name: 'Fondue', nameFr: null };

describe('shownName (R-024 crit. 2 and 4)', () => {
  it('gives the French name in fr and the Dutch name in nl', () => {
    expect(shownName(soup, 'fr')).toBe('soupe');
    expect(shownName(soup, 'nl')).toBe('soep');
    expect(shownEquipment({ name: 'oven', nameFr: 'four' }, 'fr')).toBe('four');
  });

  it('crit. 4: an item with one name shows that name in both languages', () => {
    expect(shownName(custom, 'fr')).toBe('Fondue');
    expect(shownName(custom, 'nl')).toBe('Fondue');
  });
});

describe('addTag / addEquipment find an item by either name (R-024 crit. 6)', () => {
  it('"soupe" (French, any case or accent) gives the canonical "soep"', () => {
    expect(addTag([], [soup, dessert], 'soupe')).toEqual(['soep']);
    expect(addTag([], [soup], '  SOUPE ')).toEqual(['soep']);
  });

  it('does not add a second entry when the canonical name is already selected', () => {
    expect(addTag(['soep'], [soup], 'soupe')).toEqual(['soep']);
  });

  it('an accented French name matches without accents', () => {
    expect(addTag([], [{ name: 'vegetarisch', nameFr: 'végétarien' }], 'vegetarien')).toEqual(['vegetarisch']);
  });

  it('equipment: "micro-ondes" gives "microgolfoven"', () => {
    expect(addEquipment([], [{ name: 'microgolfoven', nameFr: 'micro-ondes' }], 'Micro-Ondes')).toEqual(['microgolfoven']);
  });

  it('an unknown name is added trimmed', () => {
    expect(addTag(['soep'], [soup], ' Fondue ')).toEqual(['soep', 'Fondue']);
  });
});

describe('sorting follows the shown name (R-024 crit. 7)', () => {
  it('tags: "accompagnement" before "dessert" in fr; "bijgerecht" before "dessert" in nl', () => {
    const fr = sortByShownName([dessert, side], 'fr').map((i) => shownName(i, 'fr'));
    expect(fr).toEqual(['accompagnement', 'dessert']);
    const nl = sortByShownName([dessert, side], 'nl').map((i) => shownName(i, 'nl'));
    expect(nl).toEqual(['bijgerecht', 'dessert']);
  });

  it('equipment: "four" before "mijoteuse" in fr (slowcooker sorts after oven in nl)', () => {
    const oven = { name: 'oven', nameFr: 'four' };
    const slow = { name: 'slowcooker', nameFr: 'mijoteuse' };
    expect(sortEquipment([slow, oven], 'fr').map((i) => i.name)).toEqual(['oven', 'slowcooker']);
    expect(sortEquipment([slow, oven], 'nl').map((i) => i.name)).toEqual(['oven', 'slowcooker']);
  });

  it('equipment: order flips with the language ("kookplaat" < "oven" in nl, "four" < "plaque de cuisson" in fr)', () => {
    const hob = { name: 'kookplaat', nameFr: 'plaque de cuisson' };
    const oven = { name: 'oven', nameFr: 'four' };
    expect(sortEquipment([oven, hob], 'nl').map((i) => i.name)).toEqual(['kookplaat', 'oven']);
    expect(sortEquipment([hob, oven], 'fr').map((i) => i.name)).toEqual(['oven', 'kookplaat']);
  });

  it('ignores accents and case like a Belgian reader expects, and does not change the input', () => {
    const input = [
      { name: 'x1', nameFr: 'été' },
      { name: 'x2', nameFr: 'Eau' },
      { name: 'x3', nameFr: 'fête' },
    ];
    const copy = structuredClone(input);
    expect(sortByShownName(input, 'fr').map((i) => i.nameFr)).toEqual(['Eau', 'été', 'fête']);
    expect(input).toEqual(copy);
  });
});

describe('filter URLs keep the canonical name (R-024 crit. 5)', () => {
  it('?soort=soep gives the same selection whatever the language', () => {
    const params = new URLSearchParams('soort=soep&gerief=oven');
    expect(parseTagFilter(params).dish).toEqual(['soep']);
    expect(parseEquipmentFilter(params)).toEqual(['oven']);
  });
});
