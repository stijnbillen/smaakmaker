import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthorLine } from '../components/AuthorLine';
import { useConnection } from '../components/ConnectionProvider';
import { ListState } from '../components/ListState';
import { t } from '../i18n/t';
import { supabase } from '../lib/supabase';

interface RecipeRow {
  id: string;
  title: string;
  created_at: string;
  author: { display_name: string | null } | null;
}

const KEY = 'recipe-list';

export function RecipeListPage() {
  const { report, resolve } = useConnection();
  const [recipes, setRecipes] = useState<RecipeRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Any failed load (connection or other) stops the loading state; the banner or message takes over.
  const [errored, setErrored] = useState(false);

  const active = useRef(true);

  // Fetched on every mount, no client cache: other users' recipes must show after a reload.
  const load = useCallback(async () => {
    const { data, error, status } = await supabase
      .from('recipes')
      .select('id,title,created_at,author:profiles(display_name)')
      .order('created_at', { ascending: false });
    // A late answer after leaving the page must not report, resolve or set state.
    if (!active.current) return;
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
  }, [report, resolve]);

  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
      resolve(KEY);
    };
  }, [load, resolve]);

  return (
    <main className="page">
      <h1>{t('overview.title')}</h1>
      {failed && <p>{t('overview.error')}</p>}
      {/* Loading only while nothing is known yet and no error is shown. */}
      {!errored && (
        <ListState items={recipes} loadingText={t('overview.loading')} emptyText={t('overview.empty')}>
          <ul className="recipe-list">
            {recipes?.map((r) => (
              <li key={r.id}>
                {/* The whole item is the tap target. Room for the times (R-007) comes later. */}
                <Link to={`/recept/${r.id}`} className="recipe-link">
                  <span className="recipe-title">{r.title}</span>
                  <AuthorLine name={r.author?.display_name ?? null} date={r.created_at} />
                </Link>
              </li>
            ))}
          </ul>
        </ListState>
      )}
    </main>
  );
}
