import { SERVINGS_MAX, SERVINGS_MIN } from './recipe';
import type { CallResult } from './recipes';
import { supabase } from './supabase';

// Database calls for the personal week menu (R-030). The user comes from the column default auth.uid().

/** SQLSTATE for a duplicate primary key: the recipe is already in the menu. */
const UNIQUE_VIOLATION = '23505';
/** Own SQLSTATE raised by the insert trigger when the menu holds 50 dishes. */
const MENU_FULL = 'P0050';

const codeOf = (error: unknown) => (error as { code?: string } | null)?.code;

export interface WeekMenuItem {
  recipeId: string;
  servings: number;
  createdAt: string;
  title: string;
  photos: { path: string; main?: boolean }[];
}

export async function fetchWeekMenu(): Promise<CallResult & { items: WeekMenuItem[] }> {
  const { data, error, status } = await supabase
    .from('week_menu_items')
    .select('recipe_id,servings,created_at,recipes(id,title,photos)')
    .order('created_at', { ascending: false });
  if (error) return { items: [], error, status };
  const rows = (data ?? []) as unknown as {
    recipe_id: string;
    servings: number;
    created_at: string;
    recipes: { title: string; photos: WeekMenuItem['photos'] | null } | null;
  }[];
  const items = rows
    .filter((r) => r.recipes)
    .map((r) => ({
      recipeId: r.recipe_id,
      servings: r.servings,
      createdAt: r.created_at,
      title: r.recipes!.title,
      photos: r.recipes!.photos ?? [],
    }));
  return { items, error: null, status };
}

export async function addToWeekMenu(recipeId: string): Promise<CallResult & { full?: boolean }> {
  // No servings sent: the insert trigger takes them from the recipe.
  const { error, status } = await supabase.from('week_menu_items').insert({ recipe_id: recipeId });
  // Already in the menu (a double tap, or another tab): that is the state we wanted.
  if (error && codeOf(error) === UNIQUE_VIOLATION) return { error: null, status };
  if (error && codeOf(error) === MENU_FULL) return { error, status, full: true };
  return { error, status };
}

export async function removeFromWeekMenu(recipeId: string): Promise<CallResult> {
  // Row-level security only shows own rows. 0 rows touched means it was not in the menu (any more): the wanted state.
  const { error, status } = await supabase.from('week_menu_items').delete().eq('recipe_id', recipeId).select('recipe_id');
  return { error, status };
}

export async function setWeekMenuServings(recipeId: string, servings: number): Promise<CallResult> {
  if (!Number.isInteger(servings) || servings < SERVINGS_MIN || servings > SERVINGS_MAX) {
    return { error: new Error('servings out of range'), status: undefined };
  }
  const { error, status } = await supabase
    .from('week_menu_items')
    .update({ servings })
    .eq('recipe_id', recipeId)
    .select('recipe_id');
  return { error, status };
}

export async function clearWeekMenu(): Promise<CallResult> {
  const { error, status } = await supabase.rpc('clear_week_menu');
  return { error, status };
}
