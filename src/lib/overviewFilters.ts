// The counter on the "Filters" button and "Alles wissen" (R-028). Pure, built on the existing parsers so the same
// rules apply to invalid URL values.
import { hasEquipmentFilter, parseEquipmentFilter, toSearchParams as equipmentToSearchParams } from './equipmentFilter';
import { hasSearch, parseSearch, toSearchParams as searchToSearchParams } from './ingredientSearch';
import { parseTagFilter, toSearchParams as tagsToSearchParams } from './tagFilter';
import { parseTimeFilter, toSearchParams as timeToSearchParams } from './timeFilter';

/** Search = 1, each time limit = 1, each tag group = 1, equipment = 1. The sort never counts. */
export function activeFilterCount(params: URLSearchParams): number {
  const time = parseTimeFilter(params);
  const tags = parseTagFilter(params);
  return (
    (hasSearch(parseSearch(params)) ? 1 : 0) +
    (time.maxPrep !== null ? 1 : 0) +
    (time.maxTotal !== null ? 1 : 0) +
    (tags.dish.length > 0 ? 1 : 0) +
    (tags.trait.length > 0 ? 1 : 0) +
    (hasEquipmentFilter(parseEquipmentFilter(params)) ? 1 : 0)
  );
}

/** Removes the search and every filter from a copy; the sort and unknown parameters stay. */
export function clearFilters(params: URLSearchParams): URLSearchParams {
  const empty = { with: [], without: [], min: null };
  let next = searchToSearchParams(empty, params);
  next = timeToSearchParams({ maxPrep: null, maxTotal: null }, next);
  next = tagsToSearchParams({ dish: [], trait: [] }, next);
  return equipmentToSearchParams([], next);
}
