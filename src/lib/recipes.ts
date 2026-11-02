import { isConnectionError } from './connection';
import { removePhotos, uploadPhoto } from './photos';
import { toRow, type PhotoDraft, type RecipeDraft, type RecipeRecord, type StoredPhoto } from './recipe';
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

const SELECT = 'id,title,ingredients,steps,prep_minutes,total_minutes,servings,source,note,equipment,dish_tags,trait_tags,photos,author_id,created_at,author:profiles(display_name)';

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
  photos: StoredPhoto[] | null;
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
      photos: row.photos ?? [],
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

/**
 * What survives between save attempts of one form: the id of a new recipe (photos are uploaded into its
 * folder before the row exists) and the files already uploaded, so "try again" does not upload them twice.
 */
export interface SaveSession {
  recipeId: string;
  uploaded: Map<string, string>;
}

export const newSaveSession = (recipeId: string = crypto.randomUUID()): SaveSession => ({ recipeId, uploaded: new Map() });

type PhotosResult = CallResult & { photos: StoredPhoto[]; fresh: string[] };

/** Uploads the new photos (one at a time) and returns the list as it will be stored, in the user's order. */
async function uploadNew(session: SaveSession, photos: PhotoDraft[]): Promise<PhotosResult> {
  const stored: StoredPhoto[] = [];
  const fresh: string[] = [];
  for (const photo of photos) {
    let path = photo.path ?? session.uploaded.get(photo.key);
    if (!path) {
      if (!photo.blob) return { photos: [], fresh, error: new Error('photo without file'), status: 200 };
      const res = await uploadPhoto(session.recipeId, photo.blob);
      if (res.error || !res.path) return { photos: [], fresh, error: res.error, status: res.status };
      path = res.path;
      session.uploaded.set(photo.key, path);
    }
    if (!photo.path) fresh.push(path);
    stored.push({ path, main: photo.main });
  }
  return { photos: stored, fresh, error: null, status: 200 };
}

export async function createRecipe(draft: RecipeDraft, session: SaveSession = newSaveSession()): Promise<SaveResult> {
  const up = await uploadNew(session, draft.photos ?? []);
  if (up.error) return { id: null, error: up.error, status: up.status };
  const { data, error, status } = await supabase
    .from('recipes')
    .insert({ ...toRow(draft), id: session.recipeId, photos: up.photos })
    .select('id')
    .single();
  if (error?.code === '23505') {
    // An earlier attempt did save the row but its answer was lost: finish as an update of that row.
    return updateRecipe(session.recipeId, draft, session);
  }
  if (error || !data) {
    await discardAfterFailure(session, up.fresh, error, status);
    return { id: null, error, status };
  }
  await removeUnused(session, up.photos);
  return { id: data.id, error: null, status };
}

/**
 * After a failed write the new files are orphans and go again, but only when the server really refused.
 * On a lost connection the row may have been saved anyway; then the files and the session stay for the retry.
 */
async function discardAfterFailure(session: SaveSession, fresh: string[], error: unknown, status: number | undefined): Promise<void> {
  if (isConnectionError({ ...(error as object), status })) return;
  await removePhotos(fresh);
  session.uploaded.clear();
}

/** Uploaded in an earlier attempt but dropped from the draft since: no row will ever point to them. */
async function removeUnused(session: SaveSession, saved: StoredPhoto[]): Promise<void> {
  const kept = new Set(saved.map((p) => p.path));
  const unused = [...session.uploaded.values()].filter((path) => !kept.has(path));
  if (unused.length > 0) await removePhotos(unused);
}

// Row-level security answers a refused update or delete with 0 rows and no error; that counts as failed.
const NO_ROWS = new Error('no rows changed');

/** `previousPaths`: the stored photos the form started with; the ones no longer in the draft are removed afterwards. */
export async function updateRecipe(
  id: string,
  draft: RecipeDraft,
  session: SaveSession = newSaveSession(id),
  previousPaths: string[] = [],
): Promise<SaveResult> {
  const up = await uploadNew(session, draft.photos ?? []);
  if (up.error) return { id: null, error: up.error, status: up.status };
  const { data, error, status } = await supabase
    .from('recipes')
    .update({ ...toRow(draft), photos: up.photos })
    .eq('id', id)
    .select('id');
  if (error || !data || data.length === 0) {
    await discardAfterFailure(session, up.fresh, error, status);
    if (error) return { id: null, error, status };
    // A made-up status in the 2xx range: this is an answer from the server, not a lost connection.
    return { id: null, error: NO_ROWS, status: 200 };
  }
  const kept = new Set(up.photos.map((p) => p.path));
  await removeUnused(session, up.photos);
  await removePhotos(previousPaths.filter((path) => !kept.has(path)));
  return { id, error: null, status };
}

export async function deleteRecipe(id: string): Promise<CallResult> {
  // The delete returns the row, so the photo paths are known without a separate read.
  const { data, error, status } = await supabase.from('recipes').delete().eq('id', id).select('id,photos');
  if (error) return { error, status };
  if (!data || data.length === 0) return { error: NO_ROWS, status: 200 };
  const photos = ((data[0] as unknown as { photos: StoredPhoto[] | null }).photos ?? []).map((p) => p.path);
  await removePhotos(photos);
  return { error: null, status };
}
