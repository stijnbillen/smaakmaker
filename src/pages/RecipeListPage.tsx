import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthorLine } from '../components/AuthorLine';
import { useConnection } from '../components/ConnectionProvider';
import { EquipmentFilter } from '../components/EquipmentFilter';
import { ListState } from '../components/ListState';
import { TagFilter } from '../components/TagFilter';
import { TimeFilter } from '../components/TimeFilter';
import { t } from '../i18n/t';
import {
  applyEquipmentFilter,
  hasEquipmentFilter,
  parseEquipmentFilter,
  toSearchParams as equipmentToSearchParams,
} from '../lib/equipmentFilter';
import { formatDuration } from '../lib/format';
import {
  formatRating,
  parseSort,
  reviewCountText,
  toSearchParams as sortToSearchParams,
  type ReviewSort,
} from '../lib/reviews';
import { supabase } from '../lib/supabase';
import { tagKey, toggleTag, type TagKind } from '../lib/tags';
import {
  applyTagFilter,
  hasTagFilter,
  parseTagFilter,
  toSearchParams as tagsToSearchParams,
  type TagFilter as TagFilterValue,
} from '../lib/tagFilter';
import { applyTimeFilter, hasTimeFilter, parseTimeFilter, toSearchParams, type TimeFilter as TimeFilterValue } from '../lib/timeFilter';

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
  author: { display_name: string | null } | null;
}

const KEY = 'recipe-list';

export function RecipeListPage() {
  const { report, resolve } = useConnection();
  const [searchParams, setSearchParams] = useSearchParams();
  const [recipes, setRecipes] = useState<RecipeRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Any failed load (connection or other) stops the loading state; the banner or message takes over.
  const [errored, setErrored] = useState(false);

  const active = useRef(true);
  // Numbers the requests: a slow answer for an earlier filter must not overwrite the current list.
  const requestId = useRef(0);

  // Rebuilt from the URL text only, so the filter object is stable between renders.
  const query = searchParams.toString();
  const filter = useMemo(() => parseTimeFilter(new URLSearchParams(query)), [query]);
  const equipmentNames = useMemo(() => parseEquipmentFilter(new URLSearchParams(query)), [query]);
  const tagFilter = useMemo(() => parseTagFilter(new URLSearchParams(query)), [query]);
  const sort = useMemo(() => parseSort(new URLSearchParams(query)), [query]);

  // Fetched on every mount, no client cache: other users' recipes must show after a reload.
  const load = useCallback(async () => {
    const mine = ++requestId.current;
    const base = supabase
      .from('recipes')
      .select('id,title,created_at,prep_minutes,total_minutes,equipment,rating_avg,rating_count,author:profiles(display_name)');
    // Rating sort: best average first, more reviews first on a tie, newest last; no reviews at the bottom.
    const ordered =
      sort === 'rating'
        ? base
            .order('rating_avg', { ascending: false, nullsFirst: false })
            .order('rating_count', { ascending: false })
            .order('created_at', { ascending: false })
        : base.order('created_at', { ascending: false });
    const { data, error, status } = await applyTagFilter(
      applyEquipmentFilter(applyTimeFilter(ordered, filter), equipmentNames),
      tagFilter,
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
    setRecipes(data as unknown as RecipeRow[]);
  }, [filter, equipmentNames, tagFilter, sort, report, resolve]);

  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
      resolve(KEY);
    };
  }, [load, resolve]);

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
  const changeSort = (next: ReviewSort) => commit(sortToSearchParams(next, latestParams.current));
  const changeEquipment = (next: string[]) => commit(equipmentToSearchParams(next, latestParams.current));
  // Read from the ref, not from the render: a quick second tap must build on the first.
  const toggleTagIn = (kind: TagKind, name: string) => {
    const latest = parseTagFilter(latestParams.current);
    const same = latest[kind].find((n) => tagKey(n) === tagKey(name));
    const next: TagFilterValue = { ...latest, [kind]: toggleTag(latest[kind], same ?? name) };
    commit(tagsToSearchParams(next, latestParams.current));
  };

  return (
    <main className="page">
      <h1>{t('overview.title')}</h1>
      <TimeFilter value={filter} onChange={changeFilter} />
      <TagFilter kind="dish" label={t('tags.dish')} value={tagFilter.dish} onToggle={(name) => toggleTagIn('dish', name)} />
      <TagFilter kind="trait" label={t('tags.trait')} value={tagFilter.trait} onToggle={(name) => toggleTagIn('trait', name)} />
      <EquipmentFilter value={equipmentNames} onChange={changeEquipment} />
      <div className="field sort-field">
        <label htmlFor="recipe-sort">{t('overview.sort')}</label>
        <select id="recipe-sort" value={sort} onChange={(e) => changeSort(e.target.value === 'rating' ? 'rating' : 'newest')}>
          <option value="newest">{t('overview.sortNewest')}</option>
          <option value="rating">{t('overview.sortRating')}</option>
        </select>
      </div>
      {failed && <p>{t('overview.error')}</p>}
      {/* Loading only while nothing is known yet and no error is shown. */}
      {!errored && (
        <ListState
          items={recipes}
          loadingText={t('overview.loading')}
          emptyText={hasTimeFilter(filter) || hasEquipmentFilter(equipmentNames) || hasTagFilter(tagFilter) ? t('overview.noMatch') : t('overview.empty')}
        >
          <ul className="recipe-list">
            {recipes?.map((r) => (
              <li key={r.id}>
                {/* The whole item is the tap target. */}
                <Link to={`/recept/${r.id}`} className="recipe-link">
                  <span className="recipe-title">{r.title}</span>
                  <AuthorLine name={r.author?.display_name ?? null} date={r.created_at} />
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
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </ListState>
      )}
    </main>
  );
}
