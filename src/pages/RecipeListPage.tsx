import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConnection } from '../components/ConnectionProvider';
import { t } from '../i18n/t';
import { supabase } from '../lib/supabase';

interface RecipeRow {
  id: string;
  title: string;
}

const KEY = 'recipe-list';

export function RecipeListPage() {
  const { report, resolve } = useConnection();
  const [recipes, setRecipes] = useState<RecipeRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const active = useRef(true);

  // Fetched on every mount, no client cache: other users' recipes must show after a reload.
  const load = useCallback(async () => {
    const { data, error, status } = await supabase
      .from('recipes')
      .select('id,title')
      .order('created_at', { ascending: false });
    // A late answer after leaving the page must not report, resolve or set state.
    if (!active.current) return;
    if (error) {
      // Connection errors get the banner; other errors show their own message.
      setFailed(!report(KEY, error, status, () => void load()));
      return;
    }
    resolve(KEY);
    setFailed(false);
    setRecipes(data);
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
      <Link to="/nieuw" className="button-link">
        {t('overview.new')}
      </Link>
      {failed && <p>{t('overview.error')}</p>}
      {recipes && recipes.length === 0 && <p>{t('overview.empty')}</p>}
      {recipes && (
        <ul className="recipe-list">
          {recipes.map((r) => (
            <li key={r.id}>{r.title}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
