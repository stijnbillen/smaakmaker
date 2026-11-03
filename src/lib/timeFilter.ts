// Maximum-time filters of the overview (R-007). Kept apart from the page so the favourites list can reuse it.

export const TIME_FILTER_CHOICES = [15, 30, 60, 120] as const;

export interface TimeFilter {
  maxPrep: number | null;
  maxTotal: number | null;
}

/** URL parameter names are Dutch, like the routes. */
const PREP_PARAM = 'prep';
const TOTAL_PARAM = 'totaal';

function parseChoice(value: string | null): number | null {
  // Strict text match: "15.5", "1e2" or " 30" are no choice.
  const found = TIME_FILTER_CHOICES.find((choice) => String(choice) === value);
  return found ?? null;
}

export function parseTimeFilter(params: URLSearchParams): TimeFilter {
  return { maxPrep: parseChoice(params.get(PREP_PARAM)), maxTotal: parseChoice(params.get(TOTAL_PARAM)) };
}

/** Writes the filter into a copy of the params; other parameters stay. */
export function toSearchParams(filter: TimeFilter, base: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const params = new URLSearchParams(base);
  params.delete(PREP_PARAM);
  params.delete(TOTAL_PARAM);
  if (filter.maxPrep !== null) params.set(PREP_PARAM, String(filter.maxPrep));
  if (filter.maxTotal !== null) params.set(TOTAL_PARAM, String(filter.maxTotal));
  return params;
}

export const hasTimeFilter = (filter: TimeFilter): boolean => filter.maxPrep !== null || filter.maxTotal !== null;

/** Minimal shape of a PostgREST filter builder, so this stays free of the client's generics. */
interface Filterable<T> {
  lte(column: string, value: number): T;
}

/** A database filter, not a client one: it combines with later filters (tags, search) with "and". */
export function applyTimeFilter<T extends Filterable<T>>(query: T, filter: TimeFilter): T {
  let result = query;
  if (filter.maxPrep !== null) result = result.lte('prep_minutes', filter.maxPrep);
  if (filter.maxTotal !== null) result = result.lte('total_minutes', filter.maxTotal);
  return result;
}
