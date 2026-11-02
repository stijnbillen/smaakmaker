import { toRow, type RecipeDraft, type RecipeRecord } from './recipe';
import { supabase } from './supabase';
import type { TagKind } from './tags';

// Database calls for recipes. Each returns the error and HTTP status so the caller can let
// `report` decide between the connection banner and an own message.

export interface CallResult {
  error: unknown;
  status: number | undefined;
}

/** SQLSTATE for an id that is not a uuid. */
const INVALID_TEXT_REPRESENTATION = '22P02';

const SELECT = 'id,title,ingredients,steps,prep_minutes,total_minutes,servings,source,note,equipment,dish_tags,trait_tags,author_id,created_at,author:profiles(display_name)';

interface FetchedRow {
  id: string;
  title: string;
  ingredients: RecipeRecord['ingredients'];
  steps: string[];
  prep_minutes: number | null;
  total_minutes: number | null;
  servings: number | null;
  source: string | null;
  note: string | null;
  equipment: string[] | null;
  dish_tags: string[] | null;
  trait_tags: string[] | null;
  author_id: string;
  created_at: string;
  author: { display_name: string | null } | null;
}

export type FetchResult = CallResult & { recipe: RecipeRecord | null; notFound: boolean };

export async function fetchRecipe(id: string): Promise<FetchResult> {
  const { data, error, status } = await supabase.from('recipes').select(SELECT).eq('id', id).maybeSingle();
  if (error) {
    // "Not a uuid" is the same answer to the user as "no such recipe".
    const notFound = error.code === INVALID_TEXT_REPRESENTATION;
    return { recipe: null, notFound, error: notFound ? null : error, status };
  }
  if (!data) return { recipe: null, notFound: true, error: null, status };
  const row = data as unknown as FetchedRow;
  return {
    recipe: {
      id: row.id,
      title: row.title,
      ingredients: row.ingredients,
      steps: row.steps,
      prepMinutes: row.prep_minutes,
      totalMinutes: row.total_minutes,
      servings: row.servings,
      // Old rows may lack the columns entirely.
      source: row.source ?? null,
      note: row.note ?? null,
      equipment: row.equipment ?? [],
      dishTags: row.dish_tags ?? [],
      traitTags: row.trait_tags ?? [],
      authorId: row.author_id,
      authorName: row.author?.display_name ?? null,
      createdAt: row.created_at,
    },
    notFound: false,
    error: null,
    status,
  };
}

/** Catalogue names that are in at least one recipe: the choices in the form and the filter. */
export async function fetchEquipmentInUse(): Promise<CallResult & { names: string[] }> {
  const { data, error, status } = await supabase.rpc('equipment_in_use');
  return { names: error ? [] : ((data ?? []) as unknown as string[]), error, status };
}

/** All names of a tag group, in catalogue order: the choices in the form and the filter. */
export async function fetchTags(kind: TagKind): Promise<CallResult & { names: string[] }> {
  const { data, error, status } = await supabase.from('tags').select('name').eq('kind', kind).order('name_key');
  return { names: error ? [] : (data ?? []).map((row) => row.name as string), error, status };
}

export type SaveResult = CallResult & { id: string | null };

export async function createRecipe(draft: RecipeDraft): Promise<SaveResult> {
  const { data, error, status } = await supabase.from('recipes').insert(toRow(draft)).select('id').single();
  return { id: data?.id ?? null, error, status };
}

// Row-level security answers a refused update or delete with 0 rows and no error; that counts as failed.
const NO_ROWS = new Error('no rows changed');

export async function updateRecipe(id: string, draft: RecipeDraft): Promise<SaveResult> {
  const { data, error, status } = await supabase.from('recipes').update(toRow(draft)).eq('id', id).select('id');
  if (error) return { id: null, error, status };
  // A made-up status in the 2xx range: this is an answer from the server, not a lost connection.
  if (!data || data.length === 0) return { id: null, error: NO_ROWS, status: 200 };
  return { id, error: null, status };
}

export async function deleteRecipe(id: string): Promise<CallResult> {
  const { data, error, status } = await supabase.from('recipes').delete().eq('id', id).select('id');
  if (error) return { error, status };
  if (!data || data.length === 0) return { error: NO_ROWS, status: 200 };
  return { error: null, status };
}
