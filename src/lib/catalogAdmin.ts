import { displayName, type CatalogLang } from './catalog';
import type { CatalogKind } from './catalogAdminLogic';
import { supabase } from './supabase';

export interface AdminCatalogRow {
  id: string;
  nameNl: string | null;
  nameFr: string | null;
  synonyms: string[];
  /** Number of different recipes that use the item. */
  useCount: number;
  /** The name or synonym that matched the search term; null without a term. */
  matched: string | null;
}

export interface AdminResult<T> {
  data: T | null;
  error: { code?: string; details?: string | null; message?: string } | null;
  status: number;
}

interface RawRow {
  id: string;
  name_nl: string | null;
  name_fr: string | null;
  synonyms: string[];
  use_count: number;
  matched: string | null;
}

export async function listCatalog(kind: CatalogKind, term: string, lang: CatalogLang): Promise<AdminResult<AdminCatalogRow[]>> {
  const { data, error, status } = await supabase.rpc('admin_list_catalog', { p_kind: kind, p_term: term, p_lang: lang });
  if (error || !data) return { data: null, error, status };
  const rows = (data as RawRow[]).map((r) => ({
    id: r.id,
    nameNl: r.name_nl,
    nameFr: r.name_fr,
    synonyms: r.synonyms,
    useCount: Number(r.use_count),
    matched: r.matched,
  }));
  return { data: rows, error: null, status };
}

export async function updateCatalogItem(
  kind: CatalogKind,
  id: string,
  nameNl: string | null,
  nameFr: string | null,
  synonyms: string[],
): Promise<AdminResult<null>> {
  const { error, status } = await supabase.rpc('admin_update_catalog', {
    p_kind: kind,
    p_id: id,
    p_name_nl: nameNl,
    p_name_fr: nameFr,
    p_synonyms: synonyms,
  });
  return { data: null, error, status };
}

export async function mergeCatalogItems(kind: CatalogKind, from: string, into: string): Promise<AdminResult<null>> {
  const { error, status } = await supabase.rpc('admin_merge_catalog', { p_kind: kind, p_from: from, p_into: into });
  return { data: null, error, status };
}

export async function deleteCatalogItem(kind: CatalogKind, id: string): Promise<AdminResult<null>> {
  const { error, status } = await supabase.rpc('admin_delete_catalog', { p_kind: kind, p_id: id });
  return { data: null, error, status };
}

/** Name of another item for the "already exists" message; the id comes from the database error. */
export async function fetchItemName(kind: CatalogKind, id: string, lang: CatalogLang): Promise<string> {
  const { data } = await supabase
    .from(kind === 'ingredient' ? 'ingredients' : 'units')
    .select('name_nl, name_fr')
    .eq('id', id)
    .maybeSingle();
  if (!data) return '';
  return displayName({ id, nameNl: data.name_nl, nameFr: data.name_fr }, lang);
}
