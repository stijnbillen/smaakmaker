import type { CallResult } from './recipes';
import { supabase } from './supabase';

// Database calls for favourites (R-014). The user comes from the column default auth.uid(), never from the client.

/** SQLSTATE for a duplicate primary key: the recipe is already a favourite. */
const UNIQUE_VIOLATION = '23505';

export async function addFavorite(recipeId: string): Promise<CallResult> {
  const { error, status } = await supabase.from('favorites').insert({ recipe_id: recipeId });
  // Already a favourite (a double tap, or another tab): that is the state we wanted.
  if (error && (error as { code?: string }).code === UNIQUE_VIOLATION) return { error: null, status };
  return { error, status };
}

export async function removeFavorite(recipeId: string): Promise<CallResult> {
  // Row-level security only shows own rows. 0 rows touched means it was no favourite (any more), which is the wanted state.
  const { error, status } = await supabase.from('favorites').delete().eq('recipe_id', recipeId).select('recipe_id');
  return { error, status };
}

/** Restricts a recipe query or search to the caller's favourites, via the computed field is_favorite. */
export function applyFavoritesOnly<T extends { eq(column: string, value: boolean): T }>(query: T): T {
  return query.eq('is_favorite', true);
}
