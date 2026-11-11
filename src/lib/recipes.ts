import type { CatalogItem, CatalogLang } from './catalog';
import { isConnectionError } from './connection';
import type { TermInfo } from './ingredientSearch';
import { copyPhoto, removePhotos, uploadPhoto } from './photos';
import { toRow, type PhotoDraft, type RecipeDraft, type RecipeRecord, type StoredPhoto } from './recipe';
import type { NamedItem } from './namedItems';
import { supabase } from './supabase';
import type { MatchKind, SuggestKind, SuggestMode, Suggestion } from './suggest';
import type { TagKind } from './tags';
import type { FamilyMember } from './variant';

// Database calls for recipes. Each returns the error and HTTP status so the caller can let
// `report` decide between the connection banner and an own message.

export interface CallResult {
  error: unknown;
  status: number | undefined;
}

/** SQLSTATE for an id that is not a uuid. */
const INVALID_TEXT_REPRESENTATION = '22P02';

const SELECT = 'id,title,ingredients,steps,prep_minutes,total_minutes,servings,source,note,equipment,dish_tags,trait_tags,photos,author_id,created_at,variant_of,family_id,is_favorite,in_week_menu,author:profiles!recipes_author_profile_fkey(display_name)';

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
  variant_of: string | null;
  family_id: string;
  is_favorite: boolean;
  in_week_menu: boolean;
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
  // The source's current title in a second query: an embed of recipes in recipes is ambiguous for PostgREST
  // (one foreign key, two directions). A deleted source has variant_of null and needs no lookup.
  let sourceTitle: string | null = null;
  if (row.variant_of) {
    const src = await supabase.from('recipes').select('title').eq('id', row.variant_of).maybeSingle();
    if (src.error) return { recipe: null, notFound: false, error: src.error, status: src.status };
    sourceTitle = (src.data as { title: string } | null)?.title ?? null;
  }
  const catalog = await fetchCatalogForLines(row.ingredients);
  return {
    recipe: {
      catalog,
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
      variantOf: row.variant_of ?? null,
      familyId: row.family_id ?? row.id,
      isFavorite: row.is_favorite === true,
      inWeekMenu: row.in_week_menu === true,
      sourceTitle,
    },
    notFound: false,
    error: null,
    status,
  };
}

interface CatalogRow {
  id: string;
  name_nl: string | null;
  name_fr: string | null;
}

/** Items by id for the ingredient lines of a recipe (R-020). Empty lists make no call. */
export async function fetchCatalogItems(
  ingredientIds: readonly string[],
  unitIds: readonly string[],
): Promise<CallResult & { items: Map<string, CatalogItem> }> {
  const items = new Map<string, CatalogItem>();
  let failure: CallResult = { error: null, status: 200 };
  for (const [table, ids] of [['ingredients', ingredientIds], ['units', unitIds]] as const) {
    if (ids.length === 0) continue;
    const { data, error, status } = await supabase.from(table).select('id,name_nl,name_fr').in('id', [...ids]);
    if (error) {
      failure = { error, status };
      continue;
    }
    for (const r of (data ?? []) as CatalogRow[]) items.set(r.id, { id: r.id, nameNl: r.name_nl, nameFr: r.name_fr });
  }
  return { items, ...failure };
}

/** The items of a recipe's lines. A failed lookup gives what was found: the lines fall back to their stored text. */
async function fetchCatalogForLines(lines: RecipeRecord['ingredients']): Promise<Map<string, CatalogItem>> {
  const ing = new Set<string>();
  const unit = new Set<string>();
  for (const line of lines ?? []) {
    if (line.ingredient_id) ing.add(line.ingredient_id);
    if (line.unit_id) unit.add(line.unit_id);
  }
  return (await fetchCatalogItems([...ing], [...unit])).items;
}

/** Adds an item to the shared catalogue; a known key returns the existing item (`created` false). */
export async function addCatalogItem(
  kind: SuggestKind,
  name: string,
  lang: CatalogLang,
): Promise<CallResult & { id: string | null; created: boolean }> {
  const { data, error, status } = await supabase.rpc(kind === 'ingredient' ? 'add_ingredient' : 'add_unit', {
    p_name: name,
    p_lang: lang,
  });
  const row = ((data ?? []) as unknown as Array<{ id: string; created: boolean }>)[0];
  return { id: error || !row ? null : row.id, created: !error && row?.created === true, error, status };
}

/** All recipes of one family, oldest first: one query gives the direct variants and the whole family list. */
export async function fetchFamily(familyId: string): Promise<CallResult & { members: FamilyMember[] }> {
  const { data, error, status } = await supabase
    .from('recipes')
    .select('id,title,variant_of,created_at,author:profiles!recipes_author_profile_fkey(display_name)')
    .eq('family_id', familyId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  return { members: error ? [] : ((data ?? []) as unknown as FamilyMember[]), error, status };
}

const toItems = (rows: Array<{ name: string; name_fr: string | null }> | null): NamedItem[] =>
  (rows ?? []).map((row) => ({ name: row.name, nameFr: row.name_fr }));

/** The start list plus the equipment that is in at least one recipe: the choices in the form and the filter. */
export async function fetchEquipmentChoices(): Promise<CallResult & { items: NamedItem[] }> {
  const { data, error, status } = await supabase.rpc('equipment_choices');
  return { items: error ? [] : toItems(data as Array<{ name: string; name_fr: string | null }> | null), error, status };
}

/** Every equipment item with both names: to show the names stored in a recipe in the reader's language. */
export async function fetchEquipmentCatalog(): Promise<CallResult & { items: NamedItem[] }> {
  const { data, error, status } = await supabase.from('equipment').select('name,name_fr').order('name_key');
  return { items: error ? [] : toItems(data), error, status };
}

/** Every tag (both groups) with both names, for the same purpose. */
export async function fetchTagCatalog(): Promise<CallResult & { items: Record<TagKind, NamedItem[]> }> {
  const { data, error, status } = await supabase.from('tags').select('kind,name,name_fr');
  const items: Record<TagKind, NamedItem[]> = { dish: [], trait: [] };
  if (!error) {
    for (const row of data ?? []) {
      if (row.kind === 'dish' || row.kind === 'trait') items[row.kind as TagKind].push({ name: row.name, nameFr: row.name_fr });
    }
  }
  return { items, error, status };
}

interface SuggestRow {
  id: string;
  name_nl: string | null;
  name_fr: string | null;
  matched: string;
  match_kind: MatchKind;
  distance: number | null;
  similarity: number;
}

/** Closest catalogue items for a typed term (R-019); the unit tests of the loader never load this file. */
export async function fetchSuggestions(
  kind: SuggestKind,
  term: string,
  mode: SuggestMode,
  lang: 'nl' | 'fr',
): Promise<CallResult & { rows: Suggestion[] }> {
  const { data, error, status } = await supabase.rpc(kind === 'ingredient' ? 'suggest_ingredients' : 'suggest_units', {
    p_term: term,
    p_autocomplete: mode === 'autocomplete',
    p_lang: lang,
  });
  const rows = error
    ? []
    : ((data ?? []) as unknown as SuggestRow[]).map((r) => ({
        id: r.id,
        nameNl: r.name_nl,
        nameFr: r.name_fr,
        matched: r.matched,
        matchKind: r.match_kind,
        distance: r.distance,
        similarity: r.similarity,
      }));
  return { rows, error, status };
}

interface TermInfoRow {
  term: string;
  item_id: string | null;
  suggestion_id: string | null;
  suggestion_name: string | null;
}

/** Per search term: the catalogue item it names, or a "did you mean" suggestion (R-021). */
export async function fetchTermInfo(
  terms: string[],
  lang: 'nl' | 'fr',
): Promise<CallResult & { info: TermInfo[] }> {
  const { data, error, status } = await supabase.rpc('search_term_info', { p_terms: terms, p_lang: lang });
  const info: TermInfo[] = error
    ? []
    : ((data ?? []) as unknown as TermInfoRow[]).map((r) => ({
        term: r.term,
        itemId: r.item_id,
        ...(r.suggestion_id && r.suggestion_name ? { suggestion: { id: r.suggestion_id, name: r.suggestion_name } } : {}),
      }));
  return { info, error, status };
}

/** All items of a tag group: the choices in the form and the filter (the component sorts them by shown name). */
export async function fetchTags(kind: TagKind): Promise<CallResult & { items: NamedItem[] }> {
  const { data, error, status } = await supabase.from('tags').select('name,name_fr').eq('kind', kind).order('name_key');
  return { items: error ? [] : toItems(data), error, status };
}

/** Set when the database refused the recipe as too large (R-004): which part is too large. */
export type SizeProblem = 'photos' | 'text';

/** `sourceGone`: the source of a variant was deleted while the form was open (the foreign key refused the row). */
export type SaveResult = CallResult & { id: string | null; sizeProblem?: SizeProblem; sourceGone?: boolean };

/** 23503 on the foreign key of variant_of: the source no longer exists. */
export function isSourceGone(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === '23503' && (e.message ?? '').includes('recipes_variant_of_fkey');
}

/** The database answers a too large recipe with 23514, message `recipe_too_large` and the part in `details`. */
export function sizeProblemOf(error: unknown): SizeProblem | undefined {
  const e = error as { code?: string; message?: string; details?: string } | null;
  if (!e || e.code !== '23514' || e.message !== 'recipe_too_large') return undefined;
  return e.details === 'text' ? 'text' : 'photos';
}

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
    if (!path && photo.copyFrom) {
      // A variant's photo: a real copy in the folder of the new recipe, so the variant owns its files.
      const res = await copyPhoto(photo.copyFrom, session.recipeId);
      if (res.error || !res.path) return { photos: [], fresh, error: res.error, status: res.status };
      path = res.path;
      session.uploaded.set(photo.key, path);
    }
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

/** True only when the read succeeds and finds no row: a failed read is not proof that the source is gone. */
async function sourceMissing(id: string): Promise<boolean> {
  const { data, error } = await supabase.from('recipes').select('id').eq('id', id).maybeSingle();
  return !error && !data;
}

/** `variantOf`: the source recipe when this is a variant; the family is set by the database. */
export async function createRecipe(draft: RecipeDraft, session: SaveSession = newSaveSession(), variantOf?: string): Promise<SaveResult> {
  const up = await uploadNew(session, draft.photos ?? []);
  if (up.error) {
    // Copies already made would be orphans; clean them up unless the connection broke (a retry reuses them).
    await discardAfterFailure(session, up.fresh, up.error, up.status);
    // A server answer on a copy usually means the source (and its files) was deleted meanwhile.
    const gone =
      !!variantOf && !isConnectionError({ ...(up.error as object), status: up.status }) && (await sourceMissing(variantOf));
    return { id: null, error: up.error, status: up.status, ...(gone ? { sourceGone: true } : {}) };
  }
  const { data, error, status } = await supabase
    .from('recipes')
    .insert({ ...toRow(draft), id: session.recipeId, photos: up.photos, ...(variantOf ? { variant_of: variantOf } : {}) })
    .select('id')
    .single();
  if (error?.code === '23505') {
    // An earlier attempt did save the row but its answer was lost: finish as an update of that row.
    return updateRecipe(session.recipeId, draft, session);
  }
  if (error || !data) {
    await discardAfterFailure(session, up.fresh, error, status);
    return { id: null, error, status, sizeProblem: sizeProblemOf(error), ...(isSourceGone(error) ? { sourceGone: true } : {}) };
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
    if (error) return { id: null, error, status, sizeProblem: sizeProblemOf(error) };
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
