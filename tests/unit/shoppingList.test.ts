import { afterEach, describe, expect, it } from 'vitest';
import nlJson from '../../src/i18n/nl.json' with { type: 'json' };
import type { CatalogItem } from '../../src/lib/catalog';
import type { Ingredient } from '../../src/lib/recipe';
import {
  arrangeList,
  buildShoppingList,
  formatMeasured,
  parseCustomItem,
  shoppingText,
  type MenuSource,
  type UnitInfo,
} from '../../src/lib/shoppingList';
import { resetLanguage, useLanguage } from '../helpers/language';

// T-034 / R-032: the pure shopping-list logic. Assumed shapes (see docs/taken/T-034-tests.md):
//   buildShoppingList(sources, catalog: Map<id, CatalogItem> (ingredients AND units), units: Map<unitId, UnitInfo>, lang)
//   arrangeList(lines, items: {id,text,bought}[], marks: Map<lineKey, 'bought' | 'have'>) -> { toBuy, bought, have } (entries have .text)
//   parseCustomItem(text) -> { ok: true, value } | { ok: false }
const nl = nlJson as Record<string, string>;

afterEach(() => resetLanguage());

const item = (id: string, nameNl: string, nameFr: string | null = null): CatalogItem => ({ id, nameNl, nameFr });
const catalog = new Map<string, CatalogItem>(
  [
    item('i-meel', 'meel', 'farine'),
    item('i-gist', 'gist', 'levure'),
    item('i-olie', 'olie', 'huile'),
    item('i-look', 'look', 'ail'),
    item('i-aardappel', 'aardappel', 'pomme de terre'),
    item('i-ui', 'ui', 'oignon'),
    item('i-zout', 'zout', 'sel'),
    item('u-g', 'g'),
    item('u-kg', 'kg'),
    item('u-el', 'el'),
    item('u-dl', 'dl'),
    item('u-pond', 'pond'),
    item('u-teentje', 'teentje'),
    item('u-stuk', 'stuk'),
  ].map((i) => [i.id, i]),
);
const units = new Map<string, UnitInfo>([
  ['u-g', { measure: 'weight', factor: 1 }],
  ['u-kg', { measure: 'weight', factor: 1000 }],
  ['u-pond', { measure: 'weight', factor: 500 }],
  ['u-el', { measure: 'volume', factor: 15 }],
  ['u-dl', { measure: 'volume', factor: 100 }],
  ['u-teentje', { measure: 'none', factor: null }],
  ['u-stuk', { measure: 'none', factor: null }],
] as [string, UnitInfo][]);

let n = 0;
const source = (ingredients: Ingredient[], menuServings = 1, recipeServings: number | null = 1): MenuSource => ({
  recipeId: `r${++n}`,
  menuServings,
  recipeServings,
  ingredients,
});
const ing = (id: string, quantity: number | undefined, unitId?: string, extra: Partial<Ingredient> = {}): Ingredient => ({
  name: catalog.get(id)?.nameNl ?? id,
  ...(quantity === undefined ? {} : { quantity }),
  ingredient_id: id,
  ...(unitId ? { unit_id: unitId, unit: catalog.get(unitId)?.nameNl ?? undefined } : {}),
  ...extra,
});
const free = (name: string, quantity?: number, unit?: string): Ingredient => ({
  name,
  ...(quantity === undefined ? {} : { quantity }),
  ...(unit ? { unit } : {}),
});
const texts = (s: MenuSource[], lang: 'nl' | 'fr' = 'nl') => buildShoppingList(s, catalog, units, lang).map((l) => l.text);

describe('crit. 1: scaling without rounding before the sum', () => {
  it('300 g meel for 4 servings, menu 2 -> "150 g meel"', () => {
    expect(texts([source([ing('i-meel', 300, 'u-g')], 2, 4)])).toEqual(['150 g meel']);
  });

  it('three recipes of 3 servings with 1 g gist at 1 portion each add up to "1 g gist", not "0,99 g"', () => {
    const s = [1, 2, 3].map(() => source([ing('i-gist', 1, 'u-g')], 1, 3));
    expect(texts(s)).toEqual(['1 g gist']);
  });

  it('a recipe without servings (null) counts as 1 portion', () => {
    expect(texts([source([ing('i-meel', 200, 'u-g')], 2, null)])).toEqual(['400 g meel']);
  });
});

describe('crit. 2: weight and volume are added through the factor', () => {
  it('200 g + 1 kg meel -> "1,2 kg meel"', () => {
    expect(texts([source([ing('i-meel', 200, 'u-g')]), source([ing('i-meel', 1, 'u-kg')])])).toEqual(['1,2 kg meel']);
  });

  it('2 el + 1 dl olie -> "130 ml olie"', () => {
    expect(texts([source([ing('i-olie', 2, 'u-el')]), source([ing('i-olie', 1, 'u-dl')])])).toEqual(['130 ml olie']);
  });

  it('a user unit "pond" (weight, factor 500) counts: 1 pond + 200 g -> "700 g"', () => {
    expect(texts([source([ing('i-meel', 1, 'u-pond')]), source([ing('i-meel', 200, 'u-g')])])).toEqual(['700 g meel']);
  });
});

describe('crit. 3: no density; kind "none" only adds the same unit', () => {
  it('200 g meel + 2 el meel stay two lines: "200 g meel" and "30 ml meel"', () => {
    const t = texts([source([ing('i-meel', 200, 'u-g'), ing('i-meel', 2, 'u-el')])]);
    expect([...t].sort()).toEqual(['200 g meel', '30 ml meel']);
  });

  it('2 teentjes + 1 teentje look -> "3 teentje look"; 1 stuk look stays apart', () => {
    expect(texts([source([ing('i-look', 2, 'u-teentje')]), source([ing('i-look', 1, 'u-teentje')])])).toEqual(['3 teentje look']);
    const two = texts([source([ing('i-look', 1, 'u-stuk'), ing('i-look', 1, 'u-teentje')])]);
    expect(two).toHaveLength(2);
  });

  it('a unit without unit_id has no kind: free "g" is not added to "kg" from the database, but to another free "g"', () => {
    const apart = texts([source([ing('i-meel', 200, undefined, { unit: 'g' })]), source([ing('i-meel', 1, 'u-kg')])]);
    expect(apart).toHaveLength(2);
    const together = texts([source([ing('i-meel', 200, undefined, { unit: 'g' })]), source([ing('i-meel', 100, undefined, { unit: 'g' })])]);
    expect(together).toEqual(['300 g meel']);
  });
});

describe('crit. 4: formatMeasured', () => {
  it.each([
    [1200, 'weight', '1,2 kg'],
    [500, 'weight', '500 g'],
    [999, 'weight', '999 g'],
    [999.999, 'weight', '1 kg'],
    [1000, 'weight', '1 kg'],
    [1000, 'volume', '1 l'],
    [130, 'volume', '130 ml'],
    [1234.567, 'weight', '1,23 kg'],
  ] as const)('%s (%s) -> %s', (value, kind, expected) => {
    expect(formatMeasured(value, kind)).toBe(expected);
  });

  it('0,004 g is shown as the "below minimum" text, never as "0 g"', () => {
    const shown = formatMeasured(0.004, 'weight');
    expect(shown).not.toMatch(/^0(,0+)? ?g$/);
    expect(shown.startsWith(nl['servings.belowMinimum'].split('{')[0].trim())).toBe(true);
  });
});

describe('crit. 5: size and lines without a quantity', () => {
  it('2 large + 1 small potato are two lines; 2 large + 1 large -> "3 aardappel (groot)"', () => {
    const apart = texts([source([ing('i-aardappel', 2, undefined, { size: 'large' }), ing('i-aardappel', 1, undefined, { size: 'small' })])]);
    expect(apart).toHaveLength(2);
    expect(texts([source([ing('i-aardappel', 2, undefined, { size: 'large' })]), source([ing('i-aardappel', 1, undefined, { size: 'large' })])])).toEqual([
      '3 aardappel (groot)',
    ]);
  });

  it('"zout" without quantity in three recipes is one line; with "5 g zout" it is two', () => {
    const three = texts([1, 2, 3].map(() => source([ing('i-zout', undefined)])));
    expect(three).toEqual(['zout']);
    const two = texts([source([ing('i-zout', undefined)]), source([ing('i-zout', 5, 'u-g')])]);
    expect([...two].sort()).toEqual(['5 g zout', 'zout']);
  });
});

describe('crit. 6: free text', () => {
  it('"Crème fraîche 1 pot" + "creme fraiche 2 pot" -> one line with 3, word of the first line', () => {
    const t = texts([source([free('Crème fraîche', 1, 'pot')]), source([free('creme fraiche', 2, 'pot')])]);
    expect(t).toEqual(['3 pot Crème fraîche']);
  });

  it('a different unit stays a separate line', () => {
    expect(texts([source([free('boter', 1, 'pot'), free('boter', 1, 'klontje')])])).toHaveLength(2);
  });

  it('"meel" from the database (200 g) and free "meel" (100 g) stay two lines', () => {
    expect(texts([source([ing('i-meel', 200, 'u-g'), free('meel', 100, 'g')])])).toHaveLength(2);
  });
});

describe('crit. 7: names in the interface language, sorted', () => {
  it('fr shows "pomme de terre" for the potato', () => {
    expect(texts([source([ing('i-aardappel', 2, 'u-stuk')])], 'fr')[0]).toContain('pomme de terre');
  });

  it('sorts like Intl.Collator(lang, base): "Échalote" between "ail" and "oignon"', () => {
    const s = [source([free('oignon'), free('Échalote'), free('ail')])];
    useLanguage('fr');
    const t = texts(s, 'fr');
    expect(t).toEqual(['ail', 'Échalote', 'oignon']);
    const c = new Intl.Collator('fr', { sensitivity: 'base' });
    expect([...t].sort(c.compare)).toEqual(t);
  });

  it('the same list: nl has "aardappel" before "ui", fr has "oignon" before "pomme de terre"', () => {
    const s = [source([ing('i-ui', 1, 'u-stuk'), ing('i-aardappel', 1, 'u-stuk')])];
    const nlT = texts(s, 'nl');
    expect(nlT.findIndex((x) => x.includes('aardappel'))).toBeLessThan(nlT.findIndex((x) => x.includes('ui')));
    const frT = texts(s, 'fr');
    expect(frT.findIndex((x) => x.includes('oignon'))).toBeLessThan(frT.findIndex((x) => x.includes('pomme de terre')));
  });
});

describe('crit. 8/10: line keys are per line and stable', () => {
  const keys = (s: MenuSource[], lang: 'nl' | 'fr' = 'nl') => buildShoppingList(s, catalog, units, lang).map((l) => l.key);

  it('200 g meel and 30 ml meel have their own keys; so do large and small potatoes', () => {
    const k = keys([source([ing('i-meel', 200, 'u-g'), ing('i-meel', 2, 'u-el')])]);
    expect(new Set(k).size).toBe(2);
    const k2 = keys([source([ing('i-aardappel', 2, undefined, { size: 'large' }), ing('i-aardappel', 1, undefined, { size: 'small' })])]);
    expect(new Set(k2).size).toBe(2);
  });

  it('the key does not change with the quantity, the menu servings or the language', () => {
    const base = keys([source([ing('i-meel', 200, 'u-g')], 2, 4)]);
    expect(keys([source([ing('i-meel', 900, 'u-g')], 6, 4)])).toEqual(base);
    expect(keys([source([ing('i-meel', 200, 'u-g')], 2, 4)], 'fr')).toEqual(base);
    // g and kg of the same ingredient are one line, so the key is the same as for g alone
    expect(keys([source([ing('i-meel', 1, 'u-kg')])])).toEqual(base);
  });
});

describe('crit. 11: parseCustomItem', () => {
  it('trims: "  melk  " -> "melk"', () => {
    const r = parseCustomItem('  melk  ');
    expect(r.ok).toBe(true);
    expect(r.ok && r.value).toBe('melk');
  });

  it('empty and blank are errors', () => {
    expect(parseCustomItem('').ok).toBe(false);
    expect(parseCustomItem('   ').ok).toBe(false);
  });

  it('80 code points are fine, 81 are not (emoji count as one)', () => {
    expect(parseCustomItem('a'.repeat(80)).ok).toBe(true);
    expect(parseCustomItem('a'.repeat(81)).ok).toBe(false);
    expect(parseCustomItem('😀'.repeat(80)).ok).toBe(true);
    expect(parseCustomItem('😀'.repeat(81)).ok).toBe(false);
  });
});

describe('crit. 9/12: arrangeList and shoppingText', () => {
  it('copies exactly the open lines, in screen order, with custom items; bought and "have" are left out', () => {
    const lines = buildShoppingList(
      [source([ing('i-meel', 200, 'u-g'), ing('i-olie', 2, 'u-el'), ing('i-ui', 1, 'u-stuk'), ing('i-zout', undefined)])],
      catalog,
      units,
      'nl',
    );
    const keyOf = (part: string) => lines.find((l) => l.text.includes(part))!.key;
    const marks = new Map<string, 'bought' | 'have'>([
      [keyOf('meel'), 'bought'],
      [keyOf('zout'), 'have'],
    ]);
    const arranged = arrangeList(lines, [{ id: 'c1', text: 'melk', bought: false }], marks);
    expect(arranged.bought.map((l) => l.text)).toEqual(['200 g meel']);
    expect(arranged.have.map((l) => l.text)).toEqual(['zout']);
    expect(arranged.toBuy.map((l) => l.text)).toEqual(['melk', '30 ml olie', '1 stuk ui']);
    expect(shoppingText(arranged.toBuy)).toBe('melk\n30 ml olie\n1 stuk ui');
  });

  it('"bought" and "have" are exclusive: a key has one state, so a line is in one group only', () => {
    const lines = buildShoppingList([source([ing('i-meel', 200, 'u-g')])], catalog, units, 'nl');
    const a = arrangeList(lines, [], new Map([[lines[0].key, 'have' as const]]));
    expect(a.toBuy).toHaveLength(0);
    expect(a.bought).toHaveLength(0);
    expect(a.have).toHaveLength(1);
  });

  it('marks of lines that no longer exist change nothing', () => {
    const lines = buildShoppingList([source([ing('i-meel', 200, 'u-g')])], catalog, units, 'nl');
    const a = arrangeList(lines, [], new Map([['i:gone|m:weight|s:-|q:1', 'bought' as const]]));
    expect(a.toBuy).toHaveLength(1);
    expect(a.bought).toHaveLength(0);
  });

  it('a bought custom item goes to the bought group', () => {
    const a = arrangeList([], [{ id: 'c1', text: 'melk', bought: true }], new Map());
    expect(a.bought.map((l) => l.text)).toEqual(['melk']);
    expect(a.toBuy).toHaveLength(0);
  });
});
