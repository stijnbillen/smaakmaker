import type { CatalogItem } from './catalog';
import type { Ingredient } from './recipe';
import type { CallResult } from './recipes';
import type { CustomItem, MarkState, MenuSource, UnitInfo } from './shoppingList';
import { supabase } from './supabase';
import type { UnitMeasure } from './unitMeasure';

// Database calls for the shopping list (R-032). The user comes from the column default auth.uid().

/** Own SQLSTATE raised by the insert trigger when the user has 100 own items. */
const ITEMS_FULL = 'P0100';
const UNIQUE_VIOLATION = '23505';
const codeOf =(error: unknown) => (error as { code?: string } | null)?.code;

/** The database returns at most 1000 rows per request; ids in a URL stay short in chunks. */
const PAGE = 1000;
const ID_CHUNK = 100;

interface CatalogRow {
  id: string;
  name_nl: string | null;
  name_fr: string | null;
  measure?: UnitMeasure;
  factor?: number | string | null;
}

export interface ShoppingSource {
  sources: MenuSource[];
  catalog: Map<string, CatalogItem>;
  units: Map<string, UnitInfo>;
}

/** The dishes of the menu (oldest first) with their ingredients, and the catalogue items those lines point to. */
export async function fetchShoppingSource(): Promise<CallResult & Partial<ShoppingSource>> {
  const { data, error, status } = await supabase
    .from('week_menu_items')
    .select('recipe_id,servings,created_at,recipes(id,servings,ingredients)')
    .order('created_at', { ascending: true });
  if (error) return { error, status };
  const rows = (data ?? []) as unknown as {
    recipe_id: string;
    servings: number;
    recipes: { servings: number | null; ingredients: Ingredient[] | null } | null;
  }[];
  const sources: MenuSource[] = rows
    .filter((r) => r.recipes)
    .map((r) => ({
      recipeId: r.recipe_id,
      menuServings: r.servings,
      recipeServings: r.recipes!.servings,
      ingredients: r.recipes!.ingredients ?? [],
    }));

  const ingredientIds = new Set<string>();
  const unitIds = new Set<string>();
  for (const s of sources) {
    for (const ing of s.ingredients) {
      if (ing.ingredient_id) ingredientIds.add(ing.ingredient_id);
      if (ing.unit_id) unitIds.add(ing.unit_id);
    }
  }

  const catalog = new Map<string, CatalogItem>();
  const units = new Map<string, UnitInfo>();
  for (const [table, ids] of [['ingredients', [...ingredientIds]], ['units', [...unitIds]]] as const) {
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const res = await supabase
        .from(table)
        .select(table === 'units' ? 'id,name_nl,name_fr,measure,factor' : 'id,name_nl,name_fr')
        .in('id', ids.slice(i, i + ID_CHUNK));
      if (res.error) return { error: res.error, status: res.status };
      for (const r of (res.data ?? []) as unknown as CatalogRow[]) {
        catalog.set(r.id, { id: r.id, nameNl: r.name_nl, nameFr: r.name_fr });
        if (table === 'units' && r.measure) {
          units.set(r.id, { measure: r.measure, factor: r.factor === null || r.factor === undefined ? null : Number(r.factor) });
        }
      }
    }
  }
  return { sources, catalog, units, error: null, status };
}

export async function fetchMarks(): Promise<CallResult & { marks: Map<string, MarkState> }> {
  const marks = new Map<string, MarkState>();
  for (let from = 0; ; from += PAGE) {
    const { data, error, status } = await supabase
      .from('shopping_marks')
      .select('line_key,state')
      .order('line_key')
      .range(from, from + PAGE - 1);
    if (error) return { marks, error, status };
    const page = (data ?? []) as { line_key: string; state: MarkState }[];
    for (const m of page) marks.set(m.line_key, m.state);
    if (page.length < PAGE) return { marks, error: null, status };
  }
}

/** `state` null removes the mark. Setting a state replaces the previous one: one row per line. */
export async function setMark(key: string, state: MarkState | null): Promise<CallResult> {
  if (state === null) {
    const { error, status } = await supabase.from('shopping_marks').delete().eq('line_key', key);
    return { error, status };
  }
  // No upsert: its conflict branch would also write line_key, which users may not update (column rights).
  const update = () =>
    supabase.from('shopping_marks').update({ state, updated_at: new Date().toISOString() }).eq('line_key', key).select('line_key');
  const first = await update();
  if (first.error || (first.data ?? []).length > 0) return { error: first.error, status: first.status };
  const ins = await supabase.from('shopping_marks').insert({ line_key: key, state });
  // Another tab inserted it in between: update that row.
  if (ins.error && codeOf(ins.error) === UNIQUE_VIOLATION) {
    const again = await update();
    return { error: again.error, status: again.status };
  }
  return { error: ins.error, status: ins.status };
}

/** Removes the marks of lines that no longer exist (call only after a complete, error-free load). */
export async function pruneMarks(keys: readonly string[]): Promise<CallResult> {
  const { error, status } = await supabase.rpc('prune_shopping_marks', { p_keys: [...keys] });
  return { error, status };
}

export async function fetchCustomItems(): Promise<CallResult & { items: CustomItem[] }> {
  const { data, error, status } = await supabase
    .from('shopping_items')
    .select('id,text,bought')
    .order('created_at', { ascending: true });
  if (error) return { items: [], error, status };
  return { items: (data ?? []) as CustomItem[], error: null, status };
}

export async function addCustomItem(text: string): Promise<CallResult & { item?: CustomItem; full?: boolean }> {
  const { data, error, status } = await supabase.from('shopping_items').insert({ text }).select('id,text,bought').single();
  if (error) return { error, status, ...(codeOf(error) === ITEMS_FULL ? { full: true } : {}) };
  return { item: data as CustomItem, error: null, status };
}

export async function setCustomBought(id: string, bought: boolean): Promise<CallResult> {
  const { error, status } = await supabase.from('shopping_items').update({ bought }).eq('id', id);
  return { error, status };
}

export async function removeCustomItem(id: string): Promise<CallResult> {
  const { error, status } = await supabase.from('shopping_items').delete().eq('id', id);
  return { error, status };
}
