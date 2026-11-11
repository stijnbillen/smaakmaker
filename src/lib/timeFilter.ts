// Maximum-time filters of the overview (R-007, R-029). Kept apart from the page so the favourites list can reuse it.

/** Highest value that can be typed or stored in the URL (72 hours, same as the recipe form). */
export const TIME_MAX_MINUTES = 4320;
/** The range covers 0..240 in steps of 5; larger typed values park the thumb at the far end. */
export const SLIDER_MAX = 240;
export const SLIDER_STEP = 5;

export interface TimeFilter {
  maxPrep: number | null;
  maxTotal: number | null;
}

/** URL parameter names are Dutch, like the routes. */
const PREP_PARAM = 'prep';
const TOTAL_PARAM = 'totaal';

// Strict: no sign, no decimals, no leading zeros, so the URL and the text field accept exactly the same input.
const MINUTES_PATTERN = /^(0|[1-9]\d*)$/;

function parseMinutes(value: string | null): number | null {
  if (value === null || !MINUTES_PATTERN.test(value)) return null;
  const minutes = Number(value);
  return minutes <= TIME_MAX_MINUTES ? minutes : null;
}

export type TypedMinutes = { kind: 'empty' } | { kind: 'value'; minutes: number } | { kind: 'invalid' };

/** Reads what the user typed in the minutes field. Empty means "no limit"; invalid text is not applied. */
export function parseTypedMinutes(text: string): TypedMinutes {
  if (text === '') return { kind: 'empty' };
  const minutes = parseMinutes(text);
  return minutes === null ? { kind: 'invalid' } : { kind: 'value', minutes };
}

/** Position of the range thumb for a value; values above the range end sit at the end. */
export const clampToSlider = (minutes: number): number => Math.min(Math.max(minutes, 0), SLIDER_MAX);

export function parseTimeFilter(params: URLSearchParams): TimeFilter {
  return { maxPrep: parseMinutes(params.get(PREP_PARAM)), maxTotal: parseMinutes(params.get(TOTAL_PARAM)) };
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
