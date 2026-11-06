import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { useConnection } from '../components/ConnectionProvider';
import { RecipeForm } from '../components/RecipeForm';
import { t, useLanguage } from '../i18n/t';
import { canEdit } from '../lib/permissions';
import { fetchPhotoSizes } from '../lib/photos';
import { draftFromRecord } from '../lib/recipe';
import { newSaveSession, updateRecipe } from '../lib/recipes';
import { useRecipe } from '../lib/useRecipe';

export function EditRecipePage() {
  useLanguage();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const state = useRecipe(id, 'recipe-edit');
  const recipe = state.status === 'ready' ? state.recipe : null;
  const { report, resolve } = useConnection();
  // Stored file sizes for the size counter; null until known. The form works without them.
  const [photoSizes, setPhotoSizes] = useState<Map<string, number> | null>(null);
  const hasPhotos = (recipe?.photos.length ?? 0) > 0;
  useEffect(() => {
    if (!recipe) return;
    if (!hasPhotos) {
      setPhotoSizes(new Map());
      return;
    }
    let active = true;
    const load = async () => {
      const res = await fetchPhotoSizes(id);
      if (!active) return;
      if (res.error) {
        // Connection trouble gets the banner and a retry; the form stays usable meanwhile.
        report('recipe-photo-sizes', res.error, res.status, () => void load());
        return;
      }
      resolve('recipe-photo-sizes');
      setPhotoSizes(res.sizes);
    };
    void load();
    return () => {
      active = false;
      resolve('recipe-photo-sizes');
    };
    // Once per loaded recipe; the photo list of the form itself may change without a new lookup.
  }, [id, recipe, hasPhotos, report, resolve]);
  const initial = useMemo(() => (recipe ? draftFromRecord(recipe) : null), [recipe]);
  // Uploaded files survive a failed attempt, so "try again" does not upload them twice.
  const saveSession = useRef(newSaveSession(id));

  if (state.status === 'loading') {
    return (
      <main className="page">
        <p role="status" className="list-state list-state--loading">
          <span className="spinner" aria-hidden="true" />
          {t('recipe.loading')}
        </p>
      </main>
    );
  }
  if (!recipe || !initial) {
    return (
      <main className="page">
        <p>{state.status === 'notFound' ? t('recipe.notFound') : t('recipe.loadFailed')}</p>
        <Link to="/" className="button-link button-link--quiet">
          {t('recipe.backToList')}
        </Link>
      </main>
    );
  }
  // Convenience only: the database refuses the update to anyone but the author anyway.
  if (!canEdit({ authorId: recipe.authorId }, { userId: session?.user.id ?? null })) {
    return <Navigate to={`/recept/${id}`} replace />;
  }
  return (
    <RecipeForm
      heading={t('form.editTitle')}
      initial={initial}
      submit={(draft) =>
        updateRecipe(
          id,
          draft,
          saveSession.current,
          recipe.photos.map((p) => p.path),
        )
      }
      onSaved={() => navigate(`/recept/${id}`)}
      backTo={`/recept/${id}`}
      photoSizes={photoSizes}
    />
  );
}
