// Pure logic of the shopping list (R-032). No Supabase import, so unit tests load it without environment variables.
// The list is computed from the week menu every time; only marks and own items are stored.

import { getLanguage } from '../i18n/language';
import { tIn } from '../i18n/t';
import { displayName, itemKey, type CatalogItem, type CatalogLang } from './catalog';
import { formatQuantity, type Ingredient, type IngredientSize } from './recipe';
import type { UnitMeasure } from './unitMeasure';

export const CUSTOM_ITEM_MAX = 80;
export const CUSTOM_ITEMS_LIMIT = 100;

/** One dish of the menu with what the list needs from its recipe. */
export interface MenuSource {
  recipeId: string;
  menuServings: number;
  /** Null for old recipes without servings: counts as 1, like the detail page. */
  recipeServings: number | null;
  ingredients: Ingredient[];
}

/** Kind and factor of a unit (to ml or g); the factor is null for kind `none`. */
export interface UnitInfo {
  measure: UnitMeasure;
  factor: number | null;
}

export interface ShoppingLine {
  /** Language-independent identity of the line; marks are stored under it. Does not contain the quantity. */
  key: string;
  text: string;
  /** The name alone, for sorting. */
  sortName: string;
  hasQuantity: boolean;
}

export type MarkState = 'bought' | 'have';

export interface CustomItem {
  id: string;
  text: string;
  bought: boolean;
}

/** A line as the screen shows it: computed lines and own items in one shape. */
export interface ArrangedLine {
  key: string;
  text: string;
  sortName: string;
  /** Set for an own item. */
  itemId?: string;
}

const SIZE_SHOWN = { small: 'recipe.sizeSmall', medium: 'recipe.sizeMedium', large: 'recipe.sizeLarge' } as const;

/**
 * Key of a line: the ingredient (database id, or the folded text for free text), the kind, the unit (only
 * for kind none), the size, and whether there is a quantity. No quantity and no language, so a vote stays
 * when the amount or the language changes.
 */
export function lineKey(parts: {
  ingredient: string;
  measure: UnitMeasure | 'none';
  unit: string;
  size: IngredientSize | undefined;
  hasQuantity: boolean;
}): string {
  const unit = parts.measure === 'none' ? `|u:${parts.unit}` : '';
  return `${parts.ingredient}|m:${parts.measure}${unit}|s:${parts.size ?? '-'}|q:${parts.hasQuantity ? 1 : 0}`;
}

/**
 * The grouping value of one ingredient line: the kind decides what may be added. Only an ingredient from
 * the database with a unit from the database that has a kind weight or volume is converted; everything else
 * is added only to the same unit.
 */
interface Group {
  key: string;
  /** Sum in g / ml for weight and volume, otherwise in the unit itself. */
  total: number;
  hasQuantity: boolean;
  measure: UnitMeasure;
  name: string;
  unit: string;
  size: IngredientSize | undefined;
}

/** Builds the lines of the list, already sorted. The sums are made before anything is rounded. */
export function buildShoppingList(
  sources: readonly MenuSource[],
  catalog: ReadonlyMap<string, CatalogItem>,
  units: ReadonlyMap<string, UnitInfo>,
  lang: CatalogLang,
): ShoppingLine[] {
  const groups = new Map<string, Group>();

  for (const source of sources) {
    const scale = source.menuServings / (source.recipeServings ?? 1);
    for (const ing of source.ingredients) {
      const item = ing.ingredient_id ? catalog.get(ing.ingredient_id) : undefined;
      const name = (item ? displayName(item, lang) : '') || ing.name;
      const unitItem = ing.unit_id ? catalog.get(ing.unit_id) : undefined;
      const unitName = (unitItem ? displayName(unitItem, lang) : '') || ing.unit || '';
      const hasQuantity = ing.quantity !== undefined;
      const info = ing.unit_id ? units.get(ing.unit_id) : undefined;
      // Conversion only for database ingredients; free text is added per unit as it is (crit. 2, 6).
      const converts = hasQuantity && !!ing.ingredient_id && !!info && info.measure !== 'none' && !!info.factor;
      const measure: UnitMeasure = converts ? info!.measure : 'none';
      const unitPart = ing.unit_id ? ing.unit_id : ing.unit ? `t:${itemKey(ing.unit)}` : '';
      const key = lineKey({
        ingredient: ing.ingredient_id ? `i:${ing.ingredient_id}` : `t:${itemKey(ing.name)}`,
        measure,
        // A line without quantity ignores its unit: "zout" is one line whatever its unit.
        unit: hasQuantity ? unitPart : '',
        size: ing.size,
        hasQuantity,
      });
      const amount = hasQuantity ? ing.quantity! * scale * (converts ? info!.factor! : 1) : 0;
      const group = groups.get(key);
      if (group) {
        group.total += amount;
      } else {
        groups.set(key, { key, total: amount, hasQuantity, measure, name, unit: hasQuantity ? unitName : '', size: ing.size });
      }
    }
  }

  const lines = [...groups.values()].map((g): ShoppingLine => {
    const size = g.size ? `(${tIn(lang, SIZE_SHOWN[g.size])})` : '';
    let amount = '';
    if (g.hasQuantity) {
      amount =
        g.measure === 'none'
          ? [quantityText(g.total, lang), g.unit].filter(Boolean).join(' ')
          : formatMeasured(g.total, g.measure === 'weight' ? 'weight' : 'volume', lang);
    }
    return {
      key: g.key,
      text: [amount, g.name, size].filter(Boolean).join(' '),
      sortName: g.name,
      hasQuantity: g.hasQuantity,
    };
  });
  return sortLines(lines, lang);
}

const collators = new Map<string, Intl.Collator>();
function collator(lang: CatalogLang): Intl.Collator {
  let c = collators.get(lang);
  if (!c) {
    c = new Intl.Collator(lang, { sensitivity: 'base' });
    collators.set(lang, c);
  }
  return c;
}

/** Sorted copy by name, then text, in the reader's language without difference in case or accents. */
export function sortLines<T extends { sortName: string; text: string }>(lines: readonly T[], lang: CatalogLang): T[] {
  const c = collator(lang);
  return [...lines].sort((a, b) => c.compare(a.sortName, b.sortName) || c.compare(a.text, b.text));
}

/** A plain quantity of a unit of kind none; what rounds to 0 reads "below the smallest amount". */
function quantityText(value: number, lang: CatalogLang): string {
  const rounded = Number(value.toFixed(2));
  return rounded > 0 ? formatQuantity(rounded) : tIn(lang, 'servings.belowMinimum').replace('{q}', formatQuantity(0.01));
}

/**
 * Weight (from grams) or volume (from ml) in the biggest unit for which the number is at least 1: g / kg and
 * ml / l, at most two decimals. The unit is chosen after rounding, so 999,999 g is "1 kg" and not "1000 g".
 */
export function formatMeasured(value: number, kind: 'weight' | 'volume', lang: CatalogLang = getLanguage()): string {
  const small = tIn(lang, kind === 'weight' ? 'shopping.unitG' : 'shopping.unitMl');
  const big = tIn(lang, kind === 'weight' ? 'shopping.unitKg' : 'shopping.unitL');
  const rounded = Number(value.toFixed(2));
  if (rounded <= 0) return tIn(lang, 'servings.belowMinimum').replace('{q}', `${formatQuantity(0.01)} ${small}`);
  if (rounded >= 1000) return `${formatQuantity(rounded / 1000)} ${big}`;
  return `${formatQuantity(rounded)} ${small}`;
}

/**
 * Splits lines and own items into what is still to buy, what is bought and what the user already has. A key
 * has one state at most. Marks of lines that no longer exist are ignored here.
 */
export function arrangeList(
  lines: readonly ShoppingLine[],
  items: readonly CustomItem[],
  marks: ReadonlyMap<string, MarkState>,
  lang: CatalogLang = getLanguage(),
): { toBuy: ArrangedLine[]; bought: ArrangedLine[]; have: ArrangedLine[] } {
  const toBuy: ArrangedLine[] = [];
  const bought: ArrangedLine[] = [];
  const have: ArrangedLine[] = [];
  for (const line of lines) {
    const state = marks.get(line.key);
    const target = state === 'have' ? have : state === 'bought' ? bought : toBuy;
    target.push({ key: line.key, text: line.text, sortName: line.sortName });
  }
  for (const item of items) {
    (item.bought ? bought : toBuy).push({ key: `item:${item.id}`, text: item.text, sortName: item.text, itemId: item.id });
  }
  return { toBuy: sortLines(toBuy, lang), bought: sortLines(bought, lang), have: sortLines(have, lang) };
}

/** The text to copy: one open line per row, in screen order. */
export function shoppingText(toBuy: readonly { text: string }[]): string {
  return toBuy.map((l) => l.text).join('\n');
}

export type CustomItemResult = { ok: true; value: string } | { ok: false };

/** 1 to 80 code points after trimming, like the database check (btrim, char_length). */
export function parseCustomItem(input: string): CustomItemResult {
  const value = input.trim();
  const length = [...value].length;
  return length >= 1 && length <= CUSTOM_ITEM_MAX ? { ok: true, value } : { ok: false };
}
