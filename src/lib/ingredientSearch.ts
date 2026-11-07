// Ingredient search of the overview (R-009). Pure logic, free of Supabase and React so unit tests load it
// without environment variables and the favourites list can reuse it.

export const MAX_TERMS = 10;
/** Pause in typing before the search runs; at most 400 ms (R-009). */
export const SEARCH_DEBOUNCE_MS = 300;

/** URL parameters are Dutch, like the routes. */
const WITH_PARAM = 'met';
const WITHOUT_PARAM = 'zonder';
const MIN_PARAM = 'min';

export interface IngredientSearch {
  with: string[];
  without: string[];
  /** Null means "all" (k = n). */
  min: number | null;
}

/** Lower case without accents; same idea as fold_key() in the database. */
export const simpleKey = (text: string): string =>
  text.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Trims, drops empty values, de-duplicates by key and cuts at MAX_TERMS. */
function normalise(values: string[]): { terms: string[]; tooMany: boolean } {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (value === '') continue;
    const key = simpleKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(value);
  }
  return { terms: terms.slice(0, MAX_TERMS), tooMany: terms.length > MAX_TERMS };
}

/** Splits a comma separated field into terms. */
export function parseTerms(text: string): { terms: string[]; tooMany: boolean } {
  return normalise(text.split(','));
}

/** No choice means all (k = n); otherwise k stays within 1..n. */
export function clampMin(k: number | null, n: number): number {
  if (k === null || !Number.isFinite(k)) return n;
  return Math.max(1, Math.min(n, Math.trunc(k)));
}

export function parseSearch(params: URLSearchParams): IngredientSearch {
  const withTerms = normalise(params.getAll(WITH_PARAM)).terms;
  const without = normalise(params.getAll(WITHOUT_PARAM)).terms;
  const raw = params.get(MIN_PARAM);
  const parsed = raw !== null && /^-?\d+$/.test(raw) ? Number(raw) : null;
  const min = parsed === null || withTerms.length === 0 ? null : clampMin(parsed, withTerms.length);
  return { with: withTerms, without, min };
}

/** Writes the search into a copy of the params; other parameters (also sorteer) stay. "All" leaves out min. */
export function toSearchParams(search: IngredientSearch, base: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const params = new URLSearchParams(base);
  params.delete(WITH_PARAM);
  params.delete(WITHOUT_PARAM);
  params.delete(MIN_PARAM);
  for (const term of search.with) params.append(WITH_PARAM, term);
  for (const term of search.without) params.append(WITHOUT_PARAM, term);
  if (search.with.length > 0 && search.min !== null && search.min < search.with.length) {
    params.set(MIN_PARAM, String(clampMin(search.min, search.with.length)));
  }
  return params;
}

export const hasSearch = (search: IngredientSearch): boolean => search.with.length > 0 || search.without.length > 0;

export interface Debouncer<A> {
  (arg: A): void;
  cancel(): void;
}

/** Calls fn once, with the last argument, after ms without a new call. */
export function createDebouncer<A>(fn: (arg: A) => void, ms: number): Debouncer<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = ((arg: A) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(arg);
    }, ms);
  }) as Debouncer<A>;
  debounced.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return debounced;
}

/** What the database knows about one typed term (search_term_info). */
export interface TermInfo {
  term: string;
  /** The catalogue item the term exactly names, or null. */
  itemId: string | null;
  /** "Did you mean": only when there is no exact item. */
  suggestion?: { id: string; name: string };
}

/**
 * Keeps the first term of each item and reports the ones that drop out. Terms without an item are
 * de-duplicated on their key, as before. A term without info counts as an item-less term.
 */
export function dedupeByItem(terms: string[], info: TermInfo[]): { terms: string[]; duplicates: string[] } {
  const itemOf = new Map(info.map((i) => [i.term, i.itemId]));
  const seen = new Set<string>();
  const kept: string[] = [];
  const duplicates: string[] = [];
  for (const term of terms) {
    const itemId = itemOf.get(term) ?? null;
    const group = itemId !== null ? `item:${itemId}` : `key:${simpleKey(term.trim())}`;
    if (seen.has(group)) {
      duplicates.push(term);
      continue;
    }
    seen.add(group);
    kept.push(term);
  }
  return { terms: kept, duplicates };
}

/** Replaces every term of a comma text that has the same key as `term`; the other terms and their order stay. */
export function replaceTerm(text: string, term: string, replacement: string): string {
  const key = simpleKey(term.trim());
  return text
    .split(',')
    .map((part) => (simpleKey(part.trim()) === key ? replacement : part.trim()))
    .join(', ');
}
