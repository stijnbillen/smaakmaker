// Tag filter of the overview (R-010): within a group one chosen tag is enough ("or"), different groups
// combine with "and", and the result combines with the other filters. Same pattern as equipmentFilter.ts.

import type { TagKind } from './tags';

/** Per group: the (Dutch, repeatable) URL parameter and the recipe column. */
const GROUPS: Record<TagKind, { param: string; column: string }> = {
  dish: { param: 'soort', column: 'dish_tags' },
  trait: { param: 'kenmerk', column: 'trait_tags' },
};

const KINDS = Object.keys(GROUPS) as TagKind[];

export type TagFilter = Record<TagKind, string[]>;

export function parseTagFilter(params: URLSearchParams): TagFilter {
  const filter = {} as TagFilter;
  for (const kind of KINDS) {
    filter[kind] = [...new Set(params.getAll(GROUPS[kind].param).filter((name) => name !== ''))];
  }
  return filter;
}

/** Writes the filter into a copy of the params; other parameters stay. */
export function toSearchParams(filter: TagFilter, base: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const params = new URLSearchParams(base);
  for (const kind of KINDS) {
    params.delete(GROUPS[kind].param);
    for (const name of filter[kind] ?? []) params.append(GROUPS[kind].param, name);
  }
  return params;
}

export const hasTagFilter = (filter: TagFilter): boolean => KINDS.some((kind) => (filter[kind] ?? []).length > 0);

/** Minimal shape of a PostgREST filter builder, so this stays free of the client's generics. */
interface Filterable<T> {
  overlaps(column: string, value: string): T;
}

/**
 * A Postgres array literal with every element quoted. postgrest-js joins a string[] without quotes, so a
 * name with a comma, quote or brace would split or break; a string is passed on unchanged.
 */
const arrayLiteral = (names: readonly string[]): string =>
  `{${names.map((name) => `"${name.replace(/[\\"]/g, '\\$&')}"`).join(',')}}`;

/** One `overlaps` per group with a choice; no choice, no filter. */
export function applyTagFilter<T extends Filterable<T>>(query: T, filter: TagFilter): T {
  let result = query;
  for (const kind of KINDS) {
    const names = filter[kind] ?? [];
    if (names.length > 0) result = result.overlaps(GROUPS[kind].column, arrayLiteral(names));
  }
  return result;
}
