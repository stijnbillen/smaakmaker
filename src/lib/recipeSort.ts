// Sorting of the overview (R-028). Pure, no import of the Supabase client, so unit tests can load it.

export type SortField = 'created' | 'rating' | 'title' | 'total' | 'prep';
export type SortDirection = 'asc' | 'desc';

export interface RecipeSort {
  field: SortField;
  direction: SortDirection;
}

/** Newest first. */
export const DEFAULT_SORT: RecipeSort = { field: 'created', direction: 'desc' };

/** Dates and stars start with the highest; a title or a duration starts with the lowest. */
export function defaultDirection(field: SortField): SortDirection {
  return field === 'created' || field === 'rating' ? 'desc' : 'asc';
}

/** A new field always starts with its own default direction, whatever the old direction was. */
export function changeField(_sort: RecipeSort, field: SortField): RecipeSort {
  return { field, direction: defaultDirection(field) };
}

// URL values are Dutch, like the other parameters. "beoordeling" stays for the stars so old links keep working.
const SORT_PARAM = 'sorteer';
const DIRECTION_PARAM = 'richting';
const FIELD_VALUES: Record<SortField, string> = {
  created: 'datum',
  rating: 'beoordeling',
  title: 'titel',
  total: 'totaal',
  prep: 'prep',
};
const DIRECTION_VALUES: Record<SortDirection, string> = { asc: 'op', desc: 'af' };

/** Anything unknown means the default: an unknown field gives the default sort, an unknown direction the field's own. */
export function parseSort(params: URLSearchParams): RecipeSort {
  const raw = params.get(SORT_PARAM);
  const field = (Object.keys(FIELD_VALUES) as SortField[]).find((f) => FIELD_VALUES[f] === raw) ?? DEFAULT_SORT.field;
  const dir = params.get(DIRECTION_PARAM);
  const direction = (Object.keys(DIRECTION_VALUES) as SortDirection[]).find((d) => DIRECTION_VALUES[d] === dir);
  return { field, direction: direction ?? defaultDirection(field) };
}

/** Writes the sort into a copy of the params; other parameters stay. Defaults leave the URL clean. */
export function toSearchParams(sort: RecipeSort, base: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const params = new URLSearchParams(base);
  params.delete(SORT_PARAM);
  params.delete(DIRECTION_PARAM);
  if (sort.field !== DEFAULT_SORT.field) params.set(SORT_PARAM, FIELD_VALUES[sort.field]);
  if (sort.direction !== defaultDirection(sort.field)) params.set(DIRECTION_PARAM, DIRECTION_VALUES[sort.direction]);
  return params;
}

export interface SortableRecipe {
  id: string;
  title: string;
  created_at: string;
  /** PostgREST may send numeric as a number or a string. */
  rating_avg: number | string | null;
  rating_count: number;
  prep_minutes: number | null;
  total_minutes: number | null;
  /** Only in search answers. */
  matchCount?: number;
}

const collators = new Map<string, Intl.Collator>();
const collatorFor = (locale: string): Intl.Collator => {
  let c = collators.get(locale);
  if (!c) {
    // 'base': no difference in case or accents.
    c = new Intl.Collator(locale, { sensitivity: 'base' });
    collators.set(locale, c);
  }
  return c;
};

/** Compares two optional values; a missing value is always last, in both directions. */
function compareNullable<V>(a: V | null, b: V | null, direction: SortDirection, cmp: (x: V, y: V) => number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === 'asc' ? cmp(a, b) : cmp(b, a);
}

const numeric = (x: number, y: number) => x - y;

const ratingOf = (r: SortableRecipe): number | null => {
  if (r.rating_avg === null || r.rating_count <= 0) return null;
  const n = Number(r.rating_avg);
  return Number.isFinite(n) ? n : null;
};

/**
 * A sorted copy. Order of the keys: search matches (never flipped), the chosen field in the chosen direction
 * (no value last), more reviews first for stars, then the newest recipe, then the id for a stable order.
 */
export function sortRecipes<T extends SortableRecipe>(rows: readonly T[], sort: RecipeSort, locale: string): T[] {
  const collator = collatorFor(locale);
  const { field, direction } = sort;
  const compare = (a: T, b: T): number => {
    if (a.matchCount !== undefined && b.matchCount !== undefined && a.matchCount !== b.matchCount) {
      return b.matchCount - a.matchCount;
    }
    let primary = 0;
    switch (field) {
      case 'created':
        primary = compareNullable(Date.parse(a.created_at), Date.parse(b.created_at), direction, numeric);
        break;
      case 'rating':
        primary = compareNullable(ratingOf(a), ratingOf(b), direction, numeric);
        if (primary === 0) primary = b.rating_count - a.rating_count;
        break;
      case 'title':
        primary = direction === 'asc' ? collator.compare(a.title, b.title) : collator.compare(b.title, a.title);
        break;
      case 'total':
        primary = compareNullable(a.total_minutes, b.total_minutes, direction, numeric);
        break;
      case 'prep':
        primary = compareNullable(a.prep_minutes, b.prep_minutes, direction, numeric);
        break;
    }
    if (primary !== 0) return primary;
    const newest = Date.parse(b.created_at) - Date.parse(a.created_at);
    if (newest !== 0 && !Number.isNaN(newest)) return newest;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
  return [...rows].sort(compare);
}
