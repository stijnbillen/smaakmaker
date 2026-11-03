// Equipment filter of the overview (R-008): a recipe must need at least one chosen item. Kept apart from
// the page so the favourites list can reuse it; same pattern as timeFilter.ts.

/** Dutch like the other URL parameters; repeated for several items. */
const PARAM = 'gerief';

export function parseEquipmentFilter(params: URLSearchParams): string[] {
  return [...new Set(params.getAll(PARAM).filter((name) => name !== ''))];
}

/** Writes the filter into a copy of the params; other parameters stay. */
export function toSearchParams(names: readonly string[], base: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const params = new URLSearchParams(base);
  params.delete(PARAM);
  for (const name of names) params.append(PARAM, name);
  return params;
}

export const hasEquipmentFilter = (names: readonly string[]): boolean => names.length > 0;

/** Minimal shape of a PostgREST filter builder, so this stays free of the client's generics. */
interface Filterable<T> {
  overlaps(column: string, value: string[]): T;
}

/** A database filter: it combines with the other filters with "and". No choice, no filter. */
export function applyEquipmentFilter<T extends Filterable<T>>(query: T, names: readonly string[]): T {
  return names.length === 0 ? query : query.overlaps('equipment', [...names]);
}
