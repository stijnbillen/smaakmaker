import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useConnection } from '../components/ConnectionProvider';
import { RecipeForm } from '../components/RecipeForm';
import { t } from '../i18n/t';
import { fetchPhotoSizes } from '../lib/photos';
import { createRecipe, newSaveSession } from '../lib/recipes';
import { useRecipe } from '../lib/useRecipe';
import { variantDraft } from '../lib/variant';

const SIZES_KEY = 'variant-photo-sizes';

/** The variant form: a copy of the source, saved (and its photos copied) only at "Opslaan". */
export function NewVariantPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { report, resolve } = useConnection();
  const state = useRecipe(id, 'variant-source');
  const recipe = state.status === 'ready' ? state.recipe : null;
  // Stored file sizes of the source, so the counter counts the photos that will be copied.
  const [sizes, setSizes] = useState<Map<string, number> | null>(null);
  const hasPhotos = (recipe?.photos.length ?? 0) > 0;
  useEffect(() => {
    if (!recipe) return;
    if (!hasPhotos) {
      setSizes(new Map());
      return;
    }
    let active = true;
    const load = async () => {
      const res = await fetchPhotoSizes(id);
      if (!active) return;
      if (res.error) {
        // Connection trouble: the banner with a retry; the form is not shown before the sizes are known.
        report(SIZES_KEY, res.error, res.status, () => void load());
        return;
      }
      resolve(SIZES_KEY);
      setSizes(res.sizes);
    };
    void load();
    return () => {
      active = false;
      resolve(SIZES_KEY);
    };
  }, [id, recipe, hasPhotos, report, resolve]);

  // Built once the source and the sizes are known; the form keeps the copy of that moment.
  const initial = useMemo(() => (recipe && sizes ? variantDraft(recipe, sizes) : null), [recipe, sizes]);
  // One new recipe id and one set of copied files per form, so "try again" does not copy twice.
  const saveSession = useRef(newSaveSession());

  if (state.status === 'notFound' || state.status === 'error') {
    return (
      <main className="page">
        <p>{state.status === 'notFound' ? t('recipe.notFound') : t('recipe.loadFailed')}</p>
        <Link to="/" className="button-link button-link--quiet">
          {t('recipe.backToList')}
        </Link>
      </main>
    );
  }
  if (!initial) {
    return (
      <main className="page">
        <p role="status" className="list-state list-state--loading">
          <span className="spinner" aria-hidden="true" />
          {t('recipe.loading')}
        </p>
      </main>
    );
  }
  return (
    <RecipeForm
      heading={t('variant.formTitle')}
      initial={initial}
      submit={(draft) => createRecipe(draft, saveSession.current, id)}
      // replace: the back button must not return to a form that was saved.
      onSaved={(newId) => navigate(`/recept/${newId}`, { replace: true })}
      backTo={`/recept/${id}`}
      photoSizes={sizes}
    />
  );
}
