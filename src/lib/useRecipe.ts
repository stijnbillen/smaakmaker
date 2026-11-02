import { useEffect, useState } from 'react';
import { useConnection } from '../components/ConnectionProvider';
import type { RecipeRecord } from './recipe';
import { fetchRecipe } from './recipes';

export type RecipeState =
  | { status: 'loading' }
  | { status: 'ready'; recipe: RecipeRecord }
  | { status: 'notFound' }
  | { status: 'error' };

/** Loads one recipe on every mount (no client cache: it may have been edited or deleted elsewhere). */
export function useRecipe(id: string, key: string): RecipeState {
  const { report, resolve } = useConnection();
  const [state, setState] = useState<RecipeState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await fetchRecipe(id);
      // A late answer after leaving the page must not report, resolve or set state.
      if (!active) return;
      if (res.error) {
        // Connection errors get the banner and keep the loading state; its retry button runs this again.
        const isConnection = report(key, res.error, res.status, () => void load());
        setState(isConnection ? { status: 'loading' } : { status: 'error' });
        return;
      }
      resolve(key);
      setState(res.recipe ? { status: 'ready', recipe: res.recipe } : { status: 'notFound' });
    };
    setState({ status: 'loading' });
    void load();
    return () => {
      active = false;
      resolve(key);
    };
  }, [id, key, report, resolve]);

  return state;
}
