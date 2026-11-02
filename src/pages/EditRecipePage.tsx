import { useMemo, useRef } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { RecipeForm } from '../components/RecipeForm';
import { t } from '../i18n/t';
import { canEdit } from '../lib/permissions';
import { draftFromRecord } from '../lib/recipe';
import { newSaveSession, updateRecipe } from '../lib/recipes';
import { useRecipe } from '../lib/useRecipe';

export function EditRecipePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const state = useRecipe(id, 'recipe-edit');
  const recipe = state.status === 'ready' ? state.recipe : null;
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
    />
  );
}
