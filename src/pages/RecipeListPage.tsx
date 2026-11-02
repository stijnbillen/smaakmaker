import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthorLine } from '../components/AuthorLine';
import { useConnection } from '../components/ConnectionProvider';
import { ListState } from '../components/ListState';
import { TimeFilter } from '../components/TimeFilter';
import { t } from '../i18n/t';
import { formatDuration } from '../lib/format';
import { supabase } from '../lib/supabase';
import { applyTimeFilter, hasTimeFilter, parseTimeFilter, toSearchParams, type TimeFilter as TimeFilterValue } from '../lib/timeFilter';

interface RecipeRow {
  id: string;
  title: string;
  created_at: string;
  /** Null for old sample rows saved before the times existed. */
  prep_minutes: number | null;
  total_minutes: number | null;
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

  // Fetched on every mount, no client cache: other users' recipes must show after a reload.
  const load = useCallback(async () => {
    const mine = ++requestId.current;
    const { data, error, status } = await applyTimeFilter(
      supabase
        .from('recipes')
        .select('id,title,created_at,prep_minutes,total_minutes,author:profiles(display_name)')
        .order('created_at', { ascending: false }),
      filter,
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
  }, [filter, report, resolve]);

  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
      resolve(KEY);
    };
  }, [load, resolve]);

  // replace: a filter change is a refinement of this page, not a step the back button should undo one by one.
  const changeFilter = (next: TimeFilterValue) => setSearchParams(toSearchParams(next, searchParams), { replace: true });

  return (
    <main className="page">
      <h1>{t('overview.title')}</h1>
      <TimeFilter value={filter} onChange={changeFilter} />
      {failed && <p>{t('overview.error')}</p>}
      {/* Loading only while nothing is known yet and no error is shown. */}
      {!errored && (
        <ListState
          items={recipes}
          loadingText={t('overview.loading')}
          emptyText={hasTimeFilter(filter) ? t('overview.noMatch') : t('overview.empty')}
        >
          <ul className="recipe-list">
            {recipes?.map((r) => (
              <li key={r.id}>
                {/* The whole item is the tap target. */}
                <Link to={`/recept/${r.id}`} className="recipe-link">
                  <span className="recipe-title">{r.title}</span>
                  <AuthorLine name={r.author?.display_name ?? null} date={r.created_at} />
                  {r.prep_minutes !== null && r.total_minutes !== null && (
                    <span className="recipe-times">
                      {t('time.prep')} {formatDuration(r.prep_minutes)} · {t('time.total')} {formatDuration(r.total_minutes)}
                    </span>
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
