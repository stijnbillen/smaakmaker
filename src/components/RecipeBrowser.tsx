import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthorLine } from './AuthorLine';
import { useConnection } from './ConnectionProvider';
import { EquipmentFilter } from './EquipmentFilter';
import { FavoriteButton } from './FavoriteButton';
import { IngredientSearch } from './IngredientSearch';
import { ListState } from './ListState';
import { TagFilter } from './TagFilter';
import { useStoredNames } from '../lib/useStoredNames';
import { RecipePhotoPlaceholder } from './RecipePhotoPlaceholder';
import { TimeFilter } from './TimeFilter';
import { SortControl } from './SortControl';
import { locale } from '../i18n/language';
import { format, t, useLanguage } from '../i18n/t';
import {
  applyEquipmentFilter,
  hasEquipmentFilter,
  parseEquipmentFilter,
  toSearchParams as equipmentToSearchParams,
} from '../lib/equipmentFilter';
import { applyFavoritesOnly } from '../lib/favorites';
import { formatDuration } from '../lib/format';
import {
  hasSearch,
  parseSearch,
  toSearchParams as searchToSearchParams,
  type IngredientSearch as IngredientSearchValue,
} from '../lib/ingredientSearch';
import { activeFilterCount, clearFilters } from '../lib/overviewFilters';
import { parseSort, sortRecipes, toSearchParams as sortToSearchParams, type RecipeSort } from '../lib/recipeSort';
import { formatRating, reviewCountText } from '../lib/reviews';
import { signedUrls } from '../lib/photos';
import type { StoredPhoto } from '../lib/recipe';
import { supabase } from '../lib/supabase';
import { isVariant } from '../lib/variant';
import { tagKey, toggleTag, type TagKind } from '../lib/tags';
import {
  applyTagFilter,
  hasTagFilter,
  parseTagFilter,
  toSearchParams as tagsToSearchParams,
  type TagFilter as TagFilterValue,
} from '../lib/tagFilter';
import { applyTimeFilter, hasTimeFilter, parseTimeFilter, toSearchParams, type TimeFilter as TimeFilterValue } from '../lib/timeFilter';

/** One row shape for both answers: the plain table query and the search function. */
interface RecipeRow {
  id: string;
  title: string;
  created_at: string;
  /** Null for old sample rows saved before the times existed. */
  prep_minutes: number | null;
  total_minutes: number | null;
  equipment: string[] | null;
  /** Computed fields of the database; PostgREST may send numeric as a number or a string. */
  rating_avg: number | string | null;
  rating_count: number;
  photos: StoredPhoto[] | null;
  family_id: string;
  /** Computed field: a favourite of the signed-in user. */
  is_favorite: boolean;
  authorName: string | null;
  /** Only in search answers; both come from the database. */
  matchCount?: number;
  termCount?: number;
}

/** What PostgREST sends: the table query nests the author, the search function returns a flat name. */
type RawRow = Omit<RecipeRow, 'authorName' | 'matchCount' | 'termCount'> & {
  author?: { display_name: string | null } | null;
  author_name?: string | null;
  match_count?: number;
  term_count?: number;
};

const toRow = ({ author, author_name, match_count, term_count, ...rest }: RawRow): RecipeRow => ({
  ...rest,
  authorName: author_name ?? author?.display_name ?? null,
  matchCount: match_count,
  termCount: term_count,
});

/** The path of the main photo; the database guarantees exactly one main in a non-empty list. */
const mainPhoto = (photos: StoredPhoto[] | null): string | null => photos?.find((p) => p.main)?.path ?? photos?.[0]?.path ?? null;

interface RecipeBrowserProps {
  /** Only the signed-in user's favourites; the search and every filter work inside that set. */
  favoritesOnly?: boolean;
  title: string;
  loadingText: string;
  /** Shown when there are no recipes and no filter or search is active. */
  emptyText: string;
  /** Key for the connection banner; one per page, so pages never resolve each other's retry. */
  connectionKey: string;
}

/** The recipe list with search, filters and sort. Shared by the overview and the favourites page. */
export function RecipeBrowser({ favoritesOnly = false, title, loadingText, emptyText, connectionKey: KEY }: RecipeBrowserProps) {
  const language = useLanguage();
  const names = useStoredNames();
  const storedName = names.shown;
  const { report, resolve } = useConnection();
  const [searchParams, setSearchParams] = useSearchParams();
  const [recipes, setRecipes] = useState<RecipeRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Signed URLs of the main photos, by path; filled after the list itself is shown.
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());
  // Any failed load (connection or other) stops the loading state; the banner or message takes over.
  const [errored, setErrored] = useState(false);
  // Filters panel: local state, never in the URL. The panel stays mounted when closed, so nothing reloads.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Goes up on "Alles wissen"; the ingredient search empties its fields and drops a pending pause.
  const [resetCount, setResetCount] = useState(0);

  const active = useRef(true);
  // Numbers the requests: a slow answer for an earlier filter must not overwrite the current list.
  const requestId = useRef(0);
  // The search the current list belongs to.
  const shownSearch = useRef(searchToSearchParams(parseSearch(searchParams)).toString());

  // Rebuilt from the URL text only, so the filter object is stable between renders.
  const query = searchParams.toString();
  const filter = useMemo(() => parseTimeFilter(new URLSearchParams(query)), [query]);
  const equipmentNames = useMemo(() => parseEquipmentFilter(new URLSearchParams(query)), [query]);
  const tagFilter = useMemo(() => parseTagFilter(new URLSearchParams(query)), [query]);
  const sort = useMemo(() => parseSort(new URLSearchParams(query)), [query]);
  const search = useMemo(() => parseSearch(new URLSearchParams(query)), [query]);

  // The database stores canonical (Dutch) names. A name in the URL that belongs to a catalogue item by its
  // French name (typed by hand) is queried by the canonical name. Keyed by the resulting text, so a URL that is
  // already canonical does not reload when the catalogue arrives.
  const { canonical } = names;
  const queryKey = JSON.stringify([
    equipmentNames.map((n) => canonical('equipment', n)),
    { dish: tagFilter.dish.map((n) => canonical('dish', n)), trait: tagFilter.trait.map((n) => canonical('trait', n)) },
  ]);
  const [queryEquipment, queryTags] = useMemo(
    () => JSON.parse(queryKey) as [string[], TagFilterValue],
    [queryKey],
  );

  // Fetched on every mount, no client cache: other users' recipes must show after a reload.
  const load = useCallback(async () => {
    const mine = ++requestId.current;
    // Rows of another search (other order, no or other "k van n") must not stay on screen while the new answer
    // is on its way. Other filters keep the old list, as before.
    const searchKey = searchToSearchParams(search).toString();
    if (shownSearch.current !== searchKey) {
      shownSearch.current = searchKey;
      setRecipes(null);
    }
    // No ordering here: the list is sorted in the client (sortRecipes), search matches first.
    let ordered;
    if (hasSearch(search)) {
      // "All" (k >= n) goes as null, so the database picks k = n itself and a client/database difference in
      // de-duplicating rare characters cannot fail the plain case.
      const n = search.with.length;
      const pMin = search.min === null || search.min >= n ? null : search.min;
      ordered = supabase.rpc('search_recipes', { p_terms: search.with, p_without: search.without, p_min: pMin });
    } else {
      ordered = supabase
        .from('recipes')
        .select(
          'id,title,created_at,prep_minutes,total_minutes,equipment,photos,rating_avg,rating_count,family_id,is_favorite,author:profiles!recipes_author_profile_fkey(display_name)',
        );
    }
    // The favourites restriction combines with "and" with every other filter.
    const scoped = favoritesOnly ? applyFavoritesOnly(ordered) : ordered;
    const { data, error, status } = await applyTagFilter(
      applyEquipmentFilter(applyTimeFilter(scoped, filter), queryEquipment),
      queryTags,
    );
    // A late answer after leaving the page, or for an older filter, must not report, resolve or set state.
    if (!active.current || mine !== requestId.current) return;
    if (error) {
      setErrored(true);
      // Connection errors get the banner; other errors show their own message.
      setFailed(!report(KEY, error, status, () => void load()));
      return;
    }
    resolve(KEY);
    setFailed(false);
    setErrored(false);
    const rows = (data as unknown as RawRow[]).map(toRow);
    setRecipes(rows);
    // One call for all main photos; the list is already visible, the pictures follow.
    const paths = rows.flatMap((r) => (mainPhoto(r.photos) ? [mainPhoto(r.photos) as string] : []));
    const urls = await signedUrls(paths);
    if (!active.current || mine !== requestId.current) return;
    setPhotoUrls(urls);
  }, [filter, queryEquipment, queryTags, search, favoritesOnly, KEY, report, resolve]);

  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
      resolve(KEY);
    };
  }, [load, resolve, KEY]);

  // replace: a filter change is a refinement of this page, not a step the back button should undo one by one.
  // The latest params live in a ref that handlers update at once: two quick changes (equipment, then time)
  // would otherwise both build on the same stale render and the second would undo the first.
  const latestParams = useRef(searchParams);
  latestParams.current = searchParams;
  const commit = (next: URLSearchParams) => {
    latestParams.current = next;
    setSearchParams(next, { replace: true });
  };
  const changeFilter = (next: TimeFilterValue) => commit(toSearchParams(next, latestParams.current));
  const changeSearch = (next: IngredientSearchValue) => commit(searchToSearchParams(next, latestParams.current));
  const changeSort = (next: RecipeSort) => commit(sortToSearchParams(next, latestParams.current));
  const clearAll = () => {
    setResetCount((n) => n + 1);
    commit(clearFilters(latestParams.current));
  };
  const changeEquipment = (next: string[]) => commit(equipmentToSearchParams(next, latestParams.current));
  // Read from the ref, not from the render: a quick second tap must build on the first.
  const toggleTagIn = (kind: TagKind, name: string) => {
    const latest = parseTagFilter(latestParams.current);
    const same = latest[kind].find((n) => tagKey(canonical(kind, n)) === tagKey(canonical(kind, name)));
    const next: TagFilterValue = { ...latest, [kind]: toggleTag(latest[kind], same ?? name) };
    commit(tagsToSearchParams(next, latestParams.current));
  };

  // Sorted again on a language change: the title order depends on the language.
  const sorted = useMemo(
    () => (recipes ? sortRecipes(recipes, sort, locale()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipes, sort, language],
  );
  const filterCount = activeFilterCount(searchParams);

  return (
    <main className="page">
      <h1>{title}</h1>
      <div className="overview-toolbar">
        <button
          type="button"
          className="button-quiet filters-toggle"
          aria-expanded={filtersOpen}
          aria-controls="overview-filters"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          {filterCount > 0 ? format('overview.filtersCount', { n: filterCount }) : t('overview.filters')}
        </button>
        <SortControl value={sort} onChange={changeSort} />
      </div>
      <div id="overview-filters" className="overview-filters" hidden={!filtersOpen}>
        <IngredientSearch value={search} onChange={changeSearch} resetCount={resetCount} />
        <TimeFilter value={filter} onChange={changeFilter} />
        <TagFilter kind="dish" label={t('tags.dish')} value={tagFilter.dish} onToggle={(name) => toggleTagIn('dish', name)} />
        <TagFilter kind="trait" label={t('tags.trait')} value={tagFilter.trait} onToggle={(name) => toggleTagIn('trait', name)} />
        <EquipmentFilter value={equipmentNames} onChange={changeEquipment} />
        {filterCount > 0 && (
          <button type="button" className="button-quiet" onClick={clearAll}>
            {t('overview.clearAll')}
          </button>
        )}
      </div>
      {failed && <p>{t('overview.error')}</p>}
      {/* Loading only while nothing is known yet and no error is shown. */}
      {!errored && (
        <ListState
          items={sorted}
          loadingText={loadingText}
          emptyText={hasTimeFilter(filter) || hasEquipmentFilter(equipmentNames) || hasTagFilter(tagFilter) || hasSearch(search) ? t('overview.noMatch') : emptyText}
        >
          <ul className="recipe-list">
            {sorted?.map((r) => {
              const main = mainPhoto(r.photos);
              const src = main ? photoUrls.get(main) : undefined;
              return (
                <li key={r.id} className="recipe-card">
                  {/* The heart sits next to the link, not inside it: a button in an anchor is invalid. */}
                  <FavoriteButton recipeId={r.id} initial={r.is_favorite === true} />
                  {/* The whole item is the tap target for opening. */}
                  <Link to={`/recept/${r.id}`} className="recipe-link">
                    {/* Fixed frame, so the list does not jump when the pictures arrive. alt is empty: the title is right below. */}
                    <span className="recipe-photo">
                      {!src && <RecipePhotoPlaceholder />}
                      {src && <img src={src} alt="" loading="lazy" data-testid="recipe-main-photo" />}
                    </span>
                    <span className="recipe-title">{r.title}</span>
                    {/* Text only, no tap target: the whole item is the link. */}
                    {isVariant(r) && (
                      <span className="variant-label" data-testid="variant-label">
                        {t('variant.label')}
                      </span>
                    )}
                    <AuthorLine name={r.authorName} date={r.created_at} />
                    {r.termCount !== undefined && r.termCount > 0 && r.matchCount !== undefined && (
                      <span className="recipe-matches" data-testid="recipe-matches">
                        {t('search.matches').replace('{count}', String(r.matchCount)).replace('{total}', String(r.termCount))}
                      </span>
                    )}
                    {r.rating_avg !== null && r.rating_count > 0 && (
                      <span className="recipe-rating" data-testid="recipe-rating">
                        {t('reviews.summary')
                          .replace('{avg}', formatRating(Number(r.rating_avg)))
                          .replace('{count}', reviewCountText(r.rating_count))}
                      </span>
                    )}
                    {r.prep_minutes !== null && r.total_minutes !== null && (
                      <span className="recipe-times">
                        {t('time.prep')} {formatDuration(r.prep_minutes)} · {t('time.total')} {formatDuration(r.total_minutes)}
                      </span>
                    )}
                    {r.equipment && r.equipment.length > 0 && (
                      <ul className="equipment-tags" data-testid="recipe-equipment">
                        {r.equipment.map((name) => (
                          <li key={name}>{storedName('equipment', name)}</li>
                        ))}
                      </ul>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </ListState>
      )}
    </main>
  );
}
